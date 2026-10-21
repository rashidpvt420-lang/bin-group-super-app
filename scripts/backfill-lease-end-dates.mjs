#!/usr/bin/env node
/**
 * Backfill lease start/end dates from a CSV the owner or admin has checked (feature 3).
 *
 * SAFETY: dry-run by default. It only prints the planned changes. Writing production data
 * requires BOTH --apply and --confirm=<the exact token printed by the dry run>, and must be
 * approved by Rashid first. Nothing is inferred or invented: rows without a valid end date
 * after the start date are reported and skipped.
 *
 *   node scripts/backfill-lease-end-dates.mjs --csv leases.csv            # dry run
 *   node scripts/backfill-lease-end-dates.mjs --csv leases.csv --apply --confirm=<token>
 *
 * CSV header: leaseId,startDate,endDate   (dates YYYY-MM-DD)
 */
import { readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validYmd = (v) => YMD.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  const idx = (n) => header.indexOf(n);
  if (idx('leaseId') < 0 || idx('startDate') < 0 || idx('endDate') < 0) throw new Error('CSV header must be leaseId,startDate,endDate');
  return lines.slice(1).map((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    return { line: i + 2, leaseId: cells[idx('leaseId')] || '', startDate: cells[idx('startDate')] || '', endDate: cells[idx('endDate')] || '' };
  });
}

export function planBackfill(rows, existing) {
  const plan = []; const skipped = [];
  for (const r of rows) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(r.leaseId)) { skipped.push({ ...r, reason: 'invalid leaseId' }); continue; }
    if (!validYmd(r.startDate) || !validYmd(r.endDate) || r.endDate <= r.startDate) { skipped.push({ ...r, reason: 'start/end must be YYYY-MM-DD with end after start' }); continue; }
    const current = existing.get(r.leaseId);
    if (!current) { skipped.push({ ...r, reason: 'lease not found' }); continue; }
    if (current.endDate || current.leaseEndDate) { skipped.push({ ...r, reason: 'already has an end date' }); continue; }
    plan.push({ leaseId: r.leaseId, set: { leaseStartDate: r.startDate, leaseEndDate: r.endDate, endDate: r.endDate } });
  }
  return { plan, skipped };
}

export const confirmTokenFor = (plan) => createHash('sha256').update(JSON.stringify(plan)).digest('hex').slice(0, 12);

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  const csvIdx = process.argv.indexOf('--csv');
  const csvPath = typeof args.csv === 'string' ? args.csv : process.argv[csvIdx + 1];
  if (!csvPath) throw new Error('--csv <file> is required');
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const { default: admin } = await import('firebase-admin');
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();
  const existing = new Map();
  for (const r of rows) {
    if (!r.leaseId || existing.has(r.leaseId)) continue;
    const snap = await db.collection('leases').doc(r.leaseId).get();
    if (snap.exists) existing.set(r.leaseId, snap.data());
  }
  const { plan, skipped } = planBackfill(rows, existing);
  const token = confirmTokenFor(plan);
  console.log(JSON.stringify({ mode: args.apply ? 'apply' : 'dry-run', planned: plan.length, skipped, confirmToken: token, plan }, null, 2));
  if (!args.apply) return;
  const given = Buffer.from(String(args.confirm ?? ''));
  const expected = Buffer.from(token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error(`Refusing to write: --confirm must equal ${token} (from the dry run).`);
  for (const p of plan) {
    await db.collection('leases').doc(p.leaseId).set({ ...p.set, endDateBackfilledAt: admin.firestore.FieldValue.serverTimestamp(), endDateSource: 'ADMIN_BACKFILL_CSV' }, { merge: true });
  }
  console.log(`Applied ${plan.length} lease date updates.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
