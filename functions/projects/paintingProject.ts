/**
 * Painting is a ONE-TIME project service. It is deliberately NOT a recurring
 * add-on: it never appears in selectedAddOns, the annual quote, or the 15%
 * mobilisation invoice, and it never reuses Design Studio flat prices.
 * Lifecycle: REQUESTED -> SURVEYED -> QUOTED -> OWNER_APPROVED (OTP) ->
 * WORK_ORDER_OPEN -> COMPLETED -> WARRANTY_ACTIVE. A variation after approval
 * puts the project back to QUOTED with a new quote version.
 */
export const PAINTING_SCOPES = ["ROOM", "FULL_UNIT", "BUILDING_COMMON_AREAS", "EXTERIOR_FACADE", "FULL_BUILDING"] as const;
export type PaintingScope = (typeof PAINTING_SCOPES)[number];
export const PAINT_GRADES = ["ECONOMY", "STANDARD", "PREMIUM"] as const;
export const SURFACE_CONDITIONS = ["GOOD", "FAIR", "POOR"] as const;
/**
 * MARGIN DEFINITION (Rashid, Oct 2026). One formula, used everywhere:
 *
 *   directCost   = labour + materials + prep + access/scaffold + permit/NOC   (itemised AED cost lines)
 *   grossMargin% = (price - directCost) / price * 100
 *
 * Contingency (10% of directCost) and warranty reserve (3% of directCost) are NOT costs. They are
 * amounts held separately out of the gross margin, each on its own ledger (reserve_ledger), and are
 * never added to directCost, to actual costs, or to the margin calculation. That is what prevents
 * double-counting: a cost overrun draws on the contingency ledger, but actual margin is always
 * (price - recorded actual costs) / price.
 *
 * Blocking floor: HARD_MIN_GROSS_MARGIN_PCT (20%). There is no override path. Target: 35%; a quote
 * between the floor and the target needs a written reason and is audited.
 */
export const TARGET_GROSS_MARGIN_PCT = 35;
/** @deprecated name kept for imports; equals the 35% target. */
export const DEFAULT_MIN_GROSS_MARGIN_PCT = TARGET_GROSS_MARGIN_PCT;
export const CONTINGENCY_RESERVE_PCT = 10;
export const WARRANTY_RESERVE_PCT = 3;
export const WARRANTY_MONTHS = 12;
export const PAINTING_CURRENCY = "AED";

export type PaintingStatus =
  | "REQUESTED" | "SURVEYED" | "QUOTED" | "OWNER_APPROVED"
  | "WORK_ORDER_OPEN" | "COMPLETED" | "REWORK_REQUIRED" | "WARRANTY_ACTIVE" | "CANCELLED";

export const PAINTING_TRANSITIONS: Record<PaintingStatus, PaintingStatus[]> = {
  REQUESTED: ["SURVEYED", "CANCELLED"],
  SURVEYED: ["QUOTED", "CANCELLED"],
  QUOTED: ["OWNER_APPROVED", "QUOTED", "CANCELLED"],
  OWNER_APPROVED: ["WORK_ORDER_OPEN", "QUOTED", "CANCELLED"],
  WORK_ORDER_OPEN: ["COMPLETED", "QUOTED"],
  // The owner may reject documented completion (written reason) -> REWORK_REQUIRED. Only a recorded
  // rework milestone returns the project to COMPLETED, where the owner can accept (or reject again).
  COMPLETED: ["WARRANTY_ACTIVE", "REWORK_REQUIRED"],
  REWORK_REQUIRED: ["COMPLETED"],
  WARRANTY_ACTIVE: [],
  CANCELLED: [],
};

export type PaintingActor = { kind: "OWNER" | "ADMIN" | "TECHNICIAN" | "AI"; uid: string };

export interface PaintingMeasurements {
  wallAreaSqm: number;
  ceilingAreaSqm: number;
  doorsCount: number;
  woodworkLinearM: number;
  condition: (typeof SURFACE_CONDITIONS)[number];
  coats: number;
  paintGrade: (typeof PAINT_GRADES)[number];
  photoPaths: string[];
}

