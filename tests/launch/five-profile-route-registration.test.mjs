import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const routeSets = [
  ['Owner', 'src/owner/OwnerApp.tsx', ['/dashboard', '/properties', '/contracts', '/financials', '/tenants', '/documents', '/property-passport', '/tickets', '/units', '/roi', '/activation']],
  ['Tenant', 'src/tenant/TenantApp.tsx', ['/dashboard', '/unit', '/request', '/tickets', '/documents', '/emergency', '/chat', '/profile', '/gate-pass', '/amenities']],
  ['Technician', 'src/technician/TechnicianApp.tsx', ['/dashboard', '/jobs', '/map', '/history', '/hr', '/profile', '/chat']],
  ['Broker', 'src/broker/BrokerApp.tsx', ['/dashboard', '/leads', '/referrals', '/commissions', '/documents', '/profile']],
  ['Admin', 'apps/admin-panel/src/App.tsx', ['/dashboard', '/profile', '/contracts', '/owners', '/tenants', '/tickets', '/technicians', '/sos', '/financials', '/audit']],
];

for (const [role, file, paths] of routeSets) {
  test(`${role} launch-audited routes are registered`, async () => {
    const source = await read(file);
    for (const path of paths) {
      const doubleQuoted = `path="${path}"`;
      const singleQuoted = `path='${path}'`;
      assert.ok(source.includes(doubleQuoted) || source.includes(singleQuoted), `${role} router is missing ${path}`);
    }
  });
}
