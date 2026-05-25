export type OwnerAssetCategory =
  | 'villa'
  | 'apartment'
  | 'residential_building'
  | 'tower'
  | 'government_majlis'
  | 'mosque'
  | 'hotel'
  | 'school'
  | 'hospital'
  | 'mall_retail'
  | 'office_commercial'
  | 'warehouse_industrial'
  | 'land_plot'
  | 'mixed_use'
  | 'generic';

export interface OwnerAssetFieldTemplate {
  label: string;
  keys: string[];
}

export interface OwnerAssetTemplate {
  category: OwnerAssetCategory;
  title: string;
  fields: OwnerAssetFieldTemplate[];
}

const normalize = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

export const OWNER_FACING_PENDING_VALUES = new Set([
  'Pending survey',
  'Pending setup',
  'Pending readiness check',
  'Pending PM schedule',
]);

export function isOwnerFacingPendingValue(value: unknown) {
  return OWNER_FACING_PENDING_VALUES.has(String(value || '').trim());
}

export function getAssetTypeLabel(asset: any) {
  return String(asset?.propertyType || asset?.assetType || asset?.type || asset?.category || asset?.sector || 'Property').trim();
}

export function detectOwnerAssetCategory(asset: any): OwnerAssetCategory {
  const type = normalize(getAssetTypeLabel(asset));
  const name = normalize(asset?.propertyName || asset?.name || asset?.address);
  const combined = `${type}_${name}`;

  if (combined.includes('mosque') || combined.includes('masjid') || combined.includes('religious_facility')) return 'mosque';
  if (combined.includes('mixed')) return 'mixed_use';
  if (combined.includes('government_majlis') || combined.includes('majlis') || combined.includes('majils')) return 'government_majlis';
  if (combined.includes('hotel') || combined.includes('resort')) return 'hotel';
  if (combined.includes('school') || combined.includes('nursery') || combined.includes('university')) return 'school';
  if (combined.includes('hospital') || combined.includes('clinic') || combined.includes('healthcare')) return 'hospital';
  if (combined.includes('mall') || combined.includes('retail') || combined.includes('shop')) return 'mall_retail';
  if (combined.includes('office') || combined.includes('commercial')) return 'office_commercial';
  if (combined.includes('warehouse') || combined.includes('industrial') || combined.includes('factory')) return 'warehouse_industrial';
  if (combined.includes('land') || combined.includes('plot')) return 'land_plot';
  if (combined.includes('tower') || combined.includes('skyscraper') || combined.includes('high_rise') || combined.includes('highrise')) return 'tower';
  if (combined.includes('residential_building') || combined.includes('building')) return 'residential_building';
  if (combined.includes('apartment') || combined.includes('flat')) return 'apartment';
  if (combined.includes('villa')) return 'villa';
  return 'generic';
}

