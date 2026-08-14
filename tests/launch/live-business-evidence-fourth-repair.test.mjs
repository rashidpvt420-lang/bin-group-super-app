import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin evidence seeds the complete Founder-verifiable geography contract', async () => {
  const source = await read('tests/e2e/business-admin.spec.ts');
  assert.match(source, /submittedGeo:\s*\{/);
  assert.match(source, /submittedSource: 'protected_e2e_fixture'/);
  assert.match(source, /expect\(approvedProperty\.geo\)\.toMatchObject/);
  assert.match(source, /source: 'admin_manual'/);
  assert.match(source, /source: 'FOUNDER_MFA_REVIEW'/);
});

test('Owner evidence completes the legal agreement before protected financial routes', async () => {
  const source = await read('tests/e2e/business-owner.spec.ts');
  assert.match(source, /async function acceptLegalAgreementIfRequired/);
  assert.match(source, /SOVEREIGN INSTITUTIONAL AGREEMENT/);
  assert.match(source, /node\.scrollTop = node\.scrollHeight/);
  assert.match(source, /I AGREE & ENTER/);
  assert.match(source, /await acceptLegalAgreementIfRequired\(page\)/);
});

test('Tenant and Technician lifecycle evidence survives live Firestore button replacement', async () => {
  const [tenant, technician] = await Promise.all([
    read('tests/e2e/business-tenant.spec.ts'),
    read('tests/e2e/business-technician.spec.ts'),
  ]);

  for (const source of [tenant, technician]) {
    assert.match(source, /^\s*await target\.evaluate\(\(node: HTMLElement\) => node\.click\(\)\);\s*$/m);
    assert.match(source, /button:has-text\(\"Accept Mission\"\)/);
    assert.match(source, /button:has-text\(\"On The Way\"\)/);
    assert.match(source, /button:has-text\(\"Arrived\"\)/);
    assert.match(source, /page\.reload\(\{ waitUntil: 'domcontentloaded' \}\)/);
  }
  assert.doesNotMatch(tenant, /^\s*await target\.click\(\{ timeout: enabledTimeout \}\);/m);
});
