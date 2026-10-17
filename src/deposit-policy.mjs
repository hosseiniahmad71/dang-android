// Domain rules validated before every new deposit; legacy records are not rewritten.
import {project,persianMonth} from './native-ledger.mjs';
const offset=(p,delta)=>{const [y,m]=p.split('/').map(Number),idx=y*12+m-1+delta;return `${Math.floor(idx/12)}/${String(((idx%12)+12)%12+1).padStart(2,'0')}`};
const due=(s,active,memberId,p)=>{const member=s.members.find(x=>x.id===memberId);if(!member)return 0;const base=s.contributionOverrides[`${p}|${memberId}`]??(member.contributes?s.defaultContribution:0);const adj=active.filter(e=>e.kind==='obligationAdjust'&&e.memberId===memberId&&e.period===p).reduce((a,e)=>a+(e.direction==='increase'?e.amount:-e.amount),0);return base+adj;};
export function validateDepositBatch(store,batch,today){
 const periods=persianMonth(today),minPeriod=offset(periods,-1);
 const projection=project(store);const sums=new Map();const credits={...projection.credits};
 for(const e of batch){
  if(e.kind!=='deposit'||e.destinationId===undefined)continue; // Old v6 origin records remain valid.
  if(e.period<minPeriod)throw Error('دنگ فقط برای ماه قبل، ماه جاری یا ماه‌های آینده قابل تخصیص است.');
  if(e.period<store.startPeriod)throw Error('دوره قبل از شروع صندوق مجاز نیست.');
  if(e.date<today&&!e.creditOnly)throw Error('پرداخت با تاریخ گذشته صرفاً با هشدار و ثبت اعتبار بدون ورود وجه به صندوق مجاز است.');
  if(e.date>=today&&e.creditOnly)throw Error('اعتبار غیرنقدی مخصوص ثبت با تاریخ گذشته است.');
  if(e.destinationId!==undefined&&e.destinationId!==e.accountId)throw Error('حساب مقصد واریز یکسان نیست.');
  const account=store.accounts.find(a=>a.id===e.accountId);
  if(e.destinationId!==undefined&&(!account||!(account.kind==='fund'||account.kind==='personal'||account.kind==='other')))throw Error('حساب مقصد واریز نامعتبر است.');
  const key=`${e.period}|${e.memberId}`;sums.set(key,(sums.get(key)||0)+e.amount);
 }
 for(const [key,amount] of [...sums].sort(([a],[b])=>a.localeCompare(b))){
  const pos=key.lastIndexOf('|'),period=key.slice(0,pos),memberId=key.slice(pos+1);
  const obligation=due(store,projection.active,memberId,period);
  const outstanding=obligation-(projection.waivers[key]||0)-(credits[key]||0);
  if(outstanding<=0)throw Error('دنگ این عضو در این ماه قبلاً تسویه شده است؛ ماه بعد را انتخاب کنید.');
  if(amount>outstanding)throw Error('مبلغ واریز از بدهی باقی‌مانده بیشتر است؛ پرداخت ماه بعد را جدا ثبت کنید.');
  for(let previous=store.startPeriod;previous<period;previous=offset(previous,1)){
   const k=`${previous}|${memberId}`;
   if(due(store,projection.active,memberId,previous)-(projection.waivers[k]||0)-(credits[k]||0)>0)throw Error('برای پرداخت ماه بعد، ابتدا دنگ ماه‌های قبلی این عضو را کامل تسویه کنید.');
  }
  credits[key]=(credits[key]||0)+amount;
 }
 return true;
}