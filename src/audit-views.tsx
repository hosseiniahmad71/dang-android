import React,{useMemo,useState} from 'react';
import './audit-style.css';
import {ArrowRight,Wallet,Users,ReceiptText,Search,ChevronLeft,Info,Landmark,History} from 'lucide-react';
import type {Store,Event} from './types';
import {effectiveEvents,memberCredits,obligation,waived,periodOf,personalPaymentIds} from './types';
import {periodStatistics,previousDebt,remainingInstallment} from './finance';
import {fnum,jalaliLabel,monthLabel} from './utils';
// @ts-ignore: Shared read-only auditing engine is tested independently with Node.
import {cashAudit,memberAudit} from './household-audit.mjs';

export type AuditSection='dues'|'cash'|'expenses'|'member';
const fmt=(n:number)=>fnum(n)+' تومان';
const accountName=(s:Store,id:string)=>s.accounts.find(x=>x.id===id)?.name||'حساب نامشخص';
const memberName=(s:Store,id:string)=>s.members.find(x=>x.id===id)?.name||'عضو نامشخص';
function AuditFigure({label,value,description,emphasis=false}:{label:string,value:number,description?:string,emphasis?:boolean}){
 return <div className={'audit-figure'+(emphasis?' emphasis':'')}><span>{label}</span><strong dir="rtl">{fmt(value)}</strong>{description&&<small>{description}</small>}</div>
}
export function AuditSummaryCards({store,period,onSelect}:{store:Store,period:string,onSelect:(section:AuditSection,memberId?:string)=>void}){
 const stats=useMemo(()=>periodStatistics(store,period),[store,period]);
 const cash=useMemo(()=>{try{return cashAudit(store,period)}catch{return null}},[store,period]);
 const forgiven=stats.memberStats.reduce((n,m)=>n+m.forgiven,0);
 const budgetLeft=stats.remaining;
 const personalIds=useMemo(()=>personalPaymentIds(store),[store]);
 const active=useMemo(()=>effectiveEvents(store),[store]);
 const cashDues=active.filter(e=>e.kind==='deposit'&&e.period===period&&!e.creditOnly).reduce((n,e)=>n+e.amount,0);
 const olderCredits=active.filter(e=>e.kind==='deposit'&&e.period===period&&e.creditOnly).reduce((n,e)=>n+e.amount,0);
 const ownSpendCredit=active.filter(e=>(e.kind==='purchase'||e.kind==='payment')&&e.creditPeriod===period&&personalIds.has(e.id)).reduce((n,e)=>n+e.amount,0);
 return <div className="audit-summary-pair" aria-label="خلاصه قابل بررسی حسابداری">
  <section className="audit-summary-card"><div className="audit-summary-head"><div className="audit-title"><Users size={22}/><h2>حساب دنگ اعضا</h2></div><span>{monthLabel(period)}</span></div>
   <div className="audit-figures"><AuditFigure label="تعهد اعضا" value={stats.required}/><AuditFigure label="دنگ واریزشده" value={cashDues} description="وجه دریافت‌شده در حساب اصلی یا کارت صندوق"/><AuditFigure label="اعتبار دریافت قدیمی" value={olderCredits} description="ثبت وصول گذشته؛ بدون ورود دوباره پول"/><AuditFigure label="اعتبار خرید با پول شخصی" value={ownSpendCredit} description="خرید خانه و قسط از پول خود اعضا"/><AuditFigure label="جمع اعتبار خالص" value={stats.credit} description="پس از انتقال اعتبار و بازپرداخت"/><AuditFigure label="بخشودگی ثبت‌شده" value={forgiven}/><AuditFigure label="باقی‌مانده وصول‌نشده" value={budgetLeft} emphasis/></div>
   <p className="audit-equation">باقی‌مانده هر عضو = تعهد − اعتبار او − بخشودگی (حداقل صفر). مازاد اعتبار جداگانه نمایش داده می‌شود.</p>
   <button className="audit-open" type="button" onClick={()=>onSelect('dues')}>مشاهده محاسبات دنگ و اسناد اعضا <ChevronLeft size={17}/></button>
  </section>
  <section className="audit-summary-card"><div className="audit-summary-head"><div className="audit-title"><Wallet size={22}/><h2>پول صندوق مشترک</h2></div><span>مانده تا پایان {monthLabel(period)}</span></div>
   {cash?<div className="audit-figures"><AuditFigure label="موجودی حساب اصلی" value={cash.mainFund}/><AuditFigure label="پول صندوق نزد کارت‌ها" value={cash.custodyTotal} description="پولی که برای خانواده در کارت‌های دیگر نگهداری شده"/><AuditFigure label="جمع موجودی نقدی" value={cash.totalCash} emphasis/></div>:<p className="audit-empty">محاسبه موجودی با اسناد هم‌خوانی ندارد. اطلاعات شما محفوظ است؛ جزئیات را بررسی کنید.</p>}
   <p className="audit-equation">جمع موجودی = پول حساب اصلی + پول صندوق نزد کارت‌ها. خرید شخصی اعضا دارایی نقدی صندوق را افزایش نمی‌دهد.</p>
   <button className="audit-open" type="button" onClick={()=>onSelect('cash')}>مشاهده منشأ موجودی و تمام گردش‌ها <ChevronLeft size={17}/></button>
  </section>
  <button className="audit-expense-shortcut" type="button" onClick={()=>onSelect('expenses')}><span><ReceiptText size={21}/> هزینه‌های این ماه و اقساط سررسید</span><strong>{fmt(stats.expenses)}</strong><ChevronLeft size={20}/></button>
 </div>;
}
function AuditHeading({title,description,onBack}:{title:string,description:string,onBack:()=>void}){
 return <div className="audit-view-heading"><button className="audit-back" type="button" onClick={onBack}><ArrowRight size={18}/> داشبورد</button><h1>{title}</h1><p>{description}</p></div>;
}
function LedgerRow({label,amount,detail,date,secondary}:{label:string,amount:number,detail:string,date?:string,secondary?:string}){
 return <div className="audit-ledger-row"><div className="audit-ledger-title"><strong>{label}</strong>{date&&<small>{jalaliLabel(date)}</small>}</div><div className="audit-ledger-bottom"><span>{detail}</span><b dir="rtl">{fmt(amount)}</b></div>{secondary&&<p>{secondary}</p>}</div>;
}
export function AuditDetailView({store,period,section,memberId,onBack,onMember}:{store:Store,period:string,section:AuditSection,memberId:string,onBack:()=>void,onMember:(id:string)=>void}){
 const [query,setQuery]=useState(''),[limit,setLimit]=useState(80);
 const stats=useMemo(()=>periodStatistics(store,period),[store,period]);
 const cash=useMemo(()=>{try{return cashAudit(store,period)}catch{return null}},[store,period]);
 const member=store.members.find(x=>x.id===memberId);
 const [includePrior,setIncludePrior]=useState(false);
 const personal=useMemo(()=>personalPaymentIds(store),[store]);
 const memberAuditResult=useMemo(()=>memberAudit(store,memberId,period),[store,memberId,period]);
 const memberStats=stats.memberStats.find(m=>m.id===memberId);
 const memberPlans=store.plans.filter(p=>p.creditOwnerId===memberId);
 const cashRows=cash?cash.records.filter((x:any)=>(x.description+' '+accountName(store,x.accountId)+' '+memberName(store,x.memberId)+' '+x.kind).includes(query)).slice().reverse():[];
 const currentEvents=effectiveEvents(store).filter(e=>periodOf(e.date)===period);
 const expenses=currentEvents.filter(e=>e.kind==='purchase').map(e=>({id:e.id,kind:'خرید خانه',date:e.date,amount:e.amount,detail:e.category+' · '+(e.accountId==='fund'?'از صندوق':personal.has(e.id)?'پرداخت شخصی '+memberName(store,e.paidById):'از پول صندوق نزد '+accountName(store,e.accountId))}));
 for(const p of store.plans)for(const i of p.installments)if(periodOf(i.dueDate)===period)expenses.push({id:i.id,kind:'قسط سررسید',date:i.dueDate,amount:i.amount,detail:p.title+' · '+p.provider+' · مانده '+fmt(remainingInstallment(store,i.id))});
 const filteredExpenses=expenses.filter(x=>(x.kind+' '+x.detail).includes(query)).sort((a,b)=>b.date.localeCompare(a.date));
 const memberRows=(includePrior?memberAuditResult.rows:memberAuditResult.current).filter((x:any)=>(x.label+' '+x.description+' '+accountName(store,x.accountId)).includes(query));
 const visibleRows=section==='member'?memberRows:section==='cash'?cashRows:filteredExpenses;
 const title=section==='member'?'حساب شخصی '+(member?.name||'عضو'):section==='cash'?'ریز موجودی و گردش صندوق':section==='dues'?'ریز حساب دنگ اعضا':'ریز هزینه‌های خانه';
 return <div className="page-block audit-view"><AuditHeading title={title} description={'دوره '+monthLabel(period)+' · همه اعداد بر اساس اسناد ثبت‌شده محاسبه شده‌اند'} onBack={onBack}/>
 {section==='cash'&&cash&&<><section className="card audit-detail-card"><h2>منشأ موجودی صندوق</h2><div className="audit-figures"><AuditFigure label="مانده افتتاحیه" value={cash.openingBalance}/><AuditFigure label="موجودی حساب اصلی" value={cash.mainFund}/><AuditFigure label="پول صندوق نزد کارت‌ها" value={cash.custodyTotal}/><AuditFigure label="جمع پول صندوق" value={cash.totalCash} emphasis/></div><div className="audit-formula">جمع موجودی نقدی = حساب اصلی + مجموع پول صندوق نزد کارت‌ها</div></section><section className="card audit-detail-card"><h2>حساب‌های نگهدارنده پول مشترک</h2>{Object.entries(cash.custodyBalances).length===0?<p className="audit-empty">پولی از صندوق نزد کارت دیگری ثبت نشده است.</p>:Object.entries(cash.custodyBalances).map(([id,amount])=><div className="audit-account-row" key={id}><span>{accountName(store,id)}</span><strong>{fmt(amount as number)}</strong></div>)}<p className="audit-help"><Info size={17}/> برای فهمیدن منشأ هر مانده، گردش‌های همان کارت را در فهرست زیر جست‌وجو کنید. ثبت خرید شخصی به معنی ورود پول واقعی به صندوق نیست.</p></section></>}
 {section==='cash'&&!cash&&<section className="card audit-detail-card"><h2>بررسی موجودی صندوق</h2><p className="audit-empty">مغایرت محاسباتی شناسایی شد. هیچ سندی تغییر نکرده است؛ پیش از اصلاح، از داده‌ها پشتیبان بگیرید.</p></section>}
 {section==='dues'&&<section className="card audit-detail-card"><h2>تعهد و اعتبار اعضا</h2><div className="audit-figures"><AuditFigure label="جمع تعهد" value={stats.required}/><AuditFigure label="جمع اعتبار" value={stats.credit}/><AuditFigure label="بخشودگی" value={stats.memberStats.reduce((n,m)=>n+m.forgiven,0)}/><AuditFigure label="دنگ وصول‌نشده" value={stats.remaining} emphasis/></div>{stats.memberStats.map(m=><button className="audit-member-link" key={m.id} type="button" onClick={()=>onMember(m.id)}><span><strong>{m.name}</strong><small>تعهد {fmt(m.required)} · اعتبار {fmt(m.credit)} · بخشودگی {fmt(m.forgiven)}</small></span><b>{m.remain>0?'مانده '+fmt(m.remain):m.surplus>0?'بستانکار '+fmt(m.surplus):'تسویه‌شده'}</b><ChevronLeft size={17}/></button>)}</section>}
 {section==='member'&&<><section className="card audit-detail-card"><h2>صورت‌حساب {member?.name}</h2><div className="audit-figures"><AuditFigure label="تعهد این ماه" value={memberStats?.required||0}/><AuditFigure label="پرداخت‌ها و اعتبار" value={memberStats?.credit||0}/><AuditFigure label="بخشودگی" value={memberStats?.forgiven||0}/><AuditFigure label="بدهی ماه جاری" value={memberStats?.remain||0} emphasis/><AuditFigure label="اعتبار مازاد" value={memberStats?.surplus||0}/><AuditFigure label="بدهی ماه‌های قبل" value={memberStats?.previous||0}/></div><p className="audit-help"><Info size={17}/> خرید با پول خود عضو از دنگ او کم می‌شود. خرید با پول صندوق نزد کارت، اعتبار شخصی ایجاد نمی‌کند.</p></section></>}
 {section==='member'&&memberPlans.length>0&&<section className="card audit-detail-card"><h2>خریدهای اقساطی با اعتبار این عضو</h2><p className="audit-help">نام صاحب اعتبار برای شناسایی قرارداد است؛ اقساط خرید مشترک، بدهی شخصی این عضو محسوب نمی‌شوند.</p>{memberPlans.map(p=><div className="audit-account-row" key={p.id}><span>{p.title} · {p.provider}</span><strong>{fmt(p.total)}</strong></div>)}</section>}
 {section==='expenses'&&<section className="card audit-detail-card"><h2>هزینه‌های ثبت‌شده این ماه</h2><AuditFigure label="خرید نقدی + اقساط سررسیدشده" value={stats.expenses} emphasis/><p className="audit-help">پرداخت بعدی قسط، دوباره هزینه همان قسط محسوب نمی‌شود.</p></section>}
 {section!=='dues'&&<section className="card audit-detail-card"><div className="audit-list-head"><h2>{section==='member'?'تمام عملیات مرتبط با عضو':section==='cash'?'ریز گردش و منشأ موجودی':'تمام خریدها و سررسیدها'}</h2>{section==='member'&&<label><input type="checkbox" checked={includePrior} onChange={e=>{setIncludePrior(e.target.checked);setLimit(80)}}/> نمایش ماه‌های دیگر</label>}</div><div className="audit-search"><Search size={18}/><input aria-label="جست‌وجوی گردش مالی" placeholder="جست‌وجوی شرح، نام یا حساب" value={query} onChange={e=>{setQuery(e.target.value);setLimit(80)}}/></div>{visibleRows.length===0?<p className="audit-empty">سندی با این مشخصات ثبت نشده است.</p>:<div className="audit-ledger-list">{section==='cash'?cashRows.slice(0,limit).map((x:any)=><LedgerRow key={x.id} label={x.kind==='deposit'?'واریز دنگ':x.kind==='transfer'?'انتقال بین حساب‌ها':x.kind==='purchase'?'خرید خانه':x.kind==='payment'?'پرداخت قسط':'بازپرداخت'} amount={x.amount} date={x.date} detail={x.fundedBy==='personal'?'پرداخت از پول خود عضو؛ موجودی صندوق تغییر نمی‌کند.':'حساب اصلی: '+fmt(x.fundChange)+' · کارت‌ها: '+fmt(x.custodyChange)} secondary={x.fundedBy==='personal'?'اعتبار دنگ '+memberName(store,x.memberId):'حساب: '+accountName(store,x.custodyAccount||x.accountId)+(x.destinationId?' · مقصد: '+accountName(store,x.destinationId):'')+' · جمع پول صندوق پس از عملیات: '+fmt(x.totalAfter)}/>):section==='member'?memberRows.slice(0,limit).map((x:any)=><LedgerRow key={x.id} label={x.label+(x.cancelled?' · باطل‌شده':'')} amount={x.amount} date={x.date} detail={'اثر بر تسویه دنگ این ماه (مثبت = کاهش بدهی): '+fmt(x.effect)} secondary={(x.description||'')+(x.cancelReason?' · علت ابطال: '+x.cancelReason:'')}/>):filteredExpenses.slice(0,limit).map(x=><LedgerRow key={x.id} label={x.kind} amount={x.amount} date={x.date} detail={x.detail}/>)}</div>}{visibleRows.length>limit&&<button type="button" className="audit-more" onClick={()=>setLimit(v=>v+80)}>نمایش ۸۰ سند دیگر ({fnum(visibleRows.length-limit)} باقی‌مانده)</button>}</section>}
 </div>;
}
