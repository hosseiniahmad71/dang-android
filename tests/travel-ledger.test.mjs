import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {TRAVEL_CATEGORIES,EMPTY_TRAVEL,validateTravel,validateTravelChange,summarizeTrip} from '../src/travel-ledger.mjs';
import {readFileSync} from 'node:fs';
const p=()=>({id:randomUUID(),name:'همسفر'});
function trip(){
 return {id:randomUUID(),name:'شمال',kind:'friends',date:'2026-10-23',
 participants:[{id:'ali',name:'علی'},{id:'sara',name:'سارا'},{id:'maryam',name:'مریم'}],expenses:[],settlements:[]};
}
const expense=(amount=100)=>({id:randomUUID(),date:'2026-10-23',amount,category:'بنزین',paidBy:'ali',forMembers:['ali','sara','maryam'],note:''});
const state=t=>({version:1,trips:[t]});
test('Dong Travel has exactly the user-requested 13 categories',()=>{
 assert.deepEqual([...TRAVEL_CATEGORIES],['اقامتگاه','بنزین','عوارضی','سوپری','نهار','شام','صبحانه','تفریحات','کافه','بستنی','نوشیدنی','دخانیات','قلیون']);
});
test('equal split handles indivisible toman exactly; total balance always zero',()=>{
 let t=trip();t.expenses=[expense(100)];
 let x=summarizeTrip(t);
 assert.equal(x.total,100);assert.deepEqual(x.balance,{ali:66,sara:-33,maryam:-33});
 assert.deepEqual(x.suggested,[{from:'sara',to:'ali',amount:33},{from:'maryam',to:'ali',amount:33}]);
 t.settlements=[{id:randomUUID(),date:'2026-10-23',amount:33,from:'sara',to:'ali',note:'',expenseCount:1}];
 x=summarizeTrip(t);assert.equal(x.remaining,33);
 assert.deepEqual(x.balance,{ali:33,sara:0,maryam:-33});
});
test('payer need not be a participant in the expense split; per-person shares stay isolated',()=>{
 const t=trip();t.expenses=[{...expense(90),forMembers:['sara','maryam']}];
 assert.deepEqual(summarizeTrip(t).balance,{ali:90,sara:-45,maryam:-45});
});
test('settlement rejects overpay, invalid direction, and nonexistent people',()=>{
 const t=trip();t.expenses=[expense(90)];
 t.settlements=[{id:'settle',date:'2026-10-23',from:'sara',to:'ali',amount:31,note:'',expenseCount:1}];
 assert.throws(()=>validateTravel(state(t)),/تسویه/);
 t.settlements[0].amount=30;validateTravel(state(t));
 t.settlements.push({...t.settlements[0],id:'other',amount:1});assert.throws(()=>validateTravel(state(t)),/تسویه/);
 t.settlements.pop();t.settlements[0].to='absent';assert.throws(()=>validateTravel(state(t)),/تسویه/);
});
test('a later expense cannot retroactively invalidate a historical settlement',()=>{
 const t=trip();t.expenses=[expense(90)];
 t.settlements=[{id:'paid-old',date:'2026-10-23',from:'sara',to:'ali',amount:30,note:'پرداخت واقعی',expenseCount:1}];
 validateTravel(state(t));
 t.expenses.push({...expense(300),paidBy:'sara'});
 validateTravel(state(t));
 assert.deepEqual(summarizeTrip(t).balance,{ali:-70,sara:200,maryam:-130});
});
test('prior travel records cannot be silently removed, rewritten or mixed with household events',()=>{
 const t=trip();t.expenses=[expense(200)];
 const previous=state(t);validateTravelChange(EMPTY_TRAVEL,previous);
 const newer=structuredClone(previous);newer.trips[0].expenses.push(expense(100));
 validateTravelChange(previous,newer);
 const altered=structuredClone(previous);altered.trips[0].expenses[0].amount=300;
 assert.throws(()=>validateTravelChange(previous,altered),/حذف یا بازنویسی/);
 const deleted=structuredClone(previous);deleted.trips=[];
 assert.throws(()=>validateTravelChange(previous,deleted),/حذف سفر/);
});
test('storage APIs remain separate and include transaction revision and independent backups',()=>{
 const java=readFileSync('android/app/src/main/java/ir/dong/household/DongDatabase.java','utf8');
 const bridge=readFileSync('android/app/src/main/java/ir/dong/household/MainActivity.java','utf8');
 const native=readFileSync('src/native-runtime.mjs','utf8');
 const server=readFileSync('server/store.mjs','utf8');
 const main=readFileSync('src/main.tsx','utf8');
 const ui=readFileSync('src/travel.tsx','utf8');
 for(const x of [java,server]){assert.match(x,/travel_state/);assert.match(x,/travel_backups/)}
 assert.match(bridge,/case "travelGet"/);assert.match(bridge,/case "travelSave"/);
 assert.match(native,/validateTravelChange\(old.travel,x.travel\)/);
 assert.match(main,/onTravel=\{\(\)=>setSpace\('travel'\)\}/);
 assert.match(ui,/dong-travel-backup/);
 assert.doesNotMatch(ui,/store\.events|contributionOverrides|startPeriod/);
});
