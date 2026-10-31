#!/usr/bin/env node
/**
 * Step 2 (c): live cross-account read isolation probes. READ-ONLY: no document is created,
 * updated or deleted. Only the protected E2E test accounts and the e2e-live-role-property scope
 * are used. Every probe pairs a positive control (the actor reads its own record through the same
 * App Check + ID-token channel) with the denial probe, so a broken channel can never pass as "denied".
 *
 * Env: VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID, VITE_FIREBASE_PROJECT_ID,
 *      VITE_FIREBASE_APPCHECK_DEBUG_TOKEN, E2E_{OWNER,TENANT,TECHNICIAN,BROKER}_{EMAIL,PASSWORD},
 *      optional second accounts E2E_OWNER_B_*, E2E_TENANT_B_*, E2E_TECHNICIAN_B_*.
 *      Targets come from LIVE_ISOLATION_TARGETS (JSON) written by the fixture preparer.
 * Missing second accounts yield NOT_RUN (never PASS). Exit 1 on any LEAK or channel failure;
 * exit 2 if strict and anything is NOT_RUN.
 */
import { writeFileSync } from 'node:fs';

const FORBIDDEN_EMAILS = new Set(['technician@bin-groups.com']);
const env = (k) => String(process.env[k] || '').trim();

export function accountsFromEnv(e = process.env) {
  const g = (k) => String(e[k] || '').trim();
  const pair = (p) => (g(`${p}_EMAIL`) && g(`${p}_PASSWORD`) ? { email: g(`${p}_EMAIL`).toLowerCase(), password: g(`${p}_PASSWORD`) } : null);
  const out = {
    owner: pair('E2E_OWNER'), ownerB: pair('E2E_OWNER_B'), tenant: pair('E2E_TENANT'), tenantB: pair('E2E_TENANT_B'),
    technician: pair('E2E_TECHNICIAN'), technicianB: pair('E2E_TECHNICIAN_B'), broker: pair('E2E_BROKER'),
  };
  for (const [k, v] of Object.entries(out)) {
    if (v && FORBIDDEN_EMAILS.has(v.email)) throw new Error(`${k} uses a forbidden real account; refusing to run.`);
  }
  if (out.technicianB && out.technician && out.technicianB.email === out.technician.email) throw new Error('E2E_TECHNICIAN_B must be a distinct account.');
  return out;
}

/** Probe plan: [actor, ownRecordPath (positive control), foreignRecordPath (must be denied)] */
export function buildPlan(t) {
  return [
    { id: 'owner-A-vs-owner-B-property', actor: 'owner', own: `properties/${t.ownerProperty}`, foreign: t.ownerBProperty && `properties/${t.ownerBProperty}`, needs: 'ownerB' },
    { id: 'owner-B-vs-owner-A-property', actor: 'ownerB', own: t.ownerBProperty && `properties/${t.ownerBProperty}`, foreign: `properties/${t.ownerProperty}`, needs: 'ownerB' },
    { id: 'tenant-vs-other-tenant-unit', actor: 'tenant', own: `users/${t.tenantUid}`, foreign: t.tenantBUnit && `units/${t.tenantBUnit}`, needs: 'tenantB' },
    { id: 'tenant-vs-owner-contract', actor: 'tenant', own: `users/${t.tenantUid}`, foreign: t.ownerContract && `contracts/${t.ownerContract}` },
    { id: 'broker-vs-owner-property', actor: 'broker', own: `users/${t.brokerUid}`, foreign: `properties/${t.ownerProperty}` },
    { id: 'broker-vs-owner-payment', actor: 'broker', own: `users/${t.brokerUid}`, foreign: t.ownerContract && `payment_transactions/${t.ownerContract}` },
    { id: 'technician-A-vs-technician-B-job', actor: 'technician', own: `users/${t.technicianUid}`, foreign: t.technicianBTicket && `tickets/${t.technicianBTicket}`, needs: 'technicianB' },
    { id: 'technician-B-vs-technician-A-job', actor: 'technicianB', own: t.technicianBUid && `users/${t.technicianBUid}`, foreign: t.technicianTicket && `tickets/${t.technicianTicket}`, needs: 'technicianB' },
  ];
}

export function classify({ ownStatus, foreignStatus }) {
  if (ownStatus !== 200) return 'CHANNEL_FAIL';
  if (foreignStatus === 200) return 'LEAK';
  if (foreignStatus === 403) return 'PASS';
  return 'INCONCLUSIVE';
}

async function signIn(apiKey, { email, password }) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!r.ok) throw new Error(`sign-in failed (${r.status})`);
  return (await r.json()).idToken;
}
async function appCheckToken(projectNumberOrId, appId, apiKey, debugToken) {
  const r = await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${projectNumberOrId}/apps/${appId}:exchangeDebugToken?key=${apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ debugToken }),
  });
  if (!r.ok) throw new Error(`App Check exchange failed (${r.status})`);
  return (await r.json()).token;
}
async function read(projectId, path, idToken, ac) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`, {
    headers: { authorization: `Bearer ${idToken}`, 'x-firebase-appcheck': ac },
  });
  return r.status;
}

async function main() {
  const strict = process.argv.includes('--strict');
  const apiKey = env('VITE_FIREBASE_API_KEY'); const appId = env('VITE_FIREBASE_APP_ID'); const projectId = env('VITE_FIREBASE_PROJECT_ID') || 'bin-group-57c60';
  const targets = JSON.parse(env('LIVE_ISOLATION_TARGETS') || '{}');
  if (!apiKey || !appId || !env('VITE_FIREBASE_APPCHECK_DEBUG_TOKEN') || !targets.ownerProperty) throw new Error('Missing Firebase web config, App Check debug token or LIVE_ISOLATION_TARGETS.');
  if (targets.ownerProperty !== 'e2e-live-role-property') throw new Error('Owner target must be the protected test property e2e-live-role-property.');
  const accounts = accountsFromEnv();
  const ac = await appCheckToken(projectId, appId, apiKey, env('VITE_FIREBASE_APPCHECK_DEBUG_TOKEN'));
  const tokens = {};
  const results = [];
  for (const probe of buildPlan(targets)) {
    if ((probe.needs && !accounts[probe.needs]) || !accounts[probe.actor] || !probe.own || !probe.foreign) {
      results.push({ id: probe.id, result: 'NOT_RUN', reason: probe.needs && !accounts[probe.needs] ? `${probe.needs} test account not configured` : 'target not provisioned' });
      continue;
    }
    tokens[probe.actor] ||= await signIn(apiKey, accounts[probe.actor]);
    const ownStatus = await read(projectId, probe.own, tokens[probe.actor], ac);
    const foreignStatus = await read(projectId, probe.foreign, tokens[probe.actor], ac);
    results.push({ id: probe.id, ownStatus, foreignStatus, result: classify({ ownStatus, foreignStatus }) });
  }
  const report = { generatedAt: new Date().toISOString(), readOnly: true, results };
  writeFileSync(process.env.LIVE_ISOLATION_REPORT || 'live-cross-account-isolation.json', JSON.stringify(report, null, 2));
  console.table(results);
  if (results.some((r) => ['LEAK', 'CHANNEL_FAIL', 'INCONCLUSIVE'].includes(r.result))) process.exit(1);
  if (strict && results.some((r) => r.result === 'NOT_RUN')) process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(`[live-isolation] ${e.message}`); process.exit(1); });
