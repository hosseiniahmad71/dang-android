export const MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const persianCalendar = new Intl.DateTimeFormat('en-US-u-ca-persian', {year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
export function jalaliParts(iso:string):{year:number,month:number,day:number}{
  const date = new Date(`${iso}T12:00:00.000Z`);
  if(!Number.isFinite(date.getTime())) return {year:1405,month:7,day:1};
  const parts=persianCalendar.formatToParts(date);
  const get=(name:string)=>Number(parts.find(p=>p.type===name)?.value||0);
  return {year:get('year'),month:get('month'),day:get('day')};
}
export function jalaliKey(iso:string){const p=jalaliParts(iso);return `${p.year}/${String(p.month).padStart(2,'0')}`}
export function jalaliLabel(iso:string){const p=jalaliParts(iso);return `${p.day.toLocaleString('fa-IR')} ${MONTHS[p.month-1]} ${p.year.toLocaleString('fa-IR')}`}
export function monthLabel(key:string){const [y,m]=key.split('/').map(Number);return `${MONTHS[m-1]||'ماه نامعتبر'} ${y.toLocaleString('fa-IR')}`}
export function offsetMonth(key:string,delta:number){const [y,m]=key.split('/').map(Number);let index=y*12+(m-1)+delta;return `${Math.floor(index/12)}/${String(((index%12)+12)%12+1).padStart(2,'0')}`}
export function parseMonthKey(key:string){const [y,m]=key.split('/').map(Number);return y*12+m}
export function toIsoFromJalali(year:number,month:number,day:number=1){
  // Monotonic search avoids platform-specific Gregorian/Jalali conversion packages.
  let lo=Date.UTC(year+620,0,1,12),hi=Date.UTC(year+623,0,1,12);
  const target=year*12+month;
  while(lo<hi){const mid=Math.floor((lo+hi)/(2*86400000))*86400000; const iso=new Date(mid).toISOString().slice(0,10);const p=jalaliParts(iso);const index=p.year*12+p.month;
    if(index<target)lo=mid+86400000;else hi=mid;
  }
  const d=new Date(lo+(day-1)*86400000);return d.toISOString().slice(0,10);
}
export function daysInJalaliMonth(year:number,month:number){const key=`${year}/${String(month).padStart(2,'0')}`;const next=offsetMonth(key,1);const [ny,nm]=next.split('/').map(Number);return Math.round((Date.parse(`${toIsoFromJalali(ny,nm)}T12:00:00Z`)-Date.parse(`${toIsoFromJalali(year,month)}T12:00:00Z`))/86400000)}
export function currentIso(){return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tehran'}).format(new Date())}
export function fnum(n:number){return Number.isFinite(n)?new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0}).format(n):'۰'}
export const digitsToEnglish=(s:string)=>s.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
export const parseToman=(s:string)=>{const t=digitsToEnglish(s).replace(/[\s,٬،]/g,'');return /^\d+$/.test(t)?Number(t):NaN};
const units=['','یک','دو','سه','چهار','پنج','شش','هفت','هشت','نه'];
const teens=['ده','یازده','دوازده','سیزده','چهارده','پانزده','شانزده','هفده','هجده','نوزده'];
const tens=['','','بیست','سی','چهل','پنجاه','شصت','هفتاد','هشتاد','نود'];
const hundreds=['','صد','دویست','سیصد','چهارصد','پانصد','ششصد','هفتصد','هشتصد','نهصد'];
function triple(n:number){const a:string[]=[];const h=Math.floor(n/100);if(h)a.push(hundreds[h]);const r=n%100;if(r>=10&&r<20)a.push(teens[r-10]);else{if(r>=20)a.push(tens[Math.floor(r/10)]);if(r%10)a.push(units[r%10]);}return a.join(' و ')}
export function numberWords(n:number){if(!Number.isSafeInteger(n)||n<0)return 'عدد نامعتبر';if(n===0)return 'صفر';const scales=['','هزار','میلیون','میلیارد','هزار میلیارد'];const parts:string[]=[];let i=0;while(n>0){const group=n%1000;if(group)parts.unshift([triple(group),scales[i]].filter(Boolean).join(' '));n=Math.floor(n/1000);i++}return parts.join(' و ')}
export const tomanWords=(n:number)=>`${numberWords(n)} تومان`;
export function safeToman(n:number){return Number.isSafeInteger(n)&&n>0&&n<=900_000_000_000_000}
