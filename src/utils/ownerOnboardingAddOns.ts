import type { PropertyData } from '../store/onboardingStore';
import { resolveAddOnAnnualPrice } from './calculateUaeQuote2026';

/** Optional + system-driven add-on ids stored on each property. */
export function collectPortfolioSelectedAddOns(properties: PropertyData[]): string[] {
  return Array.from(new Set(
    properties.flatMap((property) => (Array.isArray(property.selectedAddOns) ? property.selectedAddOns : [])),
  ));
}

/** Engine-billable system / age packages for one property (checkbox alone never bills these). */
export function resolveSystemBillableAddOnIds(property: PropertyData): string[] {
  const ids: string[] = [];
  if (property?.fireAlarm === true || property?.firePump === true) ids.push('fire_safety');
  if (property?.tank === true) ids.push('water_tank');
  if (property?.hvac === true || Number(property?.hvacCount || 0) > 0) ids.push('hvac_pm');
  if (Number(property?.lifts || 0) > 0) ids.push('elevator_amc');
  if (property?.sira === true) ids.push('sira_renewal');
  if (property?.bmu === true) ids.push('facade_access');
  if (property?.pool === true) ids.push('pool_care');
  if (Number(property?.age || 0) > 15) ids.push('pca_audit');
  return ids;
}

export function collectPortfolioBillableAddOnIds(properties: PropertyData[]): string[] {
  return Array.from(new Set([
    ...collectPortfolioSelectedAddOns(properties),
    ...properties.flatMap((property) => resolveSystemBillableAddOnIds(property)),
  ]));
}

export function annualPriceForAddOn(id: string): number {
  return resolveAddOnAnnualPrice(id) || 0;
}
