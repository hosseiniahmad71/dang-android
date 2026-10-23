import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProviderSchedule,providerRule} from '../src/installment-rules.mjs';
import {monthStart,persianMonth,project} from '../src/native-ledger.mjs';
import {validateStore} from '../src/native-validate.mjs';
import {validateTransition} from '../src/native-runtime.mjs';
import {validateDepositBatch} from '../src/deposit-policy.mjs';
import {randomUUID} from 'node:crypto';

const start='1405/07';
const offset=(period,delta)=>{const [y,m]=period.split('/').map(Number),k=y*12+m-1+delta;return `${Math.floor(k/12)}/${String(k%12+1).padStart(2,'0')}`};
const current='2026-10-17'; // Fixed dates for provider and validation unit tests.
const stressToday=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tehran'}).format(new Date());
const stressStart=persianMonth(stressToday)<start?start:persianMonth(stressToday);
// Stress fixtures start in the current month to keep 500-event historical-date validation accurate.
const base=()=>({version:3,providers:['تارا','دیجی‌پی','اسنپ‌پی','سایر'],backupPolicy:'change',googleClientId:'',
 archivedMembers:[],archivedAccounts:[],archivedCategories:[],archivedProviders:[],
 members:[{id:'a',name:'احمد',contributes:true},{id:'b',name:'مریم',contributes:true},{id:'c',name:'مهدی',contributes:true}],
 accounts:[{id:'fund',name:'صندوق',kind:'fund'},{id:'a-card',name:'کارت احمد',kind:'personal',ownerId:'a'},
 {id:'b-card',name:'کارت مریم',kind:'personal',ownerId:'b'},{id:'c-card',name:'کارت مهدی',kind:'personal',ownerId:'c'}],
 categories:['خوراک','خانه','سفر'],plans:[],events:[],closedPeriods:[],openingBalance:0,defaultContribution:10_000_000,
 contributionOverrides:{},startPeriod:start});
let idSeq=0;
const ev=(kind,date,amount,data={})=>({id:`test-${++idSeq}`,kind,date,amount,description:`شرح ساختگی ${kind} ${idSeq}`,...data});
const newDeposit=(memberId,period,date=current,accountId='b-card',amount=10_000_000,creditOnly=false)=>ev('deposit',date,amount,{memberId,period,accountId,destinationId:accountId,creditOnly});
const cashPurchase=(date,amount=100_000)=>ev('purchase',date,amount,{accountId:'fund',paidById:'',category:'خوراک',creditPeriod:persianMonth(date)});

