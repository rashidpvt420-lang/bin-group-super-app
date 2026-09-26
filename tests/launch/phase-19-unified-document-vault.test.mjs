import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('Phase 19 unified vault is server-authorized, App Check protected and ID-linked', async () => {
  const source = await read('functions/unifiedDocumentVault.ts');
  for (const token of [
    'enforceAppCheck: true',
    'listUnifiedDocumentVault',
    'getUnifiedDocumentFile',
    'artifactId: \`${collection}:${id}\`',
    'linkage: "SOURCE_COLLECTION_AND_ID"',
    'expires: Date.now() + 5 * 60 * 1000',
    'DOCUMENT_VAULT_FILE_ACCESSED',
  ]) assert.ok(source.includes(token), 'Missing unified-vault authority token: ' + token);
  assert.doesNotMatch(source, /03-09-2491/);
});

test('Phase 19 revalidates current Auth claims instead of trusting stale browser privilege', async () => {
  const source = await read('functions/unifiedDocumentVault.ts');
  assert.ok(source.includes('const user = await admin.auth().getUser(auth.uid)'));
  assert.ok(source.includes('const currentClaims = user.customClaims || {}'));
  assert.ok(source.includes('const role = roleOf(currentClaims)'));
  assert.ok(source.includes('currentClaims.admin === true'));
  assert.ok(!source.includes('token.admin === true || token.isAdmin === true'));
});

test('Phase 19 role inventory covers Owner Tenant Technician Broker private HR and Admin review domains', async () => {
  const source = await read('functions/unifiedDocumentVault.ts');
  for (const token of [
    'contracts: "contract"',
    'intake_submissions: "quote"',
    'invoices: "invoice"',
    'owner_property_reports: "property_report"',
    'propertyInspections: "inspection_report"',
    'tenantDocuments: "tenant_document"',
    'leases: "lease"',
    'brokerDocuments: "broker_compliance"',
    'staffDocuments: "staff_document"',
    'staffHrDocuments: "private_staff_document"',
    'pdf_reports: "staff_report"',
    'staffLetters: "staff_letter"',
    'maintenanceTickets: "work_evidence"',
  ]) assert.ok(source.includes(token), 'Missing role document domain: ' + token);
});

test('Phase 19 Owner app cannot register arbitrary external document URLs', async () => {
  const page = await read('apps/owner-app/src/pages/owner/OwnerDocumentsPage.tsx');
  assert.ok(page.includes('listUnifiedDocumentVault'));
  assert.ok(page.includes('getUnifiedDocumentFile'));
  assert.doesNotMatch(page, /Document URL Link/);
  assert.doesNotMatch(page, /storagePath:\s*['"]manual-link['"]/);
  assert.doesNotMatch(page, /addDoc\(collection\(db,\s*['"]documentLibrary['"]\)/);
  assert.doesNotMatch(page, /fileUrl/);
});

test('Phase 19 Broker vault persists Storage identity, not bearer download URLs', async () => {
  const page = await read('src/broker/pages/BrokerDocumentsPage.tsx');
  assert.ok(page.includes('storagePath: fileRef.fullPath'));
  assert.ok(page.includes('openUnifiedDocument'));
  assert.doesNotMatch(page, /getDownloadURL/);
  assert.doesNotMatch(page, /\bfileUrl\s*,/);
});

test('Phase 19 root Owner Tenant and Technician surfaces consume the unified vault', async () => {
  const [owner, tenant, technician] = await Promise.all([
    read('src/owner/pages/OwnerDocumentsPage.tsx'),
    read('src/tenant/pages/TenantDocumentsPage.tsx'),
    read('src/technician/pages/TechnicianHRPageV2.tsx'),
  ]);
  assert.ok(owner.includes('UnifiedDocumentVault'));
  assert.ok(tenant.includes('UnifiedDocumentVault'));
  assert.ok(technician.includes('Technician Document Vault'));
  assert.ok(technician.includes('assigned-job record IDs'));
});

test('Phase 19 Admin vault is live and role-authorized rather than hardcoded sample data', async () => {
  const page = await read('apps/admin-panel/src/pages/documents/InstitutionalDocumentVaultPage.tsx');
  assert.ok(page.includes('listUnifiedDocumentVault'));
  assert.ok(page.includes('getUnifiedDocumentFile'));
  assert.ok(page.includes('ROLE-AUTHORIZED REVIEW SURFACE'));
  assert.doesNotMatch(page, /Trade License 2026/);
  assert.doesNotMatch(page, /SIRA Security Certificate/);
  assert.doesNotMatch(page, /const complianceDocs = \[/);
});

test('Phase 19 private HR files remain browser-denied and are resolved only after callable authorization', async () => {
  const [storage, vault] = await Promise.all([
    read('storage.rules'),
    read('functions/unifiedDocumentVault.ts'),
  ]);
  assert.match(storage, /match \/privateHrDocuments\/\{staffId\}\/\{allPaths=\*\*\}[\s\S]*?allow read, write: if false;/);
  assert.ok(vault.includes('staffHrDocuments: "private_staff_document"'));
  assert.ok(vault.includes('bucket.file(artifact.storagePath)'));
  assert.ok(vault.includes('authorizeArtifact(actor, collectionName, sourceId)'));
});
