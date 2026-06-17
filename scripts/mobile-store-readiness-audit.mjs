import { existsSync, readFileSync } from 'node:fs';

const failures = [];
function read(path) {
  if (!existsSync(path)) {
    failures.push(`Missing required file: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}
function assert(condition, message) {
  if (!condition) failures.push(message);
}

const packageJsonText = read('package.json');
const capacitorConfig = read('capacitor.config.ts');
const indexHtml = read('index.html');
const manifestText = read('public/manifest.json');
read('src/pages/public/PrivacyPage.tsx');
read('src/pages/public/SupportPage.tsx');

let pkg = {};
let manifest = {};
try { pkg = JSON.parse(packageJsonText); } catch { failures.push('package.json must be valid JSON.'); }
try { manifest = JSON.parse(manifestText); } catch { failures.push('public/manifest.json must be valid JSON.'); }

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
  '@capacitor/status-bar'
].forEach((dep) => assert(Boolean(deps[dep]), `Missing Capacitor dependency: ${dep}`));

['mobile:init', 'mobile:add:android', 'mobile:add:ios', 'mobile:sync', 'mobile:check'].forEach((script) => {
  assert(Boolean(pkg.scripts?.[script]), `Missing package script: ${script}`);
});

assert(capacitorConfig.includes('appId'), 'Capacitor config must define appId.');
assert(capacitorConfig.includes('appName'), 'Capacitor config must define appName.');
assert(capacitorConfig.includes('dist'), 'Capacitor config must point to the Vite dist folder.');
assert(capacitorConfig.includes('PushNotifications'), 'Capacitor config must include PushNotifications settings.');
assert(capacitorConfig.includes('SplashScreen'), 'Capacitor config must include SplashScreen settings.');
assert(capacitorConfig.includes('StatusBar'), 'Capacitor config must include StatusBar settings.');

assert(indexHtml.includes('apple-mobile-web-app-capable'), 'index.html must include Apple mobile web app meta.');
assert(indexHtml.includes('apple-touch-icon'), 'index.html must include apple-touch-icon.');
assert(indexHtml.includes('manifest.json'), 'index.html must link to the web manifest.');
assert(indexHtml.includes('theme-color'), 'index.html must declare theme-color.');

assert(Boolean(manifest.name && manifest.short_name), 'Manifest must include name and short_name.');
assert(manifest.display === 'standalone', 'Manifest display must be standalone.');
assert(Boolean(manifest.start_url), 'Manifest must include start_url.');
assert(manifest.scope === '/', 'Manifest scope must be /.');
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'Manifest must include icon entries.');
assert(JSON.stringify(manifest.icons || []).includes('192x192'), 'Manifest must include 192x192 icon.');
assert(JSON.stringify(manifest.icons || []).includes('512x512'), 'Manifest must include 512x512 icon.');

if (!existsSync('android')) console.warn('Warning: android folder is not committed yet. Run npm run mobile:add:android.');
if (!existsSync('ios')) console.warn('Warning: ios folder is not committed yet. Run npm run mobile:add:ios.');

if (failures.length) {
  console.error('\nMobile store readiness audit failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Mobile store readiness audit passed.');
