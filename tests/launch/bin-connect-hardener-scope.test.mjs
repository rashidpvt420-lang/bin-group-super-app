import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const script = fileURLToPath(new URL('../../scripts/harden-bin-connect-rules.mjs', import.meta.url));
const prefix = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isBinConnectParticipant(data) { return signedIn(); }
    match /maintenanceTickets/{ticketId}/messages/{messageId} {
        allow update: if false;
        allow create: if request.resource.data.senderId == request.auth.uid;
    }
`;
const suffix = `
    match /after/{document} { allow read: if false; }
    match /{document=**} { allow read, write: if false; }
  }
}
`;
function fixture(read, sender, newline = '\n') {
  return (prefix + `    match /binConnectThreads/{threadId} {
      ${read}
      // Brace decoys: } { and 'ignored'
      allow create: if safeBinConnectThreadCreate(request.resource.data);
      allow update: if isAdmin();
      allow delete: if isAdmin();
      match /messages/{messageId} {
        /* } { */
        allow create: if ${sender} && request.resource.data.body != '}';
        allow update: if false;
        allow delete: if isAdmin();
      }
    }` + suffix).replace(/\n/g, newline);
}
function isolated(source, verify) {
  const directory = mkdtempSync(join(tmpdir(), 'bin-connect-hardener-'));
  const target = join(directory, 'firestore.rules');
  try {
    writeFileSync(target, source);
    execFileSync(process.execPath, [script], { cwd: directory, stdio: 'pipe' });
    const result = readFileSync(target, 'utf8');
    verify(result, directory, target);
    const beforeSecond = readFileSync(target, 'utf8');
    execFileSync(process.execPath, [script], { cwd: directory, stdio: 'pipe' });
    assert.equal(readFileSync(target, 'utf8'), beforeSecond, 'second execution must be byte-identical');
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
function hardened(result) {
  assert.equal((result.match(/allow create, update: if false;/g) || []).length, 2);
  assert.match(result, /allow get: if isAdmin\(\) \|\| isBinConnectParticipant\(resource.data\);/);
  assert.match(result, /allow list: if isAdmin\(\);/);
  assert.match(result, /Cloud Functions own all thread mutations/);
  assert.match(result, /Cloud Functions own all message mutations/);
  const start = result.indexOf('    match /binConnectThreads');
  const end = result.indexOf('\n    }', start) + '\n    }'.length;
  assert.doesNotMatch(result.slice(start, end), /allow create:|allow update:/);
}
for (const [name, read, sender] of [
  ['legacy broad read and sender field', 'allow read: if isAdmin() || isBinConnectParticipant(resource.data);', 'request.resource.data.senderId == request.auth.uid'],
  ['legacy participant list and canonical sender getter', "allow get: if isBinConnectParticipant(resource.data);\n      allow list: if request.auth.uid in resource.data.get('participantIds', []);", "request.resource.data.get('senderId', null) == request.auth.uid"],
  ['already narrowed list with remaining browser writes', 'allow get: if isAdmin() || isBinConnectParticipant(resource.data);\n      allow list: if isAdmin();', "request.resource.data.get('senderId', null) == request.auth.uid"],
]) {
  test(`actual hardener scopes ${name} without changing other rules`, () => isolated(fixture(read, sender), result => {
    assert.ok(result.startsWith(prefix), 'helpers and maintenance message rules unchanged');
    assert.ok(result.endsWith(suffix), 'subsequent collections unchanged');
    hardened(result);
  }));
}
test('actual hardener preserves CRLF bytes outside its block', () => isolated(fixture('allow read: if true;', 'true', '\r\n'), result => {
  assert.ok(result.startsWith(prefix.replace(/\n/g, '\r\n')));
  assert.ok(result.endsWith(suffix.replace(/\n/g, '\r\n')));
  assert.doesNotMatch(result.replace(/\r\n/g, ''), /\n/);
  hardened(result);
}));
test('actual hardener normalizes current canonical rules and is idempotent', () => {
  const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const start = source.indexOf('    match /binConnectThreads/{threadId} {');
  assert.ok(start > 0);
  const ending = source.indexOf('\n    }', start) + '\n    }'.length;
  assert.ok(ending > start);
  isolated(source, result => {
    assert.equal(result.slice(0, start), source.slice(0, start));
    const originalSuffix = source.slice(ending).replace(/ && collection != 'binConnectThreads'/g, '');
    const actualSuffix = result.slice(result.indexOf('\n    }', start) + '\n    }'.length);
    const withoutNewExclusion = actualSuffix.replace(/,\n[ \t]*'binConnectThreads'/g, '');
    assert.equal(withoutNewExclusion, originalSuffix.replace(/,\n[ \t]*'binConnectThreads'/g, ''), 'only the two explicit Admin exclusion array entries may change');
    const changedBlock = result.slice(start, result.length - source.slice(ending).length);
    hardened(changedBlock);
  });
});
test('actual hardener inserts absent block before final catch-all without replacing other rules', () => isolated(prefix + suffix, result => {
  assert.ok(result.startsWith(prefix));
  assert.ok(result.endsWith('    match /{document=**} { allow read, write: if false; }\n  }\n}\n'));
  hardened(result);
}));

for (const prefixPredicate of ["!(", "collection != 'tickets' && collection != 'maintenanceTickets' && !("]) {
  test(`Admin fallback excludes BIN Connect writes and preserves read and other collection exclusions (${prefixPredicate})`, () => {
    const catchall = `    match /{collection}/{document=**} {
      allow read: if isAdmin();
      allow create: if ${prefixPredicate}collection in ['audit_logs', 'maintenanceTickets']) && hasAdminClaim();
      allow update, delete: if ${prefixPredicate}collection in ['audit_logs', 'maintenanceTickets']) && hasAdminClaim();
    }`;
    const before = fixture('allow read: if true;', 'true');
    const source = before.replace('    match /after/{document}', catchall + '\n    match /after/{document}');
    isolated(source, result => {
      assert.equal((result.match(/'binConnectThreads'/g) || []).length, 2);
      const expectedCatchall = catchall.replaceAll("'maintenanceTickets']", "'maintenanceTickets', 'binConnectThreads']");
      assert.ok(result.includes(expectedCatchall), 'read grant and every other fallback byte preserved');
      assert.ok(result.startsWith(prefix), 'maintenance restrictions and helpers preserved');
      hardened(result);
    });
  });
}

test('final authority hardener preserves BIN Connect fallback exclusions and canonical prefix validators', () => {
  const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const finalHardener = fileURLToPath(new URL('../../scripts/harden-final-firestore-authority.mjs', import.meta.url));
  isolated(source, (_result, directory, target) => {
    execFileSync(process.execPath, [finalHardener], { cwd: directory, stdio: 'pipe' });
    const finalRules = readFileSync(target, 'utf8');
    assert.equal((finalRules.match(/'binConnectThreads'/g) || []).length, 2);
    assert.match(finalRules, /allow create: if collection != 'tickets' && collection != 'maintenanceTickets' && !\(/);
    assert.match(finalRules, /allow update, delete: if collection != 'tickets' && collection != 'maintenanceTickets' && !\(/);
  });
});