/** Per-job permit / NOC configuration. Nothing is assumed blanket-required. */
export interface PermitRequirements {
  dmBasicMaintenanceContractorRequired: boolean; // DM Resolution 109/2022 basic maintenance
  ddaMaintenancePermitRequired: boolean;          // DDA-regulated areas
  communityNocRequired: boolean;                  // typically exterior/facade
  notes?: string;
}

export interface CostSheet {
  materialsAed: number;
  labourAed: number;
  prepAed: number;
  accessScaffoldAed: number;
  permitsNocAed: number;
  contingencyPct: number;      // of direct cost
  warrantyReservePct: number;  // of direct cost
}

export class PaintingRuleError extends Error {}

const num = (v: unknown, field: string, { min = 0, max = 1e7, int = false } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) {
    throw new PaintingRuleError(`${field} must be a number between ${min} and ${max}.`);
  }
  return n;
};
const oneOf = <T extends readonly string[]>(v: unknown, list: T, field: string): T[number] => {
  const s = String(v ?? "").toUpperCase();
  if (!(list as readonly string[]).includes(s)) throw new PaintingRuleError(`${field} must be one of ${list.join(", ")}.`);
  return s as T[number];
};

export function normaliseScope(v: unknown): PaintingScope { return oneOf(v, PAINTING_SCOPES, "scope"); }

export function normaliseMeasurements(raw: any): PaintingMeasurements {
  const photoPaths = Array.isArray(raw?.photoPaths) ? raw.photoPaths.map(String).slice(0, 40) : [];
  if (photoPaths.some((p: string) => /^https?:/i.test(p) || p.includes("token="))) {
    throw new PaintingRuleError("photoPaths must be Storage object paths, not download URLs.");
  }
  const m: PaintingMeasurements = {
    wallAreaSqm: num(raw?.wallAreaSqm, "wallAreaSqm", { max: 200000 }),
    ceilingAreaSqm: num(raw?.ceilingAreaSqm ?? 0, "ceilingAreaSqm", { max: 200000 }),
    doorsCount: num(raw?.doorsCount ?? 0, "doorsCount", { max: 5000, int: true }),
    woodworkLinearM: num(raw?.woodworkLinearM ?? 0, "woodworkLinearM", { max: 100000 }),
    condition: oneOf(raw?.condition, SURFACE_CONDITIONS, "condition"),
    coats: num(raw?.coats ?? 2, "coats", { min: 1, max: 4, int: true }),
    paintGrade: oneOf(raw?.paintGrade, PAINT_GRADES, "paintGrade"),
    photoPaths,
  };
  if (m.wallAreaSqm + m.ceilingAreaSqm <= 0) throw new PaintingRuleError("A paintable wall or ceiling area is required.");
  return m;
}

export function normalisePermits(raw: any, scope: PaintingScope): PermitRequirements {
  const b = (v: unknown) => v === true;
  return {
    dmBasicMaintenanceContractorRequired: raw?.dmBasicMaintenanceContractorRequired === undefined ? true : b(raw.dmBasicMaintenanceContractorRequired),
    ddaMaintenancePermitRequired: b(raw?.ddaMaintenancePermitRequired),
    // Default suggestion only: exterior work usually needs a community NOC; admin can override per job.
    communityNocRequired: raw?.communityNocRequired === undefined ? (scope === "EXTERIOR_FACADE" || scope === "FULL_BUILDING") : b(raw.communityNocRequired),
    // Omit (never undefined): Firestore rejects undefined values and Functions do not enable ignoreUndefinedProperties.
    ...(raw?.notes ? { notes: String(raw.notes).slice(0, 1000) } : {}),
  };
}

