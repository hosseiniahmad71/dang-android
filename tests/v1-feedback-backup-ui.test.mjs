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
 assert.match(app,/commit\(next,name\);setToast\('در حال ثبت عملیات/);
 assert.match(app,/قرارداد اقساطی'\);setToast\('در حال ثبت قرارداد اقساط/);
 assert.match(app,/if\(!toast.includes\('با موفقیت'\)\)return/);
});

test('V1 branding and backup instructions cannot regress to 7.3.1',()=>{
 assert.equal(config.versionName,'1.0.6');
 assert.equal(config.applicationId,'ir.dong.household');
 assert.match(app,/نسخه رسمی \{release\.versionName\}/);
 assert.match(settings,/نسخه V\{release\.versionName\}/);
 assert.doesNotMatch(settings,/نسخه V1\.0\.3/);
 assert.doesNotMatch(app,/نسخه ۷\.۳\.۱ · کاملاً آفلاین/);
 assert.match(app,/پشتیبان مستقل بدون رمز را در محل امن نگه دار/);
 assert.match(settings,/بک‌آپ و بازیابی آسان، بدون رمز/);
 assert.match(settings,/تهیه بک‌آپ و انتخاب محل ذخیره/);
 assert.match(settings,/انتخاب فایل برای بازیابی/);
 assert.doesNotMatch(settings,/خروجی JSON در گوشی/);
});

test('Dong is the customer-facing English brand, technical identifiers reflect new install identity',()=>{
 const boot=readFileSync('public/boot-guard.js','utf8');
 const native=readFileSync('src/native-bridge.ts','utf8');
 const database=readFileSync('src/database.ts','utf8');
 const strings=readFileSync('android/app/src/main/res/values/strings.xml','utf8');
 assert.match(boot,/Dong V1\.0\.6 startup diagnostic/);
 assert.match(boot,/dong-startup-diagnostic\.txt/);
 assert.doesNotMatch(boot,/DANG 7\.3 startup diagnostic/);
 assert.equal((native.match(/const filename=`dong-/g)||[]).length,2);
 assert.match(database,/const filename=`dong-/);
 assert.match(database,/a\.download=`dong-/);
 assert.match(strings,/>دُنگ</);
 assert.equal(config.applicationId,'ir.dong.household');
 assert.match(database,/format:'dang-backup'/);
});
