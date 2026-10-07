import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/tenant/components/TenantSmartHomeStatus.tsx', 'utf8');

test('tenant tracker does not treat initial tenant fault evidence as completed work proof', () => {
  assert.doesNotMatch(source, /evidenceStatus === 'TENANT_EVIDENCE_UPLOADED'/);
  assert.match(source, /technicianAfterEvidenceState === 'CONFIRMED'/);
  assert.match(source, /technicianAfterPhotoUrl/);
  assert.match(source, /technicianAfterPhotos/);
  assert.match(source, /completionPhotos/);
  assert.match(source, /\['COMPLETED', 'CLOSED'\]/);
});