const templates: Record<OwnerAssetCategory, OwnerAssetTemplate> = {
  villa: {
    category: 'villa',
    title: 'Villa Intelligence',
    fields: [
      { label: 'Bedrooms', keys: ['bedrooms', 'bedroomCount'] },
      { label: 'Rooms', keys: ['rooms', 'roomCount', 'numberOfRooms'] },
      { label: 'Bathrooms', keys: ['bathrooms', 'bathroomCount'] },
      { label: 'Kitchens', keys: ['kitchens', 'kitchenCount'] },
      { label: 'Majlis', keys: ['majlis', 'majlisCount'] },
      { label: 'Pool', keys: ['pool', 'hasPool'] },
      { label: 'Garden', keys: ['garden', 'hasGarden'] },
      { label: 'Parking', keys: ['parking', 'parkingSpaces'] },
      { label: 'Area', keys: ['area', 'areaSqFt', 'builtUpArea', 'plotArea', 'sizeSqft', 'sqft'] },
      { label: 'Maintenance', keys: ['maintenanceStatus', 'maintenanceReadiness'] },
    ],
  },
  apartment: {
    category: 'apartment',
    title: 'Apartment Intelligence',
    fields: [
      { label: 'Bedrooms', keys: ['bedrooms', 'bedroomCount'] },
      { label: 'Rooms', keys: ['rooms', 'roomCount'] },
      { label: 'Bathrooms', keys: ['bathrooms', 'bathroomCount'] },
      { label: 'Parking', keys: ['parking', 'parkingSpaces'] },
      { label: 'Floor', keys: ['floor', 'floorNumber'] },
      { label: 'Area', keys: ['area', 'areaSqFt', 'sizeSqft', 'sqft'] },
      { label: 'Maintenance', keys: ['maintenanceStatus', 'maintenanceReadiness'] },
    ],
  },
  residential_building: {
    category: 'residential_building',
    title: 'Residential Building Intelligence',
    fields: [
      { label: 'Floors', keys: ['floors', 'numberOfFloors'] },
      { label: 'Units', keys: ['units', 'numberOfUnits', 'totalUnits', 'unitsCount'] },
      { label: 'Lifts', keys: ['lifts', 'liftCount', 'elevators'] },
      { label: 'Parking', keys: ['parking', 'parkingSpaces'] },
      { label: 'Occupancy', keys: ['occupancy', 'occupancyRate'] },
      { label: 'Service Charge', keys: ['serviceCharge', 'serviceChargeRate'] },
      { label: 'Inspections', keys: ['inspectionStatus', 'inspectionReadiness'] },
    ],
  },
  tower: {
    category: 'tower',
    title: 'Tower / High-rise Intelligence',
    fields: [
      { label: 'Floors', keys: ['floors', 'numberOfFloors'] },
      { label: 'Units', keys: ['units', 'numberOfUnits', 'totalUnits', 'unitsCount'] },
      { label: 'Lifts', keys: ['lifts', 'liftCount', 'elevators'] },
      { label: 'Fire Systems', keys: ['fireSystems', 'fireSystemStatus'] },
      { label: 'BMS', keys: ['bms', 'bmsStatus'] },
      { label: 'MEP', keys: ['mep', 'mepStatus', 'mepReadiness'] },
      { label: 'Occupancy', keys: ['occupancy', 'occupancyRate'] },
      { label: 'Service Charge', keys: ['serviceCharge', 'serviceChargeRate'] },
      { label: 'SLA', keys: ['sla', 'slaTier'] },
      { label: 'Inspections', keys: ['inspectionStatus', 'inspectionReadiness'] },
    ],
  },
  government_majlis: {
    category: 'government_majlis',
    title: 'Government Majlis Intelligence',
    fields: [
      { label: 'Halls', keys: ['majlisProfile.halls', 'halls', 'hallCount', 'numberOfHalls'] },
      { label: 'Rooms', keys: ['majlisProfile.rooms', 'rooms', 'roomCount', 'numberOfRooms', 'units', 'totalUnits', 'numberOfUnits'] },
      { label: 'VIP Rooms', keys: ['majlisProfile.vipRooms', 'vipRooms'] },
      { label: 'Guest Rooms', keys: ['majlisProfile.guestRooms', 'guestRooms'] },
      { label: 'Prayer Rooms', keys: ['majlisProfile.prayerRooms', 'prayerRooms'] },
      { label: 'Kitchens', keys: ['majlisProfile.kitchens', 'kitchens'] },
      { label: 'Washrooms', keys: ['majlisProfile.washrooms', 'washrooms'] },
      { label: 'Guest Capacity', keys: ['majlisProfile.majlisCapacity', 'guestCapacity', 'capacity', 'majlisCapacity'] },
      { label: 'Parking', keys: ['majlisProfile.parkingSpaces', 'parkingSpaces', 'parking'] },
      { label: 'Protocol', keys: ['majlisProfile.protocolReadiness', 'protocolReadiness'] },
      { label: 'Booking', keys: ['majlisProfile.bookingReadiness', 'bookingReadiness'] },
      { label: 'Preventive Maint.', keys: ['majlisProfile.preventiveMaintenanceReady', 'preventiveMaintenanceReady', 'maintenanceReadiness'] },
    ],
  },
  mosque: {
    category: 'mosque',
    title: 'Mosque / Masjid Intelligence',
    fields: [
      { label: 'Authority', keys: ['mosqueProfile.regulatoryAuthority', 'regulatoryAuthority'] },
      { label: 'Service Scope', keys: ['mosqueProfile.serviceScope', 'serviceScope'] },
      { label: 'Worshipper Capacity', keys: ['mosqueProfile.maxWorshipperCapacity', 'capacity', 'rooms'] },
      { label: 'Ramadan Peak', keys: ['mosqueProfile.ramadanPeakCapacity', 'ramadanPeakCapacity'] },
      { label: 'Wudu Areas', keys: ['mosqueProfile.wuduAreasCount', 'wuduAreasCount', 'units'] },
      { label: 'Prayer-Time Rule', keys: ['mosqueProfile.complianceRules.noMaintenanceDuringPrayerTimes'] },
      { label: 'Daily Wudu Cycles', keys: ['mosqueProfile.complianceRules.wuduCleaningAfterEveryPrayer'] },
      { label: 'Carpet Area', keys: ['mosqueProfile.carpetAreaSqm', 'carpetAreaSqm'] },
      { label: 'Marble Area', keys: ['mosqueProfile.marbleAreaSqm', 'marbleAreaSqm'] },
      { label: 'Chandeliers', keys: ['mosqueProfile.chandeliersCount', 'chandeliersCount'] },
      { label: 'HVAC Units', keys: ['mosqueProfile.hvacUnitsCount', 'hvacUnitsCount', 'hvacCount'] },
      { label: 'PA System', keys: ['mosqueProfile.paSystemInstalled', 'paSystemInstalled'] },
      { label: 'Ramadan Readiness', keys: ['mosqueProfile.complianceRules.ramadanSurgePlanRequired'] },
      { label: 'Contract Structure', keys: ['mosqueProfile.preferredContractStructure', 'preferredContractStructure'] },
    ],
  },
  hotel: {
    category: 'hotel',
    title: 'Hotel / Resort Intelligence',
    fields: [
      { label: 'Rooms / Keys', keys: ['rooms', 'keys', 'hotelKeys', 'roomKeys'] },
      { label: 'Suites', keys: ['suites', 'suiteCount'] },
      { label: 'Occupancy', keys: ['occupancy', 'occupancyRate'] },
      { label: 'F&B Outlets', keys: ['fbOutlets', 'fAndBOutlets', 'restaurants'] },
      { label: 'Banquet Halls', keys: ['banquetHalls', 'halls'] },
      { label: 'Permits', keys: ['permitStatus', 'permits'] },
      { label: 'Maintenance', keys: ['maintenanceStatus', 'maintenanceReadiness'] },
    ],
  },
  school: {
    category: 'school',
    title: 'Education Asset Intelligence',
    fields: [
      { label: 'Classrooms', keys: ['classrooms', 'classroomCount'] },
      { label: 'Labs', keys: ['labs', 'laboratories'] },
      { label: 'Halls', keys: ['halls', 'auditoriums'] },
      { label: 'Student Capacity', keys: ['studentCapacity', 'capacity'] },
      { label: 'Buses', keys: ['buses', 'busCount'] },
      { label: 'Safety Permits', keys: ['safetyPermits', 'permitStatus'] },
      { label: 'Maintenance', keys: ['maintenanceStatus', 'maintenanceReadiness'] },
    ],
  },
  hospital: {
    category: 'hospital',
    title: 'Healthcare Asset Intelligence',
    fields: [
      { label: 'Beds', keys: ['beds', 'bedCount'] },
      { label: 'ICU Beds', keys: ['icuBeds'] },
      { label: 'Operating Rooms', keys: ['operatingRooms', 'operationRooms', 'orCount'] },
      { label: 'Clinics', keys: ['clinics', 'clinicCount'] },
      { label: 'Labs', keys: ['labs', 'laboratories'] },
      { label: 'Medical Gas', keys: ['medicalGasReadiness', 'medicalGasStatus'] },
      { label: 'Electrical', keys: ['electricalReadiness', 'electricalStatus'] },
      { label: 'Permits', keys: ['permitStatus', 'permits'] },
      { label: 'Safety', keys: ['safetyStatus', 'safetyReadiness'] },
      { label: 'Equipment Uptime', keys: ['equipmentUptime', 'equipmentStatus'] },
    ],
  },
  mall_retail: {
    category: 'mall_retail',
    title: 'Mall / Retail Intelligence',
    fields: [
      { label: 'Shops', keys: ['shops', 'shopCount', 'retailUnits'] },
      { label: 'Anchor Tenants', keys: ['anchorTenants'] },
      { label: 'Occupancy', keys: ['occupancy', 'occupancyRate'] },
      { label: 'Footfall', keys: ['footfall', 'dailyFootfall'] },
      { label: 'Parking', keys: ['parking', 'parkingSpaces'] },
      { label: 'Escalators', keys: ['escalators', 'escalatorCount'] },
      { label: 'Leases', keys: ['leases', 'leaseCount'] },
      { label: 'Service Charge', keys: ['serviceCharge', 'serviceChargeRate'] },
    ],
  },
  office_commercial: {
    category: 'office_commercial',
    title: 'Office / Commercial Intelligence',
    fields: [
      { label: 'Offices', keys: ['offices', 'officeCount', 'officeUnits'] },
      { label: 'Tenants', keys: ['tenants', 'tenantCount'] },
      { label: 'Occupancy', keys: ['occupancy', 'occupancyRate'] },
      { label: 'Parking', keys: ['parking', 'parkingSpaces'] },
      { label: 'Meeting Rooms', keys: ['meetingRooms'] },
      { label: 'Rent / Lease', keys: ['rent', 'leaseValue', 'annualRent'] },
    ],
  },
  warehouse_industrial: {
    category: 'warehouse_industrial',
    title: 'Warehouse / Industrial Intelligence',
    fields: [
      { label: 'Area', keys: ['area', 'areaSqFt', 'builtUpArea', 'warehouseArea', 'sizeSqft', 'sqft'] },
      { label: 'Loading Bays', keys: ['loadingBays', 'dockDoors'] },
      { label: 'Power Load', keys: ['powerLoad', 'electricalLoad'] },
      { label: 'Storage Type', keys: ['storageType'] },
      { label: 'Fire Rating', keys: ['fireRating', 'fireSystemStatus'] },
      { label: 'Permits', keys: ['permitStatus', 'permits'] },
      { label: 'Maintenance', keys: ['maintenanceStatus', 'maintenanceReadiness'] },
    ],
  },
  land_plot: {
    category: 'land_plot',
    title: 'Land / Plot Intelligence',
    fields: [
      { label: 'Plot Area', keys: ['plotArea', 'landArea', 'area', 'areaSqFt', 'sizeSqft', 'sqft'] },
      { label: 'Zoning', keys: ['zoning', 'zoneType'] },
      { label: 'Design Approval', keys: ['designApproval', 'designApprovalStatus'] },
      { label: 'Permit Readiness', keys: ['permitReadiness', 'permitStatus'] },
      { label: 'Utility Readiness', keys: ['utilityReadiness', 'utilitiesStatus'] },
    ],
  },
  mixed_use: {
    category: 'mixed_use',
    title: 'Mixed-use Intelligence',
    fields: [
      { label: 'Residential Units', keys: ['residentialUnits'] },
      { label: 'Retail Units', keys: ['retailUnits'] },
      { label: 'Office Units', keys: ['officeUnits'] },
      { label: 'Hotel Keys', keys: ['hotelKeys', 'keys'] },
      { label: 'Shared MEP', keys: ['sharedMep', 'mepStatus'] },
      { label: 'Service Charge', keys: ['serviceCharge', 'serviceChargeRate'] },
      { label: 'Occupancy by Section', keys: ['occupancyBySection', 'sectionOccupancy'] },
    ],
  },
  generic: {
    category: 'generic',
    title: 'Asset Intelligence',
    fields: [
      { label: 'Units', keys: ['units', 'numberOfUnits', 'totalUnits', 'unitsCount'] },
      { label: 'Floors', keys: ['floors', 'numberOfFloors'] },
      { label: 'Rooms', keys: ['rooms', 'roomCount'] },
      { label: 'Halls', keys: ['halls', 'hallCount'] },
      { label: 'Parking', keys: ['parking', 'parkingSpaces'] },
      { label: 'Maintenance', keys: ['maintenanceStatus', 'maintenanceReadiness'] },
    ],
  },
};

