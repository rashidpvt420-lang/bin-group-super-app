import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function collectFiles(target, output = []) {
  if (!existsSync(target)) return output;
  const stats = statSync(target);
  if (stats.isFile()) {
    output.push(target);
    return output;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (['node_modules', 'build', 'dist', 'lib', 'coverage', 'test-results'].includes(entry.name)) continue;
    collectFiles(path.join(target, entry.name), output);
  }
  return output;
}

const auditedTargets = [
  'apps/admin-panel/src',
  'src',
  'functions/src',
  '.github/workflows',
  'scripts/seed-e2e-auth.mjs',
  'scripts/run-protected-business-evidence.mjs',
  'scripts/run-live-business-failure-diagnostics.mjs',
  'scripts/manage-e2e-admin-mfa-test.mjs',
  'firestore.rules',
  'storage.rules',
].map((entry) => path.join(repositoryRoot, entry));

const auditedFiles = auditedTargets
  .flatMap((target) => collectFiles(target))
  .filter((file) => /\.(?:[cm]?[jt]sx?|ya?ml|rules)$/.test(file));

const forbiddenPatterns = [
  /e2eBypass/,
  /E2E test bypass approval/,
  /isTestAccount\s*\?\s*false/,
  /sign_in_second_factor[^\n]{0,120}sms/i,
  /e2e-admin-mfa-factor/,
  /bin-e2e-admin-mfa-test/,
  /appVerificationDisabledForTesting/,
  /testPhoneNumbers/,
  /fictional[- ]phone/i,
  /manage-e2e-admin-mfa-test/,
  /GPS_DEBUG/,
  /DEBUG UI status/,
];

test('Admin recovery excludes prohibited production bypass, fake-factor and debug paths', () => {
  const matches = [];
  for (const file of auditedFiles) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) matches.push(`${path.relative(repositoryRoot, file)}: ${pattern}`);
      pattern.lastIndex = 0;
    }
  }
  assert.deepEqual(matches, [], `Forbidden recovery paths found:\n${matches.join('\n')}`);
});

test('recovery does not track real environment files', () => {
  const gitCmd = process.platform === 'win32' ? 'git.exe' : 'git';
  const tracked = execFileSync(gitCmd, ['ls-files'], { cwd: repositoryRoot, encoding: 'utf8', shell: process.platform === 'win32' })
    .split(/\r?\n/)
    .filter(Boolean);
  const prohibited = tracked.filter((file) => {
    const name = path.basename(file);
    if (name.endsWith('.example') || name.endsWith('.template')) return false;
    return /^\.env(?:\..+)?$/.test(name);
  });
  assert.deepEqual(prohibited, [], `Tracked environment files are prohibited: ${prohibited.join(', ')}`);
});

test('recovery preserves fail-closed Firestore and Storage writes', () => {
  for (const relative of ['firestore.rules', 'storage.rules']) {
    const source = readFileSync(path.join(repositoryRoot, relative), 'utf8');
    assert.doesNotMatch(source, /allow\s+(?:read\s*,\s*write|write)\s*:\s*if\s+true\s*;/, `${relative} contains an unconditional write rule`);
  }
});
