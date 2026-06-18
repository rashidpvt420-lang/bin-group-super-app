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
      allow read: if isAdmin() || isBinConnectParticipant(resource.data);
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
  console.log('BIN Connect rules already present.');
} else {
  const anchor = '    match /{document=**} {';
  if (!rules.includes(anchor)) {
    throw new Error('Could not find catch-all match anchor in firestore.rules');
  }
  rules = rules.replace(anchor, `${block}\n${anchor}`);
  writeFileSync(path, rules);
  console.log('BIN Connect rules inserted before catch-all.');
}
