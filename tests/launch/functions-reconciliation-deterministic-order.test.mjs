import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFunctionReconciliationPlan,
  validateFunctionsDeploymentEvidence,
} from '../../scripts/lib/functions-deployment-evidence.mjs';

const identity = (name, region = 'europe-west3') => ({
  name,
  region,
  codebase: 'default',
});

test('compiled endpoint evidence uses the verifier code-unit sort order', () => {
  const current = [
    identity('verifyPublicProof'),
    identity('ValidateOwnerPortfolioQuote'),
    identity('validateOwnerPortfolioQuote'),
  ];
  const plan = buildFunctionReconciliationPlan(current, current);

  assert.deepEqual(
    plan.compiledEndpointIdentities,
    [...plan.compiledEndpointIdentities].sort(),
  );

  const deployedFunctions = current.map((entry) => entry.name).sort();
  const failures = validateFunctionsDeploymentEvidence({
    strategy: 'sequential-export-batches',
    functionCount: deployedFunctions.length,
    batchCount: 1,
    batchSize: 4,
    cooldownSeconds: 75,
    deployedFunctions,
    reconciliation: {
      strategy: 'firebase-list-explicit-delete',
      status: 'passed',
      projectId: 'bin-group-57c60',
      codebase: 'default',
      compiledEndpointIdentities: plan.compiledEndpointIdentities,
      remoteBefore: plan.remoteBefore,
      obsoleteDeleted: [],
      preservedUnowned: [],
      remoteAfter: plan.remoteBefore,
      obsoleteOwnedRemaining: [],
      currentMissingAfter: [],
      retryRecoveryMinimumSeconds: 120,
    },
  });

  assert.deepEqual(failures, []);
});
