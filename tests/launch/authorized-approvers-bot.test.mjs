import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAuthorizedApprover,
  parseAuthorizedApprovers,
  requireAuthorizedApprover,
} from '../../scripts/lib/authorized-approvers.mjs';

test('protected approver parser accepts normal GitHub users and GitHub App bot logins', () => {
  assert.deepEqual(
    parseAuthorizedApprovers('rashidpvt420-lang, github-actions[bot], rashidpvt420-lang'),
    ['rashidpvt420-lang', 'github-actions[bot]'],
  );
});

test('protected bot actor must still be explicitly present in the allowlist', () => {
  const env = { AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang,github-actions[bot]' };
  assert.equal(isAuthorizedApprover('github-actions[bot]', env), true);
  assert.equal(requireAuthorizedApprover('github-actions[bot]', env), 'github-actions[bot]');
  assert.throws(
    () => requireAuthorizedApprover('untrusted-app[bot]', env),
    /Unauthorized GitHub actor/,
  );
});

test('malformed bracketed actors remain fail-closed', () => {
  for (const value of [
    'github-actions[admin]',
    'github-actions[bot]extra',
    '[bot]',
    'github_actions[bot]',
    'github-actions[bot],bad actor',
  ]) {
    assert.throws(
      () => parseAuthorizedApprovers(value),
      /Invalid authorized GitHub actor value/,
      value,
    );
  }
});
