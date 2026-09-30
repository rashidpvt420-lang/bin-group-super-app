// F-6 / F-9: Owner onboarding uploads send Storage paths (no permanent URLs), retry transient
// failures with backoff, and skip documents already uploaded with identical bytes.
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
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, console, JSON, Object, Error, Promise, Math, String, Set, setTimeout }), { filename: path });
  return module.exports;
}

const uploads = loadTypeScriptModule('src/components/onboarding/ownerDocumentUploads.ts');
const step = readFileSync('src/components/onboarding/InspectionSubmissionStep.tsx', 'utf8');

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const file = (bytes) => ({ bytes, name: 'doc.pdf' });
const hash = async (blob) => `sha-${blob.bytes}`;
const noSleep = async () => {};

test('transient upload failures are retried with exponential backoff, then succeed', async () => {
  const delays = [];
  let attempts = 0;
  const paths = await uploads.uploadOwnerDocuments({
    uid: 'u1', intakeId: 'i1', documents: [{ key: 'emiratesId', file: file('A') }], hash, cache: new MemoryStorage(),
    sleep: async (ms) => { delays.push(ms); },
    upload: async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error('unavailable'), { code: 'functions/unavailable' });
      return { storagePath: 'onboarding-proof/u1/i1/emiratesId/1_doc.pdf' };
    },
  });
  assert.equal(attempts, 3);
  assert.equal(JSON.stringify(delays), JSON.stringify([800, 1600]));
  assert.equal(paths.emiratesId, 'onboarding-proof/u1/i1/emiratesId/1_doc.pdf');
});

test('non-retryable errors fail immediately', async () => {
  let attempts = 0;
  await assert.rejects(uploads.uploadOwnerDocuments({
    uid: 'u1', intakeId: 'i1', documents: [{ key: 'passport', file: file('B') }], hash, cache: null, sleep: noSleep,
    upload: async () => { attempts += 1; throw Object.assign(new Error('bad'), { code: 'functions/invalid-argument' }); },
  }), /bad/);
  assert.equal(attempts, 1);
});

test('a retried submission skips documents already uploaded with identical bytes, re-uploads changed ones', async () => {
  const cache = new MemoryStorage();
  const uploaded = [];
  const run = (docs) => uploads.uploadOwnerDocuments({
    uid: 'u1', intakeId: 'i1', documents: docs, hash, cache, sleep: noSleep,
    upload: async ({ key }) => { uploaded.push(key); return { storagePath: `onboarding-proof/u1/i1/${key}/${uploaded.length}_doc.pdf` }; },
  });
  const first = await run([{ key: 'propertyProof', file: file('P') }, { key: 'emiratesId', file: file('E') }]);
  const second = await run([{ key: 'propertyProof', file: file('P') }, { key: 'emiratesId', file: file('E2') }]);
  assert.equal(JSON.stringify(uploaded), JSON.stringify(['propertyProof', 'emiratesId', 'emiratesId']));
  assert.equal(second.propertyProof, first.propertyProof);
  assert.notEqual(second.emiratesId, first.emiratesId);
  uploads.clearOwnerDocumentUploadCache(cache, 'u1', 'i1', ['propertyProof', 'emiratesId']);
  assert.equal(cache.values.size, 0);
});

test('an upload that returns no Owner-scoped path is a failure (no URL fallback)', async () => {
  await assert.rejects(uploads.uploadOwnerDocuments({
    uid: 'u1', intakeId: 'i1', documents: [{ key: 'passport', file: file('X') }], hash, cache: null, sleep: noSleep,
    upload: async () => ({ downloadUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/y?token=t' }),
  }), (error) => error.code === 'upload-path-missing' && error.documentKey === 'passport');
});

test('the submission step sends documentPaths and uses the retrying uploader', () => {
  assert.match(step, /uploadOwnerDocuments\(\{/);
  assert.match(step, /\n\s+documentPaths,\n/);
  assert.doesNotMatch(step, /uploaded\.downloadUrl/);
  assert.doesNotMatch(step, /\n\s+documentUrls,\n/);
});
