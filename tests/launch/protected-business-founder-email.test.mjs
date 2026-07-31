import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/prepare-protected-business-fixtures.mjs', 'utf8');

test('protected business fixtures resolve Founder email from the protected allowlist without weakening authorization', () => {
  assert.ok(source.includes("import { parseCsvRequired } from './lib/hard-launch-control.mjs';"));
  assert.ok(source.includes('process.env.AUTHORIZED_FOUNDER_EMAILS'));
  assert.ok(source.includes('authorizedFounderEmails.length === 1'));
  assert.ok(source.includes('authorizedFounderEmails.includes(founderEmail)'));
  assert.ok(source.includes('Founder evidence email is not listed in AUTHORIZED_FOUNDER_EMAILS.'));
});
