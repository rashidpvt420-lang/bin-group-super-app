import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const portals = [
  ['src/tenant/TenantApp.tsx', '/tenant/dashboard'],
  ['src/technician/TechnicianApp.tsx', '/technician/dashboard'],
  ['src/owner/OwnerApp.tsx', '/owner/dashboard'],
  ['src/broker/BrokerApp.tsx', '/broker/dashboard'],
];

test('role portals send an unknown nested URL back to that role dashboard', () => {
  for (const [file, home] of portals) {
    const source = read(file);
    assert.match(source, /import \{[^}]*\bNavigate\b/, `${file} must import Navigate`);
    assert.match(
      source,
      new RegExp(`<Route path="\\*" element=\\{<Navigate to="${home}" replace />\\} />`),
      `${file} must catch unknown routes`,
    );
  }
});

test('technician HR stays a real route ahead of the unknown-route catch-all', () => {
  const source = read('src/technician/TechnicianApp.tsx');
  assert.match(source, /path="\/hr"/);
  assert.match(source, /HrComingSoon/);
});
