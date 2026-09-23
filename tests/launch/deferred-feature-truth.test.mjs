import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const staffFlags = read('src/config/staffFeatureFlags.ts');
const wpsScope = read('docs/WPS_MOHRE_INTEGRATION_SCOPE.md');
const audit = read('FULL_APP_AUDIT_REPORT.md');

const deferredStaffFlags = [
  'ENABLE_ORG_CHART_TREE',
  'ENABLE_PROBATION_CARD',
  'ENABLE_CAREER_TRANSITIONS',
  'ENABLE_SHIFT_SWAP_MODAL',
  'ENABLE_ACTING_MANAGER_DRAWER',
  'ENABLE_SUPPLIERS_PORTAL',
  'ENABLE_RECRUITMENT_PIPELINE',
  'ENABLE_CANDIDATE_MESSAGING',
];

test('incomplete Staff OS modules remain explicitly disabled for production', () => {
  for (const flag of deferredStaffFlags) {
    assert.ok(
      staffFlags.includes(`${flag}: false`),
      `${flag} must remain disabled until the module is implemented and tested`,
    );
  }
});

test('WPS launch truth cannot claim a live SIF or bank-routing integration before it exists', () => {
  assert.match(wpsScope, /SCOPING ONLY\s*[—-]\s*not yet built/i);
  assert.match(wpsScope, /No SIF-file generation or bank routing exists in the codebase today/i);
  assert.match(audit, /SCOPED, NOT A LIVE WPS INTEGRATION/i);
  assert.match(audit, /does \*\*not\*\* currently generate production Salary Information Files \(SIF\)/i);
  assert.doesNotMatch(audit, /WPS[\s\S]{0,300}\*\*FULLY COMPLIANT\*\*/i);
});

test('audit truth remains fail-closed while protected Technician physical evidence is outstanding', () => {
  assert.match(audit, /Hard-public-launch status:\*\* \*\*NO-GO/i);
  assert.match(audit, /Technician physical-device\/GPS evidence gate passes/i);
  assert.doesNotMatch(audit, /Launch Clearance Check:\*\* `Passed`/i);
});