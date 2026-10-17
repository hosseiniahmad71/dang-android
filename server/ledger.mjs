// Centralized chronological projection. Reversal events never contribute monetary values;
// instead, their originals are excluded. All outputs are derived, never trusted from UI.
export const persianMonth = iso => {
 const parts = new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).formatToParts(new Date(iso+'T12:00:00Z'));
 const value = k => Number(parts.find(x=>x.type===k).value);
 return `${value('year')}/${String(value('month')).padStart(2,'0')}`;
};
export function monthStart(period){const year=Number(period.split('/')[0]);const start=Date.UTC(year+621,0,1);for(let i=0;i<370;i++){const day=new Date(start+i*86400000).toISOString().slice(0,10);if(persianMonth(day)===period)return day;}throw Error('ماه شمسی خارج از محدوده قابل تبدیل است.');}
export const eventMonths = e => {
 const months=[persianMonth(e.date)];
 for(const k of ['period','creditPeriod','sourcePeriod','targetPeriod'])if(e[k])months.push(e[k]);
 return [...new Set(months)];
};
export function effectiveEvents(events){
 const reversals=events.filter(e=>e.kind==='reversal');
 const ids=new Set(events.map(e=>e.id));const reversed=new Set();
 for(const r of reversals){
  if(!ids.has(r.originalId)||reversed.has(r.originalId))throw Error('سند برگشتی تکراری یا بدون مرجع است.');
  if(!r.reason?.trim())throw Error('دلیل ابطال الزامی است.');
  const original=events.find(e=>e.id===r.originalId);
  if(original.kind==='reversal')throw Error('ابطال سند برگشتی مجاز نیست.');
  reversed.add(r.originalId);
 }
 return events.filter(e=>e.kind!=='reversal'&&!reversed.has(e.id));
}
export function fundDelta(e){switch(e.kind){case 'deposit':return e.amount;case 'refund':return -e.amount;case 'purchase':case 'payment':return e.accountId==='fund'?-e.amount:0;case 'transfer':return (e.destinationId==='fund'?e.amount:0)-(e.accountId==='fund'?e.amount:0);default:return 0}}
export function project(store){
 const evs=effectiveEvents(store.events).map((e,i)=>({e,i})).sort((a,b)=>a.e.date.localeCompare(b.e.date)||a.i-b.i).map(x=>x.e);
 const custody=new Map(),credits=new Map(),waivers=new Map(),cashflow=[];
 const get=(map,k)=>map.get(k)||0,add=(map,k,n)=>map.set(k,get(map,k)+n);
 let fund=store.openingBalance;
 const obligation=(m,p)=>{const member=store.members.find(x=>x.id===m);if(!member||p<store.startPeriod)return 0;const base=store.contributionOverrides[`${p}|${m}`]??(member.contributes?store.defaultContribution:0);const adjustments=evs.filter(x=>x.kind==='obligationAdjust'&&x.memberId===m&&x.period===p).reduce((a,x)=>a+(x.direction==='increase'?x.amount:-x.amount),0);const result=base+adjustments;if(!Number.isSafeInteger(result)||result<0)throw Error('تعدیل دنگ، تعهد ماه را منفی یا نامعتبر می‌کند.');return result;};
 for(const e of evs){
  const key=(m,p)=>`${p}|${m}`;
  if(['purchase','payment'].includes(e.kind)&&e.accountId!=='fund'){
   const reserved=get(custody,e.accountId);
   const funding=e.fundedBy||(reserved>=e.amount?'fund':'personal'); // legacy read compatibility only
   if(funding==='fund'){
    if(reserved<e.amount)throw Error('خرید از پول صندوقِ منتقل‌شده بیش از مانده امانی کارت است.');
    add(custody,e.accountId,-e.amount);
   }else{
    if(reserved!==0)throw Error('پول صندوق و شخصی در کارت مخلوط است. ابتدا وجه امانی را تعیین تکلیف کنید.');
    const acct=store.accounts.find(a=>a.id===e.accountId);
    if(!acct||acct.kind!=='personal'||acct.ownerId!==e.paidById)throw Error('اعتبار دنگ فقط از کارت شخصی با مالک همان عضو مجاز است.');
    add(credits,key(e.paidById,e.creditPeriod),e.amount);
   }
  }
  if(e.kind==='deposit'){
   const acct=store.accounts.find(a=>a.id===e.accountId);
   if(!acct||acct.kind!=='personal'||acct.ownerId!==e.memberId||get(custody,e.accountId)!==0)throw Error('واریز دنگ باید از کارت شخصیِ خود عضو و بدون مانده امانی باشد.');
   add(credits,key(e.memberId,e.period),e.amount);
  }
  if(e.kind==='transfer'){
   if(e.accountId==='fund'&&e.destinationId!=='fund')add(custody,e.destinationId,e.amount);
   else if(e.accountId!=='fund'){
    if(get(custody,e.accountId)<e.amount)throw Error('انتقال از کارت غیرصندوقی صرفاً تا سقف وجه امانیِ صندوق مجاز است؛ برای دنگ از فرم واریز استفاده کنید.');
    add(custody,e.accountId,-e.amount);
    if(e.destinationId!=='fund')add(custody,e.destinationId,e.amount);
   }
  }
  if(e.kind==='waiver'){
   const k=key(e.memberId,e.period);
   if(obligation(e.memberId,e.period)-get(waivers,k)-get(credits,k)<e.amount)throw Error('بخشودگی از بدهی قابل وصول بیشتر است.');
   add(waivers,k,e.amount);
  }
  if(['refund','creditMove'].includes(e.kind)){
   const p=e.kind==='refund'?e.period:e.sourcePeriod,k=key(e.memberId,p);
   if(get(credits,k)+get(waivers,k)-obligation(e.memberId,p)<e.amount)throw Error('اعتبار مازاد برای بازپرداخت یا انتقال کافی نیست.');
   add(credits,k,-e.amount);
   if(e.kind==='creditMove')add(credits,key(e.memberId,e.targetPeriod),e.amount);
  }
  fund+=fundDelta(e);
  if(!Number.isSafeInteger(fund)||fund<0)throw Error(`مانده تاریخی صندوق منفی شد: ${e.date} / ${e.id}`);
  cashflow.push({id:e.id,date:e.date,fund,delta:fundDelta(e)});
 }
 return {fund,custody:Object.fromEntries(custody),credits:Object.fromEntries(credits),waivers:Object.fromEntries(waivers),cashflow,active:evs};
}
