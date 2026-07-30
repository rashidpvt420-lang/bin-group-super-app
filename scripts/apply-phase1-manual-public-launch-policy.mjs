#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`[phase1-manual-policy] wrote ${file}`);
};
const replaceOnce = (source, search, replacement, label) => {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one exact match, found ${count}`);
  return source.replace(search, replacement);
};
const replaceCount = (source, search, replacement, expected, label) => {
  const count = source.split(search).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} exact matches, found ${count}`);
  return source.split(search).join(replacement);
};
const replaceRegexOnce = (source, regex, replacement, label) => {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const matches = [...source.matchAll(new RegExp(regex.source, flags))];
  if (matches.length !== 1) throw new Error(`${label}: expected one regex match, found ${matches.length}`);
  return source.replace(regex, replacement);
};

write('scripts/verify-phase1-manual-payment-proof.mjs', `#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const EXPECTED_BENEFICIARY = 'BIN GROUP L.L.C - S.P.C';
const EXPECTED_METHODS = ['CASH', 'CHEQUE'];
const OUTPUT_PATH = path.resolve('launch_package/phase1-manual-payment-proof.json');
const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const requireValue = (name) => {
  const value = text(process.env[name]);
  if (!value) throw new Error(\`${'${name}'} is required for Phase 1 manual payment proof.\`);
  return value;
};
const timestampMs = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const hashConfiguration = (configuration) => crypto.createHash('sha256').update(JSON.stringify(configuration)).digest('hex');

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') {
  throw new Error('Phase 1 manual payment proof requires protected GitHub Actions on refs/heads/main.');
}
if (text(process.env.DEPLOYMENT_ENVIRONMENT).toLowerCase() !== 'production') {
  throw new Error('DEPLOYMENT_ENVIRONMENT must equal production.');
}
if (text(process.env.PAYMENT_POLICY).toLowerCase() !== 'phase1-manual') {
  throw new Error('PAYMENT_POLICY must equal phase1-manual.');
}

const commitSha = requireValue('GITHUB_SHA');
const repository = requireValue('GITHUB_REPOSITORY');
const workflowRunId = requireValue('GITHUB_RUN_ID');
const releaseId = requireValue('RELEASE_ID');
const validatedArtifactDigest = requireValue('VALIDATED_ARTIFACT_DIGEST').toLowerCase();
if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('GITHUB_SHA must be a full lowercase SHA.');
if (!/^[0-9a-f]{64}$/.test(validatedArtifactDigest)) throw new Error('VALIDATED_ARTIFACT_DIGEST must be a SHA-256 digest.');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) throw new Error(\`Manual payment proof must run against ${'${PROJECT_ID}'}; got ${'${projectId}'}.\`);
initializeFirebaseAdmin(admin, PROJECT_ID);
const snapshot = await admin.firestore().collection('system_payment_config').doc('current').get();
if (!snapshot.exists) throw new Error('system_payment_config/current is missing in production.');
const value = snapshot.data() || {};
if (upper(value.status) !== 'ACTIVE') throw new Error('Production payment configuration is not ACTIVE.');

const approvedMethods = Array.isArray(value.approvedMethods)
  ? [...new Set(value.approvedMethods.map(upper).filter(Boolean))].sort()
  : [];
if (JSON.stringify(approvedMethods) !== JSON.stringify([...EXPECTED_METHODS].sort())) {
  throw new Error(\`Phase 1 production methods must be exactly CASH and CHEQUE; found ${'${approvedMethods.join(", ") || "none"}'}.\`);
}

const configuration = {
  version: text(value.version),
  effectiveAtMs: timestampMs(value.effectiveAt || value.updatedAt),
  legalBeneficiary: text(value.legalBeneficiary || value.beneficiaryName),
  bankName: text(value.bankName),
  accountNumber: text(value.accountNumber).replace(/\\s+/g, ''),
  iban: upper(value.iban).replace(/\\s+/g, ''),
  swiftBic: upper(value.swiftBic || value.swift || value.bic).replace(/\\s+/g, ''),
  currency: upper(value.currency),
  officeLocation: text(value.officeLocation || value.cashOfficeLocation),
  approvedMethods,
};
if (!configuration.version || !configuration.effectiveAtMs) throw new Error('Payment configuration version/effective timestamp is missing.');
if (configuration.legalBeneficiary !== EXPECTED_BENEFICIARY) throw new Error('Payment beneficiary does not match BIN GROUP legal identity.');
if (configuration.currency !== 'AED') throw new Error('Phase 1 payment currency must be AED.');
if (!configuration.officeLocation) throw new Error('Cash/Cheque office location is missing.');
if (!configuration.bankName || !configuration.accountNumber || !/^AE\\d{21}$/.test(configuration.iban) || !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(configuration.swiftBic)) {
  throw new Error('Corporate payment configuration is incomplete or invalid.');
}

const proof = {
  schemaVersion: 1,
  status: 'passed',
  source: 'firebase-production-manual-payment-policy-verifier',
  paymentPolicy: 'phase1-manual',
  projectId: PROJECT_ID,
  commitSha,
  repository,
  workflowRunId,
  workflowRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null,
  releaseId,
  validatedArtifactDigest,
  legalBeneficiary: configuration.legalBeneficiary,
  currency: configuration.currency,
  approvedMethods,
  configVersion: configuration.version,
  configHash: hashConfiguration(configuration),
  officeLocationConfigured: true,
  bankTransferEnabled: false,
  stripeEnabled: false,
  sensitiveValuesExcluded: true,
  observedAt: new Date().toISOString(),
  hardLaunchClaim: false,
};
mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, \`${'${JSON.stringify(proof, null, 2)}'}\\n\`, { mode: 0o600 });
console.log(\`[phase1-manual-payment-proof] PASS config=${'${proof.configVersion}'} hash=${'${proof.configHash.slice(0, 12)}'}…\`);
`);

