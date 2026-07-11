/**
 * Gate 12 — App Check readiness (code + console enforcement via REST API).
 * Does not require `gcloud firebase appcheck` (not shipped in all gcloud SDK builds).
 */
import { readFileSync, existsSync } from 'node:fs';
import {
  APPCHECK_SERVICES,
  getAccessToken,
  isEnforced,
  listAppCheckServices,
  printManualRunbook,
  serviceIdFromName,
} from './lib/appcheck-rest.mjs';

const PROJECT = process.env.GCLOUD_PROJECT || 'bin-group-57c60';
let failed = 0;

function pass(label, detail = '') {
  console.log(`[PASS] ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  console.log(`[FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  failed += 1;
}

function warn(label, detail = '') {
  console.log(`[WARN] ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log('\n=== Gate 12 App Check Status ===\n');

const indexTs = existsSync('functions/index.ts') ? readFileSync('functions/index.ts', 'utf8') : '';
const mainFirebase = existsSync('src/lib/firebase.ts') ? readFileSync('src/lib/firebase.ts', 'utf8') : '';
const adminFirebase = existsSync('apps/admin-panel/src/lib/firebase.ts') ? readFileSync('apps/admin-panel/src/lib/firebase.ts', 'utf8') : '';

if (indexTs.includes('enforceAppCheck: true')) pass('Functions global App Check', 'setGlobalOptions');
else fail('Functions global App Check', 'enforceAppCheck missing');

if (mainFirebase.includes('VITE_ENABLE_FIREBASE_APPCHECK')) pass('Main app App Check gate', 'client init behind env flag');
else fail('Main app App Check gate');

if (adminFirebase.includes('REACT_APP_ENABLE_FIREBASE_APPCHECK')) pass('Admin panel App Check gate', 'client init behind env flag');
else fail('Admin panel App Check gate');

const prodEnv = existsSync('.env.production') ? readFileSync('.env.production', 'utf8') : '';
if (prodEnv.includes('VITE_ENABLE_FIREBASE_APPCHECK=true')) pass('Production build flag', 'VITE_ENABLE_FIREBASE_APPCHECK=true in .env.production');
else warn('Production build flag', 'VITE_ENABLE_FIREBASE_APPCHECK not true in local .env.production — may be set in CI secrets');

if (process.env.VITE_APP_CHECK_SITE_KEY) pass('Runtime site key', 'VITE_APP_CHECK_SITE_KEY set in environment');
else warn('Runtime site key', 'Set VITE_APP_CHECK_SITE_KEY in GitHub Secrets / CI for production builds');

console.log('\n--- Console enforcement (firebaseappcheck.googleapis.com) ---\n');

const token = getAccessToken();
if (!token) {
  warn('Console enforcement', 'No gcloud access token — run gcloud auth login');
  printManualRunbook(PROJECT);
} else {
  try {
    const result = await listAppCheckServices(PROJECT, token);
    if (!result.ok) {
      warn('Console enforcement', `REST list failed (${result.reason})`);
      printManualRunbook(PROJECT);
    } else {
      const byId = new Map(
        result.services.map((svc) => [serviceIdFromName(svc.name), svc])
      );
      let allTargetEnforced = true;
      for (const serviceId of APPCHECK_SERVICES) {
        const svc = byId.get(serviceId);
        const mode = svc?.enforcementMode || 'UNENFORCED';
        const label = serviceId.replace('.googleapis.com', '');
        if (isEnforced(mode)) pass(`Console enforcement: ${label}`, mode);
        else {
          warn(`Console enforcement: ${label}`, mode);
          allTargetEnforced = false;
        }
      }
      if (allTargetEnforced) pass('Console enforcement summary', 'Firestore + Storage ENFORCED');
      else printManualRunbook(PROJECT);
    }
  } catch (err) {
    warn('Console enforcement', `REST API error: ${err.message}`);
    printManualRunbook(PROJECT);
  }
}

if (failed) process.exit(1);
console.log('\nApp Check code readiness: PASS (console enforcement may still be required).');
process.exit(0);
