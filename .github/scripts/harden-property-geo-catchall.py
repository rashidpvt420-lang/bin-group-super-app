from pathlib import Path

hardening_path = Path('scripts/harden-final-firestore-authority.mjs')
hardening = hardening_path.read_text(encoding='utf-8')
old = """const liveLocationWriteList = `          'system_secrets',
          'technician_live_locations',
          'users',
"""
new = """const liveLocationWriteList = `          'system_secrets',
          'technician_live_locations',
          'properties',
          'users',
"""
count = hardening.count(old)
if count != 1:
    raise SystemExit(f'canonical catch-all list: expected one marker, found {count}')
hardening_path.write_text(hardening.replace(old, new, 1), encoding='utf-8')

Path('tests/launch/property-geo-catchall-authority.test.mjs').write_text("""import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const hardening = await read('scripts/harden-final-firestore-authority.mjs');
const rulesTest = await read('test/property-geo-authority-rules.test.js');
const listStart = hardening.indexOf('const liveLocationWriteList');
const listEnd = hardening.indexOf('`;', listStart);
const listBlock = hardening.slice(listStart, listEnd);

test('generic catch-all named list exists', () => {
  assert.ok(listStart >= 0 && listEnd > listStart);
});

test('generic catch-all excludes properties between live locations and users', () => {
  const liveIndex = listBlock.indexOf("'technician_live_locations'");
  const propertyIndex = listBlock.indexOf("'properties'");
  const usersIndex = listBlock.indexOf("'users'");
  assert.ok(liveIndex >= 0 && propertyIndex > liveIndex && usersIndex > propertyIndex);
});

test('property authority emulator regression names browser denial', () => {
  assert.match(rulesTest, /Owner and Admin browsers cannot mutate canonical geo/);
});

test('property authority emulator regression rejects Admin canonical geo mutation', () => {
  assert.match(rulesTest, /assertFails\\(updateDoc\\(refAdmin, \\{ geo:/);
});
""", encoding='utf-8')
