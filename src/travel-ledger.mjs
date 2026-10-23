// Dong Travel is a separate, versioned accounting domain. No household Store/periods/accounts.
export const TRAVEL_CATEGORIES=Object.freeze(['اقامتگاه','بنزین','عوارضی','سوپری','نهار','شام','صبحانه','تفریحات','کافه','بستنی','نوشیدنی','دخانیات','قلیون']);
export const EMPTY_TRAVEL=Object.freeze({version:1,trips:[]});
const bad=message=>{throw Error(message)};
const text=(x,max=140)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const id=x=>text(x,128);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const sum=a=>a.reduce((n,x)=>n+x,0);
const amount=n=>Number.isSafeInteger(n)&&n>0&&n<=900_000_000_000_000;
const unique=a=>new Set(a).size===a.length;
export function validateTravel(state){
 if(!state||typeof state!=='object'||state.version!==1||!Array.isArray(state.trips)||state.trips.length>300)bad('اطلاعات دنگ سفر معتبر نیست.');
 if(!unique(state.trips.map(t=>t.id)))bad('شناسه سفر تکراری است.');
 for(const trip of state.trips){
  if(!id(trip.id)||!text(trip.name)||!['friends','family'].includes(trip.kind)||!date(trip.date)||!Array.isArray(trip.participants)||trip.participants.length<2||trip.participants.length>100||!Array.isArray(trip.expenses)||!Array.isArray(trip.settlements)||trip.expenses.length>30000||trip.settlements.length>30000)bad('مشخصات سفر نامعتبر است.');
  const participants=trip.participants;
  if(!participants.every(p=>p&&id(p.id)&&text(p.name,80))||!unique(participants.map(p=>p.id)))bad('اعضای سفر تکراری یا نامعتبرند.');
  const members=new Set(participants.map(p=>p.id));
  if(!unique([...trip.expenses,...trip.settlements].map(x=>x.id)))bad('شناسه سند تکراری است.');
  for(const e of trip.expenses){
   if(!e||!id(e.id)||!date(e.date)||!amount(e.amount)||!TRAVEL_CATEGORIES.includes(e.category)||!members.has(e.paidBy)||!Array.isArray(e.forMembers)||e.forMembers.length<1||!unique(e.forMembers)||!e.forMembers.every(m=>members.has(m))||typeof e.note!=='string'||e.note.length>500)bad('خرج سفر نامعتبر است.');
  }
  const balance=Object.fromEntries(participants.map(p=>[p.id,0]));
  for(const e of trip.expenses){
   balance[e.paidBy]+=e.amount;
   const share=Math.floor(e.amount/e.forMembers.length),rem=e.amount%e.forMembers.length;
   e.forMembers.forEach((m,i)=>{balance[m]-=share+(i<rem?1:0)});
  }
  for(const s of trip.settlements){
   if(!s||!id(s.id)||!date(s.date)||!amount(s.amount)||!members.has(s.from)||!members.has(s.to)||s.from===s.to||typeof s.note!=='string'||s.note.length>500)bad('تسویه سفر نامعتبر است.');
   if(balance[s.from]>=0||balance[s.to]<=0||s.amount>Math.min(-balance[s.from],balance[s.to]))bad('تسویه بیشتر از بدهی یا طلب واقعی سفر است.');
   balance[s.from]+=s.amount;balance[s.to]-=s.amount;
  }
  if(sum(Object.values(balance))!==0)bad('محاسبات سهم سفر تراز نیست.');
 }
 return state;
}
export function summarizeTrip(trip){
 validateTravel({version:1,trips:[trip]});
 const balance=Object.fromEntries(trip.participants.map(p=>[p.id,0]));
 const totals=Object.fromEntries(TRAVEL_CATEGORIES.map(category=>[category,0]));
 for(const e of trip.expenses){
  totals[e.category]+=e.amount;balance[e.paidBy]+=e.amount;
  const share=Math.floor(e.amount/e.forMembers.length),rem=e.amount%e.forMembers.length;
  e.forMembers.forEach((m,i)=>{balance[m]-=share+(i<rem?1:0)});
 }
 for(const s of trip.settlements){balance[s.from]+=s.amount;balance[s.to]-=s.amount;}
 const debts=Object.entries(balance).filter(([,n])=>n<0).map(([id,n])=>({id,amount:-n}));
 const credits=Object.entries(balance).filter(([,n])=>n>0).map(([id,n])=>({id,amount:n}));
 const suggested=[];
 for(const debtor of debts)for(const creditor of credits){const value=Math.min(debtor.amount,creditor.amount);if(value>0){suggested.push({from:debtor.id,to:creditor.id,amount:value});debtor.amount-=value;creditor.amount-=value;}}
 return {total:sum(trip.expenses.map(e=>e.amount)),totals,balance,remaining:sum(Object.values(balance).filter(x=>x>0)),suggested};
}
export function validateTravelChange(before,next){
 validateTravel(before);validateTravel(next);
 for(const old of before.trips){
  const updated=next.trips.find(x=>x.id===old.id);
  if(!updated)bad('حذف سفر دارای سابقه مجاز نیست؛ پشتیبان بگیر.');
  if(updated.name!==old.name||updated.kind!==old.kind||updated.date!==old.date||JSON.stringify(updated.participants.slice(0,old.participants.length))!==JSON.stringify(old.participants))bad('مشخصات یا اعضای قبلی سفر را نمی‌توان بازنویسی کرد.');
  for(const field of ['expenses','settlements'])for(const record of old[field]){
   const row=updated[field].find(x=>x.id===record.id);
   if(!row||JSON.stringify(row)!==JSON.stringify(record))bad('اسناد خرج و تسویه سفر حذف یا بازنویسی نمی‌شوند.');
  }
 }
 return next;
}
