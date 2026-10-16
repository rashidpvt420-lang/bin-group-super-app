// Classifies e2e / smoke / QA fixture records so operational admin views (the live
// dispatch map) do not present them as real field capacity or real work.
// Records are never deleted or mutated here; the map offers a "Show test records"
// switch so evidence and smoke runs can still see them on demand.

const TEST_FLAG_FIELDS = [
  'e2eLaunchSeed',
  'isE2ETestUser',
  'testAccount',
  'gate11Smoke',
  'e2e_fixture',
  'e2eOwned',
  'isTestRecord',
];

const TEST_EMAIL_PATTERN = /^(e2e[-_.]|qa_|smoke_)|\.test@|@(bingroup\.com|bin-group\.com|example\.(com|org|net))$/i;
const TEST_ID_PATTERN = /^(e2e[-_]|smoke[-_]|gate11[-_])/i;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** True when a Firestore record is an e2e / smoke / QA fixture. */
export function isTestRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (TEST_FLAG_FIELDS.some((field) => record[field] === true)) return true;
  if (text(record.e2eRunId) || text(record.e2eRunMarker)) return true;
  if (TEST_ID_PATTERN.test(text(record.id))) return true;
  const emails = [record.email, record.technicianEmail, record.tenantEmail, record.ownerEmail];
  return emails.some((email) => TEST_EMAIL_PATTERN.test(text(email)));
}

/** Ids of technicians classified as test records, for filtering their GPS sessions. */
export function testTechnicianIds(technicians) {
  const ids = new Set();
  for (const technician of technicians || []) {
    if (isTestRecord(technician)) {
      for (const key of [technician.id, technician.uid, technician.technicianId]) {
        if (text(key)) ids.add(text(key));
      }
    }
  }
  return ids;
}

/** Live location rows belong to a test technician (by doc id, technicianId or flags). */
export function isTestLocation(location, testIds) {
  if (isTestRecord(location)) return true;
  const ids = [location?.id, location?.technicianId, location?.uid].map(text).filter(Boolean);
  return ids.some((id) => testIds.has(id));
}
