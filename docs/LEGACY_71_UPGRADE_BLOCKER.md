# Original 7.1 in-place update blocker

The user has 7.1 installed with real financial data. The requested deliverable must update that installation directly and preserve its data. The existing 7.3.1 production APK does not satisfy this request.

## Verified identities

| APK | Package | Version code | Certificate SHA-256 |
| --- | --- | --- | --- |
| Original 7.1 artifact | ir.dang.household.preview71 | 10 | 21c3f5d6bd2507b8c96d8d35a3f1afa8c8c24171afe85b8bbe2d0b771643f005 |
| Existing 7.3.1 release | ir.dang.household | 14 | 2b468a624312d5db6028984714f8c9663f6873c87c9a950c5fe0fc6787416108 |

Original build: run 39042080077, commit aa564be78bdd01b0ffc5f1d8718678985c8e7406, artifact 12104536109. It used assembleDebug, with no persisted signing keystore configured or uploaded.

## Recovery performed, 2026-10-23

[Read-only cache inspection run](https://github.com/hosseiniahmad71/dang-android/actions/runs/39968503815), job 120464609119, artifact 12507423661.

The exact original Gradle cache was restored successfully: 826035 bytes, cache ID 9092815945, key:

`gradle-home-v1|Linux-X64|android[7fa68a5c8b7efbba2c0fd9112e33f9ad]-aa564be78bdd01b0ffc5f1d8718678985c8e7406`

Restored paths: /home/runner/.gradle/caches, notifications and .setup-gradle. All 221 restored regular files were checked by keystore filename extensions and JKS/JCEKS leading magic. No candidates were found. /home/runner/.android did not exist in the inspection runner. This inspection did not generate a replacement debug key, alter old caches, or expose private file contents.

The original workflow saved only the Gradle directories above. Android's default debug keystore directory was outside those cached paths. Source history and uploaded build artifacts inspected earlier did not supply the original private key.

## Result and release gate

No original 7.1 signing private key has been recovered from available build evidence. A compatible direct update has **not** been produced or verified. Do not describe the 7.3.1 APK or a freshly signed preview71 APK as an update for this installation.

If the owner supplies a separately retained original keystore, first verify its public certificate against the original 7.1 fingerprint. Keep the private key out of this public repository. Only then build the corrected source with the legacy package, a higher versionCode and the matching signing key, and verify actual install -r with full before/after data and private backup comparisons.

Never uninstall, clear data or ask the user to delete 7.1 to bypass signature checks. A public certificate or the old APK alone cannot substitute for the original private signing key.
