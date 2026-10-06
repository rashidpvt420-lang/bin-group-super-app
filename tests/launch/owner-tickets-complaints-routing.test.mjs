import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const ownerApp = read('../../src/owner/OwnerApp.tsx');
const dashboard = read('../../src/owner/pages/OwnerDashboardResolvedPage.tsx');
const ticketsPage = read('../../src/owner/pages/OwnerTicketsPage.tsx');
const ticketDetail = read('../../src/owner/pages/OwnerTicketDetailPage.tsx');

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

test('OwnerApp also registers absolute /owner ticket paths so hard loads cannot miss nested splat context', () => {
  for (const route of ['/owner/tickets', '/owner/ticket/:id', '/owner/complaints', '/owner/complaint']) {
    assert.match(
      ownerApp,
      new RegExp(`<Route path="${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
      `missing absolute route ${route}`,
    );
  }
  assert.match(ownerApp, /element=\{<OwnerTicketsPage/);
  assert.match(ownerApp, /element=\{<OwnerTicketDetailPage/);
});

test('Complaints plural is an honest tickets list route, not a dead-end redirect', () => {
  assert.match(
    ownerApp,
    /path="\/complaints"\s+element=\{<OwnerTicketsPage/,
  );
  assert.match(
    ownerApp,
    /path="\/owner\/complaints"\s+element=\{<OwnerTicketsPage/,
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
