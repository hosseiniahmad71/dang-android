const ts=require('typescript');
const fs=require('fs'),path=require('path');
const files=fs.readdirSync(path.join(__dirname,'../src')).filter(p=>/\.tsx?$/.test(p));
for(const name of files){const filename=path.join(__dirname,'../src',name),body=fs.readFileSync(filename,'utf8');
 const result=ts.transpileModule(body,{fileName:filename,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 if(errors.length){for(const x of errors)console.error(name,ts.flattenDiagnosticMessageText(x.messageText,'\n'));process.exitCode=1}
}
if(!process.exitCode)console.log('React/TypeScript syntax checked:',files.length,'files');
