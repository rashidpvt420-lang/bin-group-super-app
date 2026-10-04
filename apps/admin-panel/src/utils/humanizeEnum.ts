/**
 * Display-only label for stored enum values such as MAINTENANCE_AND_PROPERTY_MANAGEMENT,
 * RESIDENTIAL_BUILDING or maintenance_evidence_standard. The stored value is never changed.
 * Text that is not an enum-style token (has spaces, mixed case, slashes) is returned as is.
 */
const KEEP_UPPER = new Set(['AED', 'UAE', 'RERA', 'DLD', 'SOS', 'ID', 'QR', 'PDF', 'CSV', 'AC', 'HVAC', 'IBAN', 'VAT']);

export function humanizeEnum(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text || !/^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$|^[A-Z0-9]{4,}$/.test(text)) return text;
  const words = text.split('_').filter(Boolean).map((word) => (KEEP_UPPER.has(word.toUpperCase()) ? word.toUpperCase() : word.toLowerCase()));
  const sentence = words.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
