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
