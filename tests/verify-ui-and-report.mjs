// Independent UI/SQLite reconciliation: transpiles the actual TypeScript formulas.
import assert from 'node:assert/strict';
import {writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture,months,MN} from './synthetic.mjs';
import {project,persianMonth,fundDelta} from '../server/ledger.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const temp=join(tmpdir(),`dang-ui-verify-${process.pid}`);await mkdir(temp,{recursive:true});
try{
 for(const name of ['types','utils','finance']){
  let code=await readFile(new URL(`../src/${name}.ts`,import.meta.url),'utf8');
  let output=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  output=output.replaceAll("'./types'","'./types.mjs'").replaceAll("'./utils'","'./utils.mjs'");
  await writeFile(join(temp,`${name}.mjs`),output);
 }
 const finance=await import('file://'+join(temp,'finance.mjs'));const types=await import('file://'+join(temp,'types.mjs'));
 const store=fixture();const projection=project(store);let checks=0;
 const assertEqual=(actual,expected,label)=>{checks++;assert.equal(actual,expected,label)};
 const memberSummaries=[];const rows=[];
 for(const p of months){
  const stats=finance.periodStatistics(store,p);
  const purchases=store.events.filter(e=>e.kind==='purchase'&&persianMonth(e.date)===p).reduce((sum,e)=>sum+e.amount,0);
  const due=store.plans.flatMap(x=>x.installments).filter(i=>persianMonth(i.dueDate)===p).reduce((sum,i)=>sum+i.amount,0);
  const expense=purchases+due;
  const cashIn=store.events.filter(e=>persianMonth(e.date)===p).reduce((sum,e)=>sum+(e.kind==='deposit'?e.amount:e.kind==='transfer'&&e.destinationId==='fund'?e.amount:0),0);
  const cashOut=store.events.filter(e=>persianMonth(e.date)===p).reduce((sum,e)=>sum+(['purchase','payment'].includes(e.kind)&&e.accountId==='fund'?e.amount:e.kind==='refund'?e.amount:e.kind==='transfer'&&e.accountId==='fund'?e.amount:0),0);
  const expectedFund=store.openingBalance+store.events.filter(e=>persianMonth(e.date)<=p).reduce((sum,e)=>sum+fundDelta(e),0);
  assertEqual(stats.fund,expectedFund,'fund as-of '+p);
  assertEqual(stats.expenses,expense,'expenses '+p);
  assertEqual(finance.expenseByCategory(store,p).reduce((sum,c)=>sum+c.value,0),expense,'categories '+p);
  assertEqual(finance.periodFlow(store,p).in,cashIn,'cash inflow '+p);
  assertEqual(finance.periodFlow(store,p).out,cashOut,'cash outflow '+p);
  assertEqual(types.fundBalanceThrough(store,p),expectedFund,'historical '+p);
  for(const m of store.members){
   const required=store.contributionOverrides[`${p}|${m.id}`]??(m.contributes?10*MN:0);
   const waived=store.events.filter(e=>e.kind==='waiver'&&e.memberId===m.id&&e.period===p).reduce((sum,e)=>sum+e.amount,0);
   const deposits=store.events.filter(e=>e.kind==='deposit'&&e.memberId===m.id&&e.period===p).reduce((sum,e)=>sum+e.amount,0);
   const personal=store.events.filter(e=>['purchase','payment'].includes(e.kind)&&e.fundedBy==='personal'&&e.paidById===m.id&&e.creditPeriod===p).reduce((sum,e)=>sum+e.amount,0);
   const inMoves=store.events.filter(e=>e.kind==='creditMove'&&e.memberId===m.id&&e.targetPeriod===p).reduce((sum,e)=>sum+e.amount,0);
   const outMoves=store.events.filter(e=>e.kind==='creditMove'&&e.memberId===m.id&&e.sourcePeriod===p).reduce((sum,e)=>sum+e.amount,0);
   const refunds=store.events.filter(e=>e.kind==='refund'&&e.memberId===m.id&&e.period===p).reduce((sum,e)=>sum+e.amount,0);
   const credit=deposits+personal+inMoves-outMoves-refunds;
   assertEqual(types.obligation(store,m.id,p),required,'required '+p+' '+m.id);
   assertEqual(types.memberCredits(store,m.id,p),credit,'credit '+p+' '+m.id);
   assertEqual(types.waived(store,m.id,p),waived,'waiver '+p+' '+m.id);
   assertEqual(types.balanceMemberPeriod(store,m.id,p),required-credit-waived,'debt '+p+' '+m.id);
   assertEqual(stats.memberStats.find(x=>x.id===m.id).remain,Math.max(0,required-credit-waived),'status '+p+' '+m.id);
  }
  rows.push({period:p,requiredToman:stats.required,depositToman:store.events.filter(e=>e.kind==='deposit'&&e.period===p).reduce((x,e)=>x+e.amount,0),cashInToman:cashIn,cashOutToman:cashOut,purchasesToman:purchases,installmentsDueToman:due,totalExpenseToman:expense,monthEndFundToman:expectedFund,debtToman:stats.memberStats.reduce((sum,m)=>sum+m.remain,0),surplusToman:stats.memberStats.reduce((sum,m)=>sum+m.surplus,0)});
 }
 assertEqual(types.fundBalance(store),projection.fund,'final fund');
 const report={verifiedAt:new Date().toISOString(),scenario:'مهر ۱۴۰۵ تا شهریور ۱۴۰۶',months:rows,events:store.events.length,installmentContracts:store.plans.length,installmentSchedules:store.plans.flatMap(p=>p.installments).length,uiReconciliations:checks,finalFundToman:projection.fund,internalCustodyEnd:projection.custody};
 if(process.env.DANG_AUDIT_OUTPUT)await writeFile(process.env.DANG_AUDIT_OUTPUT,JSON.stringify(report,null,2));
 console.log(JSON.stringify({events:report.events,contracts:report.installmentContracts,installments:report.installmentSchedules,checks:report.uiReconciliations,finalFundToman:report.finalFundToman}));
}finally{await rm(temp,{recursive:true,force:true})}
