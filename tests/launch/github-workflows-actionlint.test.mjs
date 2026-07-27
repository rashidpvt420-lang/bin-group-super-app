import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const workflow of [
  '.github/workflows/admin-production-evidence.yml',
  '.github/workflows/firebase-production-deploy.yml',
  '.github/workflows/live-role-smoke.yml',
]) {
  test(`${workflow} uses supported action majors`, () => {
    const source = readFileSync(workflow, 'utf8');
    assert.doesNotMatch(source, /actions\/checkout@(v1|v2|v3)\b/);
    assert.doesNotMatch(source, /actions\/setup-node@(v1|v2|v3)\b/);
    assert.doesNotMatch(source, /actions\/upload-artifact@(v1|v2|v3)\b/);
    assert.doesNotMatch(source, /actions\/download-artifact@(v1|v2|v3)\b/);
  });
}
