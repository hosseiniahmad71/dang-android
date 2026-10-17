import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DangStore, ConflictError} from '../server/store.mjs';
import {project,persianMonth,effectiveEvents,fundDelta} from '../server/ledger.mjs';
import {encryptDb,decryptDb,readExternalStore} from '../server/external.mjs';
import {MN,months,event,fixture} from './synthetic.mjs';
async function isolated(fn){const dir=await mkdtemp(join(tmpdir(),'dang-12month-'));let db;try{db=await new DangStore({directory:dir}).open();await fn(db,dir)}finally{try{db?.close()}catch{}await rm(dir,{force:true,recursive:true})}}
function balanceAt(s,p){return s.openingBalance+effectiveEvents(s.events).filter(e=>persianMonth(e.date)<=p).reduce((sum,e)=>sum+fundDelta(e),0)}

test('12 months: full integrated timeline, contributions, custody, installment and report reconciliation',()=>isolated(async db=>{
 const s=fixture(),out=db.save(s,0),state=out.store,projection=project(state);
 assert.equal(months.length,12);assert.ok(state.events.length>140);assert.equal(state.plans.length,4);assert.equal(state.plans.reduce((n,p)=>n+p.installments.length,0),12);
 assert.equal(projection.fund,balanceAt(state,months[11]));
 for(let i=0;i<months.length;i++){
  const p=months[i];assert.ok(balanceAt(state,p)>=0);assert.ok(projection.cashflow.filter(e=>persianMonth(e.date)===p).length>=10);
  const declared=state.members.reduce((sum,m)=>sum+(state.contributionOverrides[`${p}|${m.id}`]??(m.contributes?10*MN:0)),0);
  assert.equal(declared,i===3?38*MN:40*MN);
  const cash=state.events.filter(e=>e.kind==='deposit'&&e.period===p).reduce((sum,e)=>sum+e.amount,0);
  assert.equal(cash,i%2===0?38*MN:40*MN);
  const custodyEnd=projection.custody['mom-card']||0;assert.equal(custodyEnd,0);
 }
 assert.equal(state.events.filter(e=>e.kind==='waiver').length,6);
 assert.equal(state.events.filter(e=>e.kind==='creditMove').length,12);
 assert.equal(state.events.filter(e=>e.kind==='refund').length,12);
 assert.equal(state.events.filter(e=>e.kind==='payment').length,12);
 const one=await db.createBackup('12month');assert.equal((await db.backupStore(one.id)).events.length,state.events.length);
 db.close();db.db=null;const reopened=await new DangStore({directory:db.dir}).open();try{assert.equal(reopened.get().store.events.length,state.events.length);assert.equal(project(reopened.get().store).fund,projection.fund)}finally{reopened.close()}
}));
test('historical negative, false personal credit, fund custody over-consumption and bad ownership rejected',()=>isolated(async db=>{
 const s=fixture();db.save(s,0);const stored=db.get();
 const wrong=structuredClone(stored.store);wrong.events.push(event('retro-negative','purchase','1405/07',1,9*MN,{accountId:'fund',paidById:'',category:'نان',creditPeriod:'1405/07'}));assert.throws(()=>db.save(wrong,1),/تاریخی صندوق منفی/);
 const falseCredit=structuredClone(stored.store);falseCredit.events.push(event('fake-credit','purchase','1405/07',15,1*MN,{accountId:'mom-card',paidById:'ahmad',fundedBy:'personal',category:'نان',creditPeriod:'1405/07'}));assert.throws(()=>db.save(falseCredit,1),/کارت شخصی/);
 const ownerMismatch=structuredClone(stored.store);ownerMismatch.events.push(event('proxy','deposit','1405/07',16,2*MN,{memberId:'ahmad',accountId:'maryam-card',period:'1405/07'}));assert.throws(()=>db.save(ownerMismatch,1),/کارت شخصی/);
}));

test('lock, unlock with audit; historical obligation and opening are immutable; reversal and replacement atomic',()=>isolated(async db=>{
 const source=fixture();db.save(source,0);
 assert.throws(()=>{const s=structuredClone(source);s.openingBalance+=MN;db.save(s,1)},/افتتاحیه/);
 assert.throws(()=>{const s=structuredClone(source);s.defaultContribution=12*MN;db.save(s,1)},/تعهد/);
 const locked=db.changeLock('1405/07',true,'تأیید تراز ماه مهر',1);assert.ok(locked.store.closedPeriods.includes('1405/07'));
 const original=source.events.find(e=>e.kind==='purchase'&&e.accountId==='fund');
 assert.throws(()=>db.reverseEvent(original.id,'ابطال پس از بستن ماه',2),/قفل/);
 const open=db.changeLock('1405/07',false,'اصلاح سند اشتباه مهر',2);assert.equal(open.store.closedPeriods.includes('1405/07'),false);
 const newEvent={...original,id:'corrected-original',amount:5*MN};
 const revised=db.reverseEvent(original.id,'اصلاح مبلغ خرید نان',3,newEvent);
 assert.equal(revised.store.events.at(-2).kind,'reversal');assert.equal(revised.store.events.at(-1).amount,5*MN);
 assert.equal(project(revised.store).fund,project(source).fund+MN);
 assert.throws(()=>db.reverseEvent(original.id,'تکرار ابطال اشتباه',4),/قبلاً/);
 const audit=db.db.prepare('SELECT action FROM audit_actions ORDER BY revision').all().map(r=>r.action);
 assert.deepEqual(audit,['lock','unlock','reverse']);
}));

