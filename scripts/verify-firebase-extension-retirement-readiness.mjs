#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import * as admin from 'firebase-admin';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const SOURCE_ROOTS = ['src', 'apps', 'functions', 'packages'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'lib', 'build', 'dist', 'coverage', '.git']);

export const RETIREMENT_TARGETS = Object.freeze([
  {
    instanceId: 'firestore-multimodal-genai',
    extensionRef: 'googlecloud/firestore-multimodal-genai',
    sourceCollection: 'generate',
    strategy: 'REPOSITORY_OWNED_AI_CALLABLE',
  },
  {
    instanceId: 'firestore-bigquery-export',
    extensionRef: 'firebase/firestore-bigquery-export',
    sourceCollection: 'posts',
    strategy: 'REMOVE_UNUSED_DEFAULT_EXPORT',
    bigQuery: {
      projectId: EXPECTED_PROJECT_ID,
      datasetId: 'firestore_export',
      tableId: 'posts_raw_changelog',
    },
  },
  {
    instanceId: 'firestore-bundle-builder',
    extensionRef: 'firebase/firestore-bundle-builder',
    sourceCollection: 'bundles',
    strategy: 'REMOVE_UNUSED_BUNDLE_SERVICE',
  },
]);

const COUPLING_RULES = Object.freeze({
  'firestore-multimodal-genai': [
    { id: 'EXTENSION_FUNCTION_REFERENCE', regex: /ext-firestore-multimodal-genai/i },
    { id: 'EXTENSION_PACKAGE_REFERENCE', regex: /firestore-multimodal-genai/i },
    { id: 'LEGACY_GENERATE_COLLECTION', regex: /(?:collection|doc)\s*\([^\n)]*["']generate["']/i },
    { id: 'LEGACY_GENERATE_COLLECTION_ADMIN', regex: /\.collection\s*\(\s*["']generate["']/i },
  ],
  'firestore-bigquery-export': [
    { id: 'EXTENSION_FUNCTION_REFERENCE', regex: /ext-firestore-bigquery-export/i },
    { id: 'EXTENSION_PACKAGE_REFERENCE', regex: /firestore-bigquery-export/i },
    { id: 'LEGACY_POSTS_COLLECTION', regex: /(?:collection|doc)\s*\([^\n)]*["']posts["']/i },
    { id: 'LEGACY_POSTS_COLLECTION_ADMIN', regex: /\.collection\s*\(\s*["']posts["']/i },
  ],
  'firestore-bundle-builder': [
    { id: 'EXTENSION_FUNCTION_REFERENCE', regex: /ext-firestore-bundle-builder/i },
    { id: 'EXTENSION_PACKAGE_REFERENCE', regex: /firestore-bundle-builder/i },
    { id: 'FIRESTORE_LOAD_BUNDLE', regex: /\bloadBundle\s*\(/i },
    { id: 'FIRESTORE_NAMED_QUERY', regex: /\bnamedQuery\s*\(/i },
    { id: 'LEGACY_BUNDLES_COLLECTION', regex: /(?:collection|doc)\s*\([^\n)]*["']bundles["']/i },
    { id: 'LEGACY_BUNDLES_COLLECTION_ADMIN', regex: /\.collection\s*\(\s*["']bundles["']/i },
  ],
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readTextIfPresent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function walkSourceFiles(root) {
  const files = [];
  const visit = (current) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  };
  visit(root);
  return files;
}

export function inspectRepositoryRetirementContracts(repoRoot = process.cwd()) {
  const aiSource = readTextIfPresent(path.join(repoRoot, 'functions/aiDesignStudioCompat.ts'));
  const runtimeSource = readTextIfPresent(path.join(repoRoot, 'functions/runtime.ts'));
  const aiReplacementReady = [
    /export const generateDesignConceptCompat\s*=\s*onCall/.test(aiSource),
    /enforceAppCheck:\s*true/.test(aiSource),
    /editImageWithOpenAI/.test(aiSource),
    /export \* from ["']\.\/aiDesignStudioCompat["']/.test(runtimeSource),
  ].every(Boolean);

  const sourceFiles = SOURCE_ROOTS
    .flatMap((sourceRoot) => walkSourceFiles(path.join(repoRoot, sourceRoot)))
    .filter((file, index, values) => values.indexOf(file) === index);
  const coupling = {};

  for (const target of RETIREMENT_TARGETS) {
    const matches = [];
    for (const file of sourceFiles) {
      const source = readTextIfPresent(file);
      for (const rule of COUPLING_RULES[target.instanceId] || []) {
        if (rule.regex.test(source)) {
          matches.push({
            file: path.relative(repoRoot, file).replaceAll(path.sep, '/'),
            rule: rule.id,
          });
        }
      }
      if (matches.length >= 25) break;
    }
    coupling[target.instanceId] = matches;
  }

  return {
    aiReplacementReady,
    aiReplacementContract: {
      callable: 'generateDesignConceptCompat',
      appCheckEnforced: /enforceAppCheck:\s*true/.test(aiSource),
      runtimeExported: /export \* from ["']\.\/aiDesignStudioCompat["']/.test(runtimeSource),
      repositoryOwnedImageEditing: /editImageWithOpenAI/.test(aiSource),
    },
    coupling,
  };
}

function normalizeCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function targetReadiness(target, installed, observations) {
  if (!installed) {
    return {
      instanceId: target.instanceId,
      extensionRef: target.extensionRef,
      installed: false,
      status: 'ALREADY_REMOVED',
      safeToRetire: true,
      blockers: [],
      evidence: {},
    };
  }

  const blockers = [];
  const collectionCount = normalizeCount(observations.firestoreCounts?.[target.sourceCollection]);
  const coupling = observations.repository?.coupling?.[target.instanceId] || [];

  if (installed.extensionRef !== target.extensionRef) blockers.push('EXTENSION_REFERENCE_MISMATCH');
  if (collectionCount === null) blockers.push('SOURCE_COLLECTION_COUNT_UNAVAILABLE');
  else if (collectionCount > 0) blockers.push('SOURCE_COLLECTION_NOT_EMPTY');
  if (coupling.length > 0) blockers.push('LEGACY_REPOSITORY_COUPLING');

  if (target.instanceId === 'firestore-multimodal-genai' && observations.repository?.aiReplacementReady !== true) {
    blockers.push('REPOSITORY_AI_REPLACEMENT_NOT_READY');
  }

  let bigQueryEvidence = null;
  if (target.bigQuery) {
    const bigQuery = observations.bigQuery || {};
    const rowCount = normalizeCount(bigQuery.rowCount);
    bigQueryEvidence = {
      datasetExists: bigQuery.datasetExists === true,
      tableExists: bigQuery.tableExists === true,
      rowCount,
      inventoryStatus: String(bigQuery.status || 'UNKNOWN'),
    };
    if (!['AVAILABLE', 'TABLE_ABSENT', 'DATASET_ABSENT'].includes(bigQueryEvidence.inventoryStatus)) {
      blockers.push('BIGQUERY_INVENTORY_UNAVAILABLE');
    } else if (bigQueryEvidence.tableExists && rowCount === null) {
      blockers.push('BIGQUERY_ROW_COUNT_UNAVAILABLE');
    } else if (rowCount !== null && rowCount > 0) {
      blockers.push('BIGQUERY_DATA_PRESERVATION_REQUIRED');
    }
  }

  return {
    instanceId: target.instanceId,
    extensionRef: installed.extensionRef,
    installed: true,
    version: installed.version || null,
    state: installed.state || null,
    strategy: target.strategy,
    status: blockers.length === 0 ? 'SAFE_TO_RETIRE' : 'BLOCKED',
    safeToRetire: blockers.length === 0,
    blockers: [...new Set(blockers)].sort(),
    evidence: {
      sourceCollection: target.sourceCollection,
      sourceDocumentCount: collectionCount,
      repositoryCouplingCount: coupling.length,
      repositoryCoupling: coupling,
      aiReplacementReady: target.instanceId === 'firestore-multimodal-genai'
        ? observations.repository?.aiReplacementReady === true
        : null,
      bigQuery: bigQueryEvidence,
    },
  };
}

export function buildFirebaseExtensionRetirementReadinessReport(inventory, observations, {
  projectId = EXPECTED_PROJECT_ID,
  generatedAt = new Date().toISOString(),
  commitSha = process.env.GITHUB_SHA || null,
  repository = process.env.GITHUB_REPOSITORY || null,
  workflowRunId = process.env.GITHUB_RUN_ID || null,
} = {}) {
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Refusing Firebase Extension readiness verification for unexpected project ${projectId}.`);
  }
  if (inventory?.projectId && inventory.projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Extension inventory belongs to unexpected project ${inventory.projectId}.`);
  }

  const installedById = new Map((inventory?.instances || []).map((item) => [item.instanceId, item]));
  const expectedIds = new Set(RETIREMENT_TARGETS.map((item) => item.instanceId));
  const unmanaged = [...installedById.values()]
    .filter((item) => !expectedIds.has(item.instanceId))
    .map((item) => ({
      instanceId: item.instanceId,
      extensionRef: item.extensionRef,
      status: 'BLOCKED',
      safeToRetire: false,
      blockers: ['UNMANAGED_EXTENSION_INSTANCE'],
    }));

  const instances = RETIREMENT_TARGETS.map((target) => (
    targetReadiness(target, installedById.get(target.instanceId), observations || {})
  ));
  const installedTargets = instances.filter((item) => item.installed);
  const safeInstanceIds = installedTargets.filter((item) => item.safeToRetire).map((item) => item.instanceId);
  const blockedInstanceIds = installedTargets.filter((item) => !item.safeToRetire).map((item) => item.instanceId);
  const allInstalledInstancesManaged = unmanaged.length === 0;
  const allInstalledTargetsReady = blockedInstanceIds.length === 0;

  return {
    schemaVersion: 1,
    projectId,
    generatedAt,
    commitSha,
    repository,
    workflowRunId,
    status: unmanaged.length > 0
      ? 'BLOCKED'
      : blockedInstanceIds.length > 0
        ? (safeInstanceIds.length > 0 ? 'PARTIALLY_READY' : 'BLOCKED')
        : 'READY_TO_RETIRE',
    installedExtensionCount: inventory?.activeExtensionCount ?? (inventory?.instances || []).length,
    managedInstalledTargetCount: installedTargets.length,
    safeToRetireCount: safeInstanceIds.length,
    safeInstanceIds,
    blockedInstanceIds,
    allInstalledInstancesManaged,
    allInstalledTargetsReady,
    instances,
    unmanagedInstances: unmanaged,
    controls: {
      productionProjectBound: true,
      liveFirestoreCountsChecked: true,
      bigQueryDataPreservationChecked: true,
      repositoryCouplingChecked: true,
      repositoryOwnedAiReplacementChecked: true,
      rawDocumentDataExported: false,
      extensionConfigurationExported: false,
      uninstallAuthorized: false,
    },
  };
}

async function countCollection(db, collectionName) {
  const snapshot = await db.collection(collectionName).count().get();
  return Number(snapshot.data().count);
}

async function getAccessToken() {
  const credential = admin.app().options.credential;
  if (!credential || typeof credential.getAccessToken !== 'function') {
    throw new Error('Application Default Credentials do not expose an access token provider.');
  }
  const token = await credential.getAccessToken();
  if (!token?.access_token) throw new Error('Application Default Credentials returned no access token.');
  return token.access_token;
}

async function fetchGoogleJson(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return { status: 404, body: null };
  if (!response.ok) throw new Error(`Google API request failed with HTTP ${response.status}.`);
  return { status: response.status, body: await response.json() };
}

async function inspectBigQuery(target) {
  try {
    const accessToken = await getAccessToken();
    const datasetUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(target.projectId)}/datasets/${encodeURIComponent(target.datasetId)}`;
    const dataset = await fetchGoogleJson(datasetUrl, accessToken);
    if (dataset.status === 404) {
      return { status: 'DATASET_ABSENT', datasetExists: false, tableExists: false, rowCount: 0 };
    }

    const tableUrl = `${datasetUrl}/tables/${encodeURIComponent(target.tableId)}`;
    const table = await fetchGoogleJson(tableUrl, accessToken);
    if (table.status === 404) {
      return { status: 'TABLE_ABSENT', datasetExists: true, tableExists: false, rowCount: 0 };
    }

    return {
      status: 'AVAILABLE',
      datasetExists: true,
      tableExists: true,
      rowCount: normalizeCount(table.body?.numRows),
    };
  } catch (error) {
    return {
      status: 'UNAVAILABLE',
      datasetExists: null,
      tableExists: null,
      rowCount: null,
      errorCode: String(error?.message || 'BigQuery inventory failed').slice(0, 160),
    };
  }
}

async function collectLiveObservations(repoRoot) {
  if (process.env.DEPLOYMENT_ENVIRONMENT !== 'production') {
    throw new Error('DEPLOYMENT_ENVIRONMENT=production is required for live Extension retirement verification.');
  }
  const projectId = process.env.GCP_PROJECT_ID || EXPECTED_PROJECT_ID;
  if (projectId !== EXPECTED_PROJECT_ID) throw new Error(`Unexpected project ${projectId}.`);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }
  const db = admin.firestore();
  const firestoreCounts = {};
  for (const collectionName of [...new Set(RETIREMENT_TARGETS.map((item) => item.sourceCollection))]) {
    firestoreCounts[collectionName] = await countCollection(db, collectionName);
  }

  const bigQueryTarget = RETIREMENT_TARGETS.find((item) => item.bigQuery)?.bigQuery;
  return {
    firestoreCounts,
    bigQuery: bigQueryTarget ? await inspectBigQuery(bigQueryTarget) : null,
    repository: inspectRepositoryRetirementContracts(repoRoot),
  };
}

function parseArgs(argv) {
  const args = {
    inventory: '',
    output: 'launch_package/firebase-extension-retirement-readiness.json',
    repoRoot: process.cwd(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--inventory') args.inventory = argv[++index] || '';
    else if (value === '--output') args.output = argv[++index] || args.output;
    else if (value === '--repo-root') args.repoRoot = path.resolve(argv[++index] || args.repoRoot);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.inventory) throw new Error('--inventory is required.');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inventory = readJson(args.inventory);
  const observations = await collectLiveObservations(args.repoRoot);
  const report = buildFirebaseExtensionRetirementReadinessReport(inventory, observations, {
    projectId: process.env.GCP_PROJECT_ID || EXPECTED_PROJECT_ID,
  });
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[firebase-extension-retirement] ${report.status}: ${report.safeToRetireCount}/${report.managedInstalledTargetCount} installed target(s) safe to retire.`);
  for (const item of report.instances.filter((entry) => entry.installed)) {
    console.log(`- ${item.instanceId}: ${item.status}${item.blockers.length ? ` (${item.blockers.join(', ')})` : ''}`);
  }
  for (const item of report.unmanagedInstances) {
    console.log(`- ${item.instanceId}: BLOCKED (UNMANAGED_EXTENSION_INSTANCE)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[firebase-extension-retirement] ${error.message}`);
    process.exit(1);
  });
}
