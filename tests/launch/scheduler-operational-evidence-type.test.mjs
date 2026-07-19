import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTION } from '../../scripts/lib/launch-honesty.mjs';
import { REQUIRED_OPERATIONAL_GATES, validateOperationalReadinessReport } from '../../scripts/lib/hard-launch-gate.mjs';

const commitSha = 'a'.repeat(40);
const now = Date.parse('2026-07-19T12:00:00.000Z');

const report = () => ({
  schemaVersion: 1,
  status: 'passed',
  commitSha,
  projectId: PRODUCTION.projectId,
  source: 'firestore-system-health-admin-summaries',
  generatedByWorkflow: true,
  githubRepository: 'rashidpvt420-lang/bin-group-super-app',
  githubRef: 'refs/heads/main',
  githubRunId: '123456',
  gates: Object.fromEntries(REQUIRED_OPERATIONAL_GATES.map((key) => [key, {
    status: 'passed',
    commitSha,
    projectId: PRODUCTION.projectId,
    evidenceType: key === 'renewalScheduler'
      ? 'scheduler-run'
      : key === 'technicianPhysicalGpsEvidence'
        ? 'physical-device-report'
        : 'workflow-artifact',
    evidenceReference: `github-actions://rashidpvt420-lang/bin-group-super-app/runs/654321/artifacts/${key}`,
    artifactHash: 'b'.repeat(64),
    sourceProofHash: 'c'.repeat(64),
    sourceSystem: 'protected-source-workflow',
    observedAt: '2026-07-19T10:00:00.000Z',
    sourceWorkflowRunId: '654321',
    workflowRunId: '123456',
    verifiedBy: 'workflow',
    verifiedAt: '2026-07-19T10:05:00.000Z',
  }])),
});

test('renewal scheduler proof accepts scheduler-run evidence', () => {
  assert.deepEqual(validateOperationalReadinessReport(report(), commitSha, { now }), []);
});

test('unknown evidence classifications remain rejected', () => {
  const invalid = report();
  invalid.gates.renewalScheduler.evidenceType = 'manual-attestation';
  assert.ok(validateOperationalReadinessReport(invalid, commitSha, { now }).includes('renewalScheduler.evidenceType is not accepted'));
});
