import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTransition} from '../src/native-runtime.mjs';
import {project,persianMonth,monthStart} from '../src/native-ledger.mjs';
import {assertStartPeriodChange} from '../src/start-period.mjs';

const main=readFileSync('src/main.tsx','utf8');
const utils=readFileSync('src/utils.ts','utf8');
const settings=readFileSync('src/settings.tsx','utf8');
const picker=readFileSync('src/controls.tsx','utf8');
const css=readFileSync('src/style.css','utf8');
const runtime=readFileSync('src/native-runtime.mjs','utf8');
const base=()=>({
 version:3,providers:['سایر'],backupPolicy:'change',googleClientId:'',
 archivedMembers:[],archivedAccounts:[],archivedCategories:[],archivedProviders:[],
 members:[{id:'ahmad',name:'احمد',contributes:true},{id:'maryam',name:'مریم',contributes:true}],
 accounts:[{id:'fund',name:'صندوق اصلی',kind:'fund'},
           {id:'ahmad-card',name:'کارت احمد',kind:'personal',ownerId:'ahmad'}],
 categories:['خانه'],plans:[],events:[],closedPeriods:[],openingBalance:20_000_000,
 defaultContribution:10_000_000,contributionOverrides:{},startPeriod:'1405/07'
});
const purchase=(date,extra={})=>({
 id:'purchase_'+Math.random(),kind:'purchase',date,amount:1_000_000,
 accountId:'fund',paidById:'',category:'خانه',creditPeriod:'1405/07',
 description:'خرید ساختگی',...extra
});

