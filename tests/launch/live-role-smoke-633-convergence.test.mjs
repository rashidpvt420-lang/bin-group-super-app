import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [ownerEvidence, technicianEvidence] = await Promise.all([
  readFile(new URL('../../src/owner/components/OwnerEvidenceSection.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/technician/components/TechnicianBeforeWorkEvidence.tsx', import.meta.url), 'utf8'),
]);

test('Owner dashboard converges server-created properties through owner-scoped live listeners', () => {
  assert.match(ownerEvidence, /collection\(db, 'properties'\)/);
  assert.match(ownerEvidence, /where\('ownerId', '==', user\.uid\)/);
  assert.match(ownerEvidence, /where\('ownerUid', '==', user\.uid\)/);
  assert.match(ownerEvidence, /onSnapshot\(/);
  assert.match(ownerEvidence, /liveProperties/);
  assert.match(ownerEvidence, /owner-live-property-portfolio/);
  assert.match(ownerEvidence, /property\.propertyName \|\| property\.name/);
  assert.doesNotMatch(ownerEvidence, /onSnapshot\(collection\(db, 'properties'\)/);
});

test('Technician verified signal waits for Firestore proof convergence after protected callable success', () => {
  assert.match(technicianEvidence, /await submitEvidence\(\{ ticketId, storagePath, downloadUrl \}\);/);
  assert.match(technicianEvidence, /setAwaitingProofConvergence\(true\)/);
  assert.match(technicianEvidence, /if \(!awaitingProofConvergence \|\| !existingProof\) return;/);
  assert.match(technicianEvidence, /requestAnimationFrame/);
  assert.match(technicianEvidence, /setSuccess\('Before-work site evidence verified/);

  const callableIndex = technicianEvidence.indexOf('await submitEvidence({ ticketId, storagePath, downloadUrl });');
  const pendingIndex = technicianEvidence.indexOf('setAwaitingProofConvergence(true);', callableIndex);
  const successIndex = technicianEvidence.indexOf("setSuccess('Before-work site evidence verified");
  assert.ok(callableIndex >= 0 && pendingIndex > callableIndex, 'Proof convergence wait must begin only after callable success.');
  assert.ok(successIndex >= 0 && successIndex < callableIndex, 'Success rendering must live in the Firestore-convergence effect, not directly after the callable.');
});
