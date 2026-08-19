'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STAGING_PROJECT_ID = 'bin-group-staging';
const PRODUCTION_PROJECT_ID = 'bin-group-57c60';
const activeProject = String(
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  '',
).trim();

// Production and ordinary local/CI builds keep the canonical full runtime.
if (activeProject !== STAGING_PROJECT_ID) {
  process.exit(0);
}

if (activeProject === PRODUCTION_PROJECT_ID) {
  throw new Error('Refusing to select the Staff OS staging runtime for production.');
}

const packagePath = path.join(__dirname, 'package.json');
const stagingRuntimePath = path.join(__dirname, 'lib', 'runtimeStaffStaging.js');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

if (!fs.existsSync(stagingRuntimePath)) {
  console.log(`[functions-runtime] staging runtime not compiled yet (${stagingRuntimePath}); skipping selection`);
  process.exit(0);
}

if (pkg.main !== 'lib/runtimeAll.js' && pkg.main !== 'lib/runtimeStaffStaging.js') {
  throw new Error(`Unexpected Functions entrypoint ${pkg.main}; refusing staging mutation.`);
}

pkg.main = 'lib/runtimeStaffStaging.js';
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`[functions-runtime] selected Staff OS staging runtime for ${activeProject}`);
