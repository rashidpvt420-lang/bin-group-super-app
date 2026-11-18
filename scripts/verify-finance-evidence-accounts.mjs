#!/usr/bin/env node
// Read-only Finance evidence pre-flight for the protected production business evidence.
// Fails fast (BLOCKED) when either Finance evidence identity cannot pass the live server money
// gate: explicit Finance role, enrolled TOTP, and financeAuthorizedAt younger than 24h with margin.
// It only calls getUserByEmail and reads staffAccess/{uid}; it never writes, never refreshes a
// grant and never prints a secret value (only secret names, masked identities and claim ages).

import admin from 'firebase-admin';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { requireFreshFinanceEvidenceAccounts } from './lib/finance-evidence-preflight.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const text = (value) => String(value ?? '').trim();

export const FINANCE_EVIDENCE_SECRET_NAMES = Object.freeze({
  approver: ['E2E_FINANCE_APPROVER_EMAIL', 'E2E_FINANCE_APPROVER_PASSWORD', 'E2E_FINANCE_APPROVER_TOTP_SECRET'],
  recorder: ['E2E_FINANCE_RECORDER_EMAIL', 'E2E_FINANCE_RECORDER_PASSWORD', 'E2E_FINANCE_RECORDER_TOTP_SECRET'],
});

export function missingFinanceEvidenceSecrets(env = process.env) {
  return [...FINANCE_EVIDENCE_SECRET_NAMES.approver, ...FINANCE_EVIDENCE_SECRET_NAMES.recorder]
    .filter((name) => !text(env[name]));
}

export function financeEvidenceAccounts(env = process.env) {
  return [
    {
      // Identity B: approves/returns Owner payments and approves, marks paid or rejects broker
      // payouts in the Admin panel, so it also needs the transactions and broker modules.
      label: 'Finance payment approver (E2E_FINANCE_APPROVER_EMAIL)',
      email: text(env.E2E_FINANCE_APPROVER_EMAIL),
      allowedRoles: new Set(['finance_admin']),
      requiredModules: ['transactions', 'broker'],
    },
    {
      // Identity A: records the Owner 15% receipt. finance_manager / finance_controller only:
      // the deploy's privileged-account cleanup keeps exactly one configured finance_admin.
      label: 'Finance receipt recorder (E2E_FINANCE_RECORDER_EMAIL)',
      email: text(env.E2E_FINANCE_RECORDER_EMAIL),
      allowedRoles: new Set(['finance_manager', 'finance_controller']),
    },
  ];
}

export async function main(env = process.env) {
  const missing = missingFinanceEvidenceSecrets(env);
  if (missing.length) {
    throw new Error(`BLOCKED: Finance evidence pre-flight cannot run. Missing repository secret(s): ${missing.join(', ')}. Values are never printed; add the secrets for two distinct Finance testers.`);
  }
  if (text(env.E2E_FINANCE_APPROVER_EMAIL).toLowerCase() === text(env.E2E_FINANCE_RECORDER_EMAIL).toLowerCase()) {
    throw new Error('BLOCKED: E2E_FINANCE_RECORDER_EMAIL and E2E_FINANCE_APPROVER_EMAIL must be two different people (dual control).');
  }
  const projectId = resolveFirebaseAdminProjectId();
  if (projectId !== EXPECTED_PROJECT_ID) throw new Error(`Finance evidence pre-flight must target ${EXPECTED_PROJECT_ID}; got ${projectId}.`);
  initializeFirebaseAdmin(admin, EXPECTED_PROJECT_ID);
  await requireFreshFinanceEvidenceAccounts({
    auth: admin.auth(),
    db: admin.firestore(),
    accounts: financeEvidenceAccounts(env),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[finance-evidence-preflight] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
