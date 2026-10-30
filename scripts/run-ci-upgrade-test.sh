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
adb exec-out run-as "$PKG" cat databases/dong.sqlite > upgrade-evidence/before.sqlite
test -s upgrade-evidence/before.sqlite
adb install -r "$NEW" | tee upgrade-evidence/install-upgrade.txt
grep -q Success upgrade-evidence/install-upgrade.txt
adb shell dumpsys package "$PKG" > upgrade-evidence/package-after.txt
adb exec-out run-as "$PKG" cat databases/dong.sqlite > upgrade-evidence/after.sqlite
adb shell am start -n "$PKG/.MainActivity"
sleep 4
adb shell am instrument -w -e class 'ir.dong.household.UpgradeTest#verifyAfterUpdate' "$PKG.test/androidx.test.runner.AndroidJUnitRunner" | tee upgrade-evidence/verify.txt
grep -q 'OK (1 test)' upgrade-evidence/verify.txt
adb shell am force-stop "$PKG"
adb exec-out run-as "$PKG" cat databases/dong.sqlite > upgrade-evidence/after-reopen.sqlite
python3 - <<'PY'
import sqlite3,hashlib,json,re,os
from pathlib import Path
root=Path('upgrade-evidence')
def rows(filename):
  db=sqlite3.connect(str(root/filename))
  try:
    result={}
    for table in ['state','travel_state','ledger_events','installment_contracts','travel_backups','backup_manifest']:
      content=db.execute('SELECT * FROM '+table).fetchall()
      normalized=[]
      for row in content:
        normalized.append([json.loads(v) if isinstance(v,str) and v.startswith(('{','[')) else v for v in row])
      result[table]=normalized
    return result
  finally:db.close()
before=rows('before.sqlite')
after=rows('after.sqlite')
reopen=rows('after-reopen.sqlite')
assert before==after==reopen,'House/travel SQLite state changed during in-place update'
assert before['state'] and before['ledger_events'] and before['installment_contracts'] and before['travel_state'] and before['travel_backups'],'Missing synthetic financial/travel evidence'
packages=[(root/x).read_text() for x in ['package-before.txt','package-after.txt']]
def extract(p,pat):
 m=re.search(pat,p)
 assert m,'Missing package evidence '+pat
 return m.group(1)
first=[extract(p,r'firstInstallTime=([^\n]+)') for p in packages]
uid=[extract(p,r'\buserId=(\d+)') for p in packages]
code=[extract(p,r'\bversionCode=(\d+)') for p in packages]
assert first[0]==first[1], 'First-install timestamp changed'
assert uid[0]==uid[1], 'Package UID changed'
assert code==['19','20'], 'Wrong upgrade version sequence: '+str(code)
digest=hashlib.sha256(json.dumps(before,sort_keys=True,ensure_ascii=False,default=str).encode()).hexdigest()
summary={'status':'PASS','package':'ir.dong.household','upgrade':'19 -> 20','installMode':'adb install -r','firstInstallTimePreserved':True,'uidPreserved':True,'houseTravelAndBackupsEqual':True,'houseEvents':len(before['ledger_events']),'installmentPlans':len(before['installment_contracts']),'travelSnapshots':len(before['travel_backups']),'sqliteStateSha256':digest,'signerMode':os.environ.get('DONG_UPGRADE_SIGNER_KIND','ci')}
(root/'upgrade-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
PY
