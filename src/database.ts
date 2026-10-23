import {isNativeAndroid,nativeRequest,saveAndroidDocument,createAndroidEncryptedBackup,readAndroidEncryptedBackup,createAndroidPortableBackup} from './native-bridge';
import {initialStore,Store} from './types';
// @ts-ignore shared native financial validation
import {validateStore} from './native-validate.mjs';
// @ts-ignore shared projection
import {project} from './native-ledger.mjs';
// @ts-ignore shared backup integrity
import {storeDigest} from './backup-codec.mjs';

// Android builds use native SQLite via the app bridge; the Termux web build uses the local API. Never use browser data as the ledger.
export type BackupPolicy='change'|'hourly'|'daily'|'off';
export type Snapshot={id:string,createdAt:string,reason:string,revision:number};
export type BackupEnvelope={format:'dang-backup',schema:3,exportedAt:string,store:Store};
let revision=0;
async function api<T>(url:string,method='GET',data?:unknown):Promise<T>{
 if(isNativeAndroid())return nativeRequest<T>(url,method,data);
 const res=await fetch(url,{method,cache:'no-store',credentials:'same-origin',headers:method==='GET'?{}:{'Content-Type':'application/json','X-Dang-App':'v4'},body:data===undefined?undefined:JSON.stringify(data)});
 let body:unknown;try{body=await res.json()}catch{throw Error('سرور دنگ در Termux پاسخ معتبر نمی‌دهد. بررسی کن که سرور روشن است.')}
 if(!res.ok)throw Error((body as {error?:string})?.error||`خطای سرور (${res.status})`);
 return body as T;
}
export function normalizeStore(value:unknown):Store{
 if(!value||typeof value!=='object')throw Error('فایل داده نامعتبر است.');
 const x=value as Partial<Omit<Store,'version'>> & {version?:number};
 if(x.version!==2&&x.version!==3)throw Error('فرمت پشتیبان پشتیبانی نمی‌شود.');
 if(!Array.isArray(x.events)||!Array.isArray(x.members)||!Array.isArray(x.plans)||!Array.isArray(x.accounts)||!Array.isArray(x.categories))throw Error('فایل داده ناقص است.');
 return {...structuredClone(initialStore),...x,closedPeriods:x.closedPeriods||[],version:3};
}
export function makeEnvelope(store:Store):BackupEnvelope{return {format:'dang-backup',schema:3,exportedAt:new Date().toISOString(),store};}
export function fromEnvelope(raw:unknown):Store{
 if(!raw||typeof raw!=='object')throw Error('فایل پشتیبان نامعتبر است.');
 const x=raw as {format?:string,schema?:number,version?:number,store?:unknown};
 if(x.version===2||x.version===3)return normalizeStore(raw);
 if(x.format!=='dang-backup'||x.schema!==3)throw Error('فایل پشتیبان دنگ معتبر نیست.');
 return normalizeStore(x.store);
}
export async function loadStore():Promise<Store>{const result=await api<{revision:number,store:Store}>('/api/store');revision=result.revision;return normalizeStore(result.store)}
export async function saveStore(store:Store):Promise<{revision:number,backupWarning?:string}>{const result=await api<{revision:number,backupWarning?:string}>('/api/store','PUT',{store,expectedRevision:revision});revision=result.revision;return result}
export async function backupNow(_store:Store,reason:string){await api('/api/backups','POST',{reason})}
export async function listBackups():Promise<Snapshot[]>{const data=await api<{items:Snapshot[]}>('/api/backups');return data.items}
export async function pruneBackups():Promise<void>{/* SQLite server enforces the retention cap. */}
export async function readBackupStore(id:string):Promise<Store>{const data=await api<{store:Store}>(`/api/backups/${encodeURIComponent(id)}/store`);return normalizeStore(data.store)}
export async function restoreStore(s:Store){const data=await api<{revision:number}>('/api/restore','POST',{store:s,expectedRevision:revision});revision=data.revision}
export function exportFile(store:Store){
 if(isNativeAndroid()){void saveAndroidDocument(`dang-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,JSON.stringify(makeEnvelope(store),null,2)).catch(e=>alert(String(e)));return;}
 const blob=new Blob([JSON.stringify(makeEnvelope(store),null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`dang-${new Date().toISOString().slice(0,19).replaceAll(':','-')}.json`;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}

export async function setPeriodLock(period:string,locked:boolean,reason:string):Promise<Store>{
 const result=await api<{revision:number,store:Store}>('/api/period-lock','POST',{period,locked,reason,expectedRevision:revision});revision=result.revision;return normalizeStore(result.store);
}
export async function reverseFinancialEvent(id:string,reason:string,replacement?:unknown):Promise<Store>{
 const result=await api<{revision:number,store:Store}>('/api/reverse','POST',{id,reason,replacement,expectedRevision:revision});revision=result.revision;return normalizeStore(result.store);
}
export async function exportEncryptedSqlite(passphrase:string):Promise<{filename:string,location:string,size:number}>{
 if(isNativeAndroid()){const store=await loadStore();return createAndroidEncryptedBackup(store,passphrase)}
 return api('/api/backups/external','POST',{passphrase});
}
export async function importEncryptedSqlite(envelope:unknown,passphrase:string):Promise<Store>{
 if(isNativeAndroid()){
  const {store:restored,digest}=await inspectEncryptedAndroidBackup(envelope,passphrase);
  await restoreStore(restored);
  const saved=await loadStore();
  if(await storeDigest(saved)!==digest)throw Error('تطبیق اطلاعات پس از بازیابی ناموفق بود؛ استفاده مالی را متوقف کنید و گزارش بگیرید.');
  return saved;
 }
 const result=await api<{revision:number,store:Store}>('/api/backups/external/restore','POST',{envelope,passphrase,expectedRevision:revision});revision=result.revision;return normalizeStore(result.store);
}

export async function reviseMonthlyObligation(memberId:string,period:string,newAmount:number,reason:string):Promise<Store>{const result=await api<{revision:number,store:Store}>('/api/obligation-adjust','POST',{memberId,period,newAmount,reason,expectedRevision:revision});revision=result.revision;return normalizeStore(result.store)}

export async function inspectEncryptedAndroidBackup(envelope:unknown,passphrase:string){
 const store=fromEnvelope(await readAndroidEncryptedBackup(envelope,passphrase));
 validateStore(store);const summary=project(store);
 return {store,digest:await storeDigest(store),events:store.events.length,plans:store.plans.length,members:store.members.length,totalCash:summary.totalCash};
}

/** New exports are plaintext, password-free and contain the entire audited ledger state.
 * Do not confuse an SHA-256 integrity check with authenticated encryption.
 */
export async function exportPortableBackup():Promise<{filename:string,location:string,size:number}>{
 const store=await loadStore();
 if(isNativeAndroid())return createAndroidPortableBackup(store);
 // @ts-ignore audited JavaScript module (no TypeScript declaration file)
 const {encodePortableBackup}=await import('./backup-codec.mjs');
 const content=JSON.stringify(await encodePortableBackup(store),null,2);
 const filename=`dang-${new Date().toISOString().replace(/[:.]/g,'-')}.dangbak`;
 const blob=new Blob([content],{type:'application/json'});
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 try{anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();}
 finally{setTimeout(()=>URL.revokeObjectURL(url),2000)}
 return {filename,location:'فایل انتخاب‌شده در مرورگر',size:content.length};
}
export async function inspectPortableBackup(envelope:unknown,legacyPassword?:string){
 let raw:unknown;
 if(envelope&&typeof envelope==='object'&&(envelope as {format?:string}).format==='dang-android-encrypted'){
  if(!legacyPassword||legacyPassword.length<12)throw Error('این فایل قدیمی رمزگذاری شده است؛ رمز اصلی آن لازم است.');
  raw=await readAndroidEncryptedBackup(envelope,legacyPassword);
 }else{
  // @ts-ignore audited JavaScript module (no TypeScript declaration file)
  const {decodePortableBackup}=await import('./backup-codec.mjs');
  raw=await decodePortableBackup(envelope);
 }
 const store=fromEnvelope(raw);
 validateStore(store);
 const summary=project(store);
 return {store,digest:await storeDigest(store),events:store.events.length,plans:store.plans.length,members:store.members.length,totalCash:summary.totalCash};
}
export async function importPortableBackup(envelope:unknown,legacyPassword?:string):Promise<Store>{
 const {store,digest}=await inspectPortableBackup(envelope,legacyPassword);
 await restoreStore(store); // Native runtime snapshots before and after restore, transactionally.
 const saved=await loadStore();
 if(await storeDigest(saved)!==digest)throw Error('تطبیق داده پس از بازیابی ناموفق بود؛ داده را بررسی کنید.');
 return saved;
}
