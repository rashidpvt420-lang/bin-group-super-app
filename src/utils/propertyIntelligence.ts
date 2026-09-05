import type { PropertyData } from '../store/onboardingStore';

export type PropertyFactSource = 'owner' | 'document' | 'floor_plan_ai' | 'system_calculated' | 'bin_verified';

export interface SpaceDefinition {
  id: string;
  en: string;
  ar: string;
  group: 'room' | 'wet' | 'work' | 'service' | 'amenity' | 'outdoor' | 'special';
}

export interface SpaceInventoryItem {
  id: string;
  type: string;
  labelEn: string;
  labelAr: string;
  count: number;
  floor?: string;
  source?: PropertyFactSource;
  confidence?: number;
  verified?: boolean;
}

export interface PropertyIntelligenceSummary {
  totalDeclaredSpaces: number;
  totalRoomSpaces: number;
  totalWetAreas: number;
  totalWorkspaces: number;
  totalServiceSpaces: number;
  averageAreaPerFloorSqft: number | null;
  serviceAreaPerUnitSqft: number | null;
  declaredSpacesPer1000Sqft: number | null;
  ageBand: 'unknown' | 'new' | 'established' | 'mature' | 'aging';
  warnings: string[];
}

const S = (id: string, en: string, ar: string, group: SpaceDefinition['group']): SpaceDefinition => ({ id, en, ar, group });

