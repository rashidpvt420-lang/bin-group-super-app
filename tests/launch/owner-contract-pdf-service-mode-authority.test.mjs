import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('functions/pdfEngine.ts', 'utf8');
const selection = readFileSync('functions/ownerServiceSelection.ts', 'utf8');

test('owner contract PDF recognizes canonical BOTH as combined service', () => {
  for (const token of ["both: 'MAINTENANCE_AND_PROPERTY_MANAGEMENT'", "total_care: 'MAINTENANCE_AND_PROPERTY_MANAGEMENT'", "maintenance_and_property_management: 'MAINTENANCE_AND_PROPERTY_MANAGEMENT'", "fm_only: 'MAINTENANCE_ONLY'", "pm_only: 'PROPERTY_MANAGEMENT_ONLY'"]) {
    assert.ok(selection.includes(token), token);
  }
});

test('owner contract PDF keeps three distinct service scopes', () => {
  assert.match(selection, /'MAINTENANCE_ONLY' \| 'PROPERTY_MANAGEMENT_ONLY' \| 'MAINTENANCE_AND_PROPERTY_MANAGEMENT'/);
  assert.match(source, /PROPERTY_MANAGEMENT_ONLY/);
  assert.match(source, /MAINTENANCE_AND_PROPERTY_MANAGEMENT/);
  assert.match(source, /if \(serviceSelection\.maintenance\) renderMaintenanceSchedule\(doc\);/);
  assert.match(source, /if \(serviceSelection\.propertyManagement\) renderPropertyManagementSchedule\(doc\);/);
});

test('owner agreement is driven only by the strict stored selection (no silent default)', () => {
  assert.ok(!source.includes('function normalizeContractMode'), 'fuzzy mode guessing must not return');
  assert.ok(source.includes('const serviceSelection = resolveOwnerServiceSelection(data);'));
  assert.ok(selection.includes('No service selection is recorded on this contract'));
  assert.ok(selection.includes('Inconsistent service selection'));
  assert.ok(!/return\s+'MAINTENANCE_ONLY'/.test(selection), 'resolver must not default to maintenance');
});

test('services-selected table, not-provided statement and written-amendment rule are in EN and AR', () => {
  for (const token of ["'4. Services Selected', 'الخدمات المختارة'", 'NOT SELECTED - NOT PROVIDED', 'is not provided under this Agreement', 'has no obligation or liability in respect of it', 'written amendment signed by both Parties', 'لا تتحمل BIN-GROUPS أي التزام أو مسؤولية', 'بملحق كتابي موقع من الطرفين']) {
    assert.ok(source.includes(token), token);
  }
});

test('property management schedule keeps placeholders, CASH/CHEQUE only and Ejari/Tawtheeq', () => {
  for (const token of ['[OWNER APPROVAL THRESHOLD]', '[EMERGENCY LIMIT]', 'only by CASH or CHEQUE', 'Ejari in Dubai, Tawtheeq in Abu Dhabi', '[RESPONSIBLE PARTY]', '[HANDBACK PERIOD]']) {
    assert.ok(source.includes(token), token);
  }
});

test('maintenance response times come from slaPolicy, not invented in the PDF', () => {
  assert.ok(selection.includes("import { CANONICAL_FUNCTIONS_SLA_MINUTES } from './slaPolicy';"));
  assert.ok(source.includes('maintenanceResponseTargets()'));
});

test('signed PDF and contract record carry the selection and its hash', () => {
  const admin = readFileSync('functions/adminOwnerOperations.ts', 'utf8');
  const index = readFileSync('functions/index.ts', 'utf8');
  assert.ok(source.includes('serviceSelectionHash, version: AGREEMENT_VERSION'), 'selection hash is part of the document hash');
  assert.ok(source.includes('resolve({ ...artifact, serviceSelection, serviceSelectionHash })'));
  for (const src of [admin, index]) {
    assert.ok(src.includes('canonicalServiceSelection:'));
    assert.ok(src.includes('canonicalServiceSelectionHash:'));
  }
  assert.ok(admin.includes('resolveOwnerServiceSelection({ ...contract, planName: contract.packageName })'), 'signing rejects bad selection before taking the lease');
});

test('licensing gate for property management agreements defaults ON', () => {
  assert.ok(selection.includes("env.OWNER_PM_AGREEMENTS_ENABLED ?? 'true'"));
});
