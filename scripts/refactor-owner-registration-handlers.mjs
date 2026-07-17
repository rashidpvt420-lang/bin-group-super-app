import fs from 'node:fs';

const path = 'functions/ownerRegistrationRequest.ts';
let source = fs.readFileSync(path, 'utf8');

const previewStart = 'export const previewOwnerOnboardingQuote = onCall({ cors: true, enforceAppCheck: true }, async (request) => {';
const pendingMarker = '\n\nexport const submitPendingOwnerRegistration = onCall';
const previewIndex = source.indexOf(previewStart);
const pendingIndex = source.indexOf(pendingMarker, previewIndex);
if (previewIndex < 0 || pendingIndex < 0) throw new Error('Preview handler markers not found.');

let previewBlock = source.slice(previewIndex, pendingIndex);
previewBlock = previewBlock.replace(previewStart, 'export async function previewOwnerOnboardingQuoteHandler(request: any) {');
const previewClose = previewBlock.lastIndexOf('\n});');
if (previewClose < 0) throw new Error('Preview handler closing marker not found.');
previewBlock = `${previewBlock.slice(0, previewClose)}\n}\n\nexport const previewOwnerOnboardingQuote = onCall(\n  { cors: true, enforceAppCheck: true },\n  previewOwnerOnboardingQuoteHandler,\n);`;
source = `${source.slice(0, previewIndex)}${previewBlock}${source.slice(pendingIndex)}`;

const submitStart = 'export const submitOwnerOnboardingPaymentPackage = onCall({ cors: true, enforceAppCheck: true }, async (request) => {';
const submitIndex = source.indexOf(submitStart);
if (submitIndex < 0) throw new Error('Submit handler marker not found.');
source = source.replace(submitStart, 'export async function submitOwnerOnboardingPaymentPackageHandler(request: any) {');
const submitClose = source.lastIndexOf('\n});');
if (submitClose < submitIndex) throw new Error('Submit handler closing marker not found.');
source = `${source.slice(0, submitClose)}\n}\n\nexport const submitOwnerOnboardingPaymentPackage = onCall(\n  { cors: true, enforceAppCheck: true },\n  submitOwnerOnboardingPaymentPackageHandler,\n);${source.slice(submitClose + 4)}`;

if (source.includes('export const previewOwnerOnboardingQuote = onCall({ cors: true, enforceAppCheck: true }, async')) {
  throw new Error('Preview callable was not refactored.');
}
if (source.includes('export const submitOwnerOnboardingPaymentPackage = onCall({ cors: true, enforceAppCheck: true }, async')) {
  throw new Error('Submit callable was not refactored.');
}
if (!source.includes('export async function previewOwnerOnboardingQuoteHandler')) {
  throw new Error('Preview handler export missing.');
}
if (!source.includes('export async function submitOwnerOnboardingPaymentPackageHandler')) {
  throw new Error('Submit handler export missing.');
}

fs.writeFileSync(path, source);
console.log('Owner registration callable handlers extracted successfully.');
