#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFirebaseSecretMetadata } from './verify-firebase-production-secrets.mjs';

export async function runProductionSecretMetadataPreflight({
  projectId = String(process.env.GCP_PROJECT_ID || '').trim(),
  launchMode = String(process.env.LAUNCH_MODE || '').trim(),
} = {}) {
  const result = await verifyFirebaseSecretMetadata({ projectId, launchMode });
  console.log(JSON.stringify({
    status: 'passed',
    projectId: result.projectId,
    launchMode: result.launchMode,
    verifiedSecrets: result.verifiedSecrets,
    verifiedSecretNames: result.verifiedSecretNames,
    secretValuesExcluded: true,
    deploymentPerformed: false,
    hardLaunchClaim: false,
  }, null, 2));
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  runProductionSecretMetadataPreflight().catch((error) => {
    const message = error instanceof Error ? error.message : 'Production secret metadata preflight failed.';
    console.error(`[production-secret-preflight] ${message}`);
    process.exit(1);
  });
}
