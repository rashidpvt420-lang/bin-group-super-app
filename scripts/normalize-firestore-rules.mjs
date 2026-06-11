import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const brokerOwnsNeedle = '    function brokerOwns(data) {';

function dedupeBrokerOwns(input) {
  let cursor = 0;
  let seen = 0;
  let removed = 0;
  let output = '';

  while (true) {
    const start = input.indexOf(brokerOwnsNeedle, cursor);
    if (start === -1) {
      output += input.slice(cursor);
      break;
    }

    output += input.slice(cursor, start);

    let depth = 0;
    let end = start;
    for (; end < input.length; end += 1) {
      const char = input[end];
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          while (input[end] === '\r' || input[end] === '\n') end += 1;
          break;
        }
      }
    }

    const block = input.slice(start, end);
    if (seen === 0) {
      output += block.endsWith('\n\n') ? block : `${block}\n\n`;
    } else {
      removed += 1;
    }
    seen += 1;
    cursor = end;
  }

  return { output, seen, removed };
}

function replaceLineBlock(input, startText, endText, replacement, label) {
  const start = input.indexOf(startText);
  if (start === -1) {
    if (input.includes(replacement)) {
      console.log(`Already normalized/hardened: ${label}`);
      return input;
    }
    throw new Error(`[rules-normalize] Missing ${label} start.`);
  }
  const end = input.indexOf(endText, start);
  if (end === -1) throw new Error(`[rules-normalize] Missing ${label} end.`);
  return input.slice(0, start) + replacement + input.slice(end + endText.length);
}

let { output, seen, removed } = dedupeBrokerOwns(source);

output = replaceLineBlock(
  output,
  "      allow read: if isAdmin() || hasPermission('canManageProperties') || ownerCanRead(resource.data) || tenantOwns(resource.data) || techOwns(resource.data) ||",
  "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'tenant');",
  "      allow read: if isAdmin() || hasPermission('canManageProperties') || ownerCanRead(resource.data) || tenantOwns(resource.data) || techOwns(resource.data);",
  'properties read rule'
);

output = replaceLineBlock(
  output,
  "    match /notifications/{notificationId} {\n      allow read:",
  "      allow update:",
  "    match /notifications/{notificationId} {\n      allow read: if isAdmin() || (signedIn() && (resource.data.recipientId == request.auth.uid || resource.data.userId == request.auth.uid));\n      allow create: if isAdmin() || (signedIn() && request.resource.data.recipientId == request.auth.uid && (!('userId' in request.resource.data) || request.resource.data.userId == request.auth.uid) && (!('createdBy' in request.resource.data) || request.resource.data.createdBy == request.auth.uid));\n      allow update:",
  'notifications create rule'
);

if (output !== source) writeFileSync(path, output);

console.log(`Firestore rules normalization complete. Kept ${seen > 0 ? 1 : 0}, removed ${removed} duplicate brokerOwns helper(s), hardened launch-critical access rules.`);
