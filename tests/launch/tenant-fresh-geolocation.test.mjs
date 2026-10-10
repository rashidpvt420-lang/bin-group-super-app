import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const position = { latitude: 24.2075, longitude: 55.7447, accuracy: 15 };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture() {
  const timers = new Set();
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync('tests/e2e/helpers/freshGeolocation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports,
    setInterval(callback) { timers.add(callback); return callback; },
    clearInterval(callback) { timers.delete(callback); },
  });
  return { run: module.exports.withFreshGeolocation, timers, tick: () => [...timers].forEach((callback) => callback()) };
}

test('arrival receives repeated fresh browser positions and refresh stops after success', async () => {
  const f = fixture();
  const arrived = deferred();
  const started = deferred();
  const positions = [];
  const result = f.run({ async setGeolocation(value) { positions.push(value); } }, position, () => {
    started.resolve();
    return arrived.promise;
  });
  await started.promise;
  assert.equal(positions.length, 1);
  f.tick();
  arrived.resolve('server-confirmed-arrival');
  assert.equal(await result, 'server-confirmed-arrival');
  assert.equal(positions.length, 2);
  assert.deepEqual(positions, [position, position]);
  assert.equal(f.timers.size, 0);
  f.tick();
  assert.equal(positions.length, 2);
});

test('refresh calls do not overlap and cleanup waits for the outstanding browser call', async () => {
  const f = fixture();
  const refresh = deferred();
  const action = deferred();
  const started = deferred();
  let calls = 0;
  const result = f.run({ async setGeolocation() { if (++calls > 1) await refresh.promise; } }, position, () => {
    started.resolve(); return action.promise;
  });
  await started.promise;
  f.tick(); f.tick();
  assert.equal(calls, 2);
  action.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.timers.size, 0);
  let finished = false;
  void result.then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  refresh.resolve();
  await result;
});

test('a failed arrival retains its failure and clears GPS refresh', async () => {
  const f = fixture();
  const error = new Error('server rejected arrival');
  await assert.rejects(f.run({ async setGeolocation() {} }, position, async () => { throw error; }), (actual) => actual === error);
  assert.equal(f.timers.size, 0);
});

test('browser refresh errors cannot produce successful arrival evidence', async () => {
  const f = fixture();
  const started = deferred();
  const action = deferred();
  const error = new Error('browser context closed');
  let calls = 0;
  const result = f.run({ async setGeolocation() { if (++calls > 1) throw error; } }, position, () => {
    started.resolve(); return action.promise;
  });
  await started.promise;
  f.tick(); action.resolve();
  await assert.rejects(result, (actual) => actual === error);
  assert.equal(f.timers.size, 0);
});
