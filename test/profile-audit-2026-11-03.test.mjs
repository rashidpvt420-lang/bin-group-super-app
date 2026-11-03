import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dict = read('src/context/LanguageContext.tsx');
const arStart = dict.indexOf('    ar: {');
const keysIn = (block) => new Set([...block.matchAll(/^\s+'([^']+)':/gm)].map((m) => m[1]));
const EN = keysIn(dict.slice(0, arStart));
const AR = keysIn(dict.slice(arStart));

const keyedFiles = [
  'src/components/ProtectedRoute.tsx',
  'src/owner/pages/OwnerContractsResolvedPage.tsx',
  'src/pages/public/CertificateVerificationPage.tsx',
  'src/pages/public/InvoiceVerificationPage.tsx',
  'src/pages/TurnoverEnginePage.tsx',
  'src/pages/PropertyOnboardingPage.tsx',
  'src/components/onboarding/PropertyLocationStep.tsx',
];

test('every static t(key) on audited profile screens exists in EN and AR', () => {
  for (const f of keyedFiles) {
    const src = read(f);
    for (const m of src.matchAll(/\bt\(\s*'([^']+)'\s*[,)]/g)) {
      assert.ok(EN.has(m[1]), `${f}: missing EN key ${m[1]}`);
      assert.ok(AR.has(m[1]), `${f}: missing AR key ${m[1]}`);
    }
  }
});

test('Bi component uses the main app language provider and renders Arabic only for ar', () => {
  assert.ok(existsSync(new URL('../src/components/Bi.tsx', import.meta.url)));
  const bi = read('src/components/Bi.tsx');
  assert.match(bi, /from ['"]\.\.\/context\/LanguageContext['"]/);
  assert.doesNotMatch(bi, /from ['"]@bin\/shared['"]/);
  assert.match(bi, /lang === 'ar' \? ar : en/);
});

const biFiles = {
  owner: ['src/owner/components/OwnerMoneySnapshotSection.tsx', 'src/owner/components/OwnerComplaintCommandCenter.tsx', 'src/owner/pages/OwnerApprovalCenterPage.tsx'],
  tenant: ['src/tenant/pages/TenantMoveInspectionPage.tsx', 'src/tenant/pages/TenantPaymentsPage.tsx', 'src/components/RoleIntelligencePanel.tsx'],
  technician: ['src/technician/pages/TechnicianHRPageV2.tsx', 'src/technician/pages/TechnicianOfflinePage.tsx', 'src/technician/pages/TechnicianProofReadinessPage.tsx'],
  broker: ['src/broker/pages/BrokerReferralsPage.tsx', 'src/broker/pages/BrokerCommissionsPage.tsx', 'src/broker/pages/BrokerAttributionProofPage.tsx'],
  staff: ['src/admin/AdminTerminal.tsx', 'src/admin/AdminSuggestionsPage.tsx', 'src/components/staff/StaffTodayDashboard.tsx'],
};

for (const [profile, files] of Object.entries(biFiles)) {
  test(`${profile} screens carry Arabic copy for static text`, () => {
    for (const f of files) {
      const src = read(f);
      assert.match(src, /import Bi from '/, `${f} should import Bi`);
      for (const m of src.matchAll(/<Bi en=\{("(?:[^"\\]|\\.)*")\} ar=\{("(?:[^"\\]|\\.)*")\} \/>/g)) {
        const ar = JSON.parse(m[2]);
        assert.ok(/[\u0600-\u06FF]/.test(ar) || /^[\s\d%:·.,()#+-]*$/.test(ar) || /BIN/.test(ar), `${f}: Arabic copy missing for ${m[1]}`);
        assert.notEqual(ar, JSON.parse(m[1]).trim() === '' ? null : '', `${f}: empty Arabic for ${m[1]}`);
      }
    }
  });
}

test('previously dead profile buttons now act or are honestly disabled', () => {
  assert.match(read('src/owner/pages/OwnerPropertyPassportResolvedPage.tsx'), /data-testid="passport-print-pdf" onClick=\{\(\) => window\.print\(\)\}/);
  assert.match(read('src/pages/HealthScorePage.tsx'), /data-testid="health-audit-print" onClick=\{\(\) => window\.print\(\)\}/);
  const inv = read('src/pages/InvoiceDetailsPage.tsx');
  assert.match(inv, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.match(inv, /navigator\.share/);
  assert.match(inv, /disabled title="Transaction log is not available yet"/);
  const turn = read('src/pages/TurnoverEnginePage.tsx');
  assert.match(turn, /disabled title="Audit view is not available yet"/);
  assert.match(turn, /href="\/owner\/inspections"[^>]*>INITIATE NEW MOVE-OUT/);
  assert.match(read('src/components/CoverageTracker.tsx'), /disabled title="Policy list is not available yet"/);
  assert.match(read('src/broker/pages/BrokerCommissionsPage.tsx'), /<IconButton disabled aria-label="Commission record">/);
  assert.match(read('src/broker/pages/BrokerReferralsPage.tsx'), /<IconButton disabled aria-label="View referral audit"/);
});

test('card payments stay off in admin collection copy', () => {
  assert.match(read('src/admin/AdminPaymentCollectionPage.tsx'), /Card payments are off\./);
});
