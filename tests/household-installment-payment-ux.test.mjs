import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateStore} from '../src/native-validate.mjs';
import {project} from '../src/native-ledger.mjs';
import {MEMBER_CASH_ACCOUNT,paymentSourceOptions,resolvePaymentSource} from '../src/installment-payment-source.mjs';

const period='1405/08';
function fixture(){
 return {
  version:3,providers:['اسنپ‌پی'],backupPolicy:'change',googleClientId:'',
  archivedMembers:[],archivedAccounts:[],archivedCategories:[],archivedProviders:[],
  members:[{id:'a',name:'عضو الف',contributes:true},{id:'b',name:'عضو ب',contributes:true}],
  accounts:[{id:'fund',name:'صندوق',kind:'fund'}],categories:['خانه'],
  plans:[{id:'p1',title:'خرید خانوادگی',provider:'اسنپ‌پی',creditOwnerId:'b',category:'خانه',createdDate:'2026-10-23',total:1001,installments:[{id:'i1',dueDate:'2026-10-30',amount:1001}]}],
  events:[],openingBalance:5000,defaultContribution:10000,contributionOverrides:{},
  startPeriod:'1405/07',closedPeriods:[]
 };
}
function payment(store,source,amount=501,id='pay1'){
 return {id,kind:'payment',date:'2026-10-30',amount,installmentId:'i1',creditPeriod:period,description:'',...resolvePaymentSource(store,source)};
}
test('payment sources are fund or actual members, not separate card and credit-owner selectors',()=>{
 const s=fixture();
 assert.deepEqual(paymentSourceOptions(s).map(x=>x.value),['fund','member:a','member:b']);
 assert.deepEqual(resolvePaymentSource(s,'fund'),{accountId:'fund',paidById:'',fundedBy:'fund'});
 assert.deepEqual(resolvePaymentSource(s,'member:a'),{accountId:MEMBER_CASH_ACCOUNT,paidById:'a',fundedBy:'personal'});
 assert.throws(()=>resolvePaymentSource(s,'member:unknown'));
 s.archivedMembers=['a'];
 assert.deepEqual(paymentSourceOptions(s).map(x=>x.value),['fund','member:b']);
 assert.throws(()=>resolvePaymentSource(s,'member:a'));
});
test('member-paid installment credits real payer, not credit owner; no fund double debit',()=>{
 const s=fixture(),e=payment(s,'member:a');
 s.events.push(e);
 validateStore(s);
 const p=project(s);
 assert.equal(p.fund,5000);
 assert.equal(p.credits[period+'|a'],501);
 assert.equal(p.credits[period+'|b']??0,0);
 assert.equal(p.totalCash,5000);
 assert.equal(p.active.length,1);
});
test('cash held on an accountable family card is a fund payment, not personal dues credit',()=>{
 const s=fixture();
 s.accounts.push({id:'card-a',name:'کارت الف',kind:'personal',ownerId:'a'});
 s.events.push({id:'deposit1',kind:'deposit',date:'2026-10-29',amount:2000,memberId:'a',accountId:'card-a',destinationId:'card-a',period,description:''});
 const choices=paymentSourceOptions(s).map(x=>x.value);
 assert.ok(choices.includes('custody:card-a'));
 const e=payment(s,'custody:card-a',501,'custody-payment');
 s.events.push(e);
 validateStore(s);
 const outcome=project(s);
 assert.equal(e.accountId,'card-a');
 assert.equal(e.fundedBy,'fund');
 assert.equal(outcome.custody['card-a'],1499);
 assert.equal(outcome.credits[period+'|a'],2000);
 assert.equal(outcome.totalCash,6499);
 assert.throws(()=>resolvePaymentSource(s,'custody:nonexistent'));
});
test('mixed partial payments from a member and fund settle exactly and conserve cash',()=>{
 const s=fixture();
 s.events=[payment(s,'member:a',501,'pay1'),payment(s,'fund',500,'pay2')];
 validateStore(s);
 const p=project(s);
 assert.equal(p.fund,4500);
 assert.equal(p.credits[period+'|a'],501);
 assert.equal(p.totalCash,4500);
 assert.equal(s.events.reduce((sum,e)=>sum+e.amount,0),1001);
});
test('reject overpayments and spoofed member-cash payments; preserve existing legacy card payments',()=>{
 const s=fixture();
 s.events=[payment(s,'member:a',1001,'pay1'),payment(s,'fund',1,'pay2')];
 assert.throws(()=>validateStore(s),/بیشتر/);
 const s2=fixture(),spoof=payment(s2,'member:a');
 spoof.fundedBy='fund';s2.events=[spoof];
 assert.throws(()=>validateStore(s2),/نامعتبر/);
 const s3=fixture();
 s3.accounts.push({id:'member-a-card',name:'کارت الف',kind:'personal',ownerId:'a'});
 s3.events=[{...payment(s3,'member:a'),accountId:'member-a-card'}];
 validateStore(s3);
 assert.equal(project(s3).credits[period+'|a'],501);
});
test('UI contract: direct installments, member drilldown and backup success without exposing content URI',()=>{
 const ui=readFileSync('src/main.tsx','utf8');
 const settings=readFileSync('src/settings.tsx','utf8');
 const css=readFileSync('src/style.css','utf8');
 assert.match(ui,/پرداخت این قسط/);
 assert.match(ui,/onPay\(r.id\)/);
 assert.match(ui,/initialInstallmentId=\{paymentSelection\}/);
 assert.match(ui,/چه کسی واقعاً پرداخت کرد/);
 assert.match(ui,/className="metric-grid"/);
 assert.match(ui,/className=\{`metric metric-\$\{tone\} metric-button`\}/);
 assert.match(ui,/openAudit\("member",m.id\)/);
 assert.match(ui,/AuditDetailView/);
 assert.doesNotMatch(settings,/status\('پشتیبان بدون رمز ذخیره شد: '\+x.location\)/);
 assert.match(settings,/نام فایل: '\+x.filename/);
 assert.match(css,/\.status-note,\.toast/);
});
