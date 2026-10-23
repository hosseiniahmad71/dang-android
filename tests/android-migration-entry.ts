// Bundled into the instrumented TEST APK only, never the user APK.
import {loadStore,importEncryptedSqlite,inspectEncryptedAndroidBackup} from '../src/database';
import {encodeAndroidBackup,storeDigest} from '../src/backup-codec.mjs';
import {monthStart,persianMonth} from '../src/native-ledger.mjs';
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
 const nativeStress=[];
 for(const span of [1,3,6]){
  const dates:Record<string,string>={};
  const candidate=structuredClone(before);candidate.events=[];candidate.plans=[];candidate.closedPeriods=[];candidate.openingBalance=1000000;
  for(let i=0;i<500;i++){
   const index=1405*12+6+Math.floor(i*span/500),period=Math.floor(index/12)+'/'+String(index%12+1).padStart(2,'0'),date=(dates[period]??=monthStart(period));
   const common={id:`native-${span}-${i}`,date,description:'synthetic native SQLite audit'};
   candidate.events.push(i%2===0?{...common,kind:'deposit',amount:1000,memberId:'ahmad',accountId:'fund',destinationId:'fund',period}: {...common,kind:'purchase',amount:100,accountId:'fund',paidById:'',category:candidate.categories[0],creditPeriod:period});
  }
  const archive=await encodeAndroidBackup(candidate,password),expected=await storeDigest(candidate);
  const imported=await importEncryptedSqlite(archive,password),readback=await loadStore();
  const summary=await inspectEncryptedAndroidBackup(archive,password);
  if(imported.events.length!==500||readback.events.length!==500||await storeDigest(readback)!==expected||summary.totalCash!==1225000)throw Error(`Native ${span}-month reconciliation failed`);
  const months=new Set(readback.events.map(e=>persianMonth(e.date)));
  if(months.size!==span)throw Error('Incorrect native stress month coverage');
  nativeStress.push({months:span,events:readback.events.length,totalCash:summary.totalCash,digest:expected});
 }
 await importEncryptedSqlite(envelope,password);
 if(await storeDigest(await loadStore())!==digest)throw Error('Original synthetic fixture was not restored');
 return {nativeStress,digest,events:restored.events.length,plans:restored.plans.length,totalCash:checked.totalCash};
};
