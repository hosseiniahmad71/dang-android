import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Wallet,LayoutDashboard,ShoppingBasket,ArrowDownToLine,CalendarClock,ArrowLeftRight,Settings,History,Plus,Check,Info,AlertTriangle,Users,ChartNoAxesCombined,Landmark,ReceiptText,RotateCcw,Download,CalendarDays,CreditCard,ShieldAlert,TrendingDown,TrendingUp,ChevronLeft,House,Search,Trash2, CircleAlert} from 'lucide-react';
import {MoneyInput,PersianDate,SearchSelect,TextField,Option} from './controls';
import {currentIso,daysInJalaliMonth,fnum,jalaliKey,jalaliLabel,jalaliParts,monthLabel,numberWords,offsetMonth,parseMonthKey,parseToman,safeToman,toIsoFromJalali,tomanWords} from './utils';
import {Store,Event,Plan,initialStore,fundBalance,obligation,memberCredits,waived,periodOf,paidAmount,effectiveEvents,custodyBalances,personalPaymentIds} from './types';
import {availableSurplus,canRegister,expenseByCategory,periodFlow,periodStatistics,remainingInstallment,previousDebt} from './finance';
import {SettingsView} from './settings';
import {TravelView} from './travel';
import {AuditSummaryCards,AuditDetailView,AuditSection} from './audit-views';
import {loadStore,saveStore,restoreStore,reverseFinancialEvent,setPeriodLock,reviseMonthlyObligation} from './database';
import {isNativeAndroid} from './native-bridge';
// @ts-ignore: shared JavaScript financial rules are separately tested
import {buildProviderSchedule,providerRule,recommendedCount} from './installment-rules.mjs';
// @ts-ignore: shared JavaScript payment-source policy is covered by Node regression tests
import {MEMBER_CASH_ACCOUNT,paymentSourceOptions,resolvePaymentSource} from './installment-payment-source.mjs';
// @ts-ignore: shared JavaScript policy is separately tested
import {validateDepositBatch} from './deposit-policy.mjs';
// @ts-ignore: JS projection performs the same checks used by Android offline runtime
import {project} from './native-ledger.mjs';
// @ts-ignore audited shared period validation
import {assertStartPeriodChange} from './start-period.mjs';
import './style.css';

type Page='dashboard'|'operations'|'installments'|'history'|'settings'|'audit';
type Operation='purchase'|'deposit'|'plan'|'payment'|'transfer'|'settlement';
const operations: {id:Operation,label:string,sub:string,icon:React.ElementType}[]=[
 {id:'purchase',label:'خرید',sub:'نقدی یا شخصی',icon:ShoppingBasket},
 {id:'deposit',label:'واریز دنگ',sub:'پرداخت سهم',icon:ArrowDownToLine},
 {id:'plan',label:'خرید اقساطی',sub:'قرارداد جدید',icon:CreditCard},
 {id:'payment',label:'پرداخت قسط',sub:'تسویه سررسید',icon:CalendarClock},
 {id:'transfer',label:'انتقال پول',sub:'بین حساب‌ها',icon:ArrowLeftRight},
 {id:'settlement',label:'تسویه و اصلاح',sub:'مازاد یا بخشودگی',icon:RotateCcw}
];
const uuid=()=>crypto.randomUUID();
const money=(n:number)=>`${fnum(n)} تومان`;
const memberName=(s:Store,id:string)=>s.members.find(m=>m.id===id)?.name||'—';
const accountName=(s:Store,id:string)=>s.accounts.find(a=>a.id===id)?.name||'—';

function periodOptions(selected:string,minPeriod:string){const options:Option[]=[];const earlier=offsetMonth(selected,-18);for(let p=earlier<minPeriod?minPeriod:earlier,i=0;i<49;i++,p=offsetMonth(p,1))options.push({value:p,label:monthLabel(p)});return options}
function Notice({children,tone='info'}:{children:React.ReactNode,tone?:'info'|'warning'|'success'}){return <div className={`notice ${tone}`}><Info size={18}/><span>{children}</span></div>}
function PanelTitle({icon:Icon,title,meta}:{icon:React.ElementType,title:string,meta?:string}){return <div className="panel-title"><div className="panel-title-label"><Icon size={19}/><h3>{title}</h3></div>{meta&&<span className="panel-meta">{meta}</span>}</div>}
function Progress({value,max}:{value:number,max:number}){return <div className="progress"><span style={{width:`${Math.max(0,Math.min(100,max?value/max*100:0))}%`}}/></div>}
function Metric({title,value,sub,icon:Icon,tone='primary'}:{title:string,value:number,sub:string,icon:React.ElementType,tone?:string}){return <div className={`metric metric-${tone}`}><div className="metric-head"><span>{title}</span><div className="metric-icon"><Icon size={19}/></div></div><strong dir="ltr">{fnum(value)}</strong><small>{sub}</small></div>}
function SaveButton({children='ثبت عملیات'}:{children?:string}){return <button type="submit" className="btn btn-primary"><Check size={18}/>{children}</button>}
function validateAmount(raw:string,max?:number){const n=parseToman(raw);if(!safeToman(n))return {n,error:'مبلغ را به‌صورت عدد صحیح مثبت و به تومان وارد کنید.'};if(max!==undefined&&n>max)return {n,error:`مبلغ از حد مجاز (${money(max)}) بیشتر است.`};return {n,error:''}}

