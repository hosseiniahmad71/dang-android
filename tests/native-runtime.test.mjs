import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createNativeRuntime} from '../src/native-runtime.mjs';
import {project} from '../src/native-ledger.mjs';
import {validateStore} from '../src/native-validate.mjs';

const base=()=>({
 version:3,providers:['سایر'],backupPolicy:'change',googleClientId:'',
 archivedMembers:[],archivedAccounts:[],archivedCategories:[],archivedProviders:[],
 members:[{id:'a',name:'احمد',contributes:true},{id:'b',name:'مریم',contributes:true}],
 accounts:[{id:'fund',name:'صندوق',kind:'fund'},{id:'a-card',name:'کارت احمد',kind:'personal',ownerId:'a'},{id:'b-card',name:'کارت مریم',kind:'personal',ownerId:'b'}],
 categories:['خانه'],plans:[],events:[],closedPeriods:[],openingBalance:10_000_000,defaultContribution:10_000_000,contributionOverrides:{},startPeriod:'1405/07'
});
function emulator(){
 let state=null,rev=0;const backups=[];
 const invoke=({op,...x})=>{
  try{
   let value;
   if(op==='get')value=state===null?null:{revision:rev,store:structuredClone(state)};
   else if(op==='init'){state??=structuredClone(x.store);value={revision:rev,store:structuredClone(state)}}
   else if(op==='commit'){
    if(rev!==x.expectedRevision)throw Error('revision mismatch');
    state=structuredClone(x.store);rev++;
    if(state.backupPolicy==='change')backups.push({id:String(backups.length+1),createdAt:new Date().toISOString(),reason:'change',revision:rev,store:structuredClone(state)});
    value={revision:rev,store:structuredClone(state)};
   }else if(op==='backup'){
    const snap={id:String(backups.length+1),createdAt:new Date().toISOString(),reason:x.reason,revision:rev,store:structuredClone(state)};
    backups.push(snap);value=snap;
   }else if(op==='list')value=backups.map(({store,...rest})=>rest);
   else if(op==='read'){
    const snap=backups.find(z=>z.id===x.id);if(!snap)throw Error('missing backup');value={store:structuredClone(snap.store)};
   }else throw Error('unsupported op');
   return {ok:true,value};
  }catch(error){return {ok:false,error:String(error)}};
 };
 return createNativeRuntime(invoke,base());
}
const event=(kind,date,amount,more)=>({id:randomUUID(),kind,date,amount,description:'آزمون نمونه',...more});
const deposit=(date='2026-10-01',amount=5_000_000)=>event('deposit',date,amount,{memberId:'a',accountId:'a-card',period:'1405/07'});
const purchase=(date='2026-10-04',amount=1_000_000)=>event('purchase',date,amount,{accountId:'fund',paidById:'',category:'خانه',creditPeriod:'1405/07'});

test('native SQLite adapter initializes and persists ledger atomically with positive cash',async()=>{
 const runtime=emulator();const start=await runtime.request('/api/store');assert.equal(start.revision,0);
 const x={...start.store,events:[deposit(),purchase()]};const saved=await runtime.request('/api/store','PUT',{store:x,expectedRevision:0});
 assert.equal(saved.revision,1);assert.equal(project(saved.store).fund,14_000_000);
 const reloaded=await runtime.request('/api/store');assert.deepEqual(reloaded.store.events,x.events);
 assert.equal((await runtime.request('/api/backups')).items.length,1);
});

test('native adapter rejects negative historical fund even if ending cash positive',async()=>{
 const r=emulator(),s=(await r.request('/api/store')).store;
 const bad={...s,openingBalance:0,events:[deposit('2026-10-15',5_000_000),purchase('2026-10-02',5_000_000)]};
 await assert.rejects(r.request('/api/store','PUT',{store:bad,expectedRevision:0}),/منفی/);
});

test('native adapter blocks forged personal credit and invalid custody ownership',async()=>{
 const r=emulator(),s=(await r.request('/api/store')).store;
 const p=event('purchase','2026-10-05',2_000_000,{accountId:'b-card',paidById:'a',category:'خانه',creditPeriod:'1405/07',fundedBy:'personal'});
 await assert.rejects(r.request('/api/store','PUT',{store:{...s,events:[p]},expectedRevision:0}),/اعتبار|مالک/);
});

test('native adapter prevents silent mutation and uses audit reversal',async()=>{
 const r=emulator(),s=(await r.request('/api/store')).store;
 const p=purchase();await r.request('/api/store','PUT',{store:{...s,events:[p]},expectedRevision:0});
 let fresh=await r.request('/api/store');
 await assert.rejects(r.request('/api/store','PUT',{store:{...fresh.store,events:[{...p,amount:999}]},expectedRevision:1}),/تغییر رویداد/);
 const result=await r.request('/api/reverse','POST',{id:p.id,reason:'تصحیح مبلغ خرید',expectedRevision:1,replacement:{...p,id:randomUUID(),amount:600_000}});
 assert.equal(result.store.events.length,3);assert.equal(project(result.store).fund,9_400_000);
});

