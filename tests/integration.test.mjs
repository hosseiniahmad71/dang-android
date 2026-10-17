import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DangStore} from '../server/store.mjs';

const fundDelta=e=>e.kind==='deposit'?e.amount:e.kind==='refund'?-e.amount:e.kind==='transfer'?(e.destinationId==='fund'?e.amount:0)-(e.accountId==='fund'?e.amount:0):['purchase','payment'].includes(e.kind)&&e.accountId==='fund'?-e.amount:0;
const remaining=(s,m,p)=>{
 const obligation=s.contributionOverrides[`${p}|${m}`]??(s.members.find(x=>x.id===m)?.contributes?s.defaultContribution:0);
 const credits=s.events.reduce((a,e)=>a+((e.kind==='deposit'&&e.memberId===m&&e.period===p)?e.amount:0)+((['purchase','payment'].includes(e.kind)&&e.accountId!=='fund'&&e.paidById===m&&e.creditPeriod===p)?e.amount:0)+((e.kind==='creditMove'&&e.memberId===m)?(e.targetPeriod===p?e.amount:e.sourcePeriod===p?-e.amount:0):0)-((e.kind==='refund'&&e.memberId===m&&e.period===p)?e.amount:0),0);
 const forgiven=s.events.filter(e=>e.kind==='waiver'&&e.memberId===m&&e.period===p).reduce((a,e)=>a+e.amount,0);
 return obligation-forgiven-credits;
};
const ev=(id,kind,amount,additional={})=>({id,kind,date:'2026-10-17',amount,description:'تست یکپارچگی',...additional});
async function withDb(fn){const dir=await mkdtemp(join(tmpdir(),'dang-integrated-'));let db;try{db=await new DangStore({directory:dir}).open();await fn(db,dir)}finally{db?.close();await rm(dir,{force:true,recursive:true})}}

test('integrated monthly ledger: deposits, personal purchases, carried credit, refund, waiver and installments',()=>withDb(async db=>{
 const {store:base}=db.get(),s=structuredClone(base);s.openingBalance=25_000_000;
 s.events.push(ev('d1','deposit',10_000_000,{memberId:'maryam',accountId:'maryam-card',period:'1405/07'}));
 s.events.push(ev('p1','purchase',5_000_000,{accountId:'fund',paidById:'',category:'سوپرمارکت',creditPeriod:'1405/07'}));
 s.events.push(ev('p2','purchase',13_000_000,{accountId:'ahmad-card',paidById:'ahmad',category:'میوه',creditPeriod:'1405/07'}));
 s.events.push(ev('move1','creditMove',1_000_000,{memberId:'ahmad',sourcePeriod:'1405/07',targetPeriod:'1405/08'}));
 s.events.push(ev('refund1','refund',2_000_000,{memberId:'ahmad',period:'1405/07'}));
 s.events.push(ev('waive1','waiver',4_000_000,{memberId:'mehdi',period:'1405/07'}));
 s.plans.push({id:'plan1',title:'خرید خانه با اسنپ‌پی',provider:'اسنپ‌پی',creditOwnerId:'ahmad',category:'لوازم خانه',createdDate:'2026-10-17',total:12_000_000,installments:[{id:'i1',dueDate:'2026-11-17',amount:3_000_000},{id:'i2',dueDate:'2026-12-17',amount:3_000_000},{id:'i3',dueDate:'2027-01-17',amount:3_000_000},{id:'i4',dueDate:'2027-02-17',amount:3_000_000}]});
 s.events.push(ev('pay1','payment',3_000_000,{installmentId:'i1',accountId:'maryam-card',paidById:'maryam',creditPeriod:'1405/08'}));
 const saved=db.save(s,0);assert.equal(saved.revision,1);
 const loaded=db.get().store;
 assert.equal(loaded.openingBalance+loaded.events.reduce((a,e)=>a+fundDelta(e),0),28_000_000,'fund only tracks real payments');
 assert.equal(remaining(loaded,'ahmad','1405/07'),0,'Ahmad entire October obligation settled after move and refund');
 assert.equal(remaining(loaded,'ahmad','1405/08'),9_000_000,'credit moved to November');
 assert.equal(remaining(loaded,'maryam','1405/07'),0,'Maryam deposited monthly share');
 assert.equal(remaining(loaded,'maryam','1405/08'),7_000_000,'Maryam credit comes from personal installment payment');
 assert.equal(remaining(loaded,'mehdi','1405/07'),6_000_000,'waiver lowers debt without creating cash');
 assert.equal(loaded.events.filter(e=>e.kind==='purchase').reduce((a,e)=>a+e.amount,0),18_000_000,'October cash/personal purchase expenses');
 assert.equal(loaded.plans[0].installments[0].amount,3_000_000,'November expense recognized at due date');
 assert.equal(loaded.events.filter(e=>e.kind==='payment').reduce((a,e)=>a+e.amount,0),3_000_000,'payment tracked but not counted as another purchase');
 db.close();db.db=null;
 const reopened=await new DangStore({directory:db.dir}).open();try{assert.equal(reopened.get().store.events.length,s.events.length);assert.equal(reopened.get().store.plans[0].installments.length,4)}finally{reopened.close()}
}));

