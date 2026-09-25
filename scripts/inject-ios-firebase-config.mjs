#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const projectId = String(process.env.VITE_FIREBASE_PROJECT_ID || 'bin-group-57c60').trim();
const expectedBundleId = 'ae.bingroups.superapp';
const expectedTeamId = String(process.env.APPLE_TEAM_ID || '').trim();
const destination = 'ios/App/App/GoogleService-Info.plist';

function fail(message) {
  console.error('[ios-firebase-config] FAIL:', message);
  process.exit(1);
}

function gcloud(args) {
  try {
    return execFileSync('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    fail(String(error?.stderr || error?.message || 'gcloud failed'));
  }
}

async function getJson(url, token) {
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const body = await response.text();
  if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + body);
  return JSON.parse(body);
}

function plistValue(xml, key) {
  const match = xml.match(new RegExp('<key>' + key + '<\\/key>\\s*<string>([^<]+)<\\/string>'));
  return String(match?.[1] || '').trim();
}

const token = gcloud(['auth', 'print-access-token']);
if (!token) fail('Google Cloud access token is unavailable.');

let apps;
try {
  apps = await getJson('https://firebase.googleapis.com/v1beta1/projects/' + projectId + '/iosApps?pageSize=100', token);
} catch (error) {
  fail('Unable to list Firebase iOS apps: ' + (error instanceof Error ? error.message : error));
}

const matches = (apps.apps || []).filter((app) =>
  app?.bundleId === expectedBundleId && String(app?.state || 'ACTIVE') === 'ACTIVE'
);
if (matches.length !== 1) {
  fail('Expected exactly one ACTIVE Firebase iOS app for ' + expectedBundleId + '; found ' + matches.length + '.');
}
const iosApp = matches[0];
if (!iosApp.appId || !iosApp.name) fail('Firebase iOS app is missing appId/name.');
if (expectedTeamId && String(iosApp.teamId || '') !== expectedTeamId) {
  fail('Firebase iOS Team ID ' + (iosApp.teamId || 'missing') + ' does not match APPLE_TEAM_ID.');
}
if (!iosApp.teamId) fail('Firebase iOS app has no Apple Team ID registered.');

let config;
try {
  config = await getJson('https://firebase.googleapis.com/v1beta1/' + iosApp.name + '/config', token);
} catch (error) {
  fail('Unable to download Firebase iOS config: ' + (error instanceof Error ? error.message : error));
}
const xml = Buffer.from(String(config?.configFileContents || ''), 'base64').toString('utf8');
if (!xml.includes('<plist') || plistValue(xml, 'BUNDLE_ID') !== expectedBundleId) {
  fail('Downloaded Firebase iOS config has an unexpected bundle ID.');
}
if (plistValue(xml, 'PROJECT_ID') !== projectId) fail('Downloaded Firebase iOS config has an unexpected project ID.');
if (plistValue(xml, 'GOOGLE_APP_ID') !== iosApp.appId) fail('Downloaded Firebase iOS config app ID does not match the registered app.');
if (!plistValue(xml, 'API_KEY')) fail('Downloaded Firebase iOS config is missing API_KEY.');

writeFileSync(destination, xml, { mode: 0o600 });
console.log('[ios-firebase-config] PASS');
console.log('[ios-firebase-config] appId=' + iosApp.appId);
console.log('[ios-firebase-config] bundleId=' + iosApp.bundleId);
console.log('[ios-firebase-config] teamId=verified');
