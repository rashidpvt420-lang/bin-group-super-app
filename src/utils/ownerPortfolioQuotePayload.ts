import type { QuoteInput } from '@bin/shared';
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

const isMosqueAsset = (property: PropertyData) => {
  const descriptor = `${property.propertyType || ''} ${property.subType || ''} ${property.assetClass || ''} ${property.serviceModel || ''}`.toLowerCase();
  return descriptor.includes('mosque') || descriptor.includes('masjid') || descriptor.includes('religious_facility') || descriptor.includes('mosque_fm');
};

const assetClassFor = (property: PropertyData, isMosque: boolean) => {
  if (isMosque) return 'mosque_fm';
  if (property.propertyType === 'Villa') return property.assetGrade === 'Luxury' || property.assetGrade === 'Ultra-Luxury' ? 'villa-lux' : 'villa-std';
  if (property.propertyType === 'Building' || property.propertyType === 'Residential Building') return 'com-twr';
  if (property.propertyType === 'Commercial' || property.propertyType === 'Commercial Building') return 'off-sml';
  if (property.propertyType === 'Government Majlis' || property.propertyType?.toLowerCase() === 'majlis' || property.majlis) return 'government_majlis';
  if (property.propertyType === 'Hotel') return 'mid_scale_hotel';
  return 'apt-std';
};

export const ownerPortfolioQuoteInputForProperty = (
  property: PropertyData,
  selectedAddOns: string[],
): QuoteInput => {
  const mosqueProfile = property.mosqueProfile || {};
  const isMosque = isMosqueAsset(property);
  return {
    assetClassId: assetClassFor(property, isMosque),
    emirate: emirateMap[property.emirate] || 'dubai',
    zone: property.zone || 'B',
    contractType: property.strategy === 'pm_only' || property.strategy === 'rent'
      ? 'PM_ONLY'
      : property.strategy === 'fm_only' || property.strategy === 'fm'
        ? 'FM_ONLY'
        : 'BOTH',
    sqft: isMosque ? Number(mosqueProfile.grossFloorAreaSqft) || property.sqft : property.sqft,
    units: isMosque ? Number(mosqueProfile.maxWorshipperCapacity) || property.rooms || property.units : property.units,
    annualRent: property.annualRent,
    propertyAge: isMosque ? Number(mosqueProfile.propertyAgeYears) || property.age : property.age,
    floors: property.floors,
    lifts: property.lifts,
    hasPool: property.pool,
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
    hvacCount: property.hvacCount,
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
