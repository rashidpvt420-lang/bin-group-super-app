import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('provider evidence workflow is protected, exact-commit and fixed-manifest', async () => {
  const [workflow, publisher] = await Promise.all([
    read('.github/workflows/operational-provider-evidence.yml'),
    read('scripts/publish-operational-provider-evidence.mjs'),
  ]);

  assert.match(workflow, /^name:\s*Operational Provider Evidence/m);
  assert.match(workflow, /^\s{2}verify-and-publish:/m);
  assert.match(workflow, /environment:\s*hard-public-launch/);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/s);
  assert.match(workflow, /GITHUB_ACTOR.*rashidpvt420-lang/s);
  assert.match(workflow, /PUBLISH_OPERATIONAL_PROVIDER_EVIDENCE/);
  assert.match(workflow, /expected_commit_sha.*GITHUB_SHA/s);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /node scripts\/publish-operational-provider-evidence\.mjs/);

  for (const gate of ['brandedEmailDelivery', 'appCheckEnforcement', 'stripeLiveBilling']) {
    assert.match(workflow, new RegExp(gate));
    assert.match(publisher, new RegExp(`${gate}:`));
  }
  assert.match(publisher, /system_health\/admin_summaries/);
  assert.match(publisher, /operationalEvidence/);
  assert.match(publisher, /artifactHash/);
  assert.match(publisher, /sourceProofHash/);
  assert.match(publisher, /verifiedBy:\s*'workflow'/);
  assert.match(publisher, /process\.env\.GITHUB_WORKFLOW !== EXPECTED_WORKFLOW/);
  assert.match(publisher, /process\.env\.GITHUB_JOB !== EXPECTED_JOB/);
  assert.doesNotMatch(publisher, /process\.env\.(?:STATUS|GATE_STATUS)|request\.data|founder_attested|waiv/i);
});

test('branded SMTP proof requires provider acceptance and approved BIN GROUP sender identity', async () => {
  const [workflow, verifier, publisher] = await Promise.all([
    read('.github/workflows/operational-provider-evidence.yml'),
    read('scripts/verify-smtp-live-delivery.mjs'),
    read('scripts/publish-operational-provider-evidence.mjs'),
  ]);

  assert.match(workflow, /Verify BIN GROUP branded SMTP delivery/);
  assert.match(verifier, /BIN GROUP <ceo@bin-groups\.com>/);
  assert.match(verifier, /BIN GROUP Admin <ceo@bin-groups\.com>/);
  assert.match(verifier, /accepted.*recipient/s);
  assert.match(verifier, /rejected\.length !== 0/);
  assert.match(verifier, /smtp-live-proof\.json/);
  assert.match(verifier, /cloud-function-smtp-live-verifier/);
  assert.match(publisher, /proof\.from !== BRANDED_FROM/);
  assert.match(publisher, /Number\(proof\.acceptedCount \|\| 0\) < 1/);
});

test('Stripe provider proof signs and replays the same live webhook event exactly once', async () => {
  const [workflow, verifier, webhook, publisher] = await Promise.all([
    read('.github/workflows/operational-provider-evidence.yml'),
    read('scripts/verify-stripe-live-proof.mjs'),
    read('functions/stripePayment.ts'),
    read('scripts/publish-operational-provider-evidence.mjs'),
  ]);

  assert.match(workflow, /STRIPE_REQUIRE_REPLAY_PROOF:\s*'true'/);
  assert.match(workflow, /STRIPE_WEBHOOK_SECRET/);
  assert.match(workflow, /STRIPE_SECRET_KEY="\$stripe_key" STRIPE_WEBHOOK_SECRET="\$webhook_secret"/);
  assert.doesNotMatch(workflow, /STRIPE_SECRET_KEY=\$stripe_key[\s\S]*GITHUB_ENV|STRIPE_WEBHOOK_SECRET=\$webhook_secret[\s\S]*GITHUB_ENV/);
  assert.match(verifier, /europe-west3-bin-group-57c60\.cloudfunctions\.net\/stripeWebhook/);
  assert.match(verifier, /createHmac\('sha256', webhookSecret\)/);
  assert.match(verifier, /stripe-signature/);
  assert.match(verifier, /replayPayload\?\.duplicate === true/);
  assert.match(verifier, /webhookAttemptsAfterReplay === webhookAttemptsBeforeReplay/);
  assert.match(verifier, /duplicateReplaySafe/);
  assert.match(webhook, /if \(data\.processed === true \|\| data\.ignored === true\) return "DUPLICATE"/);
  assert.match(webhook, /duplicate:\s*true/);
  assert.match(publisher, /proof\.duplicateReplaySafe !== true/);
  assert.match(publisher, /webhookAttemptsBeforeReplay\) !== 1/);
  assert.match(publisher, /webhookAttemptsAfterReplay\) !== 1/);
});

test('App Check enforcement proof performs invalid and valid authenticated Firestore probes', async () => {
  const [workflow, verifier, publisher] = await Promise.all([
    read('.github/workflows/operational-provider-evidence.yml'),
    read('scripts/verify-appcheck-enforcement.mjs'),
    read('scripts/publish-operational-provider-evidence.mjs'),
  ]);

  assert.match(workflow, /Verify production App Check enforcement/);
  assert.match(workflow, /VITE_FIREBASE_API_KEY:\s*\$\{\{ secrets\.VITE_FIREBASE_API_KEY \}\}/);
  assert.match(workflow, /VITE_FIREBASE_APP_ID:\s*\$\{\{ secrets\.VITE_FIREBASE_APP_ID \}\}/);
  assert.match(verifier, /accounts:signInWithPassword/);
  assert.match(verifier, /exchangeDebugToken/);
  assert.match(verifier, /documents:batchGet/);
  assert.match(verifier, /X-Firebase-AppCheck/);
  assert.match(verifier, /invalidTokenStatus === 401 \|\| invalidTokenStatus === 403/);
  assert.match(verifier, /validTokenStatus === 200/);
  assert.match(verifier, /appcheck-enforcement-proof\.json/);
  assert.doesNotMatch(verifier, /AIza[0-9A-Za-z_-]{20,}/);
  assert.match(publisher, /proof\.invalidTokenRejected !== true/);
  assert.match(publisher, /proof\.validTokenAccepted !== true/);
});
