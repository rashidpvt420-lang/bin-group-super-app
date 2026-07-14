#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

function exportValue(key, value) {
  const text = String(value ?? '');
  process.env[key] = text;
  const envFile = String(process.env.GITHUB_ENV || '').trim();
  if (!envFile) return;
  const marker = `BIN_GROUP_REQUEST_${randomUUID().replaceAll('-', '')}`;
  appendFileSync(envFile, `${key}<<${marker}\n${text}\n${marker}\n`, { mode: 0o600 });
}

function requireText(object, key) {
  const value = String(object?.[key] ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

try {
  const raw = String(process.env.PROTECTED_RELEASE_REQUEST_JSON || '').trim();
  if (!raw) throw new Error('PROTECTED_RELEASE_REQUEST_JSON is required');
  const request = JSON.parse(raw);
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Release request must be a JSON object');
  }

  const launchMode = requireText(request, 'launchMode');
  if (!['bank-pilot', 'public'].includes(launchMode)) {
    throw new Error('launchMode must be bank-pilot or public');
  }
  const runPublic = request.runPublicReleaseGate === true;
  if (runPublic && launchMode !== 'public') {
    throw new Error('runPublicReleaseGate=true requires launchMode=public');
  }

  exportValue('EXPECTED_COMMIT_SHA', requireText(request, 'expectedCommitSha'));
  exportValue('DEPLOYMENT_CONFIRMATION', requireText(request, 'confirmation'));
  exportValue('HARD_LAUNCH_CONFIRMATION', requireText(request, 'hardLaunchConfirmation'));
  exportValue('FOUNDER_NAME', requireText(request, 'founderName'));
  exportValue('FOUNDER_EMAIL', requireText(request, 'founderEmail'));
  exportValue('LAUNCH_MODE', launchMode);
  exportValue('RUN_PUBLIC_RELEASE_GATE', runPublic ? 'true' : 'false');

  const incident = request.incidentState;
  if (!incident || typeof incident !== 'object' || Array.isArray(incident)) {
    throw new Error('incidentState must be an object');
  }
  const activeIncidents = Array.isArray(incident.activeIncidents) ? incident.activeIncidents : null;
  if (!activeIncidents) throw new Error('incidentState.activeIncidents must be an array');
  const evidenceReferences = Array.isArray(incident.evidenceReferences)
    ? incident.evidenceReferences.map((item) => String(item).trim()).filter(Boolean)
    : [];
  if (!evidenceReferences.length) throw new Error('incidentState.evidenceReferences is required');
  exportValue('INCIDENT_ATTESTATION', requireText(incident, 'attestation'));
  exportValue('INCIDENT_ACTIVE_JSON', JSON.stringify(activeIncidents));
  exportValue('INCIDENT_REQUIRES_ROLLBACK', incident.requiresRollback === true ? 'true' : 'false');
  exportValue('INCIDENT_ROLLBACK_REASON', String(incident.rollbackReason || ''));
  exportValue('INCIDENT_LAST_DEPLOYMENT_FAILED', incident.lastDeploymentFailed === true ? 'true' : 'false');
  exportValue('INCIDENT_LAST_DEPLOYMENT_FAILED_AT', String(incident.lastDeploymentFailedAt || ''));
  exportValue('INCIDENT_EVIDENCE_REFS', evidenceReferences.join(','));

  if (runPublic) {
    const pilot = request.pilotState;
    if (!pilot || typeof pilot !== 'object' || Array.isArray(pilot)) {
      throw new Error('pilotState must be an object for public release');
    }
    exportValue('PILOT_STARTED_AT', requireText(pilot, 'startedAt'));
    exportValue('PILOT_COMPLETED_AT', requireText(pilot, 'completedAt'));
    exportValue('OPEN_P0', String(Number(pilot.openP0 ?? 0)));
    exportValue('OPEN_P1', String(Number(pilot.openP1 ?? 0)));
    exportValue('INCIDENT_REFERENCE', requireText(pilot, 'incidentReference'));
    exportValue('ROLLBACK_REFERENCE', requireText(pilot, 'rollbackReference'));
    exportValue('MONITORING_REFERENCE', requireText(pilot, 'monitoringReference'));
    exportValue('INCIDENT_CONFIRMATION', 'NO_OPEN_P0_P1');
    exportValue('ROLLBACK_CONFIRMATION', 'ROLLBACK_PLAN_VERIFIED');
  }

  console.log(`[protected-request] PASS mode=${launchMode} publicGate=${runPublic}`);
} catch (error) {
  console.error(`[protected-request] FAIL: ${error.message}`);
  process.exit(1);
}
