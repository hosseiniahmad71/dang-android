import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {EMPTY_TRAVEL,TRAVEL_CATEGORIES,validateTravel,validateTravelChange,summarizeTrip} from '../src/travel-ledger.mjs';

const NAMES=['احمد','مریم','علی','سارا','رضا','نرگس','میلاد','نگار','امیر','الهام'];
const groupModes=['unpaid','partial','settled-2','settled-3'];
const mkDay=i=>'2026-'+String(1+Math.floor(i/28)).padStart(2,'0')+'-'+String(1+i%28).padStart(2,'0');
function createScenario(){
 const trips=[],groupCount={unpaid:0,partial:0,'settled-2':0,'settled-3':0};
 let operationCount=0,expenseCount=0,settlementCount=0;
 for(let t=0;t<20;t++){
  const mode=groupModes[Math.floor(t/5)];
  groupCount[mode]++;
  const participants=NAMES.map((name,i)=>({id:'member-'+i,name}));
  const paidBy='member-'+(t%10);
  const companions=[paidBy,...[1,2,3].map(d=>'member-'+((t+d)%10))];
  const trip={id:'trip-'+t,name:(t%2===0?'سفر خانوادگی ':'سفر دوستانه ')+(t+1),
   kind:t%2===0?'family':'friends',date:mkDay(t),participants,expenses:[],settlements:[]};
  const costs=mode==='unpaid'?10:mode==='partial'?9:mode==='settled-2'?8:7;
  for(let e=0;e<costs;e++){
   // Different payer, monetary remainders, 13 categories and participant subsets.
   const shared=mode==='unpaid'||mode==='partial'
     ?(e%3===0?participants.map(p=>p.id):[participants[(t+e)%10].id,participants[(t+e+3)%10].id,participants[(t+e+5)%10].id])
     :companions.slice(0,mode==='settled-2'?3:4);
   const payer=mode==='unpaid'||mode==='partial'?participants[(t+e*2)%10].id:paidBy;
   const amount=10_001+(t*371+e*863)%200_000;
   trip.expenses.push({id:`expense-${t}-${e}`,date:mkDay(t),amount,
    category:TRAVEL_CATEGORIES[(t*7+e)%TRAVEL_CATEGORIES.length],
    paidBy:payer,forMembers:shared,note:e%2?'':('رسید '+(e+1))});
   expenseCount++;operationCount++;
  }
  const settleTimes=mode==='partial'?1:mode==='settled-2'?2:mode==='settled-3'?3:0;
  for(let k=0;k<settleTimes;k++){
   const next=summarizeTrip(trip).suggested[0];
   assert.ok(next,'Need a genuine debtor-to-creditor settlement for '+trip.id);
   const amount=mode==='partial'?Math.max(1,Math.floor(next.amount/2)):next.amount;
   trip.settlements.push({id:`settlement-${t}-${k}`,date:mkDay(t),amount,
    from:next.from,to:next.to,expenseCount:trip.expenses.length,note:k%2?'تسویه نهایی':'پرداخت بانکی'});
   validateTravel({version:1,trips:[trip]});
   settlementCount++;operationCount++;
  }
  const result=summarizeTrip(trip);
  if(mode.startsWith('settled'))assert.equal(result.remaining,0,'Fully paid trip must have no due');
  if(mode==='partial'||mode==='unpaid')assert.ok(result.remaining>0,'Outstanding trip must have debt');
  assert.equal(Object.values(result.balance).reduce((x,y)=>x+y,0),0);
  assert.equal(result.total,trip.expenses.reduce((a,e)=>a+e.amount,0));
  assert.equal(Object.values(result.totals).reduce((a,b)=>a+b,0),result.total);
  trips.push(trip);
 }
 return {data:{version:1,trips},operationCount,expenseCount,settlementCount,groupCount};
}
test('deterministic stress: 20 friends/family trips, 10 members each, exactly 200 transactions',()=>{
 const s=createScenario();
 assert.equal(s.data.trips.length,20);
 assert.ok(s.data.trips.every(t=>t.participants.length===10));
 assert.deepEqual(s.groupCount,{unpaid:5,partial:5,'settled-2':5,'settled-3':5});
 assert.equal(s.expenseCount,170);
 assert.equal(s.settlementCount,30);
 assert.equal(s.operationCount,200);
 assert.equal(s.data.trips.reduce((n,t)=>n+t.expenses.length+t.settlements.length,0),200);
 assert.equal(new Set(s.data.trips.flatMap(t=>t.expenses.map(e=>e.category))).size,13);
 validateTravel(s.data);
});
test('safe append-only operations, snapshot roundtrip and SHA256 corruption detection',()=>{
 const {data}=createScenario();
 const original=structuredClone(EMPTY_TRAVEL);
 let state=original;
 for(const trip of data.trips){
  const next={version:1,trips:[...state.trips,trip]};
  validateTravelChange(state,next);state=next;
 }
 assert.deepEqual(state,data);
 const contents=JSON.stringify(data);
 const checksum=createHash('sha256').update(contents).digest('hex');
 const envelope={format:'dong-travel-backup',version:1,sha256:checksum,travel:data};
 const restored=JSON.parse(JSON.stringify(envelope));
 assert.equal(createHash('sha256').update(JSON.stringify(restored.travel)).digest('hex'),restored.sha256);
 validateTravel(restored.travel);
 restored.travel.trips[4].expenses[0].amount+=1;
 assert.notEqual(createHash('sha256').update(JSON.stringify(restored.travel)).digest('hex'),restored.sha256);
 assert.throws(()=>validateTravelChange(data,restored.travel),/حذف یا بازنویسی/);
});
test('cross-trip isolation, partial/complete settlement and audit tampering',()=>{
 const {data}=createScenario();
 const before=JSON.stringify(data.trips[1]),next=structuredClone(data);
 next.trips[0].expenses.push({id:'new-proof',date:next.trips[0].date,amount:57,
 category:'قلیون',paidBy:'member-0',forMembers:['member-1','member-3'],note:''});
 validateTravelChange(data,next);
 assert.equal(JSON.stringify(next.trips[1]),before,'different trip must stay unchanged');
 const changed=structuredClone(data);
 changed.trips[8].settlements[0].amount+=1;
 assert.throws(()=>validateTravelChange(data,changed),/حذف یا بازنویسی/);
 const erased=structuredClone(data);erased.trips.splice(2,1);
 assert.throws(()=>validateTravelChange(data,erased),/حذف سفر/);
});
test('professional UI replaces comma textarea with chips and hides implementation details',()=>{
 const ui=readFileSync('src/travel.tsx','utf8');
 const css=readFileSync('src/style.css','utf8');
 assert.match(ui,/travel-member-chips/);
 assert.match(ui,/travel-member-input-row/);
 assert.match(ui,/travel-member-suggestions/);
 assert.match(ui,/addCompanion\(memberInput\)/);
 assert.match(ui,/aria-label=\{`حذف \$\{name\}`\}/);
 assert.match(ui,/travel-info-toggle/);
 assert.match(ui,/travel-hero/);
 assert.match(ui,/travel-create-cta/);
 assert.doesNotMatch(ui,/textarea rows=\{3\} value=\{newPeople\}/);
 assert.doesNotMatch(ui,/>[^<]*(?:SQLite|SQL)[^<]*</);
 assert.match(css,/@media\(max-width:390px\)/);
});
test('no household ledger writes are mixed into travel persistence',()=>{
 const java=readFileSync('android/app/src/main/java/ir/dong/household/DongDatabase.java','utf8');
 const ui=readFileSync('src/travel.tsx','utf8');
 assert.match(java,/travel_state/);
 assert.match(java,/travel_backups/);
 assert.match(java,/saveTravel\(JSONObject travel,int expectedRevision\)/);
 assert.doesNotMatch(ui,/saveStore\(|contributionOverrides|setPeriodLock\(/);
});
