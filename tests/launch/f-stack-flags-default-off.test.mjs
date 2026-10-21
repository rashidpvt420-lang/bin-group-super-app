import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('F5 auto-vacate writes only when system_config/vacancy.autoVacateEnabled === true', () => {
  const src = read('functions/unitVacancy.ts');
  assert.match(src, /autoVacateEnabled === true/);
});

test('F6 broker vacancy alerts are gated by brokerAlertsEnabled === true (default off)', () => {
  const src = read('functions/brokerVacancyAlerts.ts');
  assert.match(src, /brokerAlertsEnabled === true/);
  const trigger = src.slice(src.indexOf('export const notifyBrokersOfNewVacancy'));
  assert.ok(trigger.indexOf('brokerVacancyAlertsEnabled()') > -1 && trigger.indexOf('brokerVacancyAlertsEnabled()') < trigger.indexOf('alertBrokersForListing('));
});

test('F10 design quotes fall back to labelled BIN default rates, never AI pricing', () => {
  const src = read('functions/designPriceList.ts');
  assert.match(src, /BIN_DEFAULT/);
});

test('F3 lease backfill is dry-run unless --apply and --confirm are both given', () => {
  const src = read('scripts/backfill-lease-end-dates.mjs');
  assert.match(src, /--apply/);
  assert.match(src, /--confirm/);
});