export function normaliseCostSheet(raw: any): CostSheet {
  return {
    materialsAed: num(raw?.materialsAed, "materialsAed"),
    labourAed: num(raw?.labourAed, "labourAed"),
    prepAed: num(raw?.prepAed ?? 0, "prepAed"),
    accessScaffoldAed: num(raw?.accessScaffoldAed ?? 0, "accessScaffoldAed"),
    permitsNocAed: num(raw?.permitsNocAed ?? 0, "permitsNocAed"),
    // Reserve rates are policy, not per-quote inputs.
    contingencyPct: CONTINGENCY_RESERVE_PCT,
    warrantyReservePct: WARRANTY_RESERVE_PCT,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function costSheetTotals(c: CostSheet) {
  const direct = c.materialsAed + c.labourAed + c.prepAed + c.accessScaffoldAed + c.permitsNocAed;
  const contingency = direct * (c.contingencyPct / 100);
  const warrantyReserve = direct * (c.warrantyReservePct / 100);
  // Reserves are reported separately and are never part of the cost base.
  return { directCostAed: r2(direct), contingencyReserveAed: r2(contingency), warrantyReserveAed: r2(warrantyReserve) };
}

/** Lowest price at which (price - directCost) / price reaches marginPct. */
export function minimumPriceFor(directCostAed: number, marginPct: number) {
  return r2(directCostAed / (1 - marginPct / 100));
}

export function grossMarginPct(priceAed: number, directCostAed: number) {
  return priceAed > 0 ? r2(((priceAed - directCostAed) / priceAed) * 100) : 0;
}

/**
 * Server-side quote builder. Blocks any price whose gross margin is below the floor (never below the
 * hard 20%; a caller can raise it, never lower it). Between the floor and the 35% target a written
 * reason is required. Reserves must be fundable from the margin.
 */
export function buildPaintingQuote(input: { costSheet: CostSheet; priceAed: number; minMarginPct?: number; targetMarginPct?: number; belowTargetReason?: unknown; permits: PermitRequirements }) {
  const minMarginPct = Math.max(num(input.minMarginPct ?? HARD_MIN_GROSS_MARGIN_PCT, "minMarginPct", { min: 0, max: 90 }), HARD_MIN_GROSS_MARGIN_PCT);
  const targetMarginPct = Math.max(num(input.targetMarginPct ?? TARGET_GROSS_MARGIN_PCT, "targetMarginPct", { min: 0, max: 90 }), minMarginPct);
  const totals = costSheetTotals(input.costSheet);
  if (totals.directCostAed <= 0) throw new PaintingRuleError("Direct cost must be greater than zero.");
  const priceAed = r2(num(input.priceAed, "priceAed", { min: 1 }));
  const margin = grossMarginPct(priceAed, totals.directCostAed);
  const floor = minimumPriceFor(totals.directCostAed, minMarginPct);
  if (priceAed + 0.005 < floor) {
    throw new PaintingRuleError(`Quote margin ${margin}% is below the minimum ${minMarginPct}%. Minimum price is AED ${floor}. There is no override.`);
  }
  const reservesAed = r2(totals.contingencyReserveAed + totals.warrantyReserveAed);
  const marginAfterReservesAed = r2(priceAed - totals.directCostAed - reservesAed);
  if (marginAfterReservesAed < 0) throw new PaintingRuleError("The price does not cover the direct cost plus the contingency and warranty reserves.");
  const belowTarget = margin + 0.005 < targetMarginPct;
  const reason = shortText(input.belowTargetReason, 500);
  if (belowTarget && (!reason || reason.length < 8)) {
    throw new PaintingRuleError(`Margin ${margin}% is below the ${targetMarginPct}% target. Give a written reason (at least 8 characters).`);
  }
  if (input.costSheet.permitsNocAed === 0 && (input.permits.ddaMaintenancePermitRequired || input.permits.communityNocRequired)) {
    throw new PaintingRuleError("This job requires a permit/NOC; include its cost in the cost sheet.");
  }
  return {
    ...totals, priceAed, currency: PAINTING_CURRENCY, grossMarginPct: margin, minMarginPct, targetMarginPct, belowTarget,
    belowTargetReason: belowTarget ? reason : null, minimumPriceAed: floor, targetPriceAed: minimumPriceFor(totals.directCostAed, targetMarginPct),
    marginAfterReservesAed, marginAfterReservesPct: r2((marginAfterReservesAed / priceAed) * 100),
    marginFormula: "(price - (labour + materials + prep + access + permit)) / price; reserves held separately", billing: "ONE_TIME" as const,
  };
}

export function assertPaintingTransition(from: PaintingStatus, to: PaintingStatus, actor: PaintingActor, ctx: { otpVerified?: boolean; beforePhotos?: number; afterPhotos?: number; reworkRecorded?: boolean } = {}) {
  if (actor.kind === "AI") throw new PaintingRuleError("AI cannot change painting project status.");
  if (!PAINTING_TRANSITIONS[from]?.includes(to)) throw new PaintingRuleError(`Transition ${from} -> ${to} is not allowed.`);
  if (to === "OWNER_APPROVED") {
    if (actor.kind !== "OWNER") throw new PaintingRuleError("Only the owner can approve a painting quote.");
    if (!ctx.otpVerified) throw new PaintingRuleError("Owner approval requires a verified OTP.");
  } else if (to === "REWORK_REQUIRED") {
    if (actor.kind !== "OWNER") throw new PaintingRuleError("Only the owner can reject the completed work.");
  } else if (to !== "CANCELLED" && actor.kind === "OWNER") {
    throw new PaintingRuleError("Owners can only approve, reject completed work or cancel.");
  }
  if (from === "REWORK_REQUIRED" && to === "COMPLETED" && !ctx.reworkRecorded) throw new PaintingRuleError("Record the rework milestone first.");
  if (to === "WORK_ORDER_OPEN" && (ctx.beforePhotos ?? 0) < 1) throw new PaintingRuleError("Before photos are required to open the work order.");
  if (to === "COMPLETED" && (ctx.afterPhotos ?? 0) < 1) throw new PaintingRuleError("After photos are required to complete.");
  return true;
}

// ---------------------------------------------------------------------------
// Step 3: detailed scope (rooms / floors / units / common areas / exterior),
// itemised quote, contractor cost tracking and staged cash/cheque billing.
// ---------------------------------------------------------------------------

export const AREA_KINDS = ["ROOM", "FLOOR", "UNIT", "COMMON_AREA", "EXTERIOR"] as const;
export const SURFACE_TYPES = ["WALLS", "CEILING", "DOORS", "WOODWORK", "METAL", "FACADE"] as const;
export const PAINT_FINISHES = ["MATT", "EGGSHELL", "SATIN", "GLOSS", "TEXTURED"] as const;
export const MAX_AREAS = 300;
export const MAX_AREA_PHOTOS = 10;

export interface PaintingArea {
  kind: (typeof AREA_KINDS)[number];
  label: string;
  floor: string | null;
  unitRef: string | null;
  wallAreaSqm: number;
  ceilingAreaSqm: number;
  surfaces: Array<(typeof SURFACE_TYPES)[number]>;
  wallColour: string | null;
  ceilingColour: string | null;
  finish: (typeof PAINT_FINISHES)[number];
  condition: (typeof SURFACE_CONDITIONS)[number];
  photoPaths: string[];
}

const shortText = (v: unknown, max: number) => {
  const s = String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
  return s || null;
};

/**
 * Normalises the owner's / surveyor's area breakdown. Photo paths must be Storage object paths under
 * `allowedPhotoPrefix` (never download or token URLs).
 */
export function normaliseAreas(raw: unknown, allowedPhotoPrefix: string | null): PaintingArea[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new PaintingRuleError("areas must be a list.");
  if (raw.length > MAX_AREAS) throw new PaintingRuleError(`At most ${MAX_AREAS} areas per project.`);
  return raw.map((a: any, i: number) => {
    const label = shortText(a?.label, 120);
    if (!label) throw new PaintingRuleError(`areas[${i}].label is required.`);
    const surfacesRaw: unknown[] = Array.isArray(a?.surfaces) ? a.surfaces : ["WALLS"];
    const surfaces = [...new Set(surfacesRaw.map((s) => oneOf(s, SURFACE_TYPES, `areas[${i}].surfaces`)))];
    if (surfaces.length === 0) throw new PaintingRuleError(`areas[${i}] needs at least one surface.`);
    const photoPaths: string[] = Array.isArray(a?.photoPaths) ? a.photoPaths.map((p: unknown) => String(p ?? "").trim()).filter(Boolean) : [];
    if (photoPaths.length > MAX_AREA_PHOTOS) throw new PaintingRuleError(`At most ${MAX_AREA_PHOTOS} photos per area.`);
    for (const p of photoPaths) {
      if (/^https?:/i.test(p) || p.includes("token=") || p.includes("..") || /[?#]/.test(p) || p.length > 500 ||
          (allowedPhotoPrefix !== null && !p.startsWith(allowedPhotoPrefix))) {
        throw new PaintingRuleError("Area photos must be your own uploaded Storage paths, not links.");
      }
    }
    const area: PaintingArea = {
      kind: oneOf(a?.kind ?? "ROOM", AREA_KINDS, `areas[${i}].kind`),
      label,
      floor: shortText(a?.floor, 40),
      unitRef: shortText(a?.unitRef, 60),
      wallAreaSqm: num(a?.wallAreaSqm ?? 0, `areas[${i}].wallAreaSqm`, { max: 100000 }),
      ceilingAreaSqm: num(a?.ceilingAreaSqm ?? 0, `areas[${i}].ceilingAreaSqm`, { max: 100000 }),
      surfaces,
      wallColour: shortText(a?.wallColour, 60),
      ceilingColour: shortText(a?.ceilingColour, 60),
      finish: oneOf(a?.finish ?? "MATT", PAINT_FINISHES, `areas[${i}].finish`),
      condition: oneOf(a?.condition ?? "GOOD", SURFACE_CONDITIONS, `areas[${i}].condition`),
      photoPaths,
    };
    if (area.wallAreaSqm + area.ceilingAreaSqm <= 0) throw new PaintingRuleError(`areas[${i}] needs a wall or ceiling area.`);
    if (area.ceilingAreaSqm > 0 && !area.surfaces.includes("CEILING")) area.surfaces.push("CEILING");
    return area;
  });
}

const CONDITION_RANK = { GOOD: 0, FAIR: 1, POOR: 2 } as const;
export function summariseAreas(areas: PaintingArea[]) {
  const worst = areas.reduce<(typeof SURFACE_CONDITIONS)[number]>((w, a) => (CONDITION_RANK[a.condition] > CONDITION_RANK[w] ? a.condition : w), "GOOD");
  return {
    areaCount: areas.length,
    wallAreaSqm: r2(areas.reduce((s, a) => s + a.wallAreaSqm, 0)),
    ceilingAreaSqm: r2(areas.reduce((s, a) => s + a.ceilingAreaSqm, 0)),
    floors: [...new Set(areas.map((a) => a.floor).filter(Boolean))].length,
    units: [...new Set(areas.map((a) => a.unitRef).filter(Boolean))].length,
    worstCondition: worst,
  };
}

// Itemised quote ------------------------------------------------------------

export const LINE_CATEGORIES = ["LABOUR", "MATERIALS", "PREP", "ACCESS", "PERMIT"] as const;
export type LineCategory = (typeof LINE_CATEGORIES)[number];
const CATEGORY_FIELD: Record<LineCategory, keyof CostSheet> = {
  LABOUR: "labourAed", MATERIALS: "materialsAed", PREP: "prepAed", ACCESS: "accessScaffoldAed", PERMIT: "permitsNocAed",
};
export interface CostLine { category: LineCategory; description: string; qty: number; unit: string; unitCostAed: number; amountAed: number; currency: "AED"; rateId: string | null; rateVersion: number | null }
export type PaintingRate = { rateId: string; category: LineCategory; unit: string; rateAed: number; currency: string; version: number };

export function normaliseCostLines(raw: unknown, rates: Record<string, PaintingRate> = {}): CostLine[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new PaintingRuleError("At least one cost line is required.");
  if (raw.length > 200) throw new PaintingRuleError("At most 200 cost lines.");
  return raw.map((l: any, i: number) => {
    const description = shortText(l?.description, 200);
    if (!description) throw new PaintingRuleError(`lines[${i}].description is required.`);
    if (String(l?.currency ?? "") !== PAINTING_CURRENCY) throw new PaintingRuleError(`lines[${i}].currency must be AED.`);
    const category = oneOf(l?.category, LINE_CATEGORIES, `lines[${i}].category`) as LineCategory;
    const qty = num(l?.qty, `lines[${i}].qty`, { max: 1e6 });
    let unitCostAed = l?.rateId && l?.unitCostAed === undefined ? 0 : num(l?.unitCostAed, `lines[${i}].unitCostAed`, { max: 1e6 });
    let unit = shortText(l?.unit, 20) || "item";
    const rateId = l?.rateId ? String(l.rateId) : null;
    let rateVersion: number | null = null;
    if (rateId) {
      // A line priced from the admin rate book must use the current recorded rate.
      const rate = rates[rateId];
      if (!rate) throw new PaintingRuleError(`lines[${i}].rateId ${rateId} is not a recorded rate.`);
      if (rate.currency !== PAINTING_CURRENCY) throw new PaintingRuleError(`Rate ${rateId} is not in AED.`);
      if (rate.category !== category) throw new PaintingRuleError(`Rate ${rateId} is a ${rate.category} rate, not ${category}.`);
      if (l?.unitCostAed !== undefined && Math.abs(unitCostAed - rate.rateAed) > 0.005) throw new PaintingRuleError(`lines[${i}] unit cost differs from rate ${rateId} (AED ${rate.rateAed}).`);
      unitCostAed = rate.rateAed; unit = rate.unit; rateVersion = rate.version;
    }
    return { category, description, qty, unit, unitCostAed, amountAed: r2(qty * unitCostAed), currency: PAINTING_CURRENCY, rateId, rateVersion };
  });
}

/** Categories that must carry a cost above zero before a quote can be issued. */
export function requiredCostCategories(scope: PaintingScope, permits: PermitRequirements): LineCategory[] {
  const req: LineCategory[] = ["LABOUR", "MATERIALS", "PREP"];
  if (scope === "EXTERIOR_FACADE" || scope === "FULL_BUILDING") req.push("ACCESS");
  if (permits.ddaMaintenancePermitRequired || permits.communityNocRequired) req.push("PERMIT");
  return req;
}
export function assertRequiredCostLines(lines: CostLine[], scope: PaintingScope, permits: PermitRequirements) {
  const missing = requiredCostCategories(scope, permits).filter((c) => !(lines.filter((l) => l.category === c).reduce((s, l) => s + l.amountAed, 0) > 0));
  if (missing.length) throw new PaintingRuleError(`Enter the required cost lines before quoting: ${missing.join(", ")}.`);
}

/** Admin rate book entry (AED only). */
export function normaliseRate(raw: any): Omit<PaintingRate, "rateId" | "version"> & { label: string } {
  if (String(raw?.currency ?? "") !== PAINTING_CURRENCY) throw new PaintingRuleError("Rates must be in AED.");
  const label = shortText(raw?.label, 120);
  if (!label) throw new PaintingRuleError("A rate label is required.");
  return {
    category: oneOf(raw?.category, LINE_CATEGORIES, "category") as LineCategory,
    unit: shortText(raw?.unit, 20) || "sqm",
    rateAed: r2(num(raw?.rateAed, "rateAed", { max: 1e6 })),
    currency: PAINTING_CURRENCY, label,
  };
}

/**
 * Reserve position. Reserves are held from the price, separately from cost. A recorded cost overrun
 * (actual > quoted direct cost) draws on contingency; overrun beyond contingency is reported, and the
 * warranty reserve is never drawn by construction overruns.
 */
export function reservePosition(held: { contingencyReserveAed: number; warrantyReserveAed: number }, quotedDirectCostAed: number, actualCostAed: number) {
  const overrun = Math.max(0, r2(actualCostAed - quotedDirectCostAed));
  const used = Math.min(held.contingencyReserveAed, overrun);
  return {
    contingencyHeldAed: r2(held.contingencyReserveAed), contingencyUsedAed: r2(used),
    contingencyRemainingAed: r2(held.contingencyReserveAed - used), overrunBeyondContingencyAed: r2(overrun - used),
    warrantyHeldAed: r2(held.warrantyReserveAed),
  };
}

/** Rolls itemised internal cost lines into the cost sheet the margin floor is computed on. */
export function costSheetFromLines(lines: CostLine[]): CostSheet {
  const sheet: Record<string, unknown> = { materialsAed: 0, labourAed: 0, prepAed: 0, accessScaffoldAed: 0, permitsNocAed: 0 };
  for (const l of lines) sheet[CATEGORY_FIELD[l.category]] = r2(Number(sheet[CATEGORY_FIELD[l.category]]) + l.amountAed);
  return normaliseCostSheet(sheet);
}

/**
 * Owner-facing itemised price: each category is shown at its share of the final price (cost uplifted
 * pro rata, contingency and warranty reserve spread across categories). Internal cost, margin and
 * contractor data never appear here. Lines always sum exactly to priceAed.
 */
export function ownerQuoteLines(c: CostSheet, priceAed: number) {
  const cats = LINE_CATEGORIES.map((k) => ({ category: k, cost: Number(c[CATEGORY_FIELD[k]]) })).filter((x) => x.cost > 0);
  const direct = cats.reduce((s, x) => s + x.cost, 0);
  if (direct <= 0) return [];
  const out = cats.map((x) => ({ category: x.category, amountAed: r2((x.cost / direct) * priceAed) }));
  const drift = r2(priceAed - out.reduce((s, x) => s + x.amountAed, 0));
  if (drift !== 0) {
    const biggest = out.reduce((b, x) => (x.amountAed > b.amountAed ? x : b), out[0]);
    biggest.amountAed = r2(biggest.amountAed + drift);
  }
  return out;
}

// Billing -------------------------------------------------------------------

export const BILLING_STAGES = ["DEPOSIT", "PROGRESS", "FINAL"] as const;
export type BillingStage = (typeof BILLING_STAGES)[number];
/** Card payments stay OFF for painting. Only these offline methods are accepted. */
export const PAINTING_PAYMENT_METHODS = ["CASH", "CHEQUE"] as const;
export type PaintingPaymentMethod = (typeof PAINTING_PAYMENT_METHODS)[number];
export const DEFAULT_DEPOSIT_PCT = 40;
export const DEFAULT_PROGRESS_PCT = 30;

/** Billing split is fixed policy: 40% deposit / 30% progress / 30% final. Any other split is refused. */
export const FIXED_BILLING_PLAN = Object.freeze({ depositPct: 40, progressPct: 30, finalPct: 30 });
export function normaliseBillingPlan(raw: any) {
  const depositPct = num(raw?.depositPct ?? DEFAULT_DEPOSIT_PCT, "depositPct", { min: 10, max: 80 });
  const progressPct = num(raw?.progressPct ?? DEFAULT_PROGRESS_PCT, "progressPct", { min: 0, max: 80 });
  const finalPct = r2(100 - depositPct - progressPct);
  if (depositPct !== FIXED_BILLING_PLAN.depositPct || progressPct !== FIXED_BILLING_PLAN.progressPct || finalPct !== FIXED_BILLING_PLAN.finalPct) {
    throw new PaintingRuleError("The billing split is fixed at 40% deposit, 30% progress and 30% final.");
  }
  return { ...FIXED_BILLING_PLAN };
}

/** Splits an approved price into stage amounts that sum exactly to the price. */
export function billingSchedule(priceAed: number, plan: { depositPct: number; progressPct: number; finalPct: number }) {
  const deposit = r2(priceAed * plan.depositPct / 100);
  const progress = r2(priceAed * plan.progressPct / 100);
  const final = r2(priceAed - deposit - progress);
  return { DEPOSIT: deposit, PROGRESS: progress, FINAL: final } as Record<BillingStage, number>;
}

/**
 * Each stage is tied to a documented milestone. The invoice cannot be issued, and Finance cannot
 * release the payment, until the milestone is on record and the earlier stages are PAID.
 *  DEPOSIT 40%  - due on the owner's OTP acceptance of the quote (OWNER_APPROVED).
 *  PROGRESS 30% - after an Admin-recorded progress milestone with photo evidence.
 *  FINAL 30%    - after completion is documented (after photos) AND the owner's acceptance is recorded.
 */
export type StageMilestone = "QUOTE_ACCEPTED" | "PROGRESS_MILESTONE" | "COMPLETION_ACCEPTED";
export const STAGE_GATES: Record<BillingStage, { statuses: PaintingStatus[]; requiresPaid: BillingStage[]; milestone: StageMilestone }> = {
  DEPOSIT: { statuses: ["OWNER_APPROVED"], requiresPaid: [], milestone: "QUOTE_ACCEPTED" },
  PROGRESS: { statuses: ["WORK_ORDER_OPEN", "COMPLETED", "REWORK_REQUIRED"], requiresPaid: ["DEPOSIT"], milestone: "PROGRESS_MILESTONE" },
  FINAL: { statuses: ["COMPLETED"], requiresPaid: ["DEPOSIT", "PROGRESS"], milestone: "COMPLETION_ACCEPTED" },
};

/** Pure gate check used both when issuing an invoice and when Finance releases it. */
export function assertStageGate(stage: BillingStage, p: { status: string; approvedQuoteVersion?: unknown; quoteVersion?: unknown; payments?: Record<string, { status?: string }>; milestones?: any; completionAcceptance?: any; completedAt?: unknown }, opts: { checkStatus?: boolean } = {}) {
  const gate = STAGE_GATES[stage];
  if (opts.checkStatus !== false && !gate.statuses.includes(p.status as PaintingStatus)) throw new PaintingRuleError(`The ${stage} invoice cannot be issued while the project is ${p.status}.`);
  for (const s of gate.requiresPaid) {
    if (p.payments?.[s]?.status !== "PAID") throw new PaintingRuleError(`The ${s} payment must be approved by Finance first.`);
  }
  if (gate.milestone === "QUOTE_ACCEPTED" && (p.approvedQuoteVersion == null || Number(p.approvedQuoteVersion) !== Number(p.quoteVersion))) {
    throw new PaintingRuleError("The deposit is due only after the owner accepts the current quote.");
  }
  if (gate.milestone === "PROGRESS_MILESTONE") {
    const m = p.milestones?.PROGRESS;
    if (!m?.recordedBy || !Array.isArray(m.photoPaths) || m.photoPaths.length < 1) throw new PaintingRuleError("Record the progress milestone with photo evidence first.");
  }
  if (gate.milestone === "COMPLETION_ACCEPTED") {
    if (!p.completedAt) throw new PaintingRuleError("Completion must be documented first.");
    if (p.status === "REWORK_REQUIRED") throw new PaintingRuleError("The owner rejected the completed work; the final payment is blocked until rework is recorded and accepted.");
    if (!p.completionAcceptance?.acceptedBy) throw new PaintingRuleError("The owner must accept the completed work before the final payment.");
  }
  return true;
}

export function normalisePaymentMethod(v: unknown): PaintingPaymentMethod {
  const s = String(v ?? "").toUpperCase();
  if (!(PAINTING_PAYMENT_METHODS as readonly string[]).includes(s)) {
    throw new PaintingRuleError("Painting payments are recorded as cash or cheque only. Card payments are off.");
  }
  return s as PaintingPaymentMethod;
}

export const COST_CATEGORIES = ["CONTRACTOR", "MATERIALS", "LABOUR", "ACCESS", "PERMIT", "OTHER"] as const;

/** Actual-vs-quoted tracking for admins. */
export function costTracking(approvedPriceAed: number, quotedCostAed: number, actualCostAed: number) {
  const actualMarginPct = approvedPriceAed > 0 ? r2(((approvedPriceAed - actualCostAed) / approvedPriceAed) * 100) : 0;
  return { approvedPriceAed: r2(approvedPriceAed), quotedCostAed: r2(quotedCostAed), actualCostAed: r2(actualCostAed), varianceAed: r2(actualCostAed - quotedCostAed), actualMarginPct };
}

export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;
export function requireIdempotencyKey(v: unknown): string {
  const s = String(v ?? "");
  if (!IDEMPOTENCY_KEY.test(s)) throw new PaintingRuleError("requestId must be 8-64 letters, digits, '-' or '_'.");
  return s;
}

/** Absolute margin floor. platform_config can raise the minimum, never lower it below this. */
export const HARD_MIN_GROSS_MARGIN_PCT = 20;
