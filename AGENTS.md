# Dong / دُنگ — official fresh baseline

- **English name must be Dong**. Official new installation: `ir.dong.household`, `versionName=1.0.0`, `versionCode=1`.
- This is a **fresh install**, not an update to any `ir.dang.*` package. Old installations and their financial data are not automatically modified, migrated or deleted.
- All future Dong releases must retain `ir.dong.household`, use the **same persistent signing key as the first approved Dong production release**, and increase Android versionCode.
- Never publish a throwaway CI-signer artifact as the permanent Dong baseline. A new production key is permitted exactly once; the owner must keep a secure offline copy. Required GitHub secrets: `DONG_KEYSTORE_BASE64`, `DONG_KEYSTORE_PASSWORD`, `DONG_KEY_ALIAS`, `DONG_KEY_PASSWORD`.
- Financial data lives only in app-private SQLite. Portable backups are password-free, clearly disclose plaintext privacy risk, and must be validated before restoration.
- No application may silently uninstall old apps, clear prior finance data, or delete historical Git evidence.

- **Dong 1.0.1 (versionCode=17)** adds configurable start month for Dong dues. Future APKs must continue using the original Dong 1.0.0 owner signer fingerprint, package `ir.dong.household`, and preserve SQLite. Never use a new random signer for this update. Calendar/transaction floor comes from the persisted startPeriod (earliest allowed Mehr 1405); changing start cannot hide earlier records or installments.
