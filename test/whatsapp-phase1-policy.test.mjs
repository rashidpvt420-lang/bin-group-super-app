import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSIGNMENT_COPY_AR,
  ASSIGNMENT_COPY_EN,
  HONESTY_FORBIDDEN,
  INBOUND_DAILY_LIMIT,
  OUTBOUND_DAILY_LIMIT,
  PHASE1_TEMPLATE_SPECS,
  honestyViolations,
  inboundAckMessage,
  isEmergencyTicket,
  isQuietHoursDubai,
  paramsForEvent,
  phase1JobTemplatesReady,
  recipientsFor,
  resolveWhatsAppLanguageCode,
  shouldSkipQuietHours,
  ticketEvents,
  wouldExceedLimit,
} from '../functions/whatsappPolicy.ts';

test('ticket event derivation and recipients use the phase-1 template ids', () => {
  assert.deepEqual(ticketEvents(undefined, { status: 'OPEN' }), ['TICKET_SUBMITTED']);
  assert.deepEqual(ticketEvents({ status: 'OPEN' }, { status: 'OPEN', assignedTechnicianId: 't' }), ['TECH_ASSIGNED']);
  assert.deepEqual(ticketEvents({ status: 'EN_ROUTE', assignedTechnicianId: 't' }, { status: 'ARRIVED', assignedTechnicianId: 't' }), ['TECH_ARRIVED']);
  assert.deepEqual(ticketEvents({ status: 'ARRIVED' }, { status: 'completed' }), ['JOB_COMPLETED']);
  assert.deepEqual(recipientsFor('OWNER_APPROVAL_NEEDED', { tenantId: 'a', ownerId: 'b' }), ['b']);
  assert.deepEqual(recipientsFor('RENT_DUE_REMINDER', { tenantId: 'a', ownerId: 'b' }), ['a']);
  assert.deepEqual(recipientsFor('JOB_COMPLETED', { tenantId: 'a', ownerId: 'b' }), ['a', 'b']);
});

test('locale mapping defaults to ar and en_US and accepts template overrides', () => {
  assert.equal(resolveWhatsAppLanguageCode('en'), 'en_US');
  assert.equal(resolveWhatsAppLanguageCode('ar'), 'ar');
  assert.equal(resolveWhatsAppLanguageCode('fr'), 'en_US');
  assert.equal(resolveWhatsAppLanguageCode('en', { languageCodes: { en: 'en_GB', ar: 'ar_AE' } }), 'en_GB');
  assert.equal(resolveWhatsAppLanguageCode('ar', { languageCodes: { en: 'en_GB', ar: 'ar_AE' } }), 'ar_AE');
  assert.equal(resolveWhatsAppLanguageCode('en', { languageCodes: { en: 'not-a-code' } }), 'en_US');
});

test('quiet hours are 22:00–07:00 Asia/Dubai except emergency tickets', () => {
  const evening = new Date('2026-11-11T19:30:00Z'); // 23:30 Dubai
  const morning = new Date('2026-11-11T03:00:00Z'); // 07:00 Dubai
  const afternoon = new Date('2026-11-11T10:00:00Z'); // 14:00 Dubai
  assert.equal(isQuietHoursDubai(evening), true);
  assert.equal(isQuietHoursDubai(morning), false);
  assert.equal(isQuietHoursDubai(afternoon), false);
  assert.equal(shouldSkipQuietHours({ urgency: 'normal' }, evening), true);
  assert.equal(shouldSkipQuietHours({ urgency: 'emergency' }, evening), false);
  assert.equal(isEmergencyTicket({ priority: 'SOS' }), true);
});

test('rate-limit helper trips once the daily cap is reached', () => {
  assert.equal(wouldExceedLimit(7, OUTBOUND_DAILY_LIMIT), false);
  assert.equal(wouldExceedLimit(8, OUTBOUND_DAILY_LIMIT), true);
  assert.equal(wouldExceedLimit(19, INBOUND_DAILY_LIMIT), false);
  assert.equal(wouldExceedLimit(20, INBOUND_DAILY_LIMIT), true);
});

test('phase-1 template bodies, assignment copy and inbound ack have no ETA or pay-link wording', () => {
  for (const [event, spec] of Object.entries(PHASE1_TEMPLATE_SPECS)) {
    assert.deepEqual(honestyViolations(spec.bodyEn), [], event);
    assert.deepEqual(honestyViolations(spec.bodyAr), [], event);
    assert.match(spec.bodyEn, /\{\{1\}\}/);
    assert.match(spec.bodyAr, /\{\{1\}\}/);
  }
  assert.match(PHASE1_TEMPLATE_SPECS.RENT_DUE_REMINDER.bodyEn, /cash or cheque only/i);
  assert.match(PHASE1_TEMPLATE_SPECS.OWNER_APPROVAL_NEEDED.bodyEn, /Nothing is approved until you decide/);
  assert.deepEqual(honestyViolations(ASSIGNMENT_COPY_EN), []);
  assert.deepEqual(honestyViolations(ASSIGNMENT_COPY_AR), []);
  assert.deepEqual(honestyViolations(inboundAckMessage('Plumbing', 'abc123')), []);
  assert.match(inboundAckMessage('Plumbing', 'abc123'), /Plumbing/);
  assert.match(inboundAckMessage('Plumbing', 'abc123'), /سيراجعه الفريق/);
  assert.ok(HONESTY_FORBIDDEN.includes('will be on the way soon'));
});

test('job templates are ready only when all five job events are approved with a safe name', () => {
  const approved = Object.fromEntries(['TICKET_SUBMITTED', 'TECH_ASSIGNED', 'TECH_ARRIVED', 'JOB_COMPLETED', 'OWNER_APPROVAL_NEEDED'].map((event) => [event, { approved: true, templateName: 'bin_ok' }]));
  assert.equal(phase1JobTemplatesReady(approved), true);
  assert.equal(phase1JobTemplatesReady({ ...approved, TECH_ARRIVED: { approved: false, templateName: 'bin_ok' } }), false);
  assert.equal(phase1JobTemplatesReady({ ...approved, JOB_COMPLETED: { approved: true, templateName: 'Not Valid' } }), false);
});

test('rent params are amount and due date, not a pay link', () => {
  assert.deepEqual(paramsForEvent('RENT_DUE_REMINDER', 'inst_7d', { amount: 5000, dueDate: '2026-12-01' }), ['AED 5,000.00', '2026-12-01']);
  assert.deepEqual(paramsForEvent('TECH_ARRIVED', 'ticket123456', { category: 'AC' }), ['TICKET12', 'AC']);
});
