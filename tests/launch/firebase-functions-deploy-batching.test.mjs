import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  FUNCTIONS_DEPLOYMENT_STRATEGY,
  FUNCTIONS_RECONCILIATION_STRATEGY,
  buildFunctionReconciliationPlan,
  parseCompiledFunctionIdentities,
  parseRemoteFunctionList,
  validateFunctionsDeploymentEvidence,
} from '../../scripts/lib/functions-deployment-evidence.mjs';

const deployUrl = new URL('../../scripts/deploy-firebase-production.mjs', import.meta.url);
const verifierUrl = new URL('../../scripts/verify-production-deployment.mjs', import.meta.url);
const reconciliationUrl = new URL('../../scripts/lib/functions-deployment-evidence.mjs', import.meta.url);
const deploySource = await readFile(deployUrl, 'utf8');
const verifierSource = await readFile(verifierUrl, 'utf8');
const reconciliationSource = await readFile(reconciliationUrl, 'utf8');

const remoteOwned = [
  'default|europe-west3|adminCreateUser',
  'default|europe-west3|dailyHrComplianceSweep',
  'default|europe-west3|getAdminSecurityProfile',
  'default|europe-west3|onScheduledServiceUpdated',
  'default|europe-west3|requestBrokerPayoutOtp',
  'default|europe-west3|scheduledServiceReminderCron',
  'default|europe-west3|verifyBrokerPayoutOtp',
];

const validEvidence = () => ({
  strategy: FUNCTIONS_DEPLOYMENT_STRATEGY,
  functionCount: 7,
  batchCount: 2,
  batchSize: 4,
  cooldownSeconds: 75,
  deployedFunctions: [
    'adminCreateUser',
    'dailyHrComplianceSweep',
    'getAdminSecurityProfile',
    'onScheduledServiceUpdated',
    'requestBrokerPayoutOtp',
    'scheduledServiceReminderCron',
    'verifyBrokerPayoutOtp',
  ],
  reconciliation: {
    strategy: FUNCTIONS_RECONCILIATION_STRATEGY,
    status: 'passed',
    projectId: 'bin-group-57c60',
    codebase: 'default',
    compiledEndpointIdentities: remoteOwned,
    remoteBefore: remoteOwned,
    obsoleteDeleted: [],
    preservedUnowned: [],
    remoteAfter: remoteOwned,
    obsoleteOwnedRemaining: [],
    currentMissingAfter: [],
    deletionBatchSize: 4,
    deletionCooldownSeconds: 75,
    retryRecoveryMinimumSeconds: 120,
    observedAt: '2026-07-26T07:00:00.000Z',
  },
});

const currentIdentity = (name, region = 'europe-west3') => ({
  name,
  region,
  codebase: 'default',
});

test('production deployment and verification scripts parse under the repository Node runtime', () => {
  for (const url of [deployUrl, verifierUrl, reconciliationUrl]) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(url)], {
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `${fileURLToPath(url)} failed Node syntax validation:\n${result.stderr || result.stdout}`,
    );
  }
});

