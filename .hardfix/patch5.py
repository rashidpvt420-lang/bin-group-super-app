from pathlib import Path

path = Path('test/hard-launch-gate.test.mjs')
source = path.read_text()
import_anchor = "import { validateOperationalProofDocument } from '../scripts/lib/operational-proof-schema.mjs';\n"
if "process.env.AUTHORIZED_FOUNDER_ACTORS" not in source:
    if import_anchor not in source:
        raise SystemExit('Missing test import anchor')
    source = source.replace(import_anchor, import_anchor + "\nprocess.env.AUTHORIZED_FOUNDER_ACTORS = 'rashidpvt420-lang';\n")
source = source.replace("incidentReference: 'ops-log-2026-07-12'", "incidentReference: 'https://github.com/rashidpvt420-lang/bin-group-super-app/issues/1'")
source = source.replace("rollbackReference: 'rollback-runbook-v1'", "rollbackReference: 'https://github.com/rashidpvt420-lang/bin-group-super-app/blob/main/README.md'")
source = source.replace("monitoringReference: 'monitoring-report-24h'", "monitoringReference: 'https://console.cloud.google.com/monitoring'")
start = source.index('function validOperational() {')
end = source.index('function validStripeSourceProof() {')
fixture = '''function validOperational() {
  const evidenceTypes = {
    ownerPaymentActivation: 'production-transaction',
    paymentUnlockExactlyOnce: 'production-transaction',
    tenantNotificationDelivery: 'production-transaction',
    technicianPhysicalGpsEvidence: 'physical-device-report',
    brokerCommissionLockExactlyOnce: 'production-transaction',
    adminStaffClaims: 'workflow-artifact',
    stripeLiveBilling: 'production-transaction',
    appCheckEnforcement: 'workflow-artifact',
    privilegedAccessRotation: 'secret-rotation-record',
    brandedEmailDelivery: 'workflow-artifact',
    renewalScheduler: 'scheduler-run',
  };
  const sourceSystems = {
    ownerPaymentActivation: 'Firebase payment activation transaction',
    paymentUnlockExactlyOnce: 'Firebase adminApprovePayment replay verifier',
    tenantNotificationDelivery: 'Firebase notificationDelivery FCM trigger',
    technicianPhysicalGpsEvidence: 'Firebase technician lifecycle, device binding and Cloud Storage',
    brokerCommissionLockExactlyOnce: 'Firebase broker commission transaction and payment replay',
    adminStaffClaims: 'Firebase Auth and staff registries',
    stripeLiveBilling: 'stripe-live-api-and-webhook',
    appCheckEnforcement: 'Firebase App Check enforcement',
    privilegedAccessRotation: 'Google Secret Manager and Firebase Authentication',
    brandedEmailDelivery: 'Postmark email delivery',
    renewalScheduler: 'Firebase contract renewal watcher',
  };
  const gates = {};
  REQUIRED_OPERATIONAL_GATES.forEach((key, index) => {
    const sourceRunId = String(654321 + index);
    gates[key] = {
      status: 'passed',
      commitSha,
      projectId: PRODUCTION.projectId,
      evidenceType: evidenceTypes[key],
      evidenceReference: `https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/${sourceRunId}#${key}`,
      artifactHash: (index + 1).toString(16).padStart(64, '0'),
      sourceProofHash: (index + 101).toString(16).padStart(64, '0'),
      sourceSystem: sourceSystems[key],
      observedAt: '2026-07-12T09:55:00.000Z',
      sourceWorkflowRunId: sourceRunId,
      workflowRunId: String(754321 + index),
      githubRepository: 'rashidpvt420-lang/bin-group-super-app',
      verifiedBy: 'workflow',
      verifiedAt: '2026-07-12T10:00:00.000Z',
    };
  });
  return {
    schemaVersion: 1,
    status: 'passed',
    commitSha,
    projectId: PRODUCTION.projectId,
    source: 'firestore-system-health-admin-summaries',
    sourceDocument: 'system_health/admin_summaries',
    gates,
    fetchedAt: '2026-07-12T10:30:00.000Z',
    generatedByWorkflow: true,
    githubRepository: 'rashidpvt420-lang/bin-group-super-app',
    githubRef: 'refs/heads/main',
    githubRunId: '123456',
  };
}

'''
source = source[:start] + fixture + source[end:]
source = source.replace(
    "  assert.match(workflow, /CURRENT_ACTOR[^\\n]*rashidpvt420-lang|rashidpvt420-lang[^\\n]*CURRENT_ACTOR/);",
    "  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS/);\n  assert.doesNotMatch(workflow, /CURRENT_ACTOR[^\\n]*!=[^\\n]*rashidpvt420-lang/);",
)
path.write_text(source)

package = Path('package.json')
source = package.read_text()
old = 'test/hard-launch-gate.test.mjs test/hard-launch-control.test.mjs'
new = 'test/hard-launch-gate.test.mjs test/hard-launch-validator-hardening.test.mjs test/hard-launch-control.test.mjs'
if old not in source:
    raise SystemExit('Missing package hard-launch test anchor')
package.write_text(source.replace(old, new))
