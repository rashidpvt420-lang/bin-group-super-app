import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const prepareProductionEnv = readFileSync('scripts/prepare-production-env.mjs', 'utf8');

test('production environment preparation requires Google Maps for the Admin dispatch map', () => {
  assert.match(
    prepareProductionEnv,
    /const mapsKey = requireEnv\(\s*['"]VITE_GOOGLE_MAPS_API_KEY['"]/,
    'VITE_GOOGLE_MAPS_API_KEY must be a required production input',
  );
  assert.match(
    prepareProductionEnv,
    /REACT_APP_GOOGLE_MAPS_API_KEY=\$\{mapsKey\}/,
    'Admin production environment must receive the validated Maps key',
  );
  assert.match(
    prepareProductionEnv,
    /VITE_GOOGLE_MAPS_API_KEY=\$\{mapsKey\}/,
    'Root production environment must receive the validated Maps key',
  );
});
