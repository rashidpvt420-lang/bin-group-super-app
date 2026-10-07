import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin Vendor and RFQ mutations are protected server-callable operations', async () => {
  const [vendorPage, rfqPage, backend, runtime] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/VendorCommandCenterPage.tsx'),
    read('apps/admin-panel/src/pages/admin/RfqTrustWorkflowPage.tsx'),
    read('functions/secureAdminProcurementTrust.ts'),
    read('functions/runtime.ts'),
  ]);

  for (const source of [vendorPage, rfqPage]) {
    assert.doesNotMatch(source, /\baddDoc\s*\(/);
    assert.doesNotMatch(source, /\bupdateDoc\s*\(/);
    assert.doesNotMatch(source, /\bdeleteDoc\s*\(/);
  }

  assert.match(vendorPage, /adminCreateVendorVerificationFile/);
  assert.match(vendorPage, /adminSetVendorVerificationStatus/);
  assert.match(rfqPage, /adminCreateVendorRfq/);
  assert.match(rfqPage, /adminAddVerifiedVendorQuote/);
  assert.match(rfqPage, /adminRequestRfqOwnerApproval/);

  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /sign_in_second_factor/);
  assert.match(backend, /multiFactor/);
  assert.match(backend, /Ticket and property do not match/);
  assert.match(backend, /Property and owner do not match/);
  assert.match(backend, /Only verified vendors can be quoted/);
  assert.match(backend, /already has a quote on this RFQ/);
  assert.match(backend, /RFQ requires \$\{minimumQuotes\} verified vendor quote\(s\)/);
  assert.match(backend, /ADMIN_CREATE_VENDOR_VERIFICATION_FILE/);
  assert.match(backend, /ADMIN_SET_VENDOR_STATUS/);
  assert.match(backend, /ADMIN_CREATE_VENDOR_RFQ/);
  assert.match(backend, /ADMIN_ADD_VERIFIED_VENDOR_QUOTE/);
  assert.match(backend, /ADMIN_REQUEST_RFQ_OWNER_APPROVAL/);
  assert.match(runtime, /export \* from "\.\/secureAdminProcurementTrust"/);
});

test('Firestore rules deny browser writes to procurement authority collections', async () => {
  const rules = await read('firestore.rules');

  for (const collection of ['vendor_rfqs', 'vendor_quotes', 'vendors']) {
    const start = rules.indexOf(`match /${collection}/{`);
    assert.notEqual(start, -1, `${collection} rules must exist`);
    const next = rules.indexOf('match /', start + 8);
    const block = rules.slice(start, next === -1 ? rules.length : next);
    assert.match(block, /allow read: if isAdmin\(\)/);
    assert.match(block, /allow create, update, delete: if false/);
  }

  const ownerStart = rules.indexOf('match /owner_approval_requests/{requestId}');
  const ownerEnd = rules.indexOf('match /maintenance_ledger/', ownerStart);
  const ownerBlock = rules.slice(ownerStart, ownerEnd);
  assert.match(ownerBlock, /allow create, update, delete: if false/);
});

test('Owner approval decision remains on its existing protected callable', async () => {
  const [ownerPage, ownerBackend] = await Promise.all([
    read('src/owner/pages/OwnerApprovalCenterPage.tsx'),
    read('functions/ownerTrustWorkflow.ts'),
  ]);

  assert.match(ownerPage, /submitOwnerApprovalDecision/);
  assert.doesNotMatch(ownerPage, /\bupdateDoc\s*\(/);
  assert.match(ownerBackend, /export const submitOwnerApprovalDecision = onCall/);
  assert.match(ownerBackend, /enforceAppCheck: true/);
});


test('RFQ creation requires the referenced Owner account to exist', async () => {
  const backend = await read('functions/secureAdminProcurementTrust.ts');
  assert.match(backend, /if \(!ownerSnap\.exists\) throw new HttpsError\("not-found", "Owner account not found\."\)/);
});
