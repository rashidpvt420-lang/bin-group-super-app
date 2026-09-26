import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const verifier = resolve('scripts/verify-google-maps-api-key-restrictions.mjs');
const requiredServices = [
  'maps-backend.googleapis.com',
  'places-backend.googleapis.com',
  'geocoding-backend.googleapis.com',
  'static-maps-backend.googleapis.com',
];
const productionOrigins = [
  'https://bin-groups.com/*',
  'https://www.bin-groups.com/*',
  'https://bin-group-57c60.web.app/*',
];
const adminOrigin = 'https://bin-group-admin-panel.web.app/*';
const webviewOrigin = 'https://localhost/*';

const stubFetch = `
  globalThis.fetch = async (url) => {
    if (String(url).includes('lookupKey')) return new Response(JSON.stringify({
      name: 'projects/12345/locations/global/keys/test-key',
      parent: 'projects/12345/locations/global'
    }), { status: 200 });
    return new Response(JSON.stringify({
      restrictions: {
        browserKeyRestrictions: { allowedReferrers: JSON.parse(process.env.MAPS_TEST_REFERRERS) },
        apiTargets: JSON.parse(process.env.MAPS_TEST_SERVICES).map(service => ({ service }))
      }
    }), { status: 200 });
  };
`;

function verify(key, { referrers, services = requiredServices, repair = false, protectedContext = false }) {
  const result = spawnSync(process.execPath, [
    `--import=data:text/javascript,${encodeURIComponent(stubFetch)}`,
    verifier,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(key, 'bin')}:${process.env.PATH}`,
      GCP_PROJECT_ID: 'bin-group-57c60',
      VITE_GOOGLE_MAPS_API_KEY: 'test-maps-key',
      MAPS_TEST_REFERRERS: JSON.stringify(referrers),
      MAPS_TEST_SERVICES: JSON.stringify(services),
      MAPS_ALLOW_PRODUCTION_RESTRICTION_REPAIR: String(repair),
      GITHUB_ACTIONS: protectedContext ? 'true' : 'false',
      GITHUB_WORKFLOW: protectedContext ? 'Firebase Production Deploy' : 'unit-test',
      GITHUB_JOB: protectedContext ? 'deploy-firebase-production-stack' : 'unit-test',
      GITHUB_REF: protectedContext ? 'refs/heads/main' : 'refs/heads/test',
    },
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

test('Phase 21 Maps repair allows only the two confirmed missing origins before a full strict check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phase21-maps-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const gcloud = join(bin, 'gcloud');
    writeFileSync(gcloud, `#!/bin/sh
case "$1 $2" in
  'auth print-access-token') echo test-token ;;
  'projects describe') echo 12345 ;;
  'services list') printf '%s\\n' ${requiredServices.map(s => `'${s}'`).join(' ')} ;;
  *) exit 1 ;;
esac
`);
    chmodSync(gcloud, 0o755);

    const withoutBoth = productionOrigins;
    const strict = verify(dir, { referrers: withoutBoth });
    assert.notEqual(strict.status, 0);
    assert.match(strict.output, /Admin referrer is not covered:|Required Maps referrer is not covered: https:\/\/bin-group-admin-panel\.web\.app/);

    const unprotected = verify(dir, { referrers: withoutBoth, repair: true });
    assert.notEqual(unprotected.status, 0);
    assert.match(unprotected.output, /only inside the protected Firebase Production Deploy job/);

    const repair = verify(dir, { referrers: withoutBoth, repair: true, protectedContext: true });
    assert.equal(repair.status, 0, repair.output);
    assert.match(repair.output, /repairTolerance=admin-webview-and-directions-target-only/);

    const onlyAdmin = verify(dir, { referrers: [...withoutBoth, adminOrigin] });
    assert.notEqual(onlyAdmin.status, 0);
    assert.match(onlyAdmin.output, /Required Maps referrer is not covered: https:\/\/localhost\/\*/);

    const complete = verify(dir, { referrers: [...withoutBoth, adminOrigin, webviewOrigin] });
    assert.equal(complete.status, 0, complete.output);
    assert.match(complete.output, /repairTolerance=none/);

    const knownRepair = verify(dir, {
      referrers: withoutBoth,
      services: [...requiredServices, 'directions-backend.googleapis.com'],
      repair: true,
      protectedContext: true,
    });
    assert.equal(knownRepair.status, 0, knownRepair.output);
    assert.match(knownRepair.output, /admin-webview-and-directions-target-only/);

    for (const { referrers, services, error } of [
      { referrers: withoutBoth.filter(x => !x.includes('www.')), error: /www\.bin-groups\.com/ },
      { referrers: [...withoutBoth, 'https://*/*'], error: /unrestricted\/wildcard Maps referrer/ },
      { referrers: withoutBoth, services: [...requiredServices, 'other.googleapis.com'], error: /Unexpected API target/ },
    ]) {
      const denied = verify(dir, { referrers, services, repair: true, protectedContext: true });
      assert.notEqual(denied.status, 0);
      assert.match(denied.output, error);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
