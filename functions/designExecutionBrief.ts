// Server-authored lock + execution brief for AI Design Studio.
//
// The tenant or owner locks one generated option before engineer handoff.
// After handoff the lock is frozen. Changing it requires an admin
// "design-choice revision": status returns to a re-lock step, the deposit is
// not refunded or re-approved, and admin must hand the job to the engineer again.
// This module is pure (no Firebase) so the brief can be tested without the emulator.

export class DesignChoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignChoiceError';
  }
}

export const LOCKABLE_DESIGN_STATUSES = [
  'AI_CONCEPT_READY',
  'AWAITING_OWNER_APPROVAL',
  'PENDING_OWNER_NOC',
  'DEPOSIT_PENDING',
  'OWNER_APPROVED_TENANT_TO_PAY',
  'OWNER_APPROVED_OWNER_TO_PAY',
  'PAYMENT_PENDING',
  'PAID',
  'CHOICE_REVISION_PENDING',
] as const;

export const ENGINEER_BRIEF_STATUSES = ['ENGINEER_REVIEW', 'CHOICE_REVISION_PENDING', 'EXECUTION_READY'] as const;

const GAP_UNIT = 'Unit number is not declared.';
const GAP_FLOOR = 'Floor is not declared.';
const GAP_CONDITION = 'Current condition is not declared.';
const GAP_WORK = 'Required work is not declared.';
const GAP_AREA = 'Area is not declared.';

type Direction = {
  key: string;
  label: string;
  lightingNotes: string;
  ceiling: string;
  walls: string;
  flooring: string;
  furniture: string;
  softFurnishings: string;
  electrical: string;
};

const DIRECTIONS: Direction[] = [
  {
    key: 'option_1',
    label: 'Option 1 - Balanced',
    lightingNotes: 'Warm, layered lighting with dimmable ambient light and one focal-wall feature light, matching the balanced option.',
    ceiling: 'Clean premium ceiling, recessed spots, and a shallow warm cove only where the locked picture shows one and the slab allows it.',
    walls: 'Balanced neutral paint system with a single feature wall aligned to the locked picture. No extra accent colour.',
    flooring: 'Mid-tone premium flooring in the material family visible in the locked picture, with skirting and thresholds aligned.',
    furniture: 'Balanced layout and premium upholstery placed as in the locked picture. Keep circulation to doors and windows clear.',
    softFurnishings: 'Layered neutral rug, cushions, and curtains in the same palette as the locked picture.',
    electrical: 'Dimming for the ambient layer and a switched focal light. Add no new circuit unless a load check is approved.',
  },
  {
    key: 'option_2',
    label: 'Option 2 - Light and airy',
    lightingNotes: 'Brighter, cooler daylight with a light ceiling and minimal decorative fixtures, matching the light and airy option.',
    ceiling: 'Light ceiling finish and a simple recessed layout. Do not add heavy coffers, dark bulkheads, or statement chandeliers.',
    walls: 'Light paint and a pale palette. Keep texture minimal so the room stays airy, as in the locked picture.',
    flooring: 'Light flooring, low visual weight, with a clean threshold. Do not introduce a dark or high-contrast floor.',
    furniture: 'Lighter fabrics, fewer pieces, and open circulation matching the locked picture.',
    softFurnishings: 'Sheer or light curtains, a pale rug, and light cushions. Avoid heavy drapery and dark textiles.',
    electrical: 'Brighter ambient lighting on existing controls. Decorative sockets and extra circuits are out of this option.',
  },
  {
    key: 'option_3',
    label: 'Option 3 - Rich and bold',
    lightingNotes: 'Statement lighting, deeper warmth, and accent light on richer materials, matching the rich and bold option.',
    ceiling: 'Richer ceiling detail only where the locked picture shows it: a darker recess, a coffer, or a statement pendant zone.',
    walls: 'Deeper accent colour or a textured feature wall that matches the locked picture. Keep the other walls quieter so the accent reads.',
    flooring: 'Richer, darker premium floor in the material family shown in the locked picture.',
    furniture: 'Bolder upholstery and darker timber or metal, placed as in the locked picture.',
    softFurnishings: 'Heavier drapery, a deeper rug, and textiles in the accent palette of the locked picture.',
    electrical: 'Accent and statement lights on dimmers. Confirm the electrical load before any added circuit or pendant.',
  },
];

