from pathlib import Path

schema = Path('scripts/lib/operational-proof-schema.mjs')
source = schema.read_text()
source = source.replace(
    "const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;\n",
    """const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const OPERATIONAL_GATE_EVIDENCE_TYPES = Object.freeze({
  ownerPaymentActivation: new Set(['production-transaction']),
  paymentUnlockExactlyOnce: new Set(['production-transaction']),
  tenantNotificationDelivery: new Set(['production-transaction', 'workflow-artifact']),
  technicianPhysicalGpsEvidence: new Set(['physical-device-report']),
  brokerCommissionLockExactlyOnce: new Set(['production-transaction']),
  adminStaffClaims: new Set(['workflow-artifact', 'provider-console-export']),
  stripeLiveBilling: new Set(['production-transaction', 'provider-console-export']),
  appCheckEnforcement: new Set(['provider-console-export', 'workflow-artifact']),
  privilegedAccessRotation: new Set(['secret-rotation-record']),
  brandedEmailDelivery: new Set(['provider-console-export', 'workflow-artifact']),
  renewalScheduler: new Set(['scheduler-run']),
});

const SOURCE_SYSTEM_PATTERNS = Object.freeze({
  ownerPaymentActivation: [/firebase.*payment.*activation/i],
  paymentUnlockExactlyOnce: [/firebase.*adminapprovepayment.*replay/i],
  tenantNotificationDelivery: [/firebase.*notification.*fcm/i, /email.*delivery/i],
  technicianPhysicalGpsEvidence: [/firebase.*technician.*device.*storage/i, /physical.*device.*gps/i],
  brokerCommissionLockExactlyOnce: [/firebase.*broker.*commission.*replay/i],
  adminStaffClaims: [/firebase.*auth.*staff/i],
  stripeLiveBilling: [/stripe/i],
  appCheckEnforcement: [/firebase.*app\\s*check/i, /app\\s*check.*firebase/i],
  privilegedAccessRotation: [/google.*secret.*firebase.*authentication/i, /secret.*rotation/i],
  brandedEmailDelivery: [/email|mail|postmark|sendgrid|smtp/i],
  renewalScheduler: [/firebase.*renewal.*watcher/i, /cloud.*scheduler/i],
});
""",
)
source = source.replace(
    """function requiredOne(errors, doc, field) {
  if (Number(doc?.[field]) !== 1) errors.push(`${field} must equal 1`);
}
""",
    """function requiredOne(errors, doc, field) {
  if (Number(doc?.[field]) !== 1) errors.push(`${field} must equal 1`);
}

function validateEvidenceType(errors, gateKey, evidenceType) {
  const allowed = OPERATIONAL_GATE_EVIDENCE_TYPES[gateKey];
  if (!allowed || !allowed.has(String(evidenceType || ''))) {
    errors.push(`evidenceType is not accepted for ${gateKey || '(missing gate)'}`);
  }
}

function validateSourceSystem(errors, gateKey, sourceSystem) {
  const value = String(sourceSystem || '').trim();
  if (!value) {
    errors.push('sourceSystem is required');
    return;
  }
  const patterns = SOURCE_SYSTEM_PATTERNS[gateKey] || [];
  if (!patterns.some((pattern) => pattern.test(value))) {
    errors.push(`sourceSystem is not accepted for ${gateKey || '(missing gate)'}`);
  }
}
""",
)
source = source.replace(
    """  if (doc.evidenceType !== evidenceType) errors.push('evidenceType mismatch');
  if (doc.commitSha !== commitSha) errors.push('commitSha mismatch');
  if (doc.projectId !== PRODUCTION.projectId) errors.push(`projectId must be ${PRODUCTION.projectId}`);
  if (String(doc.sourceRunId || '') !== String(sourceRunId || '')) errors.push('sourceRunId mismatch');
  requiredString(errors, doc, 'sourceSystem');
""",
    """  if (doc.evidenceType !== evidenceType) errors.push('evidenceType mismatch');
  validateEvidenceType(errors, gateKey, evidenceType);
  if (doc.commitSha !== commitSha) errors.push('commitSha mismatch');
  if (doc.projectId !== PRODUCTION.projectId) errors.push(`projectId must be ${PRODUCTION.projectId}`);
  if (!/^\\d+$/.test(String(sourceRunId || ''))) errors.push('sourceRunId must be numeric');
  if (String(doc.sourceRunId || '') !== String(sourceRunId || '')) errors.push('sourceRunId mismatch');
  validateSourceSystem(errors, gateKey, doc.sourceSystem);
""",
)
schema.write_text(source)

path = Path('scripts/verify-launch-gate-live.mjs')
source = path.read_text()
source = source.replace(
    "import { AUTHORIZED_HARD_LAUNCH_ACTORS, REQUIRED_OPERATIONAL_GATES } from './lib/hard-launch-gate.mjs';\nimport { validateOperationalProofDocument } from './lib/operational-proof-schema.mjs';",
    "import { REQUIRED_OPERATIONAL_GATES } from './lib/hard-launch-gate.mjs';\nimport { requireAuthorizedApprover } from './lib/authorized-approvers.mjs';\nimport { OPERATIONAL_GATE_EVIDENCE_TYPES, validateOperationalProofDocument } from './lib/operational-proof-schema.mjs';",
)
start = source.index('const allowedEvidenceTypes = new Set([')
end = source.index('\n\nfunction fail', start)
source = source[:start] + source[end + 2:]
source = source.replace(
    "if (!AUTHORIZED_HARD_LAUNCH_ACTORS.includes(String(process.env.GITHUB_ACTOR || ''))) fail('Unauthorized workflow actor.');",
    "try { requireAuthorizedApprover(process.env.GITHUB_ACTOR); } catch (error) { fail(error.message); }",
)
source = source.replace(
    "if (!allowedEvidenceTypes.has(evidenceType)) fail(`Unsupported evidence type: ${evidenceType}`);",
    "if (!OPERATIONAL_GATE_EVIDENCE_TYPES[gateKey]?.has(evidenceType)) fail(`Unsupported evidence type ${evidenceType} for ${gateKey}.`);",
)
old = """if (!/^github-actions:\/\/rashidpvt420-lang\/bin-group-super-app\/runs\/\\d+\/artifacts\/[A-Za-z0-9._-]{1,128}$/.test(evidenceReference)) {
  fail('Evidence reference must identify a verified same-repository GitHub Actions artifact.');
}
if (!evidenceReference.includes(`/runs/${sourceRunId}/artifacts/${sourceArtifactName}`)) {
  fail('Evidence reference does not match the verified source run and artifact.');
}
"""
new = """const evidenceUrl = new URL(evidenceReference);
if (evidenceUrl.protocol !== 'https:' || evidenceUrl.hostname !== 'github.com') {
  fail('Evidence reference must use HTTPS on github.com.');
}
if (evidenceUrl.pathname !== `/rashidpvt420-lang/bin-group-super-app/actions/runs/${sourceRunId}`) {
  fail('Evidence reference does not match the verified same-repository source run.');
}
if (evidenceUrl.hash !== `#artifact-${sourceArtifactName}`) {
  fail('Evidence reference does not identify the verified source artifact.');
}
"""
if old not in source:
    raise SystemExit('Missing evidence-reference patch anchor')
source = source.replace(old, new)
source = source.replace("  verifiedBy: 'workflow',", "  githubRepository: process.env.GITHUB_REPOSITORY,\n  verifiedBy: 'workflow',")
path.write_text(source)
