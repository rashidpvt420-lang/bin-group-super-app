import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { FIRESTORE_RULE_STAGES } from './helpers/hardened-firestore-rules.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const indexKey = (index) => JSON.stringify([
  index.collectionGroup,
  index.queryScope,
  (index.fields || []).map((field) => [field.fieldPath, field.order || field.arrayConfig || null]),
]);
const indexes = JSON.parse(read('firestore.indexes.json')).indexes;

test('firestore.indexes.json has no duplicate composite indexes', () => {
  const seen = new Map();
  for (const index of indexes) {
    const key = indexKey(index);
    assert.ok(!seen.has(key), `duplicate composite index: ${key}`);
    seen.set(key, true);
  }
});

test('composite indexes exist for the four queries that previously had none', () => {
  const has = (collectionGroup, fields) => indexes.some((index) => indexKey(index) === indexKey({
    collectionGroup,
    queryScope: 'COLLECTION',
    fields: fields.map(([fieldPath, order]) => ({ fieldPath, order })),
  }));
  // functions/rentSchedule.ts: status in [...] + dueDate <= horizon
  assert.match(read('functions/rentSchedule.ts'), /where\("status", ?"in"[\s\S]{0,80}where\("dueDate", ?"<="/);
  assert.ok(has('rent_installments', [['status', 'ASCENDING'], ['dueDate', 'ASCENDING']]));
  // functions/index.ts onApprovalStagnant: status == X + updatedAt < cutoff
  assert.match(read('functions/index.ts'), /where\("status", ?"==", ?"AWAITING_OWNER_APPROVAL"\)\s*\.where\("updatedAt", ?"<"/);
  assert.ok(has('maintenanceTickets', [['status', 'ASCENDING'], ['updatedAt', 'ASCENDING']]));
  // functions/whatsappBot.ts: reporterPhone == X ordered by createdAt desc
  assert.match(read('functions/whatsappBot.ts'), /where\("reporterPhone", ?"==", ?from\)\s*\.orderBy\("createdAt", ?"desc"\)/);
  assert.ok(has('maintenanceTickets', [['reporterPhone', 'ASCENDING'], ['createdAt', 'DESCENDING']]));
  // SovereignSupportChat: chatId == X ordered by createdAt asc
  assert.match(read('src/components/SovereignSupportChat.tsx'), /where\('chatId', '==', targetUserId\),\s*orderBy\('createdAt', 'asc'\)/);
  assert.ok(has('support_chats', [['chatId', 'ASCENDING'], ['createdAt', 'ASCENDING']]));
});

test('hardened-rules test helper runs the same firestore stages, in the same order, as prepare:rules', () => {
  const prepare = JSON.parse(read('package.json')).scripts['prepare:rules'];
  const scripts = JSON.parse(read('package.json')).scripts;
  const expanded = prepare.split('&&').map((step) => step.trim()).map((step) => {
    const named = step.match(/^npm run ([\w:.-]+)$/);
    return named ? scripts[named[1]] : step;
  }).map((step) => step.match(/^node scripts\/([\w.-]+\.mjs)$/)?.[1]).filter(Boolean);
  const rulesOnly = expanded.filter((file) => !['harden-private-hr-storage.mjs', 'write-production-firestore-rules.mjs'].includes(file));
  assert.deepEqual(FIRESTORE_RULE_STAGES, rulesOnly);
});

test('the two formerly stale tests build hardened rules instead of reading raw firestore.rules', () => {
  const dispute = read('tests/launch/dispute-closed-ticket-guards.test.mjs');
  assert.match(dispute, /hardenedFirestoreRules\(\)/);
  assert.doesNotMatch(dispute, /read\('firestore\.rules'\)/);
  for (const assertion of [
    'doesNotMatch(rules, /function safeAdminTicketCreate\\(\\)/)',
    'doesNotMatch(rules, /function safeAdminTicketUpdate\\(\\)/)',
    'match(rules, /allow create: if false;/)',
    'match(rules, /allow update: if safeTicketUpdateByActor\\(\\);/)',
  ]) assert.ok(dispute.includes(assertion), `assertion kept: ${assertion}`);
  const connect = read('tests/launch/bin-connect-hardener-scope.test.mjs');
  assert.match(connect, /hardenedFirestoreRules\(\{ stopBefore: 'harden-final-firestore-authority\.mjs' \}\)/);
  assert.match(connect, /assert\.equal\(\(finalRules\.match\(\/'binConnectThreads'\/g\) \|\| \[\]\)\.length, 2\)/);
});

test('broker documents and support chat listeners surface errors instead of swallowing them', () => {
  const docs = read('src/broker/pages/BrokerDocumentsPage.tsx');
  assert.match(docs, /onSnapshot\(q, \(snap\) => \{[\s\S]*?\}, \(err\) => \{[\s\S]*?setLoadError\([^)]+\);[\s\S]*?setLoading\(false\);/);
  assert.match(docs, /data-testid="broker-documents-load-error"/);
  const chat = read('src/components/SovereignSupportChat.tsx');
  assert.match(chat, /onSnapshot\(q, \(snap\) => \{[\s\S]*?\}, \(err\) => \{[\s\S]*?setChatError\([^)]+\);/);
  assert.match(chat, /data-testid="support-chat-error"/);
  assert.match(chat, /catch \(err\) \{[\s\S]*?setInput\(text\);[\s\S]*?setChatError\(/);
});

test('markEndedLeasesVacant has an explicit timeout and batches unit reads without changing behaviour', () => {
  const source = read('functions/unitVacancy.ts');
  const timeout = Number(source.match(/export const markEndedLeasesVacant = onSchedule\(\{[^}]*timeoutSeconds: (\d+)/)?.[1]);
  assert.ok(timeout >= 300 && timeout <= 1800, `timeoutSeconds ${timeout}`);
  const sweep = source.slice(source.indexOf('export async function runEndedLeaseVacancySweep'), source.indexOf('export const markEndedLeasesVacant'));
  assert.match(sweep, /db\.getAll\(\.\.\.unitIds\.map/);
  assert.doesNotMatch(sweep, /collection\("units"\)\.doc\(unitId\)\.get\(\)/);
  // A later lease on the same unit must still see the earlier write, as the old sequential reads did.
  assert.match(sweep, /units\.set\(unitId, \{ \.\.\.unit, occupancyStatus: "VACANT" \}\)/);
  // Unchanged: still gated by autoVacateEnabled, same writes, same health document.
  assert.match(sweep, /if \(enabled\) \{/);
  assert.match(sweep, /vacancyReason: "LEASE_ENDED"/);
  assert.match(sweep, /leaseStatus: "ended"/);
  assert.match(sweep, /system_health"\)\.doc\("unitVacancy"\)/);
});

test('scratch files removed from the repo root stay removed and are ignored', () => {
  const junk = ['__noop__', 'build-errors.txt', 'lint_results.txt', 'local-git-status-before-fix.txt', 'local-hardening-backup.patch',
    'otp_commit.diff', 'tmp-safety-test.txt', 'tmp-write-test.txt', 'tsc-errors.txt', 'sites.txt', 'NEXT_ERRORS_TO_SEND_TO_CHATGPT.md'];
  for (const file of junk) assert.ok(!existsSync(new URL(`../../${file}`, import.meta.url)), `${file} should not exist`);
  const ignore = read('.gitignore');
  for (const pattern of ['/tmp-*-test.txt', '/lint_results.txt', '/local-hardening-backup.patch']) assert.ok(ignore.includes(pattern));
});
