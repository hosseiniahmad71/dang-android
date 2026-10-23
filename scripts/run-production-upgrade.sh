#!/usr/bin/env bash
set -euo pipefail
mkdir -p upgrade-evidence
trap 'adb logcat -d > upgrade-evidence/logcat.txt 2>&1 || true' EXIT
BASELINE_APK="$(node -p "require('./release/release.json').baseline.apk")"
BASELINE_CODE="$(node -p "require('./release/release.json').baseline.versionCode")"
NEW_CODE="$(node -p "require('./release/release.json').versionCode")"
NEW_NAME="$(node -p "require('./release/release.json').versionName")"
adb shell svc wifi disable
adb shell svc data disable
adb install "$BASELINE_APK"
adb install -t android/app/build/outputs/apk/androidTest/release/app-release-androidTest-signed.apk
adb shell dumpsys package ir.dang.household > upgrade-evidence/package-before.txt
adb shell am instrument -w -e class 'ir.dang.household.UpgradeTest#seedOriginal' -e baseVersion "$BASELINE_CODE" ir.dang.household.test/androidx.test.runner.AndroidJUnitRunner | tee upgrade-evidence/seed.txt
grep -q 'OK (1 test)' upgrade-evidence/seed.txt
adb shell am force-stop ir.dang.household
# The upgrade must use install -r: never uninstall, clear, restore or reseed data here.
adb install -r android/app/build/outputs/apk/release/app-release.apk | tee upgrade-evidence/install-update.txt
grep -q 'Success' upgrade-evidence/install-update.txt
adb shell dumpsys package ir.dang.household > upgrade-evidence/package-after.txt
adb shell am instrument -w -e class 'ir.dang.household.UpgradeTest#verifyAfterUpdate' -e updateVersion "$NEW_CODE" ir.dang.household.test/androidx.test.runner.AndroidJUnitRunner | tee upgrade-evidence/verify.txt
grep -q 'OK (1 test)' upgrade-evidence/verify.txt
for name in before after after-reopen; do adb pull "/sdcard/Download/dang-upgrade-$name.json" "upgrade-evidence/$name.json"; done
python3 - <<'PY'
import json,hashlib,re
from pathlib import Path
root=Path('upgrade-evidence');states=[json.loads((root/(n+'.json')).read_text()) for n in ['before','after','after-reopen']]
assert states[0]==states[1]==states[2],'Financial state, SQLite ledger rows or private backup files changed during upgrade'
package=[(root/(n+'.txt')).read_text() for n in ['package-before','package-after']]
for label,pattern in [('appId',r'\b(?:appId|userId)=([^\n]+)'),('firstInstallTime',r'\bfirstInstallTime=([^\n]+)')]:
 matches=[re.search(pattern,p) for p in package];assert all(matches),'Missing package metadata: '+label
 values=[m.group(1).strip() for m in matches];assert values[0]==values[1],label+' changed'
state=states[0]['state']['store'];digest=hashlib.sha256(json.dumps(states[0],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
release=json.loads(Path('release/release.json').read_text())
summary={'upgrade':f"{release['baseline']['versionName']} ({release['baseline']['versionCode']}) -> Dong {release['versionName']} ({release['versionCode']})",'package':'ir.dang.household','sameProductionCertificate':True,'installMode':'adb install -r','sqliteAndPrivateBackupsPreserved':True,'events':len(state['events']),'plans':len(state['plans']),'closedPeriods':state['closedPeriods'],'stateSha256':digest}
(root/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False))
PY
printf '%s\n' 'Upgrade comparison completed; no historic screenshot script is required.' > upgrade-evidence/ui-capture-status.txt
adb logcat -d > upgrade-evidence/logcat.txt
