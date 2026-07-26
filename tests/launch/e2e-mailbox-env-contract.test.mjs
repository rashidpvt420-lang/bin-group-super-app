import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['.github', 'scripts', 'test', 'tests'];
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.tsx', '.yml', '.yaml']);
const legacyOwnerEmail = ['E2E', 'OWNER', 'EMAIL'].join('_');
const legacyBrokerEmail = ['E2E', 'BROKER', 'EMAIL'].join('_');

function collectSourceFiles(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  const entries = readdirSync(absolutePath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'docs') return [];
      return collectSourceFiles(child);
    }
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [child] : [];
  });
}

test('Owner and Broker live credentials use dedicated mailbox environment keys everywhere', () => {
  const sourceFiles = [
    '.env.e2e.example',
    ...SOURCE_ROOTS.flatMap(collectSourceFiles),
  ];
  const staleConsumers = sourceFiles.filter((file) => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    return source.includes(legacyOwnerEmail) || source.includes(legacyBrokerEmail);
  });

  assert.deepEqual(staleConsumers, []);

  const envGuard = readFileSync(path.join(ROOT, 'scripts/verify-e2e-env.mjs'), 'utf8');
  assert.match(envGuard, /mailboxEmailEnv/);
  assert.match(envGuard, /mailbox_oauth_secrets=set/);

  for (const workflow of [
    '.github/workflows/live-role-smoke.yml',
    '.github/workflows/admin-production-evidence.yml',
    '.github/workflows/firebase-production-deploy.yml',
  ]) {
    const source = readFileSync(path.join(ROOT, workflow), 'utf8');
    assert.match(source, /E2E_OWNER_MAILBOX_EMAIL/);
    assert.match(source, /E2E_BROKER_MAILBOX_EMAIL/);
    assert.match(source, /E2E_OWNER_MAILBOX_REFRESH_TOKEN/);
    assert.match(source, /E2E_BROKER_MAILBOX_REFRESH_TOKEN/);
  }
});
