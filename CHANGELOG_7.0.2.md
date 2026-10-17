# Dang v7.0.2 parallel-install test APK

**Reason:** Android rejected 7.0.1 as an update because the previously installed
debug APK was signed with a different ephemeral CI signing key.

**Safe immediate solution:** Give debug builds the package id
`ir.dang.household.preview` while leaving Java namespace `ir.dang.household`
untouched. The Android application displays as "دنگ آزمایشی". It can install beside
the original package `ir.dang.household`, without removing or resetting its SQLite data.

- Preserves native status / navigation bar inset fix from 7.0.1.
- No alterations to accounting calculations, storage schema, or Google Drive settings.
- The preview APK has a *separate* app-private SQLite database: it does NOT
  automatically display or migrate data from the original app.
- **Important:** A future ephemeral CI debug signing key may again prevent in-place
  upgrades of this preview package. A securely stored, fixed signing key is necessary
  for future frictionless updates; do not commit a private key to this public repo.
- If the user already has meaningful data inside the old package, export an encrypted
  external backup before any uninstall. The old app stays installed.
- Play Protect can still warn about a new developer; changing application id is not
  a way to override device safety decisions.