function PurchaseForm({store,saveMany,period}:{store:Store,saveMany:(e:Event[])=>boolean,period:string}){
 const [amount,setAmount]=useState(''),[date,setDate]=useState(currentIso()),[account,setAccount]=useState((custodyBalances(store)['maryam-card']||0)>0?'maryam-card':'fund'),[category,setCategory]=useState(store.categories.find(x=>!store.archivedCategories.includes(x))||''),[creditPeriod,setCreditPeriod]=useState(period),[description,setDescription]=useState(''),[overageAction,setOverageAction]=useState<'later'|'carry'|'refund'>('later'),[error,setError]=useState('');
 const privatePay=account!=='fund',acct=store.accounts.find(a=>a.id===account),custody=custodyBalances(store)[account]||0,isFunded=privatePay&&custody>0,paidBy=acct?.kind==='personal'?(acct.ownerId||''):'',potential=parseToman(amount);
 const remainingObligation=Math.max(0,obligation(store,paidBy,creditPeriod)-waived(store,paidBy,creditPeriod));
 const oldSurplus=Math.max(0,memberCredits(store,paidBy,creditPeriod)-remainingObligation);
 const nextSurplus=privatePay&&!isFunded&&Number.isFinite(potential)?Math.max(0,memberCredits(store,paidBy,creditPeriod)+potential-remainingObligation):0;
 const newSurplus=Math.max(0,nextSurplus-oldSurplus);
 const projected=remainingObligation-memberCredits(store,paidBy,creditPeriod)-potential;
 const onSubmit=(e:React.FormEvent)=>{e.preventDefault();const a=validateAmount(amount);if(a.error)return setError(a.error);if(!category)return setError('یک دسته‌بندی انتخاب کنید.');if(jalaliKey(date)<store.startPeriod||creditPeriod<store.startPeriod)return setError(`ثبت قبل از ${monthLabel(store.startPeriod)} مجاز نیست.`);if(privatePay&&!isFunded&&!paidBy)return setError('عضو پرداخت‌کننده را انتخاب کنید.');if(privatePay&&isFunded&&a.n>custody)return setError('مانده وجه امانی صندوق برای این خرید کافی نیست؛ ابتدا وجه امانی را تعیین تکلیف کن.');if(privatePay&&!isFunded&&(!acct||acct.kind!=='personal'||acct.ownerId!==paidBy))return setError('برای خرید شخصی، کارت باید متعلق به همان عضو باشد؛ کارت‌های بی‌مالک اعتبار دنگ ایجاد نمی‌کنند.');const tx:Event={id:uuid(),kind:'purchase',date,amount:a.n,accountId:account,paidById:privatePay&&!isFunded?paidBy:'',fundedBy:privatePay?(isFunded?'fund':'personal'):undefined,category,creditPeriod,description};const batch:Event[]=[tx];if(privatePay&&!isFunded&&newSurplus>0&&overageAction==='carry')batch.push({id:uuid(),kind:'creditMove',date,amount:newSurplus,memberId:paidBy,sourcePeriod:creditPeriod,targetPeriod:offsetMonth(creditPeriod,1),description:'انتقال خودکار مازاد خرید شخصی'});if(privatePay&&!isFunded&&newSurplus>0&&overageAction==='refund')batch.push({id:uuid(),kind:'refund',date,amount:newSurplus,memberId:paidBy,period:creditPeriod,description:'بازپرداخت مازاد خرید شخصی از صندوق'});if(saveMany(batch)){setAmount('');setDescription('');setOverageAction('later');setError('')}};
 return <form onSubmit={onSubmit} className="form-section"><div className="form-heading"><h2>ثبت خرید خانه</h2><p>پرداخت از صندوق یا پول شخصی اعضا</p></div><div className="form-grid"><MoneyInput label="مبلغ خرید" value={amount} onChange={setAmount}/><PersianDate minPeriod={store.startPeriod} label="تاریخ خرید (شمسی)" value={date} onChange={v=>{setDate(v);setCreditPeriod(jalaliKey(v))}}/><SearchSelect label="دسته‌بندی هزینه" value={category} onChange={setCategory} options={store.categories.filter(x=>!store.archivedCategories.includes(x)).map(x=>({value:x,label:x}))}/><SearchSelect label="حساب پرداخت‌کننده نقدی" value={account} onChange={setAccount} options={store.accounts.filter(a=>!store.archivedAccounts.includes(a.id)).map(a=>({value:a.id,label:a.name}))}/>{privatePay&&<>{!isFunded&&acct?.kind==='personal'&&<div className="control"><label className="field-label">پرداخت‌کننده (از مالک کارت)</label><strong>{memberName(store,paidBy)}</strong><small>این عضو به‌صورت خودکار از کارت انتخاب‌شده تعیین می‌شود.</small></div>}<SearchSelect label="اعتبار به دنگ کدام ماه اختصاص یابد؟" value={creditPeriod} onChange={setCreditPeriod} options={periodOptions(creditPeriod,store.startPeriod)}/></>}<TextField label="شرح خرید (اختیاری)" value={description} onChange={setDescription} placeholder="مثلاً خرید هفتگی از فروشگاه" wide/></div>{privatePay&&!isFunded&&newSurplus>0&&<div className="surplus-choice"><strong>مازاد جدید خرید: {money(newSurplus)}</strong><p>برای مبلغ بیش از دنگ این ماه چه کنیم؟</p><div className="choice-row">{[{id:'later',label:'بعداً تصمیم می‌گیرم'},{id:'carry',label:`انتقال به ${monthLabel(offsetMonth(creditPeriod,1))}`},{id:'refund',label:'بازپرداخت از صندوق'}].map(x=><button type="button" key={x.id} className={overageAction===x.id?'active':''} onClick={()=>setOverageAction(x.id as typeof overageAction)}>{x.label}</button>)}</div></div>}<Notice tone={privatePay?'success':'info'}>{isFunded?'این خرید از وجه امانیِ صندوق روی کارت پرداخت می‌شود؛ اعتبار شخصی ایجاد نمی‌کند.':privatePay?`این خرید، اعتبار تسویه برای ${memberName(store,paidBy)} ایجاد می‌کند، ولی موجودی واقعی صندوق تغییر نمی‌کند.${projected<0?' احتمالاً اعتبار مازاد ایجاد می‌شود؛ از تب تسویه تعیین تکلیف کن.':''}`:'مبلغ خرید از موجودی صندوق کم می‌شود؛ به هیچ عضوی اعتبار دنگ تعلق نمی‌گیرد.'}</Notice>{error&&<div className="form-error">{error}</div>}<div className="form-footer"><SaveButton/></div></form>
}
function DepositForm({store,saveMany,period}:{store:Store,saveMany:(events:Event[])=>boolean,period:string}){
 const today=currentIso(),thisPeriod=jalaliKey(today),earliest=offsetMonth(thisPeriod,-1);
 const eligible=store.members.filter(m=>m.contributes&&!store.archivedMembers.includes(m.id));
 const [date,setDate]=useState(today),[members,setMembers]=useState<string[]>(['ahmad']),
  [account,setAccount]=useState(store.accounts.some(a=>a.id==='maryam-card'&&!store.archivedAccounts.includes(a.id))?'maryam-card':'fund'),
  [payPeriod,setPayPeriod]=useState(period>=earliest?period:thisPeriod),[amounts,setAmounts]=useState<Record<string,string>>({}),
  [description,setDescription]=useState(''),[error,setError]=useState('');
 const historic=date<today;
 const destinationOptions=store.accounts.filter(a=>!store.archivedAccounts.includes(a.id)).map(a=>({value:a.id,label:a.name}));
 const options:Option[]=[];
 for(let p=earliest<store.startPeriod?store.startPeriod:earliest,i=0;i<21;i++,p=offsetMonth(p,1))options.push({value:p,label:monthLabel(p)});
 function outstanding(memberId:string){return Math.max(0,obligation(store,memberId,payPeriod)-waived(store,memberId,payPeriod)-memberCredits(store,memberId,payPeriod))}
 function entered(memberId:string){return amounts[`${payPeriod}|${memberId}`]??String(outstanding(memberId))}
 function submit(e:React.FormEvent){
  e.preventDefault();setError('');
  if(members.length===0)return setError('حداقل یک عضو برای پرداخت دنگ انتخاب کن.');
  if(!destinationOptions.some(x=>x.value===account))return setError('حساب مقصد نامعتبر است.');
  const batch:Event[]=[];
  for(const memberId of members){
   const value=validateAmount(entered(memberId),outstanding(memberId));
   if(value.error)return setError(`${memberName(store,memberId)}: ${value.error}`);
   batch.push({id:uuid(),kind:'deposit',date,amount:value.n,memberId,
    accountId:account,destinationId:account,creditOnly:historic||undefined,period:payPeriod,description});
  }
  try{validateDepositBatch(store,batch,today)}catch(ex){return setError(String(ex instanceof Error?ex.message:ex))}
  if(historic&&!window.confirm(`تاریخ دریافت ${jalaliLabel(date)} از امروز قدیمی‌تر است.\nفقط بستانکاری اعضای انتخاب‌شده ثبت می‌شود و هیچ پولی دوباره به موجودی صندوق اضافه نمی‌شود.\nادامه می‌دهید؟`))return;
  if(saveMany(batch)){setDescription('');setAmounts({});setError('')}
 }
 return <form className="form-section" onSubmit={submit}>
  <div className="form-heading"><h2>واریز دنگ اعضا</h2><p>ثبت یک یا چند پرداخت در یک سند اتمیک؛ هر عضو اعتبار جداگانه می‌گیرد.</p></div>
  <div className="form-grid">
   <PersianDate minPeriod={store.startPeriod} label="تاریخ واقعی دریافت وجه" value={date} onChange={setDate}/>
   <SearchSelect label="حساب مقصد دریافت وجه" value={account} onChange={setAccount} options={destinationOptions}/>
   <SearchSelect label="دوره تخصیص دنگ (ماه شمسی)" value={payPeriod} onChange={v=>{setPayPeriod(v);setAmounts({})}} options={options}/>
   <TextField label="توضیحات (اختیاری)" value={description} onChange={setDescription}/>
  </div>
  <div className="deposit-member-list"><strong>اعضای پرداخت‌کننده (امکان انتخاب چند نفر)</strong>
   {eligible.map(m=>{const checked=members.includes(m.id),due=outstanding(m.id),older=previousDebt(store,m.id,payPeriod);
    return <div className={`deposit-member-row ${checked?'selected':''}`} key={m.id}>
      <label className="deposit-member-toggle"><input type="checkbox" checked={checked} onChange={ev=>setMembers(old=>ev.target.checked?[...old,m.id]:old.filter(x=>x!==m.id))}/><span>{m.name}</span></label>
      {checked&&<MoneyInput label="مبلغ دنگ این عضو" value={entered(m.id)} onChange={value=>setAmounts(old=>({...old,[`${payPeriod}|${m.id}`]:value}))} note={`تعهد وصول‌نشده ${money(due)}${older>0?` · بدهی ماه‌های قبلی ${money(older)}`:''}`}/>}
     </div>})}
  </div>
  <Notice>مبلغ اولیه هر عضو از تعهد همان ماه در تنظیمات می‌آید (پیش‌فرض ۱۰ میلیون تومان). پرداخت ماه آینده فقط پس از تسویه کامل ماه‌های قبلی همان عضو مجاز است.</Notice>
  {historic&&<Notice tone="warning">تاریخ دریافت قبل از امروز است. پس از تأیید، فقط اعتبار اعضای انتخاب‌شده ثبت می‌شود؛ موجودی صندوق دوباره افزایش نمی‌یابد.</Notice>}
  {account==='maryam-card'&&<Notice>حساب مقصد پیش‌فرض، کارت مریم است. واریزی‌های جدید در این کارت به‌صورت وجه خانوادگی امانی ثبت می‌شوند و خرید از این وجه، اعتبار شخصی جدید ایجاد نمی‌کند.</Notice>}
  {error&&<div className="form-error" role="alert">{error}</div>}
  <div className="form-footer"><SaveButton>{`ثبت واریز ${fnum(members.length)} عضو`}</SaveButton></div>
 </form>
}
type DraftInstallment={id:string,dueDate:string,amount:string};
function PlanForm({store,save}:{store:Store,save:(p:Plan)=>boolean}){
 const [title,setTitle]=useState(''),[provider,setProvider]=useState('اسنپ‌پی'),[owner,setOwner]=useState('ahmad'),
 [category,setCategory]=useState(store.categories.find(x=>!store.archivedCategories.includes(x))||''),
 [amount,setAmount]=useState(''),[count,setCount]=useState('4'),[purchaseDate,setPurchaseDate]=useState(currentIso()),
 [firstDue,setFirstDue]=useState(currentIso()),[schedule,setSchedule]=useState<DraftInstallment[]>([]),[error,setError]=useState('');
 const rule=providerRule(provider,count);
 const countOptions:Option[]=rule==='tara-two'?[{value:'2',label:'۲ قسط — ماه بعد و ماه بعدش'}]:
  providerRule(provider,4)==='four-with-downpayment'?[{value:'4',label:'۴ قسط — یک‌چهارم روز خرید'},{value:'1',label:'۱ قسط — تسویه اول ماه بعد'}]:
  ['1','2','3','4','6','10','12','18','24','36'].map(x=>({value:x,label:`${fnum(Number(x))} قسط`}));
 const sum=schedule.reduce((a,x)=>a+(Number.isFinite(parseToman(x.amount))?parseToman(x.amount):0),0);
 const guideline=rule==='tara-two'?'تارا: بدون پیش‌پرداخت؛ سررسید اول یک ماه بعد از خرید در همان روز شمسی و سررسید دوم دو ماه بعد است.':
 rule==='four-with-downpayment'?'اسنپ‌پی / دیجی‌پی چهارقسطه: ۲۵٪ مبلغ روز خرید سررسید می‌شود؛ سه قسط بعدی روز اول سه ماه شمسی بعد است.':
 rule==='pay-next-month'?'اسنپ‌پی / دیجی‌پی تک‌قسطه: تمام مبلغ روز اول ماه شمسی بعد تسویه می‌شود.':
 'سایر سرویس‌ها: تعداد اقساط و تاریخ قسط اول را انتخاب کنید.';
 function makeSchedule(){
  const v=validateAmount(amount);if(v.error){setSchedule([]);return setError(v.error)}
  try{const next: {id:string,dueDate:string,amount:number}[]=buildProviderSchedule({provider,count:Number(count),total:v.n,purchaseDate,firstDue,createId:()=>uuid()});setSchedule(next.map(i=>({...i,amount:String(i.amount)})));setError('')}
  catch(ex){setSchedule([]);setError(String(ex instanceof Error?ex.message:ex))}
 }
 useEffect(()=>{if(amount.trim())makeSchedule();else{setSchedule([]);setError('')}} ,[provider,count,amount,purchaseDate,firstDue]);
 function submit(e:React.FormEvent){
  e.preventDefault();const v=validateAmount(amount);if(v.error)return setError(v.error);
  if(!title.trim())return setError('عنوان خرید ضروری است.');
  if(schedule.length!==Number(count))return setError('جدول اقساط را بررسی یا بازسازی کنید.');
  if(schedule.some(i=>!safeToman(parseToman(i.amount))))return setError('مبلغ هر قسط باید عدد صحیح مثبت باشد.');
  if(sum!==v.n)return setError(`جمع اقساط ${money(sum)} است و باید با مبلغ کل ${money(v.n)} برابر باشد.`);
  if(new Set(schedule.map(i=>i.dueDate)).size!==schedule.length)return setError('سررسیدهای تکراری مجاز نیستند.');
  if(schedule.some(i=>i.dueDate<purchaseDate))return setError('سررسید قسط پیش از خرید مجاز نیست.');
  if(save({id:uuid(),title:title.trim(),provider,creditOwnerId:owner,category,createdDate:purchaseDate,total:v.n,installments:schedule.map(i=>({...i,amount:parseToman(i.amount)}))})){
   setSchedule([]);setTitle('');setAmount('');setError('');
  }
 }
 return <form className="form-section" onSubmit={submit}>
  <div className="form-heading"><h2>خرید جدید اقساطی</h2><p>تقویم اقساط تارا، دیجی‌پی و اسنپ‌پی خودکار تنظیم می‌شود.</p></div>
  <div className="form-grid">
   <TextField label="عنوان کالا یا خرید" value={title} onChange={setTitle} placeholder="مثلاً جاروبرقی"/>
   <MoneyInput label="مبلغ کل قرارداد" value={amount} onChange={setAmount}/>
   <SearchSelect label="سرویس اعتباری" value={provider} onChange={v=>{setProvider(v);setCount(String(recommendedCount(v)));setSchedule([])}} options={store.providers.filter(x=>!store.archivedProviders.includes(x)).map(x=>({value:x,label:x}))}/>
   <SearchSelect label="مالک حساب اعتباری" value={owner} onChange={setOwner} options={store.members.filter(m=>!store.archivedMembers.includes(m.id)).map(m=>({value:m.id,label:m.name}))}/>
   <SearchSelect label="دسته‌بندی هزینه" value={category} onChange={setCategory} options={store.categories.filter(x=>!store.archivedCategories.includes(x)).map(x=>({value:x,label:x}))}/>
   <PersianDate minPeriod={store.startPeriod} label="تاریخ خرید" value={purchaseDate} onChange={setPurchaseDate}/>
   <SearchSelect label="روش پرداخت / تعداد اقساط" value={count} onChange={v=>{setCount(v);setSchedule([])}} options={countOptions}/>
   {rule==='custom'&&<PersianDate minPeriod={store.startPeriod} label="سررسید قسط اول" value={firstDue} onChange={setFirstDue}/>}
  </div>
  <Notice>{guideline}</Notice>
  <div className="schedule-header"><strong>جدول سررسیدها (شمسی)</strong><button type="button" className="btn btn-outline" onClick={makeSchedule}><Plus size={16}/> بازسازی بر اساس قوانین سرویس</button></div>
  {schedule.length>0&&<div className="schedule-list">{schedule.map((r,i)=><div className="schedule-row" key={r.id}>
   <span className="schedule-number">{fnum(i+1)}</span>
   <PersianDate minPeriod={store.startPeriod} label={i===0&&rule==='four-with-downpayment'?'پیش‌پرداخت روز خرید':'سررسید'} value={r.dueDate} onChange={v=>setSchedule(rows=>rows.map(x=>x.id===r.id?{...x,dueDate:v}:x))}/>
   <MoneyInput label="مبلغ قسط" value={r.amount} onChange={v=>setSchedule(rows=>rows.map(x=>x.id===r.id?{...x,amount:v}:x))}/>
  </div>)}<div className={`schedule-total ${sum===parseToman(amount)?'good':'bad'}`}>جمع اقساط: <b>{money(sum)}</b> {sum===parseToman(amount)?'✓':'(با مبلغ خرید برابر نیست)'}</div></div>}
  {rule==='four-with-downpayment'&&<Notice tone="warning">قسط اول در روز خرید سررسید دارد، اما «پرداخت‌شده» محسوب نمی‌شود. برای کاهش موجودی صندوق، مبلغ واقعی پرداخت‌شده را از بخش «پرداخت قسط» ثبت کن.</Notice>}
  <Notice tone="warning">قرارداد به‌تنهایی موجودی صندوق یا اعتبار شخصی اعضا را تغییر نمی‌دهد؛ تنها ثبت پرداخت واقعی این کار را می‌کند.</Notice>
  {error&&<div className="form-error" role="alert">{error}</div>}
  <div className="form-footer"><SaveButton>ثبت قرارداد اقساطی</SaveButton></div>
 </form>
}
function PaymentForm({store,save,initialInstallmentId=''}:{store:Store,save:(e:Event)=>boolean,initialInstallmentId?:string}){
 const available=store.plans.flatMap(p=>p.installments.filter(i=>remainingInstallment(store,i.id)>0).map(i=>({value:i.id,label:p.title+' | '+p.provider+' | '+jalaliLabel(i.dueDate)+' | مانده '+money(remainingInstallment(store,i.id))})));
 const [id,setId]=useState(initialInstallmentId),[amount,setAmount]=useState(initialInstallmentId?String(remainingInstallment(store,initialInstallmentId)):''),[date,setDate]=useState(currentIso()),[source,setSource]=useState(''),[error,setError]=useState('');
 const remaining=id?remainingInstallment(store,id):0,sourceOptions=paymentSourceOptions(store);
 function submit(e:React.FormEvent){
  e.preventDefault();
  if(!id||!remaining)return setError('قسط پرداخت‌نشده‌ای را انتخاب کنید.');
  const v=validateAmount(amount,remaining);if(v.error)return setError(v.error);
  try{
   const payer=resolvePaymentSource(store,source);
   if(save({id:uuid(),kind:'payment',date,amount:v.n,installmentId:id,...payer,creditPeriod:jalaliKey(date),description:''})){
    setId('');setAmount('');setError('');
   }
  }catch(ex){setError(ex instanceof Error?ex.message:String(ex))}
 }
 return <form className="form-section" onSubmit={submit}>
  <div className="form-heading"><h2>پرداخت قسط</h2><p>ثبت پرداخت واقعی، کامل یا جزئی</p></div>
  {available.length===0?<Notice tone="warning">قسط پرداخت‌نشده‌ای وجود ندارد. ابتدا از «خرید اقساطی» قرارداد بسازید.</Notice>:<>
   <div className="form-grid">
    <div className="wide"><SearchSelect label="قسط موردنظر" value={id} onChange={v=>{setId(v);setAmount(String(remainingInstallment(store,v)));setError('')}} options={available}/></div>
    {id&&<MoneyInput label="مبلغ پرداختی" value={amount} onChange={setAmount} note={'مانده قابل پرداخت: '+money(remaining)}/>}
    <PersianDate minPeriod={store.startPeriod} label="تاریخ واقعی پرداخت" value={date} onChange={setDate}/>
    <SearchSelect label="چه کسی واقعاً پرداخت کرد؟" value={source} onChange={setSource} options={sourceOptions}/>
   </div>
   <details className="payment-help"><summary><Info size={17}/> نحوه محاسبه این پرداخت</summary><p>{!source?'ابتدا مشخص کنید چه کسی پرداخت می‌کند.':source==='fund'?'مبلغ از صندوق اصلی کم می‌شود و دنگ اعضا تغییری نمی‌کند.':source.startsWith('custody:')?'مبلغ از پول صندوق نزد کارت کم می‌شود و دنگ شخصی تغییری نمی‌کند.':'مبلغ پرداختی به اعتبار دنگ همان عضو اضافه می‌شود.'} هزینه قسط دوباره به مخارج خانه اضافه نمی‌شود.</p></details>
   {error&&<div className="form-error" role="alert">{error}</div>}
   <div className="form-footer"><SaveButton>ثبت پرداخت قسط</SaveButton></div>
  </>}
 </form>;
}
function TransferForm({store,save}:{store:Store,save:(e:Event)=>boolean}){
 const [amount,setAmount]=useState(''),[date,setDate]=useState(currentIso()),[from,setFrom]=useState('fund'),[to,setTo]=useState('maryam-card'),[description,setDescription]=useState(''),[error,setError]=useState('');
 function submit(e:React.FormEvent){e.preventDefault();const v=validateAmount(amount);if(v.error)return setError(v.error);if(from===to)return setError('حساب مبدأ و مقصد نمی‌توانند یکسان باشند.');if(save({id:uuid(),kind:'transfer',date,amount:v.n,accountId:from,destinationId:to,description})){setAmount('');setDescription('');setError('')}}
 return <form className="form-section" onSubmit={submit}><div className="form-heading"><h2>انتقال وجه</h2><p>صرفاً جابه‌جایی پول؛ نه هزینه و نه پرداخت دنگ</p></div><div className="form-grid"><MoneyInput label="مبلغ انتقال" value={amount} onChange={setAmount}/><PersianDate minPeriod={store.startPeriod} label="تاریخ انتقال" value={date} onChange={setDate}/><SearchSelect label="از حساب" value={from} onChange={setFrom} options={store.accounts.filter(a=>!store.archivedAccounts.includes(a.id)).map(a=>({value:a.id,label:a.name}))}/><SearchSelect label="به حساب" value={to} onChange={setTo} options={store.accounts.filter(a=>!store.archivedAccounts.includes(a.id)).map(a=>({value:a.id,label:a.name}))}/><TextField label="علت انتقال / شماره پیگیری" value={description} onChange={setDescription} wide placeholder="مثلاً انتقال برای مدیریت نقدینگی"/></div><Notice tone="warning">این عملیات هیچ اعتبار دنگ یا هزینه‌ای ایجاد نمی‌کند. فقط تغییر حساب صندوق در مانده صندوق منعکس می‌شود. برای واریز سهم از «واریز دنگ» و برای بازپرداخت طلب از «تسویه» استفاده کن. مانده واقعی کارت‌های شخصی در MVP مدیریت نمی‌شود.</Notice>{error&&<div className="form-error">{error}</div>}<div className="form-footer"><SaveButton>ثبت انتقال وجه</SaveButton></div></form>
}
function SettlementForm({store,save,period}:{store:Store,save:(e:Event)=>boolean,period:string}){
 const [helpAction,setHelpAction]=useState<'creditMove'|'refund'|'waiver'|null>(null),[action,setAction]=useState<'creditMove'|'refund'|'waiver'>('creditMove'),[member,setMember]=useState('ahmad'),[source,setSource]=useState(period),[target,setTarget]=useState(offsetMonth(period,1)),[date,setDate]=useState(currentIso()),[amount,setAmount]=useState(''),[description,setDescription]=useState(''),[refundAccount,setRefundAccount]=useState((custodyBalances(store)['maryam-card']||0)>0?'maryam-card':'fund'),[error,setError]=useState('');
 const spare=availableSurplus(store,member,source),owed=Math.max(0,obligation(store,member,source)-waived(store,member,source)-memberCredits(store,member,source));
 function submit(e:React.FormEvent){e.preventDefault();const limit=action==='waiver'?owed:spare;const v=validateAmount(amount,limit);if(v.error)return setError(v.error);if(action==='creditMove'&&source===target)return setError('ماه مبدأ و ماه مقصد باید متفاوت باشند.');if(action==='refund'&&refundAccount!=='fund'&&(custodyBalances(store)[refundAccount]||0)<v.n)return setError('اعتبار وجه امانی در حساب انتخابی برای بازپرداخت کافی نیست.');if(!description.trim()&&action==='waiver')return setError('برای بخشودگی، نوشتن دلیل الزامی است.');
  if(action==='waiver'||action==='refund'){
   const heading=action==='waiver'?'بخشودگی بدهی':'بازپرداخت مازاد';
   const note=action==='waiver'?'این مبلغ از بدهی عضو کم می‌شود و وجهی وارد صندوق نمی‌شود.':'این مبلغ از موجودی واقعی صندوق خارج و از اعتبار مازاد عضو کسر می‌شود.';
   if(!window.confirm(`${heading} برای ${memberName(store,member)} به مبلغ ${money(v.n)} در ${monthLabel(source)}؟\n${note}\nپس از ثبت مالی، حذف مستقیم این رویداد مجاز نیست.`))return;
  }
  const base={id:uuid(),date,amount:v.n,memberId:member,description};const tx:Event=action==='creditMove'?{...base,kind:'creditMove',sourcePeriod:source,targetPeriod:target}:action==='refund'?{...base,kind:'refund',period:source,accountId:refundAccount}:{...base,kind:'waiver',period:source};if(save(tx)){setAmount('');setDescription('');setError('')}}
 return <form className="form-section" onSubmit={submit}><div className="form-heading"><h2>تسویه و اصلاح مانده</h2><p>انتقال اعتبار مازاد، بازپرداخت از صندوق یا بخشودگی بدهی</p></div><div className="settlement-selector" aria-label="انتخاب نوع تسویه">{([
  {id:'creditMove',label:'انتقال اعتبار',detail:'اعتبار مازاد یک ماه را به ماه دیگر اختصاص می‌دهد. هیچ پولی بین حساب‌ها جابه‌جا نمی‌شود.',example:'مثال: احمد ۱۰ میلیون تومان دنگ داشته ولی ۱۳ میلیون تومان خرید شخصی خانه انجام داده است؛ ۳ میلیون اعتبار مازاد مهر به آبان منتقل می‌شود و از تعهد آبان کم می‌کند.'},
  {id:'refund',label:'بازپرداخت مازاد',detail:'صندوق به عضو بستانکار پول پرداخت می‌کند و به همان اندازه اعتبار اضافه او مصرف می‌شود. موجودی صندوق باید کافی باشد.',example:'مثال: مریم ۲ میلیون تومان بیشتر از دنگ خود خرج کرده است؛ صندوق ۲ میلیون به او بازمی‌گرداند. موجودی صندوق ۲ میلیون کم می‌شود و طلب مازاد مریم صفر می‌شود.'},
  {id:'waiver',label:'بخشودگی بدهی',detail:'مدیر بخشی از بدهی پرداخت‌نشده عضو را با ذکر دلیل می‌بخشد؛ این عمل واریز وجه نیست و موجودی صندوق را افزایش نمی‌دهد.',example:'مثال: مهدی ۱۰ میلیون تعهد دارد و ۶ میلیون پرداخت کرده است؛ مدیر ۴ میلیون باقی‌مانده را با ذکر دلیل می‌بخشد. مانده بدهی صفر می‌شود و صندوق تغییری نمی‌کند.'}
 ] as const).map(a=><div className="settlement-option" key={a.id}>
  <button type="button" className={`settlement-action ${action===a.id?'active':''}`} aria-pressed={action===a.id} onClick={()=>{setAction(a.id);setAmount('');setError('')}}>{a.label}</button>
  <button type="button" className={`settlement-help-button ${helpAction===a.id?'active':''}`} aria-label={`راهنما و مثال ${a.label}`} title={`راهنما و مثال ${a.label}`} aria-expanded={helpAction===a.id} aria-controls={`help-${a.id}`} onClick={()=>setHelpAction(v=>v===a.id?null:a.id)}><Info size={18}/></button>
  {helpAction===a.id&&<div id={`help-${a.id}`} className="settlement-explanation" role="note"><strong>کاربرد {a.label}</strong><p>{a.detail}</p><strong>مثال کاربردی</strong><p>{a.example}</p></div>}
 </div>)}</div><div className="form-grid"><SearchSelect label="عضو" value={member} onChange={setMember} options={store.members.filter(m=>!store.archivedMembers.includes(m.id)).map(m=>({value:m.id,label:m.name}))}/><SearchSelect label={action==='waiver'?'ماه بدهی':'ماه دارای اعتبار مازاد'} value={source} onChange={setSource} options={periodOptions(source,store.startPeriod)}/>{action==='creditMove'&&<SearchSelect label="ماه مقصد اعتبار" value={target} onChange={setTarget} options={periodOptions(target,store.startPeriod)}/>}<MoneyInput label="مبلغ تسویه" value={amount} onChange={setAmount} note={`حداکثر مجاز بر مبنای مانده فعلی: ${money(action==='waiver'?owed:spare)}`}/><PersianDate minPeriod={store.startPeriod} label="تاریخ عملیات" value={date} onChange={setDate}/>{action==='refund'&&<SearchSelect label="حساب پرداخت‌کننده بازپرداخت" value={refundAccount} onChange={setRefundAccount} options={store.accounts.filter(a=>!store.archivedAccounts.includes(a.id)).map(a=>({value:a.id,label:a.name}))}/>}<TextField label={action==='waiver'?'دلیل بخشودگی (الزامی)':'توضیحات'} value={description} onChange={setDescription} wide placeholder="شرح تصمیم مدیر"/></div><Notice tone={action==='waiver'?'warning':'info'}>{action==='creditMove'?'اعتبار مازاد از ماه مبدأ کسر و به ماه مقصد تخصیص داده می‌شود؛ وجهی جابه‌جا نمی‌شود.':action==='refund'?'مبلغ از موجودی صندوق خارج می‌شود و اعتبار مازاد همان ماه کاهش می‌یابد.':'بدهی قابل وصول عضو کاهش می‌یابد، اما وجهی به صندوق وارد نمی‌شود.'}</Notice>{action==='refund'&&<div className="settlement-available-fund">موجودی فعلی صندوق: <strong>{money(fundBalance(store))}</strong></div>}{error&&<div className="form-error">{error}</div>}<div className="form-footer"><SaveButton>ثبت تصمیم تسویه</SaveButton></div></form>
}
function Dashboard({store,period,openOperation,navigate,onTravel,openAudit}:{store:Store,period:string,openOperation:(id:Operation)=>void,navigate:(p:Page)=>void,onTravel:()=>void,openAudit:(section:AuditSection,memberId?:string)=>void}){
 const stats=useMemo(()=>periodStatistics(store,period),[store,period]);
const categories=expenseByCategory(store,period).slice(0,6),flow=periodFlow(store,period),upcoming=store.plans.flatMap(p=>p.installments.map(i=>({...i,title:p.title,provider:p.provider,remaining:remainingInstallment(store,i.id)}))).filter(i=>i.remaining>0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,4);
 const max=Math.max(1,...categories.map(c=>c.value));
 return <div className="page-block"><section className="travel-entry-banner"><div><span>فضای جداگانه برای سفرها</span><strong>دُنگ سفر · دوستانه و خانوادگی</strong><small>ثبت خرج، سهم همسفران و تسویه؛ بدون تأثیر بر صندوق خانه</small></div><button type="button" className="btn btn-primary" onClick={onTravel}>ورود به دُنگ سفر ←</button></section><div className="welcome"><div><div className="eyebrow">گزارش مالی خانواده {store.closedPeriods.includes(period)?' · 🔒 ماه بسته':''}</div><h1>داشبورد دُنگ <span>✦</span></h1><p>نمای یکپارچه صندوق، سهم اعضا و تعهدات اقساطی در {monthLabel(period)}</p></div><button className="btn btn-hero" onClick={()=>openOperation('purchase')}><Plus size={18}/> ثبت تراکنش</button></div><AuditSummaryCards store={store} period={period} onSelect={openAudit}/><div className="dashboard-columns"><section className="card"><PanelTitle icon={Users} title="وضعیت دنگ اعضا" meta={monthLabel(period)}/><div className="member-list">{stats.memberStats.map(m=><button type="button" className="member-row member-row-action" key={m.id} aria-label={"دیدن صورت‌حساب کامل "+m.name} onClick={()=>openAudit("member",m.id)}><div className="person"><span className="avatar">{m.name[0]}</span><div><strong>{m.name}</strong><small>{m.required>0?'تعهد: '+money(m.required):'معاف از پرداخت این ماه'}</small></div></div><div className="member-finance"><strong className={m.remain>0?'negative':m.surplus>0?'positive':''}>{m.remain>0?`بدهی ${money(m.remain)}`:m.surplus>0?`بستانکار ${money(m.surplus)}`:'تسویه / معاف'}</strong><small>ماه‌های قبل: {money(m.previous)}</small></div><Progress max={Math.max(1,m.required-m.forgiven)} value={m.credit}/></button>)}</div>
 /section><section className="card"><PanelTitle icon={ChartNoAxesCombined} title="ترکیب هزینه‌ها" meta="براساس سررسید"/>{categories.length===0?<div className="empty-state"><ChartNoAxesCombined size={34}/><strong>هنوز هزینه‌ای ثبت نشده</strong><small>با ثبت خرید یا قرارداد اقساطی، نمودار هزینه شکل می‌گیرد.</small></div>:<div className="category-chart">{categories.map(c=><div className="chart-row" key={c.name}><div className="chart-row-header"><strong>{c.name}</strong><span>{money(c.value)}</span></div><div className="chart-track"><i style={{width:`${Math.max(3,c.value/max*100)}%`}}/></div></div>)}</div>}<div className="flow-summary"><div><span>ورودی نقدی ماه</span><strong className="positive">+ {money(flow.in)}</strong></div><div><span>خروجی نقدی ماه</span><strong className="negative">− {money(flow.out)}</strong></div></div></section></div><div className="dashboard-columns bottom-grid"><section className="card"><div className="panel-title"><div className="panel-title-label"><CalendarClock size={19}/><h3>اقساط باقی‌مانده</h3></div><button className="text-action" onClick={()=>navigate('installments')}>مشاهده همه <ChevronLeft size={14}/></button></div>{upcoming.length===0?<p className="muted space">قسط فعالی ثبت نشده است.</p>:<div className="installment-mini">{upcoming.map(i=><div key={i.id}><span className="tiny-icon"><CalendarDays size={16}/></span><div><b>{i.title}</b><small>{i.provider} · {jalaliLabel(i.dueDate)}</small></div><strong>{money(i.remaining)}</strong></div>)}</div>}</section><section className="card"><PanelTitle icon={Wallet} title="عملیات سریع"/><div className="quick-actions">{operations.map(op=><button type="button" key={op.id} onClick={()=>openOperation(op.id)}><op.icon size={19}/><span>{op.label}</span><ChevronLeft size={14}/></button>)}</div></section></div><div className="safety-strip"><ShieldAlert size={18}/><span>اطلاعات شما فقط روی همین گوشی نگهداری می‌شود. برای جلوگیری از پاک‌شدن آن‌ها، از بخش تنظیمات یک نسخه پشتیبان در محل امن ذخیره کنید.</span></div></div>
}
function InstallmentsView({store,onPay}:{store:Store,onPay:(installmentId?:string)=>void}){
 const [query,setQuery]=useState('');const [status,setStatus]=useState('all');
 const rows=store.plans.flatMap(p=>p.installments.map((i,index)=>{const remaining=remainingInstallment(store,i.id);return {...i,index:index+1,remaining,plan:p}})).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
 const filtered=rows.filter(r=>(`${r.plan.title} ${r.plan.provider} ${memberName(store,r.plan.creditOwnerId)}`).includes(query)&& (status==='all'||(status==='paid'?r.remaining===0:status==='open'?r.remaining>0:status==='overdue'?r.remaining>0&&r.dueDate<currentIso():true)));
 const left=rows.filter(r=>r.remaining>0).reduce((a,r)=>a+r.remaining,0),overdue=rows.filter(r=>r.remaining>0&&r.dueDate<currentIso()).length;
 return <div className="page-block"><div className="page-heading"><div><h1>مدیریت اقساط</h1><p>تفکیک سررسید، مالک حساب و پرداخت واقعی</p></div><button className="btn btn-primary" onClick={()=>onPay()}><Plus size={17}/> پرداخت قسط</button></div><div className="strip-stats"><div><span>مانده تعهد اقساط</span><b>{money(left)}</b></div><div><span>تعداد سررسیدهای معوق</span><b>{fnum(overdue)}</b></div><div><span>قراردادهای ثبت‌شده</span><b>{fnum(store.plans.length)}</b></div></div><section className="card"><div className="filter-row"><div className="searchbox"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جست‌وجوی کالا، سرویس یا صاحب اعتبار..."/></div><div className="compact-select"><SearchSelect label="وضعیت" value={status} onChange={setStatus} options={[{value:'all',label:'همه'},{value:'open',label:'پرداخت‌نشده'},{value:'paid',label:'تسویه‌شده'},{value:'overdue',label:'معوق'}]}/></div></div>{filtered.length===0?<div className="empty-state"><CalendarClock size={34}/><strong>قسطی با این مشخصات وجود ندارد</strong><small>قرارداد جدید را از صفحه عملیات ثبت کن.</small></div>:<div className="records">{filtered.map(r=><div className="record" key={r.id}><div className="record-icon"><CalendarClock size={18}/></div><div className="record-main"><b>{r.plan.title} — قسط {fnum(r.index)}</b><small>{r.plan.provider} · اعتبار {memberName(store,r.plan.creditOwnerId)} · سررسید {jalaliLabel(r.dueDate)}</small></div><div className="record-amount"><b>{money(r.amount)}</b><small className={r.remaining===0?'positive':r.dueDate<currentIso()?'negative':''}>{r.remaining===0?'تسویه‌شده':`مانده ${money(r.remaining)}`}</small>{r.remaining>0&&<button type="button" className="btn btn-primary installment-pay-direct" onClick={()=>onPay(r.id)}>پرداخت این قسط</button>}</div></div>)}</div>}</section></div>
}
function EventTitle(e:Event,s:Store){switch(e.kind){case'obligationAdjust':return 'تعدیل تعهد ماهانه';case'reversal':return 'ابطال سند قبلی';case'purchase':return `خرید ${e.category}`;case'deposit':return `واریز دنگ ${memberName(s,e.memberId)}`;case'payment':return `پرداخت قسط ${s.plans.find(p=>p.installments.some(i=>i.id===e.installmentId))?.title||''}`;case'transfer':return'انتقال وجه';case'waiver':return'بخشودگی بدهی';case'creditMove':return'انتقال اعتبار بین ماه‌ها';case'refund':return'بازپرداخت طلب عضو'}}
function EventDescription(e:Event,s:Store){switch(e.kind){case'obligationAdjust':return 'تعدیل تعهد ماهانه';case'reversal':return 'ابطال سند قبلی';case'purchase':return `${accountName(s,e.accountId)}${e.accountId==='fund'?'':` · پرداخت‌کننده ${memberName(s,e.paidById)}`}`;case'deposit':return `دنگ ${monthLabel(e.period)} · ${e.destinationId?'مقصد':'مبدأ'} ${accountName(s,e.accountId)}${e.creditOnly?' · اعتبار تاریخی بدون ورود وجه':''}`;case'payment':return `${e.accountId===MEMBER_CASH_ACCOUNT?'پرداخت شخصی '+memberName(s,e.paidById):accountName(s,e.accountId)} · سررسید ثبت‌شده`;case'transfer':return `${accountName(s,e.accountId)} ← ${accountName(s,e.destinationId)}`;case'waiver':return `${memberName(s,e.memberId)} · ${monthLabel(e.period)}`;case'creditMove':return `${memberName(s,e.memberId)} · ${monthLabel(e.sourcePeriod)} ← ${monthLabel(e.targetPeriod)}`;case'refund':return `${memberName(s,e.memberId)} · از ${accountName(s,e.accountId||'fund')}`}}
function HistoryView({store,onReverse}:{store:Store,onReverse:(id:string,reason:string,replacement?:Event)=>Promise<void>}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const reversalByOriginal=new Map(store.events.filter((event):event is Extract<Event,{kind:'reversal'}>=>event.kind==='reversal').map(event=>[event.originalId,event] as const));
 const mapLabels:Record<string,string>={obligationAdjust:'تعدیل تعهد',cancelled:'باطل‌شده',purchase:'خرید',deposit:'واریز دنگ',payment:'پرداخت قسط',transfer:'انتقال',creditMove:'انتقال اعتبار',waiver:'بخشودگی',refund:'بازپرداخت'};
 const rows=store.events.filter(event=>{
  if(event.kind==='reversal')return false; // Audit evidence remains in SQLite, not a duplicate history row.
  if(filter!=='all'&&(filter==='cancelled'?!reversalByOriginal.has(event.id):event.kind!==filter))return false;
  return (`${EventTitle(event,store)} ${EventDescription(event,store)} ${event.description||''} ${reversalByOriginal.has(event.id)?'باطل‌شده':''}`).includes(query);
 }).slice().reverse();
 const [pending,setPending]=useState<Event|null>(null),[pendingAction,setPendingAction]=useState<'cancel'|'correct'>('cancel'),[correctedValue,setCorrectedValue]=useState(''),[dialogError,setDialogError]=useState('');
 function confirmReversal(event:Event){setPending(event);setPendingAction('cancel');setDialogError('')}
 function correctAmount(event:Event){if(event.kind==='reversal')return;setPending(event);setPendingAction('correct');setCorrectedValue(String(event.amount));setDialogError('')}
 function confirmHistoryChange(){
  if(!pending)return;
  if(pendingAction==='cancel'){void onReverse(pending.id,'ابطال با تأیید مدیر');setPending(null);return}
  if(pending.kind==='reversal')return;
  const amount=parseToman(correctedValue);
  if(!safeToman(amount)||amount===pending.amount){setDialogError('مبلغ جدید باید عددی معتبر و متفاوت با مبلغ فعلی باشد.');return}
  void onReverse(pending.id,'اصلاح مبلغ با تأیید مدیر',{...pending,id:uuid(),amount});
  setPending(null);
 }
 return <div className="page-block">
  <div className="page-heading"><div><h1>تاریخچه مالی</h1><p>تمام اسناد و اصلاحات مالی ثبت‌شده</p></div><span className="count-badge">{fnum(rows.length)} سند</span></div>
  <section className="card">
   <div className="filter-row"><div className="searchbox"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جست‌وجوی شرح، عضو یا حساب..."/></div><div className="compact-select"><SearchSelect label="نوع عملیات" value={filter} onChange={setFilter} options={[{value:'all',label:'همه عملیات'},...Object.entries(mapLabels).map(([value,label])=>({value,label}))]}/></div></div>
   {rows.length===0?<div className="empty-state"><History size={34}/><strong>سابقه‌ای پیدا نشد</strong><small>تراکنش‌های ثبت‌شده در این صفحه نمایش داده می‌شوند.</small></div>:
   <div className="records">{rows.map(event=>{
    const cancelled=reversalByOriginal.get(event.id);
    return <div className={`record record-kind-${cancelled?'reversal':event.kind} ${cancelled?'reversed-record':''}`} key={event.id}>
     <div className="record-icon"><ReceiptText size={18}/></div>
     <div className="record-main"><b>{EventTitle(event,store)} {cancelled&&<span className="cancelled-stamp">باطل‌شده</span>}</b>
      <small>{EventDescription(event,store)}</small>{event.description&&<small>توضیحات: {event.description}</small>}
      {cancelled&&<small>علت ابطال: {cancelled.reason} · بدون اثر در محاسبات</small>}
     </div>
     <div className="record-amount"><b>{money(event.amount)}</b><small>{jalaliLabel(event.date)}</small>
      {!cancelled&&<button type="button" className="btn btn-outline small-action" onClick={()=>confirmReversal(event)}>ابطال</button>}
      {!cancelled&&<button type="button" className="btn btn-outline small-action" onClick={()=>correctAmount(event)}>اصلاح مبلغ</button>}
     </div>
    </div>})}</div>}
  </section>
  <Notice>سند باطل‌شده برای بررسی حفظ می‌شود، اما دیگر در محاسبات اثر ندارد.</Notice>
  {pending&&<div className="dong-dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPending(null)}}>
    <section role="dialog" aria-modal="true" aria-labelledby="history-dialog-title" className="dong-dialog" onKeyDown={e=>{if(e.key==='Escape')setPending(null)}}>
      <div className="dong-dialog-heading"><Info size={23}/><h2 id="history-dialog-title">{pendingAction==='cancel'?'تأیید ابطال سند':'اصلاح مبلغ ثبت‌شده'}</h2></div>
      <p>{EventTitle(pending,store)} · {money(pending.amount)}</p>
      {pendingAction==='cancel'?<p>اثر مالی این سند برداشته می‌شود؛ سابقه آن برای بررسی باقی می‌ماند.</p>:<><MoneyInput label="مبلغ صحیح به تومان" value={correctedValue} onChange={setCorrectedValue}/><p>سند فعلی باطل می‌شود و سند اصلاح‌شده جای آن را می‌گیرد.</p></>}
      {dialogError&&<p className="dong-dialog-error" role="alert">{dialogError}</p>}
      <div className="dong-dialog-actions"><button type="button" autoFocus className="btn btn-outline" onClick={()=>setPending(null)}>انصراف</button><button type="button" className="btn btn-primary" onClick={confirmHistoryChange}>{pendingAction==='cancel'?'ابطال سند':'ثبت اصلاح'}</button></div>
    </section>
  </div>}
 </div>
}
function OperationsView({store,operation,setOperation,save,saveMany,savePlan,period,paymentSelection}:{store:Store,operation:Operation,setOperation:(op:Operation)=>void,save:(e:Event)=>boolean,saveMany:(e:Event[])=>boolean,savePlan:(p:Plan)=>boolean,period:string,paymentSelection:string}){
 return <div className="page-block"><div className="page-heading"><div><h1>ثبت عملیات مالی</h1><p>هر عملیات فرم و مسیر مخصوص خودش را دارد</p></div><span className="count-badge">۶ عملیات</span></div><div className="operation-shell"><div className="operation-tabs">{operations.map(o=><button type="button" key={o.id} className={operation===o.id?'active':''} onClick={()=>setOperation(o.id)}><span className="op-icon"><o.icon size={19}/></span><span className="op-copy"><b>{o.label}</b><small>{o.sub}</small></span></button>)}</div><section className="card operation-form" key={operation==='payment'?'payment:'+paymentSelection:operation}>{operation==='purchase'?<PurchaseForm store={store} saveMany={saveMany} period={period}/>:operation==='deposit'?<DepositForm store={store} saveMany={saveMany} period={period}/>:operation==='plan'?<PlanForm store={store} save={savePlan}/>:operation==='payment'?<PaymentForm store={store} save={save} initialInstallmentId={paymentSelection}/>:operation==='transfer'?<TransferForm store={store} save={save}/>:<SettlementForm store={store} save={save} period={period}/>}</section></div></div>
}
function App(){
 const [space,setSpace]=useState<'house'|'travel'>('house');
 const [auditSection,setAuditSection]=useState<AuditSection>('cash');
 const [auditMemberId,setAuditMemberId]=useState('');
 function openAudit(section:AuditSection,memberId=''){setAuditSection(section);setAuditMemberId(memberId);setPage('audit');setToast('')}
  const [paymentSelection,setPaymentSelection]=useState('');
 const [store,setStore]=useState<Store>(()=>structuredClone(initialStore)),[loaded,setLoaded]=useState(false),[page,setPage]=useState<Page>('dashboard'),[operation,setOperation]=useState<Operation>('purchase'),[period,setPeriod]=useState(jalaliKey(currentIso())),[toast,setToast]=useState(''),[failure,setFailure]=useState(''),[saveState,setSaveState]=useState('در حال باز کردن پایگاه داده...');
 const predicted=useRef<Store>(structuredClone(initialStore)),persisted=useRef<Store>(structuredClone(initialStore)),queue=useRef<Promise<void>>(Promise.resolve()),failed=useRef(false);
 useEffect(()=>{let mounted=true;loadStore().then(s=>{if(!mounted)return;predicted.current=s;persisted.current=s;setStore(s);setLoaded(true);setSaveState('اطلاعات آماده است')}).catch(e=>{if(!mounted)return;setFailure('دسترسی به اطلاعات برنامه ممکن نشد. از تنظیمات گوشی برنامه را حذف نکنید؛ برای بررسی مشکل از فایل پشتیبان استفاده کنید.');setSaveState('خطا در خواندن اطلاعات');window.dongStartup?.fail(e)});return()=>{mounted=false}},[]);
 useEffect(()=>{if(loaded)window.dongStartup?.ready()},[loaded]);
 useEffect(()=>{if(loaded&&period<store.startPeriod)setPeriod(store.startPeriod)},[loaded,period,store.startPeriod]);
 useEffect(()=>{window.scrollTo(0,0)},[page]);
  useEffect(()=>{if(!toast.includes('با موفقیت'))return;const timer=window.setTimeout(()=>setToast(current=>current===toast?'':current),6000);return()=>window.clearTimeout(timer)},[toast]);
 function commit(next:Store,successMessage=''){if(!loaded||failed.current)return;predicted.current=next;setStore(next);setSaveState('در حال ثبت تغییرات…');queue.current=queue.current.then(async()=>{if(failed.current)return;const result=await saveStore(next);persisted.current=next;if(!failed.current){setSaveState(result.backupWarning?'ثبت شد؛ پشتیبان داخلی نیاز به بررسی دارد.':'تغییرات ذخیره شد');if(successMessage)setToast(result.backupWarning?`${successMessage} ثبت شد؛ ${result.backupWarning}`:`${successMessage} با موفقیت ثبت شد.`)}}).catch(e=>{failed.current=true;predicted.current=persisted.current;setStore(persisted.current);setFailure('ذخیره اطلاعات انجام نشد. برای حفاظت از حساب‌ها، ثبت عملیات موقتاً متوقف شده است؛ هیچ داده‌ای را پاک نکنید.');setSaveState('ذخیره انجام نشد');setToast('ثبت عملیات ناموفق بود؛ اطلاعات به آخرین وضعیت ذخیره‌شده برگشت.')});}
 function update(updater:(s:Store)=>Store){if(!loaded||failed.current)return;commit(updater(predicted.current))}
 async function replace(s:Store){if(failed.current)throw Error('ذخیره اطلاعات با مشکل روبه‌رو شده؛ ابتدا آن را برطرف کنید.');await queue.current;await restoreStore(s);predicted.current=s;persisted.current=s;setStore(s);setSaveState('اطلاعات بازیابی و ذخیره شد.');setToast('بازیابی با موفقیت انجام شد.');}
 async function lockedAction(fn:()=>Promise<Store>){try{await queue.current;const s=await fn();predicted.current=s;persisted.current=s;setStore(s);setToast('تغییرات مالی با موفقیت ثبت شد.')}catch(e){setToast('خطا: '+String(e))}}
 function reverse(id:string,reason:string,replacement?:Event){return lockedAction(()=>reverseFinancialEvent(id,reason,replacement))}
 function lockPeriod(p:string,locked:boolean,reason:string){return lockedAction(()=>setPeriodLock(p,locked,reason))}
 function adjustObligation(m:string,p:string,n:number,reason:string){return lockedAction(()=>reviseMonthlyObligation(m,p,n,reason))}
 function changeStartPeriod(start:string){if(!loaded||failed.current)return;try{const prior=predicted.current;assertStartPeriodChange(prior,start);if(prior.startPeriod===start)return;commit({...prior,startPeriod:start},'شروع دوره دنگ');setPeriod(p=>p<start?start:p)}catch(e){setToast('تغییر شروع دوره انجام نشد: '+String(e))}}
 function saveMany(events:Event[]){if(!loaded||failed.current)return false;let next=predicted.current;try{validateDepositBatch(next,events,currentIso())}catch(ex){setToast(String(ex));return false}for(const e of events){if(jalaliKey(e.date)<next.startPeriod||('creditPeriod' in e&&e.creditPeriod<next.startPeriod)||('period' in e&&e.period<next.startPeriod)||('sourcePeriod' in e&&e.sourcePeriod<next.startPeriod)||('targetPeriod' in e&&e.targetPeriod<next.startPeriod)){setToast(`ثبت رویداد مالی قبل از ${monthLabel(next.startPeriod)} مجاز نیست.`);return false}if(next.closedPeriods.some(p=>[periodOf(e.date),('period' in e?e.period:''),('creditPeriod' in e?e.creditPeriod:''),('sourcePeriod' in e?e.sourcePeriod:''),('targetPeriod' in e?e.targetPeriod:'')].includes(p))){setToast('ماه مالی قفل است؛ برای ثبت ابتدا با دلیل آن را باز کن.');return false}if(e.kind==='payment'&&e.amount>remainingInstallment(next,e.installmentId)){setToast('مبلغ پرداخت از مانده قسط بیشتر است.');return false}if(e.kind==='creditMove'&&e.sourcePeriod===e.targetPeriod){setToast('ماه مقصد نمی‌تواند با ماه مبدأ یکسان باشد.');return false}if((e.kind==='refund'||e.kind==='creditMove')&&availableSurplus(next,e.memberId,e.kind==='refund'?e.period:e.sourcePeriod)<e.amount){setToast('اعتبار مازاد کافی نیست.');return false}if(!canRegister(next,e)){setToast('موجودی صندوق برای ثبت این عملیات کافی نیست.');return false}next={...next,events:[...next.events,e]}}const name=events.length>1?'عملیات مالی گروهی':({purchase:'خرید',deposit:'واریز دنگ',payment:'پرداخت قسط',transfer:'انتقال وجه',creditMove:'انتقال اعتبار',refund:'بازپرداخت',waiver:'بخشودگی بدهی'} as Record<string,string>)[events[0].kind]||'عملیات مالی';commit(next,name);setToast('در حال ثبت عملیات…');return true}
 function save(e:Event){return saveMany([e])}
 function savePlan(p:Plan){if(jalaliKey(p.createdDate)<predicted.current.startPeriod||p.installments.some(i=>jalaliKey(i.dueDate)<predicted.current.startPeriod)){setToast(`قرارداد قبل از ${monthLabel(predicted.current.startPeriod)} مجاز نیست.`);return false}if(predicted.current.closedPeriods.some(month=>month===periodOf(p.createdDate)||p.installments.some(i=>periodOf(i.dueDate)===month))){setToast('دوره مالی قرارداد یا اقساط آن قفل است.');return false}if(p.installments.reduce((a,i)=>a+i.amount,0)!==p.total){setToast('مجموع اقساط با مبلغ خرید برابر نیست.');return false}commit({...predicted.current,plans:[...predicted.current.plans,p]},'قرارداد اقساطی');setToast('در حال ثبت قرارداد اقساط…');return true}
 function syncRestored(s:Store){predicted.current=s;persisted.current=s;setStore(s);setSaveState('اطلاعات بازیابی شد')}
 function openOperation(o:Operation,installmentId=''){setPaymentSelection(installmentId);setOperation(o);setPage('operations');setToast('')}
 const navigation:{id:Page,label:string,icon:React.ElementType}[]=[{id:'dashboard',label:'داشبورد',icon:LayoutDashboard},{id:'operations',label:'ثبت عملیات',icon:Plus},{id:'installments',label:'اقساط',icon:CalendarClock},{id:'history',label:'تاریخچه',icon:History},{id:'settings',label:'تنظیمات',icon:Settings}];
 if(!loaded)return <div className="loading-screen" dir="rtl"><img className="loading-brand" src="./brand/dang-logo.png" alt="دُنگ"/><p>{failure||saveState}</p></div>;
 if(space==='travel')return <div className="app-shell travel-shell" dir="rtl"><aside className="sidebar"><div className="brand"><img className="brand-symbol" src="./brand/dang-icon.png" alt="دُنگ"/><div><b>دُنگ سفر</b><small>سفرهای دوستانه و خانوادگی</small></div></div><div className="side-caption">فضای مستقل سفر</div><nav className="sidebar-nav"><button type="button" className="active" onClick={()=>{}}><House size={19}/> دُنگ سفر</button><button type="button" onClick={()=>{setSpace('house');setPage('dashboard')}}><ArrowLeftRight size={19}/> دُنگ خانه</button></nav><div className="sidebar-bottom"><div className="version-label">Dong 1.0.5 · سفرهای دوستانه و خانوادگی</div></div></aside><div className="main-area"><header className="topbar"><div className="topbar-location"><img className="topbar-logo" src="./brand/dang-icon.png" alt="دُنگ"/><span>دُنگ سفر</span></div><div className="topbar-actions"><button className="btn btn-outline small-action" type="button" onClick={()=>{setSpace('house');setPage('dashboard')}}>خانه</button></div></header><main className="content"><TravelView onHome={()=>{setSpace('house');setPage('dashboard')}}/></main><footer className="footer">دُنگ سفر · پایگاه داده و تسویه مستقل از صندوق خانه</footer></div><nav className="mobile-nav"><button type="button" className="active"><Wallet size={19}/><small>دُنگ سفر</small></button><button type="button" onClick={()=>{setSpace('house');setPage('dashboard')}}><House size={19}/><small>دُنگ خانه</small></button></nav></div>;
 return <div className="app-shell" dir="rtl"><aside className="sidebar"><div className="brand"><img className="brand-symbol" src="./brand/dang-icon.png" alt=""/><div><img className="brand-wordmark" src="./brand/dang-wordmark.png" alt="دُنگ"/><span>حساب‌وکتاب خانه</span></div></div><div className="side-caption">منوی اصلی</div><nav className="sidebar-nav">{navigation.map(n=><button className={page===n.id?'active':''} type="button" key={n.id} onClick={()=>{setPage(n.id);setToast('')}}><n.icon size={19}/><span>{n.label}</span>{page===n.id&&<span className="nav-indicator"/>}</button>)}</nav><div className="sidebar-bottom"><div className="version-label"><span className="version-dot"/> نسخه رسمی ۱.۰.۵ · کاملاً آفلاین</div><div className="sidebar-wallet"><small>مانده صندوق</small><strong>{money(fundBalance(store))}</strong><span>تمام مبالغ به تومان</span></div></div></aside><div className="main-area"><header className="topbar"><div className="topbar-location"><img className="topbar-logo" src="./brand/dang-icon.png" alt="دُنگ"/><span>{page==='audit'?'جزئیات مالی':navigation.find(n=>n.id===page)?.label}</span></div><div className="topbar-actions"><small className="db-status" aria-live="polite">{saveState}</small><div className="period-top"><SearchSelect label="دوره مالی" value={period} onChange={setPeriod} options={periodOptions(period,store.startPeriod)}/></div><span className="admin-avatar" title="مدیر">ا</span></div></header><main className="content">{page==='dashboard'?<Dashboard store={store} period={period} openOperation={openOperation} navigate={setPage} onTravel={()=>setSpace('travel')} openAudit={openAudit}/>:page==='operations'?<OperationsView store={store} operation={operation} setOperation={setOperation} save={save} saveMany={saveMany} savePlan={savePlan} period={period} paymentSelection={paymentSelection}/>:page==='installments'?<InstallmentsView store={store} onPay={id=>openOperation('payment',id)}/>:page==='history'?<HistoryView store={store} onReverse={reverse}/>:page==='audit'?<AuditDetailView store={store} period={period} section={auditSection} memberId={auditMemberId} onBack={()=>setPage('dashboard')} onMember={id=>openAudit('member',id)}/>:<SettingsView store={store} update={update} period={period} replace={replace} lockPeriod={lockPeriod} adjustObligation={adjustObligation} setStartPeriod={changeStartPeriod} reloadAfterDirectRestore={syncRestored}/>}</main><footer className="footer">دُنگ · حساب‌وکتاب خانه، کنار هم · پشتیبان مستقل بدون رمز را در محل امن نگه دار.</footer></div><nav className="mobile-nav">{navigation.map(n=><button type="button" className={page===n.id?'active':''} key={n.id} onClick={()=>{setPage(n.id);setToast('')}}><span className="mobile-nav-icon"><n.icon size={20}/></span><small>{n.label}</small></button>)}</nav>{toast&&<div className={"toast "+(toast.includes("خطا")||toast.includes("ناموفق")||toast.includes("مجاز نیست")?"toast-error":toast.includes("در حال")?"toast-pending":"toast-success")} role="status" aria-live="polite"><Info size={18}/>{toast}<button aria-label="بستن پیام" onClick={()=>setToast('')}>×</button></div>}{failure&&<div className="storage-failure" role="alert"><AlertTriangle size={17}/>{failure}</div>}</div>
}

class StartupBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error:Error){window.dongStartup?.fail(error)}
 render(){return this.state.failed?null:this.props.children}
}
createRoot(document.getElementById('root')!).render(<StartupBoundary><App/></StartupBoundary>);