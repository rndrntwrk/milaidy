# MiladyOS Android Product Layer

This directory contains the Milady-owned Android source overlay for building a real AOSP/Cuttlefish system image. It is not a kiosk or managed-device setup.

## Builder Requirements

AOSP builds must run on a Linux x86_64 builder with KVM available. Keep the Android source checkout outside this repository.

## Build Flow

```bash
bun install
bun run build:android:system

repo init --partial-clone -b android-latest-release \
  -u https://android.googlesource.com/platform/manifest
repo sync -c -j8

bun run miladyos:sync -- /path/to/aosp

cd /path/to/aosp
source build/envsetup.sh
lunch milady_cf_x86_64_phone-userdebug
m
launch_cvd --daemon
```

`bun run build:android:system` stages `vendor/milady/apps/Milady/Milady.apk`. `bun run miladyos:sync` copies this product layer into the AOSP checkout as `vendor/milady`.

## Verification

```bash
adb shell cmd role get-role-holders android.app.role.HOME
adb shell cmd role get-role-holders android.app.role.DIALER
adb shell cmd role get-role-holders android.app.role.SMS
adb shell package resolve-activity --brief android.intent.action.MAIN -c android.intent.category.HOME
adb shell pm list packages | grep -E 'milady|launcher|dialer|messaging|contacts'
```
