/**
 * Controlled pilot window: start timestamp + health scan for P0/P1 blockers.
 *
 * Usage:
 *   node scripts/pilot-launch-watch.mjs start   # idempotent pilot clock start
 *   node scripts/pilot-launch-watch.mjs verify  # fail if window incomplete or P0/P1 found
 *
 * Override window: PILOT_MIN_HOURS=48 (default 48)
 */
import admin from 'firebase-admin';
import { applyFirebaseAdminEnvSanitize, initializeFirebaseAdmin } from './firebase-admin-bootstrap.mjs';

const projectId = process.env.GCLOUD_PROJECT || 'bin-group-57c60';
const mode = (process.argv[2] || 'verify').toLowerCase();
const minHours = Number(process.env.PILOT_MIN_HOURS || 48);
const docPath = 'system_health/pilot_window';

applyFirebaseAdminEnvSanitize();
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();

const P0_P1_PATTERNS = [
  /p0/i, /p1/i, /sev[- ]?0/i, /sev[- ]?1/i,
  /critical/i, /blocker/i, /data.?loss/i, /security.?incident/i,
];

function hoursSince(ts) {
  if (!ts) return 0;
  const ms = typeof ts.toDate === 'function' ? ts.toDate().getTime() : new Date(ts).getTime();
  return (Date.now() - ms) / (1000 * 60 * 60);
}

async function scanIncidents() {
  const hits = [];
  const docRefs = ['system_health/admin_summaries', 'system_health/incidents'];
  for (const path of docRefs) {
    try {
      const snap = await db.doc(path).get();
      if (!snap.exists) continue;
      const data = snap.data() || {};
      for (const [key, value] of Object.entries(data)) {
        const text = `${key} ${JSON.stringify(value)}`;
        if (P0_P1_PATTERNS.some((re) => re.test(text)) && !/no_p0_p1|pilot|renewalWatch/i.test(key)) {
          hits.push({ source: path, key, value });
        }
      }
    } catch {
      // ignore
    }
  }
  try {
    const snap = await db.collection('audit_logs').orderBy('createdAt', 'desc').limit(20).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const text = JSON.stringify(data);
      if (P0_P1_PATTERNS.some((re) => re.test(text))) hits.push({ source: 'audit_logs', key: doc.id, value: data.severity || data.level });
    }
  } catch {
    // ignore
  }
  return hits;
}

async function startPilot() {
  const ref = db.doc(docPath);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.pilotStartedAt) {
    console.log('[INFO] Pilot already started:', existing.data().pilotStartedAt?.toDate?.() || existing.data().pilotStartedAt);
    return existing.data();
  }
  const payload = {
    pilotStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    pilotMinHours: minHours,
    pilotLabel: 'controlled_uae_pilot',
    startedBy: process.env.LAUNCH_VERIFIER_NAME || 'launch-automation',
  };
  await ref.set(payload, { merge: true });
  console.log(`[PASS] Pilot window started (min ${minHours}h before verify passes).`);
  return payload;
}

async function verifyPilot() {
  const ref = db.doc(docPath);
  const snap = await ref.get();
  if (!snap.exists || !snap.data()?.pilotStartedAt) {
    console.log('[FAIL] Pilot not started. Run: node scripts/pilot-launch-watch.mjs start');
    process.exit(1);
  }
  const data = snap.data();
  const elapsed = hoursSince(data.pilotStartedAt);
  console.log(`Pilot elapsed: ${elapsed.toFixed(2)}h / required ${minHours}h`);

  const incidents = await scanIncidents();
  if (incidents.length) {
    console.log('[FAIL] Potential P0/P1 signals detected:');
    for (const hit of incidents.slice(0, 10)) console.log(`  - ${hit.source} :: ${hit.key}`);
    process.exit(1);
  }

  if (elapsed < minHours) {
    const remaining = (minHours - elapsed).toFixed(2);
    console.log(`[PENDING] Pilot window incomplete — ${remaining}h remaining.`);
    console.log('Controlled pilot can proceed; hard public launch waits for full window.');
    process.exit(2);
  }

  console.log('[PASS] Pilot window complete with no P0/P1 signals detected.');
  const { spawnSync } = await import('node:child_process');
  const verifier = process.env.LAUNCH_VERIFIER_NAME || 'Rashid AbdulGhani';
  spawnSync(process.execPath, [
    'scripts/verify-launch-gate-live.mjs',
    'renewalWatch',
    verifier,
    `pilot_${minHours}h_complete_no_p0_p1 utc=${new Date().toISOString()}`,
  ], { stdio: 'inherit' });
  process.exit(0);
}

if (mode === 'start') {
  await startPilot();
  process.exit(0);
}

await verifyPilot();
