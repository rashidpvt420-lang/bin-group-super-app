import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../functions/secureOwnerRegistrationRequest.ts', import.meta.url), 'utf8');

const required = [
  'const PAYMENT_PLANS = new Set(["annual", "quarterly", "monthly"])',
  'const CONTRACT_MODE_NAMES = new Map<ContractMode, string>',
  'function canonicalProperty',
  'function canonicalPaymentManifest',
  'function canonicalCompanyProfile',
  'function canonicalDocumentUrls',
  'function contractModeForProperty',
  'function assertCanonicalCommercialTerms',
  'A single contract cannot mix maintenance, property-management, and hybrid service modes.',
  'The selected contract plan does not match the server-priced property strategy.',
  'All properties in one contract must use the same payment plan.',
  'The submitted payment cadence does not match the server-priced property cadence.',
  'const canonicalPlanName = CONTRACT_MODE_NAMES.get(contractMode);',
  'const properties = rawProperties.map((property, index) => canonicalProperty(property, index));',
  'paymentManifest: manifest,',
  'companyProfile: canonicalCompanyProfile(data.companyProfile),',
  'documentUrls: canonicalDocumentUrls(data.documentUrls),',
  'selectedPlan: canonicalPlanName',
  'contractMode,',
  'paymentPlan,',
  'properties: properties.length',
  'const commercial = assertCanonicalCommercialTerms(request.data);',
  'const data = commercial.data;',
  'return legacyRunner({ auth: request.auth, data });',
];

for (const token of required) {
  assert.ok(source.includes(token), `missing commercial authority contract: ${token}`);
}

assert.ok(source.indexOf('const commercial = assertCanonicalCommercialTerms(request.data);') < source.indexOf('const quote = await assertServerQuote(request, data);'), 'commercial terms must be validated before quote acceptance');
assert.ok(source.indexOf('const quote = await assertServerQuote(request, data);') < source.indexOf('return legacyRunner({ auth: request.auth, data });'), 'server quote must be validated before persistence');
assert.ok(!source.includes('CONTRACT_MODE_NAMES[contractMode]'), 'dynamic object indexing must not be used for contract mode resolution');
assert.ok(!source.includes('Object.assign'), 'untrusted onboarding objects must not be broadly copied');
assert.ok(!source.includes('data.serviceDetails ='), 'browser request data must not be mutated in place');
assert.ok(!source.includes('...request'), 'the complete callable request must not be delegated');
assert.ok(!source.includes('paymentManifest: data.paymentManifest'), 'raw payment manifests must not be delegated');
assert.ok(!source.includes('companyProfile: data.companyProfile'), 'raw company profiles must not be delegated');
assert.ok(!source.includes('documentUrls: data.documentUrls'), 'raw document maps must not be delegated');
assert.ok(!source.includes('return legacyRunner(request);'), 'raw browser request must not be delegated after canonicalization');

console.log('owner contract commercial authority launch regression: PASS');
