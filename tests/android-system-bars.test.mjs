import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main = readFileSync('android/app/src/main/java/ir/dang/household/MainActivity.java', 'utf8');
const gradle = readFileSync('android/app/build.gradle','utf8');

test('Native WebView preserves Android system bars and safe cutout bounds', () => {
  assert.match(main,/new FrameLayout\(this\)/);
  assert.match(main,/WindowInsets\.Type\.statusBars\(\)\s*\|\s*WindowInsets\.Type\.displayCutout\(\)/);
  assert.match(main,/WindowInsets\.Type\.navigationBars\(\)/);
  assert.match(main,/v\.setPadding\(topAndCutout\.left, topAndCutout\.top/);
  assert.match(main,/root\.requestApplyInsets\(\)/);
  assert.match(main,/View\.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR/);
  assert.doesNotMatch(main,/View\.SYSTEM_UI_FLAG_FULLSCREEN\b/);
  assert.doesNotMatch(main,/View\.SYSTEM_UI_FLAG_HIDE_NAVIGATION\b/);
  assert.match(gradle,/versionCode 16/);
  assert.match(gradle,/versionName '1\.0\.0'/);
});
