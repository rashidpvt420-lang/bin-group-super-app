#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_PREVIEW_URL = 'https://bin-founder-totp-260801174030.web.app';
const DEFAULT_MANIFEST_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_OBSERVATION_MS = 15_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function redactUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl));
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

export function classifyConsoleSignal(text) {
  const normalized = String(text || '');
  if (/App Check active\./i.test(normalized)) return 'appcheck-active';
  if (/appcheck\/recaptcha-error/i.test(normalized)) return 'appcheck-recaptcha-error';
  if (/Error while retrieving App Check token/i.test(normalized)) return 'appcheck-token-retrieval-error';
  return null;
}

export function classifyRuntimeSignals({
  appCheckActiveObserved = false,
  appCheckExchangeStatuses = [],
  recaptchaStatuses = [],
  consoleSignals = [],
  requestFailureKinds = [],
  pageErrorCount = 0,
} = {}) {
  const successfulExchangeCount = appCheckExchangeStatuses.filter((status) => status >= 200 && status < 300).length;
  const failedExchangeStatuses = appCheckExchangeStatuses.filter((status) => status < 200 || status >= 300);
  const failedRecaptchaStatuses = recaptchaStatuses.filter((status) => status < 200 || status >= 300);
  const fatalSignals = new Set([
    ...consoleSignals.filter((signal) => signal !== 'appcheck-active'),
    ...requestFailureKinds,
  ]);

  if (!appCheckActiveObserved) fatalSignals.add('appcheck-active-console-not-observed');
  if (successfulExchangeCount === 0) fatalSignals.add('appcheck-token-exchange-not-observed');
  if (failedExchangeStatuses.length > 0) fatalSignals.add('appcheck-token-exchange-http-failure');
  if (failedRecaptchaStatuses.length > 0) fatalSignals.add('recaptcha-http-failure');
  if (pageErrorCount > 0) fatalSignals.add('browser-page-error');

  return {
    passed: fatalSignals.size === 0,
    successfulExchangeCount,
    failedExchangeStatuses,
    failedRecaptchaStatuses,
    fatalSignals: [...fatalSignals].sort(),
  };
}

function normalizeBaseUrl(value) {
  const parsed = new URL(String(value || DEFAULT_PREVIEW_URL));
  if (parsed.protocol !== 'https:') throw new Error('Founder preview verification requires HTTPS.');
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

async function waitForExactManifest(baseUrl, exactHeadSha, timeoutMs) {
  if (!/^[0-9a-f]{40}$/i.test(exactHeadSha)) {
    throw new Error('EXPECTED_HEAD_SHA must be a full 40-character commit SHA.');
  }

  const manifestUrl = `${baseUrl}/founder-preview-${exactHeadSha}.json`;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const response = await fetch(`${manifestUrl}?attempt=${attempt}`, {
        headers: {
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
        redirect: 'follow',
      });
      if (response.ok) {
        const evidence = await response.json();
        const valid =
          evidence?.commitSha === exactHeadSha &&
          evidence?.hostingSite === new URL(baseUrl).hostname &&
          evidence?.deploymentScope === 'temporary-founder-mfa-preview' &&
          evidence?.publicReleaseGate === false &&
          evidence?.hardLaunchClaim === false;
        if (valid) return evidence;
      }
    } catch {
      // The sibling controlled-preview workflow may still be publishing.
    }
    await sleep(5_000);
  }

  throw new Error('Exact-head Founder preview manifest was not available before timeout.');
}

function classifyNetworkTarget(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (
      parsed.hostname === 'firebaseappcheck.googleapis.com' &&
      parsed.pathname.includes(':exchangeRecaptchaV3Token')
    ) {
      return 'appcheck-exchange';
    }
    if (
      (parsed.hostname === 'www.google.com' || parsed.hostname === 'www.recaptcha.net') &&
      parsed.pathname.includes('/recaptcha/api2/clr')
    ) {
      return 'recaptcha-clear';
    }
  } catch {
    return null;
  }
  return null;
}

async function writeEvidence(outputPath, evidence) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

