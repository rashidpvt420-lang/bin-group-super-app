#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const postDeployBusinessSuites = [
  'businessOwner',
  'businessTenant',
  'businessTechnician',
  'businessBroker',
  'businessGlobal',
];

let exitCode = 0;
for (const suite of postDeployBusinessSuites) {
  const result = spawnSync(
    process.execPath,
    ['scripts/run-critical-evidence.mjs', '--suite', suite],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    },
  );
  const suiteExit = result.status ?? 1;
  if (suiteExit !== 0) exitCode = suiteExit;
}

console.log(`[protected-business-evidence] deployment_suites=${postDeployBusinessSuites.join(',')} admin_proof=post-deploy-real-mfa exit_code=${exitCode} hardLaunchClaim=false`);
process.exit(exitCode);
