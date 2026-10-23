// Bundled into the instrumented TEST APK only, never the user APK.
import {loadStore,importEncryptedSqlite,inspectEncryptedAndroidBackup} from '../src/database';
import {encodeAndroidBackup,storeDigest} from '../src/backup-codec.mjs';
(window as any).dangMigrationTest=async()=>{
 const before=await loadStore(),password='instrumentation-test-only-password';
 const digest=await storeDigest(before);
 const envelope=await encodeAndroidBackup(before,password);
 const checked=await inspectEncryptedAndroidBackup(envelope,password);
 if(checked.digest!==digest)throw Error('Pre-restore digest mismatch');
 let rejected=false;
 try{await importEncryptedSqlite(envelope,'wrong-password-for-test')}catch{rejected=true}
 if(!rejected||await storeDigest(await loadStore())!==digest)throw Error('Wrong password mutated SQLite');
 const restored=await importEncryptedSqlite(envelope,password);
 if(await storeDigest(restored)!==digest||await storeDigest(await loadStore())!==digest)throw Error('SQLite restore mismatch');
 return {digest,events:restored.events.length,plans:restored.plans.length};
};
