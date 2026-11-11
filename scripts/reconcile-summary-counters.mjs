#!/usr/bin/env node
/**
 * Rebuild sharded admin open-ticket counters and incremental owner_summaries
 * from current ticket and property documents.
 *
 * Safety: refuses production and any non-demo project unless the Firestore
 * emulator is in use. This script is never an approved production deploy path.
 *
 * Usage (emulator):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 GCLOUD_PROJECT=demo-bin-capacity \
 *     node scripts/reconcile-summary-counters.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const PRODUCTION_PROJECTS = new Set(['bin-group-57c60']);

if (!projectId) {
  console.error('GCLOUD_PROJECT is required.');
  process.exit(2);
}
if (PRODUCTION_PROJECTS.has(projectId) || (!projectId.startsWith('demo-') && !emulatorHost)) {
  console.error(`Refusing to reconcile summaries for ${projectId}. Use a demo- project and/or the Firestore emulator.`);
  process.exit(2);
}
if (!emulatorHost && projectId.startsWith('demo-')) {
  console.error('A demo- project still needs FIRESTORE_EMULATOR_HOST so this never touches live data.');
  process.exit(2);
}

const require = createRequire(path.join(root, 'functions', 'package.json'));
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId });

const { loadTsModules } = await import('../test/helpers/load-ts-module.mjs');
const counters = await loadTsModules(
  path.join(root, 'functions/summaryCounters.ts'),
  [path.join(root, 'functions/summaryCounterMath.ts')],
);

const result = await counters.reconcileSummaryCounters(admin.firestore());
console.log(JSON.stringify({ ok: true, projectId, emulatorHost, ...result }, null, 2));
process.exit(0);
