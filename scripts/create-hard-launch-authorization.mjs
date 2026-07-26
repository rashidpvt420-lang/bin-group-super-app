#!/usr/bin/env node

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AUTHORIZATION_KIND,
  AUTHORIZATION_MAX_AGE_MS,
  DEPLOY_CONFIRMATION_PHRASE,
  HARD_LAUNCH_CONFIRMATION_PHRASE,
  HARD_LAUNCH_CONTROL_SCHEMA,
  parseCsvRequired,
  sha256Text,
  signDocument,
  validateAuthorizationDocument,
} from './lib/hard-launch-control.mjs';
import { normalizeAuthorizedEmail } from './lib/identity-normalization.mjs';

const AUTOMATION_ACTOR = 'github-actions[bot]';
const AUTOMATION_EMAIL_SENTINEL = 'authorized-founder@protected.invalid';
const OWNER_REQUEST_TITLE = 'Dispatch protected bank pilot workflow';
const OWNER_REQUEST_BRANCH_PREFIX = 'ops/dispatch-bank-pilot-workflow-';
const OWNER_REQUEST_MARKER = '.github/bank-pilot-dispatch-request';
const REQUIRED_INCIDENT_REFERENCE = 'https://github.com/rashidpvt420-lang/bin-group-super-app/issues/434';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error(`${label} is missing or malformed`);
  }
}

async function fetchGithubJson(url, label) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'bin-group-founder-authorization-verifier',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'error',
    });
  } catch {
    throw new Error(`${label} could not be fetched`);
  }
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned malformed JSON`);
  }
}

function parseMarker(content) {
  const values = new Map();
  const lines = String(content || '').replace(/\r\n?/g, '\n').trimEnd().split('\n');
  if (lines.length !== 5) throw new Error('owner request marker must contain exactly five lines');
  for (const line of lines) {
    const separator = line.indexOf('=');
    if (separator <= 0) throw new Error('owner request marker contains a malformed line');
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (values.has(key)) throw new Error('owner request marker contains a duplicate key');
    values.set(key, value);
  }
  if (values.get('request') !== 'dispatch-protected-bank-pilot') {
    throw new Error('owner request marker request is invalid');
  }
  if (!/^\d+$/.test(values.get('review_workflow_run_id') || '')) {
    throw new Error('owner request marker review run ID is invalid');
  }
  if (values.get('incident_evidence_refs') !== REQUIRED_INCIDENT_REFERENCE) {
    throw new Error('owner request marker incident evidence is invalid');
  }
  if (values.get('public_release_gate') !== 'false') {
    throw new Error('owner request marker must keep the public gate disabled');
  }
  if (values.get('hard_launch_claim') !== 'false') {
    throw new Error('owner request marker must not claim hard launch');
  }
}

async function resolveAutomatedFounder({ repository, commitSha, workflowActor, authorizedActors, authorizedEmails }) {
  if (workflowActor.toLowerCase() !== AUTOMATION_ACTOR) {
    throw new Error('automated Founder identity may only be resolved for github-actions[bot]');
  }
  if (!authorizedActors.includes(AUTOMATION_ACTOR)) {
    throw new Error('automation workflow actor is not authorized');
  }
  if (authorizedEmails.length !== 1) {
    throw new Error('automated Founder authorization requires exactly one protected Founder email');
  }

  const incidents = readJson(
    path.resolve('launch_package/production-incidents.json'),
    'production-incidents.json',
  );
  const references = Array.isArray(incidents.evidenceReferences) ? incidents.evidenceReferences : [];
  const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const requestPattern = new RegExp(`^https://github\\.com/${escapedRepository}/pull/([1-9][0-9]*)$`);
  const matches = references
    .map((reference) => requestPattern.exec(String(reference || '').trim()))
    .filter(Boolean);
  if (matches.length !== 1) {
    throw new Error('production incident evidence must identify exactly one owner bank-pilot request PR');
  }
  const pullNumber = matches[0][1];
  const apiRoot = `https://api.github.com/repos/${repository}`;
  const pull = await fetchGithubJson(`${apiRoot}/pulls/${pullNumber}`, 'owner request PR');
  const repositoryOwner = repository.split('/')[0].toLowerCase();
  const founderActor = String(pull?.user?.login || '').trim().toLowerCase();

  if (pull?.state !== 'open' || pull?.draft !== true) throw new Error('owner request PR must remain open and draft');
  if (pull?.title !== OWNER_REQUEST_TITLE) throw new Error('owner request PR title is invalid');
  if (pull?.base?.ref !== 'main' || pull?.base?.sha !== commitSha) {
    throw new Error('owner request PR is not bound to this exact main SHA');
  }
  if (pull?.head?.repo?.full_name !== repository) throw new Error('owner request PR must use the same repository');
  if (!String(pull?.head?.ref || '').startsWith(OWNER_REQUEST_BRANCH_PREFIX)) {
    throw new Error('owner request PR branch is invalid');
  }
  if (founderActor !== repositoryOwner) throw new Error('owner request PR was not opened by the repository owner');
  if (!/^[a-z0-9-]+$/.test(founderActor) || !authorizedActors.includes(founderActor)) {
    throw new Error('owner request PR Founder actor is not authorized');
  }

  const files = await fetchGithubJson(`${apiRoot}/pulls/${pullNumber}/files?per_page=100`, 'owner request file list');
  if (!Array.isArray(files) || files.length !== 1 || files[0]?.filename !== OWNER_REQUEST_MARKER) {
    throw new Error('owner request PR must change only the canonical marker');
  }
  const marker = await fetchGithubJson(
    `${apiRoot}/contents/${OWNER_REQUEST_MARKER}?ref=${encodeURIComponent(String(pull.head.sha || ''))}`,
    'owner request marker',
  );
  if (marker?.encoding !== 'base64' || typeof marker?.content !== 'string') {
    throw new Error('owner request marker response is invalid');
  }
  parseMarker(Buffer.from(marker.content.replace(/\s+/g, ''), 'base64').toString('utf8'));

  return {
    actor: founderActor,
    founderEmail: authorizedEmails[0],
    ownerRequestPullRequest: Number(pullNumber),
  };
}

