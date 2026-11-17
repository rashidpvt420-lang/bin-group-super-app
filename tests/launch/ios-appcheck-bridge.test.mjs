import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const appDelegate = readFileSync('ios/App/App/AppDelegate.swift', 'utf8');
const factory = readFileSync('ios/App/App/BinGroupAppCheckProviderFactory.swift', 'utf8');
const plugin = readFileSync('ios/App/App/FirebaseAppCheckBridgePlugin.swift', 'utf8');
const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
const firebase = readFileSync('src/lib/firebase.ts', 'utf8');
const privacy = readFileSync('ios/App/App/PrivacyInfo.xcprivacy', 'utf8');
const entitlements = readFileSync('ios/App/App/App-Release.entitlements', 'utf8');

test('iOS production App Check uses App Attest with DeviceCheck only when App Attest is unavailable', () => {
  assert.match(factory, /final class BinGroupAppCheckProviderFactory/);
  assert.match(factory, /AppCheckProviderFactory/);
  assert.match(factory, /DCAppAttestService\.shared\.isSupported/);
  assert.match(factory, /return AppAttestProvider\(app: app\)/);
  assert.match(factory, /return DeviceCheckProvider\(app: app\)/);
  const attestIndex = factory.indexOf('AppAttestProvider(app: app)');
  const deviceCheckIndex = factory.indexOf('DeviceCheckProvider(app: app)');
  assert.ok(attestIndex >= 0 && deviceCheckIndex > attestIndex, 'DeviceCheck must be the fallback after App Attest');
  assert.doesNotMatch(factory, /AppCheckDebugProvider|DebugAppCheckProvider|GACAppCheckDebugProvider/i);
  assert.doesNotMatch(factory, /FIREBASE_APPCHECK_DEBUG_TOKEN|AppCheckDebugToken/i);
});

test('AppDelegate installs the App Check factory before FirebaseApp.configure and stays fail-closed without the plist', () => {
  assert.match(appDelegate, /AppCheck\.setAppCheckProviderFactory\(BinGroupAppCheckProviderFactory\(\)\)/);
  assert.match(appDelegate, /FirebaseApp\.configure\(\)/);
  const factoryIndex = appDelegate.indexOf('AppCheck.setAppCheckProviderFactory(BinGroupAppCheckProviderFactory())');
  const configureIndex = appDelegate.indexOf('FirebaseApp.configure()');
  assert.ok(factoryIndex >= 0 && configureIndex > factoryIndex, 'App Check factory must be installed before FirebaseApp.configure()');
  assert.match(appDelegate, /path\(forResource: "GoogleService-Info", ofType: "plist"\)/);
  assert.doesNotMatch(appDelegate, /AppCheckDebugProvider|DebugAppCheckProvider|FIREBASE_APPCHECK_DEBUG_TOKEN/i);
});

test('native iOS bridge honors the same getAppCheckToken contract as Android without logging tokens', () => {
  assert.match(plugin, /@objc\(FirebaseAppCheckBridgePlugin\)/);
  assert.match(plugin, /jsName = "FirebaseAppCheckBridge"/);
  assert.match(plugin, /CAPBridgedPlugin/);
  assert.match(plugin, /getBool\("forceRefresh"\)/);
  assert.match(plugin, /token\(forcingRefresh: forceRefresh\)/);
  assert.match(plugin, /expireTimeMillis/);
  assert.match(plugin, /FIREBASE_IOS_CONFIG_MISSING/);
  assert.match(plugin, /APP_CHECK_INVALID_TOKEN_RESULT/);
  assert.match(plugin, /IOS_LOCATION_INTEGRITY_NOT_SUPPORTED/);
  assert.match(plugin, /IOS_INSTALLATION_BINDING_NOT_SUPPORTED/);
  assert.doesNotMatch(plugin, /NSLog\([^\n]*token|print\([^\n]*token/i);
  assert.doesNotMatch(plugin, /AppCheckDebugProvider|FIREBASE_APPCHECK_DEBUG_TOKEN/i);
});

test('web SDK still requires the native App Attest bridge on Capacitor iOS', () => {
  assert.match(firebase, /registerPlugin<NativeAppCheckBridge>\('FirebaseAppCheckBridge'\)/);
  assert.match(firebase, /isCapacitoriOS/);
  assert.match(firebase, /app-attest-native/);
  assert.match(firebase, /Native Firebase App Check bridge plugin unavailable/);
  assert.doesNotMatch(firebase, /isCapacitoriOS[\s\S]{0,80}ReCaptcha/);
});

test('Xcode project compiles the bridge, embeds the privacy manifest, pins Firebase 13.2.0, and uses production App Attest entitlements for Release', () => {
  assert.match(project, /FirebaseAppCheckBridgePlugin\.swift in Sources/);
  assert.match(project, /BinGroupAppCheckProviderFactory\.swift in Sources/);
  assert.match(project, /PrivacyInfo\.xcprivacy in Resources/);
  assert.match(project, /CODE_SIGN_ENTITLEMENTS = "App\/App-Release\.entitlements"/);
  assert.match(project, /repositoryURL = "https:\/\/github\.com\/firebase\/firebase-ios-sdk"/);
  assert.match(project, /kind = exactVersion/);
  assert.match(project, /version = 13\.2\.0/);
  assert.match(project, /productName = FirebaseAppCheck/);
  assert.match(project, /productName = FirebaseCore/);
  assert.match(project, /Copy GoogleService-Info\.plist if present/);
  assert.match(entitlements, /com\.apple\.developer\.devicecheck\.appattest-environment/);
  assert.match(entitlements, /<string>production<\/string>/);
  assert.ok(!existsSync('ios/App/App/GoogleService-Info.plist'), 'GoogleService-Info.plist must not be committed');
});

test('app privacy manifest disables tracking and declares the expected collected data types', () => {
  assert.match(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(privacy, /NSPrivacyCollectedDataTypeEmailAddress/);
  assert.match(privacy, /NSPrivacyCollectedDataTypePreciseLocation/);
  assert.match(privacy, /NSPrivacyCollectedDataTypePhotosorVideos/);
  assert.match(privacy, /NSPrivacyCollectedDataTypePaymentInfo/);
  assert.match(privacy, /NSPrivacyCollectedDataTypeDeviceID/);
  assert.doesNotMatch(privacy, /NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/);
});
