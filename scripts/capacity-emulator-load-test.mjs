#!/usr/bin/env node
/**
 * Synthetic load test against the local Firebase Auth + Firestore emulators only.
 * Never points at production. Project must be demo-*.
 *
 * Emulator results are a relative bottleneck finder, not production capacity numbers.
 * The emulator is single-process and slower than Firestore production.
 */
import { createWriteStream } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import admin from 'firebase-admin';

const projectId = process.env.GCLOUD_PROJECT || 'demo-bin-capacity';
if (!projectId.startsWith('demo-')) {
  throw new Error(`Refusing to run: project must start with demo-, got ${projectId}`);
}
const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!fsHost || !authHost) {
  throw new Error('FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are required');
}

admin.initializeApp({ projectId });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const SEED = {
  owners: 400,
  tenants: 800,
  technicians: 100,
  admins: 5,
  properties: 2000,
  tickets: 5000,
};

const STAGES = [
  { vu: 50, durationMs: 12_000 },
  { vu: 100, durationMs: 12_000 },
  { vu: 250, durationMs: 15_000 },
  { vu: 500, durationMs: 15_000 },
  { vu: 1000, durationMs: 18_000 },
  { vu: 2500, durationMs: 20_000 },
];

const MIX = [
  ['owner_view_properties', 35],
  ['owner_view_tickets', 20],
  ['tenant_create_job', 15], // includes sharded admin counter + incremental owner summary
  ['technician_update_job', 15],
  ['admin_dashboard_limited', 10],
  ['admin_dashboard_unbounded', 5],
];

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx] * 10) / 10;
}

function summarize(samples) {
  const ok = samples.filter((s) => s.ok);
  const times = ok.map((s) => s.ms).sort((a, b) => a - b);
  const errors = samples.filter((s) => !s.ok);
  const byErr = {};
  for (const e of errors) {
    const key = e.err || 'unknown';
    byErr[key] = (byErr[key] || 0) + 1;
  }
  return {
    n: samples.length,
    ok: ok.length,
    errors: errors.length,
    errorRate: samples.length ? +(100 * errors.length / samples.length).toFixed(2) : 0,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    avg: times.length ? +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : null,
    min: times[0] ?? null,
    max: times[times.length - 1] ?? null,
    errorBreakdown: byErr,
  };
}

function processRssMb() {
  const mem = process.memoryUsage();
  return {
    rssMb: +(mem.rss / 1024 / 1024).toFixed(1),
    heapMb: +(mem.heapUsed / 1024 / 1024).toFixed(1),
  };
}

async function emulatorJavaRssMb() {
  try {
    const { execSync } = await import('node:child_process');
    const out = execSync("ps -eo pid,rss,comm,args | awk '/cloud-firestore-emulator|firestore-emulator|firebase/ && !/awk/ {print $2}'", { encoding: 'utf8' });
    const nums = out.trim().split('\n').map((s) => Number(s)).filter(Boolean);
    const kb = nums.reduce((a, b) => a + b, 0);
    return kb ? +(kb / 1024).toFixed(1) : null;
  } catch {
    return null;
  }
}

const owners = [];
const tenants = [];
const technicians = [];
const admins = [];
const propertyIdsByOwner = new Map();
const ticketIds = [];
const ticketsByOwner = new Map();
const ticketsByTech = new Map();

async function commitBatches(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const fn of ops.slice(i, i + 400)) fn(batch);
    await batch.commit();
  }
}

