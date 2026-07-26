#!/usr/bin/env node

import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { signInWithRequiredTotpMfa } from './lib/firebase-mfa-sign-in.mjs';

const PROOF_PATH = 'launch_package/application-proof.json';
const MFA_REPLAY_GATES = new Set(['paymentUnlockExactlyOnce', 'brokerCommissionLockExactlyOnce']);
const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const founderEmail = text(process.env.E2E_FOUNDER_EMAIL).toLowerCase();
const founderPassword = text(process.env.E2E_FOUNDER_PASSWORD);
const founderTotpSecret = text(process.env.E2E_FOUNDER_TOTP_SECRET);
const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
const gate = text(process.env.OPERATIONAL_GATE);

if (founderEmail !== 'ceo@bin-groups.com' || !founderPassword || !founderTotpSecret || !apiKey) {
  throw new Error('Canonical Founder email, password, TOTP secret, and Firebase API key are required.');
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== 'function') throw new Error('Node fetch is required for protected operational evidence.');
let verifiedMfa = null;

globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof URL ? input.href : String(input?.url || input || '');
  if (!/identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword/.test(url)) {
    return originalFetch(input, init);
  }

  let requestBody;
  try {
    requestBody = JSON.parse(String(init?.body || '{}'));
  } catch {
    throw new Error('Operational Firebase sign-in request body is malformed.');
  }
  if (text(requestBody?.email).toLowerCase() !== founderEmail || text(requestBody?.password) !== founderPassword) {
    throw new Error('Operational finance replay attempted to use a non-Founder credential.');
  }

  verifiedMfa = await signInWithRequiredTotpMfa({
    apiKey,
    email: founderEmail,
    password: founderPassword,
    totpSecret: founderTotpSecret,
    referer: 'https://admin.bin-groups.com/',
    fetchImpl: originalFetch,
  });

  return new Response(JSON.stringify({
    idToken: verifiedMfa.idToken,
    localId: verifiedMfa.uid,
    registered: true,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

process.env.E2E_ADMIN_EMAIL = founderEmail;
process.env.E2E_ADMIN_PASSWORD = founderPassword;

await import('./verify-operational-application-evidence.mjs');

if (MFA_REPLAY_GATES.has(gate)) {
  if (!verifiedMfa?.uid || !verifiedMfa?.secondFactor) {
    throw new Error(`${gate} completed without a verified Firebase second-factor session.`);
  }
  if (!existsSync(PROOF_PATH)) throw new Error(`${PROOF_PATH} is missing after operational evidence verification.`);
  const proof = JSON.parse(readFileSync(PROOF_PATH, 'utf8'));
  if (proof?.status !== 'passed' || proof?.gate !== gate || !proof?.evidence) {
    throw new Error('Operational application proof is malformed or bound to another gate.');
  }
  proof.evidence.replayMfaVerified = true;
  proof.evidence.replayActorUidHash = sha256(verifiedMfa.uid);
  proof.evidence.replaySecondFactorHash = sha256(verifiedMfa.secondFactor);
  writeFileSync(PROOF_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
  console.log(`[operational-application-evidence-mfa] PASS gate=${gate} founderMfa=true`);
}