test('settlement guardrails reject incorrect surplus or waiver and negative fund',()=>withDb(async db=>{
 const base=db.get().store;
 for(const bad of [
  ev('move-no-surplus','creditMove',1,{memberId:'ahmad',sourcePeriod:'1405/07',targetPeriod:'1405/08'}),
  ev('refund-no-surplus','refund',1,{memberId:'ahmad',period:'1405/07'}),
  ev('waiver-too-much','waiver',10_000_001,{memberId:'mehdi',period:'1405/07'})
 ]){const s=structuredClone(base);s.events.push(bad);assert.throws(()=>db.save(s,0),/اعتبار مازاد|بخشودگی/)}
 const s=structuredClone(base);s.events.push(ev('refund-funded','purchase',1,{accountId:'fund',paidById:'',category:'نان',creditPeriod:'1405/07'}));assert.throws(()=>db.save(s,0),/منفی/);
}));

test('settings references and archival are consistent with historical financial events',()=>withDb(async db=>{
 const s=structuredClone(db.get().store);s.openingBalance=200_000;
 s.events.push(ev('hist1','purchase',100_000,{accountId:'fund',paidById:'',category:'نان',creditPeriod:'1405/07'}));db.save(s,0);
 const edit=structuredClone(s);edit.archivedCategories.push('نان');edit.categories.push('خوراک جدید');edit.archivedAccounts.push('mom-card');edit.members.find(m=>m.id==='erfan').name='عرفان عزیز';
 assert.equal(db.save(edit,1).revision,2);
 assert.equal(db.get().store.events[0].category,'نان','archived category remains in historical records');
 assert.ok(db.get().store.archivedCategories.includes('نان'));
 const invalid=structuredClone(edit);invalid.categories=invalid.categories.filter(c=>c!=='نان');assert.throws(()=>db.save(invalid,2),/بایگانی|نامعتبر|ارجاع/);
}));

test('renaming a provider updates linked historical plans, but targeted plan tampering remains blocked',()=>withDb(async db=>{
 const s=structuredClone(db.get().store);
 s.plans.push({id:'plan-provider',title:'خرید خانوادگی',provider:'اسنپ‌پی',creditOwnerId:'ahmad',category:'لوازم خانه',createdDate:'2026-10-17',total:3_000_000,installments:[{id:'install-provider',dueDate:'2026-11-17',amount:3_000_000}]});
 db.save(s,0);
 const invalid=structuredClone(s);invalid.plans[0].provider='دیجی‌پی';assert.throws(()=>db.save(invalid,1),/تغییر قرارداد/);
 const renamed=structuredClone(s);renamed.providers=renamed.providers.map(p=>p==='اسنپ‌پی'?'اسنپ‌پی خانوادگی':p);renamed.plans[0].provider='اسنپ‌پی خانوادگی';
 db.save(renamed,1);assert.equal(db.get().store.plans[0].provider,'اسنپ‌پی خانوادگی');
 const tampered=structuredClone(renamed);tampered.plans[0].installments[0].amount+=1;tampered.plans[0].total+=1;
 assert.throws(()=>db.save(tampered,2),/تغییر قرارداد/);
}));

test('historical category cannot be silently reassigned without global settings rename',()=>withDb(async db=>{
 const s=structuredClone(db.get().store);s.openingBalance=1_000_000;s.events.push(ev('protected-purchase','purchase',100_000,{accountId:'fund',paidById:'',category:'نان',creditPeriod:'1405/07'}));
 db.save(s,0);const tampered=structuredClone(s);tampered.events[0].category='گوشت';assert.throws(()=>db.save(tampered,1),/تغییر رویداد/);
 const renamed=structuredClone(s);renamed.categories=renamed.categories.map(c=>c==='نان'?'نان سنتی':c);renamed.events[0].category='نان سنتی';
 db.save(renamed,1);assert.equal(db.get().store.events[0].category,'نان سنتی');
}));