async function seed() {
  const t0 = performance.now();
  console.log(`[seed] writing ${SEED.owners} owners, ${SEED.tenants} tenants, ${SEED.technicians} techs, ${SEED.properties} properties, ${SEED.tickets} tickets`);

  const userOps = [];
  for (let i = 0; i < SEED.owners; i++) {
    const id = `owner_${String(i).padStart(4, '0')}`;
    owners.push(id);
    propertyIdsByOwner.set(id, []);
    ticketsByOwner.set(id, []);
    userOps.push((batch) => batch.set(db.collection('users').doc(id), {
      role: 'owner', uid: id, ownerId: id, displayName: `Owner ${i}`, emirate: i % 2 ? 'Dubai' : 'Abu Dhabi', createdAt: admin.firestore.Timestamp.now(),
    }));
  }
  for (let i = 0; i < SEED.tenants; i++) {
    const id = `tenant_${String(i).padStart(4, '0')}`;
    tenants.push(id);
    const ownerId = owners[i % owners.length];
    userOps.push((batch) => batch.set(db.collection('users').doc(id), {
      role: 'tenant', uid: id, ownerId, displayName: `Tenant ${i}`, createdAt: admin.firestore.Timestamp.now(),
    }));
  }
  for (let i = 0; i < SEED.technicians; i++) {
    const id = `tech_${String(i).padStart(3, '0')}`;
    technicians.push(id);
    ticketsByTech.set(id, []);
    userOps.push((batch) => batch.set(db.collection('users').doc(id), {
      role: 'technician', uid: id, displayName: `Tech ${i}`, onDuty: true, currentJobCount: 0, maxConcurrentJobs: 5, createdAt: admin.firestore.Timestamp.now(),
    }));
    userOps.push((batch) => batch.set(db.collection('technicians').doc(id), {
      uid: id, onDuty: true, currentJobCount: 0, maxConcurrentJobs: 5,
    }));
  }
  for (let i = 0; i < SEED.admins; i++) {
    const id = `admin_${i}`;
    admins.push(id);
    userOps.push((batch) => batch.set(db.collection('users').doc(id), {
      role: 'admin', uid: id, displayName: `Admin ${i}`, createdAt: admin.firestore.Timestamp.now(),
    }));
  }
  await commitBatches(userOps);

  const propOps = [];
  for (let i = 0; i < SEED.properties; i++) {
    const id = `prop_${String(i).padStart(5, '0')}`;
    const ownerId = owners[i % owners.length];
    propertyIdsByOwner.get(ownerId).push(id);
    propOps.push((batch) => batch.set(db.collection('properties').doc(id), {
      ownerId, name: `Property ${i}`, emirate: i % 2 ? 'Dubai' : 'Abu Dhabi', type: 'apartment', status: 'ACTIVE', createdAt: admin.firestore.Timestamp.now(),
    }));
  }
  await commitBatches(propOps);

  const statuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'];
  const ticketOps = [];
  for (let i = 0; i < SEED.tickets; i++) {
    const id = `tkt_${String(i).padStart(5, '0')}`;
    const ownerId = owners[i % owners.length];
    const tenantId = tenants[i % tenants.length];
    const techId = technicians[i % technicians.length];
    const propertyId = propertyIdsByOwner.get(ownerId)[0];
    const status = statuses[i % statuses.length];
    ticketIds.push(id);
    ticketsByOwner.get(ownerId).push(id);
    if (status === 'ASSIGNED' || status === 'IN_PROGRESS') ticketsByTech.get(techId).push(id);
    ticketOps.push((batch) => batch.set(db.collection('maintenanceTickets').doc(id), {
      ownerId, tenantId, propertyId, assignedTechnicianId: techId, status,
      category: i % 3 ? 'plumbing' : 'electrical',
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    }));
  }
  await commitBatches(ticketOps);

  await db.collection('admin_summaries').doc('global').set({
    openTickets: Math.floor(SEED.tickets * 0.6),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    rollupNote: 'cache only; live increments go to shards',
  });
  const shardOps = [];
  for (let i = 0; i < 20; i++) {
    shardOps.push((batch) => batch.set(db.collection('admin_summaries').doc('global').collection('shards').doc(String(i)), {
      openTickets: Math.floor((SEED.tickets * 0.6) / 20),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }));
  }
  await commitBatches(shardOps);

  const seedMs = Math.round(performance.now() - t0);
  console.log(`[seed] done in ${seedMs}ms`);
  return seedMs;
}

