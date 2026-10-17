import {BackupEnvelope,fromEnvelope} from './database';
import {Store} from './types';

type TokenResult={access_token?:string,error?:string,error_description?:string,expires_in?:number};
type GoogleWindow=Window & {google?:{accounts:{oauth2:{initTokenClient:(x:{client_id:string,scope:string,callback:(r:TokenResult)=>void,error_callback?:(e:{type:string})=>void})=>{requestAccessToken:(x?:{prompt?:string})=>void}}}}};
const SCOPE='https://www.googleapis.com/auth/drive.appdata';
const DRIVE='https://www.googleapis.com/drive/v3/files';
let token='',expiresAt=0,oauthClient='';
export function googleReady(){return !!(window as GoogleWindow).google?.accounts?.oauth2;}
export async function connectDrive(clientId:string):Promise<void>{
 if(!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId))throw Error('OAuth Client ID معتبر وارد کن.');
 const google=(window as GoogleWindow).google;if(!google)throw Error('کتابخانه گوگل بارگذاری نشد؛ اینترنت یا تنظیمات مرورگر را بررسی کن.');
 return new Promise((resolve,reject)=>{const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPE,callback:r=>{if(!r.access_token){reject(Error(r.error_description||'اتصال گوگل ناموفق بود.'));return}token=r.access_token;expiresAt=Date.now()+(r.expires_in||3500)*1000-60000;oauthClient=clientId;resolve()},error_callback:e=>reject(Error('پنجره تأیید گوگل باز یا تکمیل نشد: '+e.type))});client.requestAccessToken({prompt:'select_account'})});
}
export function driveConnected(clientId:string){return token!==''&&expiresAt>Date.now()&&oauthClient===clientId;}
export function disconnectDrive(){token='';expiresAt=0;oauthClient='';}
function authorize(){if(!token||expiresAt<Date.now())throw Error('مجوز گوگل منقضی شده است؛ دوباره اتصال را انجام بده.');return `Bearer ${token}`;}
async function request(url:string,init:RequestInit={}){const r=await fetch(url,{...init,headers:{Authorization:authorize(),...(init.headers||{})}});if(!r.ok){const message=(await r.text()).slice(0,250);throw Error(`خطای Google Drive (${r.status}): ${message}`)}return r;}
export type DriveFile={id:string,name:string,createdTime:string,size?:string};
export async function listDriveBackups(){let tokenPage='';const files:DriveFile[]=[];do{const qs=new URLSearchParams({spaces:'appDataFolder',fields:'nextPageToken,files(id,name,createdTime,size)',page_size:'100',pageSize:'100',q:"name contains 'dang-enc-' and trashed = false"});qs.delete('page_size');if(tokenPage)qs.set('pageToken',tokenPage);const body=await(await request(DRIVE+'?'+qs.toString())).json() as {nextPageToken?:string,files?:DriveFile[]};files.push(...(body.files||[]));tokenPage=body.nextPageToken||''}while(tokenPage&&files.length<500);return files.sort((a,b)=>b.createdTime.localeCompare(a.createdTime));}

// Cloud backups are always encrypted: no plaintext backup is sent to Drive.
const encoder=new TextEncoder(),decoder=new TextDecoder();
const bytesToB64=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)};
const b64ToBytes=(s:string)=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
async function keyFromPassword(password:string,salt:Uint8Array){if(password.length<10)throw Error('رمز پشتیبان حداقل ۱۰ نویسه باشد.');const base=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:new Uint8Array(salt),iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
type Encrypted={format:'dang-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations:310000,algorithm:'AES-256-GCM',salt:string,nonce:string,data:string};
export async function encryptBackup(payload:BackupEnvelope,password:string):Promise<Encrypted>{const salt=crypto.getRandomValues(new Uint8Array(16)),nonce=crypto.getRandomValues(new Uint8Array(12)),key=await keyFromPassword(password,salt),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,encoder.encode(JSON.stringify(payload))));return{format:'dang-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations:310000,algorithm:'AES-256-GCM',salt:bytesToB64(salt),nonce:bytesToB64(nonce),data:bytesToB64(encrypted)}}
export async function decryptBackup(raw:unknown,password:string):Promise<Store>{if(!raw||typeof raw!=='object')throw Error('قالب بک‌آپ رمزگذاری‌شده نامعتبر است.');const doc=raw as Partial<Encrypted>;if(doc.format!=='dang-encrypted'||doc.version!==1||doc.iterations!==310000||typeof doc.salt!=='string'||typeof doc.nonce!=='string'||typeof doc.data!=='string')throw Error('فرمت یا نسخه رمزگذاری ناشناخته است.');try{const salt=b64ToBytes(doc.salt),nonce=b64ToBytes(doc.nonce);const key=await keyFromPassword(password,salt);const result=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},key,b64ToBytes(doc.data));return fromEnvelope(JSON.parse(decoder.decode(result)))}catch{throw Error('رمز اشتباه است یا فایل پشتیبان آسیب دیده است.')}}
export async function uploadDriveBackup(payload:BackupEnvelope,password:string){const encrypted=await encryptBackup(payload,password),name=`dang-enc-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,boundary='dang_'+crypto.randomUUID().replaceAll('-',''),metadata=JSON.stringify({name,mimeType:'application/json',parents:['appDataFolder']}),body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(encrypted)}\r\n--${boundary}--`;const response=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});return (await response.json()) as DriveFile;}
export async function downloadDriveBackup(id:string,password:string):Promise<Store>{if(!/^[\w-]+$/.test(id))throw Error('شناسه فایل نامعتبر است.');const res=await request(`${DRIVE}/${encodeURIComponent(id)}?alt=media`);const raw=await res.json();return decryptBackup(raw,password);}
export async function shareEncryptedBackup(payload:BackupEnvelope,password:string){
 if(!navigator.share)throw Error('اشتراک‌گذاری فایل در این مرورگر پشتیبانی نمی‌شود.');
 const encrypted=await encryptBackup(payload,password);
 const file=new File([JSON.stringify(encrypted)],`dang-encrypted-${new Date().toISOString().slice(0,10)}.json`,{type:'application/json'});
 if(navigator.canShare&&!navigator.canShare({files:[file]}))throw Error('این مرورگر اشتراک‌گذاری فایل را پشتیبانی نمی‌کند.');
 await navigator.share({title:'پشتیبان رمزگذاری‌شده دنگ',text:'برای ذخیره، Google Drive را از برنامه‌های اشتراک‌گذاری انتخاب کنید.',files:[file]});
}
