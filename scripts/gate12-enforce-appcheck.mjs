/**
 * Gate 12 — enable App Check enforcement for Firestore + Cloud Storage via REST API.
 * Functions already use enforceAppCheck: true in code.
 *
 * Does not use `gcloud firebase appcheck` (missing from many gcloud SDK installs).
 * Requires: gcloud auth login + firebaseappcheck.googleapis.com access.
 */
import {
  APPCHECK_SERVICES,
  enforceAppCheckService,
  getAccessToken,
  isEnforced,
  listAppCheckServices,
  printManualRunbook,
  serviceIdFromName,
} from './lib/appcheck-rest.mjs';

const PROJECT = process.env.GCLOUD_PROJECT || 'bin-group-57c60';
const DRY_RUN = process.argv.includes('--dry-run');

console.log(`\n=== Gate 12 App Check Enforcement (${PROJECT}) ===\n`);
console.log('API: firebaseappcheck.googleapis.com/v1beta\n');

const token = getAccessToken();
if (!token) {
  console.log('[PENDING] No gcloud access token — cannot PATCH enforcement via REST.');
  printManualRunbook(PROJECT);
  process.exit(0);
}

if (DRY_RUN) {
  console.log('[INFO] --dry-run: listing current enforcement only.\n');
  try {
    const listed = await listAppCheckServices(PROJECT, token);
    for (const svc of listed.services || []) {
      const id = serviceIdFromName(svc.name);
      console.log(`[INFO] ${id} — ${svc.enforcementMode || 'unknown'}`);
    }
  } catch (err) {
    console.log(`[WARN] List failed: ${err.message}`);
  }
  process.exit(0);
}

let patchFailed = 0;
for (const serviceId of APPCHECK_SERVICES) {
  const label = serviceId.replace('.googleapis.com', '');
  try {
    const result = await enforceAppCheckService(PROJECT, serviceId, token);
    const mode = result.service?.enforcementMode || 'ENFORCED';
    console.log(`[PASS] ${label} — ${mode}`);
  } catch (err) {
    console.log(`[FAIL] ${label} — ${err.message}`);
    patchFailed += 1;
  }
}

console.log('\nVerifying via REST list...');
try {
  const listed = await listAppCheckServices(PROJECT, token);
  const byId = new Map((listed.services || []).map((svc) => [serviceIdFromName(svc.name), svc]));
  let verifyFailed = 0;
  for (const serviceId of APPCHECK_SERVICES) {
    const svc = byId.get(serviceId);
    const mode = svc?.enforcementMode || 'unknown';
    const ok = isEnforced(mode);
    console.log(`[${ok ? 'PASS' : 'WARN'}] ${serviceId.replace('.googleapis.com', '')} — ${mode}`);
    if (!ok) verifyFailed += 1;
  }
  if (patchFailed || verifyFailed) {
    printManualRunbook(PROJECT);
    process.exit(patchFailed ? 1 : 0);
  }
} catch (err) {
  console.log(`[WARN] Verify list failed: ${err.message}`);
  if (patchFailed) {
    printManualRunbook(PROJECT);
    process.exit(1);
  }
}

console.log('\nApp Check console enforcement: PASS');
process.exit(0);
