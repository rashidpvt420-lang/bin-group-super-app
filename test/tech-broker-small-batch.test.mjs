import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SLA_RESPONSE_WINDOW_MS, computeSlaCountdown, formatSlaClock, resolveSlaDeadline,
} from '../src/technician/utils/slaCountdown.ts';
import {
  createSlaBreachNotifications, slaBreachNotificationId, buildSlaBreachNotification, SLA_BREACH_NOTIFICATION_TYPE,
} from '../functions/slaBreachNotification.ts';
import { arabicStatusLabel, formatStatusLabel, AR_CODE_LABELS } from '../src/theme/statusColors.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const HOUR = 3600 * 1000;
const T0 = Date.UTC(2026, 9, 28, 6, 0, 0);

// ── Technician SLA countdown ────────────────────────────────────────────────
test('SLA response window equals the window the SLA cron flags breaches on', async () => {
  const cron = await read('functions/slaCron.ts');
  const match = cron.match(/SLA_BREACH_AFTER_MS\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/);
  assert.ok(match, 'SLA_BREACH_AFTER_MS must stay a plain product so the client countdown can match it');
  assert.equal(match.slice(1).reduce((a, b) => a * Number(b), 1), SLA_RESPONSE_WINDOW_MS);
});

test('countdown is green, amber, then red as the deadline approaches and passes', () => {
  const job = { status: 'ASSIGNED', createdAt: T0 };
  assert.equal(computeSlaCountdown(job, T0 + 2 * HOUR).state, 'green');
  assert.equal(computeSlaCountdown(job, T0 + 19 * HOUR).state, 'amber'); // 5h left of 24h
  assert.equal(computeSlaCountdown(job, T0 + 24 * HOUR).state, 'red'); // exactly at breach
  const late = computeSlaCountdown(job, T0 + 25 * HOUR + 5 * 60 * 1000);
  assert.equal(late.state, 'red');
  assert.equal(late.clock, 'Overdue 1h 05m');
});

test('an explicit ticket deadline wins over the response-window fallback, which is labelled as such', () => {
  const explicit = computeSlaCountdown({ status: 'ASSIGNED', createdAt: T0, slaDeadline: T0 + 4 * HOUR }, T0 + HOUR);
  assert.equal(explicit.source, 'ticket');
  assert.equal(explicit.remainingMs, 3 * HOUR);
  assert.equal(explicit.clock, '3h 00m 00s');
  const fallback = computeSlaCountdown({ status: 'OPEN', createdAt: T0 }, T0 + HOUR);
  assert.equal(fallback.source, 'response-window');
  assert.equal(fallback.deadlineMs, T0 + SLA_RESPONSE_WINDOW_MS);
});

test('no deadline is invented: finished or deadline-less tickets show none', () => {
  assert.equal(computeSlaCountdown({ status: 'COMPLETED', createdAt: T0 }, T0 + HOUR).state, 'none');
  assert.equal(computeSlaCountdown({ status: 'IN_PROGRESS', createdAt: T0 }, T0 + HOUR).state, 'none');
  assert.equal(computeSlaCountdown({ status: 'ASSIGNED' }, T0).state, 'none');
  assert.equal(computeSlaCountdown(null, T0).state, 'none');
  assert.deepEqual(resolveSlaDeadline(undefined), { deadlineMs: null, startMs: null, source: 'none' });
});

test('countdown reads Firestore-style timestamps', () => {
  const job = { status: 'ASSIGNED', createdAt: { toMillis: () => T0 } };
  assert.equal(computeSlaCountdown(job, T0 + HOUR).deadlineMs, T0 + SLA_RESPONSE_WINDOW_MS);
  assert.equal(computeSlaCountdown({ status: 'ASSIGNED', createdAt: { seconds: T0 / 1000 } }, T0).deadlineMs, T0 + SLA_RESPONSE_WINDOW_MS);
  assert.equal(formatSlaClock(12 * 60 * 1000 + 40 * 1000), '12m 40s');
});

