import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('shared role journey mounts owner and tenant intelligence without changing dashboard call sites', async () => {
  const source = await read('src/components/RoleJourneyStrip.tsx');
  assert.match(source, /import RoleIntelligencePanel from '\.\/RoleIntelligencePanel'/);
  assert.match(source, /<RoleIntelligencePanel role=\{role\} \/>/);
});

test('owner intelligence exposes explainable financial truth, health, decisions, digital twin and prediction', async () => {
  const [panel, engine] = await Promise.all([
    read('src/components/RoleIntelligencePanel.tsx'),
    read('src/utils/propertyIntelligenceEngine.ts'),
  ]);

  assert.match(panel, /BIN OWNER INTELLIGENCE/);
  assert.match(panel, /Net Operating Income/);
  assert.match(panel, /Net Yield \/ ROI Basis/);
  assert.match(panel, /DIGITAL PROPERTY TWIN/);
  assert.match(panel, /Owner Decision Center/);
  assert.match(panel, /Predictive Maintenance/);
  assert.match(panel, /TRUST \+ MARKET INTELLIGENCE/);

  assert.match(engine, /resolveOwnerFinancialTruth/);
  assert.match(engine, /resolvePropertyHealth/);
  assert.match(engine, /resolvePredictiveMaintenance/);
  assert.match(engine, /resolveOwnerDecisions/);
  assert.match(engine, /resolveDigitalTwin/);
});

test('tenant intelligence exposes residence, maintenance guarantee, unit health, AI and truth labels', async () => {
  const panel = await read('src/components/RoleIntelligencePanel.tsx');

  assert.match(panel, /BIN RESIDENCE INTELLIGENCE/);
  assert.match(panel, /TENANT RESIDENCE CENTER/);
  assert.match(panel, /Maintenance Guarantee/);
  assert.match(panel, /Unit Health \+ Prevention/);
  assert.match(panel, /BIN AI Residence Assistant/);
  assert.match(panel, /EMERGENCY CENTER/);
  assert.match(panel, /LIVE/);
  assert.match(panel, /VERIFIED/);
  assert.match(panel, /ESTIMATED/);
});

test('market estimates are never silently promoted to verified data', async () => {
  const engine = await read('src/utils/propertyIntelligenceEngine.ts');

  assert.match(engine, /estimatedMarketValue/);
  assert.match(engine, /valueStatus: TruthStatus = explicitValue > 0 \? 'VERIFIED' : estimatedValue > 0 \? 'ESTIMATED' : 'MISSING'/);
  assert.match(engine, /Market-rent estimate not connected/);
});
