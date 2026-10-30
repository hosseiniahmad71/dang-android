#!/usr/bin/env bash
# Emulator-only upgrade proof with a disposable signer shared by baseline and candidate APKs.
# Never uninstall or clear data between the two adb install commands.
set -euo pipefail
PKG=ir.dong.household
OLD=upgrade-evidence/dong-previous-ci.apk
NEW=android/app/build/outputs/apk/release/app-release.apk
TEST="${DONG_ANDROID_TEST_APK:-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk}"
mkdir -p upgrade-evidence
test -s "$OLD"; test -s "$NEW"; test -s "$TEST"
TOOL="$ANDROID_HOME/build-tools/35.0.0/apksigner"
test -x "$TOOL"
OLD_CERT="$("$TOOL" verify --print-certs "$OLD" | sed -n 's/.*certificate SHA-256 digest: //p' | head -n 1)"
NEW_CERT="$("$TOOL" verify --print-certs "$NEW" | sed -n 's/.*certificate SHA-256 digest: //p' | head -n 1)"
test -n "$OLD_CERT" && test "$OLD_CERT" = "$NEW_CERT"
if [ "${DONG_UPGRADE_SIGNER_KIND:-ci}" = "owner" ]; then
  EXPECTED_CERT="$(node -p "require('./release/release.json').certificateSha256")"
  test "$NEW_CERT" = "$EXPECTED_CERT" || { echo "Owner certificate mismatch"; exit 1; }
fi
# Clean slate only because earlier independent WebView tests ran in this disposable emulator.
adb uninstall "$PKG" >/dev/null || true
adb install "$OLD" | tee upgrade-evidence/install-baseline.txt
adb shell am start -n "$PKG/.MainActivity"
sleep 7
adb install -t "$TEST" >/dev/null
adb shell am instrument -w -e class 'ir.dong.household.UpgradeTest#seedOriginal' "$PKG.test/androidx.test.runner.AndroidJUnitRunner" | tee upgrade-evidence/seed.txt
grep -q 'OK (1 test)' upgrade-evidence/seed.txt
adb shell am force-stop "$PKG"
adb shell dumpsys package "$PKG" > upgrade-evidence/package-before.txt
adb shell pm list packages -U "$PKG" > upgrade-evidence/uid-before.txt
adb pull "/sdcard/Android/data/$PKG/files/dong-upgrade-before.json" upgrade-evidence/before.json
test -s upgrade-evidence/before.json
adb install -r "$NEW" | tee upgrade-evidence/install-upgrade.txt
grep -q Success upgrade-evidence/install-upgrade.txt
adb shell dumpsys package "$PKG" > upgrade-evidence/package-after.txt
adb shell pm list packages -U "$PKG" > upgrade-evidence/uid-after.txt
adb shell am start -n "$PKG/.MainActivity"
sleep 4
adb shell am instrument -w -e class 'ir.dong.household.UpgradeTest#verifyAfterUpdate' -e snapshot after "$PKG.test/androidx.test.runner.AndroidJUnitRunner" | tee upgrade-evidence/verify.txt
grep -q 'OK (1 test)' upgrade-evidence/verify.txt
adb pull "/sdcard/Android/data/$PKG/files/dong-upgrade-after.json" upgrade-evidence/after.json
adb shell am force-stop "$PKG"
adb shell am start -n "$PKG/.MainActivity"
sleep 3
adb shell am instrument -w -e class 'ir.dong.household.UpgradeTest#verifyAfterUpdate' -e snapshot after-reopen "$PKG.test/androidx.test.runner.AndroidJUnitRunner" | tee upgrade-evidence/verify-reopen.txt
grep -q 'OK (1 test)' upgrade-evidence/verify-reopen.txt
adb pull "/sdcard/Android/data/$PKG/files/dong-upgrade-after-reopen.json" upgrade-evidence/after-reopen.json
python3 - <<'PY'
import hashlib,json,re,os
from pathlib import Path
root=Path('upgrade-evidence')
before=json.loads((root/'before.json').read_text())
after=json.loads((root/'after.json').read_text())
reopen=json.loads((root/'after-reopen.json').read_text())
assert before==after==reopen,'House/travel SQLite content or private backup files changed during upgrade'
assert len(before['house']['store']['events'])==2,'Household event evidence absent'
assert len(before['house']['store']['plans'])==1,'Installment evidence absent'
assert len(before['travel']['travel']['trips'])==1,'Travel evidence absent'
assert len(before['ledgerRows'])==2 and len(before['contractRows'])==1,'SQLite mirrored ledger evidence absent'
assert len(before['travelBackups'])>=1 and len(before['privateBackupFiles'])>=1,'Private backup evidence absent'
packages=[(root/x).read_text() for x in ['package-before.txt','package-after.txt']]
def extract(p,pat):
 m=re.search(pat,p)
 assert m,'Missing package evidence '+pat
 return m.group(1)
first=[extract(p,r'firstInstallTime=([^\n]+)') for p in packages]
uid=[extract((root/x).read_text(),r'uid:(\d+)') for x in ['uid-before.txt','uid-after.txt']]
code=[extract(p,r'\bversionCode=(\d+)') for p in packages]
assert first[0]==first[1], 'First-install timestamp changed'
assert uid[0]==uid[1], 'Package UID changed'
assert code==['19','20'], 'Wrong upgrade version sequence: '+str(code)
digest=hashlib.sha256(json.dumps(before,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
summary={'status':'PASS','package':'ir.dong.household','upgrade':'19 -> 20','installMode':'adb install -r','firstInstallTimePreserved':True,'uidPreserved':True,'houseTravelAndBackupsEqual':True,'houseEvents':len(before['ledgerRows']),'installmentPlans':len(before['contractRows']),'travelSnapshots':len(before['travelBackups']),'privateBackupFiles':len(before['privateBackupFiles']),'stateSha256':digest,'signerMode':os.environ.get('DONG_UPGRADE_SIGNER_KIND','ci')}
(root/'upgrade-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
PY