test('Jobs page renders the live countdown on each job card, and the component ticks and cleans up', async () => {
  const page = await read('src/technician/pages/TechnicianJobsPage.tsx');
  assert.match(page, /<TechnicianSlaCountdown job=\{job\} \/>/);
  const component = await read('src/technician/components/TechnicianSlaCountdown.tsx');
  assert.match(component, /setInterval\(/);
  assert.match(component, /clearInterval\(/);
  assert.match(component, /data-testid="technician-sla-countdown"/);
});

// ── Broker referral link, copy button, QR ───────────────────────────────────
test('broker attribution card shows the referral link with Copy and a real QR code', async () => {
  const card = await read('src/components/BrokerAttributionQuickStartCard.tsx');
  assert.match(card, /import \{ QRCodeSVG \} from 'qrcode\.react'/);
  assert.match(card, /<QRCodeSVG value=\{referralUrl\}/);
  assert.match(card, /navigator\.clipboard\.writeText\(referralUrl\)/);
  assert.match(card, /data-testid="broker-referral-share"/);
  assert.match(card, /\{referralUrl \? \(/, 'the block renders only when a real referral link exists');
  const live = await read('src/broker/components/BrokerLiveAttributionCard.tsx');
  assert.match(live, /referralUrl=\{signals\.referralUrl\}/);
});

// ── SLA breach notification to Admin ────────────────────────────────────────
function fakeDb({ failFor } = {}) {
  const docs = new Map();
  return {
    docs,
    collection: (name) => ({
      doc: (id) => ({
        create: async (data) => {
          if (failFor && id.endsWith(failFor)) throw Object.assign(new Error('boom'), { code: 14 });
          const path = `${name}/${id}`;
          if (docs.has(path)) throw Object.assign(new Error('6 ALREADY_EXISTS: Document already exists'), { code: 6 });
          docs.set(path, data);
        },
      }),
    }),
  };
}

test('SLA breach notification ids are deterministic per ticket and admin', () => {
  assert.equal(slaBreachNotificationId('T1', 'adminA'), slaBreachNotificationId('T1', 'adminA'));
  assert.notEqual(slaBreachNotificationId('T1', 'adminA'), slaBreachNotificationId('T1', 'adminB'));
  assert.notEqual(slaBreachNotificationId('T1', 'adminA'), slaBreachNotificationId('T2', 'adminA'));
});

test('SLA breach notifications are created once per admin and survive retries without duplicating', async () => {
  const db = fakeDb();
  const params = { db, ticketId: 'ticket-12345678', ticket: { category: 'Plumbing', propertyName: 'Tower A', unitNumber: '12' }, adminIds: ['a1', 'a2', 'a1'], createdAt: 'TS', breachWindowHours: 24 };
  assert.equal(await createSlaBreachNotifications(params), 2);
  assert.equal(await createSlaBreachNotifications(params), 0, 'a retry creates nothing new');
  assert.equal(db.docs.size, 2);
  const doc = db.docs.get(`notifications/${slaBreachNotificationId('ticket-12345678', 'a1')}`);
  assert.equal(doc.type, SLA_BREACH_NOTIFICATION_TYPE);
  assert.equal(doc.recipientId, 'a1');
  assert.equal(doc.recipientRole, 'admin');
  assert.equal(doc.read, false);
  assert.equal(doc.ticketId, 'ticket-12345678');
  assert.match(doc.body, /#TICKET-1 /);
  assert.match(doc.link, /ticketId=ticket-12345678/);
});

test('a partial fan-out failure throws, and a retry completes the missing admins only', async () => {
  const flaky = fakeDb({ failFor: 'a2' });
  const params = { db: flaky, ticketId: 'T9', ticket: {}, adminIds: ['a1', 'a2'], createdAt: 'TS', breachWindowHours: 24 };
  await assert.rejects(() => createSlaBreachNotifications(params), /boom/);
  assert.equal(flaky.docs.size, 1);
  const second = fakeDb();
  second.docs.set(`notifications/${slaBreachNotificationId('T9', 'a1')}`, {});
  assert.equal(await createSlaBreachNotifications({ ...params, db: second }), 1);
});

test('buildSlaBreachNotification never invents location data and bounds user text', () => {
  const doc = buildSlaBreachNotification({ ticketId: 'abc', ticket: { category: 'x'.repeat(500) }, recipientId: 'r', createdAt: 'TS', breachWindowHours: 24 });
  assert.ok(doc.body.length < 400);
  assert.match(doc.body, /the property/);
  assert.equal(doc.deliverySource, 'server:slaCron');
});

test('SLA cron notifies before flagging, retries on failure, and does not re-page flagged tickets', async () => {
  const cron = await read('functions/slaCron.ts');
  const notify = cron.indexOf('createSlaBreachNotifications({');
  const flag = cron.indexOf('await doc.ref.update(update)');
  assert.ok(notify > 0 && flag > notify, 'notification is written before the ticket is flagged');
  assert.match(cron, /data\.slaViolated !== true && !data\.slaBreachNotifiedAt/);
  assert.match(cron, /continue;/, 'a failed notification leaves the ticket unflagged so the next run retries');
  assert.match(cron, /adminRecipientIds\(db\)/);
  const trigger = await read('functions/notificationDelivery.ts');
  assert.match(trigger, /onDocumentCreated/, 'delivery still rides the existing notifications trigger');
});

// ── Arabic ──────────────────────────────────────────────────────────────────
test('EN and AR dictionaries have identical key sets with no duplicates', async () => {
  const src = await read('src/context/LanguageContext.tsx');
  const enStart = src.indexOf('    en: {');
  const arStart = src.indexOf('    ar: {');
  const keysOf = (block) => [...block.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]);
  const en = keysOf(src.slice(enStart, arStart));
  const ar = keysOf(src.slice(arStart));
  assert.equal(new Set(en).size, en.length, 'duplicate EN keys');
  assert.equal(new Set(ar).size, ar.length, 'duplicate AR keys');
  assert.deepEqual([...en].sort(), [...ar].sort());
});

test('every dictionary-only key used on technician and broker screens exists in both languages', async () => {
  const src = await read('src/context/LanguageContext.tsx');
  const keys = new Set([...src.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]));
  const files = [
    'src/technician/pages/TechnicianJobsPage.tsx', 'src/technician/pages/TechnicianJobDetailPage.tsx',
    'src/technician/components/TechnicianDutyAvailabilityCard.tsx', 'src/technician/components/TechnicianSlaCountdown.tsx',
    'src/broker/pages/BrokerDashboardPage.tsx', 'src/broker/components/BrokerPageFrame.tsx',
  ];
  const missing = [];
  for (const file of files) {
    const text = await read(file);
    for (const m of text.matchAll(/\b(?:tx|t)\(\s*'([A-Za-z0-9_.]+)'\s*(?:,\s*'(?:[^'\\]|\\.)*')?\s*\)/g)) {
      if (!keys.has(m[1])) missing.push(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('Arabic status labels cover ticket lifecycle codes and fall back to English when unknown', () => {
  assert.equal(arabicStatusLabel('in_progress'), 'قيد التنفيذ');
  assert.equal(arabicStatusLabel('EN ROUTE'), 'في الطريق');
  assert.equal(formatStatusLabel('CALL_FIRST', 'ar'), 'اتصل قبل الزيارة');
  assert.equal(formatStatusLabel('CALL_FIRST'), 'Call before visiting', 'English default is unchanged');
  assert.equal(formatStatusLabel('SOME_NEW_STATE', 'ar'), 'Some new state', 'no invented Arabic for unknown codes');
  assert.equal(arabicStatusLabel(''), null);
  for (const [code, label] of Object.entries(AR_CODE_LABELS)) assert.match(label, /[\u0600-\u06FF]/, code);
});
