import {build} from 'esbuild';
await build({entryPoints:['tests/android-migration-entry.ts'],bundle:true,format:'iife',target:'es2022',outfile:'android/app/src/androidTest/assets/migration-test.js'});
// Test APK only: a deterministic, validated ledger for an actual signed upgrade.
const compiled=await build({stdin:{contents:"export {initialStore} from './src/types';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
const {initialStore}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const {validateStore}=await import('../server/validate.mjs');
const s=structuredClone(initialStore);
s.openingBalance=1000000;s.closedPeriods=['1405/07'];s.contributionOverrides['1405/08|ahmad']=12000000;s.categories.push('نشانه حفظ اطلاعات ارتقا');
s.events=[{id:'upgrade-deposit',kind:'deposit',date:'2026-10-23',amount:10000000,memberId:'ahmad',accountId:'maryam-card',period:'1405/08',description:'Synthetic upgrade sentinel'},{id:'upgrade-purchase',kind:'purchase',date:'2026-10-23',amount:100000,accountId:'maryam-card',paidById:'',fundedBy:'fund',category:'میوه',creditPeriod:'1405/08',description:'Synthetic upgrade purchase'}];
s.plans=[{id:'upgrade-plan',title:'قرارداد آزمایشی ارتقا',provider:'تارا',creditOwnerId:'ahmad',category:'لوازم خانه',createdDate:'2026-10-23',total:1000000,installments:[{id:'upgrade-i1',dueDate:'2026-11-22',amount:500000},{id:'upgrade-i2',dueDate:'2026-12-22',amount:500000}]}];
validateStore(s);
const {writeFile}=await import('node:fs/promises');
await writeFile('android/app/src/androidTest/assets/upgrade-store.json',JSON.stringify(s));
