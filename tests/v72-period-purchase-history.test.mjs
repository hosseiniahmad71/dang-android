import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTransition} from '../src/native-runtime.mjs';
import {project,persianMonth,monthStart} from '../src/native-ledger.mjs';

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

test('All selectable financial months begin at Mehr 1405',()=>{
 assert.match(utils,/MIN_FINANCIAL_PERIOD='1405\/07'/);
 assert.match(main,/earlier<MIN_FINANCIAL_PERIOD\?MIN_FINANCIAL_PERIOD:earlier/);
 assert.match(settings,/earlier<MIN_FINANCIAL_PERIOD\?MIN_FINANCIAL_PERIOD:earlier/);
 assert.match(settings,/آغاز ثابت حسابداری|شروع ثابت حسابداری/);
 assert.doesNotMatch(settings,/<SearchSelect label="شروع دوره‌های دنگ"/);
});
test('Persian calendar cannot browse or choose days before financial start',()=>{
 assert.match(picker,/disabled=\{!canGoBack\}/);
 assert.match(picker,/disabled=\{iso<MIN_FINANCIAL_DATE\}/);
 assert.match(picker,/if\(iso<MIN_FINANCIAL_DATE\)return/);
});
test('Native financial engine rejects pre-Mehr purchases but accepts Mehr',()=>{
 const first=monthStart('1405/07');
 const before=new Date(Date.parse(first+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 assert.equal(persianMonth(first),'1405/07');
 assert.equal(persianMonth(before),'1405/06');
 const s=base();
 assert.throws(()=>validateTransition(s,{...s,events:[purchase(before)]}),/مهر ۱۴۰۵/);
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
 assert.match(runtime,/persianMonth\(p.createdDate\)<'1405\/07'/);
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
 assert.match(block,/if\(window.confirm\(message\)\)void onReverse\(event.id,'ابطال با تأیید مدیر'\)/);
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
