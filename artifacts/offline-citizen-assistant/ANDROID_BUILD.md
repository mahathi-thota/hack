# Android APK build (PS-I2 D1)

The Android project is Capacitor-based and packages `dist/public` into the APK.
The application has no `INTERNET` permission and uses bundled web assets only.

## Prerequisites

- Node.js 20+
- pnpm
- Android Studio / Android SDK with the API level declared in `android/variables.gradle`
- JDK 17

## Build a release APK

From this directory:

```powershell
pnpm install
pnpm run android:apk:release
```

The unsigned release APK is written to:

```text
android/app/build/outputs/apk/release/app-release-unsigned.apk
```

For an Android Studio signed release, open `android/` in Android Studio and use
**Build > Generate Signed Bundle / APK**. Do not commit a signing key.

## Sync web assets after a change

```powershell
pnpm run android:sync
```

This runs the Vite build and `cap sync android`. The sync copies all files under
`dist/public`, including:

- local Tesseract worker and WASM
- English and Telugu traineddata files
- local PDF.js worker
- bundled PS-I2 forms and questions in the application JavaScript bundle

## Offline verification on a device

1. Install the APK.
2. Enable airplane mode before opening it.
3. Upload a PDF or image using Android's system document picker.
4. Confirm OCR works, then ask a question about the document.
5. Open **Official dataset**, select a form, and ask an official or custom question.
6. Confirm Android Studio Logcat shows no HTTP/HTTPS request from the app.

The manifest intentionally contains no network permission. File uploads use the
system picker and require no broad storage or camera permission.
