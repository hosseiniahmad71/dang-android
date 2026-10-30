import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('src/main.tsx','utf8');
const settings=readFileSync('src/settings.tsx','utf8');
const css=readFileSync('src/style.css','utf8');
const release=JSON.parse(readFileSync('release/release.json','utf8'));
const gradle=readFileSync('android/app/build.gradle','utf8');
const dashboard=source.slice(source.indexOf('function Dashboard('),source.indexOf('function InstallmentsView('));

test('the compact 1.0.4 layout is back, no expanded auditing cards appear on dashboard',()=>{
 assert.ok(dashboard.startsWith('function Dashboard('));
 assert.match(dashboard,/className="metric-grid"/);
 assert.equal((dashboard.match(/<Metric title=/g)||[]).length,4);
 assert.doesNotMatch(dashboard,/<AuditSummaryCards/);
 assert.doesNotMatch(dashboard,/audit-summary-pair/);
 assert.match(dashboard,/className="member-list"/);
 assert.match(dashboard,/className="dashboard-columns"/);
 assert.match(dashboard,/className="quick-actions"/);
});
test('every dashboard amount opens its own page rather than expanding a wall of metrics',()=>{
 assert.match(dashboard,/title="موجودی کل صندوق"[^>]+onClick=\{\(\)=>openAudit\("cash"\)\}/);
 assert.match(dashboard,/title="دنگ مورد انتظار ماه"[^>]+onClick=\{\(\)=>openAudit\("dues"\)\}/);
 assert.match(dashboard,/title="دنگ وصول‌نشده"[^>]+onClick=\{\(\)=>openAudit\("dues"\)\}/);
 assert.match(dashboard,/title="هزینه‌های این ماه"[^>]+onClick=\{\(\)=>openAudit\("expenses"\)\}/);
 assert.match(dashboard,/onClick=\{\(\)=>openAudit\("member",m.id\)\}/);
 assert.match(source,/page==='audit'\?<AuditDetailView/);
 assert.match(source,/metric-button/);
 assert.match(css,/\.metric-button:focus-visible/);
});
test('settings and both app spaces read the same release version, not V1.0.3',()=>{
 assert.equal(release.versionName,'1.0.6');
 assert.equal(release.versionCode,22);
 assert.equal(release.previousRelease.versionCode,21);
 assert.equal(release.applicationId,'ir.dong.household');
 assert.match(gradle,/versionCode 22/);
 assert.match(gradle,/versionName '1.0.6'/);
 assert.match(settings,/import release from '\.\.\/release\/release\.json';/);
 assert.match(settings,/نسخه V\{release\.versionName\}/);
 assert.doesNotMatch(settings,/نسخه V1\.0\.3/);
 assert.match(source,/نسخه رسمی \{release\.versionName\}/);
 assert.match(source,/Dong \{release\.versionName\}/);
});
