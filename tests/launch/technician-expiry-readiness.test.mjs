import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/technician/utils/normalizeTechnicianProfile.ts', import.meta.url), 'utf8');

test('technician readiness evaluates real expiry timestamps instead of trusting status labels', () => {
  assert.match(source, /const toMillis = \(value: unknown\): number \| null/);
  assert.match(source, /Date\.parse\(String\(value\)\)/);
  assert.match(source, /expiryMs !== null && expiryMs <= nowMs/);
  assert.match(source, /medicalCardStatus = statusFromExpiry/);
  assert.match(source, /drivingLicenseStatus = statusFromExpiry/);
});

test('all technician certifications must remain valid', () => {
  assert.match(source, /certificationStates = allCertifications\.map/);
  assert.match(source, /certificationStates\.every\(\(status\) => status === 'valid'\)/);
  assert.match(source, /certificationStates\.some\(\(status\) => status === 'expired'\)/);
  assert.match(source, /expiryAt, row\.expiresAt, row\.expiryDate, row\.expiry, row\.validUntil, row\.validTo/);
});

test('expired or missing credentials block dispatch readiness', () => {
  assert.match(source, /complianceBlocked = medicalCardStatus !== 'valid' \|\| drivingLicenseStatus !== 'valid' \|\| certificationsStatus !== 'valid'/);
  assert.match(source, /explicitBlocked \|\| complianceBlocked \? 'blocked'/);
  assert.match(source, /complianceBlockReasons/);
  assert.match(source, /medicalCardStatus !== 'valid' \? 'medicalCardStatus'/);
  assert.match(source, /drivingLicenseStatus !== 'valid' \? 'drivingLicenseStatus'/);
  assert.match(source, /certificationsStatus !== 'valid' \? 'certificationsStatus'/);
});

test('expiry tests can inject a deterministic clock', () => {
  assert.match(source, /nowMs\?: number/);
  assert.match(source, /Number\.isFinite\(sources\.nowMs\) \? Number\(sources\.nowMs\) : Date\.now\(\)/);
});
