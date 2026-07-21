import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('technician physical evidence is protected, canonical and requires real mobile, GPS, geofence and Storage proof', async () => {
  const [workflow, verifier, publisher] = await Promise.all([
    read('.github/workflows/technician-physical-evidence.yml'),
    read('scripts/verify-technician-physical-evidence.mjs'),
    read('scripts/publish-direct-operational-proof.mjs'),
  ]);

  assert.match(workflow, /^name:\s*Technician Physical Evidence/m);
  assert.match(workflow, /^\s{2}verify-physical-evidence:/m);
  assert.match(workflow, /environment:\s*hard-launch-operations/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS:\s*\$\{\{ secrets\.AUTHORIZED_FOUNDER_ACTORS \}\}/);
  assert.match(workflow, /allowed_actors/);
  assert.match(workflow, /VERIFY_TECHNICIAN_PHYSICAL_EVIDENCE/);
  assert.match(workflow, /expected_commit_sha.*GITHUB_SHA/s);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /verify-technician-physical-evidence\.mjs/);
  assert.match(workflow, /Publish canonical technician operational evidence/);
  assert.match(workflow, /publish-direct-operational-proof\.mjs/);
  assert.match(workflow, /path:\s*launch_package\/operational-proof\.json/);

  assert.match(verifier, /gateKey:\s*'technicianPhysicalGpsEvidence'/);
  assert.match(verifier, /evidenceType:\s*'physical-device-report'/);
  assert.match(verifier, /sourceSystem:\s*'Firebase technician physical device GPS lifecycle and Cloud Storage'/);
  assert.match(verifier, /requireAuthorizedApprover\(process\.env\.GITHUB_ACTOR\)/);
  assert.doesNotMatch(verifier, /GITHUB_ACTOR !== 'rashidpvt420-lang'/);
  assert.match(verifier, /physicalDeviceBound === true/);
  assert.match(verifier, /arrivalInstallationHash/);
  assert.match(verifier, /registeredInstallationHash/);
  assert.match(verifier, /gpsVerified === true/);
  assert.match(verifier, /MAX_GPS_ACCURACY_METERS = 100/);
  assert.match(verifier, /MAX_PROPERTY_DISTANCE_METERS = 500/);
  assert.match(verifier, /haversineMeters/);
  assert.match(verifier, /bucket\.getFiles\(\{ prefix: 'maintenanceTickets\/'/);
  assert.match(verifier, /storedObjectNames\.has\(objectPath\)/);
  assert.doesNotMatch(verifier, /bucket\.file\(objectPath\)/);
  assert.match(verifier, /beforePhotoStored:\s*true/);
  assert.match(verifier, /afterPhotoStored:\s*true/);
  assert.match(publisher, /'Technician Physical Evidence'/);
  assert.match(publisher, /gateKey:\s*'technicianPhysicalGpsEvidence'/);
  assert.match(publisher, /evidenceType:\s*'physical-device-report'/);
  assert.doesNotMatch(`${workflow}\n${verifier}\n${publisher}`, /ticket_id:|technician_id:|founder_attested|manual pass|waiv/i);
});

test('privileged rotation evidence uses fixed provider endpoints, protected actor configuration and revoked previous credentials', async () => {
  const [workflow, verifier, publisher] = await Promise.all([
    read('.github/workflows/privileged-access-rotation-evidence.yml'),
    read('scripts/verify-privileged-access-rotation.mjs'),
    read('scripts/publish-direct-operational-proof.mjs'),
  ]);

  assert.match(workflow, /^name:\s*Privileged Access Rotation Evidence/m);
  assert.match(workflow, /^\s{2}verify-rotation:/m);
  assert.match(workflow, /environment:\s*hard-launch-operations/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS:\s*\$\{\{ secrets\.AUTHORIZED_FOUNDER_ACTORS \}\}/);
  assert.match(workflow, /allowed_actors/);
  assert.match(workflow, /VERIFY_PRIVILEGED_ACCESS_ROTATION/);
  assert.match(workflow, /expected_commit_sha.*GITHUB_SHA/s);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /verify-privileged-access-rotation\.mjs/);
  assert.match(workflow, /Publish canonical privileged-rotation evidence/);
  assert.match(workflow, /publish-direct-operational-proof\.mjs/);
  assert.match(workflow, /path:\s*launch_package\/operational-proof\.json/);

  assert.match(verifier, /gateKey:\s*'privilegedAccessRotation'/);
  assert.match(verifier, /evidenceType:\s*'secret-rotation-record'/);
  assert.match(verifier, /requireAuthorizedApprover\(process\.env\.GITHUB_ACTOR\)/);
  assert.doesNotMatch(verifier, /GITHUB_ACTOR !== 'rashidpvt420-lang'/);
  assert.match(verifier, /secrets\/STRIPE_SECRET_KEY\/versions\?pageSize=100/);
  assert.match(verifier, /secrets\/STRIPE_WEBHOOK_SECRET\/versions\?pageSize=100/);
  assert.match(verifier, /secrets\/SMTP_PASS\/versions\?pageSize=100/);
  assert.doesNotMatch(verifier, /request\(\{ url: secret\.url/);
  assert.match(verifier, /\['DISABLED', 'DESTROYED'\]/);
  assert.match(verifier, /tokensValidAfterTime/);
  assert.match(verifier, /security_rotation_records/);
  assert.match(verifier, /passwordRotated !== true/);
  assert.match(verifier, /refreshTokensRevoked !== true/);
  assert.match(verifier, /previousCredentialsRevoked:\s*true/);
  assert.match(publisher, /'Privileged Access Rotation Evidence'/);
  assert.match(publisher, /gateKey:\s*'privilegedAccessRotation'/);
  assert.match(publisher, /evidenceType:\s*'secret-rotation-record'/);
  assert.doesNotMatch(`${workflow}\n${verifier}\n${publisher}`, /secret_name:|admin_uid:|founder_attested|manual pass|waiv/i);
});

test('direct operational publisher validates semantics and writes the complete canonical readiness record', async () => {
  const publisher = await read('scripts/publish-direct-operational-proof.mjs');

  assert.match(publisher, /requireAuthorizedApprover\(process\.env\.GITHUB_ACTOR\)/);
  assert.match(publisher, /validateOperationalProofDocument\(proof/);
  assert.match(publisher, /sha256File\(PROOF_PATH\)/);
  assert.match(publisher, /sourceProofHash/);
  assert.match(publisher, /evidenceReference = `https:\/\/github\.com\/\$\{EXPECTED_REPOSITORY\}\/actions\/runs\/\$\{runId\}#\$\{context\.gateKey\}`/);
  assert.match(publisher, /githubRepository:\s*EXPECTED_REPOSITORY/);
  assert.match(publisher, /verifiedBy:\s*'workflow'/);
  assert.match(publisher, /verifiedAt:\s*admin\.firestore\.FieldValue\.serverTimestamp\(\)/);
  assert.match(publisher, /operationalEvidence/);
  assert.match(publisher, /operationalEvidenceCommitSha/);
  assert.match(publisher, /canonical Firestore read-back verification failed/);
  assert.doesNotMatch(publisher, /Operational Proof Intake|founder_attested|waiv|manual pass/i);
});