{
  const file = 'scripts/postdeploy-release-gate.mjs';
  let source = read(file);
  source = replaceOnce(
    source,
    "  let releaseId = String(env.RELEASE_ID || '').trim();\n",
    "  let releaseId = String(env.RELEASE_ID || '').trim();\n  let approvalDoc = null;\n",
    'postdeploy approval document binding',
  );
  source = replaceOnce(
    source,
    "      const approval = JSON.parse(readFileSync(approvalPath, 'utf8'));\n",
    "      approvalDoc = JSON.parse(readFileSync(approvalPath, 'utf8'));\n      const approval = approvalDoc;\n",
    'postdeploy approval assignment',
  );
  source = replaceRegexOnce(
    source,
    /  const launchMode = String\(env\.LAUNCH_MODE \|\| ''\)\.trim\(\);[\s\S]*?\n  const pilotPath = pilotIncidentReportPath\(root\);/,
    `  const launchMode = String(env.LAUNCH_MODE || '').trim();
  const paymentPolicy = String(env.PAYMENT_POLICY || approvalDoc?.paymentPolicy || '').trim().toLowerCase();
  if (launchMode === 'public') {
    if (!['phase1-manual', 'phase2-stripe'].includes(paymentPolicy)) {
      failures.push('Public launch requires PAYMENT_POLICY=phase1-manual or phase2-stripe.');
    }
    if (approvalDoc?.paymentPolicy && String(approvalDoc.paymentPolicy).trim().toLowerCase() !== paymentPolicy) {
      failures.push('Predeploy approval paymentPolicy does not match PAYMENT_POLICY.');
    }

    if (paymentPolicy === 'phase2-stripe') {
      const stripeProofPath = path.join(root, 'launch_package', 'stripe-live-proof.json');
      if (!existsSync(stripeProofPath)) {
        failures.push('Phase 2 Stripe launch requires execution-generated stripe-live-proof.json.');
      } else {
        try {
          const proof = JSON.parse(readFileSync(stripeProofPath, 'utf8'));
          const proofAgeMs = now - Date.parse(proof.observedAt || '');
          if (
            proof.status !== 'passed' ||
            proof.source !== 'stripe-api-live-verifier' ||
            proof.liveMode !== true ||
            proof.webhookProcessed !== true ||
            proof.currency !== 'AED' ||
            Number(proof.amountMinor || 0) <= 0 ||
            proof.commitSha !== githubSha ||
            String(proof.workflowRunId || '') !== String(env.GITHUB_RUN_ID || '') ||
            proof.releaseId !== releaseId ||
            proof.validatedArtifactDigest !== validatedDigest ||
            !Number.isFinite(proofAgeMs) || proofAgeMs < 0 || proofAgeMs > 72 * 60 * 60 * 1000 ||
            proof.hardLaunchClaim === true
          ) failures.push('stripe-live-proof.json is stale, non-live, unprocessed, or not bound to this release.');
        } catch (error) {
          failures.push(\`stripe-live-proof.json is malformed: \${error.message}\`);
        }
      }
    }

    if (paymentPolicy === 'phase1-manual') {
      const manualProofPath = path.join(root, 'launch_package', 'phase1-manual-payment-proof.json');
      if (!existsSync(manualProofPath)) {
        failures.push('Phase 1 manual launch requires execution-generated phase1-manual-payment-proof.json.');
      } else {
        try {
          const proof = JSON.parse(readFileSync(manualProofPath, 'utf8'));
          const proofAgeMs = now - Date.parse(proof.observedAt || '');
          if (
            proof.status !== 'passed' ||
            proof.source !== 'firebase-production-manual-payment-policy-verifier' ||
            proof.paymentPolicy !== 'phase1-manual' ||
            proof.projectId !== PRODUCTION.projectId ||
            proof.currency !== 'AED' ||
            JSON.stringify(proof.approvedMethods) !== JSON.stringify(['CASH', 'CHEQUE']) ||
            proof.bankTransferEnabled !== false || proof.stripeEnabled !== false ||
            proof.sensitiveValuesExcluded !== true ||
            !/^[0-9a-f]{64}$/.test(String(proof.configHash || '')) ||
            !String(proof.configVersion || '').trim() ||
            proof.commitSha !== githubSha ||
            proof.repository !== String(env.GITHUB_REPOSITORY || '') ||
            String(proof.workflowRunId || '') !== String(env.GITHUB_RUN_ID || '') ||
            proof.releaseId !== releaseId ||
            proof.validatedArtifactDigest !== validatedDigest ||
            !Number.isFinite(proofAgeMs) || proofAgeMs < 0 || proofAgeMs > 72 * 60 * 60 * 1000 ||
            proof.hardLaunchClaim === true
          ) failures.push('phase1-manual-payment-proof.json is invalid, stale, or not bound to this release.');
        } catch (error) {
          failures.push(\`phase1-manual-payment-proof.json is malformed: \${error.message}\`);
        }
      }
    }
  }

  const pilotPath = pilotIncidentReportPath(root);`,
    'replace postdeploy public payment proof gate',
  );
  source = replaceOnce(
    source,
    "    validatedArtifactDigest: validatedDigest || null,\n    publicReleaseCleared: ok,\n",
    "    validatedArtifactDigest: validatedDigest || null,\n    paymentPolicy: paymentPolicy || null,\n    publicReleaseCleared: ok,\n",
    'postdeploy status payment policy',
  );
  write(file, source);
}

