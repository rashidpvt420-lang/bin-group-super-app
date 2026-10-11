import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { ownerEvidenceLocation, ownerEvidenceGeoIdentity, selectUnusedOwnerEvidenceLocation } from '../../scripts/lib/owner-evidence-location.mjs';
import { patchTenantEvidence } from '../../scripts/patch-phase21-postdeploy-evidence.mjs';

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('functions/propertyIdentity.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports, require: createRequire(import.meta.url) });

function database(claims = new Set(), legacy = []) {
  const reads = [];
  return {
    reads,
    collection(name) {
      return name === 'property_identity_registry' ? {
        doc(id) { return { async get() { reads.push(id); return { exists: claims.has(id) }; } }; },
      } : {
        where(field, operator, latitude) {
          assert.equal(field, 'geo.lat'); assert.equal(operator, '==');
          return { limit() { return { async get() {
            return { docs: legacy.filter((p) => p.geo.lat === latitude).map((p) => ({ data: () => p })) };
          } }; } };
        },
      };
    },
  };
}

test('Owner candidate hashes match real production GEO_UNIT identities after rounding', () => {
  const keys = new Set();
  for (let i = 0; i < 1000; i += 1) {
    const location = ownerEvidenceLocation(`release-run-${i}`);
    const canonical = exports.buildPropertyIdentities({ propertyType: 'Building', geo: { lat: location.latitude, lng: location.longitude } });
    assert.equal(ownerEvidenceGeoIdentity(location), canonical[0].hash);
    assert.ok(Math.abs(location.latitude - 24.4958) <= 0.004);
    assert.ok(Math.abs(location.longitude - 54.4074) <= 0.004);
    keys.add(canonical[0].hash);
  }
  assert.ok(keys.size > 990, 'independent GPS axes must avoid the old 81-cell diagonal');
});

test('existing rounded Owner claims and legacy properties are preserved and avoided', async () => {
  const seed = 'collision';
  const first = ownerEvidenceLocation(seed);
  const second = ownerEvidenceLocation(seed, 1);
  const db = database(new Set([ownerEvidenceGeoIdentity(first)]), [{ propertyType: 'Building', geo: { lat: second.latitude, lng: second.longitude } }]);
  assert.deepEqual(await selectUnusedOwnerEvidenceLocation(db, seed), ownerEvidenceLocation(seed, 2));
  assert.equal(db.reads.length, 3);
});

test('exhausted Owner location checks fail closed without altering any claim', async () => {
  const seed = 'exhausted';
  const db = database(new Set(Array.from({ length: 20 }, (_, i) => ownerEvidenceGeoIdentity(ownerEvidenceLocation(seed, i)))));
  await assert.rejects(selectUnusedOwnerEvidenceLocation(db, seed), /claims were preserved/);
  assert.equal(db.reads.length, 20);
});

test('Owner wrapper emits runnable isolated evidence with one GPS fix for submission and visit', () => {
  const root = mkdtempSync(join(tmpdir(), 'owner-location-wrapper-'));
  try {
    mkdirSync(join(root, 'scripts/lib'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    copyFileSync('scripts/lib/owner-evidence-location.mjs', join(root, 'scripts/lib/owner-evidence-location.mjs'));
    copyFileSync('scripts/run-owner-inspection-first-production-evidence-unique.mjs', join(root, 'scripts/run-owner-inspection-first-production-evidence-unique.mjs'));
    writeFileSync(join(root, 'scripts/run-owner-inspection-first-production-evidence.mjs'), `#!/usr/bin/env node
import assert from 'node:assert/strict';
const db = { collection() { return { doc() { return { async get() { return { exists: false }; } }; }, where() { return { limit() { return { async get() { return { docs: [] }; } }; } }; } }; } };
async function main() {
  const propertyName = 'E2E Owner Acquisition Tower';
  const points = [[24.4958, 54.4074], [24.4958, 54.4074], [24.4958, 54.4074]];
  assert.deepEqual(points[0], points[1]); assert.deepEqual(points[0], points[2]);
  assert.match(propertyName, /^E2E Owner Acquisition Tower [a-f0-9]{10}$/);
}
await main();`);
    const result = spawnSync(process.execPath, ['scripts/run-owner-inspection-first-production-evidence-unique.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readdirSync(join(root, 'scripts')).filter((name) => name.startsWith('.run-owner')).length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('protected Tenant replay retains real arrival and completion assertions with an actionable click', () => {
  const source = patchTenantEvidence(readFileSync('tests/e2e/business-tenant.spec.ts', 'utf8'));
  const trip = source.slice(source.indexOf("if (lifecycleStatus === 'ACCEPTED')"), source.indexOf("expect(['EN_ROUTE'"));
  assert.doesNotMatch(trip, /reloadTechnicianMission/);
  assert.match(source, /page\.locator\('button:has-text\("Arrived"\),/);
  assert.match(source, /\.click\(\{ timeout: 40_000 \}\)/);
  assert.match(source, /arrival must reach production Firestore/);
  assert.match(source, /\.toBe\('ARRIVED'\)/);
  assert.match(source, /COMPLETED_PENDING_\(APPROVAL\|TENANT_APPROVAL\)/);
});
