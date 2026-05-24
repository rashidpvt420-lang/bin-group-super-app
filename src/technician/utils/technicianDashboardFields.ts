export const firstPresent = (...values: unknown[]) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');

export const textOrPending = (...values: unknown[]) => String(firstPresent(...values) ?? 'Pending sync');

export const formatUiDate = (value: any) => {
  try {
    if (!value) return 'Pending sync';
    if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString('en-GB');
    if (typeof value === 'string' || typeof value === 'number') return new Date(value).toLocaleDateString('en-GB');
  } catch {
    return 'Pending sync';
  }
  return 'Pending sync';
};

export const normalizeEmail = (email?: string | null) => String(email || '').trim().toLowerCase();

export const uniqueRows = (items: any[]) => {
  const seen = new Map<string, any>();
  items.forEach((item, index) => seen.set(String(item.id || item.uid || item.docId || index), item));
  return Array.from(seen.values());
};
