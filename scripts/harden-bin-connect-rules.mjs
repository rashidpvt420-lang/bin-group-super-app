import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
let rules = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const marker = "match /binConnectThreads/{threadId}";
const block = `
    function isBinConnectParticipant(data) {
      return signedIn() && (
        isAdmin() ||
        (data.participantIds is list && request.auth.uid in data.participantIds) ||
        data.createdBy == request.auth.uid ||
        data.assignedAdminId == request.auth.uid
      );
    }

    function safeBinConnectThreadCreate(data) {
      return signedIn() &&
        data.createdBy == request.auth.uid &&
        data.participantIds is list &&
        request.auth.uid in data.participantIds &&
        data.status in ['open', 'pending', 'new'] &&
        data.channel in ['company_ceo', 'admin_support', 'owner_to_tenant', 'owner_to_technician', 'majlis_staff', 'maintenance_chat', 'feature_suggestion', 'dashboard_issue'];
    }

    match /binConnectThreads/{threadId} {
      allow get: if isAdmin() || isBinConnectParticipant(resource.data);
      allow list: if isAdmin();
      allow create: if safeBinConnectThreadCreate(request.resource.data);
      allow update: if isAdmin() || (isBinConnectParticipant(resource.data) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastMessage', 'lastMessageAt', 'updatedAt', 'status']));
      allow delete: if isAdmin();

      match /messages/{messageId} {
        allow read: if exists(/databases/$(database)/documents/binConnectThreads/$(threadId)) && (isAdmin() || isBinConnectParticipant(get(/databases/$(database)/documents/binConnectThreads/$(threadId)).data));
        allow create: if exists(/databases/$(database)/documents/binConnectThreads/$(threadId)) &&
          (isAdmin() || isBinConnectParticipant(get(/databases/$(database)/documents/binConnectThreads/$(threadId)).data)) &&
          request.resource.data.senderId == request.auth.uid;
        allow update: if false;
        allow delete: if isAdmin();
      }
    }
`;

if (rules.includes(marker)) {
  const legacyRead = '      allow read: if isAdmin() || isBinConnectParticipant(resource.data);';
  const serverOnlyList = `      allow get: if isAdmin() || isBinConnectParticipant(resource.data);
      // Non-admin enumeration is server-authoritative via listMyBinConnectThreads.
      allow list: if isAdmin();`;
  if (rules.includes("      allow get: if isAdmin() || isBinConnectParticipant(resource.data);\n      // List access is deliberately narrower and query-compatible: a non-admin\n      // browser must constrain participantIds with array-contains(request.auth.uid).\n      allow list: if isAdmin() || (\n        signedIn() &&\n        resource.data.get('participantIds', []) is list &&\n        request.auth.uid in resource.data.get('participantIds', [])\n      );")) {
    rules = rules.replace("      allow get: if isAdmin() || isBinConnectParticipant(resource.data);\n      // List access is deliberately narrower and query-compatible: a non-admin\n      // browser must constrain participantIds with array-contains(request.auth.uid).\n      allow list: if isAdmin() || (\n        signedIn() &&\n        resource.data.get('participantIds', []) is list &&\n        request.auth.uid in resource.data.get('participantIds', [])\n      );", serverOnlyList);
    writeFileSync(path, rules);
    console.log('BIN Connect rules upgraded from participant browser list to server-only enumeration.');
    process.exit(0);
  }
  const querySafeRead = `      allow get: if isAdmin() || isBinConnectParticipant(resource.data);
      // Non-admin enumeration is server-authoritative via listMyBinConnectThreads.
      allow list: if isAdmin();`;
  if (rules.includes(legacyRead)) {
    rules = rules.replace(legacyRead, querySafeRead);
    writeFileSync(path, rules);
    console.log('BIN Connect rules upgraded to query-safe participant list access.');
  } else {
    console.log('BIN Connect rules already present and query-safe.');
  }
} else {
  // The top-level catch-all is the LAST `match /{document=**} {` in the file
  // (4-space indent, immediately inside `match /databases/{database}/documents {`).
  // Earlier nested occurrences (e.g. inside `match /users/{userId} {`) share the
  // same text at a deeper indent, so anchoring on the first match would silently
  // insert this block at the wrong nesting depth. Anchor on the last occurrence instead.
  const anchor = '    match /{document=**} {';
  const anchorIndex = rules.lastIndexOf(anchor);
  if (anchorIndex === -1) {
    throw new Error('Could not find catch-all match anchor in firestore.rules');
  }
  rules = rules.slice(0, anchorIndex) + block + '\n' + rules.slice(anchorIndex);
  writeFileSync(path, rules);
  console.log('BIN Connect rules inserted before catch-all.');
}
