#!/usr/bin/env node
/**
 * Idempotent launch evidence recorder.
 * Ties records to commit SHA, test name, timestamp, and successful exit code.
 * Never records adminCredentialLogin from route-only audits.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const outDir = path.join(process.cwd(), 'launch_package');
const evidencePath = path.join(outDir, 'launch-evidence-batch.json');

function usage() {
  console.error(`Usage:
  node scripts/record-launch-evidence-batch.mjs --test <name> --exit-code <0> --proof "<text>" [--source <script>]

Rules:
  - exit-code must be 0 to record a pass
  - adminCredentialLogin requires --source authenticated-admin-smoke (not route-only)
`);
  process.exit(1);
}

function argValue(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function gitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return (result.stdout || '').trim() || 'unknown';
}

const testName = argValue('test');
const proof = argValue('proof');
const source = argValue('source') || 'manual';
const exitCode = Number(argValue('exit-code'));
const commitSha = argValue('commit') || gitSha();

if (!testName || !proof || !Number.isFinite(exitCode)) usage();
if (proof.length < 20) {
  console.error('Proof text too short.');
  process.exit(1);
}

if (testName === 'adminCredentialLogin') {
  const allowed = new Set(['authenticated-admin-smoke', 'business-admin', 'final-admin-login']);
  if (!allowed.has(source)) {
    console.error('Refusing to record adminCredentialLogin from a route-only audit.');
    console.error(`Allowed --source values: ${[...allowed].join(', ')}`);
    process.exit(1);
  }
}

if (exitCode !== 0) {
  console.error(`[evidence] refusing to record pass for ${testName} with exit-code=${exitCode}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const batch = existsSync(evidencePath)
  ? JSON.parse(readFileSync(evidencePath, 'utf8'))
  : { records: [] };

const fingerprint = `${commitSha}|${testName}|${exitCode}|${source}`;
const existingIdx = (batch.records || []).findIndex((r) => r.fingerprint === fingerprint);
const record = {
  fingerprint,
  commitSha,
  testName,
  source,
  exitCode,
  proof,
  recordedAt: new Date().toISOString(),
};

if (existingIdx >= 0) {
  batch.records[existingIdx] = { ...batch.records[existingIdx], ...record, updatedAt: new Date().toISOString() };
  console.log(`[evidence] updated idempotent record for ${testName}`);
} else {
  batch.records = [...(batch.records || []), record];
  console.log(`[evidence] recorded ${testName}`);
}

batch.updatedAt = new Date().toISOString();
writeFileSync(evidencePath, JSON.stringify(batch, null, 2) + '\n');
console.log(`[evidence] wrote ${evidencePath}`);
process.exit(0);