const NEUTRAL: Direction = {
  key: 'locked_picture',
  label: 'Locked design',
  lightingNotes: 'Match the lighting visible in the locked picture: brightness, colour temperature, and feature lights. Do not substitute another mood.',
  ceiling: 'Build the ceiling lines, recesses, and fittings that are visible in the locked picture. Leave out details the picture does not show.',
  walls: 'Match the wall colours, feature wall, and texture in the locked picture.',
  flooring: 'Match the flooring tone and layout in the locked picture, including skirtings and thresholds.',
  furniture: 'Place furniture to match the locked picture and keep doors, windows, and escape routes clear.',
  softFurnishings: 'Match curtains, rug, and cushions to the locked picture.',
  electrical: 'Provide the switched and dimmed points the locked picture needs. Add no circuit without a load check and approval.',
};

function text(value: unknown, max = 400) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function declaredScopeText(value: unknown, max = 400) {
  const raw = text(value, max);
  if (!raw) return '';
  if (/^(?:-|—|–|n\/a|na|not declared|none|null|undefined)$/i.test(raw)) return '';
  return raw;
}

function directionFromKey(key: string) {
  return DIRECTIONS.find((direction) => direction.key === key) || null;
}

export function resolveDesignDirection(source: Record<string, any> | null | undefined, _optionIndex?: number): Direction {
  // Index alone is not a direction: the first successful render is stored as "primary"
  // even when option 1 failed. Match the stable key or the option label.
  const key = text(source?.optionKey || source?.optionId || source?.id, 80);
  const byKey = directionFromKey(key);
  if (byKey) return byKey;
  const label = text(source?.optionLabel || source?.lockedOptionLabel || source?.label, 160).toLowerCase();
  if (label.includes('light') && label.includes('airy')) return DIRECTIONS[1];
  if (label.includes('rich') || label.includes('bold')) return DIRECTIONS[2];
  if (label.includes('balanced') || key === 'primary') return DIRECTIONS[0];
  return NEUTRAL;
}

export function incompleteScopeFields(scope: Record<string, any> | null | undefined) {
  const source = scope || {};
  const gaps: Array<{ field: string; label: string }> = [];
  if (!declaredScopeText(source.unitNumber, 80)) gaps.push({ field: 'unitNumber', label: GAP_UNIT });
  if (!declaredScopeText(source.floorLevel || source.floor, 80)) gaps.push({ field: 'floorLevel', label: GAP_FLOOR });
  if (!declaredScopeText(source.existingCondition, 400)) gaps.push({ field: 'existingCondition', label: GAP_CONDITION });
  if (!declaredScopeText(source.requiredWork, 1000) && !declaredScopeText(source.scopeDescription, 1000)) {
    gaps.push({ field: 'requiredWork', label: GAP_WORK });
  }
  const dimensions = Number(source.dimensions);
  if (!Number.isFinite(dimensions) || dimensions <= 0) gaps.push({ field: 'dimensions', label: GAP_AREA });
  return gaps;
}

function safePath(value: unknown) {
  const path = text(value, 1000);
  if (!path || path.includes('://') || path.startsWith('/') || path.includes('..') || path.includes('\\')) return '';
  return path;
}

export function matchDesignOption(design: Record<string, any>, input: { optionId?: string; optionIndex?: number }) {
  const concepts = Array.isArray(design.concepts) ? design.concepts : [];
  const paths = (Array.isArray(design.generatedImagePaths) ? design.generatedImagePaths : [])
    .map((path: unknown) => safePath(path))
    .filter(Boolean);
  let index = -1;
  const optionId = text(input.optionId, 80);
  if (optionId) {
    index = concepts.findIndex((concept: any) => text(concept?.id, 80) === optionId || text(concept?.optionKey, 80) === optionId);
  }
  if (index < 0 && Number.isInteger(input.optionIndex)) {
    const requested = Number(input.optionIndex);
    if (requested >= 0 && requested < Math.max(concepts.length, paths.length)) index = requested;
  }
  if (index < 0) throw new DesignChoiceError('Choose one of the generated design options.');
  const concept = concepts[index] && typeof concepts[index] === 'object' ? concepts[index] : {};
  const path = safePath(concept.afterImageStoragePath) || paths[index] || '';
  if (!path || !paths.includes(path)) {
    throw new DesignChoiceError('That option has no protected generated image to lock.');
  }
  return { index, concept, path };
}

