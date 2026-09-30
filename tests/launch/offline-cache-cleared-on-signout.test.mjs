// N-28: the previous user's Firestore offline cache must not survive sign-out / account switch.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadTypeScriptModule(path) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, console, Promise }), { filename: path });
  return module.exports;
}

const { installOfflineCacheTeardown } = loadTypeScriptModule('src/lib/offlineCacheTeardown.ts');
const firebaseSource = readFileSync('src/lib/firebase.ts', 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness({ failClear = false } = {}) {
  const events = [];
  let listener = null;
  installOfflineCacheTeardown({
    subscribe: (next) => { listener = next; return () => { listener = null; }; },
    terminate: async () => { events.push('terminate'); },
    clearPersistence: async () => { events.push('clear'); if (failClear) throw Object.assign(new Error('held by another tab'), { code: 'failed-precondition' }); },
    reload: () => events.push('reload'),
    log: () => events.push('logged'),
  });
  return { events, emit: (user) => listener(user) };
}

test('signing out after a signed-in session terminates Firestore, clears the cache, then reloads', async () => {
  const h = harness();
  h.emit({ uid: 'tenant_a' });
  await flush();
  assert.deepEqual(h.events, []);
  h.emit(null);
  await flush();
  assert.deepEqual(h.events, ['terminate', 'clear', 'reload']);
});

test('switching directly to a different account also clears the previous user cache', async () => {
  const h = harness();
  h.emit({ uid: 'hr_manager' });
  h.emit({ uid: 'tenant_b' });
  await flush();
  assert.deepEqual(h.events, ['terminate', 'clear', 'reload']);
});

test('initial anonymous load and token refreshes for the same user do not tear down', async () => {
  const anonymous = harness();
  anonymous.emit(null);
  anonymous.emit(null);
  await flush();
  assert.deepEqual(anonymous.events, []);
  const refresh = harness();
  refresh.emit({ uid: 'owner_c' });
  refresh.emit({ uid: 'owner_c' });
  await flush();
  assert.deepEqual(refresh.events, []);
});

test('a clear failure is logged and the tab still reloads; teardown runs once', async () => {
  const h = harness({ failClear: true });
  h.emit({ uid: 'tech_d' });
  h.emit(null);
  h.emit({ uid: 'tech_e' });
  await flush();
  assert.deepEqual(h.events, ['terminate', 'clear', 'logged', 'reload']);
});

test('the root Firebase layer installs the teardown with terminate + clearIndexedDbPersistence', () => {
  assert.match(firebaseSource, /installOfflineCacheTeardown\(\{/);
  assert.match(firebaseSource, /terminate: \(\) => terminate\(db\)/);
  assert.match(firebaseSource, /clearPersistence: \(\) => clearIndexedDbPersistence\(db\)/);
});