test('encrypted external backup: authenticated roundtrip, wrong password, tamper, independent location',()=>isolated(async(db,dir)=>{
 const s=fixture();db.save(s,0);
 const snap=await db.createBackup('external-test');const filename=db.db.prepare('SELECT filename FROM backup_manifest WHERE id=?').get(snap.id).filename;
 const raw=await readFile(join(dir,'backups',filename));const pass='this-is-a-strong-test-secret';const envelope=encryptDb(raw,pass);
 assert.deepEqual(decryptDb(envelope,pass),raw);assert.throws(()=>decryptDb(envelope,'wrong-password-is-long'),/دستکاری|رمز/);
 assert.equal((await readExternalStore(envelope,pass,dir)).events.length,s.events.length);
 const mangled={...envelope,tag:envelope.tag.slice(0,-3)+'AAA'};assert.throws(()=>decryptDb(mangled,pass),/دستکاری|رمز/);
 const external=join(dir,'..',`external-${Math.random().toString(16).slice(2)}`);
 try{const e=await db.externalBackup(pass);assert.ok(e.filename.endsWith('.dangbak'));}catch(error){if(!/ENOENT|EACCES/.test(String(error)))throw error; /* Desktop test without Termux shared storage */}
}));

test('audited monthly obligation adjustment supports future and historical periods, zero and lock controls',()=>isolated(async db=>{
 const state=fixture();db.save(state,0);
 const original=project(state).fund;
 const reduced=db.adjustObligation('fatemeh','1405/08',7*MN,'اصلاح سهم مریم و فاطمه',1);
 assert.equal(reduced.store.events.at(-1).kind,'obligationAdjust');
 assert.equal(reduced.store.events.at(-1).direction,'decrease');
 assert.equal(reduced.store.events.at(-1).amount,3*MN);
 assert.equal(project(reduced.store).fund,original);
 const increased=db.adjustObligation('fatemeh','1405/08',12*MN,'اصلاح مجدد سهم فاطمه',2);
 assert.equal(increased.store.events.at(-1).direction,'increase');
 assert.equal(increased.store.events.at(-1).amount,5*MN);
 assert.throws(()=>db.adjustObligation('erfan','1405/11',0,'معافیت عرفان در بهمن',3),/برابر/);
 const zero=db.adjustObligation('mehdi','1405/08',0,'معافیت کامل مهدی در آبان',3);assert.equal(zero.store.events.at(-1).amount,10*MN);
 db.changeLock('1405/08',true,'تأیید نهایی حساب آبان',4);assert.throws(()=>db.adjustObligation('mehdi','1405/08',10*MN,'تغییر پس از قفل',5),/قفل/);
}));

test('late contribution, partial installment payment and unearned credit on another card are isolated',()=>isolated(async db=>{
 const s=db.get().store;s.openingBalance=4*MN;
 s.plans.push({id:'late-plan',title:'لوازم خانه',provider:'تارا',creditOwnerId:'ahmad',category:'لوازم خانه',createdDate:'2026-10-01',total:4*MN,installments:[{id:'late1',dueDate:'2026-10-20',amount:4*MN}]});
 s.events.push({id:'late-d1',kind:'deposit',date:'2026-10-08',amount:7*MN,memberId:'fatemeh',accountId:'fatemeh-card',period:'1405/07',description:''});
 s.events.push({id:'pay-half1',kind:'payment',date:'2026-10-22',amount:2*MN,installmentId:'late1',accountId:'fund',paidById:'',creditPeriod:'1405/07',description:''});
 s.events.push({id:'late-d2',kind:'deposit',date:'2026-11-11',amount:3*MN,memberId:'fatemeh',accountId:'fatemeh-card',period:'1405/07',description:''});
 s.events.push({id:'pay-half2',kind:'payment',date:'2026-11-21',amount:2*MN,installmentId:'late1',accountId:'fund',paidById:'',creditPeriod:'1405/08',description:''});
 db.save(s,0);
 const result=db.get().store;
 assert.equal(result.events.filter(x=>x.kind==='payment').reduce((a,x)=>a+x.amount,0),4*MN);
 assert.equal(result.events.filter(x=>x.kind==='deposit'&&x.period==='1405/07').reduce((a,x)=>a+x.amount,0),10*MN);
 const alternate=structuredClone(result);alternate.events.push({id:'bad',kind:'purchase',date:'2026-12-01',amount:MN,category:'نان',accountId:'mom-card',paidById:'ahmad',fundedBy:'personal',creditPeriod:'1405/09',description:''});
 assert.throws(()=>db.save(alternate,1),/کارت شخصی/);
}));
