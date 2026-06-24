import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const failures = [];
const warnings = [];

function loadDotEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

for (const envFile of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  loadDotEnvFile(envFile);
}

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
const adminFirebaseRuntime = read('apps/admin-panel/src/lib/firebase.ts');
const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');
const firebaseJson = read('firebase.json');
const packageJson = read('package.json');
const deploymentChecklist = read('docs/production-env-checklist.md');
const stripePaymentFunction = read('functions/stripePayment.ts');
const mailDeliveryFunction = read('functions/mailDelivery.ts');
const whatsappWebhookFunction = read('functions/whatsappWebhook.ts');
const aiAssistantFunction = read('functions/aiAssistant.ts');
const runtimeExports = read('functions/runtime.ts');
const runtimeAllExports = read('functions/runtimeAll.ts');

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
assert(firebaseRuntime.includes("readEnv('VITE_APP_CHECK_SITE_KEY')"), 'Root Firebase runtime must read VITE_APP_CHECK_SITE_KEY from environment.');
assert(firebaseRuntime.includes("readEnv('VITE_ENABLE_FIREBASE_APPCHECK') === 'true'"), 'Root Firebase runtime must gate App Check on VITE_ENABLE_FIREBASE_APPCHECK=true.');
assert(adminFirebaseRuntime.includes('initializeAppCheck'), 'Admin Firebase runtime must support App Check initialization.');
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

// ── Provider integration contract checks ─────────────────────────────────────
// These checks are static by design: backend provider secrets must live in
// Firebase Secret Manager, not GitHub Actions or committed .env files.
assert(stripePaymentFunction.includes('defineSecret("STRIPE_SECRET_KEY")'), 'Stripe function must use Firebase Secret Manager key STRIPE_SECRET_KEY.');
assert(stripePaymentFunction.includes('defineSecret("STRIPE_WEBHOOK_SECRET")'), 'Stripe function must use Firebase Secret Manager key STRIPE_WEBHOOK_SECRET.');
assert(stripePaymentFunction.includes('stripe.webhooks.constructEvent') || stripePaymentFunction.includes('webhooks.constructEvent'), 'Stripe webhook must verify Stripe signatures before accepting payment events.');
assert(runtimeExports.includes('export * from "./stripePayment"'), 'Stripe payment functions must be exported from the deployed runtime entrypoint.');

assert(mailDeliveryFunction.includes('defineSecret("SMTP_USER")'), 'Mail function must use Firebase Secret Manager key SMTP_USER.');
assert(mailDeliveryFunction.includes('defineSecret("SMTP_PASS")'), 'Mail function must use Firebase Secret Manager key SMTP_PASS.');
assert(mailDeliveryFunction.includes('process.env.MAIL_FROM') || mailDeliveryFunction.includes('process.env.SMTP_FROM'), 'Mail function must support branded sender configuration.');
assert(runtimeExports.includes('export * from "./mailDelivery"'), 'Mail delivery functions must be exported from the deployed runtime entrypoint.');

assert(deploymentChecklist.includes('STRIPE_SECRET_KEY'), 'Production checklist must require STRIPE_SECRET_KEY.');
assert(deploymentChecklist.includes('STRIPE_WEBHOOK_SECRET'), 'Production checklist must require STRIPE_WEBHOOK_SECRET.');
assert(deploymentChecklist.includes('SMTP_USER'), 'Production checklist must require SMTP_USER.');
assert(deploymentChecklist.includes('SMTP_PASS'), 'Production checklist must require SMTP_PASS.');
assert(
  !deploymentChecklist.includes('functions:secrets:set SMTP_PASSWORD') && !deploymentChecklist.includes('`SMTP_PASSWORD` set in Firebase'),
  'Production checklist must not instruct setting the obsolete SMTP_PASSWORD secret; use SMTP_PASS.'
);

assert(whatsappWebhookFunction.includes('defineSecret("WHATSAPP_TOKEN")'), 'WhatsApp webhook must use Firebase Secret Manager key WHATSAPP_TOKEN.');
assert(whatsappWebhookFunction.includes('defineSecret("WHATSAPP_PHONE_NUMBER_ID")'), 'WhatsApp webhook must use Firebase Secret Manager key WHATSAPP_PHONE_NUMBER_ID.');
assert(whatsappWebhookFunction.includes('defineSecret("WHATSAPP_VERIFY_TOKEN")'), 'WhatsApp webhook must use Firebase Secret Manager key WHATSAPP_VERIFY_TOKEN.');
assert(
  runtimeAllExports.includes('export * from "./whatsappWebhook"') || runtimeAllExports.includes("export * from './whatsappWebhook'"),
  'WhatsApp webhook must be exported from the deployed runtime entrypoint.'
);

assert(aiAssistantFunction.includes('defineSecret("OPENAI_API_KEY")'), 'AI assistant function must use Firebase Secret Manager key OPENAI_API_KEY.');
assert(aiAssistantFunction.includes('defineSecret("GEMINI_API_KEY")'), 'AI assistant function must use Firebase Secret Manager key GEMINI_API_KEY.');
assert(runtimeExports.includes('export * from "./aiAssistant"'), 'AI assistant functions must be exported from the deployed runtime entrypoint.');

assert(deploymentChecklist.includes('WHATSAPP_TOKEN'), 'Production checklist must require WHATSAPP_TOKEN.');
assert(deploymentChecklist.includes('OPENAI_API_KEY'), 'Production checklist must require OPENAI_API_KEY.');

// ── Frontend/backend callable wiring check ────────────────────────────────────
// Catches the exact bug class where a frontend httpsCallable() name was renamed,
// typo'd, or never implemented on the backend - the function silently 404s at
// call time since there's no compile-time link between the two sides.
function extractCalledFunctionNames(source) {
  const names = new Set();
  const re = /httpsCallable(?:<[^>]*>)?\(\s*functions\s*,\s*['"]([\w.-]+)['"]/g;
  let match;
  while ((match = re.exec(source))) names.add(match[1]);
  return names;
}

function extractExportedCallableNames(source) {
  const names = new Set();
  const re = /export\s+const\s+(\w+)\s*=\s*onCall\s*\(/g;
  let match;
  while ((match = re.exec(source))) names.add(match[1]);
  return names;
}

const frontendFiles = [...walk('src'), ...walk('apps')];
const calledFunctionNames = new Set();
for (const file of frontendFiles) {
  for (const name of extractCalledFunctionNames(readFileSync(file, 'utf8'))) calledFunctionNames.add(name);
}

const backendCallableNames = new Set();
if (existsSync('functions')) {
  for (const entry of readdirSync('functions')) {
    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;
    for (const name of extractExportedCallableNames(readFileSync(join('functions', entry), 'utf8'))) {
      backendCallableNames.add(name);
    }
  }
}

const phantomCallables = [...calledFunctionNames].filter((name) => !backendCallableNames.has(name)).sort();
warn(
  phantomCallables.length === 0,
  `Frontend calls ${phantomCallables.length} Cloud Function(s) with no matching "export const <name> = onCall(...)" anywhere under functions/: ${phantomCallables.join(', ')}. ` +
  'Verify each call site is either dead/unrouted code or needs a real backend implementation.'
);

// ── Production environment variable checks ───────────────────────────────────
// These checks run against the current process.env — they catch missing public
// client keys during local validation and in CI pre-deploy steps.
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
assert(packageJson.includes('test:e2e:business'), 'package.json must expose deep 5-profile business workflow tests.');

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
