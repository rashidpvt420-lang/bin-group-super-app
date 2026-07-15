import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const normalizer = path.join(root, 'scripts/normalize-security-rules-test.mjs');

test('security rule test normalization enforces callable-only lifecycle and is idempotent', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'bin-rule-test-normalize-'));
  try {
    mkdirSync(path.join(directory, 'test'), { recursive: true });
    const sourcePath = path.join(root, 'test/security-rules.test.js');
    const targetPath = path.join(directory, 'test/security-rules.test.js');
    writeFileSync(targetPath, readFileSync(sourcePath));

    const first = spawnSync(process.execPath, [normalizer], { cwd: directory, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const normalized = readFileSync(targetPath, 'utf8');
    assert.doesNotMatch(
      normalized,
      /assertSucceeds\(updateDoc\(doc\(techADb, 'maintenanceTickets\/ticket_3'\), \{\n\s*status: 'IN_PROGRESS'/,
    );
    assert.match(
      normalized,
      /assertFails\(updateDoc\(doc\(techADb, 'maintenanceTickets\/ticket_3'\), \{\n\s*status: 'IN_PROGRESS'/,
    );
    assert.match(
      normalized,
      /assertSucceeds\(updateDoc\(doc\(techADb, 'maintenanceTickets\/ticket_3'\), \{\n\s*technicianNotes: 'Verified evidence note from assigned technician\.'/,
    );

    const beforeSecond = readFileSync(targetPath);
    const second = spawnSync(process.execPath, [normalizer], { cwd: directory, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.deepEqual(readFileSync(targetPath), beforeSecond);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
