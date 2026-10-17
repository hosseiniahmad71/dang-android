import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../server/server.mjs';

test('local API connects to SQLite and blocks cross-origin writes and stale revisions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dang-api-'));
 let service;
 try{
  service=await startServer({directory:dir,port:8787});
  const url='http://127.0.0.1:8787';
  const original=await (await fetch(url+'/api/store')).json();
  assert.equal(original.revision,0);
  assert.equal(original.store.defaultContribution,10000000);
  const wrong=await fetch(url+'/api/store',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:0,store:original.store})});
  assert.equal(wrong.status,403);
  const headers={'content-type':'application/json','x-dang-app':'v4'};
  const cross=await fetch(url+'/api/store',{method:'PUT',headers:{...headers,origin:'https://other.example'},body:JSON.stringify({expectedRevision:0,store:original.store})});
  assert.equal(cross.status,403);
  const changed=structuredClone(original.store);changed.defaultContribution=11000000;
  const saved=await fetch(url+'/api/store',{method:'PUT',headers,body:JSON.stringify({expectedRevision:0,store:changed})});
  assert.equal(saved.status,200);assert.equal((await saved.json()).revision,1);
  const stale=await fetch(url+'/api/store',{method:'PUT',headers,body:JSON.stringify({expectedRevision:0,store:changed})});
  assert.equal(stale.status,409);
  const backups=(await (await fetch(url+'/api/backups')).json()).items;
  assert.equal(backups.length,1);
  const fromBackup=await (await fetch(url+'/api/backups/'+backups[0].id+'/store')).json();
  assert.equal(fromBackup.store.defaultContribution,11000000);
  const live=await (await fetch(url+'/api/store')).json();assert.equal(live.store.defaultContribution,11000000);
 }finally{await service?.close();await rm(dir,{recursive:true,force:true})}
});
