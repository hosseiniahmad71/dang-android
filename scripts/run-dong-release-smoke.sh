#!/usr/bin/env bash
set -euo pipefail
mkdir -p production-evidence
trap 'adb logcat -d > production-evidence/android-logcat.txt 2>&1 || true' EXIT
adb logcat -c
adb shell svc wifi disable
adb shell svc data disable
adb install android/app/build/outputs/apk/release/app-release.apk
adb install -t android/app/build/outputs/apk/androidTest/release/dong-test-signed.apk
adb shell am instrument -w -e class ir.dang.household.StartupTest ir.dong.household.test/androidx.test.runner.AndroidJUnitRunner | tee production-evidence/startup-test.txt
grep -q 'OK (1 test)' production-evidence/startup-test.txt
adb shell dumpsys package ir.dong.household > production-evidence/installed-package.txt
grep -q 'ir.dong.household' production-evidence/installed-package.txt
