"""Patch app/android/app/build.gradle to sign release builds with the real
Play Store upload keystore instead of the debug keystore.

Anchors verified locally against a real expo-prebuild-generated build.gradle
(RN 0.81 / Expo SDK 54) before this script was committed. If Expo changes the
template, this must fail loudly rather than silently ship an unsigned/
debug-signed release AAB.
"""
import sys

PATH = "app/android/app/build.gradle"

SIGNING_CONFIGS_ANCHOR = """    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }"""

SIGNING_CONFIGS_REPLACEMENT = """    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file(RELEASE_STORE_FILE)
            storePassword RELEASE_STORE_PASSWORD
            keyAlias RELEASE_KEY_ALIAS
            keyPassword RELEASE_KEY_PASSWORD
        }
    }"""

RELEASE_BUILDTYPE_ANCHOR = """        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug"""

RELEASE_BUILDTYPE_REPLACEMENT = """        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.release"""


def main() -> int:
    with open(PATH) as f:
        content = f.read()

    if SIGNING_CONFIGS_ANCHOR not in content:
        print("::error::signingConfigs anchor not found in build.gradle — "
              "expo prebuild template changed, patch needs updating")
        return 1
    if RELEASE_BUILDTYPE_ANCHOR not in content:
        print("::error::release buildType anchor not found in build.gradle — "
              "expo prebuild template changed, patch needs updating")
        return 1

    content = content.replace(SIGNING_CONFIGS_ANCHOR, SIGNING_CONFIGS_REPLACEMENT, 1)
    content = content.replace(RELEASE_BUILDTYPE_ANCHOR, RELEASE_BUILDTYPE_REPLACEMENT, 1)

    with open(PATH, "w") as f:
        f.write(content)

    if "signingConfig signingConfigs.release" not in content:
        print("::error::Patch verified failed — signingConfigs.release missing after write")
        return 1

    print("Patched build.gradle OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
