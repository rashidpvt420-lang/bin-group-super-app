import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner Property Operations Intelligence joins authenticated owner data sources', async () => {
  const [engine, panel, ownerPage, home] = await Promise.all([
    read('src/utils/propertyOperationsIntelligence.ts'),
    read('src/components/PropertyOperationsIntelligencePanel.tsx'),
    read('src/owner/pages/OwnerAIIntelligencePage.tsx'),
    read('src/owner/pages/OwnerSimpleDashboardPage.tsx'),
  ]);
  assert.match(engine, /passportCoveredProperties/);
  assert.match(engine, /resolvePropertyHealth/);
  assert.match(engine, /portfolioHealthScore/);
  assert.match(engine, /urgentOpenWorkOrders/);
  assert.match(engine, /verifiedPaidInvoiceAed/);
  assert.match(engine, /propertyIds\.has\(propertyId\)/);
  assert.match(engine, /outstandingActionCount/);
  assert.match(panel, /BIN GROUP PROPERTY OPERATIONS INTELLIGENCE/);
  assert.match(panel, /RECORD-BASED PORTFOLIO HEALTH/);
  assert.match(panel, /not a cash-flow forecast/);
  assert.match(panel, /capped at 250/);
  assert.match(ownerPage, /PropertyOperationsIntelligencePanel/);
  assert.match(ownerPage, /maintenanceTickets/);
  assert.match(ownerPage, /where\('ownerUid', '==', user\.uid\)/);
  assert.match(home, /Property operations intelligence/);
  assert.match(home, /\/owner\/ai-intelligence/);
});

test('maintenance pattern signals are dated, property-linked, and do not fabricate probabilities', async () => {
  const engine = await read('src/utils/predictiveIntelligence.ts');
  const page = await read('src/owner/pages/OwnerAIIntelligencePage.tsx');
  assert.match(engine, /THREE_DATED_WORK_ORDERS_IN_12_MONTHS/);
  assert.match(engine, /if \(!propertyId/);
  assert.match(engine, /healthIndex: null/);
  assert.match(engine, /probability: null/);
  assert.doesNotMatch(engine, /0\.85|0\.40|0\.15|92%|75/);
  assert.match(page, /No forecast is shown until/);
  assert.match(page, /NOT YET AVAILABLE/);
  assert.doesNotMatch(page, /expectedNetROI/);
});

test('legacy predictive engine does not present invented ROI, income, or expense values', async () => {
  const engine = await read('src/utils/predictiveIntelligence.ts');
  assert.doesNotMatch(engine, /expectedNetROI:\s*7\.8/);
  assert.doesNotMatch(engine, /projectedIncome:\s*45000/);
  assert.doesNotMatch(engine, /Portfolio showing 92% stability index/);
  assert.match(engine, /NOT_AVAILABLE/);
  assert.match(engine, /complete, dated and reconciled financial schedule/);
});

test('standalone Owner bundle consumes the advisory callable as text, not a fake prediction payload', async () => {
  const [engine, page, feed, history] = await Promise.all([
    read('apps/owner-app/src/utils/predictiveIntelligence.ts'),
    read('apps/owner-app/src/pages/DashboardPage.tsx'),
    read('apps/owner-app/src/components/MissionGuidanceFeed.tsx'),
    read('apps/owner-app/src/utils/portfolioAggregationEngine.ts'),
  ]);
  assert.doesNotMatch(engine, /expectedNetROI:\s*7\.8|projectedIncome:\s*45000|0\.85|0\.40|92%/);
  assert.match(engine, /THREE_DATED_WORK_ORDERS_IN_12_MONTHS/);
  assert.match(page, /advisoryGuidance:/);
  assert.doesNotMatch(page, /result\.data as MissionGuidancePayload/);
  assert.match(page, /NOT VALIDATED/);
  assert.match(page, /NOT AVAILABLE/);
  assert.match(feed, /evidenceStatus\.replace/);
  assert.doesNotMatch(feed, /predictedDecay12Months/);
  assert.doesNotMatch(history, /\|\| 1500|\|\| 'A'|\|\| 'DUBAI'/);
});
