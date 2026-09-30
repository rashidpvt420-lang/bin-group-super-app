// The shared Firebase module (packages/shared/src/lib/firebase.ts) must decide on every page load
// whether to use the local emulators. It used to persist 'bin_emulators_connected' in localStorage,
// so after one reload on localhost the emulators were skipped and the same local session silently
// used production Firebase. This test loads the real module twice (two page loads sharing one
// localStorage) with the Firebase SDK stubbed, and checks which backends it connected to.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../packages/shared/src/lib/firebase.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function stubFirebase(calls) {
  const record = (name) => (...args) => { calls.push(name); return { name, args }; };
  const handler = { get: (target, prop) => (prop in target ? target[prop] : record(String(prop))) };
  const modules = {
    'firebase/app': { initializeApp: () => ({ app: true }), getApps: () => [], getApp: () => ({ app: true }) },
    'firebase/auth': { getAuth: () => ({ auth: true }), connectAuthEmulator: record('connectAuthEmulator') },
    'firebase/firestore': { getFirestore: () => ({ db: true }), connectFirestoreEmulator: record('connectFirestoreEmulator') },
    'firebase/storage': { getStorage: () => ({ storage: true }), connectStorageEmulator: record('connectStorageEmulator') },
    'firebase/functions': { getFunctions: () => ({ functions: true }), connectFunctionsEmulator: record('connectFunctionsEmulator') },
    'firebase/messaging': { isSupported: async () => false },
  };
  return (name) => {
    if (!modules[name]) throw new Error(`Unexpected import ${name}`);
    return new Proxy(modules[name], handler);
  };
}

function loadPage(hostname, localStorage) {
  const calls = [];
  const window = { location: { hostname }, localStorage };
  const module = { exports: {} };
  const context = vm.createContext({
    window, module, exports: module.exports, require: stubFirebase(calls), console: { warn() {}, log() {} },
    queueMicrotask, Promise, Map, Set, Object, Array, String, Number, Boolean, Error, JSON, Symbol,
  });
  vm.runInContext(compiled, context);
  return calls.filter((name) => /^connect\w+Emulator$/.test(name));
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    has: (key) => values.has(key),
  };
}

const ALL = ['connectAuthEmulator', 'connectFirestoreEmulator', 'connectStorageEmulator', 'connectFunctionsEmulator'];

test('localhost connects to the emulators on every page load, including after a reload', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadPage('localhost', storage), ALL, 'first load');
  assert.deepEqual(loadPage('localhost', storage), ALL, 'reload must not fall back to production');
  assert.deepEqual(loadPage('127.0.0.1', storage), ALL);
});

test('a stale bin_emulators_connected flag from an older build is ignored and cleared', () => {
  const storage = memoryStorage({ bin_emulators_connected: 'true' });
  assert.deepEqual(loadPage('localhost', storage), ALL);
  assert.equal(storage.has('bin_emulators_connected'), false);
});

test('non-local hosts never connect to the emulators', () => {
  assert.deepEqual(loadPage('admin.bingroup.ae', memoryStorage()), []);
});
