import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAuthorizedApprover,
  parseAuthorizedApprovers,
  requireAuthorizedApprover,
} from '../../scripts/lib/authorized-approvers.mjs';

test('authorized approvers accept normal users and explicitly listed GitHub App bot actors', () => {
  assert.deepEqual(
    parseAuthorizedApprovers('rashidpvt420-lang, github-actions[bot], rashidpvt420-lang'),
    ['rashidpvt420-lang', 'github-actions[bot]'],
  );
  assert.equal(
    requireAuthorizedApprover('github-actions[bot]', {
      AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang,github-actions[bot]',
    }),
    'github-actions[bot]',
  );
  assert.equal(
    isAuthorizedApprover('github-actions[bot]', {
      AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang',
    }),
    false,
  );
});

test('authorized approvers still reject malformed actor values', () => {
  assert.throws(
    () => parseAuthorizedApprovers('rashidpvt420-lang, bad actor, [bot]'),
    /Invalid authorized GitHub actor value/,
  );
});
