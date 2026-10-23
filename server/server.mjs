import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DangStore, ConflictError } from './store.mjs';
import { validateStore } from './validate.mjs';

const PORT=Number(process.env.DANG_PORT||8787);
const HOST='127.0.0.1'; // No network exposure by default.
const dist=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const maxBody=70_000_000;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json','.png':'image/png','.webp':'image/webp'};
function send(res,status,data,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(JSON.stringify(data));}
async function body(req){if(!req.headers['content-type']?.startsWith('application/json')){const e=Error('فرمت درخواست باید JSON باشد.');e.status=415;throw e;}
 let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>maxBody){const e=Error('داده بیش از اندازه مجاز است.');e.status=413;throw e;}chunks.push(chunk)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{const e=Error('JSON نامعتبر است.');e.status=400;throw e;}}
function verify(req,activePort){const hostname=req.headers.host||'';
 if(!new RegExp(`^(localhost|127\\.0\\.0\\.1):(?:5173|8787|${activePort})$`).test(hostname)){const e=Error('درخواست از میزبان غیرمجاز است.');e.status=403;throw e;}
 const origin=req.headers.origin;
 if(origin&&!new RegExp(`^http://(localhost|127\\.0\\.0\\.1):(?:5173|8787|${activePort})$`).test(origin)){const e=Error('مبدأ درخواست مجاز نیست.');e.status=403;throw e;}
 if(!['GET','HEAD'].includes(req.method)&&req.headers['x-dang-app']!=='v4'){const e=Error('درخواست فاقد نشان امنیتی برنامه است.');e.status=403;throw e;}
}
async function serveStatic(req,res,path){let file=path==='/'?'/index.html':path;
 if(file.includes('\0')||file.includes('..'))return send(res,400,{error:'مسیر نامعتبر'});
 const target=resolve(dist,'.'+file);if(!(target===dist||target.startsWith(dist+sep)))return send(res,403,{error:'دسترسی مجاز نیست.'});
 try{const info=await stat(target);if(!info.isFile())throw Error('not a file');const bytes=await readFile(target);
 res.writeHead(200,{'content-type':mime[extname(target)]||'application/octet-stream','content-length':bytes.length,'x-content-type-options':'nosniff'});res.end(bytes);
 }catch{if(file.includes('.'))return send(res,404,{error:'فایل پیدا نشد.'});try{const bytes=await readFile(resolve(dist,'index.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(bytes)}catch{return send(res,404,{error:'نسخه ساخته‌شده یافت نشد. ابتدا npm run build را اجرا کن.'})}}
}
export async function startServer(options={}){
 const store=await new DangStore(options).open();let timer=null;
 async function withChangeBackup(result){if(result.store.backupPolicy==='change'){try{const backup=await store.createBackup('change');if(backup.external?.error)return {...result,backupWarning:'داده ثبت شد اما بک‌آپ خارجی ناموفق بود: '+backup.external.error};}catch(error){console.error('Backup failed:',error);return {...result,backupWarning:'داده در SQLite ذخیره شد اما بک‌آپ ناموفق بود.'}}}return result;}
 const server=http.createServer(async(req,res)=>{
  try{verify(req,server.address()?.port||PORT);const url=new URL(req.url||'/',`http://${req.headers.host}`);const path=url.pathname;
   if(path==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,database:'sqlite',databaseLocation:'Termux app-private storage'});
   if(path==='/api/audit'&&req.method==='GET')return send(res,200,{rows:store.db.prepare('SELECT revision,action,reason,at,detail FROM audit_actions ORDER BY revision DESC LIMIT 300').all()});
   if(path==='/api/obligation-adjust'&&req.method==='POST'){const x=await body(req);return send(res,200,await withChangeBackup(store.adjustObligation(x.memberId,x.period,x.newAmount,x.reason,x.expectedRevision)));}
   if(path==='/api/period-lock'&&req.method==='POST'){const x=await body(req);return send(res,200,await withChangeBackup(store.changeLock(x.period,x.locked,x.reason,x.expectedRevision)));}
   if(path==='/api/reverse'&&req.method==='POST'){const x=await body(req);return send(res,200,await withChangeBackup(store.reverseEvent(x.id,x.reason,x.expectedRevision,x.replacement||null)));}
   if(path==='/api/backups/external'&&req.method==='POST'){const x=await body(req);return send(res,201,await store.externalBackup(x.passphrase));}
   if(path==='/api/backups/external/restore'&&req.method==='POST'){const x=await body(req);return send(res,200,await store.restoreEncrypted(x.envelope,x.passphrase,x.expectedRevision));}
   if(path==='/api/travel'&&req.method==='GET')return send(res,200,store.getTravel());
   if(path==='/api/travel'&&req.method==='PUT'){const x=await body(req);return send(res,200,store.saveTravel(x.travel,x.expectedRevision))}
   if(path==='/api/travel/restore'&&req.method==='POST'){const x=await body(req);return send(res,200,store.saveTravel(x.travel,x.expectedRevision,{restore:true}))}
   if(path==='/api/travel/backups'&&req.method==='GET')return send(res,200,{items:store.listTravelBackups()});
   if(/^\/api\/travel\/backups\/\d+$/.test(path)&&req.method==='GET')return send(res,200,{travel:store.readTravelBackup(Number(path.split('/').at(-1)))});
   if(path==='/api/store'&&req.method==='GET')return send(res,200,store.get());
   if(path==='/api/store'&&req.method==='PUT'){
    const x=await body(req);if(!Number.isSafeInteger(x.expectedRevision))throw Error('شماره ویرایش نامعتبر است.');
    const result=await withChangeBackup(store.save(x.store,x.expectedRevision));return send(res,200,{revision:result.revision,...(result.backupWarning?{backupWarning:result.backupWarning}:{})});
   }
   if(path==='/api/backups'&&req.method==='GET')return send(res,200,{items:store.listBackups()});
   if(path==='/api/backups'&&req.method==='POST'){const x=await body(req);const result=await store.createBackup(x.reason||'manual');return send(res,201,result)}
   const match=path.match(/^\/api\/backups\/([0-9A-Za-z-]+)\/store$/);
   if(match&&req.method==='GET')return send(res,200,{store:await store.backupStore(match[1])});
   if(path==='/api/restore'&&req.method==='POST'){const x=await body(req);return send(res,200,await store.restore(x.store,x.expectedRevision))}
   if(path==='/api/export'&&req.method==='GET')return send(res,200,{format:'dang-backup',schema:3,exportedAt:new Date().toISOString(),store:store.get().store},{'content-disposition':`attachment; filename="dang-${new Date().toISOString().slice(0,10)}.json"`});
   if(path.startsWith('/api/'))return send(res,404,{error:'مسیر API یافت نشد.'});
   if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'متد مجاز نیست.'});
   await serveStatic(req,res,path);
  }catch(e){const status=e.status||(/نامعتبر|تکراری|مجاز نیست|سهم|ارجاع|پرداخت|شناسه|قسط|رویداد|بیشتر|قفل|ماه|بدهی|مانده|رمز|بک‌آپ|انتقال|اعتبار|ابطال|تعهد|تغییر|شخصی|صندوق/.test(e.message)?400:500);
   if(status===500)console.error(e);send(res,status,{error:status===500?'خطای داخلی سرور؛ گزارش Termux را بررسی کن.':e.message});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port||PORT,HOST,resolve)});
 timer=setInterval(()=>store.periodic().catch(e=>console.error('Automatic backup failed:',e)),60_000);timer.unref();
 await store.periodic().catch(e=>console.error('Initial backup failed:',e));
 const stop=()=>new Promise(resolve=>{clearInterval(timer);server.close(()=>{store.close();resolve()})});
 console.log(`دنگ SQLite: http://${HOST}:${server.address().port}`);console.log(`SQLite database: ${store.dbPath}`);console.log(`SQLite backups: ${store.backupDir}`);
 return {server,store,close:stop};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))startServer().catch(e=>{console.error(e);process.exit(1)});
