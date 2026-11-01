#!/usr/bin/env node
// Painting projects are written only by Cloud Functions (paintingProjects.ts). Browsers - including
// Admin sessions - may read but never create, update or delete them. Approval OTP digests live under
// system_secrets/painting_approval_otps/otps/{otpId}, which every browser rule already denies.
// Owners may read their project, quotes and invoices only; internal cost sheets, costs and
// idempotency records are Admin-only (idempotency: no browser access at all).
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
let rules = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
const marker = '    match /{collection}/{document=**} {';
const explicit = `    // One-time painting projects: callable-only writes (quote margin, OTP approval, photos, warranty).
    match /painting_projects/{projectId} {
      allow read: if signedIn() && (resource.data.ownerId == request.auth.uid || hasAdminClaim());
      allow create, update, delete: if false;
      match /quotes/{quoteId} {
        allow read: if signedIn() && (get(/databases/$(database)/documents/painting_projects/$(projectId)).data.ownerId == request.auth.uid || hasAdminClaim());
        allow create, update, delete: if false;
      }
      // Stage invoices (deposit / progress / final, cash or cheque): owner + Admin read, callable-only writes.
      match /invoices/{stage} {
        allow read: if signedIn() && (get(/databases/$(database)/documents/painting_projects/$(projectId)).data.ownerId == request.auth.uid || hasAdminClaim());
        allow create, update, delete: if false;
      }
      // Internal cost sheets, actual costs and idempotency records never reach owners.
      match /internal_quotes/{quoteId} {
        allow read: if hasAdminClaim();
        allow create, update, delete: if false;
      }
      match /costs/{costId} {
        allow read: if hasAdminClaim();
        allow create, update, delete: if false;
      }
      match /idempotency/{key} {
        allow read, create, update, delete: if false;
      }
    }

`;
// Admin-entered AED rates with an append-only change history; written only by adminSetPaintingRate.
const ratesBlock = `    // Painting rates (AED): Admin read, callable-only writes, append-only history.
    match /painting_rates/{rateId} {
      allow read: if hasAdminClaim();
      allow create, update, delete: if false;
      match /history/{entryId} {
        allow read: if hasAdminClaim();
        allow create, update, delete: if false;
      }
    }
`;

if (!rules.includes('match /painting_projects/{projectId} {')) {
  const index = rules.indexOf(marker);
  if (index < 0) throw new Error('[painting-projects] generic fallback missing');
  rules = rules.slice(0, index) + explicit + rules.slice(index);
}

if (!rules.includes('match /reserve_ledger/{entryId} {')) {
  const anchor = '      match /idempotency/{key} {\n        allow read, create, update, delete: if false;\n      }\n';
  if (!rules.includes(anchor)) throw new Error('[painting-projects] idempotency anchor missing');
  rules = rules.replace(anchor, anchor + `      // Separately held contingency / warranty reserves (append-only ledger). Never part of cost.
      match /reserve_ledger/{entryId} {
        allow read: if hasAdminClaim();
        allow create, update, delete: if false;
      }
`);
}
if (!rules.includes('match /painting_rates/{rateId} {')) {
  const index = rules.indexOf(marker);
  rules = rules.slice(0, index) + ratesBlock + rules.slice(index);
}
// Painting payment reviewers (finance_manager / finance_controller): MFA, verified email, not suspended.
// They may read stage invoices only (plus the proofs in Storage); never the project document, costs,
// margin, reserves or rates. Decisions go only through financeDecidePaintingPayment.
const financeFn = `      function isPaintingFinanceApprover() {
        return signedIn() && hasAdminSecondFactor() && isNotSuspended() &&
          request.auth.token.get('email_verified', false) == true &&
          request.auth.token.get('suspended', false) != true &&
          (request.auth.token.get('role', '') in ['finance_manager', 'finance_controller'] ||
           request.auth.token.get('financeRole', '') in ['finance_manager', 'finance_controller']);
      }
`;
const projectOpen = '    match /painting_projects/{projectId} {\n';
if (!rules.includes('function isPaintingFinanceApprover()')) {
  if (!rules.includes(projectOpen)) throw new Error('[painting-projects] project block missing');
  rules = rules.replace(projectOpen, projectOpen + financeFn);
}
const invOld = `      match /invoices/{stage} {
        allow read: if signedIn() && (get(/databases/$(database)/documents/painting_projects/$(projectId)).data.ownerId == request.auth.uid || hasAdminClaim());`;
const invNew = `      match /invoices/{stage} {
        allow read: if signedIn() && (get(/databases/$(database)/documents/painting_projects/$(projectId)).data.ownerId == request.auth.uid || hasAdminClaim() || isPaintingFinanceApprover());`;
if (!rules.includes(invNew)) {
  if (!rules.includes(invOld)) throw new Error('[painting-projects] invoices block not in reviewed form');
  rules = rules.replace(invOld, invNew);
}
const genericStart = rules.indexOf(marker);
let generic = rules.slice(genericStart);
const writeAnchor = "          'systemMetrics',\n";
const writeReplacement = "          'systemMetrics',\n          'painting_projects',\n";
if (!generic.includes("          'painting_projects',\n")) {
  if ((generic.split(writeAnchor).length - 1) !== 2) throw new Error('[painting-projects] write fallback anchors not in reviewed form');
  generic = generic.replaceAll(writeAnchor, writeReplacement);
}
const ratesAnchor = "          'painting_projects',\n";
if (!generic.includes("          'painting_rates',\n")) generic = generic.replaceAll(ratesAnchor, ratesAnchor + "          'painting_rates',\n");
if ((generic.match(/          'painting_rates',\n/g) || []).length !== 2) throw new Error('[painting-projects] expected two painting_rates write fallback exclusions');
const count = (generic.match(/          'painting_projects',\n/g) || []).length;
if (count !== 2) throw new Error(`[painting-projects] expected two write fallback exclusions, found ${count}`);
rules = rules.slice(0, genericStart) + generic;
writeFileSync(path, rules, 'utf8');
console.log('[painting-projects] callable-only painting writes enforced');
