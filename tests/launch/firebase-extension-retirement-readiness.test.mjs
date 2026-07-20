import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildFirebaseExtensionRetirementReadinessReport,
  inspectRepositoryRetirementContracts,
} from '../../scripts/verify-firebase-extension-retirement-readiness.mjs';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

const inventory = {
  projectId: 'bin-group-57c60',
  activeExtensionCount: 3,
  instances: [
    {
      instanceId: 'firestore-multimodal-genai',
      extensionRef: 'googlecloud/firestore-multimodal-genai',
      version: '1.0.5',
      state: 'ACTIVE',
    },
    {
      instanceId: 'firestore-bigquery-export',
      extensionRef: 'firebase/firestore-bigquery-export',
      version: '0.2.10',
      state: 'ACTIVE',
    },
    {
      instanceId: 'firestore-bundle-builder',
      extensionRef: 'firebase/firestore-bundle-builder',
      version: '0.1.4',
      state: 'ACTIVE',
    },
  ],
};

function safeObservations() {
  return {
    firestoreCounts: {
      generate: 0,
      posts: 0,
      bundles: 0,
    },
    bigQuery: {
      status: 'TABLE_ABSENT',
      datasetExists: true,
      tableExists: false,
      rowCount: 0,
    },
    repository: {
      aiReplacementReady: true,
      coupling: {
        'firestore-multimodal-genai': [],
        'firestore-bigquery-export': [],
        'firestore-bundle-builder': [],
      },
    },
  };
}

test('marks the exact three installed production Extensions safe only after live data and replacement proof', () => {
  const report = buildFirebaseExtensionRetirementReadinessReport(inventory, safeObservations(), {
    generatedAt: '2026-07-20T00:00:00.000Z',
  });

  assert.equal(report.status, 'READY_TO_RETIRE');
  assert.equal(report.safeToRetireCount, 3);
  assert.deepEqual(report.safeInstanceIds, [
    'firestore-multimodal-genai',
    'firestore-bigquery-export',
    'firestore-bundle-builder',
  ]);
  assert.equal(report.controls.rawDocumentDataExported, false);
  assert.equal(report.controls.extensionConfigurationExported, false);
  assert.equal(report.controls.uninstallAuthorized, false);
});

test('blocks each Extension when live source data, historical BigQuery rows, or repository coupling remains', () => {
  const observations = safeObservations();
  observations.firestoreCounts.generate = 2;
  observations.firestoreCounts.bundles = 1;
  observations.bigQuery = {
    status: 'AVAILABLE',
    datasetExists: true,
    tableExists: true,
    rowCount: 9,
  };
  observations.repository.coupling['firestore-bigquery-export'] = [
    { file: 'src/example.ts', rule: 'LEGACY_POSTS_COLLECTION' },
  ];

  const report = buildFirebaseExtensionRetirementReadinessReport(inventory, observations);
  const byId = new Map(report.instances.map((item) => [item.instanceId, item]));

  assert.equal(report.status, 'BLOCKED');
  assert.ok(byId.get('firestore-multimodal-genai').blockers.includes('SOURCE_COLLECTION_NOT_EMPTY'));
  assert.ok(byId.get('firestore-bigquery-export').blockers.includes('BIGQUERY_DATA_PRESERVATION_REQUIRED'));
  assert.ok(byId.get('firestore-bigquery-export').blockers.includes('LEGACY_REPOSITORY_COUPLING'));
  assert.ok(byId.get('firestore-bundle-builder').blockers.includes('SOURCE_COLLECTION_NOT_EMPTY'));
});

test('fails closed for an installed Extension that is not in the approved retirement plan', () => {
  const expanded = {
    ...inventory,
    activeExtensionCount: 4,
    instances: [
      ...inventory.instances,
      { instanceId: 'unexpected-extension', extensionRef: 'vendor/unexpected', state: 'ACTIVE' },
    ],
  };
  const report = buildFirebaseExtensionRetirementReadinessReport(expanded, safeObservations());
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.allInstalledInstancesManaged, false);
  assert.deepEqual(report.unmanagedInstances[0].blockers, ['UNMANAGED_EXTENSION_INSTANCE']);
});

test('current repository exposes the App Check-protected self-managed AI replacement', () => {
  const repository = inspectRepositoryRetirementContracts(new URL('../..', import.meta.url).pathname);
  assert.equal(repository.aiReplacementReady, true);
  assert.equal(repository.aiReplacementContract.callable, 'generateDesignConceptCompat');
  assert.equal(repository.aiReplacementContract.appCheckEnforced, true);
  assert.equal(repository.aiReplacementContract.runtimeExported, true);
  assert.equal(repository.aiReplacementContract.repositoryOwnedImageEditing, true);
});

test('protected workflow computes readiness before accepting destructive targets', async () => {
  const workflow = await read('.github/workflows/firebase-extensions-decommission.yml');
  const readinessIndex = workflow.indexOf('Verify live Extension retirement readiness');
  const validationIndex = workflow.indexOf('Validate requested uninstall targets and readiness');
  const uninstallIndex = workflow.indexOf('Uninstall verified migrated instances');

  assert.ok(readinessIndex >= 0);
  assert.ok(validationIndex > readinessIndex);
  assert.ok(uninstallIndex > validationIndex);
  assert.match(workflow, /DEPLOYMENT_ENVIRONMENT: production/);
  assert.match(workflow, /firebase-extension-retirement-readiness-before\.json/);
  assert.match(workflow, /item\.installed && item\.safeToRetire === true/);
  assert.match(workflow, /Extension instance is not safe to retire/);
  assert.match(workflow, /Runtime Firestore and BigQuery data checked before removal/);
});