export function buildLockedChoice(
  design: Record<string, any>,
  match: { index: number; concept: any; path: string },
  actor: { uid: string; role: string },
  lockVersion: number,
) {
  const direction = resolveDesignDirection(match.concept, match.index);
  const scope = design.scope || {};
  const optionId = text(match.concept?.id, 80) || `option_${match.index + 1}`;
  return {
    optionIndex: match.index,
    optionId,
    optionKey: text(match.concept?.optionKey, 80) || direction.key,
    optionLabel: text(match.concept?.optionLabel, 160) || direction.label,
    imageStoragePath: match.path,
    imageSha256: text(match.concept?.generatedImageSha256, 80) || null,
    title: text(match.concept?.title, 200),
    style: text(design.designStyle || match.concept?.style, 120) || 'Modern',
    finishTier: text(match.concept?.finishTier || scope.finishTier, 80),
    zoneType: text(scope.zoneType, 120),
    designObjective: text(design.designObjective, 120),
    lightingNotes: direction.lightingNotes,
    scopeSummary: text(match.concept?.scopeSummary, 400),
    quoteHash: text(design.quote?.quoteHash, 80),
    lockVersion,
    lockedBy: actor.uid,
    lockedByRole: actor.role,
  };
}

export function sameLockedChoice(current: any, next: { optionId: string; optionIndex: number; imageStoragePath: string }) {
  if (!current || typeof current !== 'object') return false;
  return current.optionId === next.optionId
    && Number(current.optionIndex) === next.optionIndex
    && current.imageStoragePath === next.imageStoragePath;
}

export function publicLockedChoice(choice: Record<string, any>) {
  return {
    optionIndex: choice.optionIndex,
    optionId: choice.optionId,
    optionKey: choice.optionKey,
    optionLabel: choice.optionLabel,
    imageStoragePath: choice.imageStoragePath,
    imageSha256: choice.imageSha256 || null,
    title: choice.title || '',
    style: choice.style || '',
    finishTier: choice.finishTier || '',
    zoneType: choice.zoneType || '',
    designObjective: choice.designObjective || '',
    lightingNotes: choice.lightingNotes || '',
    scopeSummary: choice.scopeSummary || '',
    quoteHash: choice.quoteHash || '',
    lockVersion: choice.lockVersion,
    lockedBy: choice.lockedBy,
    lockedByRole: choice.lockedByRole,
  };
}

function zoneNeedsMep(zoneType: string, hasMEP: boolean) {
  if (hasMEP) return true;
  const zone = zoneType.toLowerCase();
  return ['bathroom', 'kitchen', 'pantry', 'garden', 'landscape', 'pool', 'clinic', 'hotel', 'retail', 'facade'].some((keyword) => zone.includes(keyword));
}

