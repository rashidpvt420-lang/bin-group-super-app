import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const filename = 'src/owner/pages/OwnerUnitRegistryPage.tsx';
const source = readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { fileName: filename, compilerOptions: {
  jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText;
const doc = (id, data) => ({ id, data: () => data });
const snap = (...docs) => ({ docs });
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

// Persistent hooks execute the production page's real reads and mutation handlers.
// All Firebase adapters are controlled in-memory; production Firebase is never initialized.
function harness() {
  let uid = 'owner-A', stateCursor = 0, effectCursor = 0, refCursor = 0;
  const state = [], refs = [], effects = [], pendingEffects = [], reads = [], calls = [];
  const tx = (_, fallback) => fallback;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) {
      const index = stateCursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) { const index = refCursor++; return refs[index] ||= { current: initial }; },
    useMemo: (fn) => fn(),
    useEffect(fn, deps) {
      const index = effectCursor++, previous = effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) pendingEffects.push(() => {
        previous?.cleanup?.(); effects[index] = { deps, cleanup: fn() };
      });
    },
  };
  function deferred(target, fields) {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    target.push({ ...fields, resolve, reject });
    return promise;
  }
  const firebase = {
    db: {}, functions: {}, collection: (_, name) => ({ collection: name }),
    where: (field, op, value) => ({ field, op, value }), query: (collection, ...filters) => ({ ...collection, filters }),
    getDocs: (query) => deferred(reads, { query }),
    httpsCallable: (_, name) => (payload) => deferred(calls, { name, payload }),
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, console: { warn() {} }, require(name) {
    if (name === 'react') return React;
    if (name === '@mui/material') return new Proxy({ alpha: (color) => color }, { get: (obj, key) => obj[key] || key });
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    if (name === '../../lib/firebase') return firebase;
    if (name === '../../context/RoleContext') return { useRole: () => ({ user: uid ? { uid } : null }) };
    if (name === '../../context/LanguageContext') return { useLanguage: () => ({ tx, isRTL: false }) };
    if (name === '../../theme/binGroupTheme') return { binThemeTokens: { gold: '#caa', textPrimary: '#111', textSecondary: '#555', border: '#ddd' } };
    throw new Error(`Unexpected import ${name}`);
  } }, { filename });
  function render() {
    stateCursor = effectCursor = refCursor = 0;
    const tree = module.exports.default(), nodes = [], text = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (typeof node === 'string') return text.push(node);
      if (!node || typeof node !== 'object') return;
      nodes.push(node); node.children?.forEach(visit);
    }
    visit(tree);
    return { tree, nodes, text: text.join(' '), button: (label) => nodes.find((node) => node.type === 'Button' && node.children.includes(label)) };
  }
  return { render, state, reads, calls, setUid(value) { uid = value; }, flushEffects() { pendingEffects.splice(0).forEach((fn) => fn()); } };
}
async function load(page, owner = 'A') {
  page.render(); page.flushEffects();
  page.reads.at(-1).resolve(snap(doc(`property-${owner}`, { propertyName: `Property ${owner}`, id: 'forged' })));
  await settle();
  page.reads.at(-1).resolve(snap(doc(`unit-${owner}`, { unitNumber: `Unit ${owner}`, propertyId: `property-${owner}`, ownerId: `owner-${owner}`, id: 'forged' })));
  await settle();
}

function openWizard(page) { page.render().button('Generate Units').props.onClick(); return page.render(); }

test('Both collection queries use canonical Owner UID and document IDs remain authoritative', async () => {
  const page = harness(); await load(page);
  assert.equal(page.reads.length, 2);
  for (const { query } of page.reads) assert.deepEqual(JSON.parse(JSON.stringify(query.filters)), [{ field: 'ownerId', op: '==', value: 'owner-A' }]);
  assert.equal(page.state[1][0].id, 'property-A');
  assert.equal(page.state[2][0].id, 'unit-A');
  assert.match(page.render().text, /Unit A/);
});

test('Query denial clears registry and ends loading with a visible failure', async () => {
  const page = harness(); page.render(); page.flushEffects();
  page.reads[0].resolve(snap(doc('property-A', { propertyName: 'Property A' }))); await settle();
  page.reads[1].reject(new Error('permission-denied')); await settle();
  const rendered = page.render();
  assert.match(rendered.text, /Unable to load the unit registry/);
  const alert = rendered.nodes.find((node) => node.type === 'Alert');
  assert.equal(alert.props.severity, 'warning');
  assert.equal(alert.props.action.children[0], 'Retry');
  alert.props.action.props.onClick();
  page.render(); page.flushEffects();
  assert.equal(page.reads.length, 3, 'retry must issue a fresh owned-property query');
  assert.equal(rendered.nodes.some((node) => node.type === 'CircularProgress'), false);
  assert.equal(page.state[1].length, 0); assert.equal(page.state[2].length, 0);
});

