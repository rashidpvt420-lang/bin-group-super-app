export type ResidenceUnit = {
  id: string;
  propertyId?: unknown;
  unitNumber?: unknown;
  unit?: unknown;
  number?: unknown;
  leaseId?: unknown;
  contractId?: unknown;
  leaseVerified?: unknown;
  contractVerified?: unknown;
  tenantId?: unknown;
};

export type ResidenceCandidate = {
  unit: ResidenceUnit;
  propertyHasDispatchGeo?: boolean;
};

/** Last number group, so "E2E-101" and "101" describe the same unit label. */
export function canonicalUnitNumber(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  const groups = raw.match(/\d+/g);
  if (!groups?.length) return raw;
  return groups[groups.length - 1].replace(/^0+(?=\d)/, "");
}

export function residenceDedupeKey(unit: ResidenceUnit): string {
  const propertyId = String(unit.propertyId ?? "").trim();
  const label = String(unit.unitNumber ?? unit.unit ?? unit.number ?? "").trim();
  const canonical = canonicalUnitNumber(label);
  return `${propertyId}::${canonical || label.toUpperCase() || unit.id}`;
}

function score(candidate: ResidenceCandidate, profileUnitId: string): number {
  const unit = candidate.unit;
  let value = 0;
  if (profileUnitId && unit.id === profileUnitId) value += 100;
  if (candidate.propertyHasDispatchGeo) value += 40;
  if (unit.leaseVerified === true || unit.contractVerified === true) value += 20;
  if (String(unit.leaseId || unit.contractId || "").trim()) value += 10;
  if (String(unit.tenantId || "").trim()) value += 5;
  return value;
}

/**
 * Pick one residence when the same property is linked twice (for example unit
 * "E2E-101" and "101"). Prefers the profile-linked unit, then a property that
 * can be dispatched, then the record with lease evidence. Ties break by id.
 */
export function selectTenantResidence(candidates: ResidenceCandidate[], profileUnitId = ""): ResidenceUnit | null {
  const profileId = String(profileUnitId || "").trim();
  const groups = new Map<string, ResidenceCandidate[]>();
  for (const candidate of candidates) {
    const unit = candidate?.unit;
    if (!unit?.id) continue;
    const key = residenceDedupeKey(unit);
    const list = groups.get(key) || [];
    list.push(candidate);
    groups.set(key, list);
  }
  const winners: ResidenceCandidate[] = [];
  for (const list of groups.values()) {
    const ranked = [...list].sort((left, right) => {
      const diff = score(right, profileId) - score(left, profileId);
      if (diff !== 0) return diff;
      return left.unit.id.localeCompare(right.unit.id);
    });
    winners.push(ranked[0]);
  }
  winners.sort((left, right) => {
    const diff = score(right, profileId) - score(left, profileId);
    if (diff !== 0) return diff;
    return left.unit.id.localeCompare(right.unit.id);
  });
  return winners[0]?.unit || null;
}
