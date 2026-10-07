// Regression: the shared live tracking panel (LiveTechnicianTrackingCard on
// Owner/Tenant ticket detail) must reflect the real ticket state. A completed
// ticket (COMPLETED_PENDING_APPROVAL with an assigned technician) previously
// fell through to "Awaiting Technician Assignment" and could carry live-arrival
// claims. Completed/closed tickets must show a completed state with no ETA,
// assigned tickets must show the technician, and active jobs keep the
// embedded-map live tracking from #1663.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  hasAssignedTechnician,
  resolveTrackingPanelState,
  resolveTrackingPhase,
} from '../../src/components/tracking/trackingPanelState.mjs';

const card = readFileSync(new URL('../../src/components/tracking/LiveTechnicianTrackingCard.tsx', import.meta.url), 'utf8');

// Field shape of the completed Owner ticket reported from production.
const completedTicket = {
  status: 'COMPLETED_PENDING_APPROVAL',
  trackingStatus: 'COMPLETED',
  assignedTechnicianId: 'tech-1',
  technicianId: 'tech-1',
  assignedTechnicianName: 'rashid',
  technicianLocation: { lat: 24.2017, lng: 55.7372 },
  technicianLocationUpdatedAt: new Date().toISOString(),
  jobLocation: { lat: 24.2017468, lng: 55.7372687 },
};

test('completed-pending-approval ticket is a terminal completed state with no live tracking', () => {
  const panel = resolveTrackingPanelState(completedTicket);
  assert.equal(panel.phase, 'completed');
  assert.equal(panel.isTerminal, true);
  assert.equal(panel.allowLiveTracking, false);
  assert.equal(panel.timelineStep, 'completed');
  assert.equal(panel.technicianAssigned, true);
  assert.equal(panel.technicianName, 'rashid');
});

test('every completed/closed/cancelled variant is terminal, including spaced and lowercase forms', () => {
  for (const status of [
    'COMPLETED', 'completed', 'COMPLETED PENDING APPROVAL', 'completed_pending_tenant_approval',
    'CLOSED', 'closed', 'TENANT_APPROVED', 'RESOLVED', 'CLOSED_VERIFIED', 'AWAITING_OWNER_APPROVAL',
  ]) {
    const panel = resolveTrackingPanelState({ status, assignedTechnicianId: 't' });
    assert.equal(panel.phase, 'completed', status);
    assert.equal(panel.allowLiveTracking, false, status);
  }
  for (const status of ['CANCELLED', 'CANCELED', 'REJECTED']) {
    const panel = resolveTrackingPanelState({ status });
    assert.equal(panel.phase, 'cancelled', status);
    assert.equal(panel.allowLiveTracking, false, status);
  }
});

test('a lingering LIVE_TRACKING trackingStatus cannot re-open live claims on a completed ticket', () => {
  const panel = resolveTrackingPanelState({ ...completedTicket, trackingStatus: 'LIVE_TRACKING' });
  assert.equal(panel.allowLiveTracking, false);
});

test('an assigned technician is never reported as awaiting assignment', () => {
  assert.equal(resolveTrackingPhase({ status: 'OPEN', assignedTechnicianId: 't' }), 'accepted');
  assert.equal(resolveTrackingPhase({ status: 'SOMETHING_NEW', technicianId: 't' }), 'accepted');
  assert.equal(resolveTrackingPhase({ status: 'PENDING_ASSIGNMENT' }), 'open');
  assert.equal(resolveTrackingPhase({ status: 'OPEN', assignedTechnicianId: '   ' }), 'open');
  assert.equal(hasAssignedTechnician({ assignedTechId: 'x' }), true);
});

test('unknown status falls back to the server tracking status before defaulting to open', () => {
  assert.equal(resolveTrackingPhase({ status: '', trackingStatus: 'COMPLETED' }), 'completed');
});

test('active jobs keep live tracking (embedded map behaviour from #1663 unchanged)', () => {
  for (const [status, phase] of [
    ['EN_ROUTE', 'on_the_way'], ['on_the_way', 'on_the_way'], ['ARRIVED', 'arrived'],
    ['IN_PROGRESS', 'in_progress'], ['ACCEPTED', 'accepted'], ['ASSIGNED', 'accepted'],
  ]) {
    const panel = resolveTrackingPanelState({ status, assignedTechnicianId: 't' });
    assert.equal(panel.phase, phase, status);
    assert.equal(panel.allowLiveTracking, true, status);
    assert.equal(panel.isTerminal, false, status);
  }
});

test('non-tracking intermediate states get honest labels instead of "Awaiting Technician Assignment"', () => {
  assert.equal(resolveTrackingPhase({ status: 'WAITING_PARTS', assignedTechnicianId: 't' }), 'waiting_parts');
  assert.equal(resolveTrackingPhase({ status: 'DISPUTED', assignedTechnicianId: 't' }), 'disputed');
  assert.equal(resolveTrackingPhase({ status: 'REOPENED', assignedTechnicianId: 't' }), 'reopened');
  assert.equal(resolveTrackingPhase({ status: 'ESCALATED' }), 'escalated');
});

test('card wires the panel state so terminal tickets drop technician GPS, distance and ETA', () => {
  assert.match(card, /from '\.\/trackingPanelState\.mjs'/);
  assert.match(card, /const panel = resolveTrackingPanelState\(ticket\);/);
  assert.match(card, /const technicianLocation = panel\.allowLiveTracking \? getTechnicianLocation\(ticket\) : null;/);
  assert.match(card, /const trackingRequested = panel\.allowLiveTracking && isTrackingActive\(ticket\.status, ticket\.trackingStatus\);/);
  // Existing #1663 guard: ETA only ever comes from fresh tracking.
  assert.match(card, /const straightLineEstimateMinutes = trackingFresh \? calculateEtaMinutes\(straightLineDistanceKm\) : null;/);
  assert.match(card, /const isAssigned = panel\.technicianAssigned;/);
  assert.match(card, /getStatusMessage\(panel, straightLineEstimateMinutes, trackingFresh, locationStale\)/);
  assert.match(card, /case 'completed':[\s\S]{0,400}Job Completed/);
  assert.match(card, /Live tracking has ended for this job\. No arrival estimate applies\./);
  assert.match(card, /STEP_ORDER\.indexOf\(timelineStep\)/);
  assert.doesNotMatch(card, /normalizeTicketStatus\(ticket\.status\)/);
});

test('card no longer derives the status message from the lossy liveTracking status map', () => {
  const messageFn = card.slice(card.indexOf('function getStatusMessage('), card.indexOf('type TrackingMapProps'));
  assert.match(messageFn, /switch \(panel\.phase\)/);
  assert.match(messageFn, /default: return 'Awaiting Technician Assignment';/);
  assert.doesNotMatch(messageFn, /normalizeTicketStatus/);
});