test('Tara: 25 Mehr has exactly two later installments on 25 Aban and 25 Azar, without prepayment',()=>{
 const r=buildProviderSchedule({provider:'تارا',count:2,total:1_000_000,purchaseDate:'2026-10-17'});
 assert.deepEqual(r.map(i=>i.dueDate),['2026-11-16','2026-12-16']);
 assert.deepEqual(r.map(i=>i.amount),[500000,500000]);
 assert.deepEqual(r.map(i=>persianMonth(i.dueDate)),['1405/08','1405/09']);
});
test('Snappay/Digipay four: 10 Mehr immediately, 1 Aban, 1 Azar, 1 Dey; 1m splits exactly 250k',()=>{
 for(const provider of ['اسنپ‌پی','دیجی‌پی']){
  const r=buildProviderSchedule({provider,count:4,total:1_000_000,purchaseDate:'2026-10-02'});
  assert.deepEqual(r.map(x=>x.dueDate),['2026-10-02','2026-10-23','2026-11-22','2026-12-22']);
  assert.deepEqual(r.map(x=>x.amount),[250000,250000,250000,250000]);
 }
});
test('Snappay/Digipay single: 10 Mehr paid 1 Aban; uneven amounts always reconcile',()=>{
 for(const provider of ['دیجی‌پی','اسنپ‌پی']){
  const r=buildProviderSchedule({provider,count:1,total:1_000_001,purchaseDate:'2026-10-02'});
  assert.deepEqual(r.map(i=>i.dueDate),['2026-10-23']);assert.equal(r[0].amount,1_000_001);
  const four=buildProviderSchedule({provider,count:4,total:1_000_003,purchaseDate:'2026-10-02'});
  assert.equal(four.reduce((a,x)=>a+x.amount,0),1_000_003);
 }
});
test('Tara clamps the day in short Esfand and distinguishes custom providers',()=>{
 const r=buildProviderSchedule({provider:'تارا',count:2,total:200_000,purchaseDate:'2026-12-20'});
 assert.equal(r.length,2); assert.equal(r[0].amount+r[1].amount,200000);
 assert.equal(providerRule('سایر',4),'custom');
 assert.throws(()=>buildProviderSchedule({provider:'تارا',count:4,total:400000,purchaseDate:current}),/تارا/);
});
test('multi-person deposit into Maryam card adds family cash and individual credits, without false personal credit',()=>{
 const s=base();s.openingBalance=0;
 const batch=[newDeposit('a',start),newDeposit('b',start)];
 assert.equal(validateDepositBatch(s,batch,current),true);
 s.events=batch;
 let p=project(s);
 assert.equal(p.fund,0);assert.equal(p.custody['b-card'],20_000_000);assert.equal(p.totalCash,20_000_000);
 assert.equal(p.credits[`${start}|a`],10_000_000);assert.equal(p.credits[`${start}|b`],10_000_000);
 s.events.push(ev('purchase',current,2_000_000,{accountId:'b-card',fundedBy:'fund',paidById:'',category:'خانه',creditPeriod:start}));
 p=project(s);assert.equal(p.totalCash,18_000_000);assert.equal(p.custody['b-card'],18_000_000);
 assert.equal(p.credits[`${start}|a`],10_000_000);assert.equal(p.credits[`${start}|b`],10_000_000);
});
test('sequential payments reject duplicate, skipped month, month before last month and overpayment',()=>{
 let s=base();
 assert.throws(()=>validateDepositBatch(s,[newDeposit('a','1405/09')],current),/قبلی/);
 assert.throws(()=>validateDepositBatch(s,[newDeposit('a','1405/07',current,'b-card',11_000_000)],current),/بیشتر/);
 s.events.push(newDeposit('a','1405/07'));
 assert.throws(()=>validateDepositBatch(s,[newDeposit('a','1405/07')],current),/تسویه/);
 assert.throws(()=>validateDepositBatch(s,[newDeposit('a','1405/09')],current),/قبلی/);
 assert.equal(validateDepositBatch(s,[newDeposit('a','1405/08')],current),true);
 s.events.push(newDeposit('a','1405/08'));
 assert.equal(validateDepositBatch(s,[newDeposit('a','1405/09')],current),true);
});
test('backdated receipt explicitly warns/credits only the selected member without creating cash',()=>{
 let s=base();
 const invalid=newDeposit('a',start,'2026-10-16','b-card',10_000_000,false);
 assert.throws(()=>validateDepositBatch(s,[invalid],current),/تاریخ گذشته/);
 const historical={...invalid,id:'historical',creditOnly:true};
 assert.equal(validateDepositBatch(s,[historical],current),true);
 s.events.push(historical);
 const p=project(s);assert.equal(p.fund,0);assert.equal(p.totalCash,0);
 assert.equal(p.credits[`${start}|a`],10_000_000);assert.equal(p.credits[`${start}|b`]||0,0);
 assert.throws(()=>validateDepositBatch(base(),[newDeposit('a',start,current,'b-card',10_000_000,true)],current),/مخصوص/);
});
test('atomic multi-month credits may be submitted as a valid complete sequence in a single batch',()=>{
 const s=base(),batch=['1405/07','1405/08','1405/09'].map(p=>newDeposit('a',p));
 assert.equal(validateDepositBatch(s,batch,current),true);
 assert.throws(()=>validateDepositBatch(s,[batch[2]],current),/قبلی/);
});

