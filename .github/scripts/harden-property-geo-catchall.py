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

private_hr_path = Path('scripts/harden-private-hr-authority.mjs')
private_hr = private_hr_path.read_text(encoding='utf-8')
old_private_hr_constant = """const liveLocationWritePrefix = `          'system_secrets',
          'technician_live_locations',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
"""
new_private_hr_constants = """const liveLocationWritePrefix = `          'system_secrets',
          'technician_live_locations',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const propertyGeoWritePrefix = `          'system_secrets',
          'technician_live_locations',
          'properties',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
"""
count = private_hr.count(old_private_hr_constant)
if count != 1:
    raise SystemExit(f'private HR property-geo constant: expected one marker, found {count}')
private_hr = private_hr.replace(old_private_hr_constant, new_private_hr_constants, 1)

old_private_hr_router = """let canonicalWritePrefix = hardenedWritePrefix;
if (source.includes(liveLocationWritePrefix)) {
  canonicalWritePrefix = liveLocationWritePrefix;
} else if (source.includes(hardenedWritePrefix)) {
"""
new_private_hr_router = """let canonicalWritePrefix = hardenedWritePrefix;
if (source.includes(propertyGeoWritePrefix)) {
  canonicalWritePrefix = propertyGeoWritePrefix;
} else if (source.includes(liveLocationWritePrefix)) {
  source = source.replaceAll(liveLocationWritePrefix, propertyGeoWritePrefix);
  canonicalWritePrefix = propertyGeoWritePrefix;
} else if (source.includes(hardenedWritePrefix)) {
"""
count = private_hr.count(old_private_hr_router)
if count != 1:
    raise SystemExit(f'private HR property-geo router: expected one marker, found {count}')
private_hr = private_hr.replace(old_private_hr_router, new_private_hr_router, 1)
private_hr_path.write_text(private_hr, encoding='utf-8')

verifier_path = Path('scripts/verify-firestore-launch-hardening.mjs')
verifier = verifier_path.read_text(encoding='utf-8')
old_required = r"""  ['ticket write fallback excludes explicit ticket hierarchies, live location and private HR', "'system_secrets',\n          'technician_live_locations',\n          'users',\n          'audit_logs',\n          'admin_security_sessions',\n          'private_hr_profiles'"],
"""
new_required = r"""  ['ticket write fallback excludes explicit ticket hierarchies, live location, canonical property geo and private HR', "'system_secrets',\n          'technician_live_locations',\n          'properties',\n          'users',\n          'audit_logs',\n          'admin_security_sessions',\n          'private_hr_profiles'"],
"""
count = verifier.count(old_required)
if count != 1:
    raise SystemExit(f'Firestore verifier required catch-all: expected one marker, found {count}')
verifier = verifier.replace(old_required, new_required, 1)

old_forbidden_anchor = r"""  ['unbounded ticket write fallback list', "'users',\n          'tickets',\n          'maintenanceTickets',\n          'audit_logs'"],
"""
new_forbidden_anchor = old_forbidden_anchor + r"""  ['canonical property geo omitted from global write fallback exclusions', "'system_secrets',\n          'technician_live_locations',\n          'users',\n          'audit_logs',\n          'admin_security_sessions',\n          'private_hr_profiles'"],
"""
count = verifier.count(old_forbidden_anchor)
if count != 1:
    raise SystemExit(f'Firestore verifier forbidden catch-all: expected one marker, found {count}')
verifier = verifier.replace(old_forbidden_anchor, new_forbidden_anchor, 1)
verifier_path.write_text(verifier, encoding='utf-8')

Path('tests/launch/property-geo-catchall-authority.test.mjs').write_text("""import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const hardening = await read('scripts/harden-final-firestore-authority.mjs');
const privateHrHardening = await read('scripts/harden-private-hr-authority.mjs');
const verifier = await read('scripts/verify-firestore-launch-hardening.mjs');
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

test('private HR hardener preserves the stricter property geo exclusion', () => {
  assert.match(privateHrHardening, /const propertyGeoWritePrefix/);
  assert.match(privateHrHardening, /source\.replaceAll\(liveLocationWritePrefix, propertyGeoWritePrefix\)/);
  assert.match(privateHrHardening, /canonicalWritePrefix = propertyGeoWritePrefix/);
});

test('launch hardening verifier requires property geo exclusion and forbids the old list', () => {
  assert.match(verifier, /canonical property geo omitted from global write fallback exclusions/);
  assert.match(verifier, /live location, canonical property geo and private HR/);
  assert.match(verifier, /'technician_live_locations',\\n          'properties',\\n          'users'/);
});

test('property authority emulator regression names browser denial', () => {
  assert.match(rulesTest, /Owner and Admin browsers cannot mutate canonical geo/);
});

test('property authority emulator regression rejects Admin canonical geo mutation', () => {
  assert.match(rulesTest, /assertFails\(updateDoc\(refAdmin, \{ geo:/);
});
""", encoding='utf-8')
