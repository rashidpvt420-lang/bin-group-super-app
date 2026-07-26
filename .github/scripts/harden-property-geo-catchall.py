from pathlib import Path

hardening_path = Path('scripts/harden-final-firestore-authority.mjs')
hardening = hardening_path.read_text(encoding='utf-8')
old_constant = """const liveLocationWriteList = `          'system_secrets',
          'technician_live_locations',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
"""
new_constants = """const legacyLiveLocationWriteList = `          'system_secrets',
          'technician_live_locations',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const liveLocationWriteList = `          'system_secrets',
          'technician_live_locations',
          'properties',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
"""
count = hardening.count(old_constant)
if count != 1:
    raise SystemExit(f'canonical catch-all constant: expected one marker, found {count}')
hardening = hardening.replace(old_constant, new_constants, 1)

old_router = """if (text.includes(liveLocationWriteList)) {
  // Already canonical.
} else if (text.includes(privateHrWriteList)) {
"""
new_router = """if (text.includes(liveLocationWriteList)) {
  // Already canonical.
} else if (text.includes(legacyLiveLocationWriteList)) {
  text = text.replaceAll(legacyLiveLocationWriteList, liveLocationWriteList);
} else if (text.includes(privateHrWriteList)) {
"""
count = hardening.count(old_router)
if count != 1:
    raise SystemExit(f'catch-all migration router: expected one marker, found {count}')
hardening = hardening.replace(old_router, new_router, 1)

old_forbidden = """  legacyWriteList,
  privateHrWriteList,
];
"""
new_forbidden = """  legacyWriteList,
  privateHrWriteList,
  legacyLiveLocationWriteList,
];
"""
count = hardening.count(old_forbidden)
if count != 1:
    raise SystemExit(f'catch-all forbidden list: expected one marker, found {count}')
hardening = hardening.replace(old_forbidden, new_forbidden, 1)
hardening_path.write_text(hardening, encoding='utf-8')

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

test('canonical generator migrates the previous live-location write list', () => {
  assert.match(hardening, /const legacyLiveLocationWriteList/);
  assert.match(hardening, /text\.replaceAll\(legacyLiveLocationWriteList, liveLocationWriteList\)/);
  assert.match(hardening, /forbidden = \[[\s\S]*legacyLiveLocationWriteList/);
});

test('property authority emulator regression names browser denial', () => {
  assert.match(rulesTest, /Owner and Admin browsers cannot mutate canonical geo/);
});

test('property authority emulator regression rejects Admin canonical geo mutation', () => {
  assert.match(rulesTest, /assertFails\(updateDoc\(refAdmin, \{ geo:/);
});
""", encoding='utf-8')
