import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const gradle = readFileSync('android/app/build.gradle','utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml','utf8');

test('preview APK has its own install identity and preserves original application',()=>{
  assert.match(gradle, /applicationId 'ir\.dang\.household'/);
  assert.match(gradle, /applicationIdSuffix '\.preview71'/);
  assert.match(gradle, /versionName '7\.1\.0-alpha'/);
  assert.match(manifest, /android:label="دنگ ۷.۱ آزمایشی"/);
  assert.doesNotMatch(manifest, /android:sharedUserId/);
});
