/**
 * One canonical residence label for the tenant dashboard and alerts:
 * "Unit {n} · {building}", never a raw property type like "villa" when a
 * unit number or building name is available.
 */

export type ResidenceLabelInput = {
  unitNumber?: unknown;
  unit?: unknown;
  number?: unknown;
  propertyName?: unknown;
  buildingName?: unknown;
  name?: unknown;
  propertyType?: unknown;
};

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function looksLikeTypeOnly(value: string): boolean {
  return /^(villa|apartment|apt|flat|studio|townhouse|penthouse|duplex|building|unit|property)s?$/i.test(value);
}

export function formatResidenceLabel(input: ResidenceLabelInput | null | undefined, lang: 'en' | 'ar' = 'en'): string {
  const unitNumber = clean(input?.unitNumber || input?.unit || input?.number);
  const place = [input?.propertyName, input?.buildingName, input?.name]
    .map(clean)
    .find((value) => value && !looksLikeTypeOnly(value)) || '';
  const type = clean(input?.propertyType);
  const unitWord = lang === 'ar' ? 'وحدة' : 'Unit';
  if (unitNumber && place) return `${unitWord} ${unitNumber} · ${place}`;
  if (unitNumber) return `${unitWord} ${unitNumber}`;
  if (place) return place;
  if (type && !looksLikeTypeOnly(type)) return type;
  return '';
}

/** Replace a stored alert's villa/property wording with the live residence label when we have one. */
export function alignAlertResidenceText(text: unknown, residence: ResidenceLabelInput | null | undefined, lang: 'en' | 'ar' = 'en'): string {
  const original = String(text ?? '');
  const label = formatResidenceLabel(residence, lang);
  if (!original || !label) return original;
  const villa = /\bvillas?\b/gi;
  if (villa.test(original) && !villa.test(label)) {
    return original.replace(villa, label);
  }
  return original;
}
