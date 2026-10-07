import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const filename = 'src/owner/pages/OwnerPropertiesPage.tsx';
const source = readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { fileName: filename, compilerOptions: {
  jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText;

const document = (id, data) => ({ id, data: () => data });
const snapshot = (...docs) => ({ docs });

// Render the actual TSX page with persistent hook state and controllable Firestore reads.
// Effects are flushed separately to test the render between an Auth change and cleanup.
function harness() {
  let uid = 'owner-A';
  let stateCursor = 0;
  let effectCursor = 0;
  const state = [];
  const effects = [];
  const pendingEffects = [];
  const listeners = [];
  const passportReads = [];
  const navigations = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) {
      const index = stateCursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useEffect(fn, deps) {
      const index = effectCursor++;
      const previous = effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          effects[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const firebase = {
    db: {}, collection: (_, name) => ({ collection: name }), where: (field, op, value) => ({ field, op, value }),
    query: (collection, ...filters) => ({ ...collection, filters }),
    onSnapshot(query, success, failure) {
      const listener = { query, success, failure, unsubscribed: false };
      listeners.push(listener);
      return () => { listener.unsubscribed = true; };
    },
    getDocs(query) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      passportReads.push({ query, resolve, reject });
      return promise;
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, console: { warn() {} }, require(name) {
    if (name === 'react') return React;
    if (name === '@mui/material') return new Proxy({ alpha: (color) => color }, { get: (obj, key) => obj[key] || key });
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    if (name === 'react-router-dom') return { useNavigate: () => (route) => navigations.push(route) };
    if (name === '../../lib/firebase') return firebase;
    if (name === '../../context/RoleContext') return { useRole: () => ({ user: uid ? { uid } : null }) };
    if (name === '../../context/LanguageContext') return { useLanguage: () => ({ tx: (_, fallback) => fallback, isRTL: true }) };
    if (name === '../../theme/binGroupTheme') return { binThemeTokens: { gold: '#caa', textPrimary: '#111', textSecondary: '#555' } };
    throw new Error(`Unexpected import ${name}`);
  } }, { filename });
  function render() {
    stateCursor = effectCursor = 0;
    const tree = module.exports.default();
    const nodes = [], text = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (typeof node === 'string') return text.push(node);
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      node.children?.forEach(visit);
    }
    visit(tree);
    return { nodes, text: text.join(' '), tree };
  }
  function flushEffects() { pendingEffects.splice(0).forEach((fn) => fn()); }
  return { render, flushEffects, listeners, passportReads, navigations, setUid(value) { uid = value; } };
}

async function loadPortfolio(page, ownerName = 'Owner A property') {
  page.render();
  page.flushEffects();
  const pending = page.listeners.at(-1).success(snapshot(document('property-1', { propertyName: ownerName })));
  page.passportReads.at(-1).resolve(snapshot());
  await pending;
}

test('Portfolio and passport reads bind to canonical Owner UID, and controls navigate real routes', async () => {
  const page = harness();
  await loadPortfolio(page);
  for (const query of [page.listeners[0].query, page.passportReads[0].query]) {
    assert.deepEqual(JSON.parse(JSON.stringify(query.filters)), [{ field: 'ownerId', op: '==', value: 'owner-A' }]);
  }
  const rendered = page.render();
  assert.match(rendered.text, /Owner A property/);
  assert.equal(rendered.tree.props.sx.direction, 'rtl');
  rendered.nodes.find((node) => node.props['data-testid'] === 'owner-register-property').props.onClick();
  assert.equal(page.navigations.at(-1), '/onboarding');
});

test('Owner UID change hides previous rows before effects and while waiting for the new listener', async () => {
  const page = harness();
  await loadPortfolio(page);
  page.setUid('owner-B');
  const beforeEffects = page.render();
  assert.doesNotMatch(beforeEffects.text, /Owner A property/);
  assert.match(beforeEffects.text, /Loading property portfolio/);
  page.flushEffects();
  assert.equal(page.listeners[0].unsubscribed, true);
  assert.equal(page.listeners.at(-1).query.filters[0].value, 'owner-B');
  assert.doesNotMatch(page.render().text, /Owner A property/);
  const pending = page.listeners.at(-1).success(snapshot(document('property-B', { propertyName: 'Owner B property' })));
  page.passportReads.at(-1).resolve(snapshot());
  await pending;
  assert.match(page.render().text, /Owner B property/);
});

test('Missing Auth immediately hides prior rows and ends loading with an actionable error', async () => {
  const page = harness();
  await loadPortfolio(page);
  page.setUid(null);
  const beforeEffects = page.render();
  assert.doesNotMatch(beforeEffects.text, /Owner A property|Loading property portfolio/);
  assert.match(beforeEffects.text, /Authenticated Owner identity is unavailable/);
  page.flushEffects();
  assert.equal(page.listeners[0].unsubscribed, true);
  assert.doesNotMatch(page.render().text, /Loading property portfolio/);
  assert.equal(page.listeners.length, 1);
});

test('Listener error invalidates pending passport success and preserves the error/empty state', async () => {
  const page = harness();
  page.render(); page.flushEffects();
  const pending = page.listeners[0].success(snapshot(document('property-1', { propertyName: 'Must not return' })));
  page.listeners[0].failure(new Error('permission-denied'));
  assert.match(page.render().text, /Unable to load the property portfolio/);
  page.passportReads[0].resolve(snapshot());
  await pending;
  const rendered = page.render();
  assert.doesNotMatch(rendered.text, /Must not return|Loading property portfolio/);
  assert.match(rendered.text, /Unable to load the property portfolio/);
});

test('Listener error also invalidates pending passport failure', async () => {
  const page = harness();
  page.render(); page.flushEffects();
  const pending = page.listeners[0].success(snapshot(document('property-1', { propertyName: 'Must not return' })));
  page.listeners[0].failure(new Error('permission-denied'));
  page.passportReads[0].reject(new Error('passport error'));
  await pending;
  const rendered = page.render();
  assert.doesNotMatch(rendered.text, /Must not return|Portfolio metrics are temporarily unavailable/);
  assert.match(rendered.text, /Unable to load the property portfolio/);
});

test('Late older passport result cannot restore rows or stop the newer snapshot loading', async () => {
  const page = harness();
  page.render(); page.flushEffects();
  const older = page.listeners[0].success(snapshot(document('old', { propertyName: 'Old property' })));
  const newer = page.listeners[0].success(snapshot(document('new', { propertyName: 'New property' })));
  page.passportReads[0].resolve(snapshot());
  await older;
  assert.match(page.render().text, /Loading property portfolio/);
  page.passportReads[1].resolve(snapshot());
  await newer;
  assert.match(page.render().text, /New property/);
  assert.doesNotMatch(page.render().text, /Old property/);
});

test('Document IDs override payload IDs for property association and passport navigation', async () => {
  const page = harness();
  page.render(); page.flushEffects();
  const pending = page.listeners[0].success(snapshot(document('real-property', { id: 'forged-property', propertyName: 'Verified identity' })));
  page.passportReads[0].resolve(snapshot(document('real-passport', { id: 'forged-passport', propertyId: 'real-property', occupiedUnits: 3 })));
  await pending;
  const rendered = page.render();
  const passport = rendered.nodes.find((node) => node.type === 'Button' && node.children.includes('PASSPORT'));
  passport.props.onClick();
  assert.equal(page.navigations.at(-1), '/owner/property-passport/real-passport');
  const card = rendered.nodes.find((node) => node.type === 'Grid' && node.props.key === 'real-property');
  assert.ok(card, 'property row must use authoritative document ID');
});

test('Cleanup prevents a departed Owner passport result from replacing the new portfolio', async () => {
  const page = harness();
  page.render(); page.flushEffects();
  const older = page.listeners[0].success(snapshot(document('old', { propertyName: 'Old Owner' })));
  page.setUid('owner-B'); page.render(); page.flushEffects();
  const newer = page.listeners[1].success(snapshot(document('new', { propertyName: 'New Owner' })));
  page.passportReads[1].resolve(snapshot()); await newer;
  page.passportReads[0].resolve(snapshot()); await older;
  assert.match(page.render().text, /New Owner/);
  assert.doesNotMatch(page.render().text, /Old Owner/);
});

test('Revenue and history render readable text on light portfolio cards', async () => {
  const page = harness();
  await loadPortfolio(page);
  const rendered = page.render();
  const revenue = rendered.nodes.find((node) => node.type === 'Typography' && node.children.includes('REVENUE (AED)'));
  const history = rendered.nodes.find((node) => node.type === 'Button' && node.children.includes('HISTORY'));
  assert.equal(revenue.props.sx.color, '#555');
  assert.equal(history.props.sx.color, '#111');
  const revenueValue = rendered.nodes.find((node) => node.type === 'Typography' && node.props.sx?.color === '#047857');
  assert.ok(revenueValue, 'revenue value must use dark green on white');
  // WCAG relative luminance: normal-sized financial text must reach 4.5:1 on white.
  const rgb = [0x04, 0x78, 0x57].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  assert.ok(1.05 / (luminance + 0.05) >= 4.5);
  history.props.onClick();
  assert.equal(page.navigations.at(-1), '/owner/tickets');
});
