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
  assert.match(
    technicianEvidence,
    /React\.useEffect\(\(\) => \{\s*if \(!awaitingProofConvergence \|\| !existingProof\) return;[\s\S]*?setSuccess\('Before-work site evidence verified[\s\S]*?\}, \[awaitingProofConvergence, existingProof\]\);/,
  );

  const callableMarker = 'await submitEvidence({ ticketId, storagePath, downloadUrl });';
  const callableIndex = technicianEvidence.indexOf(callableMarker);
  assert.ok(callableIndex >= 0, 'Protected before-work evidence callable must remain present.');

  const callableBlock = technicianEvidence.slice(callableIndex, technicianEvidence.indexOf('} catch', callableIndex));
  assert.match(
    callableBlock,
    /await submitEvidence\(\{ ticketId, storagePath, downloadUrl \}\);\s*setAwaitingProofConvergence\(true\);/,
    'Proof convergence wait must begin only after protected callable success.',
  );
  assert.doesNotMatch(
    callableBlock,
    /setSuccess\('Before-work site evidence verified/,
    'Callable success must not directly signal Start Work readiness before Firestore convergence.',
  );
});
