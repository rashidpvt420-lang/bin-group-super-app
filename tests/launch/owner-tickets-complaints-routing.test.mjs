import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const ownerApp = read('../../src/owner/OwnerApp.tsx');
const dashboard = read('../../src/owner/pages/OwnerDashboardResolvedPage.tsx');
const ticketsPage = read('../../src/owner/pages/OwnerTicketsPage.tsx');
const ticketDetail = read('../../src/owner/pages/OwnerTicketDetailPage.tsx');
const hardLaunch = read('../../tests/e2e/hard-launch-routes.spec.ts');

test('OwnerApp registers tickets list and ticket detail ahead of the unknown-route catch-all', () => {
  const catchAllAt = ownerApp.indexOf('<Route path="*"');
  assert.ok(catchAllAt > 0, 'catch-all must remain for unknown owner paths');

  for (const route of ['/tickets', '/ticket/:id', '/complaints', '/complaint']) {
    const needle = `<Route path="${route}"`;
    const at = ownerApp.indexOf(needle);
    assert.ok(at > 0, `missing route ${route}`);
    assert.ok(at < catchAllAt, `${route} must be declared before the * → dashboard redirect`);
  }
});

test('OwnerApp does not register /owner/* paths that invent /owner/owner/* inventory rows', () => {
  assert.doesNotMatch(ownerApp, /path="\/owner\/tickets"/);
  assert.doesNotMatch(ownerApp, /path="\/owner\/complaints"/);
  assert.doesNotMatch(ownerApp, /path="\/owner\/ticket\/:id"/);
  assert.doesNotMatch(ownerApp, /path="\/owner\/complaint"/);
});

test('Phase 2 exact-route audit lists /owner/complaints with tickets', () => {
  const ownerBlock = hardLaunch.slice(
    hardLaunch.indexOf("name: 'Owner'"),
    hardLaunch.indexOf("name: 'Tenant'"),
  );
  assert.match(ownerBlock, /'\/owner\/complaints'/);
  assert.match(ownerBlock, /'\/owner\/tickets'/);
  assert.match(ownerBlock, /'\/owner\/ticket\/phase2-missing'/);
});

test('Complaints plural is an honest tickets list route, not a dead-end redirect', () => {
  assert.match(
    ownerApp,
    /path="\/complaints"\s+element=\{<OwnerTicketsPage/,
  );
  assert.doesNotMatch(
    ownerApp,
    /path="\/complaints"\s+element=\{<Navigate/,
  );
});

test('full dashboard Complaints button navigates to working tickets UI', () => {
  assert.match(dashboard, /data-testid="owner-dashboard-complaints"/);
  assert.match(
    dashboard,
    /data-testid="owner-dashboard-complaints"[^>]*onClick=\{\(\) => navigate\('\/owner\/tickets'\)\}/,
  );
  assert.doesNotMatch(
    dashboard,
    /data-testid="owner-dashboard-complaints"[^>]*scrollToObject\('complaints-command-center'\)/,
  );
});

test('tickets list and detail pages keep owners inside ticket routes', () => {
  assert.match(ticketsPage, /navigate\(`\/owner\/ticket\/\$\{ticket\.id\}`\)/);
  assert.match(ticketsPage, /navigate\('\/owner\/complaint'\)/);
  assert.match(ticketDetail, /navigate\('\/owner\/tickets'\)/);
  assert.doesNotMatch(ticketsPage, /navigate\('\/owner\/dashboard'\)/);
  assert.doesNotMatch(ticketDetail, /navigate\('\/owner\/dashboard'\)/);
});
