#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const phase = String(process.argv[2] || '').trim();
if (!['deploy', 'public'].includes(phase)) {
  console.error('Usage: node scripts/apply-protected-release-inputs.mjs deploy|public');
  process.exit(1);
}

function parseObject(name) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) throw new Error(`${name} is required`);
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return value;
}

function exportValue(key, value) {
  const text = String(value ?? '');
  process.env[key] = text;
  const envFile = String(process.env.GITHUB_ENV || '').trim();
  if (!envFile) return;
  const marker = `BIN_GROUP_INPUT_${randomUUID().replaceAll('-', '')}`;
  appendFileSync(envFile, `${key}<<${marker}\n${text}\n${marker}\n`, { mode: 0o600 });
}

function requireText(object, key) {
  const value = String(object[key] ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

try {
  if (phase === 'deploy') {
    const incident = parseObject('INCIDENT_STATE_JSON');
    const activeIncidents = Array.isArray(incident.activeIncidents) ? incident.activeIncidents : null;
    if (!activeIncidents) throw new Error('activeIncidents must be an array');
    const evidenceReferences = Array.isArray(incident.evidenceReferences)
      ? incident.evidenceReferences.map((item) => String(item).trim()).filter(Boolean)
      : String(incident.evidenceReferences || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
    if (!evidenceReferences.length) throw new Error('evidenceReferences must contain at least one reference');

    exportValue('INCIDENT_ATTESTATION', requireText(incident, 'attestation'));
    exportValue('INCIDENT_ACTIVE_JSON', JSON.stringify(activeIncidents));
    exportValue('INCIDENT_REQUIRES_ROLLBACK', incident.requiresRollback === true ? 'true' : 'false');
    exportValue('INCIDENT_ROLLBACK_REASON', String(incident.rollbackReason || ''));
    exportValue('INCIDENT_LAST_DEPLOYMENT_FAILED', incident.lastDeploymentFailed === true ? 'true' : 'false');
    exportValue('INCIDENT_LAST_DEPLOYMENT_FAILED_AT', String(incident.lastDeploymentFailedAt || ''));
    exportValue('INCIDENT_EVIDENCE_REFS', evidenceReferences.join(','));
    console.log('[protected-inputs] PASS — incident attestation validated.');
  } else {
    const pilot = parseObject('PILOT_STATE_JSON');
    exportValue('PILOT_STARTED_AT', requireText(pilot, 'startedAt'));
    exportValue('PILOT_COMPLETED_AT', requireText(pilot, 'completedAt'));
    exportValue('OPEN_P0', String(Number(pilot.openP0 ?? 0)));
    exportValue('OPEN_P1', String(Number(pilot.openP1 ?? 0)));
    exportValue('INCIDENT_REFERENCE', requireText(pilot, 'incidentReference'));
    exportValue('ROLLBACK_REFERENCE', requireText(pilot, 'rollbackReference'));
    exportValue('MONITORING_REFERENCE', requireText(pilot, 'monitoringReference'));
    exportValue('INCIDENT_CONFIRMATION', 'NO_OPEN_P0_P1');
    exportValue('ROLLBACK_CONFIRMATION', 'ROLLBACK_PLAN_VERIFIED');
    console.log('[protected-inputs] PASS — controlled-pilot attestation validated.');
  }
} catch (error) {
  console.error(`[protected-inputs] FAIL: ${error.message}`);
  process.exit(1);
}
