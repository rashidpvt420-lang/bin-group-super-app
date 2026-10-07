import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const store = readFileSync('src/store/onboardingStore.ts', 'utf8');
const commercial = readFileSync('src/components/onboarding/CommercialTermsStep.tsx', 'utf8');

test('portfolio summary keeps separate maintenance and property-management annual totals', () => {
  assert.match(store, /maintenanceAnnualTotal:\s*number/);
  assert.match(store, /propertyManagementAnnualTotal:\s*number/);
  assert.match(store, /strategy:\s*'fm_only'/);
  assert.match(store, /strategy:\s*'pm_only'/);
  assert.match(store, /maintenanceAnnualTotal \+=/);
  assert.match(store, /propertyManagementAnnualTotal \+=/);
});

test('combined Owner quotation visibly explains both commercial components', () => {
  assert.match(commercial, /Maintenance annual subtotal/);
  assert.match(commercial, /Property management annual fee/);
  assert.match(commercial, /Combined annual total/);
  assert.match(commercial, /maintenanceAnnualTotal > 0 && propertyManagementAnnualTotal > 0/);
});
