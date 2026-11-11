import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const FORBIDDEN = [
  'will be on the way soon',
  'on the way soon',
  '5 mins away',
  '5 min away',
  'click here to pay',
  'pay now',
  'payment link',
  'pay link',
  'within 2 hours',
  'within 24 hours',
];

function ASSIGNMENT_SNIPPET(source) {
  const at = source.indexOf('notifyRequester("Technician Assigned');
  return at >= 0 ? source.slice(at, at + 400) : '';
}

function assertNoForbidden(source, label) {
  const lower = source.toLowerCase();
  for (const phrase of FORBIDDEN) {
    assert.ok(!lower.includes(phrase), `${label} must not contain "${phrase}"`);
  }
}

test('the Owner/Tenant WhatsApp card stays honest until templates are approved', () => {
  const card = read('src/components/WhatsAppJobUpdatesCard.tsx');
  assert.match(card, /getWhatsAppJobUpdatesStatus/);
  assert.match(card, /comingSoon/);
  assert.match(card, /WhatsApp updates are coming soon/);
  assert.match(card, /تحديثات واتساب قريبًا/);
  assert.match(card, /The app stays the official record/);
  assert.match(card, /التطبيق يبقى السجل الرسمي/);
  assert.match(card, /No WhatsApp messages are being sent yet/);
  assert.match(card, /لا تُرسل رسائل واتساب حتى الآن/);
  assert.match(card, /you can switch this off at any time/i);
  assert.doesNotMatch(card, /\blive\b/i);
  assert.doesNotMatch(card, /Status messages only: submitted, technician assigned/);
});

test('template admin callable is MFA-gated, App Check enforced, and Admin/CEO only', () => {
  const source = read('functions/whatsappJobStatusNotifications.ts');
  assert.match(source, /export const adminUpsertWhatsAppTemplate = onCall\(\{ cors: true, region: "europe-west3", enforceAppCheck: true \}/);
  const start = source.indexOf('export const adminUpsertWhatsAppTemplate');
  const head = source.slice(start, start + 700);
  assert.match(head, /await requirePrivilegedMfaSession\(request\.auth\);/);
  assert.match(source, /Only Admin or CEO with MFA/);
  assert.match(source, /WHATSAPP_TEMPLATE_UPSERT/);
});

test('outbound locale mapping defaults to ar and en_US and is configurable per template', () => {
  const policy = read('functions/whatsappPolicy.ts');
  const send = read('functions/whatsappJobStatusNotifications.ts');
  assert.match(policy, /en: "en_US"/);
  assert.match(policy, /ar: "ar"/);
  assert.match(send, /resolveWhatsAppLanguageCode\(opt\.language, tpl\)/);
  assert.doesNotMatch(send, /const lang = opt\.language === "ar" \? "ar" : "en";/);
});

test('rate limits and Dubai quiet hours exist, with an emergency exception', () => {
  const policy = read('functions/whatsappPolicy.ts');
  const send = read('functions/whatsappJobStatusNotifications.ts');
  const hook = read('functions/whatsappWebhook.ts');
  assert.match(policy, /OUTBOUND_DAILY_LIMIT = 8/);
  assert.match(policy, /INBOUND_DAILY_LIMIT = 20/);
  assert.match(policy, /QUIET_HOUR_START = 22/);
  assert.match(policy, /timeZone: DUBAI_TIME_ZONE/);
  assert.match(send, /SKIPPED_QUIET_HOURS/);
  assert.match(send, /SKIPPED_RATE_LIMITED/);
  assert.match(hook, /claimRateLimit\(db, "in"/);
  assert.match(policy, /isEmergencyTicket/);
});

test('phase-1 template bodies and the communication matrix have no ETA or pay-link wording', () => {
  const policy = read('functions/whatsappPolicy.ts');
  const doc = read('docs/WHATSAPP_PHASE1_TEMPLATES.md');
  const matrix = read('COMMUNICATION_MATRIX.md');
  const index = read('functions/index.ts');
  const bodies = [...policy.matchAll(/bodyEn: "([^"]+)"/g), ...policy.matchAll(/bodyAr: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(bodies.length >= 12, 'expected EN and AR bodies for six templates');
  for (const body of bodies) assertNoForbidden(body, body);
  assertNoForbidden(ASSIGNMENT_SNIPPET(index), 'assignment copy');
  assert.doesNotMatch(matrix, /Click here to pay/);
  assert.doesNotMatch(matrix, /5 mins away/);
  assert.doesNotMatch(index, /will be on the way soon/);
  assert.match(matrix, /not sending/);
  assert.match(matrix, /Cash or Cheque only|cash or cheque only/);
  assert.match(doc, /Pay by cash or cheque only/);
  assert.match(index, /You will get an update when they set off/);
  assert.doesNotMatch(policy, /\bWhatsApp is live\b/i);
  assert.doesNotMatch(doc, /\bWhatsApp is live\b/i);
  assert.doesNotMatch(matrix, /\bWhatsApp is live\b/i);
});

test('rent, lease and spend notifications set recipientId so push can send', () => {
  const rent = read('functions/rentSchedule.ts');
  const lease = read('functions/leaseRenewals.ts');
  const spend = read('functions/ownerSpendingLimits.ts');
  const delivery = read('functions/notificationDelivery.ts');
  assert.match(rent, /recipientId: tenantUid/);
  assert.match(rent, /notifyJobEvent\(`\$\{doc\.id\}_\$\{plan\.key\}`, "RENT_DUE_REMINDER"/);
  assert.match(lease, /recipientId: userId/);
  assert.match(spend, /recipientId: ownerId/);
  assert.match(delivery, /data\.recipientId \|\| data\.userId/);
});

test('inbound auto-ack is bilingual and makes no response-time promise, and errors log a code only', () => {
  const hook = read('functions/whatsappWebhook.ts');
  const policy = read('functions/whatsappPolicy.ts');
  const ackAt = policy.indexOf('export function inboundAckMessage');
  const ack = policy.slice(ackAt, ackAt + 900);
  assert.match(hook, /inboundAckMessage\(persisted\.category, persisted\.intakeId\)/);
  assert.match(ack, /Our team will review it/);
  assert.match(ack, /سيراجعه الفريق/);
  assert.doesNotMatch(ack, /within \d+ hours/);
  assert.doesNotMatch(hook, /errorText/);
  assert.match(hook, /console\.error\("WhatsApp send failed", \{ status: response\.status, code \}\)/);
});

test('the leftover WhatsApp bot webhook is removed', () => {
  assert.equal(existsSync(new URL('../../functions/whatsappBot.ts', import.meta.url)), false);
  const runtime = read('functions/runtimeAll.ts');
  assert.doesNotMatch(runtime, /whatsappBot/);
});

test('the Admin templates page is locked to Admin/CEO with MFA and is bilingual', () => {
  const page = read('apps/admin-panel/src/pages/admin/WhatsAppTemplatesPage.tsx');
  const nav = read('apps/admin-panel/src/components/Navigation.tsx');
  const policy = read('apps/admin-panel/src/security/staffAccessPolicy.ts');
  assert.match(page, /adminUpsertWhatsAppTemplate/);
  assert.match(page, /Only Admin or CEO with a verified MFA session/);
  assert.match(page, /يمكن للمدير أو الرئيس التنفيذي فقط/);
  assert.match(page, /does not send any WhatsApp message|لا يرسل أي رسالة واتساب/);
  assert.match(nav, /navText\('WhatsApp templates', 'قوالب واتساب'\)/);
  assert.match(policy, /WHATSAPP_TEMPLATES_PATH/);
});
