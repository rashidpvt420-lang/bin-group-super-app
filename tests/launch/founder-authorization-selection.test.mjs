import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('automated Founder authorization selects one protected approved email from a multi-email allowlist', async () => {
  const source = await read('scripts/create-hard-launch-authorization.mjs');

  assert.match(source, /requiredEnv\(['"]PRODUCTION_APPROVED_BY['"]\)/);
  assert.match(source, /authorizedEmails\.includes\(protectedFounderEmail\)/);
  assert.match(source, /founderEmail:\s*protectedFounderEmail/);
  assert.match(source, /PRODUCTION_APPROVED_BY must be included in AUTHORIZED_FOUNDER_EMAILS/);
  assert.doesNotMatch(source, /authorizedEmails\.length !== 1/);
  assert.doesNotMatch(source, /founderEmail:\s*authorizedEmails\[0\]/);
});

test('the automation sentinel still requires exact owner PR evidence and does not bypass identity checks', async () => {
  const source = await read('scripts/create-hard-launch-authorization.mjs');

  for (const required of [
    'automated Founder identity may only be resolved for github-actions[bot]',
    'owner request PR must remain open and draft',
    'owner request PR is not bound to this exact main SHA',
    'owner request PR was not opened by the repository owner',
    'owner request PR must change only the canonical marker',
    'owner request marker must keep the public gate disabled',
    'owner request marker must not claim hard launch',
  ]) {
    assert.ok(source.includes(required), `missing fail-closed check: ${required}`);
  }
});
