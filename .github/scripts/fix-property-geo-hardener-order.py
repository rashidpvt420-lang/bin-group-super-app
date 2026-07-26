from pathlib import Path

path = Path('scripts/harden-final-firestore-authority.mjs')
source = path.read_text(encoding='utf-8')
old = '''const privateHrWriteList = `          'system_secrets',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const legacyLiveLocationWriteList = `          'system_secrets',
'''
new = '''const privateHrWriteList = `          'system_secrets',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const propertyAdminSecurityWriteList = `          'system_secrets',
          'properties',
          'users',
          'audit_logs',
          'admin_security_sessions',`;
const propertyPrivateHrWriteList = `          'system_secrets',
          'properties',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const legacyLiveLocationWriteList = `          'system_secrets',
'''
if source.count(old) != 1:
    raise SystemExit(f'property hardener state insertion marker count was {source.count(old)}, expected 1')
source = source.replace(old, new, 1)
old = '''} else if (text.includes(legacyLiveLocationWriteList)) {
  text = text.replaceAll(legacyLiveLocationWriteList, liveLocationWriteList);
} else if (text.includes(privateHrWriteList)) {
'''
new = '''} else if (text.includes(legacyLiveLocationWriteList)) {
  text = text.replaceAll(legacyLiveLocationWriteList, liveLocationWriteList);
} else if (text.includes(propertyPrivateHrWriteList)) {
  text = text.replaceAll(propertyPrivateHrWriteList, liveLocationWriteList);
} else if (text.includes(propertyAdminSecurityWriteList)) {
  text = text.replaceAll(propertyAdminSecurityWriteList, liveLocationWriteList);
} else if (text.includes(privateHrWriteList)) {
'''
if source.count(old) != 1:
    raise SystemExit(f'property hardener routing marker count was {source.count(old)}, expected 1')
source = source.replace(old, new, 1)
old = '''  privateHrWriteList,
  legacyLiveLocationWriteList,
];
'''
new = '''  privateHrWriteList,
  propertyAdminSecurityWriteList,
  propertyPrivateHrWriteList,
  legacyLiveLocationWriteList,
];
'''
if source.count(old) != 1:
    raise SystemExit(f'property hardener forbidden marker count was {source.count(old)}, expected 1')
path.write_text(source.replace(old, new, 1), encoding='utf-8')

test_path = Path('tests/launch/property-geo-catchall-authority.test.mjs')
tests = test_path.read_text(encoding='utf-8')
old = "  assert.match(hardener, /const legacyLiveLocationWriteList/);\n"
new = "  assert.match(hardener, /const propertyAdminSecurityWriteList/);\n  assert.match(hardener, /const propertyPrivateHrWriteList/);\n  assert.match(hardener, /const legacyLiveLocationWriteList/);\n"
if tests.count(old) != 1:
    raise SystemExit(f'property hardener test marker count was {tests.count(old)}, expected 1')
test_path.write_text(tests.replace(old, new, 1), encoding='utf-8')