test('production deployment never updates the entire Functions estate in one Firebase mutation burst', () => {
  assert.doesNotMatch(
    deploySource,
    /['"]functions,hosting,firestore:rules,firestore:indexes,storage['"]/, 
  );
  assert.doesNotMatch(
    deploySource,
    /retryFirebase\(\s*['"]functions['"]/, 
  );
  assert.match(deploySource, /function deployFunctionsQuotaSafe\(\)/);
  assert.match(deploySource, /functions:\$\{name\}/);
  assert.match(deploySource, /non-Functions Firebase production stack/);
});

test('quota-safe deployment discovers only compiled Firebase endpoints and triggers', () => {
  assert.match(deploySource, /functions\/lib\/runtimeAll\.js/);
  assert.match(deploySource, /value\.__endpoint \|\| value\.__trigger/);
  assert.match(deploySource, /No deployable Firebase Function exports were discovered/);
  assert.match(deploySource, /Invalid or duplicate Firebase Function export names/);
});

test('function batches are small, sequential and separated by at least one quota window', () => {
  assert.match(
    deploySource,
    /FIREBASE_FUNCTION_DEPLOY_BATCH_SIZE['"],\s*4,\s*1,\s*6/,
  );
  assert.match(
    deploySource,
    /FIREBASE_FUNCTION_DEPLOY_COOLDOWN_SECONDS['"],\s*75,\s*60,\s*300/,
  );
  assert.match(deploySource, /batches\.forEach\(\(batch, index\) =>/);
  assert.match(deploySource, /sleepSeconds\(cooldownSeconds,/);
  assert.match(deploySource, /regional Cloud Functions mutation quota/);
});

test('deployment metadata records the batching strategy used for the exact SHA', () => {
  assert.match(deploySource, /strategy: 'sequential-export-batches'/);
  assert.match(deploySource, /functionCount: functionNames\.length/);
  assert.match(deploySource, /batchCount: batches\.length/);
  assert.match(deploySource, /deployedFunctions: functionNames/);
  assert.match(
    deploySource,
    /deploymentMetadata\.functionsDeployment = functionDeploymentEvidence/,
  );
});

test('remote list parser accepts Firebase result payloads and rejects malformed output', () => {
  const parsed = parseRemoteFunctionList(JSON.stringify({
    result: [
      {
        id: 'tenantReminder',
        region: 'europe-west3',
        labels: { 'firebase-functions-codebase': 'default' },
      },
      {
        name: 'projects/bin-group-57c60/locations/us-central1/functions/ext-mailer-send',
        labels: { 'firebase-functions-codebase': 'ext-mailer' },
      },
    ],
  }));
  assert.deepEqual(parsed, [
    { name: 'tenantReminder', region: 'europe-west3', codebase: 'default' },
    { name: 'ext-mailer-send', region: 'us-central1', codebase: 'ext-mailer' },
  ]);
  assert.throws(() => parseRemoteFunctionList('not-json'), /malformed JSON/);
  assert.throws(() => parseRemoteFunctionList('{"status":"success"}'), /function array/);
});

test('compiled identity parser requires full codebase, region and function name identity', () => {
  assert.deepEqual(
    parseCompiledFunctionIdentities(JSON.stringify([
      currentIdentity('betaFunction'),
      currentIdentity('alphaFunction'),
      currentIdentity('multiRegionFunction', 'us-central1'),
      currentIdentity('multiRegionFunction', 'europe-west3'),
    ])),
    [
      currentIdentity('alphaFunction'),
      currentIdentity('betaFunction'),
      currentIdentity('multiRegionFunction'),
      currentIdentity('multiRegionFunction', 'us-central1'),
    ],
  );
  assert.throws(
    () => parseCompiledFunctionIdentities(JSON.stringify([{ name: 'missingRegion', codebase: 'default' }])),
    /invalid or missing region/,
  );
});

test('reconciliation plans deletion for removed or renamed owned Functions only', () => {
  const plan = buildFunctionReconciliationPlan(
    [currentIdentity('activeFunction'), currentIdentity('renamedFunction')],
    [
      { name: 'activeFunction', region: 'europe-west3', codebase: 'default' },
      { name: 'oldFunctionName', region: 'europe-west3', codebase: 'default' },
      { name: 'ext-mailer-send', region: 'us-central1', codebase: 'ext-mailer' },
      { name: 'unownedManualFunction', region: 'europe-west3', codebase: '' },
      { name: 'renamedFunction', region: 'europe-west3', codebase: 'default' },
    ],
  );
  assert.deepEqual(plan.obsoleteOwned, [
    { name: 'oldFunctionName', region: 'europe-west3', codebase: 'default' },
  ]);
  assert.deepEqual(plan.preservedUnowned, [
    'ext-mailer|us-central1|ext-mailer-send',
    'unknown|europe-west3|unownedManualFunction',
  ]);
  assert.deepEqual(plan.currentMissing, []);
});

test('region moves delete the stale regional copy and require the new regional identity', () => {
  const plan = buildFunctionReconciliationPlan(
    [currentIdentity('regionalFunction', 'europe-west3')],
    [
      { name: 'regionalFunction', region: 'us-central1', codebase: 'default' },
      { name: 'regionalFunction', region: 'europe-west3', codebase: 'default' },
    ],
  );
  assert.deepEqual(plan.obsoleteOwned, [
    { name: 'regionalFunction', region: 'us-central1', codebase: 'default' },
  ]);
  assert.deepEqual(plan.currentMissing, []);

  const wrongRegionOnly = buildFunctionReconciliationPlan(
    [currentIdentity('regionalFunction', 'europe-west3')],
    [{ name: 'regionalFunction', region: 'us-central1', codebase: 'default' }],
  );
  assert.deepEqual(wrongRegionOnly.currentMissing, [
    'default|europe-west3|regionalFunction',
  ]);
});

test('reconciliation no-op is deterministic when remote owned identities match source', () => {
  const plan = buildFunctionReconciliationPlan(
    [currentIdentity('alphaFunction'), currentIdentity('betaFunction')],
    [
      { name: 'betaFunction', region: 'europe-west3', codebase: 'default' },
      { name: 'alphaFunction', region: 'europe-west3', codebase: 'default' },
    ],
  );
  assert.deepEqual(plan.obsoleteOwned, []);
  assert.deepEqual(plan.compiledEndpointIdentities, [
    'default|europe-west3|alphaFunction',
    'default|europe-west3|betaFunction',
  ]);
  assert.deepEqual(plan.remoteBefore, [
    'default|europe-west3|alphaFunction',
    'default|europe-west3|betaFunction',
  ]);
});

test('reconciliation evidence sorts compiled endpoint identities with verifier ordering', () => {
  const plan = buildFunctionReconciliationPlan(
    [
      currentIdentity('submitAIDesignRequest'),
      currentIdentity('stripeWebhook'),
      currentIdentity('submitBrokerPayoutRequest'),
    ],
    [
      currentIdentity('stripeWebhook'),
      currentIdentity('submitBrokerPayoutRequest'),
      currentIdentity('submitAIDesignRequest'),
    ],
  );

  assert.deepEqual(plan.compiledEndpointIdentities, [
    'default|europe-west3|stripeWebhook',
    'default|europe-west3|submitAIDesignRequest',
    'default|europe-west3|submitBrokerPayoutRequest',
  ]);
  assert.deepEqual(validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    functionCount: 3,
    batchCount: 1,
    deployedFunctions: [
      'stripeWebhook',
      'submitAIDesignRequest',
      'submitBrokerPayoutRequest',
    ],
    reconciliation: {
      ...validEvidence().reconciliation,
      compiledEndpointIdentities: plan.compiledEndpointIdentities,
      remoteBefore: plan.remoteBefore,
      remoteAfter: plan.remoteBefore,
    },
  }), []);
});

test('obsolete owned Functions without region metadata fail closed', () => {
  assert.throws(
    () => buildFunctionReconciliationPlan(
      [currentIdentity('activeFunction')],
      [
        { name: 'activeFunction', region: 'europe-west3', codebase: 'default' },
        { name: 'obsoleteFunction', region: '', codebase: 'default' },
      ],
    ),
    /missing region metadata|invalid function names or regions/,
  );
});

test('reconciliation deletion is explicit, batched, quota-safe and preserves unowned codebases', () => {
  assert.match(reconciliationSource, /functions:list/);
  assert.match(reconciliationSource, /functions:delete/);
  assert.match(reconciliationSource, /--force/);
  assert.match(reconciliationSource, /FIREBASE_FUNCTION_DELETE_BATCH_SIZE/);
  assert.match(reconciliationSource, /FIREBASE_FUNCTION_DELETE_COOLDOWN_SECONDS/);
  assert.match(reconciliationSource, /compiledEndpointIdentities/);
  assert.match(reconciliationSource, /preservedUnowned/);
  assert.match(reconciliationSource, /entry\.codebase === OWNED_CODEBASE/);
  assert.match(reconciliationSource, /MIN_RETRY_RECOVERY_SECONDS = 120/);
  assert.match(reconciliationSource, /Math\.max\(\s*MIN_RETRY_RECOVERY_SECONDS/);
});

test('exact-SHA production verification requires valid batching and reconciliation evidence', () => {
  assert.deepEqual(validateFunctionsDeploymentEvidence(validEvidence()), []);
  assert.match(verifierSource, /validateFunctionsDeploymentEvidence\(existing\.functionsDeployment\)/);
  assert.match(verifierSource, /functionsDeployment: existing\?\.functionsDeployment \?\? null/);

  const missing = validateFunctionsDeploymentEvidence(null).join('\n');
  assert.match(missing, /missing or malformed/);

  const wrongStrategy = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    strategy: 'monolithic',
  }).join('\n');
  assert.match(wrongStrategy, /strategy/);

  const wrongCount = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    functionCount: 8,
  }).join('\n');
  assert.match(wrongCount, /functionCount/);

  const wrongBatches = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    batchCount: 3,
  }).join('\n');
  assert.match(wrongBatches, /batchCount/);

  const unsafeBatch = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    batchSize: 10,
  }).join('\n');
  assert.match(unsafeBatch, /batchSize/);

  const unsafeCooldown = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    cooldownSeconds: 30,
  }).join('\n');
  assert.match(unsafeCooldown, /cooldownSeconds/);

  const duplicateNames = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    functionCount: 8,
    deployedFunctions: [...validEvidence().deployedFunctions, 'adminCreateUser'],
  }).join('\n');
  assert.match(duplicateNames, /duplicates/);

  const missingReconciliation = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    reconciliation: null,
  }).join('\n');
  assert.match(missingReconciliation, /reconciliation evidence is missing/);

  const mismatchedCompiledIdentities = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    reconciliation: {
      ...validEvidence().reconciliation,
      compiledEndpointIdentities: remoteOwned.slice(1),
    },
  }).join('\n');
  assert.match(mismatchedCompiledIdentities, /do not match deployedFunctions/);

  const obsoleteRemaining = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    reconciliation: {
      ...validEvidence().reconciliation,
      obsoleteOwnedRemaining: ['default|europe-west3|oldFunction'],
    },
  }).join('\n');
  assert.match(obsoleteRemaining, /left obsolete owned Functions/);

  for (const retryRecoveryMinimumSeconds of [undefined, 'not-a-number', 60]) {
    const invalidRecovery = validateFunctionsDeploymentEvidence({
      ...validEvidence(),
      reconciliation: {
        ...validEvidence().reconciliation,
        retryRecoveryMinimumSeconds,
      },
    }).join('\n');
    assert.match(invalidRecovery, /integer of at least 120 seconds/);
  }
});
