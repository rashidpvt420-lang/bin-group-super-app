import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const source = readFileSync(new URL('../../functions/technicianBeforeWorkEvidence.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;

async function submit({ ticket = {}, objectExists = true, evidenceType = 'technician_before_work' } = {}) {
  const writes = [];
  const data = { assignedTechnicianId: 'tech-1', status: 'ARRIVED', ...ticket };
  const snapshot = { exists: true, data: () => data, ref: { id: 'ticket-1' } };
  const db = {
    collection: (name) => ({ doc: () => ({
      get: async () => name === 'technicians'
        ? { exists: true, data: () => ({ status: 'approved' }) }
        : snapshot,
    }) }),
    runTransaction: async (callback) => callback({
      get: async () => snapshot,
      update: (_ref, update) => writes.push(update),
      set: () => {},
    }),
  };
  const bucketName = 'bin-group-57c60.firebasestorage.app';
  const storagePath = 'maintenanceTickets/ticket-1/proofPhotos/before_work_real.jpg';
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
  const admin = {
    apps: [{}], firestore: () => db,
    storage: () => ({ bucket: () => ({ name: bucketName, file: () => ({
      exists: async () => [objectExists],
      getMetadata: async () => [{ contentType: 'image/jpeg', size: 1024,
        generation: '1712345678901234', md5Hash: 'immutable-before-hash',
        metadata: { ticketId: 'ticket-1', technicianId: 'tech-1', evidenceType } }],
    }) }) }),
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const exports = {};
  new Function('require', 'exports', compiled)((name) => {
    if (name === 'firebase-admin') return admin;
    if (name === 'node:crypto') return { createHash };
    if (name === 'firebase-admin/firestore') return { FieldValue: {
      arrayUnion: (value) => ({ arrayUnion: value }), serverTimestamp: () => 'SERVER_TIMESTAMP',
    } };
    if (name === 'firebase-functions/v2/https') return { HttpsError, onCall: (_options, handler) => handler };
    throw new Error(`Unexpected import: ${name}`);
  }, exports);
  let error;
  try {
    await exports.submitTechnicianBeforeWorkEvidence({
      auth: { uid: 'tech-1', token: { role: 'technician' } },
      data: { ticketId: 'ticket-1', storagePath, downloadUrl },
    });
  } catch (caught) { error = caught; }
  return { writes, error, downloadUrl };
}

test('verified technician photo supplies canonical completion and verifier fields without tenant photos', async () => {
  const { writes, error, downloadUrl } = await submit();
  assert.ifError(error);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].beforePhotoUrl, downloadUrl);
  assert.deepEqual(writes[0].beforePhotos, { arrayUnion: downloadUrl });
  assert.equal(writes[0].technicianBeforePhotoUrl, downloadUrl);
  assert.equal(writes[0].technicianBeforeEvidenceAt, 'SERVER_TIMESTAMP');
  assert.equal(writes[0].technicianBeforeEvidenceState, 'CONFIRMED');
  assert.equal(writes[0].technicianBeforeObjectGeneration, '1712345678901234');
  assert.equal(writes[0].technicianBeforeContentHash, 'immutable-before-hash');
  assert.match(writes[0].technicianBeforeConfirmationId, /^technician_before_work_[a-f0-9]{64}$/);
});

test('canonical publication preserves the original fault photo while appending verified site evidence', async () => {
  const { writes, error, downloadUrl } = await submit({ ticket: { beforePhotoUrl: 'original-fault-photo' } });
  assert.ifError(error);
  assert.equal(writes[0].beforePhotoUrl, 'original-fault-photo');
  assert.deepEqual(writes[0].beforePhotos, { arrayUnion: downloadUrl });
});

for (const [label, options] of [
  ['missing Storage object', { objectExists: false }],
  ['wrong evidence metadata', { evidenceType: 'technician_after_work' }],
  ['wrong lifecycle state', { ticket: { status: 'EN_ROUTE' } }],
  ['wrong assignment', { ticket: { assignedTechnicianId: 'other-tech' } }],
]) {
  test(`does not publish canonical evidence for ${label}`, async () => {
    const { writes, error } = await submit(options);
    assert.ok(error);
    assert.deepEqual(writes, []);
  });
}
