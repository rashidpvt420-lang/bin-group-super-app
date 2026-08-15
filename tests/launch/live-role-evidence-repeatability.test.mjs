import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../scripts/run-critical-evidence.mjs', import.meta.url), 'utf8');

test('Tenant business evidence resets correction state before running', () => {
  const fixtureStart = source.indexOf('const SUITE_FIXTURES');
  const businessTenant = source.indexOf('businessTenant:', fixtureStart);
  const tenantFixture = source.indexOf("script: 'scripts/prepare-tenant-correction-e2e.mjs'", businessTenant);
  const brokerFixture = source.indexOf('businessBroker:', fixtureStart);

  assert.ok(fixtureStart >= 0, 'SUITE_FIXTURES must exist');
  assert.ok(businessTenant > fixtureStart, 'businessTenant must have a protected fixture');
  assert.ok(tenantFixture > businessTenant && tenantFixture < brokerFixture,
    'businessTenant must prepare the repeatable Tenant correction fixture before the suite runs');
});

test('production reconciliation compiles Firebase Functions runtime first', () => {
  const buildHelper = source.indexOf('function buildFunctionsRuntimeForVerification()');
  const buildCommand = source.indexOf("['--prefix', 'functions', 'run', 'build']", buildHelper);
  const productionFunction = source.indexOf('async function runProductionDeployment()');
  const buildCall = source.indexOf('buildFunctionsRuntimeForVerification()', productionFunction);
  const productionVerifier = source.indexOf("['scripts/verify-production-deployment.mjs', '--write-evidence']", productionFunction);

  assert.ok(buildHelper >= 0, 'Functions build helper must exist');
  assert.ok(buildCommand > buildHelper, 'Functions build helper must invoke the Functions build');
  assert.ok(productionFunction > buildHelper, 'production deployment verifier must be defined after the build helper');
  assert.ok(buildCall > productionFunction && buildCall < productionVerifier,
    'Functions runtime must compile inside runProductionDeployment before reconciliation');
});
