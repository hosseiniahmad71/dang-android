# Dong 1.0.2 — دُنگ سفر (Travel) — Release & Audit

**Date:** 2026-10-23  
**Official product:** Dong / دُنگ  
**Android version:** 1.0.2 (versionCode 18)  
**Package:** `ir.dong.household` (unchanged since Dong V1.0.0)  
**PR:** https://github.com/hosseiniahmad71/dang-android/pull/6  
**Merged commit:** `226f9e333631d40bc2e2dad6633e6418840d06c3`  
**Built and tested source commit:** `fbca1ca16ec8fb0bc5eaffeaa6c753b5a15aa52b`  
**Android CI (passed):** https://github.com/hosseiniahmad71/dang-android/actions/runs/40006910973

## قابلیت‌ها

- دکمه «ورود به دُنگ سفر» در داشبورد خانه؛ فضای سفر جدا و دارای برگشت به فضای خانه است.
- هر سفر جدید «دوستانه» یا «خانوادگی»، نام و تاریخ شروع و فهرست مستقل همسفران خود را دارد.
- دسته‌ها: اقامتگاه، بنزین، عوارضی، سوپری، نهار، شام، صبحانه، تفریحات، کافه، بستنی، نوشیدنی، دخانیات، قلیون.
- هر خرج شامل مبلغ تومان، پرداخت‌کننده، تاریخ، دسته، افراد مشمول خرج و شرح اختیاری است.
- تقسیم سهم افراد منتخب برابر و با محاسبه دقیق تومان بدون گردشدن ناسازگار انجام می‌شود.
- مانده طلبکار/بدهکار، هزینه دسته‌ها، پیشنهاد انتقال برای صفرکردن بدهی، ثبت تسویه واقعی و تاریخچه جدا.
- تسویه‌ها همراه `expenseCount` ثبت می‌شوند تا ثبت خرج جدید تسویه قبلی را نامعتبر نکند.
- داده سفر در جداول SQLite جداگانه `travel_state` و `travel_backups` با شماره ویرایش CAS و تا ۶۰ snapshot داخلی ذخیره می‌شود. هیچ خروجی سفر وارد ledger و صندوق خانه نمی‌شود.
- بک‌آپ دستی مستقل `.dongtrip` و بازیابی با بررسی SHA-256. این بک‌آپ **بدون رمز** است و باید امن نگهداری شود.
- اسناد قبلی سفر بدون روش بازیابی صریح حذف یا بازنویسی نمی‌شوند.

## APK

- **User-delivered APK:** `Dong-v1.0.2-Travel-Update.apk`
- SHA-256: `3db493126ff609679e7ea8f04e3f33c161fd57b95be4e9ea76672782799ec40a`
- Production signing certificate SHA-256: `8f5ee72bc0e7586b8b6188e6817f4c616bad2df7546da7595291e7ea36911d93`
- Signing alias: `dong-release`. APK Signature Scheme V2/V3 verified with official `apksigner`.
- Same signing certificate as `Dong-v1.0.1-Update.apk`, so this is an in-place upgrade candidate. No APK signed with disposable CI key is being given as the official update.
- Artifact source: Gradle Android release APK produced and verified in the successful CI workflow. Its APK was then locally signed using the **same owner-held persistent signing key** as Dong 1.0.1.
- ZIP file entries of the signed APK were compared to the Gradle artifact; only signing metadata in `META-INF` was modified. There was no code or resource editing after build.

## Tests and limitations

- Full Node regression, financial audits, TypeScript build, Android Gradle release build and APK verification: passed.
- Android emulator WebView/SQLite tests: passed, including `StartupTest` and `TravelTest`. Native tests include separate trip SQLite persistence, stale-revision rejection, snapshots, and dashboard Travel switch/return.
- Actual upgrade/retention on the owner’s phone has **not** been observed in this session. Advise an independent backup of household and travel before installation.
- Old `ir.dang.*` packages are separate installations, not upgraded by Dong 1.0.2.
- Never upload signing private keys, passwords or local `.dongtrip` backups to the public repository.

## Future versions

All future updates must retain `ir.dong.household` and signing certificate `8f5ee72bc0e7586b8b6188e6817f4c616bad2df7546da7595291e7ea36911d93`; increase `versionCode` beyond 18 and test SQLite preservation for both ledgers.
