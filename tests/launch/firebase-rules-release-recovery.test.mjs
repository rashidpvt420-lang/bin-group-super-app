import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createRulesReleaseRecovery } from '../../scripts/lib/firebase-rules-release-recovery.mjs';

const IDENTITY = ['bin-group-57c60', 'projects/bin-group-57c60/rulesets/test-id', 'cloud.firestore'];
const RELEASE = 'projects/bin-group-57c60/releases/cloud.firestore';
const httpError = (status) => Object.assign(new Error(`HTTP Error: ${status}`), { status });

function fixture(updates, creates = []) {
  const calls = [];
  const waits = [];
  const logs = [];
  const respond = (queue, args, method) => {
    calls.push([method, ...args]);
    assert.ok(queue.length, `unexpected ${method}`);
    const result = queue.shift();
    if (result instanceof Error || result === null) throw result;
    return result;
  };
  const recover = createRulesReleaseRecovery({
    updateRelease: async (...args) => respond(updates, args, 'PATCH'),
    createRelease: async (...args) => respond(creates, args, 'POST'),
    wait: async (ms) => { waits.push(ms); },
    log: (message) => logs.push(message),
  });
  return { recover, calls, waits, logs };
}

test('successful update preserves the exact CLI target and does not create', async () => {
  const f = fixture([RELEASE]);
  assert.equal(await f.recover(...IDENTITY), RELEASE);
  assert.deepEqual(f.calls, [['PATCH', ...IDENTITY]]);
  assert.deepEqual(f.waits, []);
});

test('temporary update errors retry PATCH to the same ruleset without creating releases', async () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    const f = fixture([httpError(status), httpError(status), RELEASE]);
    assert.equal(await f.recover(...IDENTITY), RELEASE);
    assert.deepEqual(f.calls, Array.from({ length: 3 }, () => ['PATCH', ...IDENTITY]));
    assert.deepEqual(f.waits, [2_000, 4_000]);
  }
});

test('exhausted update errors fail with the original status rather than a misleading create conflict', async () => {
  const finalError = httpError(503);
  const f = fixture([httpError(503), httpError(503), finalError]);
  await assert.rejects(f.recover(...IDENTITY), (error) => error === finalError);
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every(([method]) => method === 'PATCH'));
});

test('permission, invalid request, conflict and unknown update failures never create or retry', async () => {
  for (const error of [
    httpError(400), httpError(401), httpError(403), httpError(409), httpError(501),
    httpError('503'), new Error('unknown failure'), null,
  ]) {
    const f = fixture([error]);
    await assert.rejects(f.recover(...IDENTITY), (received) => received === error);
    assert.deepEqual(f.calls, [['PATCH', ...IDENTITY]]);
    assert.deepEqual(f.waits, []);
  }
});

test('only a genuine update 404 permits creation of the exact requested release', async () => {
  const f = fixture([httpError(404)], [RELEASE]);
  assert.equal(await f.recover(...IDENTITY), RELEASE);
  assert.deepEqual(f.calls, [['PATCH', ...IDENTITY], ['POST', ...IDENTITY]]);
});

test('create conflict requires a successful update, including after a lost create response', async () => {
  for (const createErrors of [[httpError(409)], [httpError(503), httpError(409)]]) {
    const f = fixture([httpError(404), RELEASE], createErrors);
    assert.equal(await f.recover(...IDENTITY), RELEASE);
    assert.deepEqual(f.calls[0], ['PATCH', ...IDENTITY]);
    assert.deepEqual(f.calls.at(-1), ['PATCH', ...IDENTITY]);
    assert.ok(f.calls.every(([, ...args]) => JSON.stringify(args) === JSON.stringify(IDENTITY)));
  }
});

test('persistent create conflict and non-transient create errors remain failures', async () => {
  for (const status of [400, 401, 403]) {
    const error = httpError(status);
    const f = fixture([httpError(404)], [error]);
    await assert.rejects(f.recover(...IDENTITY), (received) => received === error);
    assert.deepEqual(f.calls, [['PATCH', ...IDENTITY], ['POST', ...IDENTITY]]);
    assert.deepEqual(f.waits, []);
  }
  for (const status of [403, 404, 409]) {
    const error = httpError(status);
    const f = fixture([httpError(404), error], [httpError(409)]);
    await assert.rejects(f.recover(...IDENTITY), (received) => received === error);
    assert.deepEqual(f.calls, [['PATCH', ...IDENTITY], ['POST', ...IDENTITY], ['PATCH', ...IDENTITY]]);
  }
});

test('retry diagnostics do not include arbitrary upstream error messages', async () => {
  const error = Object.assign(new Error('sensitive bearer token'), { status: 503 });
  const f = fixture([error, RELEASE]);
  await f.recover(...IDENTITY);
  assert.equal(f.logs.some((message) => message.includes('sensitive')), false);
});

test('invalid Firebase adapter functions fail closed', () => {
  assert.throws(() => createRulesReleaseRecovery({}), /Unsupported Firebase CLI/);
});

test('installed Firebase RulesDeploy uses the adapted export for Firestore and Storage', async () => {
  const require = createRequire(import.meta.url);
  const rules = require('firebase-tools/lib/gcp/rules.js');
  const { RulesDeploy, RulesetServiceType } = require('firebase-tools/lib/rulesDeploy.js');
  assert.equal(typeof rules.updateRelease, 'function');
  assert.equal(typeof rules.createRelease, 'function');
  const original = rules.updateOrCreateRelease;
  try {
    for (const [type, file, subResource, key, release] of [
      [RulesetServiceType.CLOUD_FIRESTORE, 'firestore.rules', '(default)', 'firestore.rules:(default)', 'cloud.firestore'],
      [RulesetServiceType.FIREBASE_STORAGE, 'storage.rules', 'bin-group-57c60.firebasestorage.app', 'storage.rules', 'firebase.storage/bin-group-57c60.firebasestorage.app'],
    ]) {
      const f = fixture([httpError(503), RELEASE]);
      rules.updateOrCreateRelease = f.recover;
      const deployment = new RulesDeploy({ project: IDENTITY[0] }, type);
      deployment.rulesetNames[key] = IDENTITY[1];
      await deployment.release(file, type, subResource);
      assert.deepEqual(f.calls, Array.from({ length: 2 }, () => ['PATCH', IDENTITY[0], IDENTITY[1], release]));
    }
  } finally {
    rules.updateOrCreateRelease = original;
  }
});
