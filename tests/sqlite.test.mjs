import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DangStore,ConflictError} from '../server/store.mjs';

async function withDb(fn){const temp=await mkdtemp(join(tmpdir(),'dang-test-'));let db;try{db=await new DangStore({directory:temp}).open();await fn(db,temp);}finally{db?.close();await rm(temp,{recursive:true,force:true});}}

test('initial state persisted in genuine SQLite file outside browser',()=>withDb(async(db,dir)=>{
 const {store,revision}=db.get();assert.equal(store.defaultContribution,10_000_000);assert.equal(store.members.length,5);assert.equal(revision,0);
 await access(join(dir,'dang.sqlite'));
 const b=await stat(join(dir,'dang.sqlite'));assert.ok(b.size>2000);
}));

test('save, reopen, backup and restore retain independent data',()=>withDb(async(db,dir)=>{
 const current=db.get(),next=structuredClone(current.store);
 next.events.push({id:'event-001',kind:'deposit',date:'2026-10-17',amount:2_000_000,memberId:'ahmad',accountId:'ahmad-card',period:'1405/07',description:'واریز سهم'});
 const saved=db.save(next,current.revision);assert.equal(saved.revision,1);
 const snap=await db.createBackup('manual');assert.equal(snap.revision,1);assert.equal(db.listBackups().length,1);
 const s=await db.backupStore(snap.id);assert.equal(s.events.length,1);
 db.close();db.db=null;
 const reopened=await new DangStore({directory:dir}).open();try{assert.equal(reopened.get().store.events[0].amount,2_000_000);
  assert.equal((await reopened.backupStore(snap.id)).events.length,1);
 }finally{reopened.close()}
}));

test('concurrent edits prevented; historical financial event cannot be silently modified',()=>withDb(async db=>{
 const state=db.get(),s=structuredClone(state.store);s.openingBalance=20000;
 s.events.push({id:'evt-1',kind:'purchase',date:'2026-10-17',amount:9000,accountId:'fund',paidById:'',category:'نان',description:'',creditPeriod:'1405/07'});
 db.save(s,0);
 assert.throws(()=>db.save(s,0),ConflictError);
 const changed=structuredClone(s);changed.events[0].amount=10000;
 assert.throws(()=>db.save(changed,1),/تغییر رویداد/);
 const removed=structuredClone(s);removed.events=[];
 assert.throws(()=>db.save(removed,1),/حذف رویداد/);
}));

test('installment overpayment and invalid references rejected',()=>withDb(async db=>{
 const data=structuredClone(db.get().store);
 data.plans.push({id:'pl1',title:'مبلمان',provider:'اسنپ‌پی',creditOwnerId:'ahmad',category:'لوازم خانه',createdDate:'2026-10-17',total:8000000,installments:[{id:'in1',dueDate:'2026-11-17',amount:8000000}]});
 data.events.push({id:'pay1',kind:'payment',date:'2026-10-17',amount:9000000,installmentId:'in1',accountId:'fund',paidById:'',creditPeriod:'1405/08',description:''});
 assert.throws(()=>db.save(data,0),/بیشتر/);
}));

test('snapshots are restorable, preserves pre-restore state',()=>withDb(async db=>{
 const first=db.get().store;
 const changed=structuredClone(first);changed.defaultContribution=12_000_000;
 db.save(changed,0);
 const result=await db.restore(first,1);
 assert.equal(result.revision,2);
 assert.equal(db.get().store.defaultContribution,10_000_000);
 assert.equal(db.listBackups().length,2);
 assert.equal((await db.backupStore(db.listBackups()[1].id)).defaultContribution,12_000_000);
}));

test('financial invariants reject negative cash and unearned refunds',()=>withDb(async db=>{
 const s=structuredClone(db.get().store);
 s.events.push({id:'overspend',kind:'purchase',date:'2026-10-17',amount:1000,accountId:'fund',paidById:'',category:'نان',description:'',creditPeriod:'1405/07'});
 assert.throws(()=>db.save(s,0),/منفی/);
 s.events=[{id:'refund',kind:'refund',date:'2026-10-17',amount:1000,memberId:'ahmad',period:'1405/07',description:''}];
 assert.throws(()=>db.save(s,0),/اعتبار مازاد/);
}));

test('category rename remains allowed while monetary parts remain immutable',()=>withDb(async db=>{
 const s=structuredClone(db.get().store);s.openingBalance=20000;
 s.events.push({id:'p1',kind:'purchase',date:'2026-10-17',amount:1000,accountId:'fund',paidById:'',category:'نان',description:'',creditPeriod:'1405/07'});
 db.save(s,0);
 const rename=structuredClone(s);rename.categories=rename.categories.map(c=>c==='نان'?'نان سنتی':c);rename.events[0].category='نان سنتی';
 db.save(rename,1);
 assert.equal(db.get().store.events[0].category,'نان سنتی');
 assert.equal(JSON.parse(db.db.prepare('SELECT json FROM ledger_events WHERE id=?').get('p1').json).category,'نان سنتی');
}));

test('backup retention enforces bounded independent snapshot files',()=>withDb(async db=>{
 db.maxBackups=2;
 await db.createBackup('one');await db.createBackup('two');await db.createBackup('three');
 assert.equal(db.listBackups().length,2);
 assert.ok(db.listBackups().some(x=>x.reason==='three'));
}));
