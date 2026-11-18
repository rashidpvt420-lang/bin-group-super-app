// Shipped UI and copy must not show certification, grade, or sovereignty-endorsement
// claims that BIN GROUP has not substantiated (audit 2026-11-04 fix 5; ADRA
// Circular 19/2026 and unverified ISO/IEC 27001 follow-up 2026-11-18).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const SURFACES = [
  'src/pages/LoginPage.tsx',
  'src/pages/public/CompanyProfilePage.tsx',
  'src/context/LanguageContext.tsx',
  'apps/owner-app/src/pages/LoginPage.tsx',
  'apps/owner-app/src/pages/RoleGatewayPage.tsx',
  'apps/owner-app/src/context/LanguageContext.tsx',
  'apps/admin-panel/src/components/UnifiedLogin.tsx',
  'apps/admin-panel/src/pages/admin/CompliancePage.tsx',
  'packages/shared/src/context/LanguageContext.tsx',
];

const CLAIMS = [
  [/ISO\s*\/?\s*IEC\s*27001/i, 'ISO/IEC 27001'],
  [/ISO\s*27001/i, 'ISO 27001'],
  [/INST-GRADE/, 'INST-GRADE'],
  [/UAE-SOV/, 'UAE-SOV'],
  [/login\.iso_secure/, 'login.iso_secure'],
];

test('shipped login, company, admin and language surfaces have no unverified ISO 27001, INST-GRADE or UAE-SOV claims', () => {
  for (const rel of SURFACES) {
    const src = read(rel);
    for (const [claim, label] of CLAIMS) {
      assert.doesNotMatch(src, claim, `${rel} must not contain ${label}`);
    }
  }
});

test('company profile still shows the trade licence as plain text', () => {
  const src = read('src/pages/public/CompanyProfilePage.tsx');
  assert.match(src, /CN-5914744/);
});
