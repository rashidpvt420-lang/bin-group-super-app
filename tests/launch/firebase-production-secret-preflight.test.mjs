import assert from 'node:assert/strict';
import test from 'node:test';

import {
  requiredFirebaseBankPilotSecrets,
  requiredFirebaseProductionSecretsForMode,
  verifyFirebaseSecretMetadata,
} from '../../scripts/verify-firebase-production-secrets.mjs';

test('bank-pilot preflight includes deploy-critical IoT secret', () => {
  assert.ok(requiredFirebaseBankPilotSecrets.includes('IOT_GATEWAY_TOKEN'));
  assert.ok(requiredFirebaseProductionSecretsForMode('public').includes('IOT_GATEWAY_TOKEN'));
});

test('billing-disabled Secret Manager response fails before Functions rollout', async () => {
  const lookedUp = [];
  const firebaseClient = {
    functions: {
      secrets: {
        async get(secretName) {
          lookedUp.push(secretName);
          if (secretName === 'IOT_GATEWAY_TOKEN') {
            throw new Error('HTTP Error: 403, This API method requires billing to be enabled. Please enable billing on project then retry.');
          }
          return { secrets: [{ state: 'ENABLED' }] };
        },
      },
    },
  };

  await assert.rejects(
    verifyFirebaseSecretMetadata({
      projectId: 'bin-group-57c60',
      launchMode: 'bank-pilot',
      firebaseClient,
    }),
    /IOT_GATEWAY_TOKEN: Google Cloud billing is not enabled\/usable/,
  );

  assert.ok(lookedUp.includes('IOT_GATEWAY_TOKEN'));
});
