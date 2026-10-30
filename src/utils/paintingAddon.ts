// Painting add-on (founder decision 2026-10-30). All three tiers are 'separate scope after
// visit' in the master price list (price 0), so automatic contract quotes never change.
// Room Refresh shows an indicative range only; the binding price is always a fixed quote
// set by an admin after a site visit and approved by the owner with an OTP. AI never approves.

export const PAINTING_ADDON_IDS = ['painting_room_refresh', 'painting_full_home', 'painting_building_exterior'] as const;
export type PaintingAddonId = (typeof PAINTING_ADDON_IDS)[number];
export const isPaintingAddon = (id: string): id is PaintingAddonId => (PAINTING_ADDON_IDS as readonly string[]).includes(id);

export const PAINTING_RATES = {
  wallFactor: 2.7, // wall + ceiling area ≈ floor area × 2.7
  standardPerSqm: 12,
  premiumPerSqm: 20,
  highCeilingUplift: 0.25,
  poorWallUplift: 0.15,
  minimumPerRoom: 600,
  rangeSpread: 0.15, // indicative ± band shown to the owner
} as const;

export type RoomEstimateInput = {
  floorAreaSqm: number;
  rooms?: number;
  finish?: 'standard' | 'premium';
  highCeilings?: boolean;
  poorWalls?: boolean;
};

/** Indicative AED range for a Room Refresh. Never a binding price. */
export function estimateRoomRefreshRange(input: RoomEstimateInput): { min: number; max: number; indicative: true } | null {
  const area = Number(input.floorAreaSqm);
  const rooms = Math.max(1, Math.floor(Number(input.rooms ?? 1)));
  if (!Number.isFinite(area) || area <= 0 || area > 5000 || rooms > 50) return null;
  const rate = input.finish === 'premium' ? PAINTING_RATES.premiumPerSqm : PAINTING_RATES.standardPerSqm;
  let base = area * PAINTING_RATES.wallFactor * rate;
  if (input.highCeilings) base *= 1 + PAINTING_RATES.highCeilingUplift;
  if (input.poorWalls) base *= 1 + PAINTING_RATES.poorWallUplift;
  base = Math.max(base, PAINTING_RATES.minimumPerRoom * rooms);
  const round = (v: number) => Math.round(v / 50) * 50;
  return { min: round(base * (1 - PAINTING_RATES.rangeSpread)), max: round(base * (1 + PAINTING_RATES.rangeSpread)), indicative: true };
}

export type PaintingStatus =
  | 'REQUESTED'
  | 'SITE_VISIT_SCHEDULED'
  | 'SITE_VISIT_DONE'
  | 'QUOTE_ISSUED'
  | 'OWNER_APPROVED'
  | 'NOC_PENDING'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'WARRANTY_ACTIVE'
  | 'CANCELLED';

export type PaintingActor = 'owner' | 'admin' | 'technician' | 'system' | 'ai';

type Transition = { to: PaintingStatus; by: PaintingActor[]; requires?: Array<'fixedQuote' | 'ownerOtp' | 'noc' | 'beforePhotos' | 'afterPhotos' | 'warranty'> };

const T: Record<PaintingStatus, Transition[]> = {
  REQUESTED: [{ to: 'SITE_VISIT_SCHEDULED', by: ['admin'] }, { to: 'CANCELLED', by: ['owner', 'admin'] }],
  SITE_VISIT_SCHEDULED: [{ to: 'SITE_VISIT_DONE', by: ['admin', 'technician'] }, { to: 'CANCELLED', by: ['owner', 'admin'] }],
  SITE_VISIT_DONE: [{ to: 'QUOTE_ISSUED', by: ['admin'], requires: ['fixedQuote'] }],
  QUOTE_ISSUED: [{ to: 'OWNER_APPROVED', by: ['owner'], requires: ['ownerOtp'] }, { to: 'CANCELLED', by: ['owner', 'admin'] }],
  OWNER_APPROVED: [{ to: 'NOC_PENDING', by: ['system', 'admin'] }, { to: 'SCHEDULED', by: ['admin'] }],
  NOC_PENDING: [{ to: 'SCHEDULED', by: ['admin'], requires: ['noc'] }, { to: 'CANCELLED', by: ['owner', 'admin'] }],
  SCHEDULED: [{ to: 'IN_PROGRESS', by: ['admin', 'technician'], requires: ['beforePhotos'] }],
  IN_PROGRESS: [{ to: 'COMPLETED', by: ['admin', 'technician'], requires: ['afterPhotos'] }],
  COMPLETED: [{ to: 'WARRANTY_ACTIVE', by: ['admin'], requires: ['warranty'] }],
  WARRANTY_ACTIVE: [],
  CANCELLED: [],
};

export type PaintingRequestFacts = {
  addonId: PaintingAddonId;
  fixedQuoteAed?: number | null;
  ownerOtpVerified?: boolean;
  nocFileId?: string | null;
  beforePhotoIds?: string[];
  afterPhotoIds?: string[];
  warrantyMonths?: number | null;
};

/** Returns null when allowed, otherwise a reason code. The AI actor can never move a request. */
export function paintingTransitionError(from: PaintingStatus, to: PaintingStatus, actor: PaintingActor, facts: PaintingRequestFacts): string | null {
  if (actor === 'ai') return 'AI_CANNOT_APPROVE';
  const rule = T[from]?.find((t) => t.to === to);
  if (!rule) return 'INVALID_TRANSITION';
  if (!rule.by.includes(actor)) return 'ACTOR_NOT_ALLOWED';
  const exterior = facts.addonId === 'painting_building_exterior';
  if (from === 'OWNER_APPROVED' && to === 'SCHEDULED' && exterior) return 'NOC_REQUIRED';
  for (const need of rule.requires || []) {
    if (need === 'fixedQuote' && !(Number(facts.fixedQuoteAed) > 0)) return 'FIXED_QUOTE_REQUIRED';
    if (need === 'ownerOtp' && facts.ownerOtpVerified !== true) return 'OWNER_OTP_REQUIRED';
    if (need === 'noc' && !facts.nocFileId) return 'NOC_REQUIRED';
    if (need === 'beforePhotos' && !(facts.beforePhotoIds || []).length) return 'BEFORE_PHOTOS_REQUIRED';
    if (need === 'afterPhotos' && !(facts.afterPhotoIds || []).length) return 'AFTER_PHOTOS_REQUIRED';
    if (need === 'warranty' && !(Number(facts.warrantyMonths) > 0)) return 'WARRANTY_REQUIRED';
  }
  return null;
}
