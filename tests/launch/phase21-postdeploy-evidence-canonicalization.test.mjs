import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  patchOwnerEvidence,
  patchTenantEvidence,
  patchTechnicianEvidence,
} from '../../scripts/patch-phase21-postdeploy-evidence.mjs';

const read = (path) => readFileSync(path, 'utf8');

test('Phase 21 postdeploy repair supplies the Admin-verified Owner pricing payload', () => {
  const patched = patchOwnerEvidence(read('scripts/run-owner-inspection-first-production-evidence.mjs'));
  assert.match(patched, /pricingVerification: \{/);
  assert.match(patched, /units: property\.units/);
  assert.match(patched, /sqft: property\.sqft/);
  assert.match(patched, /propertyAge: property\.age/);
  assert.match(patched, /emirate: property\.emirate/);
  assert.match(patched, /annualRent: property\.annualRent/);
  assert.match(patched, /annualRevenue: property\.annualRevenue/);
  assert.match(patched, /hvac: property\.hvac === true/);
  assert.match(patched, /fireAlarm: property\.fireAlarm === true/);
  assert.match(patched, /verifiedMaintenanceRate: 10/);
  assert.match(patched, /verifiedManagementRate: 5/);
});

test('Phase 21 postdeploy Owner FM rate stays inside Residential Building bounds', () => {
  const patched = patchOwnerEvidence(read('scripts/run-owner-inspection-first-production-evidence.mjs'));
  const match = patched.match(/verifiedMaintenanceRate:\s*([0-9.]+)/);
  assert.ok(match, 'verifiedMaintenanceRate must be present');
  const rate = Number(match[1]);
  assert.ok(rate >= 6 && rate <= 12, `verifiedMaintenanceRate ${rate} must be within AED 6-12 for Residential Building`);
});

test('Broker production evidence activates contracts with server payment verification markers', () => {
  const source = read('scripts/run-broker-production-evidence.mjs');
  assert.match(source, /paymentVerified:\s*true/);
  assert.match(source, /adminApproved:\s*true/);
  assert.match(source, /status:\s*'ACTIVE'/);
});

test('Phase 21 postdeploy repair treats EN_ROUTE as the canonical persisted Technician travel state', () => {
  const tenant = patchTenantEvidence(read('tests/e2e/business-tenant.spec.ts'));
  const technician = patchTechnicianEvidence(read('tests/e2e/business-technician.spec.ts'));

  assert.match(tenant, /canonical EN_ROUTE in production Firestore/);
  assert.match(tenant, /toBe\('EN_ROUTE'\)/);
  assert.match(tenant, /lifecycleStatus === 'EN_ROUTE'/);
  assert.doesNotMatch(tenant, /canonical ON_THE_WAY/);

  assert.match(technician, /toBe\('EN_ROUTE'\)/);
  assert.match(technician, /lifecycleStatus === 'EN_ROUTE'/);
  assert.match(technician, /fixtureTicket\(gpsDeniedTicketId, 'EN_ROUTE', true\)/);
  assert.match(technician, /fixtureTicket\(gpsPoorTicketId, 'EN_ROUTE', true\)/);
  assert.doesNotMatch(technician, /toBe\('ON_THE_WAY'\)/);
});

test('Technician business evidence GPS matches the Al Ain live-role property geofence', () => {
  const technician = read('tests/e2e/business-technician.spec.ts');
  assert.match(technician, /lat:\s*24\.2075/);
  assert.match(technician, /lng:\s*55\.7447/);
  assert.match(technician, /geolocation:\s*\{\s*longitude:\s*55\.7447,\s*latitude:\s*24\.2075/);
  assert.doesNotMatch(technician, /latitude:\s*25\.2048/);
  assert.doesNotMatch(technician, /longitude:\s*55\.2708/);
});

test('Phase 21 postdeploy repair is wired into both exact-main production evidence paths', () => {
  const runner = read('scripts/run-protected-business-evidence.mjs');
  const hooks = read('scripts/prepare-hooks.mjs');
  assert.match(runner, /run\('scripts\/patch-phase21-postdeploy-evidence\.mjs'\)/);
  assert.match(hooks, /scripts\/patch-phase21-postdeploy-evidence\.mjs/);
});

test('Owner final verified contract OTP proof is correlated to its exact request ID', () => {
  const source = read('scripts/run-owner-inspection-first-production-evidence.mjs');
  const start = source.indexOf('async function verifyFinalContractSignatureOtp');
  const end = source.indexOf('\nasync function uploadOwnerDocument', start);
  assert.ok(start >= 0 && end > start, 'final contract OTP helper must exist');
  const helper = source.slice(start, end);
  assert.match(helper, /correlationId:\s*requestId,/);
  assert.match(helper, /providerMessageId:\s*text\(otpRecord\.delivery\?\.messageId\)/);
  assert.match(helper, /label:\s*'Owner final verified contract OTP'/);
});

test('final verified Owner quote becomes the canonical payment and property quote binding', () => {
  const source = read('functions/ownerInspectionCompletion.ts');
  const completionStart = source.indexOf('export const adminCompleteOwnerPortfolioInspections');
  const paymentStart = source.indexOf('batch.set(paymentRef, {', completionStart);
  const contractStart = source.indexOf('batch.set(contractRef, {', paymentStart);
  const propertyStart = source.indexOf('propertyQuery.docs.forEach', contractStart);
  const propertyEnd = source.indexOf('batch.set(db.collection("users")', propertyStart);
  assert.ok(completionStart >= 0 && paymentStart > completionStart && contractStart > paymentStart);
  assert.ok(propertyStart > contractStart && propertyEnd > propertyStart);
  const finalCommercialStart = source.lastIndexOf('const finalCommercial = {', paymentStart);
  assert.ok(finalCommercialStart >= completionStart && finalCommercialStart < paymentStart);
  const finalCommercialPatch = source.slice(finalCommercialStart, paymentStart);
  const paymentPatch = source.slice(paymentStart, contractStart);
  const contractPatch = source.slice(contractStart, propertyStart);
  const propertyPatch = source.slice(propertyStart, propertyEnd);
  assert.match(finalCommercialPatch, /finalVerifiedQuoteHash:\s*finalQuote\.quoteHash/);
  assert.match(paymentPatch, /quoteHash:\s*finalQuote\.quoteHash/);
  assert.match(paymentPatch, /\.\.\.finalCommercial/);
  assert.match(contractPatch, /quoteHash:\s*finalQuote\.quoteHash/);
  assert.match(contractPatch, /\.\.\.finalCommercial/);
  assert.match(propertyPatch, /quoteHash:\s*finalQuote\.quoteHash/);
  assert.match(propertyPatch, /finalVerifiedQuoteHash:\s*finalQuote\.quoteHash/);
});