const BEDROOM = S('bedroom', 'Bedroom', 'غرفة نوم', 'room');
const BATHROOM = S('bathroom', 'Bathroom / WC', 'حمام / دورة مياه', 'wet');
const KITCHEN = S('kitchen', 'Kitchen', 'مطبخ', 'wet');
const PANTRY = S('pantry', 'Pantry', 'مخزن مطبخ', 'wet');
const MAJLIS = S('majlis_hall', 'Majlis hall', 'قاعة مجلس', 'room');
const VIP_ROOM = S('vip_room', 'VIP room', 'غرفة كبار الزوار', 'room');
const GUEST_ROOM = S('guest_room', 'Guest room', 'غرفة ضيوف', 'room');
const SUITE = S('suite', 'Suite', 'جناح', 'room');
const LIVING = S('living_room', 'Living room', 'غرفة معيشة', 'room');
const DINING = S('dining_room', 'Dining room', 'غرفة طعام', 'room');
const OFFICE = S('office', 'Office', 'مكتب', 'work');
const OPEN_OFFICE = S('open_office', 'Open office area', 'منطقة مكاتب مفتوحة', 'work');
const MEETING = S('meeting_room', 'Meeting room', 'غرفة اجتماعات', 'work');
const CONFERENCE = S('conference_room', 'Conference room', 'قاعة مؤتمرات', 'work');
const RECEPTION = S('reception', 'Reception', 'استقبال', 'work');
const LOBBY = S('lobby', 'Lobby', 'ردهة', 'amenity');
const STORAGE = S('storage', 'Storage room', 'غرفة تخزين', 'service');
const LAUNDRY = S('laundry', 'Laundry', 'غرفة غسيل', 'service');
const MAID = S('maid_room', 'Maid / service room', 'غرفة خادمة / خدمة', 'service');
const DRIVER = S('driver_room', 'Driver room', 'غرفة سائق', 'service');
const SECURITY = S('security_room', 'Security room', 'غرفة أمن', 'service');
const SERVER = S('server_room', 'Server / IT room', 'غرفة خوادم / تقنية', 'service');
const ARCHIVE = S('archive_room', 'Archive room', 'غرفة أرشيف', 'service');
const ELECTRICAL = S('electrical_room', 'Electrical room', 'غرفة كهرباء', 'service');
const MECHANICAL = S('mechanical_room', 'Mechanical room', 'غرفة ميكانيكية', 'service');
const PUMP = S('pump_room', 'Pump room', 'غرفة مضخات', 'service');
const PLANT = S('plant_room', 'Plant room', 'غرفة خدمات', 'service');
const PARKING = S('parking_area', 'Parking area', 'منطقة مواقف', 'outdoor');
const GARDEN = S('garden', 'Garden / landscape area', 'حديقة / تنسيق خارجي', 'outdoor');
const POOL = S('pool', 'Swimming pool', 'مسبح', 'amenity');
const GYM = S('gym', 'Gym / fitness area', 'صالة رياضية', 'amenity');
const SPA = S('spa', 'Spa / wellness area', 'سبا / عافية', 'amenity');
const PRAYER = S('prayer_room', 'Prayer room / hall', 'غرفة / قاعة صلاة', 'special');
const WUDU = S('wudu_area', 'Wudu area', 'منطقة وضوء', 'wet');
const SHOP = S('shop', 'Shop / retail unit', 'محل / وحدة تجزئة', 'work');
const COMMON = S('common_area', 'Common area', 'منطقة مشتركة', 'amenity');
const RESTAURANT = S('restaurant', 'Restaurant / dining outlet', 'مطعم / منفذ طعام', 'amenity');
const BALLROOM = S('ballroom', 'Ballroom / event hall', 'قاعة حفلات / فعاليات', 'special');
const HOUSEKEEPING = S('housekeeping_room', 'Housekeeping room', 'غرفة تدبير منزلي', 'service');
const COLD_ROOM = S('cold_room', 'Cold / freezer room', 'غرفة تبريد / تجميد', 'service');
const PATIENT = S('patient_room', 'Patient room', 'غرفة مريض', 'room');
const CONSULT = S('consultation_room', 'Consultation room', 'غرفة استشارة', 'work');
const TREATMENT = S('treatment_room', 'Treatment room', 'غرفة علاج', 'work');
const OPERATING = S('operating_room', 'Operating / procedure room', 'غرفة عمليات / إجراءات', 'special');
const LAB = S('laboratory', 'Laboratory', 'مختبر', 'special');
const PHARMACY = S('pharmacy', 'Pharmacy', 'صيدلية', 'special');
const CLASSROOM = S('classroom', 'Classroom', 'فصل دراسي', 'work');
const LIBRARY = S('library', 'Library', 'مكتبة', 'amenity');
const CAFETERIA = S('cafeteria', 'Cafeteria', 'كافتيريا', 'amenity');
const WAREHOUSE = S('warehouse_zone', 'Warehouse / storage zone', 'منطقة مستودع / تخزين', 'service');
const LOADING = S('loading_bay', 'Loading bay', 'منطقة تحميل', 'service');
const WORKSHOP = S('workshop', 'Workshop', 'ورشة', 'work');
const DORM = S('dorm_room', 'Dormitory room', 'غرفة سكن', 'room');
const LOCKER = S('locker_room', 'Locker / changing room', 'غرفة تبديل / خزائن', 'service');
const CONTROL = S('control_room', 'Control room', 'غرفة تحكم', 'service');
const STAGE = S('stage', 'Stage / performance area', 'منصة / منطقة عرض', 'special');
const BACK_OF_HOUSE = S('back_of_house', 'Back-of-house area', 'منطقة خدمات خلفية', 'service');
const STABLE = S('stable', 'Stable / animal shelter', 'إسطبل / مأوى حيوانات', 'special');
const GUARD = S('guard_house', 'Guard house', 'غرفة حارس', 'service');

