# BIN GROUP iOS Apple Silicon Readiness

Google Maps Platform has announced the end of Intel `x86_64` development support for new versions of its native iOS SDKs in early Q4 2026. This is a development-environment transition; it does not disable the deployed BIN GROUP application or affect existing end users.

## Current BIN GROUP dependency mode

The BIN GROUP mobile app currently uses Google Maps through the web/JavaScript layer inside Capacitor. The native Google Maps, Places, Navigation, Driver and Consumer iOS SDKs are not installed.

Expected audit classification:

```text
NOT_INSTALLED_WEB_MAPS_ONLY
```

Do not add a native Google Maps iOS dependency merely to respond to the architecture notice.

## Required development environment

By Q3 2026:

- iOS simulator development, archive creation and App Store signing must use an Apple Silicon Mac.
- `uname -m` must report `arm64` on the build machine.
- A real iPhone may be used for device testing, but signing and archive generation still require macOS and Xcode.
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

Repository-only validation:

```bash
npm run verify:ios-apple-silicon
npm run test:mobile-store-readiness
npm run test:launch-honesty
```

Apple Silicon validation, executed only on a real M-series Mac:

```bash
uname -m
npm ci --include=optional --legacy-peer-deps
npm run build
npx cap sync ios
cd ios/App
pod install
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -sdk iphonesimulator \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  ARCHS=arm64 \
  CODE_SIGNING_ALLOWED=NO \
  build
```

A green Linux or Windows CI run proves repository configuration readiness only. It does not prove that the Xcode arm64 build has run.
