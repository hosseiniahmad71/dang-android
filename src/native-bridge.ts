import {initialStore} from './types';
// JS modules reuse the audited server-side financial invariants.
// @ts-ignore standalone .mjs is bundler-resolved without TypeScript declaration
import {createNativeRuntime} from './native-runtime.mjs';

declare global {
 interface Window {
  DangNative?: {invoke(input:string):string;saveFile(id:string,name:string,content:string):void};
  dangNativeDocumentResult?: (id:string,success:boolean,message:string)=>void;
 }
}
export const isNativeAndroid=()=>typeof window!=='undefined'&&!!window.DangNative;
const runtime=createNativeRuntime((payload:unknown)=>{
 if(!window.DangNative)throw Error('پل SQLite اندروید پیدا نشد.');
 return JSON.parse(window.DangNative.invoke(JSON.stringify(payload))) as unknown;
},initialStore);
export function nativeRequest<T>(url:string,method='GET',data?:unknown):Promise<T>{return runtime.request(url,method,data) as Promise<T>}
const pending=new Map<string,{resolve:(value:string)=>void;reject:(error:Error)=>void}>();
if(typeof window!=='undefined')window.dangNativeDocumentResult=(id,ok,message)=>{
 const p=pending.get(id);if(!p)return;pending.delete(id);
 if(ok)p.resolve(message);else p.reject(Error(message||'ذخیره فایل لغو یا ناموفق شد.'));
};
export function saveAndroidDocument(filename:string,content:string):Promise<string>{
 return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID();pending.set(id,{resolve,reject});
  try{window.DangNative?.saveFile(id,filename,content)}catch(err){pending.delete(id);reject(err)}
 });
}
const asB64=(bytes:Uint8Array)=>btoa(Array.from(bytes,c=>String.fromCharCode(c)).join(''));
const fromB64=(base64:string)=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
async function secretKey(passphrase:string,salt:Uint8Array){const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt: salt as BufferSource,iterations:310000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
export async function createAndroidEncryptedBackup(store:unknown,passphrase:string){
 if(passphrase.length<12)throw Error('رمز پشتیبان حداقل ۱۲ نویسه باشد.');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv as BufferSource},await secretKey(passphrase,salt),new TextEncoder().encode(JSON.stringify({format:'dang-backup',schema:3,exportedAt:new Date().toISOString(),store})));
 const content=JSON.stringify({format:'dang-android-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations:310000,cipher:'AES-256-GCM',salt:asB64(salt),iv:asB64(iv),payload:asB64(new Uint8Array(cipher))},null,2);
 const filename=`dang-${new Date().toISOString().replace(/[:.]/g,'-')}.dangbak`;
 const location=await saveAndroidDocument(filename,content);
 return {filename,location,size:content.length};
}
export async function readAndroidEncryptedBackup(envelope:unknown,passphrase:string){
 const x=envelope as Record<string,unknown>;
 if(!x||x.format!=='dang-android-encrypted'||x.version!==1||x.iterations!==310000||typeof x.salt!=='string'||typeof x.iv!=='string'||typeof x.payload!=='string')throw Error('فرمت فایل رمزگذاری‌شده اندروید معتبر نیست.');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(x.iv) as BufferSource},await secretKey(passphrase,fromB64(x.salt)),fromB64(x.payload) as BufferSource);
 return JSON.parse(new TextDecoder().decode(plain));
}
