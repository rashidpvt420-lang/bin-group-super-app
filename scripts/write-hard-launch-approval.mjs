#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  PRODUCTION,
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  gitSha,
  readJsonSafe,
  sha256File,
} from './lib/launch-honesty.mjs';
import {
  AUTHORIZED_HARD_LAUNCH_ACTORS,
  HARD_LAUNCH_CONFIRMATION_PHRASE,
  hardLaunchApprovalPath,
  operationalReadinessPath,
  pilotIncidentReportPath,
  validateHardLaunchApprovalDocument,
  validateOperationalReadinessReport,
  validatePilotIncidentReport,
} from './lib/hard-launch-gate.mjs';

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const root = process.cwd();
const commitSha = gitSha(root);
const expectedSha = requireEnv('HARD_LAUNCH_EXPECTED_SHA');
const confirmation = requireEnv('HARD_LAUNCH_CONFIRMATION');
const actor = requireEnv('GITHUB_ACTOR');
const githubRef = requireEnv('GITHUB_REF');
const githubRepository = requireEnv('GITHUB_REPOSITORY');
const githubRunId = requireEnv('GITHUB_RUN_ID');

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Approval may only be generated in GitHub Actions');
if (githubRef !== 'refs/heads/main') throw new Error('Approval requires refs/heads/main');
if (githubRepository !== 'rashidpvt420-lang/bin-group-super-app') throw new Error('Unexpected GitHub repository');
if (!AUTHORIZED_HARD_LAUNCH_ACTORS.includes(actor)) throw new Error(`Unauthorized actor: ${actor}`);
if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('Expected SHA must be a full lowercase SHA');
if (commitSha !== expectedSha) throw new Error('Checked-out commit does not equal expected SHA');
if (confirmation !== HARD_LAUNCH_CONFIRMATION_PHRASE) throw new Error('Hard launch confirmation mismatch');

const evidenceFile = evidencePath(root);
const deploymentFile = deploymentEvidencePath(root);
const incidentFile = pilotIncidentReportPath(root);
const operationalFile = operationalReadinessPath(root);
const evidenceBatch = readJsonSafe(evidenceFile, { records: [] });
const deploymentDoc = readJsonSafe(deploymentFile, null);
const incidentReport = readJsonSafe(incidentFile, null);
const operationalReport = readJsonSafe(operationalFile, null);

const pilot = evaluatePilotEligibility({ evidenceBatch, deploymentDoc, commitSha, root });
const incidentErrors = validatePilotIncidentReport(incidentReport, commitSha);
const operationalErrors = validateOperationalReadinessReport(operationalReport, commitSha);
if (!pilot.pilotEligible || incidentErrors.length || operationalErrors.length) {
  console.error('[hard-launch-approval] FAIL — prerequisite evidence is not launch-clear');
  for (const key of pilot.missing) console.error(`- missing pilot evidence: ${key}`);
  for (const error of pilot.invalid) console.error(`- invalid pilot evidence: ${error}`);
  for (const error of incidentErrors) console.error(`- invalid pilot report: ${error}`);
  for (const error of operationalErrors) console.error(`- invalid operational proof: ${error}`);
  process.exit(1);
}

const approval = {
  schemaVersion: 1,
  status: 'approved',
  releaseDecision: 'HARD_PUBLIC_LAUNCH_PREREQUISITES_APPROVED',
  hardLaunchClaim: false,
  commitSha,
  deployedCommitSha: deploymentDoc.deployedCommitSha,
  projectId: PRODUCTION.projectId,
  mainUrl: PRODUCTION.mainUrl,
  adminUrl: PRODUCTION.adminUrl,
  founderApproval: true,
  confirmationVerified: true,
  pilotEligibleAtApproval: true,
  operationalReadinessAtApproval: true,
  noOpenP0P1: Number(incidentReport.openP0) === 0 && Number(incidentReport.openP1) === 0,
  rollbackPlanVerified: incidentReport.rollbackPlanVerified === true,
  monitoringVerified: incidentReport.monitoringVerified === true,
  deploymentHash: sha256File(deploymentFile),
  evidenceBatchHash: sha256File(evidenceFile),
  incidentReportHash: sha256File(incidentFile),
  operationalReadinessHash: sha256File(operationalFile),
  approvedBy: actor,
  approvedAt: new Date().toISOString(),
  generatedByWorkflow: true,
  source: 'hard-public-launch-clearance-workflow',
  githubRepository,
  githubRef,
  githubRunId,
  githubRunAttempt: String(process.env.GITHUB_RUN_ATTEMPT || '1'),
};

const output = hardLaunchApprovalPath(root);
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(approval, null, 2)}\n`);

const approvalErrors = validateHardLaunchApprovalDocument(approval, commitSha, { root });
if (approvalErrors.length) {
  console.error('[hard-launch-approval] FAIL — generated approval did not revalidate');
  for (const error of approvalErrors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[hard-launch-approval] PASS — wrote ${output}`);
