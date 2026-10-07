import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Executes each component's real rendered event handlers, with React hook state
// and callable transport isolated from Firebase. No production writes occur.
// Repository scripts execute this suite from the repository root. Only these
// two fixed sources may enter the isolated component harness.
const chatBoxSource = fs.readFileSync('src/components/BinConnectChatBox.tsx', 'utf8');
const inboxSource = fs.readFileSync('src/components/BinConnectInboxPage.tsx', 'utf8');
function harness(file) {
  let source;
  switch (file) {
    case 'BinConnectChatBox.tsx': source = chatBoxSource; break;
    case 'BinConnectInboxPage.tsx': source = inboxSource; break;
    default: throw new Error(`Unexpected component: ${file}`);
  }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const slots = [];
  let cursor = 0;
  let uuid = 0;
  let tree;
  const effects = [];
  const calls = [];
  const pending = [];
  const subscriptions = [];
  const auth = { currentUser: { uid: 'owner-1', email: 'owner@example.com' } };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef: initial => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useMemo: fn => { cursor++; return fn(); },
    useEffect: (fn, deps) => { const index = cursor++; const old = slots[index]; if (!old || deps.some((dep, i) => dep !== old.deps[i])) { old?.cleanup?.(); slots[index] = { deps }; effects.push(() => { slots[index].cleanup = fn(); }); } },
  };
  const mui = new Proxy({ alpha: color => color }, { get: (target, key) => target[key] ?? key });
  const firebase = {
    auth, functions: {}, db: {}, collection: (...path) => path, query: (...parts) => parts, orderBy: (...parts) => parts, limit: value => value,
    onSnapshot: (_query, receive, error) => { const subscription = { receive, error, cancelled: false }; subscriptions.push(subscription); receive({ docs: [] }); return () => { subscription.cancelled = true; }; },
    httpsCallable: (_functions, name) => async data => {
      if (name === 'listMyBinConnectThreads') return { data: { threads: [{ id: 'thread-1', title: 'Help', status: 'open', channel: 'admin_support' }, { id: 'thread-2', title: 'Other', status: 'open' }] } };
      calls.push({ name, data });
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports, module: { exports }, console,
    crypto: { randomUUID: () => `request-id-${++uuid}` },
    require: name => {
      if (name === 'react') return react;
      if (name === '@mui/material') return mui;
      if (name === 'lucide-react') return new Proxy({}, { get: (_target, key) => key });
      if (name === 'react-router-dom') return { useNavigate: () => () => {} };
      if (name === '../lib/firebase') return firebase;
      if (name === '../theme/binGroupTheme') return { binThemeTokens: { gold: '#aa8800' } };
      throw new Error(`Unexpected import ${name}`);
    },
  }, { filename: file });
  const render = () => { cursor = 0; tree = exports.default({ role: 'owner' }); return tree; };
  const walk = function* (node) { if (Array.isArray(node)) { for (const child of node) yield* walk(child); } else if (node && typeof node === 'object') { yield node; yield* walk(node.props?.children); } };
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : '';
  const find = predicate => { const result = [...walk(tree)].find(predicate); assert.ok(result, 'Rendered control exists'); return result; };
  const button = label => find(node => node.type === 'Button' && text(node).includes(label));
  const input = label => find(node => node.type === 'TextField' && node.props.label === label);
  const edit = (label, value) => { input(label).props.onChange({ target: { value } }); render(); };
  const flush = async () => { while (effects.length) effects.shift()(); await Promise.resolve(); await Promise.resolve(); render(); };
  return {
    calls, slots, auth, subscriptions, render, flush, button, edit,
    text: () => text(tree),
    value: label => input(label).props.value,
    open: () => { find(node => node.type === 'Fab').props.onClick(); render(); },
    resolve: () => { assert.ok(pending.length); pending.shift().resolve({ data: { threadId: 'new-thread' } }); },
    reject: () => { assert.ok(pending.length); pending.shift().reject(new Error('Transport unavailable')); },
    changeUid: value => { auth.currentUser = { uid: value }; render(); },
  };
}
async function ready(file) {
  const h = harness(file);
  h.render();
  await h.flush();
  await h.flush();
  if (file === 'BinConnectChatBox.tsx') h.open();
  return h;
}