test('UID switch hides old rows and wizard before effects, then resets to new Owner property', async () => {
  const page = harness(); await load(page); openWizard(page);
  assert.equal(page.state[9].propertyId, 'property-A');
  page.setUid('owner-B'); const immediate = page.render();
  assert.doesNotMatch(immediate.text, /Unit A/);
  assert.equal(immediate.nodes.some((node) => node.type === 'Dialog'), false);
  page.flushEffects();
  assert.equal(page.state[5], false); assert.equal(page.state[9].propertyId, '');
  page.reads.at(-1).resolve(snap(doc('property-B', { propertyName: 'Property B' }))); await settle();
  page.reads.at(-1).resolve(snap(doc('unit-B', { unitNumber: 'Unit B', propertyId: 'property-B' }))); await settle();
  assert.match(page.render().text, /Unit B/); assert.equal(page.state[9].propertyId, 'property-B');
});

test('Missing auth hides old data immediately and finishes loading without extra reads', async () => {
  const page = harness(); await load(page); page.setUid(null);
  assert.match(page.render().text, /Authenticated Owner identity is unavailable/);
  assert.doesNotMatch(page.render().text, /Unit A/);
  page.flushEffects(); assert.equal(page.state[0], false); assert.equal(page.reads.length, 2);
});

test('Same-frame Generate double tap calls server only once and preserves legitimate payload', async () => {
  const page = harness(); await load(page); const wizard = openWizard(page);
  const handler = wizard.button('Generate').props.onClick;
  const first = handler(); await handler();
  assert.equal(page.calls.length, 1); assert.equal(page.calls[0].name, 'ownerGenerateUnits');
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls[0].payload)), { propertyId: 'property-A', count: 1, prefix: '', startNumber: 1, padding: 0, floor: '', annualRent: 0 });
  page.calls[0].resolve({ data: { createdCount: 1 } }); await first;
  assert.equal(page.state[6], false); assert.equal(page.state[5], false); assert.match(page.render().text, /1 unit\(s\) generated/);
});

for (const result of ['resolve', 'reject']) test(`Stale submission ${result} cannot update the new Owner wizard or notice`, async () => {
  const page = harness(); await load(page); const oldHandler = openWizard(page).button('Generate').props.onClick;
  const pending = oldHandler(); page.setUid('owner-B'); page.render(); page.flushEffects();
  page.reads.at(-1).resolve(snap(doc('property-B', {}))); await settle();
  page.reads.at(-1).resolve(snap()); await settle(); openWizard(page);
  if (result === 'resolve') page.calls[0].resolve({ data: { createdCount: 99 } });
  else page.calls[0].reject(new Error('Old Owner failure'));
  await pending;
  assert.equal(page.state[5], true); assert.equal(page.state[9].propertyId, 'property-B');
  assert.equal(page.state[7], 0); assert.equal(page.state[8], ''); assert.equal(page.state[6], false);
  await oldHandler(); assert.equal(page.calls.length, 1, 'old captured handler cannot act under the new identity');
});

test('Mutation failure keeps wizard inputs for retry and releases synchronous guard', async () => {
  const page = harness(); await load(page); const handler = openWizard(page).button('Generate').props.onClick;
  const pending = handler(); page.calls[0].reject(new Error('offline')); await pending;
  assert.equal(page.state[5], true); assert.equal(page.state[9].propertyId, 'property-A'); assert.equal(page.state[6], false);
  const retry = handler(); assert.equal(page.calls.length, 2); page.calls[1].resolve({ data: { createdCount: 0 } }); await retry;
});

test('Unit registry renders readable text and light cards while preserving status distinctions', async () => {
  const page = harness();
  page.render(); page.flushEffects();
  page.reads[0].resolve(snap(doc('property-A', {}))); await settle();
  page.reads[1].resolve(snap(
    doc('vacant', { unitNumber: 'Unit A', occupancyStatus: 'VACANT' }),
    doc('occupied', { unitNumber: 'Unit occupied', occupancyStatus: 'OCCUPIED' }),
    doc('maintenance', { unitNumber: 'Unit maintenance', occupancyStatus: 'UNDER_MAINTENANCE' }),
  )); await settle();
  const rendered = page.render();
  const title = rendered.nodes.find((node) => node.type === 'Typography' && node.children.includes('Unit Ledger'));
  assert.equal(title.props.sx.color, '#111');
  const table = rendered.nodes.find((node) => node.type === 'TableContainer');
  assert.equal(table.props.sx.bgcolor, '#FFFFFF');
  const unitText = rendered.nodes.find((node) => node.type === 'Typography' && node.children.includes('Unit A'));
  assert.equal(unitText.props.sx.color, '#111');
  const status = rendered.nodes.find((node) => node.type === 'Chip');
  assert.equal(status.props.sx.color, '#555');
  // The two semantic status colors must each remain legible on the light Owner canvas.
  for (const label of ['OCCUPIED', 'MAINTENANCE']) {
    const chip = rendered.nodes.find((node) => node.type === 'Chip' && node.props.label === label);
    assert.ok(chip, `must render ${label} status`);
    const hex = chip.props.sx.color.replace('#', '');
    const channels = [0, 2, 4].map((index) => {
      const c = parseInt(hex.slice(index, index + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    assert.ok(1.05 / (luminance + 0.05) >= 4.5);
  }
});
