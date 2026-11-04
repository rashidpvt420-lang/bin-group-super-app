/**
 * Client-side preview of the AI Design Studio quote.
 *
 * It mirrors calculateServerQuote() in functions/aiDesignStudio.ts with BIN's default price list
 * (functions/designPriceList.ts DEFAULT_DESIGN_RATES). The server still recalculates and locks the
 * real quote; this only keeps the number shown before submit consistent with what the server returns.
 * The previous preview used the legacy institutional pricing engine (band rates + 20% contingency +
 * 45% margin + fixed allowances) and showed ~2.5x the server quote.
 */
export const DEFAULT_DESIGN_PREVIEW_RATES = {
  materialsPerSqft: 180,
  laborPerSqft: 95,
  luxuryMultiplier: 1.45,
  standardMultiplier: 0.82,
  approvalsAllowance: 2500,
  logisticsStandard: 1800,
  logisticsMallOrNight: 4500,
  minimumSubtotal: 2500,
  contingencyRate: 0.08,
  binMarginRate: 0.12,
  mobilizationPercent: 15,
} as const;

export type DesignPreviewScope = {
  dimensions: number;
  isMetric?: boolean;
  finishTier: string;
  furnitureBudget?: number;
  hasMEP?: boolean;
  hasStructural?: boolean;
  isNightWork?: boolean;
  isMallEnvironment?: boolean;
};

export function previewDesignQuote(scope: DesignPreviewScope, r = DEFAULT_DESIGN_PREVIEW_RATES) {
  const dimensions = Math.max(1, Math.min(10000, Number(scope.dimensions) || 50));
  const furnitureBudget = Math.max(0, Math.min(500000, Number(scope.furnitureBudget) || 0));
  const areaSqft = scope.isMetric ? dimensions * 10.7639 : dimensions;
  const tier = String(scope.finishTier || '').toLowerCase();
  const tierMultiplier = tier.includes('luxury') ? r.luxuryMultiplier : tier.includes('standard') ? r.standardMultiplier : 1;
  const materialsEstimate = Math.round(areaSqft * r.materialsPerSqft * tierMultiplier);
  const laborEstimate = Math.round(areaSqft * r.laborPerSqft * tierMultiplier);
  const approvalsAllowance = scope.hasStructural || scope.hasMEP ? r.approvalsAllowance : 0;
  const logisticsAllowance = scope.isMallEnvironment || scope.isNightWork ? r.logisticsMallOrNight : r.logisticsStandard;
  const subtotal = Math.max(r.minimumSubtotal, materialsEstimate + laborEstimate + approvalsAllowance + logisticsAllowance + furnitureBudget);
  const contingency = Math.round(subtotal * r.contingencyRate);
  const binMargin = Math.round(subtotal * r.binMarginRate);
  const finalTotal = subtotal + contingency + binMargin;
  const mobilizationAmount = Math.round(finalTotal * (r.mobilizationPercent / 100) * 100) / 100;
  return { materialsEstimate, laborEstimate, approvalsAllowance, logisticsAllowance, contingency, binMargin, finalTotal, mobilizationAmount };
}
