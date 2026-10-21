/** Building age rules for owner onboarding: required, entered as years or as the year built. */
export const MAX_BUILDING_AGE_YEARS = 150;

export type BuildingAgeParse = { ok: true; age: number; fromYear?: number } | { ok: false; reason: 'empty' | 'invalid' };

export function parseBuildingAgeInput(raw: unknown, currentYear: number = new Date().getFullYear()): BuildingAgeParse {
  const textValue = String(raw ?? '').trim();
  if (!textValue) return { ok: false, reason: 'empty' };
  if (!/^\d{1,4}$/.test(textValue)) return { ok: false, reason: 'invalid' };
  const value = Number(textValue);
  if (value <= MAX_BUILDING_AGE_YEARS) return { ok: true, age: value };
  if (value >= currentYear - MAX_BUILDING_AGE_YEARS && value <= currentYear) return { ok: true, age: currentYear - value, fromYear: value };
  return { ok: false, reason: 'invalid' };
}

/** True when the property carries a usable age in years (0 = new build). */
export function hasValidBuildingAge(age: unknown): boolean {
  if (age === undefined || age === null || String(age).trim() === '') return false;
  const value = Number(age);
  return Number.isInteger(value) && value >= 0 && value <= MAX_BUILDING_AGE_YEARS;
}
