import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../scripts/deploy-firebase-production.mjs', import.meta.url), 'utf8');

const allowlistMatch = source.match(/const adminBootstrapFunctions = Object\.freeze\(\[([\s\S]*?)\]\);/);

const expected = [
  'registerAdminSecuritySession',
  'getAdminSecurityProfile',
  'getAdminMfaReadinessOverview',
  'revokeAdminSessions',
  'lockOwnAdminAccount',
  'finalizeOwnAdminMfaRecovery',
];

test('Admin MFA bootstrap function allowlist is exact and does not expand to the full Functions surface', () => {
  assert.ok(allowlistMatch, 'bootstrap function allowlist must be declared explicitly');
  const actual = [...allowlistMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(actual, expected);
  assert.match(source, /adminBootstrapDeployComponents = Object\.freeze\(\[/);
  assert.match(source, /\.\.\.adminBootstrapFunctions\.map\(\(functionName\) => `functions:\$\{functionName\}`\)/);
  assert.match(source, /\['getAdminMfaReadinessOverview', adminReadinessSource\]/);
  assert.match(source, /sendEmailVerification/);
  assert.match(source, /admin-mfa-readiness-overview/);
  assert.doesNotMatch(allowlistMatch[1], /createAdminMfaRecoveryRequest|approveAdminMfaRecoveryRequest|listAdminMfaRecoveryRequests/);
});