const RESIDENTIAL = [BEDROOM, BATHROOM, KITCHEN, MAJLIS, LIVING, DINING, MAID, DRIVER, LAUNDRY, STORAGE, PARKING, GARDEN, POOL];
const OFFICE_SET = [OFFICE, OPEN_OFFICE, MEETING, CONFERENCE, RECEPTION, PANTRY, BATHROOM, SERVER, ARCHIVE, STORAGE, PARKING];
const BUILDING_SERVICE = [LOBBY, SECURITY, ELECTRICAL, MECHANICAL, PUMP, PLANT, PARKING, COMMON];
const HOSPITALITY = [GUEST_ROOM, SUITE, BATHROOM, RECEPTION, LOBBY, RESTAURANT, KITCHEN, PANTRY, OFFICE, MEETING, BALLROOM, GYM, SPA, LAUNDRY, HOUSEKEEPING, STORAGE, SECURITY, PLANT, PARKING];
const HEALTHCARE = [PATIENT, CONSULT, TREATMENT, OPERATING, LAB, PHARMACY, RECEPTION, OFFICE, BATHROOM, STORAGE, SERVER, PLANT, PARKING];
const EDUCATION = [CLASSROOM, OFFICE, MEETING, RECEPTION, LAB, LIBRARY, CAFETERIA, KITCHEN, BATHROOM, PRAYER, STORAGE, SECURITY, PARKING];
const INDUSTRIAL = [WAREHOUSE, LOADING, WORKSHOP, OFFICE, RECEPTION, BATHROOM, STORAGE, SECURITY, ELECTRICAL, MECHANICAL, PLANT, PARKING];
const ACCOMMODATION = [DORM, BEDROOM, BATHROOM, KITCHEN, DINING, LAUNDRY, PRAYER, OFFICE, STORAGE, SECURITY, PARKING];
const MAJLIS_SET = [MAJLIS, VIP_ROOM, GUEST_ROOM, OFFICE, MEETING, RECEPTION, KITCHEN, PANTRY, BATHROOM, PRAYER, STORAGE, SECURITY, DRIVER, ELECTRICAL, MECHANICAL, PUMP, PARKING, GARDEN];
const MOSQUE_SET = [PRAYER, WUDU, BATHROOM, OFFICE, STORAGE, SECURITY, ELECTRICAL, MECHANICAL, PUMP, PARKING];
const RETAIL_SET = [SHOP, RECEPTION, COMMON, OFFICE, BATHROOM, STORAGE, SECURITY, ELECTRICAL, MECHANICAL, PARKING];
const EVENT_SET = [BALLROOM, STAGE, RECEPTION, LOBBY, VIP_ROOM, MEETING, OFFICE, KITCHEN, BATHROOM, LOCKER, CONTROL, BACK_OF_HOUSE, STORAGE, SECURITY, PARKING];
const ESTATE_SET = [BEDROOM, BATHROOM, KITCHEN, MAJLIS, GUEST_ROOM, STORAGE, WORKSHOP, STABLE, GUARD, PUMP, ELECTRICAL, PARKING, GARDEN];

export const PROPERTY_SPACE_CATALOG: Record<string, SpaceDefinition[]> = {
  Villa: RESIDENTIAL,
  Apartment: [BEDROOM, BATHROOM, KITCHEN, LIVING, DINING, MAID, LAUNDRY, STORAGE, PARKING],
  'Residential Building': [...RESIDENTIAL, ...BUILDING_SERVICE, OFFICE],
  'Commercial Building': [...OFFICE_SET, ...BUILDING_SERVICE, SHOP],
  Office: OFFICE_SET,
  'Retail Center': RETAIL_SET,
  Mall: [...RETAIL_SET, RESTAURANT, KITCHEN, FOOD_COURT_PLACEHOLDER()],
  Hotel: HOSPITALITY,
  Resort: [...HOSPITALITY, GARDEN, POOL],
  Hospital: HEALTHCARE,
  Clinic: [CONSULT, TREATMENT, LAB, PHARMACY, RECEPTION, OFFICE, BATHROOM, STORAGE, SERVER, PARKING],
  School: EDUCATION,
  Warehouse: INDUSTRIAL,
  'Industrial Property': INDUSTRIAL,
  'Labour Camp': ACCOMMODATION,
  'Staff Accommodation': ACCOMMODATION,
  'Government Property': [...OFFICE_SET, ...BUILDING_SERVICE, MEETING, CONFERENCE, PRAYER],
  'Government Majlis': MAJLIS_SET,
  'Private Majlis': MAJLIS_SET,
  'Mosque / Masjid': MOSQUE_SET,
  'Mixed-Use Tower': [...RESIDENTIAL, ...OFFICE_SET, ...RETAIL_SET, ...BUILDING_SERVICE],
  Skyscraper: [...OFFICE_SET, ...RETAIL_SET, ...BUILDING_SERVICE, GYM],
  Stadium: EVENT_SET,
  'Sports Complex': [...EVENT_SET, GYM, LOCKER, POOL],
  'Event Venue': EVENT_SET,
  'Farm / Estate': ESTATE_SET,
};

function FOOD_COURT_PLACEHOLDER(): SpaceDefinition {
  return S('food_court', 'Food court', 'ردهة طعام', 'amenity');
}

