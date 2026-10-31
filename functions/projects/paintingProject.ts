/**
 * Painting is a ONE-TIME project service. It is deliberately NOT a recurring
 * add-on: it never appears in selectedAddOns, the annual quote, or the 15%
 * mobilisation invoice, and it never reuses Design Studio flat prices.
 * Lifecycle: REQUESTED -> SURVEYED -> QUOTED -> OWNER_APPROVED (OTP) ->
 * WORK_ORDER_OPEN -> COMPLETED -> WARRANTY_ACTIVE. A variation after approval
 * puts the project back to QUOTED with a new quote version.
 */
export const PAINTING_SCOPES = ["ROOM", "FULL_UNIT", "BUILDING_COMMON_AREAS", "EXTERIOR_FACADE"] as const;
export type PaintingScope = (typeof PAINTING_SCOPES)[number];
export const PAINT_GRADES = ["ECONOMY", "STANDARD", "PREMIUM"] as const;
export const SURFACE_CONDITIONS = ["GOOD", "FAIR", "POOR"] as const;
export const DEFAULT_MIN_GROSS_MARGIN_PCT = 35;

export type PaintingStatus =
  | "REQUESTED" | "SURVEYED" | "QUOTED" | "OWNER_APPROVED"
  | "WORK_ORDER_OPEN" | "COMPLETED" | "WARRANTY_ACTIVE" | "CANCELLED";

export const PAINTING_TRANSITIONS: Record<PaintingStatus, PaintingStatus[]> = {
  REQUESTED: ["SURVEYED", "CANCELLED"],
  SURVEYED: ["QUOTED", "CANCELLED"],
  QUOTED: ["OWNER_APPROVED", "QUOTED", "CANCELLED"],
  OWNER_APPROVED: ["WORK_ORDER_OPEN", "QUOTED", "CANCELLED"],
  WORK_ORDER_OPEN: ["COMPLETED", "QUOTED"],
  COMPLETED: ["WARRANTY_ACTIVE"],
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
    communityNocRequired: raw?.communityNocRequired === undefined ? scope === "EXTERIOR_FACADE" : b(raw.communityNocRequired),
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
    contingencyPct: num(raw?.contingencyPct ?? 10, "contingencyPct", { max: 50 }),
    warrantyReservePct: num(raw?.warrantyReservePct ?? 3, "warrantyReservePct", { max: 20 }),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function costSheetTotals(c: CostSheet) {
  const direct = c.materialsAed + c.labourAed + c.prepAed + c.accessScaffoldAed + c.permitsNocAed;
  const contingency = direct * (c.contingencyPct / 100);
  const warrantyReserve = direct * (c.warrantyReservePct / 100);
  return { directCostAed: r2(direct), contingencyAed: r2(contingency), warrantyReserveAed: r2(warrantyReserve), totalCostAed: r2(direct + contingency + warrantyReserve) };
}

export function minimumPriceFor(totalCostAed: number, minMarginPct: number) {
  return r2(totalCostAed / (1 - minMarginPct / 100));
}

/** Server-side quote builder; refuses any price below the configured minimum gross margin. */
export function buildPaintingQuote(input: { costSheet: CostSheet; priceAed: number; minMarginPct?: number; permits: PermitRequirements }) {
  const minMarginPct = num(input.minMarginPct ?? DEFAULT_MIN_GROSS_MARGIN_PCT, "minMarginPct", { min: 0, max: 90 });
  const totals = costSheetTotals(input.costSheet);
  if (totals.totalCostAed <= 0) throw new PaintingRuleError("Cost sheet total must be greater than zero.");
  const priceAed = r2(num(input.priceAed, "priceAed", { min: 1 }));
  const grossMarginPct = r2(((priceAed - totals.totalCostAed) / priceAed) * 100);
  const floor = minimumPriceFor(totals.totalCostAed, minMarginPct);
  if (priceAed + 0.005 < floor) {
    throw new PaintingRuleError(`Quote margin ${grossMarginPct}% is below the minimum ${minMarginPct}%. Minimum price is AED ${floor}.`);
  }
  if (input.costSheet.permitsNocAed === 0 && (input.permits.ddaMaintenancePermitRequired || input.permits.communityNocRequired)) {
    throw new PaintingRuleError("This job requires a permit/NOC; include its cost in the cost sheet.");
  }
  return { ...totals, priceAed, grossMarginPct, minMarginPct, minimumPriceAed: floor, billing: "ONE_TIME" as const };
}

export function assertPaintingTransition(from: PaintingStatus, to: PaintingStatus, actor: PaintingActor, ctx: { otpVerified?: boolean; beforePhotos?: number; afterPhotos?: number } = {}) {
  if (actor.kind === "AI") throw new PaintingRuleError("AI cannot change painting project status.");
  if (!PAINTING_TRANSITIONS[from]?.includes(to)) throw new PaintingRuleError(`Transition ${from} -> ${to} is not allowed.`);
  if (to === "OWNER_APPROVED") {
    if (actor.kind !== "OWNER") throw new PaintingRuleError("Only the owner can approve a painting quote.");
    if (!ctx.otpVerified) throw new PaintingRuleError("Owner approval requires a verified OTP.");
  } else if (to !== "CANCELLED" && actor.kind === "OWNER") {
    throw new PaintingRuleError("Owners can only approve or cancel.");
  }
  if (to === "WORK_ORDER_OPEN" && (ctx.beforePhotos ?? 0) < 1) throw new PaintingRuleError("Before photos are required to open the work order.");
  if (to === "COMPLETED" && (ctx.afterPhotos ?? 0) < 1) throw new PaintingRuleError("After photos are required to complete.");
  return true;
}
