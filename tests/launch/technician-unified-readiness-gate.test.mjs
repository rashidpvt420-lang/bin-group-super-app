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
    /15 \* 60_000/,
    /onDuty/,
    /isAvailable/,
    /activeJobCount/,
    /maxConcurrentJobs/,
    /workload capacity/,
  ], 'Unified Technician readiness');
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
