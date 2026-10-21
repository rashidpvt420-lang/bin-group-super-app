import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('owner home shows real F9 KPIs instead of "Soon" placeholders', () => {
  const page = read('src/owner/pages/OwnerSimpleDashboardPage.tsx');
  assert.match(page, /<OwnerKpiTiles onNavigate=\{navigate\} \/>/);
  assert.doesNotMatch(page, /<ComingSoon|owner\.home\.soon/);
  assert.match(page, /owner-command-counts-failed/);
});

test('tenant home shows the F1 rent schedule and building notices, no coming-soon rent card', () => {
  const page = read('src/tenant/pages/TenantSimpleDashboardPage.tsx');
  assert.match(page, /<TenantHomeSummary onNavigate=\{navigate\} only=\{\['rent', 'notices'\]\} \/>/);
  assert.doesNotMatch(page, /<ComingSoon|tenant\.home\.rentSoon/);
  const summary = read('src/tenant/components/TenantHomeSummary.tsx');
  for (const s of ['home', 'rent', 'ticket', 'notices']) assert.ok(summary.includes(`show('${s}')`), s);
});

test('broker home lists the broker\'s own F6 vacancy alerts with empty and error states', () => {
  const page = read('src/broker/pages/BrokerSimpleDashboardPage.tsx');
  assert.match(page, /<BrokerVacancyAlertsCard /);
  assert.doesNotMatch(page, /<ComingSoon/);
  const card = read('src/broker/components/BrokerVacancyAlertsCard.tsx');
  assert.match(card, /where\('userId', '==', user\.uid\)/);
  assert.match(card, /where\('type', '==', 'BROKER_VACANCY_ALERT'\)/);
  assert.match(card, /<EmptyState/);
  assert.match(card, /<ErrorState/);
  assert.doesNotMatch(card, /orderBy/); // no new composite index
});
