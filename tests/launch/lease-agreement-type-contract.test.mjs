import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(p, 'utf8');

test('lease agreements record GOVERNMENT (Ejari/Tawtheeq) or PRIVATE with required dates', async () => {
  const [mod, all, dialog, page] = await Promise.all([
    read('functions/leaseAgreements.ts'), read('functions/runtimeAll.ts'),
    read('src/owner/components/OwnerTenancyAgreementDialog.tsx'), read('src/owner/pages/OwnerUnitRegistryPage.tsx'),
  ]);
  assert.match(all, /export \{ ownerRecordLeaseAgreement \} from '\.\/leaseAgreements'/);
  assert.match(mod, /if \(e === "dubai"\) return "EJARI"/);
  assert.match(mod, /e === "abudhabi" \|\| e === "alain"\) return "TAWTHEEQ"/);
  assert.match(mod, /Lease start and end dates \(YYYY-MM-DD\) are required/);
  assert.match(mod, /enforceAppCheck: true/);
  assert.match(mod, /endDate: agreement\.endDate/); // feeds runContractRenewalWatch
  assert.match(dialog, /owners\/\$\{user\.uid\}\/tenancy-registrations\//);
  assert.match(page, /<OwnerTenancyAgreementDialog open/);
});
