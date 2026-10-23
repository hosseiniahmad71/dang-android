// Compatible with 7.1 .dangbak files. No private keys or passwords are persisted.
const asB64=bytes=>btoa(Array.from(bytes,c=>String.fromCharCode(c)).join(''));
const fromB64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export async function storeDigest(store){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(store)))),v=>v.toString(16).padStart(2,'0')).join('')}
async function key(secret,salt){
 if(typeof secret!=='string'||secret.length<12)throw Error('رمز پشتیبان حداقل ۱۲ نویسه باشد.');
 const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encodeAndroidBackup(store,secret){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const plain={format:'dang-backup',schema:3,exportedAt:new Date().toISOString(),store,storeSha256:await storeDigest(store)};
 const payload=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret,salt),new TextEncoder().encode(JSON.stringify(plain)));
 return {format:'dang-android-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations:310000,cipher:'AES-256-GCM',salt:asB64(salt),iv:asB64(iv),payload:asB64(new Uint8Array(payload))};
}
export async function decodeAndroidBackup(x,secret){
 if(!x||x.format!=='dang-android-encrypted'||x.version!==1||x.kdf!=='PBKDF2-SHA256'||x.cipher!=='AES-256-GCM'||x.iterations!==310000||typeof x.salt!=='string'||typeof x.iv!=='string'||typeof x.payload!=='string'||x.payload.length>60000000)throw Error('فرمت فایل رمزگذاری‌شده اندروید معتبر نیست.');
 const salt=fromB64(x.salt),iv=fromB64(x.iv),payload=fromB64(x.payload);
 if(salt.length!==16||iv.length!==12||payload.length<16)throw Error('ساختار رمزگذاری پشتیبان معتبر نیست.');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},await key(secret,salt),payload);
 const raw=JSON.parse(new TextDecoder().decode(plain));
 if(raw.storeSha256&&raw.storeSha256!==await storeDigest(raw.store))throw Error('اثر انگشت داده پشتیبان تطبیق ندارد.');
 return raw;
}

/** v2: Portable, password-free external export. SHA-256 detects accidental corruption,
 * not malicious modification; the user is responsible for keeping this plaintext file private.
 * Legacy 7.1 encrypted backups stay readable through decodeAndroidBackup.
 */
export async function encodePortableBackup(store){
 if(!store||typeof store!=='object'||Array.isArray(store))throw Error('اطلاعات پشتیبان نامعتبر است.');
 return {format:'dong-portable-backup',version:1,schema:3,exportedAt:new Date().toISOString(),store,storeSha256:await storeDigest(store)};
}
export async function decodePortableBackup(envelope){
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)
  ||!['dong-portable-backup','dang-portable-backup'].includes(envelope.format)||envelope.version!==1||envelope.schema!==3
  ||typeof envelope.exportedAt!=='string'||!Number.isFinite(Date.parse(envelope.exportedAt))
  ||!envelope.store||typeof envelope.store!=='object'||Array.isArray(envelope.store)
  ||typeof envelope.storeSha256!=='string'||!/^[a-f0-9]{64}$/.test(envelope.storeSha256))
  throw Error('ساختار فایل پشتیبان بدون رمز معتبر نیست.');
 const digest=await storeDigest(envelope.store);
 if(digest!==envelope.storeSha256)throw Error('اثر انگشت پشتیبان تطبیق ندارد؛ فایل تغییر کرده یا آسیب دیده است.');
 return {format:'dang-backup',schema:3,exportedAt:envelope.exportedAt,store:envelope.store};
}
