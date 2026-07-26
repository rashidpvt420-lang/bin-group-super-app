import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [dispatcher, signer, predeploy, sameRun, decision] = await Promise.all([
  readFile(new URL('../../.github/workflows/bank-pilot-dispatch.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/create-hard-launch-authorization.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/hard-launch-predeploy-gate.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/verify-same-run-deployment-artifact.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/hard-launch-decision-gate.mjs', import.meta.url), 'utf8'),
]);

test('bank-pilot automation never hardcodes a protected Founder email', () => {
  assert.match(dispatcher, /FOUNDER_EMAIL: authorized-founder@protected\.invalid/);
  assert.doesNotMatch(dispatcher, /FOUNDER_EMAIL: ceo@bin-groups\.com/);
  assert.match(dispatcher, /owner_request_reference="https:\/\/github\.com\/\$REPOSITORY\/pull\/\$REQUEST_PR"/);
  assert.match(dispatcher, /incident_references="\$INCIDENT_REFERENCE,\$owner_request_reference"/);
  assert.match(dispatcher, /incident_evidence_refs:\$incidentReferences/);
  assert.match(dispatcher, /ownerRequestPullRequest:\$ownerRequestPullRequest/);
});

test('automated signer independently revalidates the canonical owner PR', () => {
  assert.match(signer, /AUTOMATION_ACTOR = 'github-actions\[bot\]'/);
  assert.match(signer, /AUTOMATION_EMAIL_SENTINEL = 'authorized-founder@protected\.invalid'/);
  assert.match(signer, /production-incidents\.json/);
  assert.match(signer, /evidenceReferences/);
  assert.match(signer, /\/pull\/\(\[1-9\]\[0-9\]\*\)/);
  assert.match(signer, /pull\?\.state !== 'open' \|\| pull\?\.draft !== true/);
  assert.match(signer, /pull\?\.base\?\.ref !== 'main' \|\| pull\?\.base\?\.sha !== commitSha/);
  assert.match(signer, /pull\?\.head\?\.repo\?\.full_name !== repository/);
  assert.match(signer, /OWNER_REQUEST_BRANCH_PREFIX/);
  assert.match(signer, /founderActor !== repositoryOwner/);
  assert.match(signer, /authorizedActors\.includes\(founderActor\)/);
  assert.match(signer, /files\.length !== 1 \|\| files\[0\]\?\.filename !== OWNER_REQUEST_MARKER/);
  assert.match(signer, /parseMarker\(Buffer\.from/);
  assert.match(signer, /owner request marker must keep the public gate disabled/);
  assert.match(signer, /owner request marker must not claim hard launch/);
});

test('automated email derives from exactly one protected allowlist entry', () => {
  assert.match(signer, /authorizedEmails\.length !== 1/);
  assert.match(signer, /founderEmail: authorizedEmails\[0\]/);
  assert.match(signer, /automated Founder authorization requires the protected email sentinel and owner PR evidence/);
  assert.doesNotMatch(signer, /ceo@bin-groups\.com/);
});

test('signed document preserves workflow actor and independently verified Founder actor', () => {
  assert.match(signer, /actor: workflowActor/);
  assert.match(signer, /workflowActor,/);
  assert.match(signer, /ownerRequestPullRequest,/);
  assert.match(signer, /founder:\s*\{[\s\S]*actor: founderActor/);
  assert.match(signer, /signDocument\(payload, hmacKey\)/);
  assert.match(signer, /validateAuthorizationDocument\(document/);
  assert.match(signer, /AUTHORIZATION_ACTOR=\$\{workflowActor\}/);
  assert.doesNotMatch(signer, /AUTHORIZED_FOUNDER_EMAILS.*console\./);
});

test('all downstream gates continue validating the signed workflow actor', () => {
  assert.match(predeploy, /process\.env\.AUTHORIZATION_ACTOR \|\| workflowActor/);
  assert.match(predeploy, /authorization\.workflowActor/);
  assert.match(sameRun, /const actor = requireText\(env, 'GITHUB_ACTOR'/);
  assert.match(sameRun, /actor,\s*\n\s*authorizedActors/);
  assert.match(decision, /actor: requiredContext\('GITHUB_ACTOR'\)/);
});
