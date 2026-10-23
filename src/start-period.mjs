// Shared Android/Termux release invariant: changing the opening accounting month
// never silently hides existing immutable financial records or month settings.
import {eventMonths,persianMonth} from './native-ledger.mjs';
export const FIRST_ALLOWED_PERIOD='1405/07';
export function assertStartPeriodChange(current,proposed){
 if(typeof proposed!=='string'||!/^\d{4}\/(0[1-9]|1[0-2])$/.test(proposed)||proposed<FIRST_ALLOWED_PERIOD)
  throw Error('شروع دنگ باید از مهر ۱۴۰۵ یا ماه‌های بعد باشد.');
 if(proposed===current.startPeriod)return proposed;
 const referenced=[
  ...current.events.flatMap(eventMonths),
  ...current.plans.flatMap(p=>[persianMonth(p.createdDate),...p.installments.map(i=>persianMonth(i.dueDate))]),
  ...current.closedPeriods,
  ...Object.keys(current.contributionOverrides).map(k=>k.split('|')[0])
 ];
 const older=referenced.filter(p=>p<proposed).sort()[0];
 if(older)throw Error('تغییر شروع دنگ به '+proposed+' ممکن نیست: در '+older+' سند، قسط، تنظیم دنگ یا ماه قفل‌شده وجود دارد. داده‌های قبلی حذف نمی‌شوند.');
 return proposed;
}
