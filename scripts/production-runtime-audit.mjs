import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const failures = [];
const warnings = [];

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

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', 'build', '.git', '.firebase'].includes(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(extname(full))) files.push(full);
  }
  return files;
}

function extractTranslationKeys(source, lang) {
  const marker = `${lang}: {`;
  const start = source.indexOf(marker);
  if (start === -1) return new Set();
  let depth = 0;
  let bodyStart = source.indexOf('{', start);
  let end = bodyStart;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) { end = i; break; }
  }
  const body = source.slice(bodyStart, end);
  const keys = new Set();
  const re = /['"]([^'"]+)['"]\s*:/g;
  let match;
  while ((match = re.exec(body))) keys.add(match[1]);
  return keys;
}

const languageContext = read('src/context/LanguageContext.tsx');
const firebaseRuntime = read('src/lib/firebase.ts');
const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');
const firebaseJson = read('firebase.json');
const packageJson = read('package.json');

const enKeys = extractTranslationKeys(languageContext, 'en');
const arKeys = extractTranslationKeys(languageContext, 'ar');
const missingArabic = [...enKeys].filter((key) => !arKeys.has(key)).sort();
const extraArabic = [...arKeys].filter((key) => !enKeys.has(key)).sort();

assert(enKeys.size > 0, 'English translation keys were not detected.');
assert(arKeys.size > 0, 'Arabic translation keys were not detected.');
assert(missingArabic.length === 0, `Arabic translation parity failed. Missing ${missingArabic.length} key(s): ${missingArabic.slice(0, 40).join(', ')}`);
warn(extraArabic.length === 0, `Arabic has ${extraArabic.length} extra key(s) not present in English: ${extraArabic.slice(0, 20).join(', ')}`);

assert(languageContext.includes('document.documentElement.dir') || languageContext.includes('dir ='), 'Language switch must set document direction for RTL/LTR.');
assert(languageContext.includes('localStorage'), 'Language preference must persist locally.');

assert(firebaseRuntime.includes('getFirestore(app)'), 'Firestore runtime must be initialized.');
assert(firebaseRuntime.includes('getStorage(app)'), 'Firebase Storage runtime must be initialized.');
assert(firebaseRuntime.includes('getFunctions(app, FUNCTIONS_REGION)'), 'Firebase Functions runtime must use explicit region.');
assert(firebaseRuntime.includes('getSafeMessaging'), 'Messaging must be wrapped in a safe support check.');
warn(!firebaseRuntime.includes('appCheckExplicitlyEnabled = false'), 'Firebase App Check is disabled in runtime. Enable before public launch after domain/provider setup.');

assert(firestoreRules.includes('safeUserSelfUpdate'), 'Firestore rules must include safe user self-update guard.');
assert(firestoreRules.includes('affectedKeys().hasOnly'), 'Firestore rules must enforce field allow-lists for user self updates.');
assert(storageRules.includes('isDocumentUpload'), 'Storage rules must restrict document uploads by type/size.');
assert(storageRules.includes('isImageUpload'), 'Storage rules must restrict image uploads by type/size.');
assert(firebaseJson.includes('"storage"'), 'firebase.json must deploy Storage rules.');

const sourceFiles = walk('src');
const allSource = sourceFiles.map((file) => `${file}\n${readFileSync(file, 'utf8')}`).join('\n');
warn(allSource.includes('navigator.geolocation'), 'No navigator.geolocation usage found in src. GPS may be simulated or server-only.');
warn(allSource.includes('google') || allSource.includes('maps') || allSource.includes('placeId'), 'No Google Maps / placeId reference found in src scan. Map UI may be missing or abstracted.');
warn(allSource.includes('uploadBytes') || allSource.includes('uploadBytesResumable'), 'No Firebase Storage upload usage found in src scan.');
warn(allSource.includes('jsPDF') || allSource.includes('pdf'), 'No PDF generation/reference found in src scan.');
warn(allSource.includes('getToken') || allSource.includes('Notification'), 'No browser push-notification/token request usage found in src scan.');

// ── Production environment variable checks ───────────────────────────────────
// These checks run against the current process.env — they catch missing secrets
// during local validation and in CI pre-deploy steps.
const envVapidKey = process.env.VITE_FIREBASE_VAPID_KEY || '';
const envMapsKey = process.env.VITE_GOOGLE_MAPS_API_KEY || '';
const envAppCheckKey = process.env.VITE_APP_CHECK_SITE_KEY || '';
const envAppCheckEnabled = process.env.VITE_ENABLE_FIREBASE_APPCHECK || '';
const VAPID_HARDCODED_DEFAULT = 'BAx9XuLU';

assert(
  envVapidKey && !envVapidKey.startsWith(VAPID_HARDCODED_DEFAULT),
  'VITE_FIREBASE_VAPID_KEY is missing or uses the hardcoded default. Push notifications will not work in production. ' +
  'Get from: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair.'
);
assert(
  Boolean(envMapsKey && envMapsKey !== 'REPLACE_WITH_MAPS_KEY'),
  'VITE_GOOGLE_MAPS_API_KEY is not set. GPS dispatch and embedded maps will not function in production. ' +
  'Get from: console.cloud.google.com → APIs & Services → Credentials.'
);
warn(
  Boolean(envAppCheckKey && envAppCheckKey !== 'REPLACE_WITH_RECAPTCHA_V3_SITE_KEY'),
  'VITE_APP_CHECK_SITE_KEY is not set. Firebase APIs are unprotected against abuse. ' +
  'Get from: Google reCAPTCHA Admin Console → Create reCAPTCHA v3 site.'
);
assert(
  envAppCheckEnabled === 'true',
  'VITE_ENABLE_FIREBASE_APPCHECK is not set to "true". App Check enforcement is disabled in this environment.'
);

assert(packageJson.includes('test:stability'), 'package.json must expose production stability test script.');

if (warnings.length) {
  console.warn('\nProduction runtime audit warnings:\n');
  for (const item of warnings) console.warn(`- ${item}`);
}

if (failures.length) {
  console.error('\nProduction runtime audit failed:\n');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log('Production runtime audit passed.');
