import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('functions');
const APPROVED_EXCEPTIONS = new Set([
  'ownerOnboarding.ts:upsertOwnerOnboardingProfile',
  'publicRoleAssignment.ts:assignPublicPortalRole',
]);

function filesUnder(directory) {
  const out = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'lib' || entry === 'node_modules') continue;
    const full = path.join(directory, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...filesUnder(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

function directCallableOptions(source) {
  const rows = [];
  const pattern = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*onCall\s*\(\s*(\{[\s\S]*?\})\s*,/g;
  let match;
  while ((match = pattern.exec(source))) {
    rows.push({ name: match[1], options: match[2] });
  }
  return rows;
}

test('Phase 10: every directly configured callable enforces App Check unless explicitly approved', () => {
  const failures = [];
  const observedExceptions = new Set();

  for (const full of filesUnder(ROOT)) {
    const relative = path.relative(ROOT, full).replaceAll(path.sep, '/');
    const source = readFileSync(full, 'utf8');

    for (const callable of directCallableOptions(source)) {
      const key = `${relative}:${callable.name}`;
      const enabled = /\benforceAppCheck\s*:\s*true\b/.test(callable.options);
      const disabled = /\benforceAppCheck\s*:\s*false\b/.test(callable.options);

      if (APPROVED_EXCEPTIONS.has(key)) {
        observedExceptions.add(key);
        if (!disabled) failures.push(`${key} must keep its exception explicit as enforceAppCheck: false`);
        continue;
      }

      if (!enabled) failures.push(`${key} does not explicitly enforce App Check`);
      if (disabled) failures.push(`${key} disables App Check without an approved exception`);
    }
  }

  assert.deepEqual(
    [...observedExceptions].sort(),
    [...APPROVED_EXCEPTIONS].sort(),
    'Approved App Check exceptions must remain present and explicit',
  );
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('Phase 10: bootstrap App Check exceptions document bounded security rationale', () => {
  const owner = readFileSync(path.join(ROOT, 'ownerOnboarding.ts'), 'utf8');
  const role = readFileSync(path.join(ROOT, 'publicRoleAssignment.ts'), 'utf8');

  assert.match(owner, /intentionally relies on verified Firebase Auth rather than App Check/);
  assert.match(owner, /cannot create Auth users or grant an admin role/);
  assert.match(role, /login bootstrap/i);
  assert.match(role, /rejects every\s+privileged\/admin identity/i);
});
