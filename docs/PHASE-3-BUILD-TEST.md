# Phase 3 — Repository & Build-System Test

Status: CLOUD BUILD VERIFIED — DEVICE LAUNCH CHECK REQUIRED
Date: 2026-09-23

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
- Java and Kotlin JVM targets are aligned to 17.
- GitHub Actions successfully built the debug APK.
- Workflow successfully uploaded app-debug.apk as the artifact named TingTring-Talk-debug.
- Verified artifact contains app-debug.apk.
- Latest successful workflow run: 35849848508.
- Latest successful build commit: 4047b88877418372f93a3876f828617a83212c45.

## Verification requirement
The repository has successfully produced:

    app-debug.apk

The APK is ready for installation on an Android phone. The remaining check is to confirm that it installs and the launcher opens.

## Windows 7 requirement
No Android Studio or other development application is required on the user's Windows 7 PC for this Phase 3 verification path. The build runs in GitHub Actions.

## Phase 3 completion condition
Repository/build verification is complete. Final device verification requires:
1. Download the debug APK.
2. Install it on an Android phone.
3. Launch TingTring Talk.
4. Confirm the starter screen opens without crashing.

## Important
No production credentials, Supabase keys, LiveKit secrets, or push-service secrets are included.
