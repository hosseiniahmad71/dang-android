# دُنگ — Android release invariants

- User-visible application name: دُنگ. Production package: `ir.dang.household`.
- Production signing certificate SHA-256: `2b468a624312d5db6028984714f8c9663f6873c87c9a950c5fe0fc6787416108`.
- The installed production baseline is 7.3.0 / code 13. The 7.3.1 update uses code 14. All future updates must retain this package and signing key and increment versionCode.
- Do not generate a different production key for an ordinary update. Recover the owner's existing private signing backup or use owner-entered signing secrets. Never commit, log or publish private keys/passwords. `DANG-Release-Signing-PRIVATE.zip` is an owner-private backup outside this public repository.
- CI's temporary validation key and `.preview73` debug builds are for testing only. Never present these artifacts as a production update.
- The older preview71/preview72 packages and certificates are historically incompatible; never claim they update in place. Preserve them and use verified encrypted migration if needed. This does not justify changing the production identity again.
- Do not uninstall, clear app data, or reset SQLite to perform an update. Preserve transaction history, audit records, installment contracts, settings, locked months and private backups.
- Validate the delivered APK's package/version/certificate and test actual production-signed `adb install -r` over the earlier production APK with synthetic data. Compare complete state and private backup hashes before, after and after reopening.
- Keep regression/upgrade evidence and exact source/run IDs in the release documentation. A successful Gradle build alone is not proof of runtime behavior or data preservation.

## Permanent release and backup rules (2026-10-23)
- 7.3.1 / code 14 is the already owner-signed production baseline; NEVER rewrite that APK at code 14. Changes must be 7.3.2 / code 15 or later with monotonically increasing versionCode.
- Production applicationId is the literal `ir.dang.household` and is not overridable with a Gradle project property. No preview applicationIdSuffix or debug APK may be distributed as an update.
- Source validation CI uses a disposable certificate and is **NOT installable production**. Publish only the artifact from `.github/workflows/release-production.yml`, and only after owner-managed GitHub Secrets provide the exact existing release key, certificate/package/version checks pass, and a real signed adb install -r upgrade preserves state and private backups.
- The production public certificate fingerprint is a pin, not a signing key. Never create a replacement signing key silently. If it is lost, STOP release and retain the user's installed data.
- Current new backups must be password-free versioned JSON `.dangbak` generated through Android SAF. Include a canonical full-state SHA-256 digest and reject invalid or tampered files before confirmation and restore; verify SQLite after restore. These backups are **plaintext** and contain sensitive financial records; protect the file with device storage permissions and physical security.
- Keep reading legacy `dang-android-encrypted` v1 files using their original password; do not delete the decryptor until verified migration is complete. An encrypted file cannot be decrypted without its original password just because newer backups no longer require one.
- Treat APK installation, app-data deletion, SQLite resets, key deletion, branch cleanup and restore of real user data as distinct sensitive actions. Never assume owner consent for wiping financial information.
- Every release audit must record source SHA, signing certificate, source code version, APK SHA-256, test execution ID, restore/in-place-upgrade evidence, limitations and exact status. Never mark RELEASED merely because files were committed.
- See `docs/ANDROID_RELEASE_BACKUP_POLICY_FA.md`. The Android 7.1 preview cannot update into the production package in-place, even after all future release automation is fixed.
