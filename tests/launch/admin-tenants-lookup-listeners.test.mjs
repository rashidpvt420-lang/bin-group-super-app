// N-26: the Admin Tenants page must detach its owner/property listeners on unmount and surface
// listener errors instead of leaking listeners and rendering silently empty pickers.
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
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, console, Object, Array }), { filename: path });
  return module.exports;
}

const { subscribeTenantLookups } = loadTypeScriptModule('apps/admin-panel/src/pages/tenants/tenantLookupSubscriptions.ts');
const page = readFileSync('apps/admin-panel/src/pages/tenants/TenantsManagementPage.tsx', 'utf8');

function fakeFirestore() {
  const active = new Map();
  let nextId = 0;
  const listen = (name) => (onNext, onError) => {
    const id = `${name}#${nextId += 1}`;
    active.set(id, { name, onNext, onError });
    return () => active.delete(id);
  };
  const emit = (name, docs) => [...active.values()].filter((entry) => entry.name === name)
    .forEach((entry) => entry.onNext({ docs: docs.map(([id, data]) => ({ id, data: () => data })) }));
  const fail = (name, error) => [...active.values()].filter((entry) => entry.name === name).forEach((entry) => entry.onError(error));
  return { active, listeners: { owners: listen('owners'), properties: listen('properties') }, emit, fail };
}

test('repeated mount/unmount cycles leave no live listeners', () => {
  const fake = fakeFirestore();
  const handlers = { onOwners() {}, onProperties() {}, onError() {} };
  for (let mount = 0; mount < 5; mount += 1) {
    const cleanup = subscribeTenantLookups(fake.listeners, handlers);
    assert.equal(fake.active.size, 2, 'exactly one owners + one properties listener while mounted');
    cleanup();
    cleanup(); // idempotent (React StrictMode double-invokes cleanups)
    assert.equal(fake.active.size, 0);
  }
});

test('snapshots map rows; errors are reported with their source; late events after unmount are ignored', () => {
  const fake = fakeFirestore();
  const seen = { owners: [], properties: [], errors: [] };
  const cleanup = subscribeTenantLookups(fake.listeners, {
    onOwners: (rows) => seen.owners.push(rows),
    onProperties: (rows) => seen.properties.push(rows),
    onError: (source, error) => seen.errors.push([source, error.code]),
  });
  fake.emit('owners', [['o1', { displayName: 'Owner 1' }]]);
  fake.emit('properties', [['p1', { name: 'Tower' }]]);
  fake.fail('properties', { code: 'permission-denied' });
  assert.equal(JSON.stringify(seen.owners), JSON.stringify([[{ id: 'o1', displayName: 'Owner 1' }]]));
  assert.equal(JSON.stringify(seen.properties), JSON.stringify([[{ id: 'p1', name: 'Tower' }]]));
  assert.equal(JSON.stringify(seen.errors), JSON.stringify([['properties', 'permission-denied']]));
  const listenersAtUnmount = [...fake.active.values()];
  cleanup();
  listenersAtUnmount.forEach((entry) => { entry.onNext({ docs: [] }); entry.onError({ code: 'late' }); });
  assert.equal(seen.owners.length, 1);
  assert.equal(seen.errors.length, 1);
});

test('TenantsManagementPage returns the lookup cleanup from its effect and has no bare listeners', () => {
  assert.match(page, /useEffect\(\(\) => subscribeTenantLookups\(/);
  const bareListeners = page.match(/onSnapshot\([^\n]*\n?/g) || [];
  for (const call of bareListeners) assert.match(call, /, next, fail\)/, `onSnapshot without error handler/cleanup: ${call.trim()}`);
  assert.match(page, /fetchInitialData\(\)\.catch\(/);
});