{
  const file = 'scripts/hard-launch-decision-gate.mjs';
  let source = read(file);
  source = replaceOnce(
    source,
    "  stripeLiveProof: path.resolve('launch_package/stripe-live-proof.json'),\n",
    "  stripeLiveProof: path.resolve('launch_package/stripe-live-proof.json'),\n  phase1ManualPaymentProof: path.resolve('launch_package/phase1-manual-payment-proof.json'),\n",
    'hard decision manual proof path',
  );
  source = replaceRegexOnce(
    source,
    /let publicReleaseStatus = null;[\s\S]*?\n}\n\nconst postdeployCleared = publicReleaseStatus\?\.publicReleaseCleared === true;\nconst stripeLiveOk = stripeLiveProof\?\.status === 'passed';/,
    `let publicReleaseStatus = null;
let stripeLiveProof = null;
let phase1ManualPaymentProof = null;
const paymentPolicy = String(process.env.PAYMENT_POLICY || '').trim().toLowerCase();
if (launchMode === 'public') {
  if (!['phase1-manual', 'phase2-stripe'].includes(paymentPolicy)) failures.push('PAYMENT_POLICY must be phase1-manual or phase2-stripe for public launch');
  try {
    publicReleaseStatus = readJsonStrict(paths.publicReleaseStatus, 'public-release-status.json');
    if (
      publicReleaseStatus.status !== 'passed' || publicReleaseStatus.publicReleaseCleared !== true ||
      publicReleaseStatus.hardLaunchClaim === true || publicReleaseStatus.commitSha !== context.commitSha ||
      String(publicReleaseStatus.releaseId || '') !== \`${'${context.runId}'}-${'${process.env.GITHUB_RUN_ATTEMPT}'}\` ||
      publicReleaseStatus.validatedArtifactDigest !== deployment?.validatedArtifactDigest ||
      publicReleaseStatus.paymentPolicy !== paymentPolicy ||
      !Array.isArray(publicReleaseStatus.failures) || publicReleaseStatus.failures.length !== 0
    ) failures.push('public-release-status.json is not a clear, same-run, exact-artifact payment-policy-bound result');
  } catch (error) { failures.push(error.message); }

  if (paymentPolicy === 'phase2-stripe') {
    try {
      stripeLiveProof = readJsonStrict(paths.stripeLiveProof, 'stripe-live-proof.json');
      const proofAgeMs = Date.now() - Date.parse(stripeLiveProof.observedAt || '');
      if (
        stripeLiveProof.status !== 'passed' || stripeLiveProof.source !== 'stripe-api-live-verifier' ||
        stripeLiveProof.liveMode !== true || stripeLiveProof.webhookProcessed !== true ||
        stripeLiveProof.currency !== 'AED' || Number(stripeLiveProof.amountMinor || 0) <= 0 ||
        stripeLiveProof.commitSha !== context.commitSha || stripeLiveProof.repository !== context.repository ||
        String(stripeLiveProof.workflowRunId || '') !== context.runId ||
        stripeLiveProof.releaseId !== \`${'${context.runId}'}-${'${process.env.GITHUB_RUN_ATTEMPT}'}\` ||
        stripeLiveProof.validatedArtifactDigest !== deployment?.validatedArtifactDigest ||
        !Number.isFinite(proofAgeMs) || proofAgeMs < 0 || proofAgeMs > 72 * 60 * 60 * 1000 ||
        stripeLiveProof.hardLaunchClaim === true
      ) failures.push('stripe-live-proof.json is stale, non-live, unprocessed, or not bound to this run and artifact');
    } catch (error) { failures.push(error.message); }
  }

  if (paymentPolicy === 'phase1-manual') {
    try {
      phase1ManualPaymentProof = readJsonStrict(paths.phase1ManualPaymentProof, 'phase1-manual-payment-proof.json');
      const proofAgeMs = Date.now() - Date.parse(phase1ManualPaymentProof.observedAt || '');
      if (
        phase1ManualPaymentProof.status !== 'passed' ||
        phase1ManualPaymentProof.source !== 'firebase-production-manual-payment-policy-verifier' ||
        phase1ManualPaymentProof.paymentPolicy !== 'phase1-manual' ||
        phase1ManualPaymentProof.projectId !== PRODUCTION.projectId ||
        phase1ManualPaymentProof.currency !== 'AED' ||
        JSON.stringify(phase1ManualPaymentProof.approvedMethods) !== JSON.stringify(['CASH', 'CHEQUE']) ||
        phase1ManualPaymentProof.bankTransferEnabled !== false || phase1ManualPaymentProof.stripeEnabled !== false ||
        phase1ManualPaymentProof.sensitiveValuesExcluded !== true ||
        !/^[0-9a-f]{64}$/.test(String(phase1ManualPaymentProof.configHash || '')) ||
        !String(phase1ManualPaymentProof.configVersion || '').trim() ||
        phase1ManualPaymentProof.commitSha !== context.commitSha || phase1ManualPaymentProof.repository !== context.repository ||
        String(phase1ManualPaymentProof.workflowRunId || '') !== context.runId ||
        phase1ManualPaymentProof.releaseId !== \`${'${context.runId}'}-${'${process.env.GITHUB_RUN_ATTEMPT}'}\` ||
        phase1ManualPaymentProof.validatedArtifactDigest !== deployment?.validatedArtifactDigest ||
        !Number.isFinite(proofAgeMs) || proofAgeMs < 0 || proofAgeMs > 72 * 60 * 60 * 1000 ||
        phase1ManualPaymentProof.hardLaunchClaim === true
      ) failures.push('phase1-manual-payment-proof.json is invalid, stale, or not bound to this run and artifact');
    } catch (error) { failures.push(error.message); }
  }

  try {
    const pilotIncidentReport = readJsonStrict(paths.pilotIncidentReport, 'pilot-incident-report.json');
    failures.push(...validatePilotIncidentReport(pilotIncidentReport, context.commitSha));
  } catch (error) { failures.push(error.message); }
}

const postdeployCleared = publicReleaseStatus?.publicReleaseCleared === true;
const paymentProofOk = paymentPolicy === 'phase1-manual'
  ? phase1ManualPaymentProof?.status === 'passed'
  : paymentPolicy === 'phase2-stripe' && stripeLiveProof?.status === 'passed';`,
    'replace hard decision public payment block',
  );
  source = replaceOnce(
    source,
    "    publicReleaseStatus: sha256File(paths.publicReleaseStatus),\n    stripeLiveProof: sha256File(paths.stripeLiveProof),\n    pilotIncidentReport: sha256File(paths.pilotIncidentReport),\n",
    "    publicReleaseStatus: sha256File(paths.publicReleaseStatus),\n    ...(paymentPolicy === 'phase1-manual' ? { phase1ManualPaymentProof: sha256File(paths.phase1ManualPaymentProof) } : {}),\n    ...(paymentPolicy === 'phase2-stripe' ? { stripeLiveProof: sha256File(paths.stripeLiveProof) } : {}),\n    pilotIncidentReport: sha256File(paths.pilotIncidentReport),\n",
    'hard decision payment evidence hashes',
  );
  source = replaceOnce(
    source,
    "} else if (launchMode === 'public' && (!postdeployCleared || !stripeLiveOk)) {\n",
    "} else if (launchMode === 'public' && (!postdeployCleared || !paymentProofOk)) {\n",
    'hard decision waiting branch',
  );
  source = replaceOnce(
    source,
    "    'public mode requires postdeploy release clearance and Stripe live proof before hardLaunchClaim may become true';\n} else if (launchMode === 'public' && postdeployCleared && stripeLiveOk) {\n",
    "    'public mode requires postdeploy release clearance and payment-policy-bound production proof before hardLaunchClaim may become true';\n} else if (launchMode === 'public' && postdeployCleared && paymentProofOk) {\n",
    'hard decision approval branch',
  );
  source = replaceOnce(
    source,
    "    'same-main-commit deployment + live evidence + App Check + clear incidents + signed founder authorization + postdeploy clearance + Stripe live proof';\n",
    "    `same-main-commit deployment + live evidence + App Check + clear incidents + signed founder authorization + postdeploy clearance + ${'${paymentPolicy}'} production payment proof`;\n",
    'hard decision rule',
  );
  source = replaceOnce(
    source,
    "  launchMode,\n  commitSha: context.commitSha,\n",
    "  launchMode,\n  paymentPolicy: launchMode === 'public' ? paymentPolicy : null,\n  commitSha: context.commitSha,\n",
    'hard decision payload payment policy',
  );
  write(file, source);
}

