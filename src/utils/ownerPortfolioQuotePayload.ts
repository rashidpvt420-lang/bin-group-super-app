import { resolveAssetClassIdForPropertyType, type QuoteInput } from '@bin/shared';
import type { PropertyData } from '../store/onboardingStore';

const emirateMap: Record<string, string> = {
  Dubai: 'dubai',
  'Abu Dhabi': 'abuDhabi',
  Sharjah: 'sharjah',
  Ajman: 'ajman',
  RAK: 'rasAlKhaimah',
  'Ras Al Khaimah': 'rasAlKhaimah',
  Fujairah: 'fujairah',
  UAQ: 'ummAlQuwain',
  'Umm Al Quwain': 'ummAlQuwain',
};

const BED_PRICED_TYPES = new Set(['Labour Camp', 'Staff Accommodation']);

const isMosqueAsset = (property: PropertyData) => {
  const descriptor = `${property.propertyType || ''} ${property.subType || ''} ${property.assetClass || ''} ${property.serviceModel || ''}`.toLowerCase();
  return descriptor.includes('mosque') || descriptor.includes('masjid') || descriptor.includes('religious_facility') || descriptor.includes('mosque_fm');
};

const assetClassFor = (property: PropertyData, isMosque: boolean) => {
  if (isMosque) return 'mosque_fm';
  const assetClassId = resolveAssetClassIdForPropertyType(property.propertyType, property.assetGrade);
  if (!assetClassId) {
    throw new Error(`Unsupported property type '${property.propertyType || '(blank)'}'. Select a configured Asset Profile type before requesting a quote.`);
  }
  return assetClassId;
};

export const ownerPortfolioQuoteInputForProperty = (
  property: PropertyData,
  selectedAddOns: string[],
): QuoteInput => {
  const mosqueProfile = property.mosqueProfile || {};
  const isMosque = isMosqueAsset(property);
  const assetClassId = assetClassFor(property, isMosque);
  const beds = BED_PRICED_TYPES.has(property.propertyType)
    ? Number(property.beds || property.units || property.rooms || property.bedrooms || 0)
    : Number(property.beds || 0);

  return {
    assetClassId,
    emirate: emirateMap[property.emirate] || property.emirate || '',
    zone: property.zone || 'B',
    contractType: property.strategy === 'pm_only' || property.strategy === 'rent'
      ? 'PM_ONLY'
      : property.strategy === 'fm_only' || property.strategy === 'fm'
        ? 'FM_ONLY'
        : 'BOTH',
    sqft: isMosque ? Number(mosqueProfile.grossFloorAreaSqft) || property.sqft : property.sqft,
    units: isMosque ? Number(mosqueProfile.maxWorshipperCapacity) || property.rooms || property.units : property.units,
    beds,
    annualRent: property.annualRent,
    annualRevenue: property.annualRevenue,
    propertyAge: isMosque ? Number(mosqueProfile.propertyAgeYears) || property.age : property.age,
    floors: property.floors,
    lifts: property.lifts,
    hasPool: property.pool,
    hasGym: property.gym,
    hasCentralHVAC: isMosque ? true : property.hvac,
    hasDistrictCooling: property.districtCooling,
    hasCivilDefenseSystem: property.fireAlarm || property.firePump,
    hasSiraCctv: isMosque ? Boolean(property.sira || mosqueProfile.cctvInstalled || Number(mosqueProfile.cctvCameraCount) > 0) : property.sira,
    hasGenerator: property.gen,
    hasBmu: property.bmu,
    addOns: selectedAddOns,
    slaTier: property.slaTier || (isMosque ? 'premium' : 'standard'),
    paymentPlan: property.paymentPlan || 'annual',
    hasWaterTank: property.tank,
    hvacCount: isMosque ? Number(mosqueProfile.hvacUnitsCount || property.hvacCount || 0) : property.hvacCount,
    offices: property.offices,
    shops: property.shops,
  };
};

export const ownerPortfolioQuoteRequest = (properties: PropertyData[], selectedAddOns: string[]) => ({
  properties: properties.map((property) => ({
    id: property.id,
    input: ownerPortfolioQuoteInputForProperty(property, selectedAddOns),
  })),
});
