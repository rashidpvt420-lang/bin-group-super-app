import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAuthorizedEmail } from '../../scripts/lib/identity-normalization.mjs';

test('founder email normalization removes accidental whitespace and canonicalizes case', () => {
  assert.equal(
    normalizeAuthorizedEmail('  Rashid. pvt420@GMAIL.COM  '),
    'rashid.pvt420@gmail.com',
  );
});

test('founder email normalization rejects malformed addresses', () => {
  assert.throws(() => normalizeAuthorizedEmail('rashid.pvt420gmail.com'), /valid email address/);
  assert.throws(() => normalizeAuthorizedEmail('rashid@@gmail.com'), /valid email address/);
});

test('signed founder authorization canonicalizes before exact allowlist membership', async () => {
  const source = await readFile(
    new URL('../../scripts/create-hard-launch-authorization.mjs', import.meta.url),
    'utf8',
  );
  const normalizationIndex = source.indexOf("normalizeAuthorizedEmail(requiredEnv('FOUNDER_EMAIL'))");
  const allowlistIndex = source.indexOf('authorizedEmails.includes(founderEmail)');
  assert.ok(normalizationIndex >= 0, 'founder email must be canonicalized');
  assert.ok(allowlistIndex > normalizationIndex, 'exact allowlist membership must run after canonicalization');
  assert.match(source, /founder:\s*\{[\s\S]*email:\s*founderEmail/);
});
