import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const read = (path) => readFileSync(path, 'utf8');
const service = read('src/lib/ticketSystemService.ts');
const ticketRuleBinding = read('scripts/apply-ticket-rule-binding.mjs');
const packageJson = JSON.parse(read('package.json'));

function sourceFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

const browserSourceFiles = ['src', 'apps', 'packages']
  .flatMap((root) => sourceFiles(root))
  .filter((path) => !path.includes('/dist/') && !path.includes('/build/') && !path.includes('/node_modules/'));

const legacyMutationPatterns = [
  /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*['"]tickets['"]/, 
  /setDoc\s*\(\s*doc\s*\(\s*db\s*,\s*['"]tickets['"]/, 
  /updateDoc\s*\(\s*doc\s*\(\s*db\s*,\s*['"]tickets['"]/, 
  /deleteDoc\s*\(\s*doc\s*\(\s*db\s*,\s*['"]tickets['"]/, 
  /batch\.(?:set|update|delete)\s*\(\s*doc\s*\(\s*db\s*,\s*['"]tickets['"]/, 
];

test('TicketSystemService creates and mutates only canonical maintenance tickets', () => {
  assert.match(service, /CANONICAL_TICKET_COLLECTION = 'maintenanceTickets'/);
  assert.match(service, /LEGACY_TICKET_COLLECTION = 'tickets'/);
  assert.match(service, /addDoc\(collection\(db, CANONICAL_TICKET_COLLECTION\)/);
  assert.match(service, /httpsCallable\(functions, 'adminAssignTechnician'\)/);
  assert.match(service, /httpsCallable\(functions, 'updateTicketLifecycle'\)/);
  assert.match(service, /httpsCallable\(functions, 'tenantReviewTicketCompletion'\)/);
  assert.match(service, /legacyReadOnly: sourceCollection === LEGACY_TICKET_COLLECTION/);
  assert.match(service, /mergeCanonicalWithLegacy\(canonical, legacy\)/);
  assert.doesNotMatch(service, /collection\(db, ['"]tickets['"]\)/);
  assert.doesNotMatch(service, /doc\(db, ['"]tickets['"]\)/);
});

test('No browser source directly mutates the legacy tickets collection', () => {
  const offenders = [];
  for (const path of browserSourceFiles) {
    const content = read(path);
    if (legacyMutationPatterns.some((pattern) => pattern.test(content))) offenders.push(path);
  }
  assert.deepEqual(offenders, []);
});

test('Ticket rule preparation repeatedly enforces read-only legacy compatibility', () => {
  assert.equal(packageJson.scripts['harden:ticket-binding'], 'node scripts/apply-ticket-rule-binding.mjs');
  assert.match(packageJson.scripts['prepare:rules'], /harden:ticket-binding/);
  assert.match(ticketRuleBinding, /replaceMatchBlock\(legacyHeader, legacyReadOnlyBlock, 'legacy \/tickets'\)/);
  assert.match(ticketRuleBinding, /allow create, update, delete: if false/);
  assert.match(ticketRuleBinding, /Canonical \/maintenanceTickets fragment is missing/);
  assert.match(ticketRuleBinding, /read-only legacy tickets/);

  const directory = mkdtempSync(join(tmpdir(), 'bin-ticket-rules-'));
  const scriptPath = resolve('scripts/apply-ticket-rule-binding.mjs');
  const rulesPath = join(directory, 'firestore.rules');
  try {
    copyFileSync('firestore.rules', rulesPath);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      execFileSync(process.execPath, [scriptPath], {
        cwd: directory,
        stdio: 'pipe',
      });
    }
    const hardened = read(rulesPath);
    assert.match(hardened, /match \/tickets\/\{ticketId\} \{\s*allow read:[\s\S]*allow create, update, delete: if false;\s*\}/);
    assert.doesNotMatch(hardened, /match \/tickets\/\{ticketId\} \{[\s\S]*?allow update: if safeTicketUpdateByActor\(\);[\s\S]*?\}/);
    assert.match(hardened, /match \/maintenanceTickets\/\{ticketId\} \{[\s\S]*?allow create: if isAdmin\(\) \|\| canCreateTenantBoundTicket/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
