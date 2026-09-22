# Phase 3 — Repository & Build-System Test

Status: BUILD VERIFICATION PENDING
Date: 2026-09-22

## Checks completed
- Repository is writable.
- Main branch is usable.
- Android project root files created.
- Gradle settings file created.
- Root Gradle plugin configuration created.
- Android application module created.
- Application namespace: com.tingtring.talk
- Application ID: com.tingtring.talk
- compileSdk: 35
- minSdk: 26
- targetSdk: 35
- Kotlin + Jetpack Compose configured.
- Compose dependencies configured.
- Android manifest, launcher activity, resources, and theme files configured.
- No phone-number input or phone-number permission was added.
- GitHub Actions debug-APK build workflow added.
- Workflow uses Java 17 and Gradle 8.9.
- Workflow uploads app-debug.apk as the artifact named TingTring-Talk-debug.

## Verification requirement
The repository must successfully run the GitHub Actions build and produce:

    app-debug.apk

The APK must then be downloaded and installed on an Android phone to verify that the launcher opens.

## Windows 7 requirement
No Android Studio or other development application is required on the user's Windows 7 PC for this Phase 3 verification path. The build runs in GitHub Actions.

## Phase 3 completion condition
Phase 3 is fully complete only after:
1. GitHub Actions reports the build as successful.
2. The debug APK artifact exists.
3. The APK is downloaded.
4. The APK installs and launches successfully on an Android phone.

Until those four checks pass, Phase 3 remains incomplete.

## Important
No production credentials, Supabase keys, LiveKit secrets, or push-service secrets are included.
