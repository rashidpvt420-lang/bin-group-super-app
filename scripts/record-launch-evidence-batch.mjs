#!/usr/bin/env node
/**
 * Manual evidence recorder — NON-CRITICAL notes only.
 * Critical launch evidence keys are rejected even if caller supplies exit-code 0 / source.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CRITICAL_EVIDENCE_KEYS,
  HARD_LAUNCH_CLAIM,
  gitSha,
  isCriticalEvidenceKey,
  evidencePath,
} from './lib/launch-honesty.mjs';

function usage() {
  console.error(`Usage:
  node scripts/record-launch-evidence-batch.mjs --test <nonCriticalName> --proof "<text>" [--note "..."]

Critical keys that CANNOT be recorded manually:
  ${CRITICAL_EVIDENCE_KEYS.join(', ')}

Use: node scripts/run-critical-evidence.mjs --suite <suite>
`);
  process.exit(1);
}

function argValue(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return '';
  return String(process.argv[idx + 1] || '').trim();
}

const testName = argValue('test');
const proof = argValue('proof') || argValue('note');
const source = argValue('source') || 'manual';
const exitCodeRaw = argValue('exit-code');
const commitOverride = argValue('commit');

if (!testName || !proof) usage();

if (isCriticalEvidenceKey(testName)) {
  console.error(`[evidence] REFUSED: "${testName}" is a critical evidence key.`);
  console.error('[evidence] Critical evidence must be produced by scripts/run-critical-evidence.mjs');
  console.error('[evidence] Manual --exit-code / --source values are ignored and cannot create this record.');
  process.exit(1);
}

// Even for non-critical notes, reject attempts to spoof execution fields.
if (exitCodeRaw !== '') {
  console.error('[evidence] REFUSED: --exit-code is not accepted on the manual recorder.');
  console.error('[evidence] Critical suites must use run-critical-evidence.mjs which captures the real exit code.');
  process.exit(1);
}
if (source && source !== 'manual' && /business-|adminCredential|launchAudit|production|appCheck/i.test(source)) {
  console.error(`[evidence] REFUSED: source "${source}" looks like a critical suite spoof.`);
  process.exit(1);
}
if (proof.length < 20) {
  console.error('Proof text too short.');
  process.exit(1);
}

const root = process.cwd();
const file = evidencePath(root);
mkdirSync(path.dirname(file), { recursive: true });
const batch = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { records: [] };
const commitSha = gitSha(root);

const record = {
  fingerprint: `${commitSha}|${testName}|manual-note`,
  commitSha,
  testName,
  source: 'manual',
  executionGenerated: false,
  proof,
  recordedAt: new Date().toISOString(),
  hardLaunchClaim: HARD_LAUNCH_CLAIM,
  noteOnly: true,
};

// Never allow commit override for notes either — bind to current SHA only.
if (commitOverride && commitOverride !== commitSha) {
  console.error('[evidence] REFUSED: --commit override is not allowed.');
  process.exit(1);
}

const idx = (batch.records || []).findIndex((r) => r.testName === testName && r.commitSha === commitSha && r.noteOnly === true);
if (idx >= 0) batch.records[idx] = { ...batch.records[idx], ...record, updatedAt: new Date().toISOString() };
else batch.records = [...(batch.records || []), record];
batch.updatedAt = new Date().toISOString();
batch.hardLaunchClaim = false;
writeFileSync(file, `${JSON.stringify(batch, null, 2)}\n`);
console.log(`[evidence] recorded non-critical note "${testName}" (hardLaunchClaim=false)`);
console.log('[evidence] critical keys remain execution-only via run-critical-evidence.mjs');
process.exit(0);
