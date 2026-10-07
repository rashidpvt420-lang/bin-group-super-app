import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';

const root = process.env.UI_AUDIT_ROOT || new URL('../../', import.meta.url).pathname;
const nodeRequire = createRequire(import.meta.url);

// Execute the actual page and directory model. Only the external session,
// snapshots and initial hook state are mocked; React, MUI and Link render normally.
function renderDirectory({ uid = 'owner-a', isRTL = false, state, search = '' } = {}) {
  let stateIndex = 0;
  const cache = new Map();
  const hookReact = {
    ...React,
    useState(initial) {
      const values = [state || { ownerUid: uid, rows: [], loading: false, failed: false }, search];
      return [stateIndex < values.length ? values[stateIndex++] : initial, () => {}];
    },
    useEffect() {},
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: file,
    }).outputText;
    const require = (name) => {
      if (name === 'react') return hookReact;
      if (name.endsWith('/context/RoleContext')) return { useRole: () => ({ user: uid ? { uid } : null }) };
      if (name.endsWith('/context/LanguageContext')) return { useLanguage: () => ({ isRTL }) };
      if (name.endsWith('/lib/firebase')) return { db: {}, collection() {}, query() {}, where() {}, onSnapshot() { throw Error('render proof must not contact Firebase'); } };
      if (name.startsWith('.')) {
        const base = path.resolve(path.dirname(file), name);
        const extension = name.endsWith('OwnerTenantsPage') ? '.tsx' : '.ts';
        return load(`${base}${extension}`);
      }
      return nodeRequire(name);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require }, { filename: file });
    return module.exports;
  }
  const Page = load(path.join(root, 'src/owner/pages/OwnerTenantsPage.tsx')).default;
  return renderToStaticMarkup(React.createElement(StaticRouter, { location: '/owner/tenants' }, React.createElement(Page)));
}
const row = (overrides = {}) => ({ id: 'tenant-a', displayName: 'Aisha', email: 'aisha@example.com', emailHref: 'mailto:aisha%40example.com', propertyName: 'Palm House', unitNumber: '12', status: '', ...overrides });
const loaded = (rows) => ({ ownerUid: 'owner-a', rows, loading: false, failed: false });
const visible = (html) => html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');

test('Owner directory renders readable English cards, encoded email and real BIN Connect link', () => {
  const html = renderDirectory({ state: loaded([row()]) });
  assert.match(html, /dir="ltr"/);
  assert.match(html, /href="mailto:aisha%40example.com"/);
  assert.match(html, /href="\/owner\/bin-connect"/);
  assert.match(visible(html), /BIN Connect inbox/);
  assert.match(visible(html), /Messages sent there are not recorded in this directory/);
  assert.match(html, /color:#111827/);
  assert.match(html, /background-color:#FFFFFF;color:#111827/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.doesNotMatch(html, /RERA Compliant|Institutional Audit Stream|>CHAT</);
});

test('Missing status stays unrecorded and unavailable email is a disabled native button', () => {
  const html = renderDirectory({ state: loaded([row({ email: '', emailHref: undefined })]) });
  assert.match(visible(html), /Status not recorded/);
  assert.doesNotMatch(visible(html), /ACTIVE/);
  assert.match(visible(html), /Email not recorded/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?Email unavailable[\s\S]*?<\/button>/);
  assert.doesNotMatch(html, /href="mailto:/);
});

test('Arabic directory renders RTL, truthful unknown fields and translated inbox', () => {
  const html = renderDirectory({ isRTL: true, state: loaded([row({ displayName: '', propertyName: '', status: '', email: '', emailHref: undefined })]) });
  assert.match(html, /dir="rtl"/);
  for (const text of ['دليل المستأجرين', 'مستأجر بلا اسم', 'الحالة غير مسجّلة', 'ارتباط العقار غير مسجّل', 'البريد الإلكتروني غير متاح', 'صندوق رسائل BIN Connect']) assert.ok(visible(html).includes(text), text);
  assert.match(html, /href="\/owner\/bin-connect"/);
});

test('Portfolio empty and search-empty have distinct messages and actionable clear search', () => {
  assert.match(visible(renderDirectory()), /No tenants are recorded in your portfolio/);
  const html = renderDirectory({ state: loaded([row()]), search: 'not-a-match' });
  assert.match(visible(html), /No tenants match your search/);
  assert.doesNotMatch(visible(html), /No tenants are recorded in your portfolio/);
  assert.match(html, /<button[^>]*>[\s\S]*?Clear search[\s\S]*?<\/button>/);
  assert.doesNotMatch(html, /href="mailto:/);
  assert.match(visible(renderDirectory({ state: loaded([row()]), search: ' palm ' })), /Aisha/);
});

test('Loading and failed snapshots hide contacts and present honest retry state', () => {
  const loading = renderDirectory({ state: { ...loaded([row()]), loading: true } });
  assert.match(visible(loading), /Loading tenant directory/);
  assert.doesNotMatch(loading, /aisha|mailto:/);
  const failure = renderDirectory({ state: { ...loaded([row()]), failed: true } });
  assert.match(visible(failure), /Unable to load the tenant directory\. Please try again/);
  assert.match(failure, /<button[^>]*>[\s\S]*?Retry[\s\S]*?<\/button>/);
  assert.doesNotMatch(failure, /aisha|mailto:/);
});

test('Missing session and changed owner hide every previous-owner contact before effects run', () => {
  const previous = loaded([row()]);
  const missing = renderDirectory({ uid: null, state: previous });
  assert.match(visible(missing), /Sign in to view your tenant directory/);
  assert.doesNotMatch(missing, /aisha|mailto:/);
  const switched = renderDirectory({ uid: 'owner-b', state: previous });
  assert.match(visible(switched), /Loading tenant directory/);
  assert.doesNotMatch(switched, /Aisha|aisha|Palm House|mailto:/);
});
