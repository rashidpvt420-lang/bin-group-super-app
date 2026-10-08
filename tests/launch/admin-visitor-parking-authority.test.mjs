import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin visitor parking approval is server-authoritative and App Check protected', () => {
  const ui = read('apps/admin-panel/src/pages/ops/VisitorParkingPage.tsx');
  const functions = read('functions/qrSecurity.ts');

  assert.match(ui, /httpsCallable\(functions, 'reviewVisitorParkingRequest'\)/);
  assert.doesNotMatch(ui, /\bupdateDoc\s*\(/);
  assert.doesNotMatch(ui, /reviewedBy:\s*['"]admin-operator['"]/);

  assert.match(functions, /export const reviewVisitorParkingRequest = onCall\(\{ cors: true, enforceAppCheck: true \}/);
  assert.match(functions, /await requireAdmin\(request\.auth\)/);
  assert.match(functions, /current !== "pending"/);
  assert.match(functions, /ADMIN_VISITOR_PARKING_APPROVED/);
  assert.match(functions, /ADMIN_VISITOR_PARKING_REJECTED/);
  assert.match(functions, /transaction\.create\(auditRef/);
  assert.match(functions, /reviewedBy: actor\.uid/);
});
