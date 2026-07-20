#!/usr/bin/env node

/**
 * Retired local Admin-grant entrypoint.
 *
 * Local service-account or ADC scripts must not create Auth users, set passwords,
 * grant custom claims, activate Firestore profiles, or write privileged audit
 * records in production. Those mutations bypass App Check, Admin MFA, callable
 * authorization, protected-environment approval, and exact-SHA evidence.
 */

console.error(
  '[grant-admin] REFUSED: local Admin creation and role escalation are disabled. ' +
  'Use the dedicated Admin Staff Access page backed by the adminCreateUser callable. ' +
  'For initial founder recovery, use the protected Admin MFA bootstrap workflow and its runbook.',
);
process.exit(1);
