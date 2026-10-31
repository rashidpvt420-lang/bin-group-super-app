#!/usr/bin/env node
// Painting projects are written only by Cloud Functions (paintingProjects.ts). Browsers - including
// Admin sessions - may read but never create, update or delete them. Approval OTP digests live under
// system_secrets/painting_approval_otps/otps/{otpId}, which every browser rule already denies.
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
    }

`;

if (!rules.includes('match /painting_projects/{projectId} {')) {
  const index = rules.indexOf(marker);
  if (index < 0) throw new Error('[painting-projects] generic fallback missing');
  rules = rules.slice(0, index) + explicit + rules.slice(index);
}

const genericStart = rules.indexOf(marker);
let generic = rules.slice(genericStart);
const writeAnchor = "          'systemMetrics',\n";
const writeReplacement = "          'systemMetrics',\n          'painting_projects',\n";
if (!generic.includes("          'painting_projects',\n")) {
  if ((generic.split(writeAnchor).length - 1) !== 2) throw new Error('[painting-projects] write fallback anchors not in reviewed form');
  generic = generic.replaceAll(writeAnchor, writeReplacement);
}
const count = (generic.match(/          'painting_projects',\n/g) || []).length;
if (count !== 2) throw new Error(`[painting-projects] expected two write fallback exclusions, found ${count}`);
rules = rules.slice(0, genericStart) + generic;
writeFileSync(path, rules, 'utf8');
console.log('[painting-projects] callable-only painting writes enforced');
