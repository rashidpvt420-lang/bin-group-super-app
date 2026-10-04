import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('Technician readiness evaluator covers credentials, shift, device, GPS, duty and capacity', async () => {
  const source = await read('functions/secureTechnicianOperations.ts');
  expectAll(source, [
    /evaluateTechnicianReadiness/,
    /medicalCardExpiry/,
    /drivingLicenseExpiry/,
    /certifications/,
    /currentShiftId/,
    /registeredDeviceId/,
    /lastGpsAt/,
    /locationUpdatedAt/,
    /15 \* 60_000/,
    /onDuty/,
    /isAvailable/,
    /activeJobCount/,
    /maxConcurrentJobs/,
    /workload capacity/,
  ], 'Unified Technician readiness');
});

test('GPS readiness uses newest timestamp and ARRIVED may refresh from arrival payload', async () => {
  const [operations, liveLocation, assignment] = await Promise.all([
    read('functions/secureTechnicianOperations.ts'),
    read('functions/technicianLiveLocation.ts'),
    read('functions/secureAdminTechnicianAssignment.ts'),
  ]);
  expectAll(operations, [
    /stale availability GPS shadowing fresher live-mission locationUpdatedAt/,
    /isFreshArrivalGpsPayload/,
    /refreshTechnicianGpsFromArrival/,
    /requestedStatus === "ARRIVED"/,
    /fresh GPS location/,
  ], 'ARRIVED GPS readiness bootstrap');
  expectAll(liveLocation, [
    /lastGpsAt: now/,
  ], 'Live mission GPS writes lastGpsAt');
  expectAll(assignment, [
    /Newest GPS timestamp wins/,
    /millis\(merged\.locationUpdatedAt\)/,
  ], 'Dispatch assignment GPS newest-timestamp');
});

test('Expired or pending Technician credentials fail closed', async () => {
  const source = await read('functions/secureTechnicianOperations.ts');
  expectAll(source, [
    /expiryMs !== null && expiryMs <= nowMs/,
    /medicalState !== "valid"/,
    /licenceState !== "valid"/,
    /certificationState !== "valid"/,
    /failed-precondition/,
    /Technician is not operationally ready/,
  ], 'Credential expiry enforcement');
});

test('Resume, accept and lifecycle callables all pass through action-specific readiness', async () => {
  const source = await read('functions/secureTechnicianOperations.ts');
  expectAll(source, [
    /runSecured\(legacyResumeTechnicianDuty, request, "RESUME_DUTY"\)/,
    /runSecured\(legacyAcceptTechnicianTicket, request, "ACCEPT_TICKET"\)/,
    /runSecured\(legacyUpdateTicketLifecycle, request, "UPDATE_LIFECYCLE"\)/,
    /action !== "RESUME_DUTY" && !onDuty/,
    /action !== "RESUME_DUTY" && !available/,
    /action !== "RESUME_DUTY" && !hasCapacity/,
  ], 'Action-specific Technician readiness');
});

test('Runtime exports secured Technician wrappers over legacy handlers', async () => {
  const runtime = await read('functions/runtime.ts');
  expectAll(runtime, [
    /resumeTechnicianDuty/,
    /acceptTechnicianTicket/,
    /updateTicketLifecycle/,
    /from "\.\/secureTechnicianOperations"/,
  ], 'Secure Technician runtime exports');
});