export const ALL_SELECTABLE_PROPERTY_TYPES = Object.keys(PROPERTY_SPACE_CATALOG);

export function getSuggestedSpaces(propertyType: string): SpaceDefinition[] {
  const seen = new Set<string>();
  return (PROPERTY_SPACE_CATALOG[propertyType] || []).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function inventoryOf(property: PropertyData): SpaceInventoryItem[] {
  return Array.isArray(property.spaceInventory)
    ? property.spaceInventory
      .filter((item: any) => item && Number(item.count) > 0)
      .map((item: any) => ({
        id: String(item.id || item.type || item.labelEn || 'space'),
        type: String(item.type || item.id || 'custom'),
        labelEn: String(item.labelEn || item.label || item.type || 'Space'),
        labelAr: String(item.labelAr || item.labelEn || item.label || item.type || 'مساحة'),
        count: Math.max(0, Math.round(Number(item.count) || 0)),
        floor: item.floor ? String(item.floor) : undefined,
        source: item.source,
        confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : undefined,
        verified: item.verified === true,
      }))
    : [];
}

function ageBand(age: number): PropertyIntelligenceSummary['ageBand'] {
  if (!(age > 0)) return 'unknown';
  if (age <= 5) return 'new';
  if (age <= 15) return 'established';
  if (age <= 30) return 'mature';
  return 'aging';
}

export function calculatePropertyIntelligence(property: PropertyData): PropertyIntelligenceSummary {
  const inventory = inventoryOf(property);
  const definitions = new Map(getSuggestedSpaces(property.propertyType).map((item) => [item.id, item]));
  const groupTotal = (group: SpaceDefinition['group']) => inventory.reduce((sum, item) => {
    const definition = definitions.get(item.type) || definitions.get(item.id);
    return sum + (definition?.group === group ? item.count : 0);
  }, 0);
  const totalDeclaredSpaces = inventory.reduce((sum, item) => sum + item.count, 0);
  const floors = Math.max(0, Number(property.floors) || 0);
  const sqft = Math.max(0, Number(property.sqft) || 0);
  const units = Math.max(0, Number(property.units) || 0);
  const warnings: string[] = [];

  if (property.propertyType && !getSuggestedSpaces(property.propertyType).length) warnings.push('No dynamic space catalog is configured for this asset type.');
  if (floors > 0 && sqft > 0 && sqft / floors < 100) warnings.push('Measured service area is unusually small for the declared floor count; verify the units and floor data.');
  if (totalDeclaredSpaces > 0 && sqft > 0 && sqft / totalDeclaredSpaces < 25) warnings.push('Declared space count is high relative to measured service area; review the floor plan or room counts.');
  if (property.propertyType === 'Hotel' && units > 0) {
    const declaredKeys = inventory.filter((item) => ['guest_room', 'suite'].includes(item.type)).reduce((sum, item) => sum + item.count, 0);
    if (declaredKeys > 0 && Math.abs(declaredKeys - units) > 1) warnings.push('Hotel room/suite inventory does not match the declared rooms/keys count.');
  }
  if (['Government Majlis', 'Private Majlis'].includes(property.propertyType) && totalDeclaredSpaces > 0 && !inventory.some((item) => item.type === 'majlis_hall')) {
    warnings.push('No Majlis hall is declared for the selected Majlis property type.');
  }

  return {
    totalDeclaredSpaces,
    totalRoomSpaces: groupTotal('room'),
    totalWetAreas: groupTotal('wet'),
    totalWorkspaces: groupTotal('work'),
    totalServiceSpaces: groupTotal('service'),
    averageAreaPerFloorSqft: floors > 0 && sqft > 0 ? Math.round((sqft / floors) * 10) / 10 : null,
    serviceAreaPerUnitSqft: units > 0 && sqft > 0 ? Math.round((sqft / units) * 10) / 10 : null,
    declaredSpacesPer1000Sqft: sqft > 0 ? Math.round((totalDeclaredSpaces / sqft) * 10000) / 10 : null,
    ageBand: ageBand(Math.max(0, Number(property.age) || 0)),
    warnings,
  };
}
