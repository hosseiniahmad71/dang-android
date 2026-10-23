import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const gradle=readFileSync('android/app/build.gradle','utf8');
const manifest=readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
const release=readFileSync('.github/workflows/release-production.yml','utf8');
test('stable release identity, strictly increasing version and signer gate',()=>{
 assert.ok(gradle.includes("applicationId 'ir.dang.household'"));
 for(const legacy of ['applicationIdSuffix','dangApplicationId','preview71','preview72','preview73'])
   assert.ok(!gradle.includes(legacy),'Forbidden release identity override: '+legacy);
 assert.ok(gradle.includes('versionCode 15'));
 assert.ok(gradle.includes("versionName '7.3.2'"));
 assert.ok(manifest.includes('android:label="@string/app_name"'));
 assert.ok(!manifest.includes('android:sharedUserId'));
 assert.ok(release.includes('2b468a624312d5db6028984714f8c9663f6873c87c9a950c5fe0fc6787416108'));
 assert.ok(release.includes("refs/heads/main"));
 assert.ok(release.includes('assembleRelease'));
 assert.ok(!release.includes('assembleDebug'));
});
