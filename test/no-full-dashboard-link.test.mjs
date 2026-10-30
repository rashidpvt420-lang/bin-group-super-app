import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const roles = ['owner', 'tenant', 'broker', 'technician'];
const Cap = (r) => r[0].toUpperCase() + r.slice(1);

test('no profile home shows an "Open full dashboard" link', () => {
  for (const r of roles) {
    const src = read(`src/${r}/pages/${Cap(r)}SimpleDashboardPage.tsx`);
    assert.ok(!src.includes('Open full dashboard'), `${r} still shows Open full dashboard`);
    assert.ok(!src.includes(`'/${r}/dashboard/full'`), `${r} home still links to the full dashboard`);
  }
});

test('existing /<role>/dashboard/full links keep working', () => {
  for (const r of roles) {
    assert.ok(read(`src/${r}/${Cap(r)}App.tsx`).includes('<Route path="/dashboard/full"'), `${r} lost dashboard/full route`);
  }
});

test('owner full-dashboard sections are reachable from Home and the Money tab', () => {
  const home = read('src/owner/pages/OwnerSimpleDashboardPage.tsx');
  assert.ok(home.includes("navigate('/owner/insights')"));
  assert.ok(home.includes('Portfolio insights & reports'));
  assert.ok(read('src/owner/OwnerApp.tsx').includes('<Route path="/insights" element={<OwnerDashboardPage />} />'));
  assert.ok(read('src/components/ui/roleNav.ts').includes("'/owner/insights'"));
});

test('tenant services from the full dashboard are on Home "More services" and routed', () => {
  const home = read('src/tenant/pages/TenantSimpleDashboardPage.tsx');
  const app = read('src/tenant/TenantApp.tsx');
  const full = read('src/tenant/pages/TenantDashboardPage.tsx');
  const navPaths = ['/tenant/tickets', '/tenant/request', '/tenant/payments', '/tenant/documents', '/tenant/emergency', '/tenant/notices'];
  const fullPaths = [...new Set(full.match(/'\/tenant\/[a-z/-]+'/g).map((s) => s.slice(1, -1)))];
  assert.ok(home.includes('More services'));
  for (const p of fullPaths) {
    if (navPaths.includes(p)) continue;
    assert.ok(home.includes(`path: '${p}'`), `${p} only reachable via full dashboard`);
    const seg = p.replace('/tenant', '').split('/')[1];
    assert.ok(app.includes(`path="/${seg}`), `${p} has no route`);
  }
});

test('Made in UAE mark sits in every profile shell footer and the root skips profiles', () => {
  for (const r of roles) assert.ok(read(`src/${r}/${Cap(r)}App.tsx`).includes('<MadeInUaeInline />'), `${r} footer lacks mark`);
  const mark = read('src/components/MadeInUaeMark.tsx');
  assert.ok(mark.includes('isProfileShellPath(pathname)) return null'));
  for (const r of roles) assert.ok(mark.includes(`'/${r}'`));
});
