# BIN GROUP iOS Apple Silicon Readiness

Google Maps Platform has announced the end of Intel `x86_64` development support for new versions of its native iOS SDKs in early Q4 2026. This is a development-environment transition; it does not disable the deployed BIN GROUP application or affect existing end users.

## Current BIN GROUP dependency mode

The BIN GROUP mobile app currently uses Google Maps through the web/JavaScript layer inside Capacitor. The native Google Maps, Places, Navigation, Driver and Consumer iOS SDKs are not installed.

Expected audit classification:

```text
NOT_INSTALLED_WEB_MAPS_ONLY
```

Do not add a native Google Maps iOS dependency merely to respond to the architecture notice.

## Protected Apple Silicon build

The repository includes the protected GitHub Actions workflow:

```text
iOS Apple Silicon arm64 Build
```

It runs on GitHub's native Apple Silicon `macos-26` runner for pull requests, relevant pushes to `main`, and manual verification. The workflow:

1. requires `uname -m` to equal `arm64`;
2. requires Xcode 26 or newer;
3. installs the committed JavaScript and CocoaPods dependency locks;
4. builds the actual Capacitor workspace for `generic/platform=iOS Simulator`;
5. forces `ARCHS=arm64` and disables signing only for simulator verification;
6. inspects the compiled executable using `lipo`;
7. rejects any result other than an arm64-only executable;
8. uploads `ios-arm64-build-evidence-<commit SHA>` with the Xcode version, Simulator SDK, workflow run, binary architecture and SHA-256 digest.

A successful workflow run is the canonical repository evidence that the exact commit builds on real Apple Silicon. Linux and Windows workflows remain source-readiness checks only.

Every pull request that changes the iOS project, Capacitor configuration, JavaScript application, mobile dependency locks, or this readiness control must pass the protected arm64 workflow before merge.

## Required development environment

By Q3 2026:

- iOS simulator development, archive creation and App Store signing must use an Apple Silicon Mac or the protected `macos-26` GitHub-hosted runner where signing is not required.
- `uname -m` must report `arm64` on the build machine.
- A real iPhone may be used for device testing, but local signing and archive generation still require macOS, Xcode and Apple Developer credentials.
- Windows remains supported for BIN GROUP web, Firebase and Android development. It cannot perform the final iOS archive or App Store upload.
- Do not exclude `arm64` from the iOS Simulator as a workaround.
- Do not restrict `ARCHS` or `VALID_ARCHS` to `x86_64`.

## Future native Google Maps adoption

A future native Google Maps iOS integration requires a separate architecture and privacy review. It must:

1. use Swift Package Manager;
2. pin the package with `exactVersion` to an exact semantic version;
3. avoid `GoogleMapsM4B`;
4. avoid adding a new Google Maps CocoaPods dependency;
5. pass `npm run verify:ios-apple-silicon` and `npm run test:mobile-store-readiness`;
6. build successfully for an arm64 iOS Simulator and a real iOS device.

Web Google Maps usage must not be misclassified as a native iOS SDK dependency.

## Validation

Repository source validation:

```bash
npm run verify:ios-apple-silicon
npm run test:mobile-store-readiness
npm run test:launch-honesty
```

Canonical hosted Apple Silicon validation:

1. Open GitHub Actions.
2. Select **iOS Apple Silicon arm64 Build**.
3. Open the successful run for the exact required commit.
4. Confirm the runner is `macos-26 / arm64`.
5. Download the `ios-arm64-build-evidence-<commit SHA>` artifact.
6. Confirm the evidence reports `status: PASSED`, architecture `arm64`, and the same commit SHA.

Equivalent local validation on a real M-series Mac:

```bash
uname -m
npm ci --include=optional --legacy-peer-deps
npm run verify:ios-apple-silicon
npm run build
npx cap copy ios
cd ios/App
pod install --deployment
cd ../..
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -sdk iphonesimulator \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  ARCHS=arm64 \
  ONLY_ACTIVE_ARCH=YES \
  CODE_SIGNING_ALLOWED=NO \
  build
```

A successful simulator build does not replace App Store signing, archive validation or testing on a real iPhone. Those remain separate release operations requiring Apple Developer credentials.
