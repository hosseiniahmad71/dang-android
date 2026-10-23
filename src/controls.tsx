import {useEffect,useLayoutEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CalendarDays,ChevronDown,ChevronLeft,ChevronRight,Search,X} from 'lucide-react';
import {MONTHS,MIN_FINANCIAL_PERIOD,MIN_FINANCIAL_DATE,currentIso,daysInJalaliMonth,digitsToEnglish,fnum,jalaliLabel,jalaliParts,offsetMonth,parseToman,toIsoFromJalali,tomanWords} from './utils';
export type Option={value:string,label:string};
export function SearchSelect({label,value,onChange,options,placeholder='جست‌وجو و انتخاب...',disabled=false}:{label:string,value:string,onChange:(x:string)=>void,options:Option[],placeholder?:string,disabled?:boolean}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[focusIndex,setFocusIndex]=useState(-1);
 const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:900px)').matches);
 const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),menu=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const titleId=useId();
 useEffect(()=>{const mq=window.matchMedia('(max-width:900px)'),resize=()=>setCompact(mq.matches);mq.addEventListener('change',resize);return()=>mq.removeEventListener('change',resize)},[]);
 useEffect(()=>{const close=(e:PointerEvent)=>{const n=e.target as Node;if(root.current&&!root.current.contains(n)&&!menu.current?.contains(n)&&!dialog.current?.contains(n))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[]);
 useLayoutEffect(()=>{
  if(!open||!compact)return;
  const d=dialog.current;if(!d)return;
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  const resize=()=>{const v=window.visualViewport,h=v?.height||window.innerHeight;d.style.top=`${(v?.offsetTop||0)+12}px`;d.style.setProperty('--select-max-height',`${Math.max(160,h-24)}px`)};
  resize();d.showModal();window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
  return()=>{window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);document.body.style.overflow=previous;if(d.open)d.close();trigger.current?.focus({preventScroll:true})};
 },[open,compact]);
 const filtered=options.filter(o=>o.label.includes(query.trim())||digitsToEnglish(o.label).includes(digitsToEnglish(query.trim())));
 function toggle(){if(disabled)return;setOpen(v=>!v);setQuery('');setFocusIndex(-1);if(!compact)setTimeout(()=>input.current?.focus({preventScroll:true}),0)}
 function pick(v:string){onChange(v);setOpen(false);setQuery('')}
 const popup=<div className="search-menu" ref={menu} dir="rtl">
  {compact&&<div className="search-dialog-heading"><h2 id={titleId}>{label}</h2><button type="button" autoFocus className="icon-button" aria-label="بستن فهرست" onClick={()=>setOpen(false)}><X size={20}/></button></div>}
  <div className="search-wrap"><Search size={18}/><input ref={input} value={query} aria-label={`جست‌وجو در ${label}`} placeholder={placeholder} onChange={e=>{setQuery(e.target.value);setFocusIndex(-1)}} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false)}else if(e.key==='ArrowDown'){e.preventDefault();setFocusIndex(i=>Math.min(filtered.length-1,i+1))}else if(e.key==='ArrowUp'){e.preventDefault();setFocusIndex(i=>Math.max(0,i-1))}else if(e.key==='Enter'&&filtered[focusIndex]){e.preventDefault();pick(filtered[focusIndex].value)}}}/>{!compact&&<button type="button" className="icon-button tiny" aria-label="بستن فهرست" onClick={()=>setOpen(false)}><X size={16}/></button>}</div>
  <div className="select-items" role="listbox" aria-label={label}>{filtered.length?filtered.map((o,i)=><button role="option" aria-selected={o.value===value} type="button" key={o.value} className={`${o.value===value?'picked':''} ${i===focusIndex?'hovered':''}`} onClick={()=>pick(o.value)}>{o.label}</button>):<div className="empty-result">نتیجه‌ای پیدا نشد.</div>}</div>
 </div>;
 return <div className="control" ref={root}><label className="field-label">{label}</label><button ref={trigger} type="button" aria-expanded={open} aria-haspopup={compact?'dialog':'listbox'} disabled={disabled} className={`select-trigger ${open?'focus':''}`} onClick={toggle}><span>{options.find(o=>o.value===value)?.label||'انتخاب کنید'}</span><ChevronDown size={17}/></button>{open&&(compact?createPortal(<dialog ref={dialog} className="search-dialog" aria-labelledby={titleId} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}>{popup}</dialog>,document.body):popup)}</div>
}
export function MoneyInput({label,value,onChange,placeholder='مثلاً ۲٬۵۰۰٬۰۰۰',note}:{label:string,value:string,onChange:(v:string)=>void,placeholder?:string,note?:string}){
 const number=parseToman(value);
 return <div className="control"><label className="field-label">{label} <small>تومان</small></label><div className="money-wrap"><input inputMode="numeric" autoComplete="off" value={Number.isFinite(number)?(value?fnum(number):''):value} onChange={e=>onChange(digitsToEnglish(e.target.value).replace(/[٬،,\s]/g,''))} placeholder={placeholder} dir="ltr"/><span>تومان</span></div>{Number.isFinite(number)&&value!==''&&<div className="money-words">{tomanWords(number)}</div>}{note&&<div className="input-help">{note}</div>}</div>
}
export function PersianDate({label,value,onChange}:{label:string,value:string,onChange:(v:string)=>void}){
 const [open,setOpen]=useState(false);const current=jalaliParts(value||currentIso());const [view,setView]=useState(()=>{const key=`${current.year}/${String(current.month).padStart(2,'0')}`;return key<MIN_FINANCIAL_PERIOD?MIN_FINANCIAL_PERIOD:key});
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(root.current&&!root.current.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[]);
 const [y,m]=view.split('/').map(Number),first=toIsoFromJalali(y,m,1),weekday=(new Date(`${first}T12:00:00Z`).getUTCDay()+1)%7,count=daysInJalaliMonth(y,m),today=currentIso(),canGoBack=offsetMonth(view,-1)>=MIN_FINANCIAL_PERIOD;
 return <div className="control" ref={root}><label className="field-label">{label}</label><button type="button" className="select-trigger date-trigger" onClick={()=>{const p=jalaliParts(value||currentIso());const key=`${p.year}/${String(p.month).padStart(2,'0')}`;setView(key<MIN_FINANCIAL_PERIOD?MIN_FINANCIAL_PERIOD:key);setOpen(v=>!v)}}><span>{jalaliLabel(value)}</span><CalendarDays size={17}/></button>{open&&<div className="calendar"><div className="cal-head"><button type="button" aria-label="ماه بعد" className="icon-button" onClick={()=>setView(offsetMonth(view,1))}><ChevronRight size={18}/></button><strong>{MONTHS[m-1]} {fnum(y)}</strong><button type="button" aria-label="ماه قبل" className="icon-button" disabled={!canGoBack} onClick={()=>{if(canGoBack)setView(offsetMonth(view,-1))}}><ChevronLeft size={18}/></button></div><div className="calendar-grid">{['ش','ی','د','س','چ','پ','ج'].map((n,i)=><div className="dow" key={i}>{n}</div>)}{Array.from({length:weekday},(_,i)=><span key={`e${i}`}/>)}{Array.from({length:count},(_,i)=>{const iso=new Date(Date.parse(`${first}T12:00:00Z`)+i*86400000).toISOString().slice(0,10);return <button type="button" className={`day ${value===iso?'active':''} ${today===iso?'today':''}`} key={iso} disabled={iso<MIN_FINANCIAL_DATE} onClick={()=>{if(iso<MIN_FINANCIAL_DATE)return;onChange(iso);setOpen(false)}}>{fnum(i+1)}</button>})}</div><button type="button" className="cal-today" onClick={()=>{onChange(today);setOpen(false)}}>امروز: {jalaliLabel(today)}</button></div>}</div>
}
export function TextField({label,value,onChange,placeholder='',wide=false}:{label:string,value:string,onChange:(v:string)=>void,placeholder?:string,wide?:boolean}){return <div className={`control ${wide?'wide':''}`}><label className="field-label">{label}</label><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>}
