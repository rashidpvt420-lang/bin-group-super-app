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

test('generic Admin browser catch-all cannot bypass canonical property geo authority', async () => {
  const [hardening, rulesTest] = await Promise.all([
    read('scripts/harden-final-firestore-authority.mjs'),
    read('test/property-geo-authority-rules.test.js'),
  ]);
  assert.match(hardening, /'technician_live_locations',\n\s+'properties',\n\s+'users'/);
  assert.match(hardening, /const liveLocationWriteList/);
  assert.match(rulesTest, /Admin browsers cannot mutate canonical geo/);
  assert.match(rulesTest, /assertFails\(updateDoc\(refAdmin, \{ geo:/);
});
""", encoding='utf-8')
