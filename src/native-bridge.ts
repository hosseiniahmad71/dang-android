import {initialStore} from './types';
// JS modules reuse the audited server-side financial invariants.
// @ts-ignore standalone .mjs is bundler-resolved without TypeScript declaration
import {createNativeRuntime} from './native-runtime.mjs';

declare global {
 interface Window {
  dangStartup?: {ready():void;fail(error:unknown):void};
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
  try{if(!window.DangNative)throw Error('پل ذخیره فایل اندروید در دسترس نیست.');window.DangNative.saveFile(id,filename,content)}catch(err){pending.delete(id);reject(err)}
 });
}
// @ts-ignore shared, independently tested backup codec
import {encodeAndroidBackup,decodeAndroidBackup} from './backup-codec.mjs';
export async function createAndroidEncryptedBackup(store:unknown,passphrase:string){
 const content=JSON.stringify(await encodeAndroidBackup(store,passphrase),null,2);
 const filename=`dong-${new Date().toISOString().replace(/[:.]/g,'-')}.dongbak`;
 const location=await saveAndroidDocument(filename,content);
 return {filename,location,size:content.length};
}
export async function readAndroidEncryptedBackup(envelope:unknown,passphrase:string){return decodeAndroidBackup(envelope,passphrase)}

export async function createAndroidPortableBackup(store:unknown){
 // @ts-ignore backup codec is a JavaScript module with tested runtime contracts
 const {encodePortableBackup}=await import('./backup-codec.mjs');
 const envelope=await encodePortableBackup(store);
 const content=JSON.stringify(envelope,null,2);
 const filename=`dong-${new Date().toISOString().replace(/[:.]/g,'-')}.dongbak`;
 const location=await saveAndroidDocument(filename,content);
 return {filename,location,size:content.length};
}
