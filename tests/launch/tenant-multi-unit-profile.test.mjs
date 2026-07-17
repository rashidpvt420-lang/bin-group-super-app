import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Tenant profile retains every linked unit and does not collapse to docs[0]', async () => {
  const source = await read('src/tenant/pages/TenantProfilePage.tsx');
  assert.match(source, /const \[residences, setResidences\] = useState<ResidenceRecord\[]>\(\[\]\)/);
  assert.match(source, /const deduplicated = new Map<string, ResidenceRecord>\(\)/);
  assert.match(source, /for \(const snapshot of snapshots\)/);
  assert.match(source, /for \(const unitDoc of snapshot\.docs\)/);
  assert.doesNotMatch(source, /unitSnap\.docs\[0\]/);
  assert.doesNotMatch(source, /setUnitData\(/);
});

test('Tenant profile resolves all property references and separates active from historical residences', async () => {
  const source = await read('src/tenant/pages/TenantProfilePage.tsx');
  assert.match(source, /propertyIds = \[\.\.\.new Set/);
  assert.match(source, /getDoc\(doc\(db, ['"]properties['"], propertyId\)\)/);
  assert.match(source, /new Map\(propertyEntries\)/);
  assert.match(source, /propertiesById\.get\(String\(record\.propertyId/);
  assert.match(source, /activeResidences = useMemo/);
  assert.match(source, /historicalResidences = useMemo/);
  assert.match(source, /isHistoricalResidence/);
  for (const status of ['EXPIRED', 'TERMINATED', 'MOVED_OUT', 'HISTORICAL']) assert.match(source, new RegExp(status));
});

test('Tenant portfolio avoids dynamic object-injection sinks', async () => {
  const source = await read('src/tenant/pages/TenantProfilePage.tsx');
  assert.doesNotMatch(source, /Object\.fromEntries\(propertyEntries\)/);
  assert.doesNotMatch(source, /propertiesById\s*\[/);
  assert.doesNotMatch(source, /statuses\s*\[/);
  assert.match(source, /switch \(status\)/);
});

test('Tenant multi-unit cards expose bilingual lease dates, statuses and empty states', async () => {
  const source = await read('src/tenant/pages/TenantProfilePage.tsx');
  for (const arabic of ['المساكن النشطة', 'سجل السكن وعقود الإيجار', 'بداية العقد', 'نهاية العقد', 'لا توجد مساكن سابقة']) {
    assert.match(source, new RegExp(arabic));
  }
  assert.match(source, /Intl\.DateTimeFormat\(lang === ['"]ar['"] \? ['"]ar-AE['"] : ['"]en-AE['"]/);
  assert.match(source, /localizedStatus/);
  assert.match(source, /ResidenceSection/);
});
