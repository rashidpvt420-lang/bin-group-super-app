import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The technician shell forces white Paper backgrounds (whitePlatinumAuthenticated.css), so
// floating labels, helper text and select values must not be white.
const profile = readFileSync('src/technician/pages/TechnicianProfilePage.tsx', 'utf8');
const hr = readFileSync('src/technician/pages/TechnicianHRPageV2.tsx', 'utf8');

test('profile edit labels and helper text are dark on the white shell', () => {
  assert.doesNotMatch(profile, /MuiFormHelperText-root': \{ color: 'rgba\(255,255,255/);
  // Floating (shrunk) labels sit on white Paper and must be dark.
  assert.match(profile, /MuiInputLabel-root\.MuiInputLabel-shrink': \{ color: '#344054' \}/);
  // Empty-field labels sit inside the dark input and must stay light.
  assert.match(profile, /'& \.MuiInputLabel-root': \{ color: 'rgba\(255,255,255,\.78\)'/);
});

test('HR document-type select shows a readable value and label', () => {
  assert.doesNotMatch(hr, /MuiInputBase-root': \{ color: '#fff' \}/);
  assert.doesNotMatch(hr, /MuiInputLabel-root': \{ color: 'rgba\(255,255,255/);
});