{
  const file = '.github/workflows/firebase-production-deploy.yml';
  let source = read(file);
  source = replaceOnce(
    source,
    "      run_public_release_gate:\n        description: 'Required for public mode; runs the protected postdeploy public-release gate'\n",
    "      payment_policy:\n        description: 'Phase 1 Cash/Cheque or Phase 2 Stripe'\n        required: true\n        type: choice\n        options:\n          - phase1-manual\n          - phase2-stripe\n        default: phase1-manual\n      run_public_release_gate:\n        description: 'Required for public mode; runs the protected postdeploy public-release gate'\n",
    'workflow payment policy input',
  );
  source = replaceOnce(
    source,
    "        description: 'JSON containing incident, hard-clearance, and Stripe live-proof fields'\n",
    "        description: 'JSON containing incident, hard-clearance, and optional Phase 2 Stripe live-proof fields'\n",
    'workflow payload description',
  );
  source = replaceCount(
    source,
    "          RUN_PUBLIC_RELEASE_GATE_INPUT: ${{ inputs.run_public_release_gate }}\n",
    "          RUN_PUBLIC_RELEASE_GATE_INPUT: ${{ inputs.run_public_release_gate }}\n          PAYMENT_POLICY_INPUT: ${{ inputs.payment_policy }}\n",
    2,
    'workflow dispatch payment policy env',
  );
  const oldGate = `          if [[ "$LAUNCH_MODE_INPUT" == "public" ]]; then
            [[ "$RUN_PUBLIC_RELEASE_GATE_INPUT" == "true" ]] \\
              || fail "Public mode requires run_public_release_gate=true."
            [[ "$HARD_CLEARANCE_RUN_ID_INPUT" =~ ^[0-9]+$ ]] \\
              || fail "Public mode requires a numeric hard-clearance run ID."
            [[ "$STRIPE_LIVE_SESSION_ID_INPUT" =~ ^cs_live_[A-Za-z0-9_]+$ ]] \\
              || fail "Public mode requires a live Stripe checkout session ID."
            [[ "$STRIPE_LIVE_EVENT_ID_INPUT" =~ ^evt_[A-Za-z0-9_]+$ ]] \\
              || fail "Public mode requires a Stripe webhook event ID."
          else
            [[ "$RUN_PUBLIC_RELEASE_GATE_INPUT" == "false" ]] \\
              || fail "Bank-pilot mode requires run_public_release_gate=false."
          fi
`;
  const newGate = `          if [[ "$LAUNCH_MODE_INPUT" == "public" ]]; then
            [[ "$RUN_PUBLIC_RELEASE_GATE_INPUT" == "true" ]] \\
              || fail "Public mode requires run_public_release_gate=true."
            [[ "$HARD_CLEARANCE_RUN_ID_INPUT" =~ ^[0-9]+$ ]] \\
              || fail "Public mode requires a numeric hard-clearance run ID."
            if [[ "$PAYMENT_POLICY_INPUT" == "phase2-stripe" ]]; then
              [[ "$STRIPE_LIVE_SESSION_ID_INPUT" =~ ^cs_live_[A-Za-z0-9_]+$ ]] \\
                || fail "Phase 2 Stripe public mode requires a live Stripe checkout session ID."
              [[ "$STRIPE_LIVE_EVENT_ID_INPUT" =~ ^evt_[A-Za-z0-9_]+$ ]] \\
                || fail "Phase 2 Stripe public mode requires a Stripe webhook event ID."
            elif [[ "$PAYMENT_POLICY_INPUT" == "phase1-manual" ]]; then
              [[ -z "$STRIPE_LIVE_SESSION_ID_INPUT" && -z "$STRIPE_LIVE_EVENT_ID_INPUT" ]] \\
                || fail "Phase 1 manual mode must not provide Stripe proof identifiers."
            else
              fail "Public payment_policy must be phase1-manual or phase2-stripe."
            fi
          else
            [[ "$RUN_PUBLIC_RELEASE_GATE_INPUT" == "false" ]] \\
              || fail "Bank-pilot mode requires run_public_release_gate=false."
            [[ "$PAYMENT_POLICY_INPUT" == "phase1-manual" ]] \\
              || fail "Bank-pilot mode uses the Phase 1 manual payment policy."
          fi
`;
  source = replaceCount(source, oldGate, newGate, 2, 'workflow dispatch gates');
  source = replaceCount(
    source,
    "      LAUNCH_MODE: ${{ inputs.launch_mode }}\n",
    "      LAUNCH_MODE: ${{ inputs.launch_mode }}\n      PAYMENT_POLICY: ${{ inputs.payment_policy }}\n",
    2,
    'workflow job payment policy env',
  );
  source = replaceOnce(
    source,
    "          LAUNCH_MODE_INPUT: ${{ inputs.launch_mode }}\n        run: |\n",
    "          LAUNCH_MODE_INPUT: ${{ inputs.launch_mode }}\n          PAYMENT_POLICY_INPUT: ${{ inputs.payment_policy }}\n        run: |\n",
    'workflow predeploy approval env',
  );
  source = replaceOnce(
    source,
    "            launchMode: process.env.LAUNCH_MODE_INPUT,\n",
    "            launchMode: process.env.LAUNCH_MODE_INPUT,\n            paymentPolicy: process.env.PAYMENT_POLICY_INPUT,\n",
    'workflow predeploy approval policy binding',
  );
  source = replaceOnce(
    source,
    "      - name: Verify recent live Stripe payment and processed webhook\n        env:\n",
    "      - name: Verify Phase 1 manual Cash/Cheque production policy\n        if: ${{ inputs.payment_policy == 'phase1-manual' }}\n        env:\n          DEPLOYMENT_ENVIRONMENT: production\n          PAYMENT_POLICY: ${{ inputs.payment_policy }}\n          RELEASE_ID: ${{ github.run_id }}-${{ github.run_attempt }}\n          VALIDATED_ARTIFACT_DIGEST: ${{ needs.deploy-firebase-production-stack.outputs.validated_artifact_digest }}\n        run: node scripts/verify-phase1-manual-payment-proof.mjs\n\n      - name: Verify recent live Stripe payment and processed webhook\n        if: ${{ inputs.payment_policy == 'phase2-stripe' }}\n        env:\n",
    'workflow conditional payment proof steps',
  );
  source = replaceOnce(
    source,
    "          LAUNCH_MODE: ${{ inputs.launch_mode }}\n          RELEASE_ID: ${{ github.run_id }}-${{ github.run_attempt }}\n",
    "          LAUNCH_MODE: ${{ inputs.launch_mode }}\n          PAYMENT_POLICY: ${{ inputs.payment_policy }}\n          RELEASE_ID: ${{ github.run_id }}-${{ github.run_attempt }}\n",
    'workflow postdeploy gate policy env',
  );
  source = replaceOnce(
    source,
    "          LAUNCH_MODE: ${{ inputs.launch_mode }}\n          POSTDEPLOY_RELEASE_CLEARED: ${{ steps.postdeploy_gate.outputs.cleared }}\n",
    "          LAUNCH_MODE: ${{ inputs.launch_mode }}\n          PAYMENT_POLICY: ${{ inputs.payment_policy }}\n          POSTDEPLOY_RELEASE_CLEARED: ${{ steps.postdeploy_gate.outputs.cleared }}\n",
    'workflow final decision policy env',
  );
  source = replaceOnce(
    source,
    "            launch_package/stripe-live-proof.json\n",
    "            launch_package/stripe-live-proof.json\n            launch_package/phase1-manual-payment-proof.json\n",
    'workflow payment proof artifacts',
  );
  write(file, source);
  write('launch_package/generated/firebase-production-deploy-phase1.yml', source);
}

