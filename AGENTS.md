# Dong / دُنگ — قرارداد پایه رسمی مستقل

- **Product brand: Dong** in English, **دُنگ** in Persian. Dang is not a product name.
- The first independent, standalone release is **Dong 1.0.0**, Android `versionCode=16`, `applicationId=ir.dong.household`.
- This is explicitly a **new installation identity**, not an in-place update of `ir.dang.household` or any preview app. Old user devices are not remotely modified. Back up financial data before uninstalling older packages. Never assume old SQLite contents auto-migrate.
- The Java implementation namespace `ir.dang.household`, internal native bridge `DangNative` and legacy file decoding tags are non-customer-facing technical identifiers. They may be migrated only with corresponding dex/source tests; cosmetic branding must never break launch or restore.
- The *only* approved Dong V1 signing certificate SHA-256 is `cd7c8d5ba5089ccaba2b235dfd3beb84ed86d7da9d2bf93c2faa7b676a3af360`. Alias `dong-release`, PKCS12 keystore, owned and backed up **outside GitHub** by the user.
- Persistent secret names are `DONG_KEYSTORE_BASE64`, `DONG_KEYSTORE_PASSWORD`, `DONG_KEY_ALIAS`, `DONG_KEY_PASSWORD`. Never commit a private key or password. Never use temporary/debug keys as the next official version.
- Every later version must keep the new applicationId and same certificate, increase versionCode, preserve SQLite, and pass a documented signed `adb install -r` from the prior Dong release. Until that upgrade evidence exists, new releases must not be published as safe updates.
- Default new portable backups use `.dongbak` filenames and `dong-portable-backup` envelope. Portable files are plaintext: no password, but sensitive financial data. SHA-256 detects accidental corruption, not malicious tampering. Internal snapshots and legacy import paths are separate.
- For every release record source commit, exact APK SHA-256, certificate fingerprint, version, CI run and tested limitations. A locally repackaged signed APK is **not** the same artifact as a future Gradle build; match features and signer but never claim byte-identical reproducibility without proof.
- The code branch is a new-source baseline and is not yet merged into main; prior Git branches remain historical evidence. Removing obsolete build fixtures does not delete APKs on devices.
