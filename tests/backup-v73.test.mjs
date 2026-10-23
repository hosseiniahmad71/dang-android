import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAndroidBackup,decodeAndroidBackup,storeDigest,encodePortableBackup,decodePortableBackup} from '../src/backup-codec.mjs';
const secret='synthetic-test-password-only';
test('Android 7.1 encrypted envelope compatibility, tamper/password rejection, full-state digest',async()=>{
 const store={version:3,events:[{id:'retained',amount:123456}],plans:[{id:'plan'}],closedPeriods:['1405/07']};
 const encoded=await encodeAndroidBackup(store,secret);
 assert.deepEqual((await decodeAndroidBackup(encoded,secret)).store,store);
 assert.equal(await storeDigest(store),await storeDigest({closedPeriods:store.closedPeriods,plans:store.plans,events:store.events,version:3}));
 await assert.rejects(()=>decodeAndroidBackup(encoded,'wrong-password-123'));
 const bytes=Uint8Array.from(atob(encoded.payload),c=>c.charCodeAt(0));bytes[0]^=1;
 await assert.rejects(()=>decodeAndroidBackup({...encoded,payload:btoa(String.fromCharCode(...bytes))},secret));
 await assert.rejects(()=>decodeAndroidBackup({...encoded,iv:btoa('bad')},secret));
 // Construct the exact pre-7.3 plaintext layout, independently of the new encoder.
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveKey']);
 const derived=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['encrypt']);
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},derived,new TextEncoder().encode(JSON.stringify({format:'dang-backup',schema:3,exportedAt:'2026-10-17T00:00:00Z',store})));
 const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
 const legacy={format:'dang-android-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations:310000,cipher:'AES-256-GCM',salt:base64(salt),iv:base64(iv),payload:base64(cipher)};
 assert.deepEqual((await decodeAndroidBackup(legacy,secret)).store,store);
});

test('password-free portable backup roundtrip and SHA256 corruption refusal',async()=>{
 const store={version:3,events:[{id:'evt-1',amount:23456}],plans:[{id:'inst-1'}],closedPeriods:['1405/07'],members:[{id:'member-1'}],preferences:{locale:'fa'}};
 const fresh=await encodePortableBackup(store);
 assert.equal(fresh.format,'dong-portable-backup');
 assert.equal(fresh.version,1);
 assert.equal(fresh.schema,3);
 assert.equal('password' in fresh,false);
 assert.deepEqual((await decodePortableBackup(JSON.parse(JSON.stringify(fresh)))).store,store);
 await assert.rejects(()=>decodePortableBackup({...fresh,store:{...store,events:[{id:'tampered',amount:23456}]}}),/اثر انگشت/);
 await assert.rejects(()=>decodePortableBackup({...fresh,storeSha256:'00'.repeat(32)}),/اثر انگشت/);
 await assert.rejects(()=>decodePortableBackup({...fresh,version:99}),/ساختار/);
 await assert.rejects(()=>decodePortableBackup({...fresh,store:null}),/ساختار/);
});
