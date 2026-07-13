#!/usr/bin/env node

import path from 'node:path';
import {
  readJsonStrict,
  validateAuthorizationDocument,
  validateIncidentDocument,
} from './lib/hard-launch-control.mjs';

const failures = [];

function requiredContext(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) failures.push(`${name} is required`);
  return value;
}

const context = {
  commitSha: requiredContext('GITHUB_SHA'),
  ref: requiredContext('GITHUB_REF'),
  repository: requiredContext('GITHUB_REPOSITORY'),
  runId: requiredContext('GITHUB_RUN_ID'),
  actor: requiredContext('GITHUB_ACTOR'),
  authorizedActors: requiredContext('AUTHORIZED_FOUNDER_ACTORS'),
  authorizedEmails: requiredContext('AUTHORIZED_FOUNDER_EMAILS'),
  hmacKey: requiredContext('HARD_LAUNCH_APPROVAL_HMAC_KEY'),
};

try {
  const authorization = readJsonStrict(
    path.resolve('launch_package/hard-launch-authorization.json'),
    'hard-launch-authorization.json',
  );
  failures.push(...validateAuthorizationDocument(authorization, context));
} catch (error) {
  failures.push(error.message);
}

try {
  const incidents = readJsonStrict(
    path.resolve('launch_package/production-incidents.json'),
    'production-incidents.json',
  );
  failures.push(...validateIncidentDocument(incidents));
} catch (error) {
  failures.push(error.message);
}

if (failures.length) {
  console.error('\n[hard-launch-predeploy] FAIL — production deployment is not authorized');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[hard-launch-predeploy] PASS');
console.log('[hard-launch-predeploy] signed founder authorization is valid and bound to this main commit/run');
console.log('[hard-launch-predeploy] production incident telemetry is present and clear');
console.log('[hard-launch-predeploy] this authorizes deployment only; hard launch remains unclaimed until post-deploy live evidence passes');
