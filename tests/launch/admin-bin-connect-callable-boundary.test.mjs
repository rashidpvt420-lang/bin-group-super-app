import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const filename = 'apps/admin-panel/src/pages/admin/BinConnectInboxPage.tsx';
const source = fs.readFileSync(filename, 'utf8');

// Execute the real page and its event handlers, with isolated UI/read/callable adapters.
// No Firebase SDK initializes and no production operation can occur in this harness.
function renderPage({ status = 'open', priority = 'normal', busy = false, invoke = async () => ({ data: { success: true } }) } = {}) {
  const thread = { id: 'thread-1', status: 'open', priority: 'normal', title: 'Help' };
  const values = [[thread], thread.id, [], '  Help please  ', status, priority, 'all', '', busy];
  const changes = [];
  const calls = [];
  let stateIndex = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => {
      const index = stateIndex++;
      return [index < values.length ? values[index] : initial, (value) => changes.push({ index, value })];
    },
    useRef: (value) => ({ current: value }),
    useEffect: () => {},
    useMemo: (fn) => fn(),
  };
  const firebase = {
    functions: { region: 'europe-west3' },
    httpsCallable: (functions, name) => async (payload) => {
      calls.push({ functions, name, payload: { ...payload } });
      return invoke(name, payload);
    },
  };
  const exported = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  vm.runInNewContext(compiled, {
    module: exported,
    exports: exported.exports,
    crypto: { randomUUID: () => 'stable-request-id' },
    require(name) {
      if (name === 'react') return React;
      if (name === '@mui/material') return new Proxy({ alpha: (color) => color }, { get: (obj, key) => obj[key] || key });
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (name === '../../lib/firebase') return firebase;
      if (name === '../../context/AuthContext') return { useAuth: () => ({ user: { uid: 'admin-1', role: 'admin' } }) };
      if (name === '../../theme/adminTheme') return { binThemeTokens: { gold: '#caa' } };
      throw new Error(`Unexpected import ${name}`);
    },
  }, { filename });
  const tree = exported.exports.default();
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    node.children?.forEach(visit);
  }
  visit(tree);
  const button = (label) => nodes.find((node) => node.type === 'Button' && node.children.includes(label));
  return { button, nodes, changes, calls };
}

test('Admin BIN Connect has no browser Firestore mutation imports or calls', () => {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const writes = new Set(['addDoc', 'setDoc', 'updateDoc', 'deleteDoc', 'writeBatch', 'runTransaction', 'serverTimestamp']);
  function visit(node) {
    if (ts.isImportSpecifier(node)) assert.equal(writes.has(node.propertyName?.text || node.name.text), false);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) assert.equal(writes.has(node.expression.text), false);
    ts.forEachChild(node, visit);
  }
  visit(ast);
});

test('Reply calls the configured regional callable with message, not client sender authority', async () => {
  const page = renderPage();
  await page.button('Send admin reply').props.onClick();
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0].name, 'sendBinConnectMessage');
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls[0].payload)), { threadId: 'thread-1', message: 'Help please', requestId: 'stable-request-id' });
  assert.equal(page.calls[0].functions.region, 'europe-west3');
  assert.ok(page.changes.some(({ index, value }) => index === 3 && value === ''));
});

test('Failure retains reply and request identity for retry', async () => {
  const page = renderPage({ invoke: async () => { throw new Error('offline'); } });
  const send = page.button('Send admin reply').props.onClick;
  await send();
  await send();
  assert.equal(page.calls.length, 2);
  assert.equal(page.calls[0].payload.requestId, page.calls[1].payload.requestId);
  assert.equal(page.changes.some(({ index }) => index === 3), false);
  assert.ok(page.changes.some(({ index, value }) => index === 7 && value === 'offline'));
  assert.equal(page.changes.at(-1).value, false);
});

test('Same-frame duplicate actions are blocked across reply and status', async () => {
  let release;
  const page = renderPage({ invoke: () => new Promise((resolve) => { release = resolve; }) });
  const pending = page.button('Send admin reply').props.onClick();
  await page.button('Send admin reply').props.onClick();
  await page.button('Update').props.onClick();
  await page.button('Assign to me').props.onClick();
  assert.equal(page.calls.length, 1);
  release({ data: {} });
  await pending;
});

test('Status, priority and self-assignment use the server metadata operation', async () => {
  const page = renderPage({ status: 'assigned', priority: 'urgent' });
  await page.button('Assign to me').props.onClick();
  assert.equal(page.calls[0].name, 'updateAdminBinConnectThread');
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls[0].payload)), { threadId: 'thread-1', status: 'assigned', priority: 'urgent', assignedAdminId: 'admin-1' });
  assert.equal(page.changes.some(({ index }) => index === 3 || index === 4 || index === 5), false);
});

test('Resolution uses the resolve callable; priority changes are applied atomically by metadata operation', async () => {
  const resolved = renderPage({ status: 'resolved' });
  await resolved.button('Update').props.onClick();
  assert.equal(resolved.calls[0].name, 'resolveBinConnectThread');
  assert.deepEqual(JSON.parse(JSON.stringify(resolved.calls[0].payload)), { threadId: 'thread-1' });
  const changed = renderPage({ status: 'resolved', priority: 'high' });
  await changed.button('Update').props.onClick();
  assert.equal(changed.calls[0].name, 'updateAdminBinConnectThread');
  assert.equal(changed.calls[0].payload.priority, 'high');
  assert.equal(changed.calls[0].payload.status, 'resolved');
});

test('Busy mutation disables reply, metadata controls, update and assignment', () => {
  const page = renderPage({ busy: true });
  for (const label of ['Sending...', 'Update', 'Assign to me']) assert.equal(page.button(label).props.disabled, true);
  for (const label of ['Admin reply', 'Status', 'Priority']) {
    assert.equal(page.nodes.find((node) => node.type === 'TextField' && node.props.label === label).props.disabled, true);
  }
});

test('Resolved thread cannot send a new reply', async () => {
  const page = renderPage({ status: 'resolved' });
  assert.equal(page.button('Send admin reply').props.disabled, true);
  await page.button('Send admin reply').props.onClick();
  assert.equal(page.calls.length, 0);
});

test('Failed metadata update keeps status, priority and reply available for retry', async () => {
  const page = renderPage({ status: 'pending', priority: 'high', invoke: async () => { throw new Error('permission-denied'); } });
  await page.button('Update').props.onClick();
  assert.equal(page.calls[0].name, 'updateAdminBinConnectThread');
  assert.equal(page.changes.some(({ index }) => index === 3 || index === 4 || index === 5), false);
  assert.ok(page.changes.some(({ index, value }) => index === 7 && value === 'permission-denied'));
  assert.equal(page.changes.at(-1).value, false);
  await page.button('Update').props.onClick();
  assert.equal(page.calls.length, 2);
});
