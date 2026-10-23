import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const gradle=readFileSync('android/app/build.gradle','utf8');
const manifest=readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
const source=readFileSync('.github/workflows/release-production.yml','utf8');
test('permanent release identity, strictly increasing version and signer gate',()=>{
 assert.match(gradle,/applicationId 'ir\\.dang\\.household'/);
 assert.doesNotMatch(gradle,/applicationIdSuffix|dangApplicationId|preview71|preview72|preview73/);
 assert.match(gradle,/versionCode 15/);
 assert.match(gradle,/versionName '7\\.3\\.2'/);
 assert.match(manifest,/android:label="@string\\/app_name"/);
 assert.doesNotMatch(manifest,/android:sharedUserId/);
 assert.match(source,/2b468a624312d5db6028984714f8c9663f6873c87c9a950c5fe0fc6787416108/);
 assert.match(source,/refs\\/heads\\/main/);
 assert.match(source,/assembleRelease/);
 assert.doesNotMatch(source,/assembleDebug|applicationIdSuffix/);
});
