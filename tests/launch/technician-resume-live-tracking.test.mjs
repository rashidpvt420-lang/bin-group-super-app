import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');

test('en-route technician tracking resumes after refresh or reconnect', () => {
  assert.match(source, /\['EN_ROUTE', 'ON_THE_WAY'\]\.includes\(lifecycleStatus\)/);
  assert.match(source, /readNativeTechnicianInstallationHash\(\)/);
  assert.match(source, /ensureTechnicianInstallationRegistered\(installationHash\)/);
  assert.match(source, /startLiveTracking\(id, user\.uid/);
  assert.match(source, /\[id, user\?\.uid, ticket\?\.status, online, isTracking\]/);
});
