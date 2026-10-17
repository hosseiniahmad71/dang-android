// Android-only accounting domain. Keeps the same validation/projection rules as the
// Termux server. SQLite I/O is performed exclusively by the native Java bridge.
import {validateStore} from './native-validate.mjs';
import {project,eventMonths,persianMonth,monthStart} from './native-ledger.mjs';

const bad=m=>{throw Error(m)};
const copied=x=>structuredClone(x);
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const strip=s=>String(s||'').trim();

export function validateTransition(current,next,{restore=false,systemAction=''}={}){
 validateStore(next);project(next);
 if(restore)return next;
 if(!eq(next.closedPeriods??[],current.closedPeriods??[])&&!['lock','unlock'].includes(systemAction))bad('قفل ماه فقط از مسیر اختصاصی قفل/بازگشایی قابل تغییر است.');
 if(current.events.length&&next.openingBalance!==current.openingBalance)bad('موجودی افتتاحیه بعد از ثبت تراکنش قابل بازنویسی نیست.');
 const touched=new Set(current.events.flatMap(eventMonths));
 for(const p of current.closedPeriods||[])touched.add(p);
 for(const p of touched)for(const m of current.members){
  const amount=s=>s.contributionOverrides[`${p}|${m.id}`]??(s.members.find(x=>x.id===m.id)?.contributes?s.defaultContribution:0);
  if(amount(current)!==amount(next))bad('تغییر تعهد دوره دارای سابقه مجاز نیست؛ از سند اصلاحی استفاده کنید.');
 }
 const beforeIds=new Set(current.events.map(e=>e.id));
 const nextIds=new Set(next.events.map(e=>e.id));
 const renames=(before,after)=>{
  const changes=new Map();if(before.length!==after.length)return changes;
  for(let i=0;i<before.length;i++)if(before[i]!==after[i]){
   if(before.includes(after[i])||after.includes(before[i]))return new Map();
   changes.set(before[i],after[i]);
  }
  return changes;
 };
 const categoryRenames=renames(current.categories,next.categories);
 const providerRenames=renames(current.providers,next.providers);
 if(nextIds.size!==next.events.length)bad('شناسه رویداد مالی تکراری است.');
 for(const old of current.events){
  const same=next.events.find(e=>e.id===old.id);if(!same)bad('حذف رویداد مالی ثبت‌شده مجاز نیست.');
  const expected=old.kind==='purchase'?{...old,category:categoryRenames.get(old.category)||old.category}:old;
  if(!eq(expected,same))bad('تغییر رویداد مالی قبلی مجاز نیست.');
 }
 const newlyAdded=next.events.filter(e=>!beforeIds.has(e.id));
 if(systemAction!=='obligation-adjust'&&newlyAdded.some(e=>e.kind==='obligationAdjust'))bad('تعدیل تعهد فقط از مسیر حسابرسی‌شده مجاز است.');
 if(systemAction==='obligation-adjust'&&newlyAdded.filter(e=>e.kind==='obligationAdjust').length!==1)bad('تعدیل تعهد نامعتبر است.');
 if(systemAction!=='reverse'&&newlyAdded.some(e=>e.kind==='reversal'))bad('ابطال فقط از مسیر ثبت سند برگشتی مجاز است.');
 if(systemAction==='reverse'&&newlyAdded.filter(e=>e.kind==='reversal').length!==1)bad('سند برگشت نامعتبر است.');
 for(const e of newlyAdded)if((current.closedPeriods||[]).some(p=>eventMonths(e).includes(p)))bad('ماه مالی قفل است؛ برای تغییر ابتدا آن را با دلیل باز کنید.');
 for(const p of next.plans.filter(p=>!current.plans.some(x=>x.id===p.id))){
  if((current.closedPeriods||[]).some(x=>x===persianMonth(p.createdDate)||p.installments.some(i=>persianMonth(i.dueDate)===x)))bad('ثبت قرارداد در ماه بسته مجاز نیست.');
  if(p.installments.some(i=>i.dueDate<p.createdDate))bad('سررسید قسط پیش از تاریخ خرید معتبر نیست.');
 }
 if(next.plans.length<current.plans.length)bad('قرارداد قبلی قابل حذف نیست.');
 for(const old of current.plans){
  const p=next.plans.find(x=>x.id===old.id);if(!p)bad('حذف قرارداد اقساطی مجاز نیست.');
  const expected={...old,category:categoryRenames.get(old.category)||old.category,provider:providerRenames.get(old.provider)||old.provider};
  if(!eq(expected,p))bad('تغییر قرارداد قبلی مجاز نیست.');
 }
 return next;
}