export function getOwnerAssetTemplate(asset: any): OwnerAssetTemplate {
  return templates[detectOwnerAssetCategory(asset)] || templates.generic;
}

export function getNestedValue(source: any, path: string) {
  return path.split('.').reduce((current, segment) => (current == null ? undefined : current[segment]), source);
}

function professionalFallback(asset: any, label: string) {
  const category = detectOwnerAssetCategory(asset);
  if (category === 'mosque') {
    const lowerLabel = normalize(label);
    if (['authority', 'service_scope', 'contract_structure'].includes(lowerLabel)) return 'Pending compliance setup';
    if (['worshipper_capacity', 'ramadan_peak', 'wudu_areas', 'carpet_area', 'marble_area', 'chandeliers', 'hvac_units'].includes(lowerLabel)) return 'Pending mosque survey';
    if (['prayer_time_rule', 'daily_wudu_cycles', 'ramadan_readiness'].includes(lowerLabel)) return 'Required';
    return 'Pending mosque profile';
  }

  if (category !== 'government_majlis') return 'Pending setup';

  const lowerLabel = normalize(label);
  if (lowerLabel === 'halls') return '1';
  if (lowerLabel === 'rooms') {
    const fallbackRooms = getNestedValue(asset, 'units') || getNestedValue(asset, 'totalUnits') || getNestedValue(asset, 'numberOfUnits');
    return fallbackRooms !== undefined && fallbackRooms !== null && fallbackRooms !== '' ? String(fallbackRooms) : 'Pending survey';
  }
  if (['vip_rooms', 'guest_rooms', 'prayer_rooms', 'kitchens', 'washrooms', 'guest_capacity', 'parking'].includes(lowerLabel)) return 'Pending survey';
  if (lowerLabel === 'protocol') return 'Pending readiness check';
  if (lowerLabel === 'booking') return 'Pending booking setup';
  if (lowerLabel === 'preventive_maint') return 'Pending PM schedule';
  return 'Pending setup';
}

export function getFirstAssetValue(asset: any, keys: string[], fallback = 'Pending setup', label = '') {
  for (const key of keys) {
    const value = getNestedValue(asset, key);
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (Array.isArray(value)) return value.length ? value.join(', ') : professionalFallback(asset, label);
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }
  }
  return label ? professionalFallback(asset, label) : fallback;
}

export function isFakeOwnerAsset(asset: any) {
  const name = String(asset?.propertyName || asset?.name || asset?.address || '').trim().toLowerCase();
  const units = Number(asset?.units || asset?.numberOfUnits || asset?.totalUnits || asset?.unitsCount || 0);
  const floors = Number(asset?.floors || asset?.numberOfFloors || 0);
  const rooms = Number(asset?.rooms || asset?.roomCount || asset?.numberOfRooms || asset?.majlisRooms || asset?.majlisProfile?.rooms || 0);
  const halls = Number(asset?.halls || asset?.hallCount || asset?.numberOfHalls || asset?.majlisHalls || asset?.majlisProfile?.halls || 0);
  return (!name || name === 'new asset' || name === 'property') && units === 0 && floors === 0 && rooms === 0 && halls === 0;
}
