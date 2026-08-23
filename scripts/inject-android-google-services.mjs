#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_PACKAGE = 'ae.bingroups.superapp';
const encoded = String(process.env.ANDROID_GOOGLE_SERVICES_JSON_BASE64 || '').trim();

if (!encoded) {
  console.error('[android-google-services] missing ANDROID_GOOGLE_SERVICES_JSON_BASE64');
  process.exit(1);
}

let decoded;
let config;
try {
  decoded = Buffer.from(encoded, 'base64').toString('utf8');
  config = JSON.parse(decoded);
} catch (error) {
  console.error('[android-google-services] protected Firebase Android config is not valid base64 JSON');
  process.exit(1);
}

if (String(config?.project_info?.project_id || '') !== EXPECTED_PROJECT_ID) {
  console.error('[android-google-services] Firebase project_id does not match the protected BIN GROUP production project');
  process.exit(1);
}

const clients = Array.isArray(config?.client) ? config.client : [];
const androidClient = clients.find(
  (client) => String(client?.client_info?.android_client_info?.package_name || '') === EXPECTED_PACKAGE,
);
if (!androidClient) {
  console.error('[android-google-services] Firebase Android config does not contain ae.bingroups.superapp');
  process.exit(1);
}
if (!String(androidClient?.client_info?.mobilesdk_app_id || '').trim()) {
  console.error('[android-google-services] Firebase Android app ID is missing for ae.bingroups.superapp');
  process.exit(1);
}

const outputPath = path.join(process.cwd(), 'android', 'app', 'google-services.json');
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${decoded.trim()}\n`, { encoding: 'utf8', mode: 0o600 });
chmodSync(outputPath, 0o600);

console.log('[android-google-services] validated and injected Firebase Android configuration');
console.log(`[android-google-services] project=${EXPECTED_PROJECT_ID} package=${EXPECTED_PACKAGE}`);