export function createNativeRuntime(invoke,initialStore){
 function call(op,data={}){
  const result=invoke({op,...data});
  if(!result||result.ok!==true)bad(result?.error||'ارتباط با SQLite اندروید ناموفق بود.');
  return result.value;
 }
 function get(){let x=call('get');if(x===null){call('init',{store:initialStore});x=call('get')}return x}
 function commit(next,expectedRevision,options={}){
  const current=get();if(expectedRevision!==current.revision)bad('اطلاعات قدیمی است؛ برنامه را مجدداً بارگذاری کنید.');
  validateTransition(current.store,next,options);
  return call('commit',{store:next,expectedRevision,...options});
 }
 function writeSnapshot(reason){return call('backup',{reason});}
 async function request(url,method='GET',x={}){
  if(url==='/api/store'&&method==='GET')return get();
  if(url==='/api/store'&&method==='PUT')return commit(x.store,x.expectedRevision);
  if(url==='/api/backups'&&method==='GET')return {items:call('list')};
  if(url==='/api/backups'&&method==='POST')return writeSnapshot(x.reason||'manual');
  if(/^\/api\/backups\/[^/]+\/store$/.test(url)&&method==='GET')return {store:call('read',{id:decodeURIComponent(url.split('/')[3])}).store};
  if(url==='/api/restore'&&method==='POST'){
   const current=get();if(current.revision!==x.expectedRevision)bad('نسخه داده تغییر کرده است.');
   writeSnapshot('before-restore');const result=commit(x.store,x.expectedRevision,{restore:true,systemAction:'restore',reason:'restore'});writeSnapshot('after-restore');return result;
  }
  if(url==='/api/period-lock'&&method==='POST'){
   const {period,locked,reason,expectedRevision}=x;
   if(!/^\d{4}\/(0[1-9]|1[0-2])$/.test(period)||strip(reason).length<8)bad('ماه یا دلیل قفل نامعتبر است.');
   const {store}=get();if(store.closedPeriods.includes(period)===locked)bad('این ماه از قبل در همین وضعیت است.');
   const next=copied(store);next.closedPeriods=locked?[...next.closedPeriods,period].sort():next.closedPeriods.filter(p=>p!==period);
   return commit(next,expectedRevision,{systemAction:locked?'lock':'unlock',reason});
  }
  if(url==='/api/reverse'&&method==='POST'){
   const {id,reason,replacement,expectedRevision}=x;
   if(strip(reason).length<8)bad('دلیل اصلاح یا ابطال حداقل ۸ نویسه باشد.');
   const {store}=get(),original=store.events.find(e=>e.id===id&&e.kind!=='reversal');
   if(!original)bad('سند اصلی پیدا نشد.');
   if(store.events.some(e=>e.kind==='reversal'&&e.originalId===id))bad('این سند قبلاً ابطال شده است.');
   if(store.closedPeriods.some(p=>eventMonths(original).includes(p)))bad('ماه این سند قفل است.');
   const next=copied(store);next.events.push({id:crypto.randomUUID(),kind:'reversal',date:original.date,amount:0,originalId:id,reason,recordedAt:new Date().toISOString(),description:reason});
   if(replacement){if(replacement.id===id||replacement.kind==='reversal')bad('سند جایگزین نامعتبر است.');next.events.push(replacement)}
   return commit(next,expectedRevision,{systemAction:'reverse',reason});
  }
  if(url==='/api/obligation-adjust'&&method==='POST'){
   const {memberId,period,newAmount,reason,expectedRevision}=x;
   if(!/^\d{4}\/(0[1-9]|1[0-2])$/.test(period)||!Number.isSafeInteger(newAmount)||newAmount<0||strip(reason).length<8)bad('مبلغ، ماه یا دلیل اصلاح نامعتبر است.');
   const {store}=get();if(!store.members.some(m=>m.id===memberId))bad('عضو پیدا نشد.');
   if(store.closedPeriods.includes(period))bad('ماه قفل است.');
   const base=store.contributionOverrides[`${period}|${memberId}`]??(store.members.find(m=>m.id===memberId).contributes?store.defaultContribution:0);
   const reversals=new Set(store.events.filter(e=>e.kind==='reversal').map(e=>e.originalId));
   const adjustment=store.events.filter(e=>e.kind==='obligationAdjust'&&e.memberId===memberId&&e.period===period&&!reversals.has(e.id)).reduce((a,e)=>a+(e.direction==='increase'?e.amount:-e.amount),0);
   const previous=base+adjustment;if(newAmount===previous)bad('مبلغ جدید همان تعهد قبلی است.');
   const next=copied(store);next.events.push({id:crypto.randomUUID(),kind:'obligationAdjust',date:monthStart(period),amount:Math.abs(newAmount-previous),direction:newAmount>previous?'increase':'decrease',memberId,period,reason,recordedAt:new Date().toISOString(),description:reason});
   return commit(next,expectedRevision,{systemAction:'obligation-adjust',reason});
  }
  bad('عملیات بومی اندروید پشتیبانی نمی‌شود: '+url);
 }
 return {request,call,get,commit};
}
