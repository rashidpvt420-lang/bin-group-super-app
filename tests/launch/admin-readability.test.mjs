import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.env.UI_AUDIT_ROOT ? `${process.env.UI_AUDIT_ROOT}/` : new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}apps/admin-panel/src/${p}`, 'utf8');

// Page titles sat on the #020617 shell with an inherited near-black colour (1.03:1).
// Each now sets the theme's text.primary explicitly, so it follows the theme (#FFFFFF on the
// dark shell today, #111827 if the shell turns light).
const titles = [
  ['components/AdminPageFrame.tsx', /variant="h3" sx=\{\{ color: 'text\.primary'/],
  ['pages/brokers/BrokerManagementPage.tsx', /color: 'text\.primary', fontWeight: 950 \}\}>Broker KYC/],
  ['pages/admin/CompliancePage.tsx', /sx=\{\{ color: 'text\.primary' \}\}>Compliance & Audit Log/],
  ['pages/sos/SOSFeedPage.tsx', /sx=\{\{ color: 'text\.primary' \}\}>SOS Emergency Feed/],
  ['pages/tenants/TenantsManagementPage.tsx', /sx=\{\{ color: 'text\.primary' \}\}>TENANT REGISTRY/],
  ['pages/AuditLogPage.tsx', /sx=\{\{ color: 'text\.primary' \}\}>\{t\('audit\.title'\)\}/],
];
for (const [file, re] of titles) {
  test(`${file} title sets an explicit theme colour`, () => assert.match(read(file), re));
}

test('KPI cards with a hard-coded white background set dark ink', () => {
  const src = read('pages/brokers/BrokerManagementPage.tsx');
  assert.match(src, /<Card sx=\{\{ bgcolor: '#fff', color: '#111827'/);
  assert.doesNotMatch(src, /caption" color="text\.secondary" sx=\{\{ fontWeight: 800, textTransform: 'uppercase' \}\}>\{stat\.label\}/);
});

test('SOS summary cards are readable on their pastel backgrounds', () => {
  const src = read('pages/sos/SOSFeedPage.tsx');
  assert.doesNotMatch(src, /color="textSecondary" gutterBottom>(Active Emergencies|Responded|Resolved)/);
  assert.equal((src.match(/backgroundColor: '#(ffebee|fff3e0|e8f5e9)', color: '#111827'/g) || []).length, 3);
});

test('Admin home has no developer notes', () => {
  const src = read('pages/dashboard/AdminSimpleDashboardPage.tsx');
  assert.doesNotMatch(src, /No dead `\/disputes`|Route-safe command mode|Start from real registered routes only/);
});

test('Technician duty statuses are labels, not enums', () => {
  const src = read('pages/technicians/TechnicianDutyMonitorPage.tsx');
  assert.match(src, /label=\{dutyLabel\(/);
  assert.doesNotMatch(src, />STANDBY</);
  assert.doesNotMatch(src, /rgba\(255,255,255,0\.2\)/);
});
