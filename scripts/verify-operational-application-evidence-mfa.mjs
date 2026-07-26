#!/usr/bin/env node

import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { signInWithRequiredTotpMfa } from './lib/firebase-mfa-sign-in.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const PROOF_PATH = 'launch_package/application-proof.json';
const PAGE_SIZE = 250;
const MFA_REPLAY_GATES = new Set(['paymentUnlockExactlyOnce', 'brokerCommissionLockExactlyOnce']);
const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const gate = text(process.env.OPERATIONAL_GATE);
const mfaRequired = MFA_REPLAY_GATES.has(gate);

if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REPOSITORY !== REPOSITORY ||
  process.env.GITHUB_REF !== 'refs/heads/main' ||
  process.env.GITHUB_WORKFLOW !== 'Operational Application Evidence' ||
  process.env.GITHUB_JOB !== 'verify-and-publish'
) {
  throw new Error('Operational MFA evidence requires the protected exact-main workflow.');
}

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) throw new Error(`Unexpected Firebase project: ${projectId || '(missing)'}.`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();

async function readAllMatchingSnapshot(baseQuery) {
  const documents = [];
  let cursor = null;
  for (;;) {
    let pageQuery = baseQuery
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    documents.push(...page.docs);
    if (page.size < PAGE_SIZE) {
      return Object.freeze({
        docs: documents,
        size: documents.length,
        empty: documents.length === 0,
        forEach(callback, thisArg) {
          documents.forEach((document) => callback.call(thisArg, document));
        },
      });
    }
    cursor = page.docs[page.docs.length - 1];
  }
}

function installPaginatedQueryProxy() {
  const hadOwnCollection = Object.prototype.hasOwnProperty.call(db, 'collection');
  const originalDescriptor = hadOwnCollection ? Object.getOwnPropertyDescriptor(db, 'collection') : null;
  const originalCollection = db.collection.bind(db);
  const chainMethods = new Set([
    'where',
    'orderBy',
    'startAt',
    'startAfter',
    'endAt',
    'endBefore',
    'select',
    'offset',
  ]);

  const wrapQuery = (query) => new Proxy(query, {
    get(target, property, receiver) {
      if (property === 'limit') {
        return (requestedLimit) => {
          const requested = Number(requestedLimit);
          if (!Number.isInteger(requested) || requested <= 0) {
            throw new Error('Operational evidence query limit must be a positive integer.');
          }
          return Object.freeze({ get: () => readAllMatchingSnapshot(target) });
        };
      }
      if (chainMethods.has(property)) {
        return (...args) => wrapQuery(target[property](...args));
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  Object.defineProperty(db, 'collection', {
    configurable: true,
    writable: true,
    value: (collectionPath) => wrapQuery(originalCollection(collectionPath)),
  });

  return () => {
    if (hadOwnCollection && originalDescriptor) Object.defineProperty(db, 'collection', originalDescriptor);
    else delete db.collection;
  };
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== 'function') throw new Error('Node fetch is required for protected operational evidence.');
let verifiedMfa = null;

if (mfaRequired) {
  const founderEmail = text(process.env.E2E_FOUNDER_EMAIL).toLowerCase();
  const founderPassword = text(process.env.E2E_FOUNDER_PASSWORD);
  const founderTotpSecret = text(process.env.E2E_FOUNDER_TOTP_SECRET);
  const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
  if (founderEmail !== 'ceo@bin-groups.com' || !founderPassword || !founderTotpSecret || !apiKey) {
    throw new Error('Canonical Founder email, password, TOTP secret, and Firebase API key are required for replay evidence.');
  }

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
}

const restoreCollection = installPaginatedQueryProxy();
try {
  await import('./verify-operational-application-evidence.mjs');
} finally {
  restoreCollection();
  globalThis.fetch = originalFetch;
}

if (mfaRequired) {
  if (!verifiedMfa?.uid || verifiedMfa?.secondFactorType !== 'totp' || !verifiedMfa?.secondFactorIdentifier) {
    throw new Error(`${gate} completed without a Firebase Admin-verified TOTP session.`);
  }
  if (!existsSync(PROOF_PATH)) throw new Error(`${PROOF_PATH} is missing after operational evidence verification.`);
  const proof = JSON.parse(readFileSync(PROOF_PATH, 'utf8'));
  if (proof?.status !== 'passed' || proof?.gate !== gate || !proof?.evidence) {
    throw new Error('Operational application proof is malformed or bound to another gate.');
  }
  proof.evidence.replayMfaVerified = true;
  proof.evidence.replayActorUidHash = sha256(verifiedMfa.uid);
  proof.evidence.replaySecondFactorHash = sha256(verifiedMfa.secondFactorIdentifier);
  proof.evidence.selectorPaginationVerified = true;
  writeFileSync(PROOF_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
  console.log(`[operational-application-evidence-mfa] PASS gate=${gate} founderTotp=true pagination=true`);
}
