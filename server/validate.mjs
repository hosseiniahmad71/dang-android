const positive=n=>Number.isSafeInteger(n)&&n>0&&n<=Math.floor(Number.MAX_SAFE_INTEGER/10);
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0&&n<=Math.floor(Number.MAX_SAFE_INTEGER/10);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const name=x=>typeof x==='string'&&x.trim().length>0&&x.length<=120;
const id=x=>typeof x==='string'&&x.length>0&&x.length<=128;
const day=x=>{if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const [y,m,d]=x.split('-').map(Number);const check=new Date(Date.UTC(y,m-1,d));return check.getUTCFullYear()===y&&check.getUTCMonth()+1===m&&check.getUTCDate()===d;};
const month=x=>typeof x==='string'&&/^\d{4}\/(0[1-9]|1[0-2])$/.test(x);
const uniq=a=>new Set(a).size===a.length;
function requireGood(test,message){if(!test)throw new Error(message)}
export function validateStore(raw){
 requireGood(obj(raw)&&raw.version===3,'نسخه داده ناسازگار است. ابتدا فایل نسخه ۳ را بازیابی کن.');
 requireGood(raw.closedPeriods===undefined||(Array.isArray(raw.closedPeriods)&&raw.closedPeriods.every(month)&&uniq(raw.closedPeriods)),'ماه‌های قفل‌شده نامعتبرند.');
 for(const prop of ['members','accounts','categories','providers','plans','events','archivedMembers','archivedAccounts','archivedCategories','archivedProviders'])requireGood(Array.isArray(raw[prop]),'ساختار '+prop+' نامعتبر است.');
 requireGood(raw.members.length<=250&&raw.accounts.length<=500&&raw.categories.length<=1000&&raw.plans.length<=20000&&raw.events.length<=200000,'حداکثر اندازه اطلاعات مجاز نیست.');
 requireGood(obj(raw.contributionOverrides),'تنظیمات دنگ ماهانه نامعتبر است.');
 requireGood(nonnegative(raw.openingBalance)&&nonnegative(raw.defaultContribution),'مبلغ افتتاحیه یا دنگ پیش‌فرض نامعتبر است.');
 requireGood(month(raw.startPeriod)&&raw.startPeriod>='1405/07','ماه شروع باید مهر ۱۴۰۵ یا بعد از آن باشد.');
 requireGood(['change','hourly','daily','off'].includes(raw.backupPolicy),'تنظیم بک‌آپ نامعتبر است.');
 requireGood(typeof raw.googleClientId==='string'&&raw.googleClientId.length<=300,'شناسه گوگل نامعتبر است.');
 requireGood(raw.members.every(m=>obj(m)&&id(m.id)&&name(m.name)&&typeof m.contributes==='boolean')&&uniq(raw.members.map(m=>m.id)),'اعضای خانواده نامعتبر یا تکراری‌اند.');
 const memberIds=new Set(raw.members.map(m=>m.id));
 requireGood(raw.accounts.every(a=>obj(a)&&id(a.id)&&name(a.name)&&['fund','personal','other'].includes(a.kind)&&(!a.ownerId||memberIds.has(a.ownerId)))&&uniq(raw.accounts.map(a=>a.id)),'حساب‌های بانکی نامعتبرند.');
 requireGood(raw.accounts.filter(a=>a.id==='fund'&&a.kind==='fund').length===1,'صندوق اصلی باید وجود داشته باشد.');
 const accountIds=new Set(raw.accounts.map(a=>a.id));
 requireGood(raw.categories.every(name)&&uniq(raw.categories)&&raw.providers.every(name)&&uniq(raw.providers),'دسته‌بندی یا سرویس تکراری یا نامعتبر است.');
 const categories=new Set(raw.categories),providers=new Set(raw.providers);
 for(const [key,value] of Object.entries(raw.contributionOverrides))requireGood(/^\d{4}\/(0[1-9]|1[0-2])\|[^|]+$/.test(key)&&memberIds.has(key.split('|')[1])&&nonnegative(value),'دنگ اختصاصی ماه نامعتبر است.');
 for(const [key,list,valid] of [['archivedMembers',raw.archivedMembers,memberIds],['archivedAccounts',raw.archivedAccounts,accountIds],['archivedCategories',raw.archivedCategories,categories],['archivedProviders',raw.archivedProviders,providers]])requireGood(list.every(x=>typeof x==='string'&&valid.has(x))&&uniq(list),'مقادیر بایگانی '+key+' نامعتبرند.');
 const planIds=[],installmentIds=[];const amounts=new Map();
 for(const p of raw.plans){
  requireGood(obj(p)&&id(p.id)&&name(p.title)&&providers.has(p.provider)&&memberIds.has(p.creditOwnerId)&&categories.has(p.category)&&day(p.createdDate)&&positive(p.total)&&Array.isArray(p.installments)&&p.installments.length>0&&p.installments.length<=120,'قرارداد اقساطی نامعتبر است.');
  planIds.push(p.id);let sum=0;
  for(const i of p.installments){requireGood(obj(i)&&id(i.id)&&day(i.dueDate)&&positive(i.amount),'قسط نامعتبر است.');sum+=i.amount;installmentIds.push(i.id);amounts.set(i.id,i.amount)}
  requireGood(sum===p.total,'جمع اقساط با قرارداد برابر نیست.');
 }
 requireGood(uniq(planIds)&&uniq(installmentIds),'شناسه تکراری اقساط یا قرارداد.');
 const paymentSums=new Map(),eventIds=[];
 for(const e of raw.events){
  requireGood(obj(e)&&id(e.id)&&day(e.date)&&((e.kind==='reversal'&&e.amount===0)||positive(e.amount))&&typeof e.description==='string'&&e.description.length<=2000,'رویداد مالی نامعتبر است.');eventIds.push(e.id);
  switch(e.kind){
   case 'obligationAdjust':requireGood(memberIds.has(e.memberId)&&month(e.period)&&['increase','decrease'].includes(e.direction)&&name(e.reason)&&e.reason.length>=8,'سند تعدیل تعهد نامعتبر است.');break;
   case 'reversal':requireGood(id(e.originalId)&&name(e.reason)&&e.reason.length<=1000&&typeof e.recordedAt==='string','سند برگشت نامعتبر است.');break;
   case 'purchase':requireGood((e.fundedBy===undefined||['fund','personal'].includes(e.fundedBy))&&accountIds.has(e.accountId)&&categories.has(e.category)&&month(e.creditPeriod)&& (e.accountId==='fund'||e.fundedBy==='fund'||memberIds.has(e.paidById)),'خرید دارای ارجاع نامعتبر است.');break;
   case 'deposit':requireGood(memberIds.has(e.memberId)&&accountIds.has(e.accountId)&&month(e.period)&&
     (e.creditOnly===undefined||typeof e.creditOnly==='boolean')&&
     (e.destinationId===undefined?(e.accountId!=='fund'):(e.destinationId===e.accountId)),
     'واریز دنگ یا حساب مقصد نامعتبر است.');break;
   case 'payment':requireGood((e.fundedBy===undefined||['fund','personal'].includes(e.fundedBy))&&amounts.has(e.installmentId)&&accountIds.has(e.accountId)&&month(e.creditPeriod)&&(e.accountId==='fund'||e.fundedBy==='fund'||memberIds.has(e.paidById)),'پرداخت قسط نامعتبر است.');paymentSums.set(e.installmentId,(paymentSums.get(e.installmentId)||0)+e.amount);break;
   case 'transfer':requireGood(accountIds.has(e.accountId)&&accountIds.has(e.destinationId)&&e.accountId!==e.destinationId,'انتقال وجه نامعتبر است.');break;
   case 'waiver':case 'refund':requireGood(memberIds.has(e.memberId)&&month(e.period)&&(e.kind!=='refund'||!e.accountId||accountIds.has(e.accountId)),'تسویه یا بخشودگی نامعتبر است.');break;
   case 'creditMove':requireGood(memberIds.has(e.memberId)&&month(e.sourcePeriod)&&month(e.targetPeriod)&&e.sourcePeriod!==e.targetPeriod,'انتقال اعتبار نامعتبر است.');break;
   default:throw new Error('نوع رویداد مالی ناشناخته است.');
  }
 }
 requireGood(uniq(eventIds),'شناسه تراکنش مالی تکراری است.');
 const reversed=new Set(raw.events.filter(e=>e.kind==='reversal').map(e=>e.originalId));
 requireGood(reversed.size===raw.events.filter(e=>e.kind==='reversal').length,'سند برگشت تکراری است.');
 for(const id of reversed)requireGood(raw.events.some(e=>e.id===id&&e.kind!=='reversal'),'ارجاع برگشت نامعتبر است.');
 const realPaid=new Map();for(const e of raw.events)if(e.kind==='payment'&&!reversed.has(e.id))realPaid.set(e.installmentId,(realPaid.get(e.installmentId)||0)+e.amount);
 for(const [inst,paid] of realPaid)requireGood(paid<=amounts.get(inst),'پرداخت مجموع اقساط از مبلغ قرارداد بیشتر است.');
 return raw;
}