#!/usr/bin/env bash
set -euo pipefail
LOG=stage14-activation-logcat.txt
await_marker() {
  local marker="$1"
  for attempt in $(seq 1 60); do
    adb logcat -d -v time > "$LOG"
    if rg -q 'MT_BOUNDARY_ERROR_' "$LOG"; then rg 'MT_BOUNDARY_' "$LOG"; return 1; fi
    if rg -q "$marker" "$LOG"; then return 0; fi
    sleep 2
  done
  rg 'MT_BOUNDARY_' "$LOG" || true
  return 1
}
adb reverse tcp:8443 tcp:8443
adb install -r android/maintrack-app/android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am start -n com.icc.maintrack/.MainActivity
await_marker MT_BOUNDARY_READY_HEALTHY
adb shell input tap 540 140
await_marker MT_BOUNDARY_READY_FAULTY
adb shell input tap 540 140
await_marker MT_BOUNDARY_ROLLBACK_ACTUAL_UI_AND_QUEUE_PASS
for marker in ACTUAL_UI_BOOT_PASS QUEUE_GUARD_PASS_HEALTHY SET_HEALTHY HEALTHY_ACTUAL_UI_AND_QUEUE_PASS QUEUE_GUARD_PASS_FAULTY SET_FAULTY FAULTY_SHELL_EXECUTED; do
  rg -q "MT_BOUNDARY_${marker}" "$LOG"
done
adb shell am force-stop com.icc.maintrack
adb shell svc wifi disable
adb shell svc data disable
adb reverse --remove tcp:8443
adb shell am start -n com.icc.maintrack/.MainActivity
await_marker MT_BOUNDARY_OFFLINE_RESTART_AND_QUEUE_PASS
adb shell screencap -p /sdcard/stage14-activation.png
adb pull /sdcard/stage14-activation.png stage14-activation.png
rg 'MT_BOUNDARY_' "$LOG"
