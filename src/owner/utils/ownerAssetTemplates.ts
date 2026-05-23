export type OwnerAssetCategory =
  | 'villa'
  | 'apartment'
  | 'residential_building'
  | 'tower'
  | 'government_majlis'
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

export function getAssetTypeLabel(asset: any) {
  return String(asset?.propertyType || asset?.assetType || asset?.type || asset?.category || asset?.sector || 'Property').trim();
}

export function detectOwnerAssetCategory(asset: any): OwnerAssetCategory {
  const type = normalize(getAssetTypeLabel(asset));
  const name = normalize(asset?.propertyName || asset?.name || asset?.address);
  const combined = `${type}_${name}`;

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
      { label: 'Area', keys: ['area', 'builtUpArea', 'plotArea', 'sizeSqft'] },
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
      { label: 'Area', keys: ['area', 'sizeSqft'] },
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
      { label: 'Rooms', keys: ['majlisProfile.rooms', 'rooms', 'roomCount', 'numberOfRooms'] },
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
      { label: 'Area', keys: ['area', 'builtUpArea', 'warehouseArea', 'sizeSqft'] },
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
      { label: 'Plot Area', keys: ['plotArea', 'landArea', 'area', 'sizeSqft'] },
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

export function getFirstAssetValue(asset: any, keys: string[], fallback = 'Not provided') {
  for (const key of keys) {
    const value = getNestedValue(asset, key);
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (Array.isArray(value)) return value.length ? value.join(', ') : fallback;
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }
  }
  return fallback;
}

export function isFakeOwnerAsset(asset: any) {
  const name = String(asset?.propertyName || asset?.name || asset?.address || '').trim().toLowerCase();
  const units = Number(asset?.units || asset?.numberOfUnits || asset?.totalUnits || asset?.unitsCount || 0);
  const floors = Number(asset?.floors || asset?.numberOfFloors || 0);
  const rooms = Number(asset?.rooms || asset?.roomCount || asset?.numberOfRooms || asset?.majlisRooms || asset?.majlisProfile?.rooms || 0);
  const halls = Number(asset?.halls || asset?.hallCount || asset?.numberOfHalls || asset?.majlisHalls || asset?.majlisProfile?.halls || 0);
  return (!name || name === 'new asset' || name === 'property') && units === 0 && floors === 0 && rooms === 0 && halls === 0;
}
