import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../server/server.mjs';
const request=async (base,path,method='GET',data)=>{const response=await fetch(base+path,{method,headers:{Host:new URL(base).host,...method==='GET'?{}:{'content-type':'application/json','x-dang-app':'v4'}},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,...await response.json()};};

test('API: locked period, reversal, external encrypted backup and restore are integrated',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dang-api6-'));
 const external=await mkdtemp(join(tmpdir(),'dang-external6-'));
 let server;
 try{
  process.env.DANG_EXTERNAL_BACKUP_DIR=external;
  server=await startServer({directory:dir,port:32178});const base='http://127.0.0.1:'+server.server.address().port;
  const health=await request(base,'/api/health');assert.equal(health.database,'sqlite');
  const initial=await request(base,'/api/store');const data=structuredClone(initial.store);
  data.openingBalance=5_000_000;
  data.events.push({id:'event1',kind:'purchase',date:'2026-10-01',amount:1_000_000,accountId:'fund',paidById:'',creditPeriod:'1405/07',category:'نان',description:'آزمون API'});
  const saved=await request(base,'/api/store','PUT',{store:data,expectedRevision:0});assert.equal(saved.revision,1);
  const locked=await request(base,'/api/period-lock','POST',{period:'1405/07',locked:true,reason:'بستن حساب مهر ماه',expectedRevision:1});assert.equal(locked.revision,2);
  assert.deepEqual(locked.store.closedPeriods,['1405/07']);
  const forbidden=await request(base,'/api/reverse','POST',{id:'event1',reason:'اصلاح پس از بستن ماه',expectedRevision:2});assert.equal(forbidden.status,400);
  const unlocked=await request(base,'/api/period-lock','POST',{period:'1405/07',locked:false,reason:'بازگشایی برای اصلاح سند',expectedRevision:2});assert.equal(unlocked.revision,3);
  const corrected=await request(base,'/api/reverse','POST',{id:'event1',reason:'تصحیح مبلغ خرید خانه',expectedRevision:3,replacement:{...data.events[0],id:'event2',amount:500_000}});
  assert.equal(corrected.revision,4);assert.equal(corrected.store.events.length,3);
  const ext=await request(base,'/api/backups/external','POST',{passphrase:'A-strong-password-for-home'});assert.equal(ext.status,201);
  assert.ok(ext.filename.endsWith('.dangbak'));const envelope=JSON.parse(await readFile(join(external,ext.filename),'utf8'));
  const broken=await request(base,'/api/backups/external/restore','POST',{expectedRevision:4,envelope,passphrase:'not-the-correct-password'});assert.equal(broken.status,400);
  const restored=await request(base,'/api/backups/external/restore','POST',{expectedRevision:4,envelope,passphrase:'A-strong-password-for-home'});
  assert.equal(restored.revision,5);assert.equal(restored.store.events.length,3);
  const audit=await request(base,'/api/audit');assert.equal(audit.status,200);assert.deepEqual(audit.rows.map(a=>a.action).reverse(),['lock','unlock','reverse']);
  const after=await request(base,'/api/store');assert.equal(after.store.events.length,3);
 }finally{await server?.close();delete process.env.DANG_EXTERNAL_BACKUP_DIR;await rm(dir,{recursive:true,force:true});await rm(external,{recursive:true,force:true})}
});