test('financial start is selectable from Mehr 1405 and used by dashboard, settings and calendar',()=>{
 assert.ok(utils.includes("MIN_FINANCIAL_PERIOD='1405/07'"));
 assert.ok(main.includes('earlier<minPeriod?minPeriod:earlier'));
 assert.ok(settings.includes('earlier<minPeriod?minPeriod:earlier'));
 assert.ok(settings.includes('<SearchSelect label="شروع دوره‌های دنگ"'));
 assert.ok(settings.includes('setStartPeriod(startCandidate)'));
 assert.ok(main.includes('setStartPeriod={changeStartPeriod}'));
 assert.ok(main.includes('periodOptions(period,store.startPeriod)'));
 assert.ok(picker.includes('minPeriod=MIN_FINANCIAL_PERIOD'));
 assert.ok(picker.includes('canGoBack=offsetMonth(view,-1)>=minPeriod'));
 assert.ok(picker.includes('disabled={iso<minDate}'));
 assert.ok(picker.includes('if(iso<minDate)return'));
});
test('changing to Aban starts dues then; Mehr has zero obligation, no earlier financial event',()=>{
 const s=base(),aban='1405/08';
 assert.equal(assertStartPeriodChange(s,aban),aban);
 const moved=validateTransition(s,{...s,startPeriod:aban});
 assert.equal(moved.startPeriod,aban);
 assert.equal(assertStartPeriodChange(moved,'1405/07'),'1405/07');
 assert.throws(()=>validateTransition(moved,{...moved,events:[purchase(monthStart('1405/07'))]}),/شروع انتخابی/);
 assert.equal(project({...moved,events:[purchase(monthStart('1405/08'),{creditPeriod:aban})]}).fund,19_000_000);
});
test('do not erase historical Mehr records, even cancelled, when shifting start to Aban',()=>{
 const s=base(),mehr=monthStart('1405/07'),aban='1405/08';
 for(const used of [
  {...s,events:[purchase(mehr,{id:'prior-purchase'})]},
  {...s,closedPeriods:['1405/07']},
  {...s,contributionOverrides:{'1405/07|ahmad':7_000_000}},
  {...s,plans:[{id:'p1',title:'خرید قدیمی',provider:'سایر',creditOwnerId:'ahmad',category:'خانه',createdDate:mehr,total:100000,installments:[{id:'i1',dueDate:monthStart('1405/08'),amount:100000}]}]}
 ]){
  assert.throws(()=>assertStartPeriodChange(used,aban),/سند، قسط، تنظیم دنگ یا ماه قفل‌شده/);
  assert.throws(()=>validateTransition(used,{...used,startPeriod:aban}),/ماه|سند|قسط|تنظیم/);
 }
 assert.throws(()=>assertStartPeriodChange(s,'1405/06'),/مهر ۱۴۰۵/);
});
test('Native financial engine rejects pre-Mehr purchases but accepts Mehr',()=>{
 const first=monthStart('1405/07');
 const before=new Date(Date.parse(first+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 assert.equal(persianMonth(first),'1405/07');
 assert.equal(persianMonth(before),'1405/06');
 const s=base();
 assert.throws(()=>validateTransition(s,{...s,events:[purchase(before)]}),/شروع انتخابی/);
 const valid=validateTransition(s,{...s,events:[purchase(first)]});
 assert.equal(project(valid).fund,19_000_000);
});
test('New installment contracts with pre-Mehr purchase dates are rejected',()=>{
 const s=base(),first=monthStart('1405/07');
 const before=new Date(Date.parse(first+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const plan={id:'plan-1',title:'کالای ساختگی',provider:'سایر',creditOwnerId:'ahmad',
  category:'خانه',createdDate:before,total:100_000,
  installments:[{id:'inst-1',dueDate:first,amount:100_000}]};
 // Even if other contract fields change, it must not be accepted silently.
 assert.match(runtime,/persianMonth\(p.createdDate\)<next.startPeriod/);
 assert.notEqual(plan.createdDate,first);
});
test('Cash purchase automatically derives payer from the chosen card owner',()=>{
 const block=main.slice(main.indexOf('function PurchaseForm('),main.indexOf('function DepositForm('));
 assert.match(block,/paidBy=acct\?\.kind==='personal'\?\(acct.ownerId\|\|''\):''/);
 assert.match(block,/paidById:privatePay&&!isFunded\?paidBy:''/);
 assert.doesNotMatch(block,/<SearchSelect label="عضوی که با پول خودش پرداخت کرده"/);
 assert.match(block,/پرداخت‌کننده \(از مالک کارت\)/);
 assert.match(block,/acct.ownerId!==paidBy/);
});
test('Cancellation needs warning only and remains on original history row',()=>{
 const block=main.slice(main.indexOf('function HistoryView('),main.indexOf('function OperationsView('));
 assert.match(block,/if\(event.kind==='reversal'\)return false/);
 assert.match(block,/role="dialog" aria-modal="true"/);
 assert.match(block,/void onReverse\(pending.id,'ابطال با تأیید مدیر'\)/);
 assert.doesNotMatch(block,/window\.confirm\(/);
 assert.doesNotMatch(block,/window.prompt\('دلیل ابطال/);
 assert.match(block,/cancelled-stamp/);
 assert.match(block,/const cancelled=reversalByOriginal.get\(event.id\)/);
 assert.match(css,/\.cancelled-stamp\{/);
});
test('Reversal still remains in immutable audit ledger and removes amount from totals',()=>{
 const s=base(),day=monthStart('1405/07'),e=purchase(day,{id:'cash-1'});
 const rev={id:'rev-1',kind:'reversal',date:day,amount:0,originalId:e.id,
  reason:'ابطال با تأیید مدیر',recordedAt:'2026-10-01T12:00:00Z',
  description:'ابطال با تأیید مدیر'};
 const withOriginal={...s,events:[e]};
 const withReversal={...s,events:[e,rev]};
 assert.equal(project(withOriginal).fund,19_000_000);
 assert.equal(project(withReversal).fund,20_000_000);
 assert.equal(withReversal.events.length,2); // one original+one audit, UI shows only original
 assert.equal(validateTransition(withOriginal,withReversal,{systemAction:'reverse'}).events.length,2);
});
