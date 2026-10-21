/**
 * BIN design price list (feature 10). AI redesign quotes are ESTIMATES from BIN's own configurable
 * rates (system_config/design_price_list), never supplier prices and never priced by the AI.
 * The defaults are the rates the server used before this change, so quotes do not move on deploy.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { requirePrivilegedMfaSession } from "./adminMfaSession";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export type DesignRates = {
  materialsPerSqft: number; laborPerSqft: number; luxuryMultiplier: number; standardMultiplier: number;
  approvalsAllowance: number; logisticsStandard: number; logisticsMallOrNight: number; minimumSubtotal: number;
  contingencyRate: number; binMarginRate: number; mobilizationPercent: number;
};
export const DEFAULT_DESIGN_RATES: DesignRates = {
  materialsPerSqft: 180, laborPerSqft: 95, luxuryMultiplier: 1.45, standardMultiplier: 0.82,
  approvalsAllowance: 2500, logisticsStandard: 1800, logisticsMallOrNight: 4500, minimumSubtotal: 2500,
  contingencyRate: 0.08, binMarginRate: 0.12, mobilizationPercent: 15,
};
const BOUNDS: Record<keyof DesignRates, [number, number]> = {
  materialsPerSqft: [1, 20000], laborPerSqft: [1, 20000], luxuryMultiplier: [0.1, 10], standardMultiplier: [0.1, 10],
  approvalsAllowance: [0, 1_000_000], logisticsStandard: [0, 1_000_000], logisticsMallOrNight: [0, 1_000_000], minimumSubtotal: [0, 10_000_000],
  contingencyRate: [0, 1], binMarginRate: [0, 1], mobilizationPercent: [0, 100],
};
export const ESTIMATE_LABEL = "Indicative estimate from BIN's price list. Not a supplier quote; final price is confirmed after site verification.";

export function validateRates(input: any): DesignRates {
  const out: any = {};
  for (const key of Object.keys(DEFAULT_DESIGN_RATES) as (keyof DesignRates)[]) {
    const v = Number(input?.[key]);
    const [lo, hi] = BOUNDS[key];
    if (!Number.isFinite(v) || v < lo || v > hi) throw new HttpsError("invalid-argument", `${key} must be a number between ${lo} and ${hi}.`);
    out[key] = v;
  }
  return out;
}

/** Configured rates, or the defaults when the config is missing or invalid. */
export async function loadDesignPriceList(): Promise<{ rates: DesignRates; version: string; source: "BIN_CONFIGURED" | "BIN_DEFAULT" }> {
  const data = (await db.collection("system_config").doc("design_price_list").get()).data();
  if (!data?.rates) return { rates: DEFAULT_DESIGN_RATES, version: "default-v1", source: "BIN_DEFAULT" };
  try {
    return { rates: validateRates(data.rates), version: String(data.version || "configured"), source: "BIN_CONFIGURED" };
  } catch {
    console.warn("[designPriceList] invalid configured rates; using defaults");
    return { rates: DEFAULT_DESIGN_RATES, version: "default-v1", source: "BIN_DEFAULT" };
  }
}

const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);
export const adminSetDesignPriceList = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const role = String(request.auth?.token?.role || request.auth?.token?.userRole || "").toLowerCase();
  if (!request.auth?.uid || !ADMIN_ROLES.has(role) || request.auth.token?.email_verified !== true) throw new HttpsError("permission-denied", "Admin access required.");
  await requirePrivilegedMfaSession(request.auth);
  const rates = validateRates(request.data?.rates);
  const version = `v${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
  const now = FieldValue.serverTimestamp();
  await db.collection("system_config").doc("design_price_list").set({ rates, version, updatedBy: request.auth.uid, updatedAt: now });
  await db.collection("audit_logs").add({ action: "DESIGN_PRICE_LIST_UPDATED", actorId: request.auth.uid, actorRole: role, version, rates, createdAt: now });
  return { status: "SUCCESS", version, rates };
});