try {
  const commitSha = requiredEnv('GITHUB_SHA');
  const ref = requiredEnv('GITHUB_REF');
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const runId = requiredEnv('GITHUB_RUN_ID');
  const runAttempt = Number(requiredEnv('GITHUB_RUN_ATTEMPT'));
  const workflowActor = requiredEnv('GITHUB_ACTOR').toLowerCase();
  const founderName = requiredEnv('FOUNDER_NAME');
  const requestedFounderEmail = normalizeAuthorizedEmail(requiredEnv('FOUNDER_EMAIL'));
  const deployConfirmation = requiredEnv('DEPLOYMENT_CONFIRMATION');
  const hardLaunchConfirmation = requiredEnv('HARD_LAUNCH_CONFIRMATION');
  const hmacKey = requiredEnv('HARD_LAUNCH_APPROVAL_HMAC_KEY');
  const authorizedActorsRaw = requiredEnv('AUTHORIZED_FOUNDER_ACTORS');
  const authorizedEmailsRaw = requiredEnv('AUTHORIZED_FOUNDER_EMAILS');

  if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('GITHUB_SHA must be a lowercase 40-character SHA');
  if (ref !== 'refs/heads/main') throw new Error('hard-launch authorization may only be created for refs/heads/main');
  if (deployConfirmation !== DEPLOY_CONFIRMATION_PHRASE) throw new Error('production deployment confirmation phrase mismatch');
  if (hardLaunchConfirmation !== HARD_LAUNCH_CONFIRMATION_PHRASE) throw new Error('hard-launch confirmation phrase mismatch');

  const authorizedActors = parseCsvRequired(authorizedActorsRaw, 'AUTHORIZED_FOUNDER_ACTORS');
  const authorizedEmails = parseCsvRequired(authorizedEmailsRaw, 'AUTHORIZED_FOUNDER_EMAILS');
  let actor = workflowActor;
  let founderEmail = requestedFounderEmail;
  let ownerRequestPullRequest = null;

  if (requestedFounderEmail === AUTOMATION_EMAIL_SENTINEL) {
    const automated = await resolveAutomatedFounder({
      repository,
      commitSha,
      workflowActor,
      authorizedActors,
      authorizedEmails,
    });
    actor = automated.actor;
    founderEmail = automated.founderEmail;
    ownerRequestPullRequest = automated.ownerRequestPullRequest;
  } else {
    if (workflowActor === AUTOMATION_ACTOR) {
      throw new Error('automated Founder authorization requires the protected email sentinel and owner PR evidence');
    }
    if (!authorizedActors.includes(actor)) throw new Error('workflow actor is not an authorized Founder actor');
    if (!authorizedEmails.includes(founderEmail)) throw new Error('Founder email is not authorized');
  }

  const issuedAtMs = Date.now();
  const payload = {
    schemaVersion: HARD_LAUNCH_CONTROL_SCHEMA,
    kind: AUTHORIZATION_KIND,
    approved: true,
    scope: 'production-deploy-and-conditional-hard-launch-decision',
    commitSha,
    ref,
    repository,
    runId,
    runAttempt,
    actor,
    workflowActor,
    ownerRequestPullRequest,
    founder: {
      name: founderName,
      email: founderEmail,
    },
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + AUTHORIZATION_MAX_AGE_MS).toISOString(),
    deployConfirmationDigest: sha256Text(DEPLOY_CONFIRMATION_PHRASE),
    hardLaunchConfirmationDigest: sha256Text(HARD_LAUNCH_CONFIRMATION_PHRASE),
  };

  const document = signDocument(payload, hmacKey);
  const validationErrors = validateAuthorizationDocument(document, {
    commitSha,
    ref,
    repository,
    runId,
    actor,
    authorizedActors: authorizedActorsRaw,
    authorizedEmails: authorizedEmailsRaw,
    hmacKey,
  });
  if (validationErrors.length) throw new Error(`generated authorization failed validation:\n- ${validationErrors.join('\n- ')}`);

  const outputPath = path.resolve('launch_package/hard-launch-authorization.json');
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  const githubEnv = String(process.env.GITHUB_ENV || '').trim();
  if (githubEnv) appendFileSync(githubEnv, `AUTHORIZATION_ACTOR=${actor}\n`, 'utf8');
  console.log(`[hard-launch-auth] wrote ${outputPath}`);
  console.log(`[hard-launch-auth] commitSha=${commitSha}`);
  console.log(`[hard-launch-auth] authorizationActor=${actor}`);
  console.log(`[hard-launch-auth] workflowActor=${workflowActor}`);
  console.log('[hard-launch-auth] Founder authorization signed and bound to this workflow run');
} catch (error) {
  console.error(`[hard-launch-auth] REFUSED: ${error instanceof Error ? error.message : 'unknown failure'}`);
  process.exit(1);
}
