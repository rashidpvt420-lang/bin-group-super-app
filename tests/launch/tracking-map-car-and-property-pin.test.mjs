// Tracking map shows a car marker for the technician and a property pin for the
// job, on the existing Google Maps loader (audit 2026-11-04, fix 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const card = readFileSync(new URL('../../src/components/tracking/LiveTechnicianTrackingCard.tsx', import.meta.url), 'utf8');

test('technician marker is a car icon and job marker is a property pin', () => {
  assert.match(card, /icon: technicianCarMarkerIcon\(google\)/);
  assert.match(card, /icon: propertyPinMarkerIcon\(google\)/);
  assert.match(card, /title: 'Property location'/);
  assert.doesNotMatch(card, /label: \{ text: 'TECH'/);
  assert.doesNotMatch(card, /label: \{ text: 'JOB'/);
});

test('markers use the existing Google Maps loader and inline SVG only', () => {
  assert.match(card, /import \{ useGoogleMaps \} from '..\/..\/lib\/maps';/);
  assert.match(card, /data:image\/svg\+xml/);
  assert.doesNotMatch(card, /leaflet|mapbox|maplibre/i);
});

test('marker SVGs are well-formed', () => {
  for (const name of ['CAR_MARKER_SVG', 'PROPERTY_PIN_SVG']) {
    const m = card.match(new RegExp(`const ${name} = ([\\s\\S]*?);\\n`));
    assert.ok(m, name);
    const svg = m[1].split(/'\s*\+\s*'/).join('').replace(/^'|'$/g, '');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[\s\S]*<\/svg>$/);
    assert.equal((svg.match(/</g) || []).length, (svg.match(/>/g) || []).length);
  }
});