export async function runFounderPreviewAppCheckRuntimeVerification({
  baseUrl = process.env.FOUNDER_PREVIEW_URL || DEFAULT_PREVIEW_URL,
  exactHeadSha = process.env.EXPECTED_HEAD_SHA || '',
  manifestTimeoutMs = Number(process.env.FOUNDER_PREVIEW_MANIFEST_TIMEOUT_MS || DEFAULT_MANIFEST_TIMEOUT_MS),
  observationMs = Number(process.env.FOUNDER_APPCHECK_OBSERVATION_MS || DEFAULT_OBSERVATION_MS),
  evidencePath = process.env.FOUNDER_APPCHECK_EVIDENCE_PATH || 'founder_appcheck_evidence/founder-preview-appcheck-runtime.json',
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  await waitForExactManifest(normalizedBaseUrl, exactHeadSha, manifestTimeoutMs);

  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const appCheckExchangeStatuses = [];
  const recaptchaStatuses = [];
  const consoleSignals = [];
  const requestFailureKinds = [];
  let appCheckActiveObserved = false;
  let pageErrorCount = 0;

  page.on('console', (message) => {
    const signal = classifyConsoleSignal(message.text());
    if (!signal) return;
    if (signal === 'appcheck-active') appCheckActiveObserved = true;
    if (!consoleSignals.includes(signal)) consoleSignals.push(signal);
  });

  page.on('pageerror', () => {
    pageErrorCount += 1;
  });

  page.on('response', (response) => {
    const target = classifyNetworkTarget(response.url());
    if (target === 'appcheck-exchange') appCheckExchangeStatuses.push(response.status());
    if (target === 'recaptcha-clear') recaptchaStatuses.push(response.status());
  });

  page.on('requestfailed', (request) => {
    const target = classifyNetworkTarget(request.url());
    if (target && !requestFailureKinds.includes(`${target}-request-failed`)) {
      requestFailureKinds.push(`${target}-request-failed`);
    }
  });

  try {
    await page.goto(`${normalizedBaseUrl}/login`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForTimeout(observationMs);
  } finally {
    await browser.close();
  }

  const classification = classifyRuntimeSignals({
    appCheckActiveObserved,
    appCheckExchangeStatuses,
    recaptchaStatuses,
    consoleSignals,
    requestFailureKinds,
    pageErrorCount,
  });

  const evidence = {
    schemaVersion: 1,
    commitSha: exactHeadSha,
    hostingSite: new URL(normalizedBaseUrl).hostname,
    deploymentScope: 'temporary-founder-mfa-preview',
    manifestVerified: true,
    appCheckRuntimeOperational: classification.passed,
    appCheckActiveObserved,
    appCheckExchangeStatuses,
    successfulAppCheckExchangeCount: classification.successfulExchangeCount,
    failedAppCheckExchangeStatuses: classification.failedExchangeStatuses,
    recaptchaStatuses,
    failedRecaptchaStatuses: classification.failedRecaptchaStatuses,
    consoleSignals,
    requestFailureKinds,
    pageErrorCount,
    fatalSignals: classification.fatalSignals,
    publicReleaseGate: false,
    hardLaunchClaim: false,
    verifiedAt: new Date().toISOString(),
  };

  await writeEvidence(evidencePath, evidence);

  if (!classification.passed) {
    console.error(`[founder-preview-appcheck] FAIL signals=${classification.fatalSignals.join(',')}`);
    process.exitCode = 1;
  } else {
    console.log('[founder-preview-appcheck] PASS runtime token exchange verified.');
  }

  return evidence;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runFounderPreviewAppCheckRuntimeVerification().catch(async (error) => {
    const evidencePath = process.env.FOUNDER_APPCHECK_EVIDENCE_PATH || 'founder_appcheck_evidence/founder-preview-appcheck-runtime.json';
    const failureEvidence = {
      schemaVersion: 1,
      commitSha: process.env.EXPECTED_HEAD_SHA || null,
      hostingSite: (() => {
        try {
          return new URL(process.env.FOUNDER_PREVIEW_URL || DEFAULT_PREVIEW_URL).hostname;
        } catch {
          return null;
        }
      })(),
      deploymentScope: 'temporary-founder-mfa-preview',
      manifestVerified: false,
      appCheckRuntimeOperational: false,
      fatalSignals: ['verification-exception'],
      failureType: error instanceof Error ? error.name : 'Error',
      publicReleaseGate: false,
      hardLaunchClaim: false,
      verifiedAt: new Date().toISOString(),
    };
    await writeEvidence(evidencePath, failureEvidence).catch(() => undefined);
    console.error(`[founder-preview-appcheck] FAIL ${error instanceof Error ? error.message : 'verification failed'}`);
    process.exit(1);
  });
}
