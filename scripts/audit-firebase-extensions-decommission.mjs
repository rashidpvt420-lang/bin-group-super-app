#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const DECOMMISSION_DATE = '2027-03-31';

const text = (value) => String(value ?? '').trim();

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Firebase Extensions inventory was not valid JSON: ${error.message}`);
  }
}

function candidateArrays(value) {
  const arrays = [];
  const visit = (node, depth = 0) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      arrays.push(node);
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    for (const child of Object.values(node)) visit(child, depth + 1);
  };
  visit(value);
  return arrays;
}

function looksLikeExtensionInstance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).map((key) => key.toLowerCase());
  return keys.some((key) => [
    'instanceid',
    'instance_id',
    'extensioninstanceid',
    'extensionref',
    'extension_ref',
    'ref',
    'spec',
  ].includes(key));
}

function extractInstances(payload) {
  if (!payload) return [];
  if (Array.isArray(payload) && payload.every((item) => typeof item === 'object')) return payload;

  const directCandidates = [
    payload.result,
    payload.extensions,
    payload.instances,
    payload.extensionInstances,
    payload.data,
  ];
  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      for (const nestedKey of ['extensions', 'instances', 'extensionInstances', 'items']) {
        if (Array.isArray(candidate[nestedKey])) return candidate[nestedKey];
      }
    }
  }

  const arrays = candidateArrays(payload)
    .filter((items) => items.some(looksLikeExtensionInstance))
    .sort((left, right) => right.length - left.length);
  return arrays[0] || [];
}

function valueFrom(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && text(value)) return value;
  }
  return '';
}

function normalizeRef(value) {
  if (typeof value === 'string') return text(value);
  if (!value || typeof value !== 'object') return '';
  const publisher = text(value.publisherId || value.publisher || value.publisher_id);
  const extension = text(value.extensionId || value.extension || value.extension_id);
  if (publisher && extension) return `${publisher}/${extension}`;
  return text(value.ref || value.name || value.id);
}

function migrationCategory(extensionRef) {
  const ref = extensionRef.toLowerCase();
  if (ref.includes('firestore-send-email')) return 'SELF_MANAGED_EMAIL_FUNCTION';
  if (ref.includes('storage-resize-images')) return 'SELF_MANAGED_IMAGE_PROCESSOR';
  if (ref.includes('firestore-bigquery-export')) return 'SELF_MANAGED_BIGQUERY_PIPELINE';
  if (ref.includes('translate-text')) return 'SELF_MANAGED_TRANSLATION_FUNCTION';
  if (ref.includes('delete-user-data')) return 'SELF_MANAGED_PRIVACY_ERASURE_FUNCTION';
  return 'MANUAL_EXTENSION_REPLACEMENT_REVIEW';
}

function normalizeInstance(source, index) {
  const spec = source?.spec && typeof source.spec === 'object' ? source.spec : {};
  const extensionRef = normalizeRef(
    valueFrom(source, ['extensionRef', 'extension_ref', 'ref']) ||
    valueFrom(spec, ['extensionRef', 'extension_ref', 'ref', 'name']),
  );
  const instanceId = text(valueFrom(source, [
    'instanceId',
    'instance_id',
    'extensionInstanceId',
    'extension_instance_id',
    'id',
    'name',
  ])).split('/').pop() || `unknown-instance-${index + 1}`;
  const version = text(
    valueFrom(source, ['extensionVersion', 'extension_version', 'version']) ||
    valueFrom(spec, ['extensionVersion', 'extension_version', 'version']),
  );
  const state = text(valueFrom(source, ['state', 'status', 'lifecycleState', 'lifecycle_state']));

  return {
    instanceId,
    extensionRef: extensionRef || 'unknown',
    version: version || null,
    state: state || null,
    migrationCategory: migrationCategory(extensionRef),
  };
}

export function buildFirebaseExtensionsDecommissionReport(payload, {
  projectId = process.env.GCP_PROJECT_ID || EXPECTED_PROJECT_ID,
  generatedAt = new Date().toISOString(),
  commitSha = process.env.GITHUB_SHA || null,
  repository = process.env.GITHUB_REPOSITORY || null,
  workflowRunId = process.env.GITHUB_RUN_ID || null,
} = {}) {
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Refusing Firebase Extensions audit for unexpected project ${projectId}.`);
  }

  const instances = extractInstances(payload)
    .filter((item) => item && typeof item === 'object')
    .map(normalizeInstance)
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));

  const duplicateIds = instances
    .map((item) => item.instanceId)
    .filter((id, index, values) => values.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    throw new Error(`Firebase Extensions inventory contains duplicate instance IDs: ${[...new Set(duplicateIds)].join(', ')}`);
  }

  return {
    schemaVersion: 1,
    projectId,
    generatedAt,
    commitSha,
    repository,
    workflowRunId,
    decommissionDate: DECOMMISSION_DATE,
    status: instances.length === 0 ? 'CLEAR' : 'MIGRATION_REQUIRED',
    activeExtensionCount: instances.length,
    instances,
    controls: {
      newExtensionInstallationAllowed: false,
      extensionManifestAllowedInRepository: false,
      uninstallRequiresProtectedProductionApproval: true,
      uninstallRequiresVerifiedSelfManagedReplacement: true,
      rawExtensionConfigurationExported: false,
    },
  };
}

function parseArgs(argv) {
  const args = { input: '', output: 'launch_package/firebase-extensions-decommission.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') args.input = argv[++index] || '';
    else if (value === '--output') args.output = argv[++index] || args.output;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.input) throw new Error('--input is required.');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = readJson(args.input);
  const report = buildFirebaseExtensionsDecommissionReport(payload);
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[firebase-extensions] ${report.status}: ${report.activeExtensionCount} installed instance(s).`);
  for (const item of report.instances) {
    console.log(`- ${item.instanceId}: ${item.extensionRef}${item.version ? `@${item.version}` : ''} -> ${item.migrationCategory}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`[firebase-extensions] ${error.message}`);
    process.exit(1);
  }
}
