# MainTrack Android — Stage 11

This branch is reserved for the isolated Android APK build. The current web application on `main` must remain unchanged.

## Reviewed candidate

- Source: MainTrack Stage 11 Production Readiness Review ZIP
- Platform: Capacitor 8 + Android Gradle
- API: isolated Stage 9 API; Android WebView origin `https://localhost`
- Build outputs: Debug APK, then signed Release APK after source/dependency locks are approved

## Current progress

- Android branch created from `main`.
- Stage 11 local source has passed 3/3 Node tests.
- **The Stage 11 project files have not yet been imported into this branch.**
- **No Android APK has been built or uploaded.**

## Required next operations

1. Import the contents of `MainTrack_Android_Capacitor_Stage11_ProductionReadiness_Review.zip` into `android/maintrack-app/`.
2. Adapt workflow paths to the subdirectory and validate npm dependencies.
3. Trigger a branch-specific debug build on GitHub Actions (push event).
4. Inspect build logs, download APK artifact, and complete Android runtime acceptance testing.

Do not merge to `main` or change the live Supabase data during packaging.
