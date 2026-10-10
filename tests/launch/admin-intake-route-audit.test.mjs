import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const app = readFileSync('apps/admin-panel/src/App.tsx', 'utf8');
const audit = readFileSync('tests/e2e/hard-launch-routes.spec.ts', 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  readFileSync('tests/e2e/helpers/authenticatedRouteExpectation.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, { module, exports: module.exports });
const { expectedAuthenticatedRoute } = module.exports;

test('the retired intake alias resolves only to the registered protected Vault', () => {
  const target = app.match(/<Route path="\/onboard-property" element=\{<Navigate to="([^"]+)" replace \/>\} \/>/)?.[1];
  assert.equal(target, '/vault');
  assert.equal(expectedAuthenticatedRoute('Admin', '/onboard-property'), target);
  assert.match(app, /<Route path="\/vault" element=\{<ProtectedRoute adminOnly><IntakeVaultPage \/><\/ProtectedRoute>\} \/>/);
});

test('all audited Admin routes match the application contract', () => {
  const adminCase = audit.slice(audit.indexOf("name: 'Admin'"), audit.indexOf('const PHASE_2_SENTINEL_ROUTE'));
  const requested = [...adminCase.matchAll(/'(\/[^']*)'/g)].map((match) => match[1]);
  const registered = new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]));
  const redirects = new Map([...app.matchAll(/<Route path="([^"]+)" element=\{<Navigate to="([^"]+)"/g)].map((match) => [match[1], match[2]]));
  assert.ok(requested.includes('/onboard-property'), 'The alias must still be visited by the live audit.');
  for (const route of requested) {
    assert.ok(registered.has(route), `${route} must have an explicit route registration`);
    assert.equal(expectedAuthenticatedRoute('Admin', route), redirects.get(route) || route, `${route} must match its exact application destination`);
  }
});

test('wildcard, login, lookalike and other-role routes never inherit the alias exception', () => {
  for (const role of ['Owner', 'Tenant', 'Technician', 'Broker', 'admin', '']) {
    assert.equal(expectedAuthenticatedRoute(role, '/onboard-property'), '/onboard-property');
  }
  for (const route of ['/missing', '/onboard-property/', '/onboard-property/new', '/dashboard', '/login', '/vault']) {
    assert.equal(expectedAuthenticatedRoute('Admin', route), route);
  }
});
