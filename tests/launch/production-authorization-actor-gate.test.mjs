import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('production deploy gates accept github-actions[bot] authorization actors', async () => {
  const source = await read('.github/workflows/firebase-production-deploy.yml');
  const signer = await read('scripts/create-hard-launch-authorization.mjs');

  // Literal bash grammar must stay aligned with the hard-launch signer.
  const bashActorGrammar = '^[a-z0-9-]+(\\[[a-z]+\\])?$';
  assert.equal(source.split(`AUTHORIZATION_ACTOR_INPUT" =~ ${bashActorGrammar}`).length - 1, 2);
  assert.equal(source.includes('AUTHORIZATION_ACTOR_INPUT" =~ ^[a-z0-9-]+$'), false);
  assert.equal(signer.includes('^[a-z0-9-]+(?:\\[[a-z]+\\])?$'), true);
  assert.match(source, /authorization_actor must be a GitHub login or github-actions\[bot\]/);
});
