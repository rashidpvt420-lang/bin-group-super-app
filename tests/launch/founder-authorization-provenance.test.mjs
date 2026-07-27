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
  assert.match(signer, /pull\?\.head\?\.repo\?\.full_name !== EXPECTED_REPOSITORY/);
  assert.match(signer, /OWNER_REQUEST_BRANCH_PREFIX/);
  assert.match(signer, /founderActor !== repositoryOwner/);
  assert.match(signer, /authorizedActors\.includes\(founderActor\)/);
  assert.match(signer, /files\.length !== 1 \|\| files\[0\]\?\.filename !== OWNER_REQUEST_MARKER/);
  assert.match(signer, /parseMarker\(Buffer\.from/);
  assert.match(signer, /owner request marker must keep the public gate disabled/);
  assert.match(signer, /owner request marker must not claim hard launch/);
});

test('GitHub provenance lookup uses fixed URLs and argument-array curl execution', () => {
  assert.match(signer, /import \{ spawnSync \} from 'node:child_process'/);
  assert.match(signer, /GITHUB_API_ROOT = `https:\/\/api\.github\.com\/repos\/\$\{EXPECTED_REPOSITORY\}`/);
  assert.match(signer, /spawnSync\('curl', \[/);
  assert.match(signer, /'--max-time',\s*\n\s*'10'/);
  assert.match(signer, /'--max-filesize'/);
  assert.match(signer, /MAX_GITHUB_RESPONSE_BYTES/);
  assert.match(signer, /url\.startsWith\(`\$\{GITHUB_API_ROOT\}\//);
  assert.match(signer, /\^\[1-9\]\[0-9\]\*\$/);
  assert.match(signer, /\^\[0-9a-f\]\{40\}\$/);
  assert.doesNotMatch(signer, /\bfetch\s*\(|node:https|\beval\s*\(|execSync|shell:\s*true/);
});

test('automated email selects one protected approved address from the allowlist', () => {
  assert.match(signer, /requiredEnv\('PRODUCTION_APPROVED_BY'\)/);
  assert.match(signer, /authorizedEmails\.includes\(protectedFounderEmail\)/);
  assert.match(signer, /founderEmail: protectedFounderEmail/);
  assert.match(signer, /PRODUCTION_APPROVED_BY must be included in AUTHORIZED_FOUNDER_EMAILS/);
  assert.match(signer, /automated Founder authorization requires the protected email sentinel and owner PR evidence/);
  assert.doesNotMatch(signer, /authorizedEmails\.length !== 1/);
  assert.doesNotMatch(signer, /founderEmail: authorizedEmails\[0\]/);
  assert.doesNotMatch(signer, /ceo@bin-groups\.com/);
});

test('signed document preserves workflow actor and independently verified Founder actor', () => {
  assert.match(signer, /actor: workflowActor/);
  assert.match(signer, /workflowActor,/);
  assert.match(signer, /ownerRequestPullRequest,/);
  assert.match(signer, /founder:\s*\{[\s\S]*actor: founderActor/);
  assert.match(signer, /signDocument\(payload, hmacKey\)/);
  assert.match(signer, /validateAuthorizationDocument\(document/);
  assert.doesNotMatch(signer, /GITHUB_ENV|appendFileSync/);
  assert.doesNotMatch(signer, /AUTHORIZED_FOUNDER_EMAILS.*console\./);
});

test('all downstream gates continue validating the signed workflow actor', () => {
  assert.match(predeploy, /process\.env\.AUTHORIZATION_ACTOR \|\| workflowActor/);
  assert.match(predeploy, /authorization\.workflowActor/);
  assert.match(sameRun, /const actor = requireText\(env, 'GITHUB_ACTOR'/);
  assert.match(sameRun, /actor,\s*\n\s*authorizedActors/);
  assert.match(decision, /actor: requiredContext\('GITHUB_ACTOR'\)/);
});
