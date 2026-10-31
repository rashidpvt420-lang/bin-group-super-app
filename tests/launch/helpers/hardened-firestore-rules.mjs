// Builds the production-hardened Firestore rules the same way `npm run prepare:rules` does, but on a
// temporary copy. The checked-in firestore.rules is the pre-hardening source of truth and is never
// edited or rewritten by tests. Stage order must match the `prepare:rules` script in package.json.
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));

// Rules-only stages of prepare:rules (the storage-rules and write-production steps are omitted).
export const FIRESTORE_RULE_STAGES = [
  'normalize-firestore-rules.mjs',
  'harden-firestore-rules.mjs',
  'harden-firestore-warning-rules.mjs',
  'harden-owner-trust-rules.mjs',
  'harden-bin-connect-rules.mjs',
  'harden-system-secrets-rules.mjs',
  'harden-broker-kyc-rules.mjs',
  'apply-profile-admin-rule.mjs',
  'apply-ticket-rule-binding.mjs',
  'harden-hr-privacy-rules.mjs',
  'harden-final-firestore-authority.mjs',
  'harden-private-hr-authority.mjs',
  'harden-technician-live-location-authority.mjs',
  'harden-property-identity-registry-rules.mjs',
  'harden-painting-projects-rules.mjs',
];

/**
 * @param {{ stopBefore?: string }} [options] stopBefore: stage file name to stop in front of, so a test can
 *   run that stage itself (the rules returned are everything the pipeline produces before it).
 */
export function hardenedFirestoreRules({ stopBefore } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'hardened-rules-'));
  try {
    copyFileSync(join(root, 'firestore.rules'), join(directory, 'firestore.rules'));
    if (stopBefore && !FIRESTORE_RULE_STAGES.includes(stopBefore)) throw new Error(`unknown rules stage ${stopBefore}`);
    for (const stage of FIRESTORE_RULE_STAGES) {
      if (stage === stopBefore) break;
      execFileSync(process.execPath, [join(root, 'scripts', stage)], { cwd: directory, stdio: 'pipe' });
    }
    return readFileSync(join(directory, 'firestore.rules'), 'utf8');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
