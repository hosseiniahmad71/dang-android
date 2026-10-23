import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { mkdir, rm, copyFile, writeFile, readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, createHash, randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { validateStore } from './validate.mjs';
import {project, eventMonths, persianMonth, effectiveEvents, monthStart} from './ledger.mjs';
import {writeExternalSnapshot,readExternalStore} from './external.mjs';
import {assertStartPeriodChange} from '../src/start-period.mjs';

const initial = {
 version:3,providers:['اسنپ‌پی','تارا','دیجی‌پی','سایر'],backupPolicy:'change',googleClientId:'',
 archivedMembers:[],archivedAccounts:[],archivedCategories:[],archivedProviders:[],
 members:[{id:'ahmad',name:'احمد',contributes:true},{id:'maryam',name:'مریم',contributes:true},{id:'fatemeh',name:'فاطمه',contributes:true},{id:'mehdi',name:'مهدی',contributes:true},{id:'erfan',name:'عرفان',contributes:false}],
 accounts:[{id:'fund',name:'صندوق اصلی',kind:'fund'},{id:'ahmad-card',name:'کارت احمد',kind:'personal',ownerId:'ahmad'},{id:'maryam-card',name:'کارت مریم',kind:'personal',ownerId:'maryam'},{id:'fatemeh-card',name:'کارت فاطمه',kind:'personal',ownerId:'fatemeh'},{id:'mehdi-card',name:'کارت مهدی',kind:'personal',ownerId:'mehdi'},{id:'mom-card',name:'کارت مامان',kind:'other'},{id:'dad-card',name:'کارت بابا',kind:'other'}],
 categories:['میوه','صیفی‌جات','لبنیات','سوپرمارکت','لوازم خانه','اینترنت','قبوض','مخارج شمال','سفر','گوشت','مرغ','ماهی','سوسیس و کالباس','تخم مرغ','نان','ظروف آشپزخانه','کارت مامان','کارت بابا','کارت مریم'],
 plans:[],events:[],closedPeriods:[],openingBalance:0,defaultContribution:10_000_000,contributionOverrides:{},startPeriod:'1405/07'
};

export class ConflictError extends Error { constructor(){super('اطلاعات توسط درخواست دیگری تغییر کرده است. صفحه را دوباره بارگذاری کن.');this.status=409;} }
export class DangStore {
 constructor({directory=process.env.DANG_DATA_DIR||join(homedir(),'dang-data'),maxBackups=60}={}){
  this.dir=resolve(directory);this.backupDir=join(this.dir,'backups');this.dbPath=join(this.dir,'dang.sqlite');this.maxBackups=maxBackups;this.backupChain=Promise.resolve();this.db=null;
 }
 async open(){
  await mkdir(this.dir,{recursive:true,mode:0o700});await mkdir(this.backupDir,{recursive:true,mode:0o700});
  this.db=new DatabaseSync(this.dbPath,{timeout:5000});
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS audit_actions (id TEXT PRIMARY KEY,revision INTEGER NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,at TEXT NOT NULL,detail TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS event_reversals (id TEXT PRIMARY KEY,original_id TEXT NOT NULL UNIQUE,reason TEXT NOT NULL,recorded_at TEXT NOT NULL,revision INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=0), body TEXT NOT NULL, changed_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS mutations (revision INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, operation TEXT NOT NULL, old_hash TEXT NOT NULL, new_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS backup_manifest (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, reason TEXT NOT NULL, revision INTEGER NOT NULL, filename TEXT NOT NULL UNIQUE);
  CREATE TABLE IF NOT EXISTS ledger_events (id TEXT PRIMARY KEY, kind TEXT NOT NULL, date TEXT NOT NULL, amount_toman INTEGER NOT NULL CHECK(amount_toman>0), json TEXT NOT NULL, revision INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS installment_contracts (id TEXT PRIMARY KEY, json TEXT NOT NULL, revision INTEGER NOT NULL);`);
  const existing=this.db.prepare('SELECT revision FROM state WHERE id=1').get();
  if(!existing){this.db.prepare('INSERT INTO state(id,revision,body,changed_at) VALUES(1,0,?,?)').run(JSON.stringify(initial),new Date().toISOString());}
  // Refuse silent reset after database corruption or incompatible data.
  const state=this.get();validateStore(state.store);
  // Existing state from earlier schema versions can be mirrored without changing it.
  if(this.db.prepare('SELECT COUNT(*) AS n FROM ledger_events').get().n===0&&state.store.events.length){
   this.db.exec('BEGIN IMMEDIATE');try{for(const e of state.store.events)if(e.kind!=='reversal')this.insertEvent(e,state.revision);this.db.exec('COMMIT')}catch(e){this.db.exec('ROLLBACK');throw e}
  }
  if(this.db.prepare('SELECT COUNT(*) AS n FROM installment_contracts').get().n===0&&state.store.plans.length){
   this.db.exec('BEGIN IMMEDIATE');try{for(const p of state.store.plans)this.insertPlan(p,state.revision);this.db.exec('COMMIT')}catch(e){this.db.exec('ROLLBACK');throw e}
  }
  return this;
 }
 get(){const row=this.db.prepare('SELECT revision,body FROM state WHERE id=1').get();if(!row)throw new Error('داده اصلی دیتابیس یافت نشد.');const store=JSON.parse(row.body);store.closedPeriods??=[];return {revision:Number(row.revision),store};}
 save(raw,expectedRevision,{restore=false,systemAction='',reason=''}={}){
  const next=validateStore(raw);this.verifyLedger(next);const current=this.get();
  if(current.revision!==expectedRevision)throw new ConflictError();
  if(!restore){
   assertStartPeriodChange(current.store,next.startPeriod);
   if(JSON.stringify(next.closedPeriods??[])!==JSON.stringify(current.store.closedPeriods??[])&&!['lock','unlock'].includes(systemAction))throw Error('قفل ماه فقط از مسیر اختصاصی قفل/بازگشایی قابل تغییر است.');
   if(current.store.events.length&&next.openingBalance!==current.store.openingBalance)throw Error('موجودی افتتاحیه بعد از ثبت تراکنش قابل بازنویسی نیست.');
   const touched=new Set(current.store.events.flatMap(eventMonths));
   for(const p of current.store.closedPeriods??[])touched.add(p);
   for(const p of touched)for(const m of current.store.members){
     const amount=(s)=>s.contributionOverrides[`${p}|${m.id}`]??(s.members.find(x=>x.id===m.id)?.contributes?s.defaultContribution:0);
     if(amount(current.store)!==amount(next))throw Error('تغییر تعهد دوره دارای سابقه مجاز نیست؛ ابتدا ماه و سند اصلاحی را بررسی کنید.');
   }
   const beforeIds=new Set(current.store.events.map(e=>e.id));
   const nextIds=new Set(next.events.map(e=>e.id));
   // All historical monetary/identity fields are immutable. The only allowed label edits
   // are GLOBAL category/provider renames reflected in their corresponding settings list.
   // A single update (the UI saves each action separately) may rename a label in place.
   const renames=(before,after)=>{
    const changes=new Map();
    if(before.length!==after.length)return changes;
    for(let i=0;i<before.length;i++)if(before[i]!==after[i]){
     if(before.includes(after[i])||after.includes(before[i]))return new Map();
     changes.set(before[i],after[i]);
    }
    return changes;
   };
   const categoryRenames=renames(current.store.categories,next.categories);
   const providerRenames=renames(current.store.providers,next.providers);
   if(nextIds.size!==next.events.length)throw new Error('شناسه رویداد مالی تکراری است.');
   for(const old of current.store.events){const same=next.events.find(e=>e.id===old.id);if(!same)throw new Error('حذف رویداد مالی ثبت‌شده مجاز نیست.');
    const expected=old.kind==='purchase'?{...old,category:categoryRenames.get(old.category)||old.category}:old;
    if(JSON.stringify(expected)!==JSON.stringify(same))throw new Error('تغییر رویداد مالی قبلی مجاز نیست.');
   }
   const newlyAdded=next.events.filter(e=>!beforeIds.has(e.id));
   if(systemAction!=='obligation-adjust'&&newlyAdded.some(e=>e.kind==='obligationAdjust'))throw Error('تعدیل تعهد فقط از مسیر حسابرسی‌شده مجاز است.');
   if(systemAction==='obligation-adjust'&&newlyAdded.filter(e=>e.kind==='obligationAdjust').length!==1)throw Error('تعدیل تعهد نامعتبر است.');
   if(systemAction!=='reverse'&&newlyAdded.some(e=>e.kind==='reversal'))throw Error('ابطال فقط از مسیر ثبت سند برگشتی مجاز است.');
   if(systemAction==='reverse'&&newlyAdded.filter(e=>e.kind==='reversal').length!==1)throw Error('سند برگشت نامعتبر است.');
   for(const e of newlyAdded){if((current.store.closedPeriods??[]).some(p=>eventMonths(e).includes(p)))throw Error('دوره مالی قفل شده است؛ پیش از اصلاح باید آن را با دلیل باز کنید.');}
   for(const p of next.plans.filter(p=>!current.store.plans.some(x=>x.id===p.id))){if((current.store.closedPeriods??[]).some(x=>x===persianMonth(p.createdDate)||p.installments.some(i=>persianMonth(i.dueDate)===x)))throw Error('ثبت قرارداد در دوره بسته مجاز نیست.');if(p.installments.some(i=>i.dueDate<p.createdDate))throw Error('سررسید قسط پیش از تاریخ خرید معتبر نیست.');}
   if(next.plans.length<current.store.plans.length)throw new Error('قرارداد قبلی قابل حذف نیست.');
   for(const old of current.store.plans){const p=next.plans.find(x=>x.id===old.id);if(!p)throw new Error('حذف قرارداد اقساطی مجاز نیست.');
    const expected={...old,category:categoryRenames.get(old.category)||old.category,provider:providerRenames.get(old.provider)||old.provider};
    if(JSON.stringify(expected)!==JSON.stringify(p))throw new Error('تغییر قرارداد قبلی مجاز نیست.');
   }
  }
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const {revision}=this.get();if(revision!==expectedRevision)throw new ConflictError();
   const json=JSON.stringify(next);
   this.db.prepare('UPDATE state SET revision=?,body=?,changed_at=? WHERE id=1').run(revision+1,json,new Date().toISOString());
   if(restore){this.db.exec('DELETE FROM ledger_events; DELETE FROM installment_contracts; DELETE FROM event_reversals;');for(const e of next.events){if(e.kind==='reversal')this.insertReversal(e,revision+1);else this.insertEvent(e,revision+1)}for(const p of next.plans)this.insertPlan(p,revision+1)}
   else {const existingEventIds=new Set(current.store.events.map(e=>e.id)),existingPlanIds=new Set(current.store.plans.map(p=>p.id));for(const e of next.events){if(!existingEventIds.has(e.id)){if(e.kind==='reversal')this.insertReversal(e,revision+1);else this.insertEvent(e,revision+1);}else if(existingEventIds.has(e.id)&&e.kind==='purchase')this.db.prepare('UPDATE ledger_events SET json=? WHERE id=?').run(JSON.stringify(e),e.id)}for(const p of next.plans){if(!existingPlanIds.has(p.id))this.insertPlan(p,revision+1);else this.db.prepare('UPDATE installment_contracts SET json=? WHERE id=?').run(JSON.stringify(p),p.id)}}
   this.db.prepare('INSERT INTO mutations(revision,timestamp,operation,old_hash,new_hash) VALUES(?,?,?,?,?)').run(revision+1,new Date().toISOString(),restore?'restore':systemAction||'save',this.digest(JSON.stringify(current.store)),this.digest(json));
   if(systemAction)this.db.prepare('INSERT INTO audit_actions(id,revision,action,reason,at,detail) VALUES(?,?,?,?,?,?)').run(randomUUID(),revision+1,systemAction,reason,new Date().toISOString(),JSON.stringify({reversalIds:next.events.filter(e=>e.kind==='reversal'&&!current.store.events.some(o=>o.id===e.id)).map(x=>x.id),closedPeriods:next.closedPeriods}));
   this.db.exec('COMMIT');return {revision:revision+1,store:next};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 verifyLedger(s){project(s);}
 adjustObligation(memberId,period,newAmount,reason,revision){
  if(!/^\d{4}\/(0[1-9]|1[0-2])$/.test(period)||!Number.isSafeInteger(newAmount)||newAmount<0||!reason?.trim()||reason.trim().length<8)throw Error('داده سند تعدیل دنگ نامعتبر است.');
  const {store}=this.get();if(!store.members.some(m=>m.id===memberId))throw Error('عضو پیدا نشد.');
  if(store.closedPeriods.includes(period))throw Error('ماه قفل است؛ برای تعدیل ابتدا با دلیل بازگشایی شود.');
  const base=store.contributionOverrides[`${period}|${memberId}`]??(store.members.find(m=>m.id===memberId).contributes?store.defaultContribution:0);
  const reversals=new Set(store.events.filter(e=>e.kind==='reversal').map(e=>e.originalId));
  const adjustment=store.events.filter(e=>e.kind==='obligationAdjust'&&e.memberId===memberId&&e.period===period&&!reversals.has(e.id)).reduce((a,e)=>a+(e.direction==='increase'?e.amount:-e.amount),0);
  const previous=base+adjustment;if(newAmount===previous)throw Error('مبلغ جدید با تعهد فعلی برابر است.');
  const next=structuredClone(store);next.events.push({id:randomUUID(),kind:'obligationAdjust',date:monthStart(period),amount:Math.abs(newAmount-previous),direction:newAmount>previous?'increase':'decrease',memberId,period,reason,recordedAt:new Date().toISOString(),description:reason});
  return this.save(next,revision,{systemAction:'obligation-adjust',reason});
 }
 changeLock(period,locked,reason,revision){
  if(!/^\d{4}\/(0[1-9]|1[0-2])$/.test(period)||!reason?.trim()||reason.trim().length<8)throw Error('ماه معتبر و دلیل حداقل ۸ نویسه الزامی است.');
  const {store}=this.get();const isLocked=store.closedPeriods.includes(period);
  if(isLocked===locked)throw Error('این ماه از قبل در همین وضعیت است.');
  const next=structuredClone(store);
  next.closedPeriods=locked?[...next.closedPeriods,period].sort():next.closedPeriods.filter(p=>p!==period);
  return this.save(next,revision,{systemAction:locked?'lock':'unlock',reason});
 }
 reverseEvent(originalId,reason,revision,replacement=null){
  if(!reason?.trim()||reason.trim().length<8)throw Error('دلیل اصلاح یا ابطال حداقل ۸ نویسه باشد.');
  const {store}=this.get();const original=store.events.find(e=>e.id===originalId&&e.kind!=='reversal');
  if(!original)throw Error('سند اصلی پیدا نشد.');
  if(store.events.some(e=>e.kind==='reversal'&&e.originalId===originalId))throw Error('این سند قبلاً ابطال شده است.');
  if(store.closedPeriods.some(p=>eventMonths(original).includes(p)))throw Error('ماه مالی این سند قفل است؛ ابتدا با دلیل بازگشایی کنید.');
  const reversal={id:randomUUID(),kind:'reversal',date:original.date,amount:0,originalId,reason,recordedAt:new Date().toISOString(),description:reason};
  const next=structuredClone(store);next.events.push(reversal);
  if(replacement){if(replacement.id===originalId||replacement.kind==='reversal')throw Error('سند جایگزین نامعتبر است.');next.events.push(replacement)}
  return this.save(next,revision,{systemAction:'reverse',reason});
 }
 insertReversal(e,rev){this.db.prepare('INSERT INTO event_reversals(id,original_id,reason,recorded_at,revision) VALUES(?,?,?,?,?)').run(e.id,e.originalId,e.reason,e.recordedAt,rev);}
 insertEvent(e,rev){this.db.prepare('INSERT INTO ledger_events(id,kind,date,amount_toman,json,revision) VALUES(?,?,?,?,?,?)').run(e.id,e.kind,e.date,e.amount,JSON.stringify(e),rev);}
 insertPlan(p,rev){this.db.prepare('INSERT INTO installment_contracts(id,json,revision) VALUES(?,?,?)').run(p.id,JSON.stringify(p),rev);}
 digest(s){return createHash('sha256').update(s).digest('hex');}
 async createBackup(reason='manual'){
  // Serialize backup operations, so parallel writes cannot collide with SQLite's backup API.
  const task=async()=>{
   const {revision}=this.get();const now=new Date().toISOString();const id=`${Date.now()}-${randomUUID()}`;
   const filename=`dang-${id}.sqlite`;const path=join(this.backupDir,filename);
   try{await sqliteBackup(this.db,path);this.db.prepare('INSERT INTO backup_manifest(id,created_at,reason,revision,filename) VALUES(?,?,?,?,?)').run(id,now,String(reason).slice(0,40),revision,filename)}
   catch(e){await rm(path,{force:true});throw e;}
   const extras=this.db.prepare('SELECT id,filename FROM backup_manifest ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?').all(this.maxBackups);
   for(const x of extras){try{await rm(join(this.backupDir,x.filename),{force:true});this.db.prepare('DELETE FROM backup_manifest WHERE id=?').run(x.id)}catch(error){console.error('Backup cleanup failed:',error)}}
   let external;
   if(process.env.DANG_BACKUP_PASSPHRASE){try{external=await writeExternalSnapshot(path,this.dir,process.env.DANG_BACKUP_PASSPHRASE)}catch(error){console.error('External encrypted backup failed:',error.message);external={error:error.message}}}
   return {id,createdAt:now,reason,revision,external};
  };
  const queued=this.backupChain.then(task);this.backupChain=queued.catch(()=>{});return queued;
 }
 listBackups(){return this.db.prepare('SELECT id,created_at as createdAt,reason,revision FROM backup_manifest ORDER BY created_at DESC,id DESC').all();}
 async backupStore(id){const x=this.db.prepare('SELECT filename FROM backup_manifest WHERE id=?').get(id);if(!x)throw new Error('نسخه پشتیبان پیدا نشد.');
  // Open the snapshot as a separate read-only DB, never substitute live DB.
  const copy=new DatabaseSync(join(this.backupDir,basename(x.filename)),{readOnly:true});try{const row=copy.prepare('SELECT body FROM state WHERE id=1').get();return validateStore(JSON.parse(row.body))}finally{copy.close()}
 }
 async restore(raw,expectedRevision){await this.createBackup('before-restore');const result=this.save(raw,expectedRevision,{restore:true});await this.createBackup('restore');return result;}
 async externalBackup(passphrase){
  const backup=await this.createBackup('external-manual');
  const item=this.db.prepare('SELECT filename FROM backup_manifest WHERE id=?').get(backup.id);
  return writeExternalSnapshot(join(this.backupDir,item.filename),this.dir,passphrase);
 }
 async restoreEncrypted(envelope,passphrase,revision){
  const store=await readExternalStore(envelope,passphrase,this.dir);
  return this.restore(store,revision);
 }
 async periodic(){const {store}=this.get();if(!['hourly','daily'].includes(store.backupPolicy))return;
  const last=this.listBackups()[0];const limit=store.backupPolicy==='hourly'?3600_000:86_400_000;
  if(last&&Date.now()-Date.parse(last.createdAt)<limit)return;
  await this.createBackup(store.backupPolicy);
 }
 close(){this.db?.close();}
}
