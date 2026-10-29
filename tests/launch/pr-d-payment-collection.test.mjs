import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('collection callables require MFA finance admin + App Check and accept only cash/cheque', () => {
  const src = read('functions/paymentCollectionRecords.ts');
  assert.match(src, /financeRecordPaymentCollection = onCall\(\{[^}]*enforceAppCheck: true/);
  assert.match(src, /financeVoidPaymentCollection = onCall\(\{[^}]*enforceAppCheck: true/);
  assert.equal((src.match(/await requireMfaFinanceAdminActor\(request\)/g) || []).length, 2);
  assert.match(src, /COLLECTION_METHODS = \["cash", "cheque"\] as const/);
  assert.match(src, /tx\.create\(recordRef/);
  assert.doesNotMatch(src, /recordRef\.(update|set|delete)\(/);
});

test('records, voids and audit are immutable from every client, including the admin catch-all', () => {
  const rules = read('firestore.rules');
  for (const name of ['payment_collection_records', 'payment_collection_voids', 'payment_collection_audit']) {
    assert.match(rules, new RegExp(`match /${name}/\\{\\w+\\} \\{[^}]*allow create, update, delete: if false;`));
    assert.equal((rules.match(new RegExp(`'${name}'`, 'g')) || []).length, 2, `${name} excluded from admin catch-all create and update/delete`);
  }
  const storage = read('storage.rules');
  assert.match(storage, /match \/payment-collections\/\{payerUid\}\/\{allPaths=\*\*\} \{\s*allow read: if isAuth\(\) && \(request\.auth\.uid == payerUid \|\| isAdmin\(\)\);\s*allow write: if false;/);
  assert.match(storage, /collection != 'payment-collections'/);
});

test('payer dashboards show the finance-collected card; finance form is in the admin terminal', () => {
  for (const p of ['owner/pages/OwnerSimpleDashboardPage', 'tenant/pages/TenantSimpleDashboardPage', 'technician/pages/TechnicianSimpleDashboardPage', 'broker/pages/BrokerSimpleDashboardPage']) {
    assert.match(read(`src/${p}.tsx`), /<PaymentCollectionRecordsCard \/>/, p);
  }
  assert.match(read('src/components/PaymentCollectionRecordsCard.tsx'), /Paid – collected by finance/);
  assert.match(read('src/admin/AdminTerminal.tsx'), /<AdminPaymentCollectionPage \/>/);
  assert.match(read('src/admin/AdminPaymentCollectionPage.tsx'), /'financeRecordPaymentCollection'/);
});
