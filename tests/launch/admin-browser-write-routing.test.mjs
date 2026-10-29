import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// #1887 removed Admin browser writes for these collections. Admin flows must use
// protected callables (adminOperationalMutation, adminAssignTechnician, ...), never direct writes.
const TIGHTENED = [
  'tickets', 'maintenanceTickets', 'amenities', 'amenityBookings', 'announcements', 'documentLibrary',
  'keyRegister', 'keyMovements', 'parcels', 'staffDirectory', 'communityPosts', 'conversations',
  'turnover-quotes', 'data_governance_events', 'jobPostings', 'contractorProfiles',
  'tenant_services_requests', 'assets', 'binGptEngineerCommands', 'tenant_invitations',
  'tenantInvitations', 'tenant_import_batches', 'tenancies', 'payment_collection_records',
];
const ADMIN_ROOTS = ['apps/admin-panel/src', 'src/admin'];
const WRITE = /(addDoc|setDoc|updateDoc|deleteDoc)\s*\(\s*(collection|doc)\s*\(\s*db\s*,\s*[`'"]([^`'"\/$]+)/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (!/node_modules|__tests__|build|dist/.test(name)) walk(path, out); }
    else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

test('admin UIs never write tightened collections directly from the browser', () => {
  const offenders = [];
  for (const root of ADMIN_ROOTS) {
    for (const file of walk(root)) {
      for (const m of readFileSync(file, 'utf8').matchAll(WRITE)) {
        if (TIGHTENED.includes(m[3])) offenders.push(`${file}: ${m[1]} ${m[3]}`);
      }
      if (/writeBatch\s*\(|runTransaction\s*\(/.test(readFileSync(file, 'utf8')) && TIGHTENED.some((c) => readFileSync(file, 'utf8').includes(`'${c}'`))) {
        offenders.push(`${file}: batch/transaction touching a tightened collection`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('every admin operational mutation action used by the UI is implemented server-side', () => {
  const server = readFileSync('functions/adminOperationalMutations.ts', 'utf8');
  const used = new Set();
  for (const root of ADMIN_ROOTS) for (const file of walk(root)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/runAdminOperationalMutation\(\s*'([A-Z_]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size > 0);
  for (const action of used) assert.ok(server.includes(action), `missing server action ${action}`);
});

test('payment collection records stay immutable from every browser', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  const block = rules.slice(rules.indexOf('match /payment_collection_records/'));
  assert.match(block.slice(0, block.indexOf('\n    }')), /allow create, update, delete: if false;/);
});

test('production deploy step has a timeout above the script budget', () => {
  const wf = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
  const m = wf.match(/- name: Deploy and verify Firebase production stack\n(?:\s*#.*\n)?\s*timeout-minutes: (\d+)/);
  assert.ok(m, 'deploy step must declare timeout-minutes');
  const budget = Number(readFileSync('scripts/deploy-firebase-production.mjs', 'utf8').match(/12600/) ? 12600 : NaN);
  assert.ok(Number(m[1]) * 60 > budget && Number(m[1]) < 360);
});
