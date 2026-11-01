import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gradle = readFileSync('android/app/build.gradle', 'utf8');
const proguard = readFileSync('android/app/proguard-rules.pro', 'utf8');
const mainActivity = readFileSync('android/app/src/main/java/ae/bingroups/superapp/MainActivity.java', 'utf8');
const capConfig = readFileSync('capacitor.config.ts', 'utf8');
const capSettings = readFileSync('android/capacitor.settings.gradle', 'utf8');
const styles = readFileSync('android/app/src/main/res/values/styles.xml', 'utf8');

test('MainActivity enables edge-to-edge before the Capacitor bridge, after App Check', () => {
  assert.match(mainActivity, /EdgeToEdge\.enable\(/);
  const appCheck = mainActivity.indexOf('PlayIntegrityAppCheckProviderFactory.getInstance()');
  const edge = mainActivity.indexOf('EdgeToEdge.enable(');
  const superCreate = mainActivity.indexOf('super.onCreate(savedInstanceState)');
  assert.ok(appCheck >= 0 && appCheck < edge && edge < superCreate);
});

test('WebView stays inside system-bar insets', () => {
  assert.match(capConfig, /adjustMarginsForEdgeToEdge:\s*'force'/);
});

test('no deprecated status/nav bar colour APIs in app code, themes or Android plugin config', () => {
  assert.doesNotMatch(mainActivity, /setStatusBarColor|setNavigationBarColor|setDecorFitsSystemWindows/);
  assert.doesNotMatch(styles, /statusBarColor|navigationBarColor|windowTranslucent/);
  assert.doesNotMatch(capSettings, /capacitor-status-bar/);
  assert.doesNotMatch(capConfig, /StatusBar:\s*\{[^}]*backgroundColor/);
});

test('release build is shrunk and obfuscated with Capacitor/App Check keep rules', () => {
  const release = gradle.slice(gradle.indexOf('buildTypes'));
  assert.match(release, /minifyEnabled true/);
  assert.match(release, /shrinkResources true/);
  assert.match(release, /proguard-android-optimize\.txt/);
  for (const rule of [
    /-keep class com\.getcapacitor\.\*\* \{ \*; \}/,
    /@com\.getcapacitor\.annotation\.CapacitorPlugin/,
    /@com\.getcapacitor\.PluginMethod/,
    /@android\.webkit\.JavascriptInterface/,
    /-keep class ae\.bingroups\.superapp\.\*\* \{ \*; \}/,
    /com\.google\.firebase\.appcheck/,
    /-keepattributes SourceFile,LineNumberTable/,
  ]) assert.match(proguard, rule);
});

test('version bumped for the next Play release', () => {
  assert.match(gradle, /versionCode 17\b/);
  assert.match(gradle, /versionName "1\.0\.1"/);
});
