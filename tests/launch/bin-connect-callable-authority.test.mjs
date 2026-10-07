import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as nodeCrypto from 'node:crypto';
import ts from 'typescript';

// Repository scripts execute this suite from the repository root.
const source = fs.readFileSync('functions/binConnectOperations.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const owner = { uid: 'owner-1', token: { role: 'owner', email: 'owner@example.com', name: 'Owner' } };
const adminAuth = (claims = { role: 'admin' }, extra = {}) => ({ uid: 'admin-1', token: { ...claims, email: 'admin@example.com', email_verified: true, firebase: { sign_in_second_factor: 'totp' }, ...extra } });

function harness({ authUsers = {}, docs = {}, failAudit = false } = {}) {
  const state = new Map(Object.entries(docs));
  const writes = [];
  const transactions = [];
  const queries = [];
  const authReads = [];
  let nextId = 0;
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const snapshot = (ref) => ({ id: ref.id, exists: state.has(ref.path), data: () => state.get(ref.path), ref });
  const apply = (operations, type) => {
    // Validate every write before applying any, matching a failed atomic commit.
    if (failAudit && operations.some(op => op.ref.path.startsWith('audit_logs/'))) throw new Error('Audit persistence unavailable');
    for (const op of operations) {
      if (op.kind === 'create' && state.has(op.ref.path)) throw new Error('Document already exists');
      if (op.kind === 'update' && !state.has(op.ref.path)) throw new Error('Document missing');
    }
    for (const op of operations) {
      if (op.kind === 'delete') state.delete(op.ref.path);
      else state.set(op.ref.path, (op.kind === 'update' || op.options?.merge) ? { ...state.get(op.ref.path), ...op.data } : op.data);
      writes.push({ ...op, type });
    }
  };
  const reference = path => ({
    path, id: path.split('/').at(-1), collection: name => collection(`${path}/${name}`),
    get: async () => snapshot(reference(path)),
    set: async (data, options) => apply([{ kind: 'set', ref: reference(path), data, options }], 'direct'),
    update: async data => apply([{ kind: 'update', ref: reference(path), data }], 'direct'),
    create: async data => apply([{ kind: 'create', ref: reference(path), data }], 'direct'),
  });
  const collection = (path, filters = [], limit = Infinity) => ({
    path, doc: id => reference(`${path}/${id ?? `generated-${++nextId}`}`),
    add: async data => { const ref = reference(`${path}/generated-${++nextId}`); apply([{ kind: 'set', ref, data }], 'direct'); return ref; },
    where: (field, operator, value) => collection(path, [...filters, { field, operator, value }], limit),
    limit: value => collection(path, filters, value),
    orderBy: () => collection(path, filters, limit),
    get: async () => {
      queries.push({ path, filters, limit });
      const rows = [...state].filter(([key, data]) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1 && filters.every(f => f.operator === 'array-contains' ? data[f.field]?.includes(f.value) : data[f.field] === f.value)).slice(0, limit);
      return { docs: rows.map(([key]) => snapshot(reference(key))), empty: !rows.length, size: rows.length };
    },
  });
  const batch = () => {
    const operations = [];
    const writer = { set: (ref, data, options) => { operations.push({ kind: 'set', ref, data, options }); return writer; }, update: (ref, data) => { operations.push({ kind: 'update', ref, data }); return writer; }, create: (ref, data) => { operations.push({ kind: 'create', ref, data }); return writer; }, delete: ref => { operations.push({ kind: 'delete', ref }); return writer; }, commit: async () => apply(operations, 'batch') };
    return writer;
  };
  const db = {
    collection, doc: reference, batch,
    runTransaction: async fn => {
      const operations = [];
      const tx = { get: async ref => snapshot(ref), set: (ref, data, options) => { operations.push({ kind: 'set', ref, data, options }); return tx; }, update: (ref, data) => { operations.push({ kind: 'update', ref, data }); return tx; }, create: (ref, data) => { operations.push({ kind: 'create', ref, data }); return tx; }, delete: ref => { operations.push({ kind: 'delete', ref }); return tx; } };
      const result = await fn(tx);
      apply(operations, 'transaction');
      transactions.push(operations);
      return result;
    },
  };
  const firestore = Object.assign(() => db, { FieldValue: { serverTimestamp: () => ({ toMillis: () => 12345 }), arrayUnion: (...items) => items }, Timestamp: { now: () => ({ toMillis: () => 12345 }) } });
  const auth = { getUser: async uid => { authReads.push(uid); return authUsers[uid] ?? { uid, disabled: false, emailVerified: true, multiFactor: { enrolledFactors: [{ uid: 'factor-1' }] }, customClaims: { role: uid.startsWith('admin') ? 'admin' : 'owner' } }; } };
  const fakeAdmin = { apps: [{}], initializeApp() {}, firestore, auth: () => auth };
  const exports = {};
  const knownDependency = name => {
    switch (name) {
      case 'node:crypto': return nodeCrypto;
      case 'firebase-admin': return fakeAdmin;
      case 'firebase-admin/firestore': return { FieldValue: firestore.FieldValue, Timestamp: firestore.Timestamp, getFirestore: () => db };
      case 'firebase-functions/v2/https': return { HttpsError, onCall: (options, handler) => Object.assign(handler, { options }) };
      default: throw new Error(`Unexpected callable dependency: ${name}`);
    }
  };
  const sandbox = { exports, module: { exports }, console, Buffer, process, require: knownDependency };
  vm.runInNewContext(compiled, sandbox, { filename: 'binConnectOperations.ts' });
  const call = (name, authValue, data) => {
    const request = { auth: authValue, data, app: { appId: 'test-app' } };
    switch (name) {
      case 'listMyBinConnectThreads': return exports.listMyBinConnectThreads(request);
      case 'createBinConnectThread': return exports.createBinConnectThread(request);
      case 'sendBinConnectMessage': return exports.sendBinConnectMessage(request);
      case 'resolveBinConnectThread': return exports.resolveBinConnectThread(request);
      case 'updateAdminBinConnectThread': return exports.updateAdminBinConnectThread(request);
      default: throw new Error(`Unexpected callable: ${name}`);
    }
  };
  return { api: exports, state, writes, transactions, queries, authReads, call };
}
const thread = { createdBy: 'owner-1', participantIds: ['owner-1'], channel: 'admin_support', status: 'open', lastMessage: 'Initial' };
const threadDocs = () => ({ 'binConnectThreads/thread-1': { ...thread } });
const messageData = { threadId: 'thread-1', message: 'Reply', requestId: 'request_12345' };
const createData = { channel: 'admin_support', message: 'Help please', requestId: 'request_12345' };
const rejected = (promise, code) => assert.rejects(promise, err => err.code === code);

for (const name of ['listMyBinConnectThreads', 'createBinConnectThread', 'sendBinConnectMessage', 'resolveBinConnectThread', 'updateAdminBinConnectThread']) {
  test(`${name} enforces App Check and requires authentication`, async () => {
    const h = harness();
    assert.equal(typeof h.api[name], 'function');
    assert.equal(h.api[name].options.enforceAppCheck, true);
    await rejected(h.call(name, undefined, createData), 'unauthenticated');
    assert.equal(h.writes.length, 0);
  });
}

test('claimless owner listing uses its UID rather than the client-editable profile role', async () => {
  const h = harness({ docs: { ...threadDocs(), 'users/owner-1': { role: 'admin' }, 'binConnectThreads/other': { participantIds: ['owner-2'] } } });
  const result = await h.call('listMyBinConnectThreads', { uid: 'owner-1', token: {} }, { limit: 1000 });
  assert.equal(result.threads.length, 1);
  assert.equal(result.threads[0].id, 'thread-1');
  assert.ok(h.queries.some(q => q.filters.some(f => f.field === 'participantIds' && f.operator === 'array-contains' && f.value === 'owner-1')));
  assert.ok(h.queries.every(q => q.limit <= 100));
});

for (const name of ['sendBinConnectMessage', 'resolveBinConnectThread', 'updateAdminBinConnectThread']) {
  test(`${name} rejects profile-only Admin privilege and outsider access`, async () => {
    const h = harness({ docs: { ...threadDocs(), 'users/outsider': { role: 'admin' } } });
    await rejected(h.call(name, { uid: 'outsider', token: {} }, { ...messageData, status: 'resolved' }), 'permission-denied');
    assert.equal(h.writes.length, 0);
  });
}

for (const name of ['createBinConnectThread', 'sendBinConnectMessage', 'resolveBinConnectThread', 'updateAdminBinConnectThread']) {
  for (const [label, tokenClaims, freshClaims] of [
    ['deprivileged fresh Auth', { role: 'admin' }, { role: 'owner' }],
    ['privilege absent from signed token', { role: 'owner' }, { role: 'admin' }],
  ]) test(`${name} rejects ${label}`, async () => {
    const h = harness({ docs: threadDocs(), authUsers: { 'admin-1': { uid: 'admin-1', disabled: false, emailVerified: true, multiFactor: { enrolledFactors: [{ uid: 'factor-1' }] }, customClaims: freshClaims } } });
    await rejected(h.call(name, adminAuth(tokenClaims), { ...createData, ...messageData, status: 'pending' }), 'permission-denied');
    assert.equal(h.writes.length, 0);
  });
  for (const [label, extra] of [['missing MFA', { firebase: {} }], ['unverified token email', { email_verified: false }]]) test(`${name} rejects Admin ${label}`, async () => {
    const h = harness({ docs: threadDocs() });
    await assert.rejects(h.call(name, adminAuth(undefined, extra), { ...createData, ...messageData, status: 'pending' }), err => ['permission-denied', 'failed-precondition'].includes(err.code));
    assert.equal(h.writes.length, 0);
  });
}

for (const [label, authRecord, token, profile] of [
  ['disabled Auth', { disabled: true }, {}, {}],
  ['fresh suspension claim', { customClaims: { role: 'owner', suspended: true } }, {}, {}],
  ['signed suspension claim', {}, { suspended: true }, {}],
  ['suspended profile', {}, {}, { suspended: true }],
  ['disabled profile status', {}, {}, { status: 'DISABLED' }],
]) test(`suspended account cannot create or read: ${label}`, async () => {
  const h = harness({ docs: { ...threadDocs(), 'users/owner-1': profile }, authUsers: { 'owner-1': { uid: 'owner-1', disabled: false, emailVerified: true, multiFactor: { enrolledFactors: [{ uid: 'factor-1' }] }, customClaims: { role: 'owner' }, ...authRecord } } });
  for (const name of ['listMyBinConnectThreads', 'createBinConnectThread']) await assert.rejects(h.call(name, { ...owner, token: { ...owner.token, ...token } }, createData), err => ['permission-denied', 'unauthenticated'].includes(err.code));
  assert.equal(h.writes.length, 0);
});

for (const claims of [{ role: 'admin' }, { role: 'super_admin' }, { role: 'ceo' }, { admin: true }, { isAdmin: true }, { superAdmin: true }, { super_admin: true }, { ceo: true }]) {
  test(`canonical Admin claim can update metadata: ${JSON.stringify(claims)}`, async () => {
    const h = harness({ docs: threadDocs(), authUsers: { 'admin-1': { uid: 'admin-1', emailVerified: true, disabled: false, multiFactor: { enrolledFactors: [{ uid: 'factor-1' }] }, customClaims: claims } } });
    await h.call('updateAdminBinConnectThread', adminAuth(claims), { threadId: 'thread-1', status: 'assigned', priority: 'urgent', assignedAdminId: 'admin-1' });
    assert.equal(h.state.get('binConnectThreads/thread-1').status, 'assigned');
    assert.equal(h.state.get('binConnectThreads/thread-1').assignedAdminId, 'admin-1');
    assert.ok(h.authReads.includes('admin-1'));
  });
}

test('participant owner can reply and resolve, with each audit in the same transaction', async () => {
  const h = harness({ docs: threadDocs() });
  await h.call('sendBinConnectMessage', owner, messageData);
  await h.call('resolveBinConnectThread', owner, { threadId: 'thread-1' });
  assert.equal(h.state.get('binConnectThreads/thread-1').status, 'resolved');
  assert.equal(h.transactions.length, 2);
  for (const transaction of h.transactions) assert.ok(transaction.some(op => op.ref.path.startsWith('audit_logs/')));
  assert.ok(h.writes.every(op => op.type === 'transaction'));
});

for (const [name, data] of [['createBinConnectThread', createData], ['sendBinConnectMessage', messageData], ['resolveBinConnectThread', { threadId: 'thread-1' }], ['updateAdminBinConnectThread', { threadId: 'thread-1', status: 'pending' }]]) {
  test(`${name} audit failure rolls back every mutation`, async () => {
    const h = harness({ docs: threadDocs(), failAudit: true });
    const before = JSON.stringify([...h.state]);
    await assert.rejects(h.call(name, name === 'updateAdminBinConnectThread' ? adminAuth() : owner, data));
    assert.equal(h.writes.length, 0);
    assert.equal(JSON.stringify([...h.state]), before);
  });
}

for (const [name, data] of [['createBinConnectThread', createData], ['sendBinConnectMessage', messageData]]) {
  test(`${name} duplicate request returns original response without new writes`, async () => {
    const h = harness({ docs: threadDocs() });
    const first = await h.call(name, owner, data);
    const count = h.writes.length;
    const second = await h.call(name, owner, data);
    assert.equal(JSON.stringify(second), JSON.stringify(first));
    assert.equal(h.writes.length, count);
    assert.ok(h.transactions[0].some(op => op.ref.path.startsWith('audit_logs/')));
    assert.ok(h.writes.every(op => op.type === 'transaction'));
    await rejected(h.call(name, owner, { ...data, message: 'Changed payload' }), 'failed-precondition');
    assert.equal(h.writes.length, count);
  });
  for (const requestId of [undefined, '', 'short', 'space in request', 'a'.repeat(101), 123456789]) test(`${name} rejects invalid request ID ${String(requestId).slice(0, 20)}`, async () => {
    const h = harness({ docs: threadDocs() });
    await rejected(h.call(name, owner, { ...data, requestId }), 'invalid-argument');
    assert.equal(h.writes.length, 0);
  });
}

for (const status of ['open', 'pending', 'in_review', 'assigned', 'resolved']) test(`Admin metadata supports status ${status}`, async () => {
  const h = harness({ docs: threadDocs() });
  await h.call('updateAdminBinConnectThread', adminAuth(), { threadId: 'thread-1', status, assignedAdminId: null });
  assert.equal(h.state.get('binConnectThreads/thread-1').status, status);
});
for (const data of [{ status: 'invented' }, { status: 'open', priority: 'critical' }, { status: 'assigned', assignedAdminId: 'other-admin' }]) test(`Admin metadata rejects unsupported change ${JSON.stringify(data)}`, async () => {
  const h = harness({ docs: threadDocs() });
  await assert.rejects(h.call('updateAdminBinConnectThread', adminAuth(), { threadId: 'thread-1', ...data }), err => ['invalid-argument', 'permission-denied'].includes(err.code));
  assert.equal(h.writes.length, 0);
});

for (const [label, record] of [['current email unverified', { emailVerified: false }], ['current factor removed', { multiFactor: { enrolledFactors: [] } }]]) {
  for (const name of ['createBinConnectThread', 'sendBinConnectMessage', 'resolveBinConnectThread', 'updateAdminBinConnectThread']) test(`${name} rejects ${label}`, async () => {
    const h = harness({ docs: threadDocs(), authUsers: { 'admin-1': { uid: 'admin-1', disabled: false, emailVerified: true, multiFactor: { enrolledFactors: [{ uid: 'factor-1' }] }, customClaims: { role: 'admin' }, ...record } } });
    await assert.rejects(h.call(name, adminAuth(), { ...createData, ...messageData, status: 'pending' }), err => ['permission-denied', 'failed-precondition'].includes(err.code));
    assert.equal(h.writes.length, 0);
  });
}
for (const claims of [{ role: 'owner', admin: true }, { role: 'owner', isAdmin: true }, { role: 'founder' }, { role: 'operations_manager' }, { role: 'operations' }, { role: 'supervisor' }]) test(`noncanonical privilege cannot mutate outsider thread: ${JSON.stringify(claims)}`, async () => {
  const h = harness({ docs: threadDocs(), authUsers: { 'admin-1': { uid: 'admin-1', disabled: false, emailVerified: true, multiFactor: { enrolledFactors: [{ uid: 'factor-1' }] }, customClaims: claims } } });
  await rejected(h.call('sendBinConnectMessage', adminAuth(claims), messageData), 'permission-denied');
  await rejected(h.call('updateAdminBinConnectThread', adminAuth(claims), { threadId: 'thread-1', status: 'resolved' }), 'permission-denied');
  assert.equal(h.writes.length, 0);
});

test('assignedAdminId alone does not authorize a normal outsider', async () => {
  const h = harness({ docs: { 'binConnectThreads/thread-1': { ...thread, assignedAdminId: 'outsider' } } });
  await rejected(h.call('sendBinConnectMessage', { uid: 'outsider', token: { role: 'owner' } }, messageData), 'permission-denied');
  assert.equal(h.writes.length, 0);
});

test('same request ID is isolated by authenticated UID', async () => {
  const h = harness({ docs: threadDocs() });
  const first = await h.call('createBinConnectThread', owner, createData);
  const second = await h.call('createBinConnectThread', { uid: 'owner-2', token: { role: 'owner' } }, createData);
  assert.notEqual(first.threadId, second.threadId);
  assert.equal(h.state.get(`binConnectThreads/${first.threadId}`).createdBy, 'owner-1');
  assert.equal(h.state.get(`binConnectThreads/${second.threadId}`).createdBy, 'owner-2');
});

test('create ignores client-supplied actor and participants authority', async () => {
  const h = harness();
  const response = await h.call('createBinConnectThread', owner, { ...createData, createdBy: 'victim', sourceRole: 'admin', participantIds: ['victim'], assignedAdminId: 'owner-1' });
  const saved = h.state.get(`binConnectThreads/${response.threadId}`);
  assert.equal(saved.createdBy, owner.uid);
  assert.equal(saved.sourceRole, 'owner');
  assert.deepEqual([...saved.participantIds], [owner.uid]);
  assert.notEqual(saved.assignedAdminId, owner.uid);
});

test('create request reuse with different channel is rejected without writes', async () => {
  const h = harness();
  await h.call('createBinConnectThread', owner, createData);
  const count = h.writes.length;
  await rejected(h.call('createBinConnectThread', owner, { ...createData, channel: 'dashboard_issue' }), 'failed-precondition');
  assert.equal(h.writes.length, count);
});

test('send request reuse on a different accessible thread is rejected without writes', async () => {
  const h = harness({ docs: { ...threadDocs(), 'binConnectThreads/thread-2': { ...thread } } });
  await h.call('sendBinConnectMessage', owner, messageData);
  const count = h.writes.length;
  await rejected(h.call('sendBinConnectMessage', owner, { ...messageData, threadId: 'thread-2' }), 'failed-precondition');
  assert.equal(h.writes.length, count);
});

for (const priority of ['normal', 'high', 'urgent']) test(`Admin can set supported priority ${priority}`, async () => {
  const h = harness({ docs: threadDocs() });
  await h.call('updateAdminBinConnectThread', adminAuth(), { threadId: 'thread-1', status: 'pending', priority });
  assert.equal(h.state.get('binConnectThreads/thread-1').priority, priority);
});
