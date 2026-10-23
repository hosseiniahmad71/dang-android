import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function importUtils(source){
 const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputText).toString('base64'));
}
test('calendar module evaluates before React and financial start roundtrips correctly',async()=>{
 const utils=await importUtils(fs.readFileSync('src/utils.ts','utf8'));
 assert.equal(utils.MIN_FINANCIAL_DATE,'2026-09-23');
 assert.deepEqual(utils.jalaliParts(utils.MIN_FINANCIAL_DATE),{year:1405,month:7,day:1});
 for(let month=1;month<=12;month++){
  const days=utils.daysInJalaliMonth(1405,month);
  assert.equal(days,month<=6?31:month<12?30:29);
  for(const day of [1,days])assert.deepEqual(utils.jalaliParts(utils.toIsoFromJalali(1405,month,day)),{year:1405,month,day});
 }
});
test('boot guard survives module-load errors, renders Persian recovery and does not reset data',()=>{
 const nodes=Object.fromEntries(['startup-panel','startup-title','startup-message','startup-actions','startup-details','startup-retry','startup-save'].map(id=>[id,{hidden:id==='startup-actions',textContent:''}]));
 const listeners={};let reloaded=0,saved;
 const window={addEventListener:(name,fn)=>{listeners[name]=fn},DangNative:{saveFile:(...args)=>saved=args}};
 vm.runInNewContext(fs.readFileSync('public/boot-guard.js','utf8'),{window,document:{getElementById:id=>nodes[id]},navigator:{userAgent:'test'},setTimeout:()=>1,clearTimeout:()=>{},location:{reload:()=>reloaded++},Date});
 listeners.error({error:Error('Cannot access calendar before initialization')});
 assert.equal(nodes['startup-panel'].hidden,false);assert.equal(nodes['startup-actions'].hidden,false);
 assert.match(nodes['startup-title'].textContent,/ناموفق/);assert.match(nodes['startup-details'].textContent,/calendar/);
 nodes['startup-save'].onclick();assert.equal(saved[1],'dang-startup-diagnostic.txt');
 nodes['startup-retry'].onclick();assert.equal(reloaded,1);
 window.dangStartup.ready();assert.equal(nodes['startup-panel'].hidden,true);
 listeners.unhandledrejection({reason:Error('SQLite unavailable')});assert.equal(nodes['startup-panel'].hidden,false);
});
