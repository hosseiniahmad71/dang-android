import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const gradle=readFileSync('android/app/build.gradle','utf8');
const manifest=readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
const release=readFileSync('.github/workflows/release-production.yml','utf8');
const config=JSON.parse(readFileSync('release/release.json','utf8'));
test('Dong production identity, monotonic version and fixed release signer',()=>{
 assert.equal(config.product,'Dong');
 assert.equal(config.appNameFa,'دُنگ');
 assert.equal(config.applicationId,'ir.dong.household');
 assert.ok(Number.isSafeInteger(config.versionCode) && config.versionCode>=1);
 assert.ok(gradle.includes("applicationId 'ir.dong.household'"));
 assert.ok(gradle.includes('versionCode '+config.versionCode));
 assert.ok(gradle.includes("versionName '"+config.versionName+"'"));
 for(const legacy of ['applicationIdSuffix','dangApplicationId','preview71','preview72','preview73'])
   assert.ok(!gradle.includes(legacy),'Forbidden release identity override: '+legacy);
 assert.ok(manifest.includes('android:label="@string/app_name"'));
 assert.ok(!manifest.includes('android:sharedUserId'));
 assert.ok(release.includes('refs/heads/main'));
 assert.ok(release.includes('assembleRelease'));
 assert.ok(!release.includes('assembleDebug'));
});
