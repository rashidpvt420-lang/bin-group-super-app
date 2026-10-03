import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('all role portal shells bind the light-readable CSS class', () => {
  const css = read('src/styles/whitePlatinumAuthenticated.css');
  const owner = read('src/owner/OwnerApp.tsx');
  const tech = read('src/technician/TechnicianApp.tsx');
  const tenant = read('src/tenant/TenantApp.tsx');
  const broker = read('src/broker/BrokerApp.tsx');
  const adminApp = read('apps/admin-panel/src/App.tsx');
  const adminIndex = read('apps/admin-panel/src/index.tsx');
  const adminTheme = read('apps/admin-panel/src/theme/adminTheme.ts');

  for (const shell of ['owner-shell', 'technician-shell', 'tenant-shell', 'broker-shell', 'admin-shell']) {
    assert.match(css, new RegExp(`\\.${shell}\\s*,|\\.${shell}\\s*\\{`));
    assert.match(css, new RegExp(`\\.${shell} \\.MuiTypography-root`));
    assert.match(css, new RegExp(`\\.${shell} \\.MuiPaper-root`));
  }

  assert.match(owner, /className="owner-shell"/);
  assert.match(tech, /className="technician-shell"/);
  assert.match(tenant, /className="tenant-shell"/);
  assert.match(broker, /className="broker-shell"/);
  assert.match(adminApp, /className="admin-shell"/);
  assert.match(adminIndex, /whitePlatinumAuthenticated\.css/);
  assert.match(adminTheme, /mode:\s*'light'/);
  assert.match(adminTheme, /textPrimary:\s*'#111827'/);
  assert.match(css, /background-image:\s*none\s*!important/);
  assert.match(css, /\.technician-shell \.MuiPaper-root::before/);
});

test('role profile pages keep light ink and never paint dark cover overlays', () => {
  const tech = read('src/technician/pages/TechnicianProfilePage.tsx');
  const owner = read('src/owner/pages/OwnerProfilePage.tsx');
  const tenant = read('src/tenant/pages/TenantProfilePage.tsx');
  const cover = read('src/utils/profileImages.ts');

  for (const source of [tech, owner, tenant]) {
    assert.match(source, /textPrimary/);
    assert.doesNotMatch(source, /rgba\(2,\s*6,\s*23/);
    assert.doesNotMatch(source, /profileCoverSx\(/);
  }

  assert.match(tech, /bgcolor:\s*ink\.paper/);
  assert.match(owner, /bgcolor:\s*ink\.paper/);
  assert.match(tenant, /bgcolor:\s*ink\.paper/);
  assert.match(cover, /Light White-Platinum profile shell/);
  assert.doesNotMatch(cover, /rgba\(2,\s*6,\s*23/);
});
