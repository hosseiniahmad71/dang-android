// Default provider policies; all dates are Jalali calendar dates in ISO representation.
// TARA: 2 equal payments on the same Jalali day in the next two months.
// Snappay/Digipay 4: 1/4 immediately, remaining on first day of 3 following months.
// Snappay/Digipay 1: single deferred payment on first day of next Jalali month.
import {persianMonth,monthStart} from './native-ledger.mjs';

export const providerRule=(provider,count)=>{
 const n=String(provider).replace(/[\s\u200c\u200d\-]/g,'').replace(/ي/g,'ی');
 if(n.includes('تارا'))return 'tara-two';
 if(n.includes('اسنپپی')||n.includes('دیجیپی'))return Number(count)===1?'pay-next-month':'four-with-downpayment';
 return 'custom';
};
export const recommendedCount=provider=>providerRule(provider,2)==='tara-two'?2:
  providerRule(provider,4)==='four-with-downpayment'?4:4;
const monthOffset=(period,delta)=>{const [year,month]=period.split('/').map(Number);const index=year*12+(month-1)+delta;return `${Math.floor(index/12)}/${String(((index%12)+12)%12+1).padStart(2,'0')}`};
const isoDay=(date)=>Number(new Intl.DateTimeFormat('en-US-u-ca-persian',{day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')));
const dateOf=(period,day)=>{const start=monthStart(period);const next=monthStart(monthOffset(period,1));const max=Math.round((Date.parse(next+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000);return new Date(Date.parse(start+'T00:00:00Z')+(Math.min(day,max)-1)*86400000).toISOString().slice(0,10)};
export function buildProviderSchedule({provider,count,total,purchaseDate,firstDue,createId=(i)=>String(i+1)}){
 const n=Number(count);if(!Number.isSafeInteger(total)||total<=0||!Number.isInteger(n)||n<1||n>36||total<n)throw Error('مبلغ و تعداد اقساط معتبر نیست.');
 const policy=providerRule(provider,n);
 if(policy==='tara-two'&&n!==2)throw Error('تارا پیش‌فرض دو قسط دارد.');
 if(policy==='four-with-downpayment'&&n!==4)throw Error('پرداخت چهارمرحله‌ای به چهار قسط نیاز دارد.');
 if(policy==='pay-next-month'&&n!==1)throw Error('تسویه یک‌قسطه باید یک قسط داشته باشد.');
 const startPeriod=persianMonth(purchaseDate),sameDay=isoDay(purchaseDate);
 const base=Math.floor(total/n),remainder=total-base*n;
 return Array.from({length:n},(_,i)=>{
  let dueDate;
  if(policy==='tara-two')dueDate=dateOf(monthOffset(startPeriod,i+1),sameDay);
  else if(policy==='four-with-downpayment')dueDate=i===0?purchaseDate:monthStart(monthOffset(startPeriod,i));
  else if(policy==='pay-next-month')dueDate=monthStart(monthOffset(startPeriod,1));
  else {const first=firstDue||purchaseDate;dueDate=dateOf(monthOffset(persianMonth(first),i),isoDay(first));}
  return {id:createId(i),dueDate,amount:base+(i===n-1?remainder:0)};
 });
}