test('native adapter handles lock, unlock and audited obligation adjustment',async()=>{
 const r=emulator();await r.request('/api/store');
 const lock=await r.request('/api/period-lock','POST',{period:'1405/07',locked:true,reason:'بستن ماه هفتم',expectedRevision:0});
 assert.deepEqual(lock.store.closedPeriods,['1405/07']);
 const e=deposit();
 await assert.rejects(r.request('/api/store','PUT',{store:{...lock.store,events:[e]},expectedRevision:1}),/قفل/);
 await r.request('/api/period-lock','POST',{period:'1405/07',locked:false,reason:'بازگشایی ماه هفتم',expectedRevision:1});
 const adj=await r.request('/api/obligation-adjust','POST',{memberId:'a',period:'1405/07',newAmount:8_000_000,reason:'تعدیل سهم احمد',expectedRevision:2});
 assert.equal(adj.store.events.at(-1).amount,2_000_000);
 assert.equal(adj.store.events.at(-1).direction,'decrease');
});

test('native adapter backup creation, listing, restore and revision CAS',async()=>{
 const r=emulator(),s=(await r.request('/api/store')).store;
 const backup=await r.request('/api/backups','POST',{reason:'manual'});
 assert.equal((await r.request(`/api/backups/${backup.id}/store`)).store.events.length,0);
 await r.request('/api/store','PUT',{store:{...s,events:[deposit()]},expectedRevision:0});
 await assert.rejects(r.request('/api/store','PUT',{store:s,expectedRevision:0}),/قدیمی/);
 const restored=await r.request('/api/restore','POST',{store:s,expectedRevision:1});
 assert.equal(restored.store.events.length,0);
 assert.equal((await r.request('/api/backups')).items.length,5);
});

test('native adapter standalone validates all financial shapes on initial and saved states',()=>{
 const s=base();assert.equal(validateStore(s).version,3);assert.equal(project(s).fund,10_000_000);
 const p=event('purchase','2026-10-05',11_000_000,{accountId:'fund',category:'خانه',creditPeriod:'1405/07',paidById:''});
 assert.throws(()=>project({...s,events:[p]}),/منفی/);
});

test('12-month offline accounting: contributions, custody, credit carry, waiver, installment and fund reconcile',async()=>{
 const {monthStart}=await import('../src/native-ledger.mjs');
 const r=emulator();let {store,revision}=await r.request('/api/store');
 const months=[];for(let i=0;i<12;i++)months.push(`${1405+Math.floor((6+i)/12)}/${String((6+i)%12+1).padStart(2,'0')}`);
 const dueDates=months.map(monthStart);
 store={...store,plans:[{id:'plan-1',title:'یخچال',provider:'سایر',creditOwnerId:'a',category:'خانه',createdDate:dueDates[0],total:6_000_000,installments:dueDates.map((dueDate,i)=>({id:`inst-${i}`,dueDate,amount:500_000}))}]};
 ({store,revision}=await r.request('/api/store','PUT',{store,expectedRevision:revision}));
 let independentlyCalculated=10_000_000;
 for(let i=0;i<12;i++){
  const date=dueDates[i],period=months[i],next=months[Math.min(11,i+1)];
  const events=[];
  events.push(event('deposit',date,10_000_000,{memberId:'a',accountId:'a-card',period}));independentlyCalculated+=10_000_000;
  events.push(event('deposit',date,i%3===0?9_000_000:10_000_000,{memberId:'b',accountId:'b-card',period}));independentlyCalculated+=i%3===0?9_000_000:10_000_000;
  events.push(event('purchase',date,10_000_000,{accountId:'fund',paidById:'',category:'خانه',creditPeriod:period}));independentlyCalculated-=10_000_000;
  events.push(event('transfer',date,2_000_000,{accountId:'fund',destinationId:'b-card'}));independentlyCalculated-=2_000_000;
  events.push(event('purchase',date,2_000_000,{accountId:'b-card',paidById:'',fundedBy:'fund',category:'خانه',creditPeriod:period}));
  events.push(event('purchase',date,1_000_000,{accountId:'a-card',paidById:'a',fundedBy:'personal',category:'خانه',creditPeriod:period}));
  events.push(event('payment',date,500_000,{installmentId:`inst-${i}`,accountId:'fund',paidById:'',creditPeriod:period}));independentlyCalculated-=500_000;
  if(i%3===0)events.push(event('waiver',date,1_000_000,{memberId:'b',period}));
  if(i===0)events.push(event('creditMove',date,1_000_000,{memberId:'a',sourcePeriod:period,targetPeriod:next}));
  store={...store,events:[...store.events,...events]};
  ({store,revision}=await r.request('/api/store','PUT',{store,expectedRevision:revision}));
  assert.equal(project(store).fund,independentlyCalculated,`fund balance mismatch in ${period}`);
  assert.equal(project(store).custody['b-card']||0,0,`unsettled custody in ${period}`);
  assert.equal(store.events.filter(e=>e.kind==='payment').length,i+1);
 }
 assert.equal(project(store).fund,independentlyCalculated);
 assert.equal(store.events.filter(e=>e.kind==='waiver').length,4);
 assert.equal(store.events.filter(e=>e.kind==='creditMove').length,1);
 assert.equal(store.events.length,12*7+4+1);
 assert.equal((await r.request('/api/backups')).items.length,13);
});
