import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
const rules = readFileSync(path, 'utf8');
const helpers = `
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

`;
const canonicalBlock = `    match /binConnectThreads/{threadId} {
      allow get: if isAdmin() || isBinConnectParticipant(resource.data);
      allow list: if isAdmin();
      // Authenticated/App Check Cloud Functions own all thread mutations.
      allow create, update: if false;
      allow delete: if isAdmin();

      match /messages/{messageId} {
        allow read: if exists(/databases/$(database)/documents/binConnectThreads/$(threadId)) && (isAdmin() || isBinConnectParticipant(get(/databases/$(database)/documents/binConnectThreads/$(threadId)).data));
        // Authenticated/App Check Cloud Functions own all message mutations.
        allow create, update: if false;
        allow delete: if isAdmin();
      }
    }`;

// Scan only the matched conversation block. Strings and comments may contain
// braces; ignore those so unrelated collections remain byte-for-byte intact.
function blockEnd(source, opening) {
  let depth = 0;
  let quote = null;
  let comment = null;
  for (let i = opening; i < source.length; i++) {
    const char = source[i], next = source[i + 1];
    if (comment === 'line') { if (char === '\n') comment = null; continue; }
    if (comment === 'block') { if (char === '*' && next === '/') { comment = null; i++; } continue; }
    if (quote) { if (char === '\\') i++; else if (char === quote) quote = null; continue; }
    if (char === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (char === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return i + 1;
  }
  throw new Error('Unterminated BIN Connect rules block.');
}

const matches = [...rules.matchAll(/^([ \t]*)match \/binConnectThreads\/\{threadId\}\s*\{/gm)];
if (matches.length > 1) throw new Error('Multiple BIN Connect rules blocks require manual review.');
let updated;
if (matches.length) {
  const match = matches[0];
  const end = blockEnd(rules, match.index + match[0].length - 1);
  const newline = match[0].includes('\r\n') || rules.includes('\r\n') ? '\r\n' : '\n';
  const block = canonicalBlock.replace(/^    /gm, match[1]).replace(/\n/g, newline);
  updated = rules.slice(0, match.index) + block + rules.slice(end);
} else {
  // Preserve the original insertion policy: target the last top-level catch-all.
  const anchor = '    match /{document=**} {';
  const at = rules.lastIndexOf(anchor);
  if (at < 0) throw new Error('Could not find catch-all match anchor in firestore.rules');
  const newline = rules.includes('\r\n') ? '\r\n' : '\n';
  const insertion = `${helpers}${canonicalBlock}\n\n`.replace(/\n/g, newline);
  updated = rules.slice(0, at) + insertion + rules.slice(at);
}
// Firestore grants are ORed across matching blocks. The Admin fallback must
// therefore exclude BIN Connect writes as well; retain its read grant unchanged.
const fallbackMatches = [...updated.matchAll(/^([ \t]*)match \/\{collection\}\/\{document=\*\*\}\s*\{/gm)];
if (fallbackMatches.length > 1) throw new Error('Multiple global collection fallbacks require manual review.');
if (fallbackMatches.length) {
  const match = fallbackMatches[0];
  const end = blockEnd(updated, match.index + match[0].length - 1);
  let changes = 0;
  const fallback = updated.slice(match.index, end).replace(
    /allow (create|update,\s*delete): if ([\s\S]*?);/g,
    (clause) => {
      changes++;
      // Migrate the earlier predicate form without changing validator prefixes.
      const normalized = clause.replace(/ && collection != 'binConnectThreads'/g, '');
      if (!/&& hasAdminClaim\(\);$/.test(normalized) || !/collection in \[/.test(normalized)) {
        throw new Error('Unrecognized Admin write fallback; refusing a speculative transform.');
      }
      return normalized.replace(/(collection in \[)([\s\S]*?)(\])/, (_array, open, entries, close) => {
        if (entries.includes("'binConnectThreads'")) return _array;
        const trimmed = entries.trimEnd();
        const trailing = entries.slice(trimmed.length);
        const indent = trimmed.match(/\n([ \t]*)[^\n]*$/)?.[1];
        const separator = indent === undefined ? ", " : `,\n${indent}`;
        return `${open}${trimmed}${separator}'binConnectThreads'${trailing}${close}`;
      });
    },
  );
  if (changes !== 2) throw new Error('Expected exactly two Admin write fallback clauses.');
  updated = updated.slice(0, match.index) + fallback + updated.slice(end);
}
if (updated !== rules) {
  writeFileSync(path, updated);
  console.log('BIN Connect rules hardened with server-authoritative mutations.');
} else {
  console.log('BIN Connect rules already hardened.');
}
