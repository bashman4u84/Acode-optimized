# Ubuntu Terminal Runtime and Build Pipeline

## Overview

This update replaces the terminal's Alpine Linux userspace with Ubuntu Base
24.04 LTS. The root filesystem is not packaged in the APK. It is downloaded,
extracted, and configured the first time the user opens the terminal.

The APK continues to include the terminal scripts, native proot compatibility
libraries, and AXS integration required to start the Linux environment. Keeping
the root filesystem out of the APK reduces the application package size and
allows the installer to resolve a newer Ubuntu Base point release without
requiring a new application release.

## Runtime Changes

### Filesystem layout

The installed Linux userspace now lives under:

```text
<application-files>/ubuntu
```

The terminal manager translates Linux paths against this directory. The shared
working directory remains `<application-files>/public` and is mounted as
`/public`, `/home`, and `/root` inside proot so existing Acode workflows retain
the same writable location.

The old `init-alpine.sh` entry point has been replaced by `init-ubuntu.sh`, and
`init-sandbox.sh` starts proot with the Ubuntu directory as its root filesystem.

### Supported architectures

The first-run installer maps Android ABIs to Ubuntu Base architectures:

| Android ABI | Ubuntu architecture | Native library directory |
| --- | --- | --- |
| `arm64-v8a` | `arm64` | `arm64-v8a` |
| `armeabi-v7a` | `armhf` | `armeabi-v7a` |
| `x86_64` | `amd64` | `x86_64` |

Other ABIs are rejected before installation begins.

### First-run download

When the terminal is opened and no complete installation is present, the
installer performs these steps:

1. Detect the device ABI.
2. Request `SHA256SUMS` from the Ubuntu Base 24.04 release directory.
3. Find the highest Ubuntu Base point-release filename for the detected
   architecture.
4. Fall back to the known Ubuntu Base 24.04.4 filename if release discovery is
   unavailable.
5. Download the Ubuntu rootfs and the required AXS/proot native components.
6. Extract the rootfs into `<application-files>/ubuntu` without preserving
   archive ownership.
7. Configure DNS, executable wrappers, timezone, shell startup, and required
   packages.
8. Create installation state markers only as each stage completes.

The rootfs URL is therefore resolved at installation time rather than embedded
as a fixed APK asset. The APK contains no Alpine rootfs and no Ubuntu rootfs.

### Installation state

An installation is considered valid only when the Ubuntu directory and all
required state markers exist:

```text
.downloaded
.extracted
.configured
```

An incomplete previous installation is removed before a new installation is
attempted. This prevents a partially downloaded or partially configured rootfs
from being treated as usable.

### Ubuntu initialization

`init-ubuntu.sh` configures a noninteractive Debian environment and ensures the
following baseline packages are available:

```text
bash command-not-found tzdata wget ca-certificates
```

Package setup uses `apt-get` and `dpkg-query`. The interactive shell uses bash,
loads `/etc/profile`, `/etc/bash.bashrc`, and the user's `.bashrc`, and displays
an Ubuntu-specific Acode message of the day.

The generated `acode` command continues to open files and folders in the editor
through the terminal OSC integration. The external-storage execution warning,
failsafe shell, Android bind mounts, and native proot loaders remain available.

### Backup and restore

Terminal backups now include the `ubuntu` directory and the installation state
markers. Runtime mounts and temporary directories are excluded from the archive.
Restore and uninstall operations remove or replace Ubuntu paths instead of the
old Alpine paths.

### Language server integration

Language server installers now target Ubuntu package management:

- APK-style installer definitions are retained as internal compatibility IDs,
  but execute `apt-get install` and `apt-get remove`.
- Node, Python, Rust, Luau, and native binary setup installs Ubuntu package
  prerequisites with `apt-get`.
- Runtime path discovery checks `<application-files>/ubuntu/home` alongside the
  shared public directory.

The exported `builtin-alpine` runtime ID is intentionally retained for settings
and extension compatibility. Its implementation now operates against Ubuntu.

## Build Pipeline

### Required toolchain

The verified build used:

| Tool | Version/target |
| --- | --- |
| Node.js | 22.23.0 |
| npm | 10.9.8 |
| Cordova CLI | 13.0.0 |
| `cordova-android` | 15.0.0 |
| Java | OpenJDK 21 |
| Gradle | 8.10 system installation; Cordova wrapper 8.14.2 |
| Android platform | API 36 |
| Android Build Tools | 36.0.0 |

Node 22 or newer is required by the Babel 8 dependencies in the current lockfile.

### Fresh checkout setup

Install locked JavaScript dependencies first:

```sh
npm ci
```

The Cordova project requires a `www` directory before adding the Android
platform. Ensure the baseline tracked `www` files are present, then initialize
Android and plugins:

```sh
cordova platform add android
cordova plugin add cordova-plugin-buildinfo
cordova plugin add cordova-plugin-device
cordova plugin add cordova-plugin-file
```

Add each local plugin from `src/plugins/<plugin-directory>`. Paid builds skip the
AdMob plugin. The remaining registry dependency is installed with:

```sh
cordova plugin add cordova-plugin-advanced-http \
  --variable ANDROIDBLACKLISTSECURESOCKETPROTOCOLS=SSLv3,TLSv1
```

The repository also provides `npm run setup`, but fresh isolated builds must
preserve `src/plugins` after dependency installation. The package manifest uses
`file:src/plugins/...` dependencies, so rerunning `npm install` while preparing
an incomplete source archive can remove those directories. Always build from a
complete checkout or restore the tracked local plugin directories before adding
Cordova plugins.

### Android SDK preparation

Cordova Android 15 targets API 36. Install both the platform and matching build
tools before building:

```sh
sdkmanager "platforms;android-36" "build-tools;36.0.0"
```

Set the Android SDK environment variables when the build environment does not do
so automatically:

```sh
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
```

### APK build stages

Run a paid debug APK build with:

```sh
npm run build -- paid dev apk
```

`utils/scripts/build.sh` performs the pipeline in this order:

1. `node ./utils/config.js dev paid` selects the application variant and updates
   generated configuration.
2. `rspack --mode development` bundles the web application into `www`.
3. `cordova build android -- --packageType=apk` prepares Cordova resources,
   runs Android hooks, compiles Java/native integration, dexes dependencies, and
   packages a debug-signed APK.

The generated debug artifact is located at:

```text
platforms/android/app/build/outputs/apk/debug/app-debug.apk
```

For a production build, replace `dev` with `prod`. The build script adds
Cordova's `--release` flag for production mode.

### Verification

The update was verified with JavaScript and shell syntax checks, whitespace
validation, a successful Rspack compilation, and a complete Android debug APK
build. The APK archive was also inspected to confirm that it contains neither an
Alpine rootfs nor a bundled Ubuntu rootfs.

