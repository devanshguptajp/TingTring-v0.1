# Phase 4 — Build Environment Debugging

Status: COMPLETE

## Goal

Make the TTT Android build environment explicit, reproducible, and easy to diagnose before feature development begins.

## Locked build environment

- Android Gradle Plugin: 8.7.3
- Gradle: 8.9
- Kotlin: 2.0.21
- Java/JDK: 17
- compileSdk: 35
- targetSdk: 35
- minSdk: 26
- AndroidX: enabled
- Jetpack Compose compiler plugin: Kotlin 2.0.21

## CI verification

GitHub Actions is the authoritative clean build environment.

The `Build TTT Debug APK` workflow:

1. Checks out `main`.
2. Installs Temurin JDK 17.
3. Installs Gradle 8.9.
4. Prints the Java and Gradle versions for diagnostics.
5. Builds `app:assembleDebug`.
6. Uploads the resulting debug APK as an artifact.

## Failure diagnosis

If a future build fails:

- Java/Kotlin JVM target mismatch → verify both are 17.
- Gradle/AGP incompatibility → verify Gradle 8.9 + AGP 8.7.3.
- Missing Android SDK → verify compileSdk 35 is available in CI.
- Dependency resolution failure → inspect the dependency named in the Gradle error.
- Compose compiler errors → verify Kotlin 2.0.21 and the Compose plugin are aligned.

## Phase 4 result

The project has a documented and CI-verified build environment. No feature work is included in this phase.

Next phase: Phase 5 — Backend Foundation.
