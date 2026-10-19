#!/bin/sh
# One POSIX shell process: Android Emulator Runner executes each inline script
# line in a separate sh -c process, so variables MUST live in this file.
set -eu
OLD=".qa-old-041/MainTrack-stage14-release.apk"
NEW=".qa-044/MainTrack-0.4.4-Owner-QA-ONLY.apk"
[ -s "$OLD" ] || { echo 'MISSING_OLD_SIGNED_APK'; exit 1; }
[ -s "$NEW" ] || { echo 'MISSING_NEW_SIGNED_APK'; exit 1; }

adb wait-for-device
adb logcat -c
echo 'Starting signed Android in-place upgrade 401 -> 404'
adb install -r "$OLD"
adb shell dumpsys package com.icc.maintrack | grep -F 'versionCode=401'
adb shell am start -n com.icc.maintrack/.MainActivity
sleep 7
adb shell pidof com.icc.maintrack >/dev/null || { echo 'OLD_VERSION_NOT_RUNNING'; exit 1; }
adb shell am force-stop com.icc.maintrack

# No uninstall, no pm clear, no data deletion.
adb install -r "$NEW"
adb shell pm path com.icc.maintrack | grep -F 'package:'
adb shell dumpsys package com.icc.maintrack | grep -F 'versionCode=404'
adb shell am start -n com.icc.maintrack/.MainActivity
sleep 8
adb shell pidof com.icc.maintrack >/dev/null || { echo 'NEW_VERSION_NOT_RUNNING'; exit 1; }
adb shell am force-stop com.icc.maintrack
adb shell am start -n com.icc.maintrack/.MainActivity
sleep 5
adb shell pidof com.icc.maintrack >/dev/null || { echo 'NEW_VERSION_REOPEN_FAILED'; exit 1; }

# Match fatal AndroidRuntime crashes *of our own process*, not unrelated system
# messages or a regular "Process:" log from normal activity startup.
if adb logcat -d -v brief | grep -A 12 -F 'FATAL EXCEPTION' | grep -F 'Process: com.icc.maintrack,'; then
  echo 'ANDROID_RUNTIME_CRASH_IN_MAINTRACK'
  exit 1
fi

echo 'PASS_SIGNED_IN_PLACE_UPGRADE_NATIVE_401_TO_404_AND_REOPEN'
echo 'SCOPE: emulator-only smoke. Authenticated session/queue and future OTA still require separate evidence.'