function buildStress(months){
 const store=base();store.openingBalance=5_000_000_000;store.startPeriod=stressStart;
 const monthKeys=Array.from({length:months},(_,i)=>offset(stressStart,i));
 const planDate=stressToday;
 const planSettings=[['اسنپ‌پی',4,120_000_000],['دیجی‌پی',1,120_000_000],['تارا',2,120_000_000]];
 const plans=planSettings.map(([provider,count,total],i)=>({id:`plan-${months}-${i}`,title:`کالای ${i}`,provider,category:'خانه',creditOwnerId:'a',createdDate:planDate,total,
   installments:buildProviderSchedule({provider,count,total,purchaseDate:planDate,createId:k=>`inst-${months}-${i}-${k}`})}));
 store.plans=plans;
 const installmentIds=plans.flatMap(p=>p.installments.map(x=>x.id));
 const rows=[];
 for(let index=0;index<months;index++){
  const period=monthKeys[index],date=index===0?stressToday:monthStart(period);
  rows.push(newDeposit('a',period,date),newDeposit('b',period,date));
  rows.push(ev('purchase',date,20_000_000,{accountId:'a-card',paidById:'a',fundedBy:'personal',category:'سفر',creditPeriod:period}));
  rows.push(ev('transfer',date,100_000_000,{accountId:'fund',destinationId:'b-card'}));
  rows.push(ev('waiver',date,1_000_000,{memberId:'c',period}));
  rows.push(ev('refund',date,1_000_000,{memberId:'a',period}));
  if(index===months-1)rows.push(ev('creditMove',date,1_000_000,{memberId:'a',sourcePeriod:period,targetPeriod:offset(period,1)}));
 }
 // Generate diverse entries distributed across 1, 3, or 6 monthly windows.
 const remaining=498-rows.length;
 for(let i=0;i<remaining;i++){
  const index=Math.floor(i*months/remaining),period=monthKeys[index],date=index===0?stressToday:monthStart(period);
  const k=i%7;
  if(k===0)rows.push(cashPurchase(date,200_000));
  else if(k===1)rows.push(ev('purchase',date,60_000,{accountId:'b-card',paidById:'',fundedBy:'fund',category:'خانه',creditPeriod:period}));
  else if(k===2)rows.push(ev('purchase',date,90_000,{accountId:'a-card',paidById:'a',fundedBy:'personal',category:'سفر',creditPeriod:period}));
  else if(k===3)rows.push(ev('payment',date,80_000,{installmentId:installmentIds[i%installmentIds.length],accountId:'fund',paidById:'',creditPeriod:period}));
  else if(k===4)rows.push(ev('payment',date,80_000,{installmentId:installmentIds[i%installmentIds.length],accountId:'a-card',paidById:'a',fundedBy:'personal',creditPeriod:period}));
  else if(k===5)rows.push(ev('transfer',date,300_000,{accountId:'fund',destinationId:'b-card'}));
  else rows.push(ev('purchase',date,70_000,{accountId:'fund',paidById:'',category:'خوراک',creditPeriod:period}));
 }
 assert.equal(rows.length,498);
 // A reversal, and an audited monthly-obligation adjustment complete exactly 500 entries.
 const firstPurchase=rows.find(e=>e.kind==='purchase'&&e.accountId==='fund');
 const reversal=ev('reversal',firstPurchase.date,0,{originalId:firstPurchase.id,reason:'ابطال خرید اشتباه',recordedAt:new Date().toISOString()});
 const adjustment=ev('obligationAdjust',stressToday,200_000,{direction:'increase',memberId:'c',period:stressStart,reason:'اصلاح تعهد ثبت‌شده',recordedAt:new Date().toISOString()});
 return {store,rows,reversal,adjustment,monthKeys};
}
for(const months of [1,3,6])test(`500 synthetic operations across ${months} month(s): full domain validator, all payment categories, independent fund/custody/month reconciliation`,()=>{
 const {store,rows,reversal,adjustment,monthKeys}=buildStress(months);
 validateStore({...store,events:rows});
 assert.equal(validateDepositBatch(store,rows,stressToday),true);
 const before=structuredClone(store),batchStore={...store,events:rows};
 validateTransition(before,batchStore);
 const afterReversal={...store,events:[...rows,reversal]};
 validateTransition(batchStore,afterReversal,{systemAction:'reverse'});
 const finalized={...store,events:[...rows,reversal,adjustment]};
 validateTransition(afterReversal,finalized,{systemAction:'obligation-adjust'});
 validateStore(finalized);
 const projection=project(finalized);
 assert.equal(finalized.events.length,500);
 const gone=new Set(finalized.events.filter(e=>e.kind==='reversal').map(e=>e.originalId));
 const active=finalized.events.filter(e=>e.kind!=='reversal'&&!gone.has(e.id));
 const independentTotal=active.reduce((sum,e)=>{
  if(e.kind==='deposit'&&!e.creditOnly)return sum+e.amount;
  if(e.kind==='refund')return sum-e.amount;
  if((e.kind==='purchase'||e.kind==='payment')&&(e.accountId==='fund'||e.fundedBy==='fund'))return sum-e.amount;
  return sum;
 },finalized.openingBalance);
 const independentPhysical=active.reduce((sum,e)=>{
  if(e.kind==='deposit'&&!e.creditOnly&&(!e.destinationId||e.accountId==='fund'))return sum+e.amount;
  if(e.kind==='refund')return sum-e.amount;
  if((e.kind==='purchase'||e.kind==='payment')&&e.accountId==='fund')return sum-e.amount;
  if(e.kind==='transfer')return sum+(e.destinationId==='fund'?e.amount:0)-(e.accountId==='fund'?e.amount:0);
  return sum;
 },finalized.openingBalance);
 assert.equal(projection.totalCash,independentTotal);
 assert.equal(projection.fund,independentPhysical);
 assert.equal(Object.values(projection.custody).reduce((a,n)=>a+n,0),independentTotal-independentPhysical);
 assert.ok(projection.cashflow.every(x=>x.fund>=0));
 const payments=active.filter(e=>e.kind==='payment'),depositEvents=active.filter(e=>e.kind==='deposit');
 assert.ok(payments.length>30);assert.equal(depositEvents.length,months*2);
 const groups=Object.groupBy(active,e=>e.kind);
 for(const k of ['purchase','deposit','payment','transfer','waiver','refund','creditMove','obligationAdjust'])assert.ok(groups[k]?.length,`missing ${k}`);
 for(const p of monthKeys){
  const projectedMonth=active.filter(e=>persianMonth(e.date)===p);
  assert.ok(projectedMonth.length>=6);
  assert.equal(projectedMonth.filter(e=>e.kind==='deposit').length,2);
 }
 const amountPaid=payments.reduce((a,e)=>a+e.amount,0);
 assert.ok(amountPaid>0);assert.ok(projection.totalCash>0);
 assert.ok(projection.credits[`${stressStart}|a`]>0);
 // Repeating original reversal must be rejected by the projection.
 assert.throws(()=>project({...finalized,events:[...finalized.events,{...reversal,id:randomUUID()}]}),/تکراری/);
});

test('refund from Maryam custodial card reduces family cash without overdrawing physical fund',()=>{
 const s=base();s.events.push(newDeposit('a',start),ev('purchase',current,15_000_000,{accountId:'a-card',fundedBy:'personal',paidById:'a',category:'خانه',creditPeriod:start}));
 const refund=ev('refund',current,2_000_000,{memberId:'a',period:start,accountId:'b-card'});
 s.events.push(refund);
 const p=project(s);
 assert.equal(p.fund,0);assert.equal(p.custody['b-card'],8_000_000);assert.equal(p.totalCash,8_000_000);
 assert.equal(p.credits[`${start}|a`],23_000_000);
 assert.throws(()=>project({...s,events:[...s.events,ev('refund',current,9_000_000,{memberId:'a',period:start,accountId:'b-card'})]}),/امانی|وجه خانوادگی|کافی/);
});