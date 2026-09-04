import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const original = readFileSync('firestore.rules', 'utf8');
const storage = readFileSync('storage.rules', 'utf8');

function prepare(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'bin-design-rules-artifact-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, 'firestore.rules'), original);
  writeFileSync(path.join(directory, 'storage.rules'), storage);
  const run = (name) => spawnSync(process.execPath, [path.join(root, 'scripts', name)], { cwd: directory, encoding: 'utf8' });
  // Exercise the same ordered hardening stages that touch the affected rules.
  for (const script of ['apply-ticket-rule-binding.mjs', 'harden-final-firestore-authority.mjs',
    'harden-private-hr-authority.mjs', 'harden-private-hr-storage.mjs', 'harden-technician-live-location-authority.mjs']) {
    const result = run(script);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return { directory, run, rulesPath: path.join(directory, 'firestore.rules') };
}

test('deployable rules preserve design, GPS, payroll and private HR authority after hardening', (t) => {
  const f = prepare(t);
  const verification = f.run('verify-firestore-launch-hardening.mjs');
  assert.equal(verification.status, 0, verification.stderr || verification.stdout);
  const artifact = f.run('write-production-firestore-rules.mjs');
  assert.equal(artifact.status, 0, artifact.stderr || artifact.stdout);
  assert.equal(readFileSync(path.join(f.directory, 'launch_generated/firestore.rules'), 'utf8'), readFileSync(f.rulesPath, 'utf8'));
  const preparedStorage = readFileSync(path.join(f.directory, 'storage.rules'), 'utf8');
  assert.match(preparedStorage, /collection != 'design-payment-receipts'/);
  assert.match(preparedStorage, /collection != 'privateHrDocuments'/);
});

test('artifact writer refuses restored client payment approval or a missing Admin fallback exclusion', (t) => {
  const f = prepare(t);
  const hardened = readFileSync(f.rulesPath, 'utf8');
  for (const weakened of [
    hardened.replace('allow update, delete: if false;\n    }\n\n    match /design_quotes', 'allow update, delete: if isAdmin();\n    }\n\n    match /design_quotes'),
    hardened.replace("          'design_requests',\n", ''),
    hardened.replace('match /design_receipt_registry/{evidenceId}', 'match /retired_design_receipt_registry/{evidenceId}'),
  ]) {
    assert.notEqual(weakened, hardened);
    writeFileSync(f.rulesPath, weakened);
    const result = f.run('write-production-firestore-rules.mjs');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /design_(requests|receipt_registry)/);
    assert.equal(existsSync(path.join(f.directory, 'launch_generated/firestore.rules')), false);
  }
});
