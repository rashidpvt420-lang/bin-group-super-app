import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('Tenant requests route emergencies and persist canonical SLA values', () => {
  const page = read('src/tenant/pages/TenantRequestPage.tsx');
  const operations = read('functions/tenantTicketOperations.ts');
  assert.match(page, /kind: priority === 'emergency' \? 'EMERGENCY' : 'AI_CONCIERGE'/);
  assert.match(page, /clientRequestIdRef\.current = '';/);
  assert.match(operations, /return priority === "emergency" \? 30 : priority === "urgent" \? 120 : 480;/);
  assert.match(operations, /slaMinutes: tenantSlaMinutes\("emergency"\)/);
  assert.match(operations, /slaMinutes: tenantSlaMinutes\(priority\)/);
});

test('photo previews and Technician completion evidence remain policy-safe', () => {
  const page = read('src/tenant/pages/TenantRequestPage.tsx');
  const service = read('src/lib/ticketSystemService.ts');
  assert.match(page, /const previewUrlsRef = useRef<string\[\]>\(\[\]\)/);
  assert.match(page, /previewUrlsRef\.current = previews/);
  assert.match(page, /previewUrlsRef\.current\.forEach\(\(url\) => URL\.revokeObjectURL\(url\)\)/);
  assert.doesNotMatch(page, /previews\.forEach\(\(url\) => URL\.revokeObjectURL\(url\)\);\n    }, \[previews\]\)/);
  assert.doesNotMatch(service, /proofUpdate\.photos = photoUrls/);
  for (const field of ['proofPhotos', 'completionPhotos', 'afterPhotos', 'afterPhotoUrl']) {
    assert.match(service, new RegExp(`proofUpdate\\.${field}`));
  }
});

test('launch rule contracts prepare isolated rule copies', () => {
  const fiveProfile = read('test/five-profile-audit-guards.test.mjs');
  const propertyGeo = read('tests/launch/property-geo-authority.test.mjs');
  assert.match(fiveProfile, /preparedTicketRules\(\)/);
  assert.match(fiveProfile, /mkdtempSync/);
  assert.match(propertyGeo, /preparedPropertyRules\(\)/);
  assert.match(propertyGeo, /harden-property-geo-authority\.mjs/);
});
