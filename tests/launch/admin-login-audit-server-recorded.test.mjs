// N-17: the Admin login audit must be recorded by the server callable. The previous browser
// addDoc(audit_logs) was always denied by Firestore rules and the failure was swallowed.
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
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, console, String, Error, Promise, Object }), { filename: path });
  return module.exports;
}

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const audit = loadTypeScriptModule('apps/admin-panel/src/security/adminLoginAudit.ts');
const authContext = readFileSync('apps/admin-panel/src/context/AuthContext.tsx', 'utf8');

test('successful login registers a server security session and stores its id', async () => {
  const calls = [];
  const storage = new MemoryStorage();
  const result = await audit.recordAdminLoginAudit(async (data) => { calls.push(data); return { data: { sessionId: 'as_admin_1' } }; }, { language: 'ar', storage });
  assert.equal(JSON.stringify(calls), JSON.stringify([{ language: 'ar' }]));
  assert.equal(result.recorded, true);
  assert.equal(storage.getItem(audit.ADMIN_SECURITY_SESSION_STORAGE_KEY), 'as_admin_1');
});

test('a transient failure is retried once', async () => {
  let attempts = 0;
  const result = await audit.recordAdminLoginAudit(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('unavailable'), { code: 'functions/unavailable' });
    return { data: { sessionId: 'as_admin_2' } };
  }, { storage: new MemoryStorage() });
  assert.equal(attempts, 2);
  assert.equal(result.recorded, true);
});

test('a persistent failure is reported as an error, not swallowed as success', async () => {
  const errors = [];
  const storage = new MemoryStorage();
  storage.setItem(audit.ADMIN_SECURITY_SESSION_STORAGE_KEY, 'stale_session');
  const result = await audit.recordAdminLoginAudit(async () => { throw Object.assign(new Error('denied'), { code: 'functions/permission-denied' }); }, {
    storage,
    logger: { error: (...args) => errors.push(args.join(' ')) },
  });
  assert.equal(result.recorded, false);
  assert.equal(result.errorCode, 'functions/permission-denied');
  assert.equal(storage.getItem(audit.ADMIN_SECURITY_SESSION_STORAGE_KEY), null);
  assert.match(errors.join('\n'), /NOT recorded/);
});

test('AuthContext no longer writes audit_logs from the browser and uses the server callable', () => {
  assert.doesNotMatch(authContext, /addDoc\(\s*collection\(\s*db,\s*'audit_logs'/);
  assert.doesNotMatch(authContext, /Audit log write skipped/);
  assert.match(authContext, /recordAdminLoginAudit\(httpsCallable\(functions, 'registerAdminSecuritySession'/);
  assert.match(authContext, /clearAdminSecuritySession\(/);
});