export function buildExecutionBrief(design: Record<string, any>) {
  const choice = design.lockedChoice;
  if (!choice || !safePath(choice.imageStoragePath)) {
    throw new DesignChoiceError('Lock a chosen design before building the execution brief.');
  }
  const scope = design.scope || {};
  const direction = resolveDesignDirection(choice, Number(choice.optionIndex));
  const incomplete = incompleteScopeFields(scope);
  const zone = declaredScopeText(scope.zoneType, 120) || declaredScopeText(choice.zoneType, 120) || 'the room';
  const finish = declaredScopeText(choice.finishTier, 80) || declaredScopeText(scope.finishTier, 80);
  const style = declaredScopeText(choice.style, 120) || declaredScopeText(design.designStyle, 120) || 'the selected style';
  const dimensions = Number(scope.dimensions);
  const areaLabel = Number.isFinite(dimensions) && dimensions > 0 ? `${Math.round(dimensions)} sq ft` : '';
  const required = declaredScopeText(scope.requiredWork, 1000) || declaredScopeText(scope.scopeDescription, 1000);
  const condition = declaredScopeText(scope.existingCondition, 400);
  const unitNumber = declaredScopeText(scope.unitNumber, 80);
  const floorLevel = declaredScopeText(scope.floorLevel || scope.floor, 80);
  const referenceImagePath = safePath(Array.isArray(design.referenceImagePaths) ? design.referenceImagePaths[0] : '');
  const mep = zoneNeedsMep(zone, scope.hasMEP === true);
  const finishLabel = finish || 'not declared';
  const lighting = text(choice.lightingNotes, 400) || direction.lightingNotes;

  return {
    version: 1,
    lockedOptionId: text(choice.optionId, 80),
    lockedOptionLabel: text(choice.optionLabel, 160) || direction.label,
    imageStoragePath: safePath(choice.imageStoragePath),
    referenceImagePath,
    style,
    finishTier: finish,
    zoneType: declaredScopeText(scope.zoneType, 120) || declaredScopeText(choice.zoneType, 120),
    lightingNotes: lighting,
    propertyName: declaredScopeText(design.propertyName, 160),
    incompleteScope: incomplete,
    scope: {
      unitNumber,
      floorLevel,
      dimensions: areaLabel ? Math.round(dimensions) : null,
      existingCondition: condition,
      requiredWork: required,
      propertyName: declaredScopeText(design.propertyName, 160),
      emirate: declaredScopeText(scope.emirate, 80),
    },
    sections: [
      { category: 'Lighting', items: [lighting, `Apply this lighting to ${zone} in the ${style} style.`, 'Keep emergency lighting and fire-route visibility unchanged.'] },
      { category: 'Ceiling', items: [direction.ceiling, 'Final ceiling line, access panels, and paint follow the locked picture.'] },
      { category: 'Walls & paint', items: [direction.walls, 'Prepare, prime, and finish. Use a moisture-resistant system only where the site is wet or the locked picture shows it.'] },
      { category: 'Flooring', items: [direction.flooring, areaLabel ? `Declared area: ${areaLabel}.` : GAP_AREA, 'Substrate repair is excluded until the site is inspected.'] },
      { category: 'Furniture', items: [direction.furniture, 'Confirm the final model and fabric against the locked picture before procurement.'] },
      { category: 'Soft furnishings', items: [direction.softFurnishings, 'Measure on site before ordering curtains or a rug.'] },
      { category: 'Electrical', items: [direction.electrical, 'Review switches, sockets, and concealed routing. Building and UAE electrical rules still apply.'] },
      {
        category: 'MEP',
        items: mep
          ? ['This zone needs MEP coordination for the services visible in the locked picture.', 'Check HVAC diffusers, access, drainage, and waterproofing before finishes.', 'Hidden MEP defects stay excluded until inspection.']
          : ['No major MEP relocation is declared for this option.', 'Keep the existing HVAC and diffuser positions unless a variation is approved.', 'A discovered leak, drainage, or waterproofing issue needs a separate approval.'],
      },
      {
        category: 'Materials grade',
        items: [
          finish ? `Materials grade follows the declared finish tier: ${finish}.` : 'Materials grade is not declared. Confirm samples before buying.',
          'Lock final materials after sample approval. An approved equivalent may replace unavailable stock.',
          'Do not upgrade or downgrade the grade without a new approval.',
        ],
      },
      {
        category: 'Timeline stages',
        items: [
          'Stage 1: confirm the locked picture, verify the site, and close incomplete scope items.',
          'Stage 2: 15% mobilization is already the design deposit path. Procure and schedule only after that deposit is verified.',
          'Stage 3: execute to the locked picture, keep photo evidence, then mark the job ready for handover.',
        ],
      },
      {
        category: 'Assumptions',
        items: [
          areaLabel ? `Area assumption: ${areaLabel}.` : GAP_AREA,
          unitNumber ? `Unit: ${unitNumber}.` : GAP_UNIT,
          floorLevel ? `Floor: ${floorLevel}.` : GAP_FLOOR,
          condition ? `Current condition: ${condition}.` : GAP_CONDITION,
          required ? `Required work: ${required}.` : GAP_WORK,
          text(design.designObjective, 160) ? `Objective: ${text(design.designObjective, 160)}.` : 'Objective was not declared.',
          'Where the real room differs from the locked picture, stop and request a variation. Do not invent missing site facts.',
        ],
      },
      {
        category: 'Exclusions',
        items: [
          'Hidden structural, waterproofing, pest, mold, electrical, or authority defects are excluded until inspected.',
          'Layout changes and landlord or authority variations need a separate approval.',
          'This brief does not approve payment, a contract, or a new dispatch.',
        ],
      },
    ],
    followThePicture: `Build ${zone} to match the locked picture (${text(choice.optionLabel, 160) || direction.label}) at finish tier ${finishLabel}.`,
  };
}

export function assertChoiceLockedForHandoff(design: Record<string, any>, quoteHash: string) {
  const choice = design.lockedChoice;
  if (!choice || typeof choice !== 'object' || !text(choice.optionId, 80) || !text(choice.optionLabel, 160)) {
    throw new DesignChoiceError('Lock a chosen design before engineer handoff.');
  }
  const path = safePath(choice.imageStoragePath);
  const paths = (Array.isArray(design.generatedImagePaths) ? design.generatedImagePaths : []).map((item: unknown) => safePath(item)).filter(Boolean);
  if (!path || !paths.includes(path)) {
    throw new DesignChoiceError('The locked design image is not one of the protected generated images.');
  }
  if (!text(choice.quoteHash, 80) || choice.quoteHash !== quoteHash) {
    throw new DesignChoiceError('The locked design does not match the approved quote. Lock the choice again before handoff.');
  }
  buildExecutionBrief(design);
}

export function publicExecutionBrief(brief: Record<string, any> | null | undefined) {
  if (!brief || typeof brief !== 'object') return null;
  const copy: Record<string, any> = { ...brief };
  delete copy.prompt;
  delete copy.conceptPrompt;
  return copy;
}
