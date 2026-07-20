import { existsSync, readFileSync } from 'node:fs';
import './generate-launcher-assets.mjs';

const failures = [];

function read(path) {
  if (!existsSync(path)) {
    failures.push(`Missing required file: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

function readBinary(path) {
  if (!existsSync(path)) {
    failures.push(`Missing required file: ${path}`);
    return Buffer.alloc(0);
  }
  return readFileSync(path);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertSvgAsset(path, label) {
  const source = read(path);
  assert(/^<svg\b/.test(source.trim()), `${label} must be an SVG asset.`);
  assert(source.includes('viewBox="0 0 512 512"'), `${label} must use a 512x512 launcher viewBox.`);
  assert(!/logo\.png/i.test(source), `${label} must not reference legacy logo.png.`);
  return source;
}

function assertPngAsset(path, label, width, height = width) {
  const source = readBinary(path);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  assert(source.length >= 24, `${label} must contain a complete PNG header.`);
  assert(
    source.length >= 8 && signature.every((byte, index) => source[index] === byte),
    `${label} must be a PNG asset.`,
  );
  if (source.length >= 24) {
    assert(source.readUInt32BE(16) === width, `${label} width must be ${width}px.`);
    assert(source.readUInt32BE(20) === height, `${label} height must be ${height}px.`);
  }
  return source;
}

function hasIcon(manifest, { src, type, size, purpose }) {
  return Array.isArray(manifest.icons) && manifest.icons.some((icon) => (
    icon.src === src &&
    icon.type === type &&
    icon.sizes === size &&
    icon.purpose === purpose
  ));
}

const EXPECTED_APP_ID = 'ae.bingroups.superapp';
const packageJsonText = read('package.json');
const capacitorConfig = read('capacitor.config.ts');
const indexHtml = read('index.html');
const manifestText = read('public/manifest.json');
const privacyText = read('src/pages/public/PrivacyPage.tsx');
const supportText = read('src/pages/public/SupportPage.tsx');
const androidBuildGradle = read('android/app/build.gradle');
const androidStrings = read('android/app/src/main/res/values/strings.xml');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const androidMainActivity = read('android/app/src/main/java/ae/bingroups/superapp/MainActivity.java');
const androidAdaptiveLauncher = read('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
const androidAdaptiveRoundLauncher = read('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml');
const androidThemedLauncher = read('android/app/src/main/res/mipmap-anydpi-v33/ic_launcher.xml');
const androidThemedRoundLauncher = read('android/app/src/main/res/mipmap-anydpi-v33/ic_launcher_round.xml');
const androidLauncherPalette = read('android/app/src/main/res/values/ic_launcher_background.xml');
const androidLauncherForeground = read('android/app/src/main/res/drawable/ic_launcher_foreground.xml');
const androidLauncherMonochrome = read('android/app/src/main/res/drawable/ic_launcher_monochrome.xml');
const androidStyles = read('android/app/src/main/res/values/styles.xml');
const iosInfoPlist = read('ios/App/App/Info.plist');
const iosProject = read('ios/App/App.xcodeproj/project.pbxproj');
const iosAppIconContents = read('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json');

let pkg = {};
let manifest = {};
let iosAppIconManifest = {};
try { pkg = JSON.parse(packageJsonText); } catch { failures.push('package.json must be valid JSON.'); }
try { manifest = JSON.parse(manifestText); } catch { failures.push('public/manifest.json must be valid JSON.'); }
try { iosAppIconManifest = JSON.parse(iosAppIconContents); } catch { failures.push('iOS AppIcon Contents.json must be valid JSON.'); }

const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
[
  '@capacitor/core',
  '@capacitor/cli',
  '@capacitor/android',
  '@capacitor/ios',
  '@capacitor/camera',
  '@capacitor/geolocation',
  '@capacitor/push-notifications',
  '@capacitor/filesystem',
  '@capacitor/splash-screen',
  '@capacitor/status-bar',
].forEach((dep) => assert(Boolean(deps[dep]), `Missing Capacitor dependency: ${dep}`));

['mobile:init', 'mobile:add:android', 'mobile:add:ios', 'mobile:sync', 'mobile:check'].forEach((script) => {
  assert(Boolean(pkg.scripts?.[script]), `Missing package script: ${script}`);
});
assert(
  pkg.scripts?.prebuild === 'node scripts/generate-launcher-assets.mjs',
  'Root build must regenerate deterministic launcher assets through prebuild.',
);

assert(
  capacitorConfig.includes(`appId: '${EXPECTED_APP_ID}'`) || capacitorConfig.includes(`appId: "${EXPECTED_APP_ID}"`),
  `Capacitor appId must be ${EXPECTED_APP_ID}.`,
);
assert(capacitorConfig.includes('appName'), 'Capacitor config must define appName.');
assert(capacitorConfig.includes('dist'), 'Capacitor config must point to the Vite dist folder.');
assert(capacitorConfig.includes('PushNotifications'), 'Capacitor config must include PushNotifications settings.');
assert(capacitorConfig.includes('SplashScreen'), 'Capacitor config must include SplashScreen settings.');
assert(capacitorConfig.includes('StatusBar'), 'Capacitor config must include StatusBar settings.');

assert(indexHtml.includes('apple-mobile-web-app-capable'), 'index.html must include Apple mobile web app meta.');
assert(indexHtml.includes('manifest.json'), 'index.html must link to the web manifest.');
assert(indexHtml.includes('theme-color'), 'index.html must declare theme-color.');
assert(
  indexHtml.includes('rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png"'),
  'index.html must use the generated 32x32 PNG favicon.',
);
assert(
  indexHtml.includes('rel="icon" type="image/svg+xml" href="/icons/bin-group-launcher.svg"'),
  'index.html must retain the BIN GROUP SVG launcher fallback.',
);
assert(
  indexHtml.includes('rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png"'),
  'index.html must use the generated 180x180 Apple touch icon.',
);
assert(
  indexHtml.includes('rel="mask-icon" href="/icons/bin-group-launcher-monochrome.svg"'),
  'index.html must use the BIN GROUP monochrome mask icon.',
);
assert(!/rel="icon"[^>]+logo\.png/i.test(indexHtml), 'index.html must not use legacy logo.png as launcher icon.');

assert(Boolean(manifest.name && manifest.short_name), 'Manifest must include name and short_name.');
assert(manifest.display === 'standalone', 'Manifest display must be standalone.');
assert(Boolean(manifest.start_url), 'Manifest must include start_url.');
assert(manifest.scope === '/', 'Manifest scope must be /.');
assert(manifest.theme_color === '#050816', 'Manifest theme_color must match BIN GROUP launcher background.');
assert(manifest.background_color === '#050816', 'Manifest background_color must match BIN GROUP launcher background.');
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 5, 'Manifest must include raster, vector and monochrome launcher icons.');
assert(
  hasIcon(manifest, {
    src: '/icons/bin-group-launcher-192.png', type: 'image/png', size: '192x192', purpose: 'any',
  }),
  'Manifest must include the generated 192x192 PNG launcher icon.',
);
assert(
  hasIcon(manifest, {
    src: '/icons/bin-group-launcher-512.png', type: 'image/png', size: '512x512', purpose: 'any',
  }),
  'Manifest must include the generated 512x512 PNG launcher icon.',
);
assert(
  hasIcon(manifest, {
    src: '/icons/bin-group-launcher-maskable-512.png', type: 'image/png', size: '512x512', purpose: 'maskable',
  }),
  'Manifest must include the generated 512x512 maskable PNG launcher icon.',
);
assert(
  hasIcon(manifest, {
    src: '/icons/bin-group-launcher.svg', type: 'image/svg+xml', size: 'any', purpose: 'any',
  }),
  'Manifest must retain an any-size SVG launcher fallback.',
);
assert(
  hasIcon(manifest, {
    src: '/icons/bin-group-launcher-monochrome.svg', type: 'image/svg+xml', size: 'any', purpose: 'monochrome',
  }),
  'Manifest must include a monochrome SVG launcher icon.',
);

for (const icon of manifest.icons || []) {
  assert(String(icon.src || '').startsWith('/icons/bin-group-launcher'), `Manifest icon ${icon.src} must use BIN GROUP launcher assets.`);
  assert(!/logo\.png/i.test(String(icon.src || '')), `Manifest icon ${icon.src} must not use legacy logo.png.`);
  if (icon.type === 'image/png') {
    const dimensions = String(icon.sizes || '').match(/^(\d+)x(\d+)$/);
    assert(Boolean(dimensions), `PNG manifest icon ${icon.src} must declare exact dimensions.`);
    if (dimensions) {
      assertPngAsset(`public${icon.src}`, `Manifest icon ${icon.src}`, Number(dimensions[1]), Number(dimensions[2]));
    }
  } else if (icon.type === 'image/svg+xml') {
    assertSvgAsset(`public${icon.src}`, `Manifest icon ${icon.src}`);
  } else {
    failures.push(`Manifest icon ${icon.src} uses unsupported type ${icon.type}.`);
  }
}
assertPngAsset('public/icons/favicon-32.png', 'Web favicon', 32);
assertPngAsset('public/icons/apple-touch-icon.png', 'Apple touch icon', 180);
assertSvgAsset('public/icons/bin-group-launcher.svg', 'Web launcher icon');
assertSvgAsset('public/icons/bin-group-launcher-monochrome.svg', 'Monochrome launcher icon');

assert(privacyText.length > 1000, 'Privacy page must contain substantive content.');
assert(supportText.length > 500, 'Support page must contain substantive content.');

assert(androidBuildGradle.includes(`namespace = "${EXPECTED_APP_ID}"`), `Android namespace must be ${EXPECTED_APP_ID}.`);
assert(androidBuildGradle.includes(`applicationId "${EXPECTED_APP_ID}"`), `Android applicationId must be ${EXPECTED_APP_ID}.`);
assert(androidStrings.includes('<string name="app_name">BIN GROUP</string>'), 'Android app name must be BIN GROUP.');
assert(androidStrings.includes(`<string name="package_name">${EXPECTED_APP_ID}</string>`), 'Android package_name string must match app id.');
assert(androidStrings.includes(`<string name="custom_url_scheme">${EXPECTED_APP_ID}</string>`), 'Android custom URL scheme must match app id.');
assert(androidManifest.includes('android.permission.CAMERA'), 'Android manifest must request camera permission for evidence capture.');
assert(androidManifest.includes('android.permission.ACCESS_FINE_LOCATION'), 'Android manifest must request location permission for technician dispatch.');
assert(androidManifest.includes('android.permission.POST_NOTIFICATIONS'), 'Android manifest must request notification permission.');
assert(androidManifest.includes('android:icon="@mipmap/ic_launcher"'), 'Android manifest must bind the launcher icon.');
assert(androidManifest.includes('android:roundIcon="@mipmap/ic_launcher_round"'), 'Android manifest must bind the round launcher icon.');
assert(androidManifest.includes('android.intent.category.LAUNCHER'), 'Android manifest must include the launcher category.');
assert(androidMainActivity.includes('package ae.bingroups.superapp;'), 'Android MainActivity package must match app id.');
for (const source of [androidAdaptiveLauncher, androidAdaptiveRoundLauncher, androidThemedLauncher, androidThemedRoundLauncher]) {
  assert(source.includes('@color/ic_launcher_background'), 'Android adaptive launcher must use BIN GROUP background color.');
  assert(source.includes('@drawable/ic_launcher_foreground'), 'Android adaptive launcher must use drawable foreground.');
  assert(!source.includes('@mipmap/ic_launcher_foreground'), 'Android adaptive launcher must not reference a missing mipmap foreground.');
}
assert(androidThemedLauncher.includes('<monochrome android:drawable="@drawable/ic_launcher_monochrome"'), 'Android themed launcher must include monochrome icon.');
assert(androidThemedRoundLauncher.includes('<monochrome android:drawable="@drawable/ic_launcher_monochrome"'), 'Android themed round launcher must include monochrome icon.');
assert(androidLauncherPalette.includes('<color name="ic_launcher_background">#050816</color>'), 'Android launcher background must be BIN GROUP navy.');
assert(androidLauncherForeground.includes('@color/ic_launcher_gold'), 'Android foreground launcher must use BIN GROUP gold.');
assert(androidLauncherMonochrome.includes('android:fillColor="#000000"'), 'Android monochrome launcher must be theme-compatible black vector.');
assert(androidStyles.includes('windowSplashScreenBackground'), 'Android styles must define splash screen background.');
assert(androidStyles.includes('windowSplashScreenAnimatedIcon'), 'Android styles must define splash screen animated icon.');
assert(androidStyles.includes('postSplashScreenTheme'), 'Android styles must define postSplashScreenTheme transition.');

const androidDensities = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};
for (const [density, size] of Object.entries(androidDensities)) {
  assertPngAsset(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`, `Android ${density} launcher`, size);
  assertPngAsset(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, `Android ${density} round launcher`, size);
}

['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSPhotoLibraryAddUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSMicrophoneUsageDescription'].forEach((key) => {
  assert(iosInfoPlist.includes(key), `iOS Info.plist must include ${key}.`);
});
assert(iosInfoPlist.includes('ITSAppUsesNonExemptEncryption'), 'iOS Info.plist must include encryption export compliance declaration.');
assert(iosProject.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${EXPECTED_APP_ID};`), `iOS bundle identifier must be ${EXPECTED_APP_ID}.`);
assert(
  iosAppIconManifest.images?.some((image) => (
    image.filename === 'AppIcon-512@2x.png' && image.platform === 'ios' && image.size === '1024x1024'
  )),
  'iOS AppIcon manifest must bind the generated universal 1024x1024 icon.',
);
assertPngAsset('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 'iOS universal AppIcon', 1024);

if (!existsSync('android')) console.warn('Warning: android folder is not committed yet. Run npm run mobile:add:android.');
if (!existsSync('ios')) console.warn('Warning: ios folder is not committed yet. Run npm run mobile:add:ios.');

if (failures.length) {
  console.error('\nMobile store readiness audit failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Mobile store readiness audit passed with generated PWA, Android and iOS launcher assets.');
