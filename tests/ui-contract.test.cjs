const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const read=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');

test('settings sections are accessible native disclosures, collapsed by default',()=>{
 const source=read('settings.tsx');
 const file=ts.createSourceFile('settings.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.equal(file.parseDiagnostics.length,0);
 assert.match(source,/function Box\(\{title,children\}/);
 const boxSource=source.slice(source.indexOf('function Box('),source.indexOf('function Confirm('));
 assert.match(boxSource,/<details className="card settings-card settings-accordion">/);
 assert.match(boxSource,/<summary className="settings-accordion-heading">/);
 assert.doesNotMatch(boxSource,/<details[^>]*\sopen(?:\s|=|>)/);
 const count=(source.match(/<Box title=/g)||[]).length;
 assert.ok(count>=8,`Expected all settings areas to use Box, found ${count}`);
 assert.match(source,/return <Box title=\{title\}>/);
});

test('settlement has independent explanatory exclamation controls for all three actions',()=>{
 const source=read('main.tsx');
 const file=ts.createSourceFile('main.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.equal(file.parseDiagnostics.length,0);
 const settlement=source.slice(source.indexOf('function SettlementForm('),source.indexOf('function Dashboard('));
 for(const term of ['انتقال اعتبار','بازپرداخت مازاد','بخشودگی بدهی','مثال کاربردی'])assert.ok(settlement.includes(term),term);
 assert.match(settlement,/aria-expanded=\{helpAction===a\.id\}/);
 assert.match(settlement,/aria-label=\{`راهنما و مثال \$\{a.label\}`\}/);
 assert.match(settlement,/className="settlement-explanation" role="note"/);
 assert.match(settlement,/window\.confirm/);
});
