import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Tenant readiness requires explicit reviewed unit, lease and move-in states', async () => {
  const source = await read('src/tenant/components/TenantProfileReadinessCard.tsx');

  assert.match(source, /activeResidenceStatus/);
  assert.match(source, /unitLinkVerified === true/);
  assert.match(source, /leaseVerified === true/);
  assert.match(source, /approvedStatus\(item\.unitLinkStatus/);
  assert.match(source, /approvedStatus\(item\.leaseReviewStatus/);
  assert.doesNotMatch(source, /\|\| item\.tenantId === user\.uid/);
  assert.doesNotMatch(source, /\|\| item\.tenantUid === user\.uid/);
  assert.doesNotMatch(source, /item\.status \|\| 'ACTIVE'/);
  assert.doesNotMatch(
    source,
    /\['ACTIVE', 'APPROVED', 'VERIFIED'\]\.includes/,
    'A generic active lease state must not be treated as reviewed lease verification.',
  );
});
