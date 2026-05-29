const TEST_MARKERS = [
  'e2e-',
  'e2e_',
  'e2e ',
  'demo',
  'sample',
  'dummy',
  'frontend crash',
  'frontend_crash',
  'mosque-'
];

export function stringBag(record: any): string {
  if (!record) return '';

  const values = [
    record.id,
    record.uid,
    record.email,
    record.ownerEmail,
    record.tenantEmail,
    record.techEmail,
    record.displayName,
    record.fullName,
    record.name,
    record.ownerName,
    record.tenantName,
    record.techName,
    record.propertyName,
    record.assetName,
    record.description,
    record.category,
    record.action,
    record.eventType,
    record.event_type,
    record.type,
    record.status,
    record.source,
  ];

  return values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).toLowerCase())
    .join(' ');
}

export function isLaunchTestRecord(record: any): boolean {
  const haystack = stringBag(record);
  return TEST_MARKERS.some((marker) => haystack.includes(marker));
}

export function filterLaunchRecords<T extends Record<string, any>>(records: T[]): T[] {
  return records.filter((record) => !isLaunchTestRecord(record));
}

export function isOperationalRecord(record: any): boolean {
  const status = String(record?.status || record?.activationStatus || '').toUpperCase();
  return !['ARCHIVED_BY_ADMIN_CLEANUP', 'ARCHIVED', 'DELETED', 'TEST', 'DEMO'].includes(status) && !isLaunchTestRecord(record);
}

export function comingSoon(message = 'This action is setup-protected for launch. Connect the backend workflow first.'): void {
  window.alert(message);
}
