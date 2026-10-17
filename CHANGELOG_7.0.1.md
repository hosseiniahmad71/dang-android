# Dang Android v7.0.1 — status bar patch

- Android 15/16: keep clock, notification indicators, mobile signal, battery, and gesture navigation bars visible while the app's WebView stays outside the system-bar and display-cutout insets.
- Use a white system-bar background with dark icons and native insets; no fullscreen and no duplicate CSS safe-area padding.
- Increment Android versionCode to 8 and versionName to 7.0.1-alpha.
- Add automated source assertion and Android Gradle compile to build workflow.
- **Google Play Protect:** This build remains a debug APK. An unknown-developer warning may still occur. A signed release and Google Play distribution may reduce warnings but cannot guarantee suppression. Do not disable Play Protect to install.
- **Install/upgrade:** GitHub-hosted debug builds may have different signing keys. If updating an existing installation reports a signature conflict, back up encrypted data outside the app before uninstalling; removing an app deletes its app-private SQLite database. Do not erase your Termux v6 data.
- Google Drive and online sync remain disabled.
