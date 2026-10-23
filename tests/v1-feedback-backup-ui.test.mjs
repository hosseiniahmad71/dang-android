import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Guardrails for V1's native SQLite confirmation and uncomplicated backup UX.
// Full integration and signed upgrade checks are enforced separately in CI.
const app=readFileSync('src/main.tsx','utf8');
const settings=readFileSync('src/settings.tsx','utf8');
const config=JSON.parse(readFileSync('release/release.json','utf8'));

test('operations acknowledge persistence only after successful SQLite commit',()=>{
 const begin=app.indexOf('function commit(next:Store,successMessage=');
 const end=app.indexOf('function update(',begin);
 assert.ok(begin>0&&end>begin,'Shared commit boundary must exist');
 const code=app.slice(begin,end);
 const save=code.indexOf('await saveStore(next)');
 const ok=code.indexOf('if(successMessage)setToast');
 assert.ok(save>=0&&ok>save,'Success must follow awaited SQLite save');
 assert.match(code,/setToast\('ثبت عملیات ناموفق بود/);
 assert.match(app,/commit\(next,name\);setToast\('در حال ثبت و ذخیره عملیات در SQLite/);
 assert.match(app,/قرارداد اقساطی'\);setToast\('در حال ثبت و ذخیره قرارداد اقساطی/);
 assert.match(app,/if\(!toast.includes\('با موفقیت'\)\)return/);
});

test('V1 branding and backup instructions cannot regress to 7.3.1',()=>{
 assert.equal(config.versionName,'1.0.0');
 assert.equal(config.applicationId,'ir.dang.household');
 assert.match(app,/نسخه رسمی ۱\.۰\.۰/);
 assert.doesNotMatch(app,/نسخه ۷\.۳\.۱ · کاملاً آفلاین/);
 assert.match(app,/پشتیبان مستقل بدون رمز را در محل امن نگه دار/);
 assert.match(settings,/بک‌آپ و بازیابی آسان، بدون رمز/);
 assert.match(settings,/تهیه بک‌آپ و انتخاب محل ذخیره/);
 assert.match(settings,/انتخاب فایل برای بازیابی/);
 assert.doesNotMatch(settings,/خروجی JSON در گوشی/);
});
