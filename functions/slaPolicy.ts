export type CanonicalSlaKey = 'EMERGENCY' | 'HIGH' | 'MEDIUM' | 'STANDARD' | 'LOW';

export const CANONICAL_FUNCTIONS_SLA_MINUTES: Record<CanonicalSlaKey, number> = {
  EMERGENCY: 30,
  HIGH: 120,
  MEDIUM: 240,
  STANDARD: 480,
  LOW: 1440,
};

export function normalizeSlaKey(value: unknown): CanonicalSlaKey {
  const key = String(value || '').trim().toUpperCase();
  if (['EMERGENCY', 'SOS', 'CRITICAL'].includes(key)) return 'EMERGENCY';
  if (['HIGH', 'URGENT'].includes(key)) return 'HIGH';
  if (['MEDIUM', 'SAME_DAY'].includes(key)) return 'MEDIUM';
  if (['LOW', 'MINOR'].includes(key)) return 'LOW';
  return 'STANDARD';
}

export function functionsSlaMinutesForPriority(value: unknown): number {
  return CANONICAL_FUNCTIONS_SLA_MINUTES[normalizeSlaKey(value)];
}

export function buildSlaFields(value: unknown) {
  const slaPriority = normalizeSlaKey(value);
  const slaMinutes = CANONICAL_FUNCTIONS_SLA_MINUTES[slaPriority];
  return {
    slaPriority,
    slaMinutes,
    slaPolicyVersion: 'UAE_CANONICAL_SLA_V1',
  };
}
