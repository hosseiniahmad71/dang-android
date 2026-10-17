export type Member={id:string,name:string,contributes:boolean};
export type Account={id:string,name:string,kind:'fund'|'personal'|'other',ownerId?:string};
export type ObligationAdjust={id:string,kind:'obligationAdjust',date:string,amount:number,direction:'increase'|'decrease',memberId:string,period:string,reason:string,recordedAt:string,description:string};
export type Reversal={id:string,kind:'reversal',date:string,amount:0,originalId:string,reason:string,recordedAt:string,description:string};
export type Purchase={id:string,kind:'purchase',date:string,amount:number,accountId:string,paidById:string,category:string,description:string,creditPeriod:string,fundedBy?:'fund'|'personal'};
export type Deposit={id:string,kind:'deposit',date:string,amount:number,memberId:string,accountId:string,period:string,description:string};
export type Payment={id:string,kind:'payment',date:string,amount:number,installmentId:string,accountId:string,paidById:string,creditPeriod:string,description:string,fundedBy?:'fund'|'personal'};
export type Transfer={id:string,kind:'transfer',date:string,amount:number,accountId:string,destinationId:string,description:string};
export type Waiver={id:string,kind:'waiver',date:string,amount:number,memberId:string,period:string,description:string};
export type CreditMove={id:string,kind:'creditMove',date:string,amount:number,memberId:string,sourcePeriod:string,targetPeriod:string,description:string};
export type Refund={id:string,kind:'refund',date:string,amount:number,memberId:string,period:string,description:string};
export type Event=Purchase|Deposit|Payment|Transfer|Waiver|CreditMove|Refund|Reversal|ObligationAdjust;
export type Installment={id:string,dueDate:string,amount:number};
export type Plan={id:string,title:string,provider:string,creditOwnerId:string,category:string,createdDate:string,total:number,installments:Installment[]};
export type Store={version:3,providers:string[],backupPolicy:'change'|'hourly'|'daily'|'off',googleClientId:string,archivedMembers:string[],archivedAccounts:string[],archivedCategories:string[],archivedProviders:string[],members:Member[],accounts:Account[],categories:string[],plans:Plan[],events:Event[],openingBalance:number,defaultContribution:number,contributionOverrides:Record<string,number>,startPeriod:string,closedPeriods:string[]};
export const initialStore:Store={version:3,providers:['اسنپ‌پی','تارا','دیجی‌پی','سایر'],backupPolicy:'change',googleClientId:'',archivedMembers:[],archivedAccounts:[],archivedCategories:[],archivedProviders:[],members:[{id:'ahmad',name:'احمد',contributes:true},{id:'maryam',name:'مریم',contributes:true},{id:'fatemeh',name:'فاطمه',contributes:true},{id:'mehdi',name:'مهدی',contributes:true},{id:'erfan',name:'عرفان',contributes:false}],accounts:[{id:'fund',name:'صندوق اصلی',kind:'fund'},{id:'ahmad-card',name:'کارت احمد',kind:'personal',ownerId:'ahmad'},{id:'maryam-card',name:'کارت مریم',kind:'personal',ownerId:'maryam'},{id:'fatemeh-card',name:'کارت فاطمه',kind:'personal',ownerId:'fatemeh'},{id:'mehdi-card',name:'کارت مهدی',kind:'personal',ownerId:'mehdi'},{id:'mom-card',name:'کارت مامان',kind:'other'},{id:'dad-card',name:'کارت بابا',kind:'other'}],categories:['میوه','صیفی‌جات','لبنیات','سوپرمارکت','لوازم خانه','اینترنت','قبوض','مخارج شمال','سفر','گوشت','مرغ','ماهی','سوسیس و کالباس','تخم مرغ','نان','ظروف آشپزخانه','کارت مامان','کارت بابا','کارت مریم'],plans:[],events:[],closedPeriods:[],openingBalance:0,defaultContribution:10_000_000,contributionOverrides:{},startPeriod:'1405/07'};
export function obligation(s:Store,memberId:string,period:string){const m=s.members.find(m=>m.id===memberId);if(!m||period<s.startPeriod)return 0;const base=s.contributionOverrides[`${period}|${memberId}`]??(m.contributes?s.defaultContribution:0);return base+effectiveEvents(s).filter((e):e is ObligationAdjust=>e.kind==='obligationAdjust'&&e.memberId===memberId&&e.period===period).reduce((a,e)=>a+(e.direction==='increase'?e.amount:-e.amount),0)}
export function installmentPlan(s:Store,id:string){return s.plans.find(p=>p.installments.some(i=>i.id===id))}
export function installmentDue(s:Store,id:string){return s.plans.flatMap(p=>p.installments).find(i=>i.id===id)}
export function effectiveEvents(s:Store){const gone=new Set(s.events.filter(e=>e.kind==='reversal').map(e=>e.originalId));return s.events.filter(e=>e.kind!=='reversal'&&!gone.has(e.id))}
export function fundDelta(e:Event){if(e.kind==='deposit')return e.amount;if(e.kind==='refund')return -e.amount;if(e.kind==='purchase'||e.kind==='payment')return e.accountId==='fund'?-e.amount:0;if(e.kind==='transfer')return (e.destinationId==='fund'?e.amount:0)-(e.accountId==='fund'?e.amount:0);return 0}
export function fundBalance(s:Store){return s.openingBalance+effectiveEvents(s).reduce((a,e)=>a+fundDelta(e),0)}
export function fundBalanceThrough(s:Store,period:string){return s.openingBalance+effectiveEvents(s).filter(e=>periodOf(e.date)<=period).reduce((a,e)=>a+fundDelta(e),0)}
const inferredCache=new WeakMap<Store,Set<string>>();
const custodyCache=new WeakMap<Store,Record<string,number>>();
export function personalPaymentIds(s:Store){const old=inferredCache.get(s);if(old)return old;const custody=new Map<string,number>(),valid=new Set<string>();
 const active=effectiveEvents(s).map((e,i)=>({e,i})).sort((a,b)=>a.e.date.localeCompare(b.e.date)||a.i-b.i).map(x=>x.e);
 const bal=(id:string)=>custody.get(id)||0;
 for(const e of active){
  if(e.kind==='transfer'){
   if(e.accountId==='fund')custody.set(e.destinationId,bal(e.destinationId)+e.amount);
   else{custody.set(e.accountId,bal(e.accountId)-e.amount);if(e.destinationId!=='fund')custody.set(e.destinationId,bal(e.destinationId)+e.amount)}
  }else if((e.kind==='purchase'||e.kind==='payment')&&e.accountId!=='fund'){
   const backed=e.fundedBy==='fund'||(e.fundedBy===undefined&&bal(e.accountId)>=e.amount);
   if(backed)custody.set(e.accountId,bal(e.accountId)-e.amount);else valid.add(e.id);
  }
 }
 inferredCache.set(s,valid);custodyCache.set(s,Object.fromEntries(custody));return valid;
}
export function custodyBalances(s:Store){personalPaymentIds(s);return custodyCache.get(s)||{}}
export function memberCredits(s:Store,memberId:string,period:string){const personal=personalPaymentIds(s);return effectiveEvents(s).reduce((acc,e)=>{
 if(e.kind==='deposit'&&e.memberId===memberId&&e.period===period)return acc+e.amount;
 if(e.kind==='purchase'&&e.accountId!=='fund'&&personal.has(e.id)&&e.paidById===memberId&&e.creditPeriod===period)return acc+e.amount;
 if(e.kind==='payment'&&e.accountId!=='fund'&&personal.has(e.id)&&e.paidById===memberId&&e.creditPeriod===period)return acc+e.amount;
 if(e.kind==='creditMove'&&e.memberId===memberId)return acc+(e.targetPeriod===period?e.amount:0)-(e.sourcePeriod===period?e.amount:0);
 if(e.kind==='refund'&&e.memberId===memberId&&e.period===period)return acc-e.amount;
 return acc;
},0)}
export function waived(s:Store,memberId:string,period:string){return effectiveEvents(s).reduce((a,e)=>a+(e.kind==='waiver'&&e.memberId===memberId&&e.period===period?e.amount:0),0)}
export function balanceMemberPeriod(s:Store,memberId:string,period:string){return obligation(s,memberId,period)-waived(s,memberId,period)-memberCredits(s,memberId,period)}
export function expensesPeriod(s:Store,period:string){const cash=effectiveEvents(s).filter(e=>e.kind==='purchase'&&e.date&&periodOf(e.date)===period).reduce((a,e)=>a+e.amount,0);const due=s.plans.flatMap(p=>p.installments).filter(i=>periodOf(i.dueDate)===period).reduce((a,i)=>a+i.amount,0);return cash+due}
const monthlyCalendar=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',timeZone:'UTC'});
const monthCache=new Map<string,string>();
export function periodOf(date:string){const cached=monthCache.get(date);if(cached)return cached;const parts=monthlyCalendar.formatToParts(new Date(`${date}T12:00:00Z`));const y=Number(parts.find(x=>x.type==='year')?.value),m=Number(parts.find(x=>x.type==='month')?.value);const result=`${y}/${String(m).padStart(2,'0')}`;if(monthCache.size>10000)monthCache.clear();monthCache.set(date,result);return result}
export function paidAmount(s:Store,id:string){return effectiveEvents(s).reduce((a,e)=>a+(e.kind==='payment'&&e.installmentId===id?e.amount:0),0)}
