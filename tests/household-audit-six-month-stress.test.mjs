import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFileSync} from 'node:fs';
import {cashAudit,memberAudit,eventPeriod} from '../src/household-audit.mjs';
import {project} from '../src/native-ledger.mjs';
const dates=['2026-10-27','2026-11-25','2026-12-25','2027-01-25','2027-02-25','2027-03-25'];
function makeStore(total){
 const members=[{id:'a',name:'احمد',contributes:true},{id:'b',name:'فاطمه',contributes:true}];
 const s={version:3,providers:[],backupPolicy:'off',googleClientId:'',archivedMembers:[],archivedAccounts:[],archivedCategories:[],archivedProviders:[],members,accounts:[{id:'fund',name:'صندوق',kind:'fund'},{id:'card',name:'کارت امانی',kind:'personal',ownerId:'b'},{id:'personal-card',name:'کارت شخصی فاطمه',kind:'personal',ownerId:'b'}],categories:['سوپرمارکت'],plans:[],events:[],openingBalance:1_000_000_000,defaultContribution:10_000_000,contributionOverrides:{},startPeriod:'1405/07',closedPeriods:[]};
 const independent={fund:s.openingBalance,custody:0,personalCredit:0};
 const eventDates=new Set();
 for(let i=0;i<total;i++){
  const date=dates[Math.floor(i*dates.length/total)],period=eventPeriod(date),seq=i%10,id='tx-'+i;
  eventDates.add(period);
  if(seq===0){s.events.push({id,kind:'deposit',date,amount:1000,memberId:'a',accountId:'fund',destinationId:'fund',period,description:'واریز دنگ'});independent.fund+=1000}
  else if(seq===1){s.events.push({id,kind:'deposit',date,amount:200,memberId:'b',accountId:'card',destinationId:'card',period,description:'واریز به کارت فاطمه'});independent.custody+=200}
  else if(seq===2){s.events.push({id,kind:'transfer',date,amount:150,accountId:'fund',destinationId:'card',description:'انتقال صندوق'});independent.fund-=150;independent.custody+=150}
  else if(seq===3){s.events.push({id,kind:'purchase',date,amount:80,accountId:'fund',paidById:'',category:'سوپرمارکت',creditPeriod:period,fundedBy:'fund',description:'خرید از صندوق'});independent.fund-=80}
  else if(seq===4){s.events.push({id,kind:'purchase',date,amount:120,accountId:'personal-card',paidById:'b',category:'سوپرمارکت',creditPeriod:period,fundedBy:'personal',description:'خرید از پول شخصی'});independent.personalCredit+=120}
  else if(seq===5){s.events.push({id,kind:'purchase',date,amount:50,accountId:'card',paidById:'',category:'سوپرمارکت',creditPeriod:period,fundedBy:'fund',description:'خرید از پول صندوق نزد کارت'});independent.custody-=50}
  else if(seq===6){s.events.push({id,kind:'transfer',date,amount:75,accountId:'card',destinationId:'fund',description:'برگشت وجه از کارت'});independent.custody-=75;independent.fund+=75}
  else if(seq===7){s.events.push({id,kind:'purchase',date,amount:90,accountId:'fund',paidById:'',category:'سوپرمارکت',creditPeriod:period,fundedBy:'fund',description:'خرید نقدی'});independent.fund-=90}
  else if(seq===8){s.events.push({id,kind:'deposit',date,amount:300,memberId:'a',accountId:'fund',destinationId:'fund',period,description:'واریز صندوق'});independent.fund+=300}
  else {s.events.push({id,kind:'purchase',date,amount:220,accountId:'personal-card',paidById:'b',category:'سوپرمارکت',creditPeriod:period,fundedBy:'personal',description:'خرید شخصی'});independent.personalCredit+=220}
 }
 return {s,independent,periods:[...eventDates]};
}
test('audited fund distinguishes real main account, custodial money and member payment without double counting',()=>{
 const {s,independent,periods}=makeStore(500);
 assert.equal(periods.length,6);
 const audit=cashAudit(s,periods.at(-1));
 assert.equal(audit.mainFund,independent.fund);
 assert.equal(audit.custodyTotal,independent.custody);
 assert.equal(audit.totalCash,independent.fund+independent.custody);
 assert.equal(project(s).totalCash,audit.totalCash);
 const personal=audit.records.find(x=>x.description==='خرید از پول شخصی');
 assert.equal(personal.fundChange,0);
 assert.equal(personal.custodyChange,0);
 const custodial=audit.records.find(x=>x.description==='خرید از پول صندوق نزد کارت');
 assert.equal(custodial.custodyChange,-50);
 const m=memberAudit(s,'b',periods[0]);
 assert.ok(m.current.some(x=>x.label==='خرید خانه'&&x.effect===120));
 assert.ok(m.current.some(x=>x.label.includes('از پول صندوق')&&x.effect===0));
});
for(const spec of [{label:'۵۰۰ تراکنش در هر ماه × ۶ ماه',count:3000},{label:'۱٬۰۰۰ تراکنش در هر ماه × ۶ ماه',count:6000},{label:'۵٬۰۰۰ تراکنش در شش ماه',count:5000}]){
 test('financial stress: '+spec.label,()=>{
  const {s,independent,periods}=makeStore(spec.count);
  assert.equal(periods.length,6);
  assert.equal(s.events.length,spec.count);
  const start=performance.now();
  const detail=cashAudit(s,periods.at(-1));
  const members=memberAudit(s,'b',periods.at(-1));
  const elapsed=Math.round(performance.now()-start);
  assert.equal(detail.totalCash,independent.fund+independent.custody);
  assert.equal(detail.mainFund,independent.fund);
  assert.equal(detail.custodyTotal,independent.custody);
  assert.equal(detail.records.length,spec.count);
  assert.ok(members.rows.length>0);
  assert.ok(elapsed<10_000,'Audit exceeded 10s on CI: '+elapsed+'ms');
  console.log(JSON.stringify({scenario:spec.label,transactions:spec.count,months:periods.length,audit_ms:elapsed,mainFund:detail.mainFund,custody:detail.custodyTotal,totalCash:detail.totalCash}));
 });
}
test('reversals leave original immutable but zero audit impact and preserve historical explanation',()=>{
 const {s}=makeStore(100);
 const chosen=s.events.find(x=>x.kind==='purchase'&&x.fundedBy==='personal');
 s.events.push({id:'reverse-last',kind:'reversal',date:'2027-04-01',amount:0,originalId:chosen.id,reason:'اصلاح ثبت',recordedAt:'2027-04-01',description:'ابطال'});
 const m=memberAudit(s,'b',eventPeriod(chosen.date));
 const entry=m.rows.find(x=>x.id===chosen.id);
 assert.equal(entry.cancelled,true);
 assert.equal(entry.effect,0);
 assert.equal(entry.cancelReason,'اصلاح ثبت');
 assert.equal(s.events.find(e=>e.id===chosen.id).amount,chosen.amount);
 const audit=cashAudit(s,'1406/01');
 assert.equal(audit.records.length,99);
});
test('dashboard routes, grouped cash and dues, and nontechnical Persian alerts are wired',()=>{
 const main=readFileSync('src/main.tsx','utf8');
 const views=readFileSync('src/audit-views.tsx','utf8');
 assert.match(main,/AuditSummaryCards store=\{store\}/);
 assert.match(main,/onClick=\{\(\)=>openAudit\("member",m.id\)\}/);
 assert.match(main,/page==='audit'\?<AuditDetailView/);
 assert.match(views,/موجودی حساب اصلی/);
 assert.match(views,/پول صندوق نزد کارت‌ها/);
 assert.match(views,/اعتبار پرداخت‌شده/);
 assert.match(views,/جست‌وجوی گردش مالی/);
 assert.doesNotMatch(main,/اطلاعات در SQLite داخلی برنامه اندروید ذخیره می‌شوند/);
});