write('tests/launch/phase1-manual-public-launch-policy.test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

test('production workflow supports fail-closed Phase 1 manual or Phase 2 Stripe proof', () => {
  const workflow = read('.github/workflows/firebase-production-deploy.yml');
  assert.match(workflow, /payment_policy:/);
  assert.match(workflow, /phase1-manual/);
  assert.match(workflow, /phase2-stripe/);
  assert.match(workflow, /Verify Phase 1 manual Cash\/Cheque production policy/);
  assert.match(workflow, /if: \$\{\{ inputs\.payment_policy == 'phase1-manual' \}\}/);
  assert.match(workflow, /if: \$\{\{ inputs\.payment_policy == 'phase2-stripe' \}\}/);
  assert.match(workflow, /phase1-manual-payment-proof\.json/);
});

test('Phase 1 verifier proves exact production Cash and Cheque policy without leaking banking data', () => {
  const source = read('scripts/verify-phase1-manual-payment-proof.mjs');
  assert.match(source, /EXPECTED_METHODS = \['CASH', 'CHEQUE'\]/);
  assert.match(source, /firebase-production-manual-payment-policy-verifier/);
  assert.match(source, /sensitiveValuesExcluded: true/);
  assert.match(source, /bankTransferEnabled: false/);
  assert.match(source, /stripeEnabled: false/);
  assert.doesNotMatch(source, /proof = \{[\s\S]*accountNumber,/);
  assert.doesNotMatch(source, /proof = \{[\s\S]*\biban,/);
});

test('postdeploy and signed final decision bind to the selected payment policy', () => {
  const postdeploy = read('scripts/postdeploy-release-gate.mjs');
  const decision = read('scripts/hard-launch-decision-gate.mjs');
  assert.match(postdeploy, /PAYMENT_POLICY/);
  assert.match(postdeploy, /phase1-manual-payment-proof\.json/);
  assert.match(postdeploy, /stripe-live-proof\.json/);
  assert.match(decision, /phase1ManualPaymentProof/);
  assert.match(decision, /paymentProofOk/);
  assert.match(decision, /paymentPolicy: launchMode === 'public'/);
  assert.doesNotMatch(decision, /postdeployCleared && stripeLiveOk/);
});
`);

console.log('[phase1-manual-policy] all source and workflow repairs applied');