for (const [file, field, buttonLabel, callable] of [
  ['BinConnectChatBox.tsx', 'Message', 'Send Message', 'createBinConnectThread'],
  ['BinConnectInboxPage.tsx', 'Reply', 'Send reply', 'sendBinConnectMessage'],
]) {
  test(`${file} synchronous duplicate clicks create one callable mutation`, async () => {
    const h = await ready(file);
    h.edit(field, 'Please help');
    const handler = h.button(buttonLabel).props.onClick;
    const first = handler();
    const duplicate = handler();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].name, callable);
    assert.match(h.calls[0].data.requestId, /^[A-Za-z0-9_-]{8,100}$/);
    h.resolve();
    await Promise.all([first, duplicate]);
  });

  test(`${file} failed same-payload retry retains request ID and success clears it`, async () => {
    const h = await ready(file);
    h.edit(field, 'Please help');
    let promise = h.button(buttonLabel).props.onClick();
    h.reject();
    await promise;
    h.render();
    promise = h.button(buttonLabel).props.onClick();
    assert.equal(h.calls[1].data.requestId, h.calls[0].data.requestId);
    h.resolve();
    await promise;
    h.render();
    h.edit(field, 'Please help');
    promise = h.button(buttonLabel).props.onClick();
    assert.notEqual(h.calls[2].data.requestId, h.calls[0].data.requestId);
    h.resolve();
    await promise;
  });

  test(`${file} changed payload gets a new request ID`, async () => {
    const h = await ready(file);
    h.edit(field, 'First message');
    let promise = h.button(buttonLabel).props.onClick();
    h.reject();
    await promise;
    h.render();
    h.edit(field, 'Changed message');
    promise = h.button(buttonLabel).props.onClick();
    assert.notEqual(h.calls[1].data.requestId, h.calls[0].data.requestId);
    assert.equal(h.calls[1].data.message, 'Changed message');
    h.resolve();
    await promise;
  });

  test(`${file} changed authenticated UID gets a new request ID`, async () => {
    const h = await ready(file);
    h.edit(field, 'Same message');
    let promise = h.button(buttonLabel).props.onClick();
    h.reject();
    await promise;
    h.changeUid('owner-2');
    await h.flush();
    await h.flush();
    h.edit(field, 'Same message');
    promise = h.button(buttonLabel).props.onClick();
    assert.notEqual(h.calls[1].data.requestId, h.calls[0].data.requestId);
    h.resolve();
    await promise;
  });
}

test('Inbox synchronous resolve clicks create one mutation', async () => {
  const h = await ready('BinConnectInboxPage.tsx');
  const handler = h.button('Mark resolved').props.onClick;
  const first = handler();
  const duplicate = handler();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, 'resolveBinConnectThread');
  assert.equal(h.calls[0].data.threadId, 'thread-1');
  h.resolve();
  await Promise.all([first, duplicate]);
});

test('Inbox send and resolve share the same synchronous mutation lock', async () => {
  const h = await ready('BinConnectInboxPage.tsx');
  h.edit('Reply', 'Please help');
  const first = h.button('Send reply').props.onClick();
  const duplicate = h.button('Mark resolved').props.onClick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, 'sendBinConnectMessage');
  h.reject();
  await Promise.all([first, duplicate]);
  h.render();
  const resolve = h.button('Mark resolved').props.onClick();
  assert.equal(h.calls.length, 2);
  h.resolve();
  await resolve;
});

for (const [file, field, buttonLabel] of [
  ['BinConnectChatBox.tsx', 'Message', 'Send Message'],
  ['BinConnectInboxPage.tsx', 'Reply', 'Send reply'],
]) {
  for (const outcome of ['success', 'failure']) test(`${file} old-account ${outcome} cannot overwrite new-account draft or unlock its mutation`, async () => {
    const h = await ready(file);
    h.edit(field, 'Old account message');
    const oldOperation = h.button(buttonLabel).props.onClick();
    h.changeUid('owner-2');
    assert.doesNotMatch(h.text(), /Old account message/);
    await h.flush(); await h.flush();
    h.edit(field, 'New account draft');
    const newHandler = h.button(buttonLabel).props.onClick;
    const newOperation = newHandler();
    if (outcome === 'success') h.resolve(); else h.reject();
    await oldOperation;
    h.render();
    assert.equal(h.value(field), 'New account draft');
    assert.doesNotMatch(h.text(), /Message sent|Reply sent|Transport unavailable/);
    await newHandler();
    assert.equal(h.calls.length, 2, 'Stale finally did not unlock the new mutation');
    h.resolve();
    await newOperation;
  });

  test(`${file} switch back to original UID does not revive old-operation success`, async () => {
    const h = await ready(file);
    h.edit(field, 'Original account old message');
    const oldOperation = h.button(buttonLabel).props.onClick();
    h.changeUid('owner-2');
    await h.flush(); await h.flush();
    h.changeUid('owner-1');
    await h.flush(); await h.flush();
    h.edit(field, 'New visit draft');
    h.resolve();
    await oldOperation;
    h.render();
    assert.equal(h.value(field), 'New visit draft');
    assert.doesNotMatch(h.text(), /Message sent|Reply sent/);
  });
}

test('Inbox hides previous identity messages synchronously and ignores cancelled callbacks', async () => {
  const h = await ready('BinConnectInboxPage.tsx');
  await h.flush();
  const oldSubscription = h.subscriptions.at(-1);
  oldSubscription.receive({ docs: [{ id: 'old-message', data: () => ({ body: 'Private owner one message', senderId: 'owner-1' }) }] });
  h.render();
  assert.match(h.text(), /Private owner one message/);
  h.changeUid('owner-2');
  assert.doesNotMatch(h.text(), /Private owner one message|Help/);
  await h.flush(); await h.flush();
  assert.equal(oldSubscription.cancelled, true);
  oldSubscription.receive({ docs: [{ id: 'late-message', data: () => ({ body: 'Late private message', senderId: 'owner-1' }) }] });
  oldSubscription.error(new Error('Old account private error'));
  h.render();
  assert.doesNotMatch(h.text(), /Late private message|Old account private error/);
});

test('Inbox resolve from previous identity cannot mark new-account conversation resolved', async () => {
  const h = await ready('BinConnectInboxPage.tsx');
  const oldOperation = h.button('Mark resolved').props.onClick();
  h.changeUid('owner-2');
  await h.flush(); await h.flush();
  h.resolve();
  await oldOperation;
  h.render();
  assert.doesNotMatch(h.text(), /Conversation marked resolved/);
  assert.equal(h.button('Mark resolved').props.disabled, false);
});
