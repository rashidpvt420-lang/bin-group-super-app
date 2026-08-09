#!/usr/bin/env node

import { GoogleAuth } from 'google-auth-library';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_REGION = 'europe-west3';
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function describeApiFailure({ response, payload, context }) {
  const status = Number(response?.status || 0) || 'unknown';
  const providerMessage = String(payload?.error?.message || payload?.message || '').replace(/\s+/g, ' ').trim();
  const detail = providerMessage ? ` ${providerMessage}` : '';

  if (context === 'billing') {
    if (/billing/i.test(providerMessage)) {
      return `Cloud Billing is not active for ${EXPECTED_PROJECT_ID}. Link the project to an active billing account, wait for propagation, then rerun the protected readiness check.${detail}`;
    }
    if (/permission|permission_denied|forbidden/i.test(providerMessage) || status === 403) {
      return `The deployment service account cannot verify billing status (HTTP ${status}). Grant it billing.resourceAssociations.get and ensure ${EXPECTED_PROJECT_ID} is linked to an active billing account.${detail}`;
    }
  }

  return `Cloud Functions deployment access check failed (HTTP ${status}). Grant the deployment service account the required Cloud Functions project permissions and ensure the Cloud Functions API is enabled.${detail}`;
}

async function requestJson({ fetchImpl, url, accessToken, context }) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const raw = await response.text();
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { message: raw.slice(0, 500) };
    }
  }

  if (!response.ok) {
    throw new Error(`[firebase-deployment-readiness] ${describeApiFailure({ response, payload, context })}`);
  }

  return payload;
}

async function defaultTokenProvider() {
  const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
  const client = await auth.getClient();
  const tokenResult = await client.getAccessToken();
  const accessToken = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token;
  if (!accessToken) {
    throw new Error('[firebase-deployment-readiness] Workload Identity authentication did not yield an access token.');
  }
  return accessToken;
}

export async function verifyFirebaseDeploymentReadiness({
  projectId = String(process.env.GCP_PROJECT_ID || '').trim(),
  region = EXPECTED_REGION,
  fetchImpl = globalThis.fetch,
  tokenProvider = defaultTokenProvider,
} = {}) {
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`[firebase-deployment-readiness] GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}.`);
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('[firebase-deployment-readiness] No HTTP transport is available for Google Cloud readiness checks.');
  }

  const accessToken = await tokenProvider();
  const encodedProject = encodeURIComponent(projectId);
  const billingInfo = await requestJson({
    fetchImpl,
    accessToken,
    context: 'billing',
    url: `https://cloudbilling.googleapis.com/v1/projects/${encodedProject}/billingInfo`,
  });

  if (billingInfo.billingEnabled !== true) {
    throw new Error(
      `[firebase-deployment-readiness] Cloud Billing is not active for ${projectId}. Link the project to an active billing account, wait for propagation, then rerun the protected readiness check.`,
    );
  }

  await requestJson({
    fetchImpl,
    accessToken,
    context: 'functions',
    url: `https://cloudfunctions.googleapis.com/v2/projects/${encodedProject}/locations/${encodeURIComponent(region)}/functions?pageSize=1`,
  });

  return {
    status: 'passed',
    projectId,
    region,
    billingActive: true,
    cloudFunctionsListAccess: true,
    deploymentPerformed: false,
    secretValuesExcluded: true,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  verifyFirebaseDeploymentReadiness()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Firebase deployment readiness check failed.';
      console.error(message);
      process.exit(1);
    });
}
