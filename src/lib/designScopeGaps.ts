// Honest gaps for the design execution scope. Empty site facts stay empty.
const EMPTY = /^(?:-|—|–|n\/a|na|not declared|none|null|undefined)$/i;

export function declaredDesignText(value: unknown) {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!raw || EMPTY.test(raw)) return '';
  return raw;
}

export function designScopeGaps(scope: any): string[] {
  const source = scope || {};
  const gaps: string[] = [];
  if (!declaredDesignText(source.unitNumber)) gaps.push('Unit number is not declared.');
  if (!declaredDesignText(source.floorLevel || source.floor)) gaps.push('Floor is not declared.');
  if (!declaredDesignText(source.existingCondition)) gaps.push('Current condition is not declared.');
  if (!declaredDesignText(source.requiredWork) && !declaredDesignText(source.scopeDescription)) {
    gaps.push('Required work is not declared.');
  }
  return gaps;
}
