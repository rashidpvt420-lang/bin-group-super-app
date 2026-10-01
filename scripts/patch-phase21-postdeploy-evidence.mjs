#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const OWNER_FILE = 'scripts/run-owner-inspection-first-production-evidence.mjs';
const TENANT_FILE = 'tests/e2e/business-tenant.spec.ts';
const TECHNICIAN_FILE = 'tests/e2e/business-technician.spec.ts';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) return source.includes(after) ? source : (() => { throw new Error(`[phase21-postdeploy] missing ${label} anchor`); })();
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[phase21-postdeploy] duplicate ${label} anchor`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function patchOwnerEvidence(source) {
  const before = `    arrivalLat: 24.4958,
    arrivalLng: 54.4074,
    checklist: {
`;
  const after = `    arrivalLat: 24.4958,
    arrivalLng: 54.4074,
    pricingVerification: {
      units: property.units,
      sqft: property.sqft,
      beds: property.bedrooms || property.units,
      annualRent: property.annualRent,
      annualRevenue: property.annualRevenue,
      propertyAge: property.age,
      emirate: property.emirate,
      zone: property.zone,
      slaTier: 'standard',
      paymentPlan: 'annual',
      floors: property.floors,
      lifts: property.lifts,
      hvacCount: property.hvacCount,
      hvac: property.hvac === true,
      districtCooling: property.districtCooling === true,
      fireAlarm: property.fireAlarm === true,
      firePump: property.firePump === true,
      sira: property.sira === true || property.accessControl === true,
      gen: property.gen === true,
      bmu: property.bmu === true,
      tank: property.tank === true || property.pumps === true,
      pool: property.pool === true,
      verifiedMaintenanceRate: 12.5,
      verifiedManagementRate: 5,
    },
    checklist: {
`;
  return replaceOnce(source, before, after, 'Owner pricing verification');
}

export function patchTenantEvidence(source) {
  let patched = source;
  patched = patched.replace(
    "Technician Start Trip must persist canonical ON_THE_WAY in production Firestore.",
    "Technician Start Trip must persist canonical EN_ROUTE in production Firestore.",
  );
  patched = patched.replace("}).toBe('ON_THE_WAY');\n      lifecycleStatus = 'ON_THE_WAY';", "}).toBe('EN_ROUTE');\n      lifecycleStatus = 'EN_ROUTE';");
  patched = patched.replace("expect(['ON_THE_WAY', 'ARRIVED']).toContain(lifecycleStatus);", "expect(['EN_ROUTE', 'ARRIVED']).toContain(lifecycleStatus);");
  patched = patched.replace("if (lifecycleStatus === 'ON_THE_WAY') {", "if (lifecycleStatus === 'EN_ROUTE') {");
  if (patched.includes('canonical ON_THE_WAY') || patched.includes("lifecycleStatus === 'ON_THE_WAY'")) {
    throw new Error('[phase21-postdeploy] stale Tenant ON_THE_WAY lifecycle assertion remains');
  }
  return patched;
}

export function patchTechnicianEvidence(source) {
  let patched = source;
  patched = patched.replaceAll("fixtureTicket(gpsDeniedTicketId, 'ON_THE_WAY', true)", "fixtureTicket(gpsDeniedTicketId, 'EN_ROUTE', true)");
  patched = patched.replaceAll("fixtureTicket(gpsPoorTicketId, 'ON_THE_WAY', true)", "fixtureTicket(gpsPoorTicketId, 'EN_ROUTE', true)");
  patched = patched.replace("}).toBe('ON_THE_WAY');\n      lifecycleStatus = 'ON_THE_WAY';", "}).toBe('EN_ROUTE');\n      lifecycleStatus = 'EN_ROUTE';");
  patched = patched.replace("if (lifecycleStatus === 'ON_THE_WAY') {", "if (lifecycleStatus === 'EN_ROUTE') {");
  patched = patched.replaceAll("firestoreStatus(gpsDeniedTicketId), { timeout: 15_000 }).toBe('ON_THE_WAY')", "firestoreStatus(gpsDeniedTicketId), { timeout: 15_000 }).toBe('EN_ROUTE')");
  patched = patched.replaceAll("firestoreStatus(gpsPoorTicketId), { timeout: 15_000 }).toBe('ON_THE_WAY')", "firestoreStatus(gpsPoorTicketId), { timeout: 15_000 }).toBe('EN_ROUTE')");
  patched = patched.replaceAll("firestoreStatus(offlineTicketId), { timeout: 45_000 }).toBe('ON_THE_WAY')", "firestoreStatus(offlineTicketId), { timeout: 45_000 }).toBe('EN_ROUTE')");
  if (patched.includes("toBe('ON_THE_WAY')") || patched.includes("lifecycleStatus === 'ON_THE_WAY'")) {
    throw new Error('[phase21-postdeploy] stale Technician ON_THE_WAY lifecycle assertion remains');
  }
  return patched;
}

export function patchPhase21PostdeployEvidence() {
  const owner = patchOwnerEvidence(readFileSync(OWNER_FILE, 'utf8'));
  const tenant = patchTenantEvidence(readFileSync(TENANT_FILE, 'utf8'));
  const technician = patchTechnicianEvidence(readFileSync(TECHNICIAN_FILE, 'utf8'));
  writeFileSync(OWNER_FILE, owner, 'utf8');
  writeFileSync(TENANT_FILE, tenant, 'utf8');
  writeFileSync(TECHNICIAN_FILE, technician, 'utf8');
  console.log('[phase21-postdeploy] Owner verified pricing and canonical EN_ROUTE evidence contracts applied');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  patchPhase21PostdeployEvidence();
}
