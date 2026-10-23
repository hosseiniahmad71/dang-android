#!/usr/bin/env bash
set -euo pipefail
mkdir -p runtime-evidence
collect() {
  timeout 20s adb logcat -d > runtime-evidence/logcat.txt 2>&1 || true
  timeout 20s adb pull /sdcard/Download/dang73 runtime-evidence/screenshots || true
}
trap collect EXIT
adb logcat -c
adb shell svc wifi disable
adb shell svc data disable
gradle -p android --no-daemon connectedReleaseAndroidTest -PdangTestBuildType=release
