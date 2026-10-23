import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowLeftRight,CalendarDays,Check,Download,FileUp,Hotel,Plus,ReceiptText,ShieldCheck,Users,Wallet} from 'lucide-react';
import {MoneyInput,SearchSelect,TextField,PersianDate} from './controls';
import {currentIso,fnum,jalaliLabel,parseToman} from './utils';
import {loadTravel,saveTravel,restoreTravel,listTravelSnapshots,readTravelSnapshot} from './database';
import {isNativeAndroid,saveAndroidDocument} from './native-bridge';
// @ts-ignore JS domain module tested by Node and Android CI
import {TRAVEL_CATEGORIES,EMPTY_TRAVEL,validateTravel,validateTravelChange,summarizeTrip} from './travel-ledger.mjs';
type Participant={id:string,name:string};
type Expense={id:string,date:string,amount:number,category:string,paidBy:string,forMembers:string[],note:string};
type Settlement={id:string,date:string,amount:number,from:string,to:string,note:string};
type Trip={id:string,name:string,kind:'friends'|'family',date:string,participants:Participant[],expenses:Expense[],settlements:Settlement[]};
type Travel={version:1,trips:Trip[]};
type Tab='overview'|'expense'|'settlement'|'backup';
const uuid=()=>crypto.randomUUID();
const toman=(n:number)=>fnum(n)+' تومان';
const bytes=async(text:string)=>{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('')};
const getName=(t:Trip,id:string)=>t.participants.find(p=>p.id===id)?.name||'—';
function participantItems(t:Trip){return t.participants.map(p=>({value:p.id,label:p.name}))}
export function TravelView({onHome}:{onHome:()=>void}){
 const [travel,setTravel]=useState<Travel>(()=>structuredClone(EMPTY_TRAVEL) as Travel);
 const [rev,setRev]=useState(0),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [selected,setSelected]=useState(''),[tab,setTab]=useState<Tab>('overview');
 const [newName,setNewName]=useState(''),[newPeople,setNewPeople]=useState(''),[newKind,setNewKind]=useState<'friends'|'family'>('friends'),[newDate,setNewDate]=useState(currentIso());
 const [category,setCategory]=useState<string>(TRAVEL_CATEGORIES[0]),[amount,setAmount]=useState(''),[paidBy,setPaidBy]=useState(''),[forMembers,setForMembers]=useState<string[]>([]),[expenseDate,setExpenseDate]=useState(currentIso()),[description,setDescription]=useState('');
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[settledAmount,setSettledAmount]=useState(''),[settleDate,setSettleDate]=useState(currentIso()),[settleNote,setSettleNote]=useState('');
 const [snapshots,setSnapshots]=useState<{revision:number,createdAt:string}[]>([]),[snapshot,setSnapshot]=useState('');
 const submitting=useRef(false);
 useEffect(()=>{let mounted=true;loadTravel().then(x=>{if(!mounted)return;validateTravel(x.travel);setTravel(x.travel as Travel);setRev(x.revision);setReady(true);setSelected((x.travel as Travel).trips[0]?.id||'')}).catch(e=>{if(mounted){setError(String(e));setReady(true)}});return()=>{mounted=false}},[]);
 const trip=travel.trips.find(t=>t.id===selected)||travel.trips[0];
 const financial=useMemo(()=>trip?summarizeTrip(trip):null,[trip]);
 const people=trip?participantItems(trip):[];
 useEffect(()=>{if(!trip)return;setPaidBy(p=>trip.participants.some(m=>m.id===p)?p:trip.participants[0].id);setForMembers(trip.participants.map(m=>m.id));setFrom('');setTo('');setSettledAmount('')},[trip?.id]);
 async function save(next:Travel,message:string,restore=false){
  if(submitting.current)return false;submitting.current=true;setBusy(true);setError('');setNotice('');
  try{
   if(restore)validateTravel(next);else validateTravelChange(travel,next);
   const saved=restore?await restoreTravel(next,rev):await saveTravel(next,rev);
   setTravel(saved.travel as Travel);setRev(saved.revision);setNotice(message+'؛ در SQLite سفر ذخیره شد.');
   return true;
  }catch(e){setError(e instanceof Error?e.message:String(e));return false}
  finally{submitting.current=false;setBusy(false)}
 }
 async function createTrip(){
  const parts=newPeople.split(/[,،\n]+/).map(x=>x.trim()).filter(Boolean);
  if(!newName.trim()||parts.length<2||new Set(parts).size!==parts.length){setError('عنوان سفر و حداقل دو نام غیرتکراری لازم است. اسامی را با ویرگول جدا کن.');return}
  const nextTrip:Trip={id:uuid(),name:newName.trim(),kind:newKind,date:newDate,participants:parts.map(name=>({id:uuid(),name})),expenses:[],settlements:[]};
  const ok=await save({...travel,trips:[...travel.trips,nextTrip]},'سفر جدید ثبت شد');
  if(ok){setSelected(nextTrip.id);setNewName('');setNewPeople('');setTab('expense')}
 }
 async function addExpense(){
  if(!trip)return;const value=parseToman(amount);
  if(!Number.isSafeInteger(value)||value<=0||forMembers.length===0){setError('مبلغ معتبر و حداقل یک نفر برای تقسیم هزینه لازم است.');return}
  const e:Expense={id:uuid(),date:expenseDate,amount:value,category,paidBy,forMembers:[...forMembers],note:description.trim()};
  const next:Travel={...travel,trips:travel.trips.map(t=>t.id===trip.id?{...t,expenses:[...t.expenses,e]}:t)};
  if(await save(next,'خرج '+category+' ثبت شد')){setAmount('');setDescription('')}
 }
 async function addSettlement(){
  if(!trip||!financial)return;const value=parseToman(settledAmount);
  if(!Number.isSafeInteger(value)||value<=0||!from||!to){setError('بدهکار، طلبکار و مبلغ تسویه را مشخص کن.');return}
  const s:Settlement={id:uuid(),date:settleDate,amount:value,from,to,note:settleNote.trim()};
  const next:Travel={...travel,trips:travel.trips.map(t=>t.id===trip.id?{...t,settlements:[...t.settlements,s]}:t)};
  if(await save(next,'تسویه ثبت شد')){setSettledAmount('');setSettleNote('')}
 }
 async function exportBackup(){
  setError('');setNotice('');
  try{
   const payload=JSON.stringify(travel),digest=await bytes(payload);
   const envelope=JSON.stringify({format:'dong-travel-backup',version:1,createdAt:new Date().toISOString(),sha256:digest,travel},null,2);
   const name='dong-travel-'+new Date().toISOString().slice(0,10)+'.dongtrip';
   if(isNativeAndroid())await saveAndroidDocument(name,envelope);
   else{
    const url=URL.createObjectURL(new Blob([envelope],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
   }
   setNotice('فایل پشتیبان مستقل دنگ سفر ذخیره شد. فایل بدون رمز است؛ در محل امن نگهدار.');
  }catch(e){setError(String(e))}
 }
 async function importBackup(file?:File){
  if(!file)return;
  try{
   if(file.size>12_000_000)throw Error('فایل سفر بیش از حد بزرگ است.');
   const x=JSON.parse(await file.text());
   if(x?.format!=='dong-travel-backup'||x.version!==1||!x.travel||await bytes(JSON.stringify(x.travel))!==x.sha256)throw Error('فایل دنگ سفر نامعتبر یا خراب است.');
   validateTravel(x.travel);
   if(!window.confirm('همه سفرهای فعلی با فایل انتخابی جایگزین شوند؟ از اطلاعات فعلی بک‌آپ بگیر.'))return;
   if(await save(x.travel,'اطلاعات سفر بازیابی شد',true)){setSelected(x.travel.trips[0]?.id||'');setTab('overview')}
  }catch(e){setError(String(e))}
 }
 async function openSnapshots(){try{const x=await listTravelSnapshots();setSnapshots(x.items)}catch(e){setError(String(e))}}
 async function restoreSnapshot(){
  if(!snapshot)return;
  try{
   const x=await readTravelSnapshot(Number(snapshot));validateTravel(x.travel);
   if(!window.confirm('همه داده‌های سفر با نسخه داخلی انتخاب‌شده جایگزین شوند؟'))return;
   if(await save(x.travel as Travel,'نسخه داخلی سفر بازیابی شد',true))setTab('overview');
  }catch(e){setError(String(e))}
 }
 return <div className="page-block travel-page" dir="rtl">
  <div className="travel-heading"><div><span className="eyebrow">کاملاً جدا از حساب خانه</span><h1>دُنگ سفر</h1><p>سفرهای دوستانه و خانوادگی · خرج مشترک و تسویه نفر به نفر</p></div><button className="btn btn-outline" type="button" onClick={onHome}><ArrowLeft size={17}/> بازگشت به دنگ خانه</button></div>
  {!ready?<section className="card"><p>در حال خواندن پایگاه داده مستقل سفر…</p></section>:<>
   <section className="card travel-selector"><div className="form-grid"><SearchSelect label="سفر فعال" value={trip?.id||''} onChange={x=>{setSelected(x);setTab('overview')}} options={travel.trips.map(t=>({value:t.id,label:t.name}))}/><div className="travel-trip-count"><Hotel size={19}/><strong>{fnum(travel.trips.length)} سفر ثبت‌شده</strong><small>اطلاعات این بخش در جدول SQLite مستقل نگهداری می‌شود.</small></div></div></section>
   <nav className="travel-tabs" aria-label="بخش‌های دنگ سفر">
    {([{id:'overview',label:'سفرها و گزارش'},{id:'expense',label:'ثبت خرج'},{id:'settlement',label:'تسویه حساب'},{id:'backup',label:'بک‌آپ سفر'}] as {id:Tab,label:string}[]).map(t=><button type="button" key={t.id} aria-current={tab===t.id?'page':undefined} className={tab===t.id?'active':''} onClick={()=>{setTab(t.id);setError('');setNotice('')}}>{t.label}</button>)}
   </nav>
   {error&&<div className="travel-feedback travel-error" role="alert">{error}</div>}
   {notice&&<div className="travel-feedback travel-success" role="status"><Check size={16}/>{notice}</div>}
   {tab==='overview'&&<div className="travel-layout">
    <section className="card"><h2><Plus size={20}/> ایجاد سفر جدید</h2><p className="muted">برای هر سفر اعضای دلخواه را جداگانه تعیین کن؛ عضوهای خانه خودکار وارد نمی‌شوند.</p>
     <div className="form-grid"><TextField label="عنوان سفر" value={newName} onChange={setNewName} placeholder="مثلاً شمال با دوستان"/><SearchSelect label="نوع سفر" value={newKind} onChange={v=>setNewKind(v as 'family'|'friends')} options={[{value:'friends',label:'دوستانه'},{value:'family',label:'خانوادگی'}]}/><PersianDate label="تاریخ شروع" value={newDate} onChange={setNewDate}/><div className="control"><label className="field-label">اسامی همراهان؛ جداشده با ویرگول</label><textarea rows={3} value={newPeople} onChange={e=>setNewPeople(e.target.value)} placeholder="احمد، مریم، علی، سارا"/></div></div>
     <button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void createTrip()}><Plus size={17}/> ایجاد سفر</button>
    </section>
    {trip&&financial&&<section className="card"><h2><Wallet size={20}/> خلاصه {trip.name}</h2><div className="travel-summary"><div><span>کل هزینه‌های سفر</span><strong>{toman(financial.total)}</strong></div><div><span>مانده تسویه‌نشده</span><strong>{toman(financial.remaining)}</strong></div><div><span>همسفران</span><strong>{fnum(trip.participants.length)} نفر</strong></div></div>
     <h3>سهم نهایی هر نفر</h3><div className="travel-people">{trip.participants.map(p=><div key={p.id}><strong>{p.name}</strong><span className={financial.balance[p.id]>0?'positive':financial.balance[p.id]<0?'negative':''}>{financial.balance[p.id]>0?'طلبکار '+toman(financial.balance[p.id]):financial.balance[p.id]<0?'بدهکار '+toman(-financial.balance[p.id]):'تسویه‌شده'}</span></div>)}</div>
     <h3>خرج‌ها بر اساس دسته</h3><div className="travel-people">{TRAVEL_CATEGORIES.filter((c:string)=>financial.totals[c]>0).map((c:string)=><div key={c}><span>{c}</span><strong>{toman(financial.totals[c])}</strong></div>)}{trip.expenses.length===0&&<p className="muted">هنوز خرجی ثبت نشده است.</p>}</div>
    </section>}
    {trip&&<section className="card travel-history"><h2><ReceiptText size={20}/> ریز خرج‌ها و تسویه‌ها</h2>{trip.expenses.slice().reverse().map(e=><div className="travel-entry" key={e.id}><div><strong>{e.category}</strong><small>{jalaliLabel(e.date)} · پرداخت از {getName(trip,e.paidBy)} · سهم {e.forMembers.map(id=>getName(trip,id)).join('، ')}{e.note?' · '+e.note:''}</small></div><b>{toman(e.amount)}</b></div>)}{trip.settlements.slice().reverse().map(s=><div className="travel-entry" key={s.id}><div><strong>تسویه حساب</strong><small>{getName(trip,s.from)} به {getName(trip,s.to)} · {jalaliLabel(s.date)}</small></div><b>{toman(s.amount)}</b></div>)}{trip.expenses.length+trip.settlements.length===0&&<p className="muted">تراکنشی وجود ندارد.</p>}</section>}
   </div>}
   {tab==='expense'&&<section className="card travel-form"><h2><ReceiptText size={20}/> ثبت خرج سفر</h2>{!trip?<p>ابتدا از «سفرها و گزارش» یک سفر بساز.</p>:<><div className="form-grid"><MoneyInput label="مبلغ خرج" value={amount} onChange={setAmount}/><SearchSelect label="دسته هزینه" value={category} onChange={setCategory} options={TRAVEL_CATEGORIES.map((c:string)=>({value:c,label:c}))}/><SearchSelect label="چه کسی پرداخت کرده؟" value={paidBy} onChange={setPaidBy} options={people}/><PersianDate label="تاریخ خرج" value={expenseDate} onChange={setExpenseDate}/><TextField label="توضیحات (اختیاری)" value={description} onChange={setDescription}/></div>
    <div className="travel-share"><strong>این خرج بین چه کسانی تقسیم شود؟</strong><p className="muted">سهم افراد انتخاب‌شده برابر محاسبه می‌شود؛ اختلاف تقسیم تومان، به ترتیب اعضا توزیع می‌شود.</p><div className="travel-checks">{trip.participants.map(p=><label key={p.id}><input type="checkbox" checked={forMembers.includes(p.id)} onChange={e=>setForMembers(xs=>e.target.checked?[...xs,p.id]:xs.filter(id=>id!==p.id))}/>{p.name}</label>)}</div><button className="btn btn-outline" onClick={()=>setForMembers(trip.participants.map(p=>p.id))} type="button">انتخاب همه</button></div><button className="btn btn-primary" type="button" disabled={busy} onClick={()=>void addExpense()}><Check size={17}/> ذخیره خرج در SQLite سفر</button>
   </>}</section>}
   {tab==='settlement'&&<div className="travel-layout">{!trip||!financial?<section className="card"><p>ابتدا سفر ایجاد کن.</p></section>:<>
    <section className="card"><h2><ArrowLeftRight size={20}/> پیشنهاد تسویه خودکار</h2><p className="muted">چه کسی به چه کسی پول بدهد تا مانده‌ها صفر شوند؟</p>{financial.suggested.length===0?<p className="positive">همه حساب‌ها تسویه‌اند.</p>:financial.suggested.map((s,i)=><button key={i} type="button" className="travel-suggestion" onClick={()=>{setFrom(s.from);setTo(s.to);setSettledAmount(String(s.amount))}}><span>{getName(trip,s.from)} ← {getName(trip,s.to)}</span><strong>{toman(s.amount)}</strong></button>)}</section>
    <section className="card"><h2><Check size={20}/> ثبت انتقال تسویه</h2><div className="form-grid"><SearchSelect label="چه کسی پول می‌دهد؟ (بدهکار)" value={from} onChange={setFrom} options={people.filter(p=>financial.balance[p.value]<0)}/><SearchSelect label="چه کسی پول می‌گیرد؟ (طلبکار)" value={to} onChange={setTo} options={people.filter(p=>financial.balance[p.value]>0)}/><MoneyInput label="مبلغ پرداخت واقعی" value={settledAmount} onChange={setSettledAmount}/><PersianDate label="تاریخ تسویه" value={settleDate} onChange={setSettleDate}/><TextField label="شرح (اختیاری)" value={settleNote} onChange={setSettleNote}/></div><p className="muted">ثبت تسویه تنها مانده افراد همین سفر را تغییر می‌دهد؛ صندوق دنگ خانه دست‌نخورده باقی می‌ماند.</p><button className="btn btn-primary" disabled={busy} onClick={()=>void addSettlement()}><Check size={17}/> ثبت تسویه</button></section>
   </>}</div>}
   {tab==='backup'&&<section className="card travel-form"><h2><ShieldCheck size={20}/> پشتیبان مستقل دنگ سفر</h2><p className="muted">اطلاعات سفر در جدول SQLite مستقل ذخیره می‌شود. بعد از هر تغییر یک نسخه داخلی تا سقف ۶۰ نسخه نگهداری می‌شود؛ برای حذف یا تعویض گوشی، حتماً فایل مستقل تهیه کن.</p><div className="travel-backup-actions"><button className="btn btn-primary" disabled={busy} onClick={()=>void exportBackup()}><Download size={17}/> دریافت فایل همه سفرها</button><label className="btn btn-outline file-import"><FileUp size={17}/> بازیابی فایل سفر<input type="file" accept=".dongtrip,application/json" hidden onChange={e=>{void importBackup(e.target.files?.[0]);e.target.value=''}}/></label><button className="btn btn-outline" onClick={()=>void openSnapshots()}>نمایش نسخه‌های داخلی سفر</button></div>{snapshots.length>0&&<div className="form-grid"><SearchSelect label="نسخه داخلی" value={snapshot} onChange={setSnapshot} options={snapshots.map(x=>({value:String(x.revision),label:`نسخه ${fnum(x.revision)} · ${new Date(x.createdAt).toLocaleString('fa-IR')}`}))}/><button className="btn btn-outline" disabled={!snapshot||busy} onClick={()=>void restoreSnapshot()}>بازیابی نسخه انتخابی</button></div>}<p className="muted">فایل دنگ سفر بدون رمز است؛ دسترسی به آن به معنی دسترسی به خرج‌های سفر است.</p></section>}
  </>}
 </div>;
}
