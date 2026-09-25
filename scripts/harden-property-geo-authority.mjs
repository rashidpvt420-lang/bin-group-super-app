#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

function removeFunction(name) {
  const needle = `    function ${name}(`;
  let removed = 0;
  while (true) {
    const start = rules.indexOf(needle);
    if (start < 0) break;
    const open = rules.indexOf('{', start);
    if (open < 0) throw new Error(`[property-geo-authority] Opening brace missing for ${name}.`);
    let depth = 0;
    let end = -1;
    for (let index = open; index < rules.length; index += 1) {
      if (rules[index] === '{') depth += 1;
      if (rules[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          while (rules[end] === '\n') end += 1;
          break;
        }
      }
    }
    if (end < 0) throw new Error(`[property-geo-authority] Could not parse ${name}.`);
    rules = `${rules.slice(0, start)}${rules.slice(end)}`;
    removed += 1;
  }
  return removed;
}

function replaceMatchBlock(marker, replacement) {
  const start = rules.indexOf(marker);
  if (start < 0) throw new Error(`[property-geo-authority] Rule block missing: ${marker}`);
  const open = rules.indexOf('{', start + marker.length - 1);
  let depth = 0;
  let end = -1;
  for (let index = open; index < rules.length; index += 1) {
    if (rules[index] === '{') depth += 1;
    if (rules[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`[property-geo-authority] Could not parse ${marker}.`);
  rules = `${rules.slice(0, start)}${replacement}${rules.slice(end)}`;
}

for (const name of [
  'ownerCannotSupplyCanonicalPropertyGeo',
  'ownerSubmittedPropertyGeoIsUnverified',
  'submittedPropertyGeoIsUnverified',
  'propertyCreateHasNoCanonicalGeo',
  'canonicalPropertyGeoUnchanged',
  'propertyActivationAuthorityUnchanged',
  'propertyCreateHasNoActivationAuthority',
  'safeManagedPropertyUpdate',
  'safeOwnerPropertyCreate',
  'safeOwnerPropertyUpdate',
]) removeFunction(name);

const propertyFunctions = `    function submittedPropertyGeoIsUnverified(data) {
      return !('submittedGeo' in data) || (
        data.submittedGeo is map &&
        data.submittedGeo.get('lat', null) is number &&
        data.submittedGeo.get('lng', null) is number &&
        data.submittedGeo.get('lat', 0) >= -90 &&
        data.submittedGeo.get('lat', 0) <= 90 &&
        data.submittedGeo.get('lng', 0) >= -180 &&
        data.submittedGeo.get('lng', 0) <= 180 &&
        !(data.submittedGeo.get('lat', 0) == 0 && data.submittedGeo.get('lng', 0) == 0) &&
        data.submittedGeo.get('source', '') == 'owner_submission' &&
        data.submittedGeo.get('verified', false) == false &&
        data.submittedGeo.get('dispatchReady', false) == false &&
        data.submittedGeo.get('requiresGeoReview', true) == true &&
        data.submittedGeo.get('verifiedBy', null) == null &&
        data.submittedGeo.get('verifiedAt', null) == null
      );
    }

    function propertyCreateHasNoCanonicalGeo(data) {
      return !data.keys().hasAny([
        'geo',
        'geoAnchor',
        'verifiedGeo',
        'geoVerification',
        'verified',
        'verifiedBy',
        'verifiedAt',
        'dispatchReady',
        'requiresGeoReview',
        'geoReviewStatus',
        'geoVerifiedAt',
        'geoVerifiedBy'
      ]) && submittedPropertyGeoIsUnverified(data);
    }

    function canonicalPropertyGeoUnchanged() {
      return !request.resource.data.diff(resource.data).affectedKeys().hasAny([
        'geo',
        'geoAnchor',
        'verifiedGeo',
        'geoVerification',
        'verified',
        'verifiedBy',
        'verifiedAt',
        'dispatchReady',
        'requiresGeoReview',
        'geoReviewStatus',
        'geoVerifiedAt',
        'geoVerifiedBy'
      ]);
    }

    function propertyActivationAuthorityUnchanged() {
      return !request.resource.data.diff(resource.data).affectedKeys().hasAny([
        'status',
        'approvalStatus',
        'onboardingStatus',
        'canonicalOnboardingState',
        'activationStatus',
        'paymentStatus',
        'paymentVerified',
        'adminApproved',
        'approved',
        'contractActivated',
        'dashboardUnlocked',
        'dashboardLocked',
        'dashboardUnlockApproved',
        'unlocksDashboard',
        'activeContractId',
        'quoteHash',
        'quoteSnapshot',
        'quoteVersion',
        'inspectionId',
        'inspectionIds',
        'inspectionStatus',
        'inspectionVerified',
        'inspectionEvidenceVerified',
        'adminSiteVisitVerified',
        'locationVerified',
        'activatedAt',
        'approvedAt',
        'approvedBy',
        'reviewedAt',
        'reviewedBy',
        'reviewedByRole',
        'rejectedAt',
        'rejectedBy',
        'ownerId',
        'ownerUid'
      ]);
    }

    function propertyCreateHasNoActivationAuthority(data) {
      return !(data.get('status', '') in ['active', 'ACTIVE', 'approved', 'APPROVED']) &&
        !(data.get('activationStatus', '') in ['active', 'ACTIVE', 'approved', 'APPROVED']) &&
        data.get('paymentVerified', false) == false &&
        data.get('adminApproved', false) == false &&
        data.get('approved', false) == false &&
        data.get('contractActivated', false) == false &&
        data.get('dashboardUnlocked', false) == false &&
        data.get('dashboardUnlockApproved', false) == false &&
        data.get('unlocksDashboard', false) == false &&
        data.get('inspectionVerified', false) == false &&
        data.get('inspectionEvidenceVerified', false) == false &&
        data.get('adminSiteVisitVerified', false) == false &&
        data.get('locationVerified', false) == false;
    }

    function safeManagedPropertyUpdate() {
      return canonicalPropertyGeoUnchanged() &&
        submittedPropertyGeoIsUnverified(request.resource.data) &&
        propertyActivationAuthorityUnchanged();
    }

`;
const insertionAnchor = '    function safeTenantEvidenceUpdate() {';
if (!rules.includes(insertionAnchor)) throw new Error('[property-geo-authority] Tenant evidence anchor missing.');
rules = rules.replace(insertionAnchor, `${propertyFunctions}${insertionAnchor}`);

const propertyBlock = `    match /properties/{propertyId} {
      allow get: if isNotSuspended() && getTenantPropertyId() == propertyId;
      allow read: if isNotSuspended() && (canManageProperties() || ownerCanRead(resource.data) || tenantOwns(resource.data) || (isTechnicianActor() && techOwns(resource.data)));
      allow create: if isNotSuspended() &&
        canManageProperties() &&
        propertyCreateHasNoCanonicalGeo(request.resource.data) &&
        propertyCreateHasNoActivationAuthority(request.resource.data);
      allow update: if isNotSuspended() &&
        canManageProperties() &&
        safeManagedPropertyUpdate();
      allow delete: if isNotSuspended() && isAdmin();
    }`;
replaceMatchBlock('    match /properties/{propertyId} {', propertyBlock);

for (const name of [
  'submittedPropertyGeoIsUnverified',
  'propertyCreateHasNoCanonicalGeo',
  'canonicalPropertyGeoUnchanged',
  'propertyActivationAuthorityUnchanged',
  'propertyCreateHasNoActivationAuthority',
  'safeManagedPropertyUpdate',
]) {
  if (rules.split(`function ${name}(`).length - 1 !== 1) {
    throw new Error(`[property-geo-authority] ${name} must exist exactly once.`);
  }
}

for (const forbidden of [
  'function ownerCannotSupplyCanonicalPropertyGeo(',
  'function ownerSubmittedPropertyGeoIsUnverified(',
  '(canManageProperties() && canonicalPropertyGeoUnchanged())',
  '(canManageProperties() && ownerSubmittedPropertyGeoIsUnverified(request.resource.data))',
]) {
  if (rules.includes(forbidden)) throw new Error(`[property-geo-authority] Legacy browser geo authority remains: ${forbidden}`);
}

const catchAll = rules.slice(rules.indexOf('    match /{collection}/{document=**}'));
if ((catchAll.match(/'properties'/g) || []).length !== 2) {
  throw new Error('[property-geo-authority] Generic Admin write fallbacks must exclude properties exactly twice.');
}

writeFileSync(rulesPath, rules);
console.log('[property-geo-authority] Owner property writes are server-callable only; Admin browser metadata writes cannot mutate geo, inspection, payment, or activation authority.');
