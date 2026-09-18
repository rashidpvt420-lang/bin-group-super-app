import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerUrl = new URL('../../scripts/run-owner-business-suite-evidence.mjs', import.meta.url);
const source = readFileSync(runnerUrl, 'utf8')
  .replace(/^#![^\n]*\n/, '')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('import.meta.url', JSON.stringify(runnerUrl.href));

function run(mode, failure) {
  const calls = [];
  const diagnostics = [];
  const environment = { EXISTING_BINDING: 'preserved' };
  const dotenvCalls = [];
  let error;
  try {
    new Function('execFileSync', 'existsSync', 'readdirSync', 'path', 'loadDotenv', 'fileURLToPath', 'process', 'console', source)(
      (executable, args, options) => { calls.push({ executable, args, options }); if (failure) throw failure; },
      () => true,
      () => ['owner-diagnostics.json', 'unrelated.json'],
      path,
      (options) => dotenvCalls.push(options),
      fileURLToPath,
      { execPath: process.execPath, env: environment, argv: ['node', 'runner', mode] },
      { error: (message) => diagnostics.push(message) },
    );
  } catch (caught) { error = caught; }
  return { calls, diagnostics, dotenvCalls, error };
}

test('Owner lifecycle preserves inherited bindings and non-overriding dotenv configuration', () => {
  const result = run('lifecycle');
  assert.ifError(result.error);
  assert.equal(result.dotenvCalls[0].override, false);
  assert.deepEqual(result.calls[0].args, ['scripts/run-owner-inspection-first-production-evidence.mjs']);
  assert.deepEqual(result.calls[0].options.env, { EXISTING_BINDING: 'preserved', DEPLOYMENT_ENVIRONMENT: 'production' });
  assert.equal(result.calls[0].options.cwd, path.resolve(fileURLToPath(new URL('..', runnerUrl))));
  assert.equal(result.calls[0].options.timeout, 18 * 60 * 1000);
});

test('restoration keeps fixture, payment policy, and Founder geography ordering', () => {
  const result = run('restore-shared-fixtures');
  assert.ifError(result.error);
  assert.deepEqual(result.calls.map(call => call.args[0]), [
    'scripts/seed-live-role-test-data.mjs',
    'scripts/ensure-phase1-manual-payment-config.mjs',
    'scripts/prepare-protected-business-fixtures.mjs',
  ]);
});

test('child failure remains fatal and identifies the failed script without echoing exception payloads', () => {
  const failure = Object.assign(new Error('private child payload'), { status: 7, signal: null });
  const result = run('restore-shared-fixtures', failure);
  assert.equal(result.error, failure);
  assert.equal(result.calls.length, 1);
  assert.match(result.diagnostics.join('\n'), /seed-live-role-test-data\.mjs failed/);
  assert.match(result.diagnostics.join('\n'), /exitCode=7/);
  assert.doesNotMatch(result.diagnostics.join('\n'), /private child payload/);
});

test('role fixture synchronization does not carry stale privileged claims into another role', () => {
  const seeder = readFileSync(new URL('../../scripts/seed-e2e-auth.mjs', import.meta.url), 'utf8');
  const body = seeder.match(/function expectedRoleClaims\(role, extraClaims = \{\}\) \{([\s\S]*?)\n\}/)[1];
  const canonicalClaims = new Function('role', 'extraClaims', body);
  assert.deepEqual(canonicalClaims('broker', { role: 'broker', testAccount: true }), {
    role: 'broker', userRole: 'broker', primaryRole: 'broker', active: true, testAccount: true,
  });
  assert.doesNotMatch(seeder, /\.\.\.\s*\(?authUser\.customClaims/);
  assert.match(seeder, /expectedRoleClaims\(user\.role, user\.claims \|\| \{\}\)/);
});
