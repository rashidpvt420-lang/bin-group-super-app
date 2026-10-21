// R8 of the 2026-10-21 redesign: copy and readability sweep across all five home screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const HOMES = {
  owner: 'src/owner/pages/OwnerSimpleDashboardPage.tsx',
  tenant: 'src/tenant/pages/TenantSimpleDashboardPage.tsx',
  technician: 'src/technician/pages/TechnicianSimpleDashboardPage.tsx',
  broker: 'src/broker/pages/BrokerSimpleDashboardPage.tsx',
};
const EMBEDDED = ['src/technician/components/TechnicianDutyAvailabilityCard.tsx', 'src/owner/components/OwnerRecentComplaintsCard.tsx', 'src/broker/components/BrokerLiveAttributionCard.tsx', 'src/owner/components/OwnerFinancialTruthCard.tsx'];
const JARGON = ['SIMPLE MODE', 'FIELD NODE', 'server-backed', 'server-assigned', 'mission', 'identity-bound', 'masked KYC'];

test('home screens use the shared redesign components and no jargon', async () => {
  for (const [role, file] of Object.entries(HOMES)) {
    const src = await readFile(file, 'utf8');
    assert.ok(src.includes("from '../../components/ui'"), `${role} uses ui components`);
    assert.ok(src.includes('<AppHeader'), `${role} header`);
    const lower = src.toLowerCase();
    for (const j of JARGON) assert.ok(!lower.split(/[^a-z-]+/).includes(j.toLowerCase()) && !lower.includes(` ${j.toLowerCase()} `), `${role}: ${j}`);
  }
});

test('every t() string on the home screens has an Arabic version', async () => {
  for (const [role, file] of Object.entries(HOMES)) {
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(/\bt\('([^']+)', ('[^']*'|"[^"]*"), ('[^']*'|"[^"]*")\)/g)) {
      assert.ok(/[\u0600-\u06FF]/.test(m[3]), `${role} ${m[1]} missing Arabic`);
    }
    assert.ok([...src.matchAll(/\bt\('/g)].length >= 8, `${role} copy goes through t()`);
  }
});

test('no 900/950 weights or low-contrast #667085 on homes and the cards they embed', async () => {
  for (const file of [...Object.values(HOMES), ...EMBEDDED]) {
    const src = await readFile(file, 'utf8');
    assert.doesNotMatch(src, /fontWeight[:=] ?["']?9[05]0/, file);
    assert.doesNotMatch(src, /#667085/, file);
  }
});