function pickWeighted() {
  const r = Math.random() * 100;
  let acc = 0;
  for (const [name, w] of MIX) {
    acc += w;
    if (r <= acc) return name;
  }
  return MIX[0][0];
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hashCode(value) {
  let hash = 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return hash;
}

async function runTransactionWithRetry(work, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await db.runTransaction(work);
    } catch (err) {
      lastError = err;
      const code = String(err?.code || '');
      const message = String(err?.message || '');
      const retryable = code.includes('ABORTED') || code === '10' || message.toLowerCase().includes('aborted') || message.toLowerCase().includes('contention');
      if (!retryable || attempt === attempts) throw err;
      const backoff = Math.min(800, 40 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 40);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw lastError;
}


async function scenario(name) {
  if (name === 'owner_view_properties') {
    const ownerId = pick(owners);
    await db.collection('properties').where('ownerId', '==', ownerId).limit(50).get();
    return;
  }
  if (name === 'owner_view_tickets') {
    const ownerId = pick(owners);
    await db.collection('maintenanceTickets').where('ownerId', '==', ownerId).limit(40).get();
    return;
  }
  if (name === 'tenant_create_job') {
    const ownerId = pick(owners);
    const tenantId = pick(tenants);
    const propertyId = propertyIdsByOwner.get(ownerId)[0];
    const ticketRef = db.collection('maintenanceTickets').doc();
    await ticketRef.set({
      ownerId, tenantId, propertyId, status: 'OPEN', category: 'plumbing',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      synthetic: true,
    });
    // Simulate sharded admin open-ticket increment (no single-doc hot write).
    const shardId = String(Math.abs(hashCode(ticketRef.id)) % 20);
    await db.collection('admin_summaries').doc('global').collection('shards').doc(shardId).set({
      openTickets: admin.firestore.FieldValue.increment(1),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    // Simulate incremental syncOwnerSummary: delta write, no owner-wide rescan.
    await db.collection('owner_summaries').doc(ownerId).set({
      openTickets: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return;
  }
  if (name === 'technician_update_job') {
    const techId = pick(technicians);
    const owned = ticketsByTech.get(techId);
    const ticketId = owned.length ? pick(owned) : pick(ticketIds);
    const ticketRef = db.collection('maintenanceTickets').doc(ticketId);
    await runTransactionWithRetry(async (tx) => {
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) return;
      tx.update(ticketRef, {
        status: 'IN_PROGRESS',
        assignedTechnicianId: techId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    // Job counts use increment so the technician doc is not a read-modify-write hot document.
    await db.collection('users').doc(techId).set({
      currentJobCount: admin.firestore.FieldValue.increment(1),
      lastUpdateAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return;
  }
  if (name === 'admin_dashboard_limited') {
    await Promise.all([
      db.collection('maintenanceTickets').limit(40).get(),
      db.collection('maintenanceTickets').count().get(),
      db.collection('properties').limit(40).get(),
      db.collection('properties').count().get(),
    ]);
    return;
  }
  if (name === 'admin_dashboard_unbounded') {
    // After the P0 fix this path is paginated + count(), not a full collection download.
    await Promise.all([
      db.collection('maintenanceTickets').orderBy(admin.firestore.FieldPath.documentId()).limit(40).get(),
      db.collection('maintenanceTickets').count().get(),
      db.collection('properties').orderBy(admin.firestore.FieldPath.documentId()).limit(40).get(),
      db.collection('properties').count().get(),
    ]);
    return;
  }
  throw new Error(`unknown scenario ${name}`);
}

async function runStage({ vu, durationMs }) {
  console.log(`\n[stage] ${vu} concurrent virtual users for ${durationMs / 1000}s`);
  const samples = [];
  const started = Date.now();
  let stopped = false;
  const workers = Array.from({ length: vu }, async (_, i) => {
    // Stagger start slightly so we do not open all sockets in one tick.
    await new Promise((r) => setTimeout(r, (i % 100) * 2));
    while (!stopped && Date.now() - started < durationMs) {
      const name = pickWeighted();
      const t0 = performance.now();
      try {
        await Promise.race([
          scenario(name),
          new Promise((_, reject) => setTimeout(() => reject(new Error('op_timeout_30s')), 30_000)),
        ]);
        samples.push({ name, ms: performance.now() - t0, ok: true });
      } catch (err) {
        samples.push({
          name,
          ms: performance.now() - t0,
          ok: false,
          err: `${err?.code || ''} ${err?.message || err}`.trim().slice(0, 180),
        });
      }
    }
  });
  const timeout = setTimeout(() => { stopped = true; }, durationMs + 5_000);
  await Promise.all(workers);
  clearTimeout(timeout);
  const elapsed = Date.now() - started;
  const overall = summarize(samples);
  const byName = {};
  for (const name of MIX.map((m) => m[0])) {
    byName[name] = summarize(samples.filter((s) => s.name === name));
  }
  const rps = +((overall.n / (elapsed / 1000)).toFixed(1));
  const javaRss = await emulatorJavaRssMb();
  const result = { vu, durationMs, elapsedMs: elapsed, rps, overall, byName, proc: processRssMb(), emulatorRssMb: javaRss };
  console.log(`[stage] vu=${vu} ops=${overall.n} rps=${rps} p50=${overall.p50}ms p95=${overall.p95}ms p99=${overall.p99}ms errors=${overall.errorRate}% rss=${result.proc.rssMb}MB emu=${javaRss}MB`);
  for (const [name, stats] of Object.entries(byName)) {
    if (!stats.n) continue;
    console.log(`        ${name}: n=${stats.n} p50=${stats.p50} p95=${stats.p95} err=${stats.errorRate}%`);
  }
  return result;
}

async function hotDocMicrobench() {
  console.log('\n[micro] 200 concurrent increments on sharded admin_summaries/global/shards/*');
  const samples = [];
  await Promise.all(Array.from({ length: 200 }, async (_, i) => {
    const t0 = performance.now();
    try {
      const shardId = String(i % 20);
      await db.collection('admin_summaries').doc('global').collection('shards').doc(shardId).set({
        openTickets: admin.firestore.FieldValue.increment(1),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      samples.push({ name: 'hot_increment', ms: performance.now() - t0, ok: true });
    } catch (err) {
      samples.push({ name: 'hot_increment', ms: performance.now() - t0, ok: false, err: `${err?.code || ''} ${err?.message || err}`.trim().slice(0, 180) });
    }
  }));
  const stats = summarize(samples);
  console.log(`[micro] sharded increment p50=${stats.p50} p95=${stats.p95} err=${stats.errorRate}% n=${stats.n}`);
  return stats;
}

async function unboundedReadMicrobench() {
  console.log('\n[micro] 20 concurrent paged admin reads (40 rows + count()) of tickets + properties');
  const samples = [];
  await Promise.all(Array.from({ length: 20 }, async () => {
    const t0 = performance.now();
    try {
      await Promise.all([
        db.collection('maintenanceTickets').limit(40).get(),
        db.collection('maintenanceTickets').count().get(),
        db.collection('properties').limit(40).get(),
        db.collection('properties').count().get(),
      ]);
      samples.push({ name: 'paged_admin_read', ms: performance.now() - t0, ok: true });
    } catch (err) {
      samples.push({ name: 'paged_admin_read', ms: performance.now() - t0, ok: false, err: `${err?.code || ''} ${err?.message || err}`.trim().slice(0, 180) });
    }
  }));
  const stats = summarize(samples);
  console.log(`[micro] paged admin read p50=${stats.p50} p95=${stats.p95} err=${stats.errorRate}% n=${stats.n}`);
  return stats;
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[load] project=${projectId} firestore=${fsHost} auth=${authHost}`);
  const seedMs = await seed();
  const hot = await hotDocMicrobench();
  const paged = await unboundedReadMicrobench();
  const stages = [];
  for (const stage of STAGES) {
    stages.push(await runStage(stage));
    // Brief cooldown so stages are distinguishable in logs.
    await new Promise((r) => setTimeout(r, 1500));
  }
  const report = {
    disclaimer: 'Emulator results are not production capacity numbers. The Firebase emulator is single-process and slower than production Firestore. Use this as a relative bottleneck finder only.',
    projectId,
    sha: process.env.CAPACITY_TEST_SHA || 'fix/admin-capacity',
    startedAt,
    finishedAt: new Date().toISOString(),
    seed: { ...SEED, seedMs },
    mix: MIX,
    hotDocMicrobench: hot,
    pagedReadMicrobench: paged,
    stages,
  };
  writeFileSync('/workspace/capacity-test/results-after.json', JSON.stringify(report, null, 2));
  console.log('\n[load] wrote /workspace/capacity-test/results-after.json');
}

main().catch((err) => {
  console.error('[load] FATAL', err);
  process.exit(1);
});
