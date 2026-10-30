// Read-only audit projections for Dong household data. No financial event is mutated or invented.
import {effectiveEvents as activeEvents, fundDelta, project} from './native-ledger.mjs';
const persianMonth=new Intl.DateTimeFormat('en-US-u-ca-persian',{timeZone:'UTC',year:'numeric',month:'2-digit'});
export function eventPeriod(date){
  const parts=persianMonth.formatToParts(new Date(date+'T12:00:00Z'));
  return parts.find(p=>p.type==='year').value+'/'+parts.find(p=>p.type==='month').value.padStart(2,'0');
}
export const moneyLabel=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0}).format(n)+' تومان';
export function cashAudit(store,period){
  const events=activeEvents(store.events).map((event,i)=>({event,i})).sort((a,b)=>a.event.date.localeCompare(b.event.date)||a.i-b.i).map(x=>x.event);
  const custody=new Map(),records=[],get=id=>custody.get(id)||0,add=(id,value)=>custody.set(id,get(id)+value);
  let fund=store.openingBalance;
  for(const e of events){
    if(eventPeriod(e.date)>period)continue;
    let custodyChange=0,custodyAccount='';
    if(e.kind==='deposit'&&e.destinationId&&e.destinationId!=='fund'&&!e.creditOnly){
      custodyChange=e.amount;custodyAccount=e.destinationId;add(custodyAccount,custodyChange);
    }else if(e.kind==='transfer'){
      if(e.accountId==='fund'){custodyAccount=e.destinationId;custodyChange=e.amount;add(custodyAccount,custodyChange)}
      else{custodyAccount=e.accountId;custodyChange=-e.amount;add(e.accountId,-e.amount);if(e.destinationId!=='fund')add(e.destinationId,e.amount)}
    }else if((e.kind==='purchase'||e.kind==='payment')&&e.accountId!=='fund'){
      if(e.fundedBy==='fund'||(e.fundedBy===undefined&&get(e.accountId)>=e.amount)){
        custodyAccount=e.accountId;custodyChange=-e.amount;add(e.accountId,-e.amount);
      }
    }else if(e.kind==='refund'&&e.accountId&&e.accountId!=='fund'){
      custodyAccount=e.accountId;custodyChange=-e.amount;add(e.accountId,-e.amount);
    }
    const fundChange=fundDelta(e);fund+=fundChange;
    if(fundChange||custodyChange||e.kind==='purchase'||e.kind==='payment'){
      records.push({id:e.id,kind:e.kind,date:e.date,amount:e.amount,accountId:e.accountId||'',memberId:e.memberId||e.paidById||'',fundChange,custodyChange,custodyAccount,fundAfter:fund,totalAfter:fund+[...custody.values()].reduce((n,v)=>n+v,0),description:e.description||'',fundedBy:e.fundedBy||''});
    }
  }
  const custodyBalances=Object.fromEntries([...custody].filter(([,amount])=>amount!==0));
  const custodyTotal=[...custody.values()].reduce((n,v)=>n+v,0);
  const result={period,openingBalance:store.openingBalance,mainFund:fund,custodyBalances,custodyTotal,totalCash:fund+custodyTotal,records};
  // Enforce parity with the authoritative projection. This is a read-only assertion.
  const filtered=events.filter(e=>eventPeriod(e.date)<=period);
  const projected=project({...store,events:filtered});
  if(result.mainFund!==projected.fund||result.totalCash!==projected.totalCash)throw Error('مغایرت حسابداری صندوق؛ اطلاعات موجود را تغییر ندهید و گزارش را بررسی کنید.');
  for(const [account,amount] of Object.entries(projected.custody))if((custodyBalances[account]||0)!==amount)throw Error('مغایرت نگهداری پول صندوق در کارت‌ها.');
  return result;
}
function personalPaymentEventIds(store){
 const active=activeEvents(store.events).map((e,i)=>({e,i})).sort((a,b)=>a.e.date.localeCompare(b.e.date)||a.i-b.i).map(x=>x.e);
 const custody=new Map(),personal=new Set(),get=id=>custody.get(id)||0,add=(id,v)=>custody.set(id,get(id)+v);
 for(const e of active){
  if(e.kind==='deposit'&&e.destinationId&&e.destinationId!=='fund'&&!e.creditOnly)add(e.destinationId,e.amount);
  else if(e.kind==='transfer'){
   if(e.accountId==='fund')add(e.destinationId,e.amount);
   else{add(e.accountId,-e.amount);if(e.destinationId!=='fund')add(e.destinationId,e.amount)}
  }else if((e.kind==='purchase'||e.kind==='payment')&&e.accountId!=='fund'){
   const backed=e.fundedBy==='fund'||(e.fundedBy===undefined&&get(e.accountId)>=e.amount);
   if(backed)add(e.accountId,-e.amount);else personal.add(e.id);
  }else if(e.kind==='refund'&&e.accountId&&e.accountId!=='fund')add(e.accountId,-e.amount);
 }
 return personal;
}
export function memberAudit(store,id,period){
 const personallyFunded=personalPaymentEventIds(store);
  const ownedAccounts=new Set(store.accounts.filter(a=>a.ownerId===id).map(a=>a.id));
  const cancelled=new Map(store.events.filter(e=>e.kind==='reversal').map(e=>[e.originalId,e]));
  const all=store.events.filter(e=>e.kind!=='reversal').map(e=>{
    let label='',effect=0,relevant=false,periodKey='',kind=e.kind;
    if(e.kind==='deposit'&&e.memberId===id){relevant=true;label='واریز دنگ';effect=e.amount;periodKey=e.period}
    if((e.kind==='purchase'||e.kind==='payment')&&(e.paidById===id||ownedAccounts.has(e.accountId))){
      relevant=true;periodKey=e.creditPeriod;
      const personal=personallyFunded.has(e.id);
      label=e.kind==='purchase'?'خرید خانه':'پرداخت قسط';
      if(personal&&e.paidById===id)effect=e.amount;
      if(!personal)label+=' از پول صندوق نزد کارت';
    }
    if(e.kind==='waiver'&&e.memberId===id){relevant=true;label='بخشودگی بدهی';periodKey=e.period}
    if(e.kind==='refund'&&e.memberId===id){relevant=true;label='بازپرداخت مازاد';periodKey=e.period;effect=-e.amount}
    if(e.kind==='creditMove'&&e.memberId===id){relevant=true;label='انتقال اعتبار بین ماه‌ها';periodKey=e.sourcePeriod;if(e.sourcePeriod===period)effect=-e.amount;else if(e.targetPeriod===period)effect=e.amount}
    if(e.kind==='obligationAdjust'&&e.memberId===id){relevant=true;label='تغییر تعهد دنگ';periodKey=e.period}
    if(e.kind==='transfer'&&(ownedAccounts.has(e.accountId)||ownedAccounts.has(e.destinationId))){relevant=true;label='جابجایی پول صندوق نزد کارت';periodKey=eventPeriod(e.date)}
    if(!relevant)return null;
    const reversed=cancelled.get(e.id);
    return {id:e.id,kind,label,amount:e.amount,date:e.date,period:periodKey,affectsPeriod:periodKey===period||(kind==='creditMove'&&e.targetPeriod===period),effect:reversed?0:effect,cancelled:!!reversed,cancelReason:reversed?.reason||'',description:e.description||'',accountId:e.accountId||'',fundedBy:e.fundedBy||''};
  }).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
  return {memberId:id,period,rows:all,current:all.filter(x=>x.affectsPeriod),prior:all.filter(x=>!x.affectsPeriod)};
}
