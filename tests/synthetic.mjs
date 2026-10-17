import {persianMonth} from '../server/ledger.mjs';
export const MN=1_000_000;
export function findDate(period,day=1){
 for(let d=0;d<400;d++){const iso=new Date(Date.UTC(2026,8,20+d)).toISOString().slice(0,10);
 if(persianMonth(iso)===period){const [yy,mm,dd]=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'}).formatToParts(new Date(iso+'T12:00:00Z')).filter(x=>['year','month','day'].includes(x.type)).sort((a,b)=>['year','month','day'].indexOf(a.type)-['year','month','day'].indexOf(b.type)).map(x=>+x.value);if(dd===day)return iso;}
 }throw Error('month not found '+period+' day '+day);
}
export const months=Array.from({length:12},(_,i)=>i<6?`1405/${String(i+7).padStart(2,'0')}`:`1406/${String(i-5).padStart(2,'0')}`);
export const event=(id,kind,p,day,amount,other={})=>({id,kind,date:findDate(p,day),amount,description:`ساختگی: ${id}`,...other});
export function fixture(){
 const s=structuredClone({version:3,providers:['اسنپ‌پی','تارا','دیجی‌پی','سایر'],backupPolicy:'change',googleClientId:'',archivedMembers:[],archivedAccounts:[],archivedCategories:[],archivedProviders:[],members:[{id:'ahmad',name:'احمد',contributes:true},{id:'maryam',name:'مریم',contributes:true},{id:'fatemeh',name:'فاطمه',contributes:true},{id:'mehdi',name:'مهدی',contributes:true},{id:'erfan',name:'عرفان',contributes:false}],accounts:[{id:'fund',name:'صندوق',kind:'fund'},{id:'ahmad-card',name:'احمد',kind:'personal',ownerId:'ahmad'},{id:'maryam-card',name:'مریم',kind:'personal',ownerId:'maryam'},{id:'fatemeh-card',name:'فاطمه',kind:'personal',ownerId:'fatemeh'},{id:'mehdi-card',name:'مهدی',kind:'personal',ownerId:'mehdi'},{id:'mom-card',name:'مامان',kind:'other'}],categories:['نان','میوه','لوازم خانه'],plans:[],events:[],closedPeriods:[],openingBalance:8*MN,defaultContribution:10*MN,contributionOverrides:{},startPeriod:'1405/07'});
 let id=0;const add=(kind,p,day,amount,extra)=>s.events.push(event(`txn-${++id}`,kind,p,day,amount,extra));
 for(let index=0;index<12;index++){
  const p=months[index];
  if(index===3)s.contributionOverrides[`${p}|mehdi`]=8*MN;
  for(const m of ['ahmad','maryam','fatemeh','mehdi']){
   const depositAmount=m==='mehdi'&&index%2===0?8*MN:10*MN;
   add('deposit',p,2,depositAmount,{memberId:m,accountId:`${m}-card`,period:p});
  }
  add('purchase',p,3,6*MN,{accountId:'fund',paidById:'',category:'نان',creditPeriod:p});
  add('purchase',p,4,12*MN,{accountId:'ahmad-card',paidById:'ahmad',fundedBy:'personal',category:'میوه',creditPeriod:p});
  add('transfer',p,5,3*MN,{accountId:'fund',destinationId:'mom-card'});
  add('purchase',p,6,2*MN,{accountId:'mom-card',paidById:'',fundedBy:'fund',category:'نان',creditPeriod:p});
  add('transfer',p,7,1*MN,{accountId:'mom-card',destinationId:'fund'});
  add('creditMove',p,8,1*MN,{memberId:'ahmad',sourcePeriod:p,targetPeriod:index===11?'1406/07':months[index+1]});
  add('refund',p,9,1*MN,{memberId:'ahmad',period:p});
  if(index%2===0)add('waiver',p,10,2*MN,{memberId:'mehdi',period:p});
  // Independent installment contracts and payments, based on due dates.
  if(index%3===0){const installments=[0,1,2].map((offset,k)=>({id:`inst-${index}-${k}`,dueDate:findDate(months[index+offset],11),amount:2*MN}));s.plans.push({id:`plan-${index}`,title:`لوازم ${index}`,provider:'تارا',creditOwnerId:'maryam',category:'لوازم خانه',createdDate:findDate(p,1),total:6*MN,installments});}
  for(const plan of s.plans)for(const installment of plan.installments)if(persianMonth(installment.dueDate)===p){
   add('payment',p,13,2*MN,{installmentId:installment.id,accountId:'fund',paidById:'',creditPeriod:p});
  }
 }
 return s;
}
