/**
 * Type-specific Owner onboarding details for all 27 asset classes.
 * Fields are informational unless marked as pricing drivers (units, floors, area, bedrooms)
 * or they sync to an existing engine input (lifts, offices, shops, beds, and system flags).
 * No new prices are invented here.
 */

export type AssetDetailFieldType = 'text' | 'number' | 'select' | 'boolean' | 'date';

export type AssetDetailValue = string | number | boolean;

export interface AssetDetailSelectOption {
  value: string;
  en: string;
  ar: string;
}

export interface AssetDetailField {
  key: string;
  type: AssetDetailFieldType;
  labelEn: string;
  labelAr: string;
  helperEn?: string;
  helperAr?: string;
  options?: AssetDetailSelectOption[];
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Existing property / quote field this value should copy into when set. */
  syncTo?: string;
}

export interface AssetDetailGroup {
  id: string;
  titleEn: string;
  titleAr: string;
  fields: AssetDetailField[];
}

export const HIGH_RISE_PROPERTY_TYPES = [
  'Residential Building',
  'Commercial Building',
  'Mixed-Use Tower',
  'Skyscraper',
  'Office',
] as const;

/** Property types whose floors / lifts drive the existing complexity premium when left unknown. */
export const MULTI_STOREY_PROPERTY_TYPES = [
  'Residential Building',
  'Commercial Building',
  'Retail Center',
  'Mall',
  'Hotel',
  'Resort',
  'Hospital',
  'School',
  'Staff Accommodation',
  'Government Property',
  'Mixed-Use Tower',
  'Skyscraper',
] as const;

const YES_NO: AssetDetailSelectOption[] = [
  { value: 'no', en: 'No', ar: 'لا' },
  { value: 'yes', en: 'Yes', ar: 'نعم' },
];

const FACADE_OPTIONS: AssetDetailSelectOption[] = [
  { value: 'glass_curtain', en: 'Glass curtain wall', ar: 'جدار ستائري زجاجي' },
  { value: 'cladding', en: 'Cladding', ar: 'كسوة خارجية' },
  { value: 'concrete', en: 'Concrete', ar: 'خرسانة' },
  { value: 'mixed', en: 'Mixed', ar: 'متنوع' },
  { value: 'other', en: 'Other', ar: 'أخرى' },
];

const BEDROOM_OPTIONS: AssetDetailSelectOption[] = [
  { value: '0', en: 'Studio', ar: 'استوديو' },
  { value: '1', en: '1 bedroom', ar: 'غرفة نوم واحدة' },
  { value: '2', en: '2 bedrooms', ar: 'غرفتان' },
  { value: '3', en: '3 bedrooms', ar: '3 غرف' },
  { value: '4', en: '4 bedrooms or more', ar: '4 غرف أو أكثر' },
];

const text = (key: string, labelEn: string, labelAr: string, extra: Partial<AssetDetailField> = {}): AssetDetailField => ({
  key, type: 'text', labelEn, labelAr, maxLength: extra.maxLength ?? 200, ...extra,
});
const num = (key: string, labelEn: string, labelAr: string, extra: Partial<AssetDetailField> = {}): AssetDetailField => ({
  key, type: 'number', labelEn, labelAr, min: extra.min ?? 0, max: extra.max ?? 1_000_000, ...extra,
});
const bool = (key: string, labelEn: string, labelAr: string, extra: Partial<AssetDetailField> = {}): AssetDetailField => ({
  key, type: 'boolean', labelEn, labelAr, options: YES_NO, ...extra,
});
const sel = (key: string, labelEn: string, labelAr: string, options: AssetDetailSelectOption[], extra: Partial<AssetDetailField> = {}): AssetDetailField => ({
  key, type: 'select', labelEn, labelAr, options, maxLength: extra.maxLength ?? 80, ...extra,
});
const date = (key: string, labelEn: string, labelAr: string, extra: Partial<AssetDetailField> = {}): AssetDetailField => ({
  key, type: 'date', labelEn, labelAr, maxLength: extra.maxLength ?? 32, helperEn: extra.helperEn ?? 'Optional. YYYY-MM-DD if known.', helperAr: extra.helperAr ?? 'اختياري. صيغة YYYY-MM-DD إن كانت معروفة.', ...extra,
});

const group = (id: string, titleEn: string, titleAr: string, fields: AssetDetailField[]): AssetDetailGroup => ({
  id, titleEn, titleAr, fields,
});

const HIGH_RISE_CORE: AssetDetailGroup = group('highrise-core', 'Building envelope', 'غلاف المبنى', [
  text('buildingName', 'Building name', 'اسم المبنى'),
  num('towerBlockCount', 'Towers / blocks', 'عدد الأبراج / البلوكات', { max: 200 }),
  num('floorsAboveGround', 'Floors above ground', 'الطوابق فوق الأرض', { max: 300, syncTo: 'floors', helperEn: 'Used for the existing floors complexity factor when entered.', helperAr: 'يُستخدم في معامل تعقيد الطوابق الحالي عند إدخاله.' }),
  num('floorsBelowGround', 'Floors below ground', 'الطوابق تحت الأرض', { max: 50 }),
  num('unitsPerFloor', 'Units per floor', 'الوحدات في كل طابق', { max: 500 }),
  num('totalUnits', 'Total units', 'إجمالي الوحدات', { max: 100000, syncTo: 'units', helperEn: 'Used as the unit count when entered.', helperAr: 'يُستخدم كعدد الوحدات عند إدخاله.' }),
  num('passengerLifts', 'Passenger lifts', 'مصاعد الركاب', { max: 200 }),
  num('serviceLifts', 'Service lifts', 'مصاعد الخدمة', { max: 200, helperEn: 'Passenger and service lifts are added together for the existing lifts factor and lift contract.', helperAr: 'يُجمع مصاعد الركاب والخدمة لعامل المصاعد الحالي وعقد المصاعد.' }),
  num('parkingLevels', 'Parking levels', 'طوابق المواقف', { max: 100 }),
  num('parkingSpaces', 'Parking spaces', 'عدد مواقف السيارات', { max: 100000 }),
  sel('facadeType', 'Facade type', 'نوع الواجهة', FACADE_OPTIONS),
  bool('bmuFacadeAccess', 'BMU / facade access', 'وحدة تنظيف الواجهات / وصول الواجهة', { syncTo: 'bmu' }),
]);

const FIRE_LIFE_SAFETY: AssetDetailGroup = group('fire-life-safety', 'Fire and life safety', 'السلامة من الحريق والحياة', [
  date('civilDefenceCertificateExpiry', 'Civil defence certificate expiry', 'انتهاء شهادة الدفاع المدني'),
  bool('sprinklers', 'Sprinklers installed', 'مرشات الحريق مركبة'),
  bool('fireAlarmSystem', 'Fire alarm system', 'نظام إنذار الحريق', { syncTo: 'fireAlarm' }),
]);

const COOLING_WATER_POWER: AssetDetailGroup = group('cooling-water-power', 'Cooling, water and power', 'التبريد والمياه والطاقة', [
  bool('centralAcChiller', 'Central AC / chiller', 'تكييف مركزي / تشيллер', { syncTo: 'hvac' }),
  bool('districtCoolingService', 'District cooling', 'تبريد مركزي للمنطقة', { syncTo: 'districtCooling' }),
  bool('waterTanks', 'Water tanks', 'خزانات المياه', { syncTo: 'tank' }),
  bool('waterPumps', 'Water pumps', 'مضخات المياه', { syncTo: 'pumps' }),
  bool('generators', 'Generators', 'مولدات', { syncTo: 'gen' }),
  text('commonAreas', 'Common areas', 'المناطق المشتركة', { maxLength: 1000, helperEn: 'Optional list, for example lobby, gym, pool, prayer room.', helperAr: 'قائمة اختيارية، مثل اللوبي والنادي والمسبح وغرفة الصلاة.' }),
]);

const MANAGEMENT_PERMITS: AssetDetailGroup = group('management-permits', 'Management and permits', 'الإدارة والتصاريح', [
  text('buildingManagementName', 'Building management / FM contact', 'إدارة المبنى / جهة تشغيل المرافق'),
  text('oaContactName', 'Owners association contact name', 'اسم جهة تواصل جمعية الملاك'),
  text('oaContactPhone', 'Owners association phone', 'هاتف جمعية الملاك', { maxLength: 30 }),
  text('reraDldOrPermitNumber', 'RERA / DLD or emirate permit number', 'رقم تصريح ريرا / دائرة الأراضي أو الإمارة', { maxLength: 80, helperEn: 'Optional. Not a government certificate issued by BIN GROUP.', helperAr: 'اختياري. ليست شهادة حكومية تصدرها BIN GROUP.' }),
]);

const UNIT_MIX_RESIDENTIAL: AssetDetailGroup = group('unit-mix-residential', 'Unit mix', 'خليط الوحدات', [
  num('studios', 'Studios', 'استوديو', { max: 100000 }),
  num('oneBedUnits', '1-bedroom units', 'وحدات غرفة واحدة', { max: 100000 }),
  num('twoBedUnits', '2-bedroom units', 'وحدات غرفتين', { max: 100000 }),
  num('threeBedUnits', '3-bedroom units', 'وحدات 3 غرف', { max: 100000 }),
  num('fourBedUnits', '4-bedroom units', 'وحدات 4 غرف', { max: 100000 }),
  num('fiveBedUnits', '5-bedroom units or larger', 'وحدات 5 غرف أو أكبر', { max: 100000 }),
  num('retailUnits', 'Retail units', 'وحدات تجزئة', { max: 100000, syncTo: 'shops' }),
]);

const UNIT_MIX_COMMERCIAL: AssetDetailGroup = group('unit-mix-commercial', 'Occupancy mix', 'خليط الإشغال', [
  num('officeUnits', 'Office units', 'وحدات مكتبية', { max: 100000, syncTo: 'offices' }),
  num('retailUnits', 'Retail units', 'وحدات تجزئة', { max: 100000, syncTo: 'shops' }),
]);

const UNIT_MIX_MIXED: AssetDetailGroup = group('unit-mix-mixed', 'Unit mix', 'خليط الوحدات', [
  ...UNIT_MIX_RESIDENTIAL.fields,
  num('officeUnits', 'Office units', 'وحدات مكتبية', { max: 100000, syncTo: 'offices' }),
]);

const VILLA_DETAILS: AssetDetailGroup[] = [
  group('villa', 'Villa details', 'تفاصيل الفيلا', [
    text('buildingName', 'Villa / compound name', 'اسم الفيلا / المجمع'),
    text('plotNumber', 'Plot number', 'رقم القسيمة', { maxLength: 80 }),
    num('bedroomsCount', 'Bedrooms', 'غرف النوم', { max: 50, helperEn: 'Information only for villas. It does not change the villa rate.', helperAr: 'للمعلومات فقط للفلل. لا يغيّر سعر الفيلا.' }),
    num('bathroomsCount', 'Bathrooms', 'دورات المياه', { max: 50 }),
    num('majlisRooms', 'Majlis rooms', 'غرف المجلس', { max: 20 }),
    bool('privateGarden', 'Private garden', 'حديقة خاصة'),
    bool('privatePool', 'Private pool', 'مسبح خاص', { syncTo: 'pool' }),
    num('coveredParking', 'Covered parking spaces', 'مواقف مغطاة', { max: 50 }),
    bool('staffRoom', 'Staff room', 'غرفة عمال'),
    text('utilityAccount', 'Electricity / water account (optional)', 'حساب الكهرباء / المياه (اختياري)', { maxLength: 80 }),
  ]),
];

const APARTMENT_DETAILS: AssetDetailGroup[] = [
  group('apartment', 'Apartment details', 'تفاصيل الشقة', [
    sel('bedroomCount', 'Bedrooms', 'غرف النوم', BEDROOM_OPTIONS, {
      required: true,
      syncTo: 'bedrooms',
      helperEn: 'Required. This uses the existing bedroom factor: studio/1BR 1.00x, 2BR 1.25x, 3BR 1.50x, 4BR+ 1.75x. A blank count is not silently priced as 2BR on this form.',
      helperAr: 'مطلوب. يُستخدم معامل غرف النوم الحالي: استوديو/غرفة 1.00×، غرفتان 1.25×، 3 غرف 1.50×، 4 فأكثر 1.75×. لا يُسعَّر العدد الفارغ هنا كغرفتين دون تنبيه.',
    }),
    num('bathroomsCount', 'Bathrooms', 'دورات المياه', { max: 20 }),
    num('floorNumber', 'Floor number', 'رقم الطابق', { max: 300 }),
    text('unitNumber', 'Unit number', 'رقم الوحدة', { maxLength: 40 }),
    num('parkingSpaces', 'Parking spaces', 'مواقف السيارات', { max: 50 }),
    bool('balcony', 'Balcony', 'شرفة'),
    text('communityName', 'Community / building name', 'اسم المجتمع / المبنى'),
  ]),
];

const GYM_EXTRAS: AssetDetailGroup[] = [
  group('gym-extras', 'Additional gym details', 'تفاصيل إضافية للنادي', [
    text('buildingName', 'Centre name', 'اسم المركز'),
    text('reraDldOrPermitNumber', 'Trade or sports establishment number', 'رقم الرخصة أو المنشأة الرياضية', { maxLength: 80 }),
    num('parkingSpaces', 'Parking spaces', 'مواقف السيارات', { max: 5000 }),
  ]),
];

const RETAIL_DETAILS: AssetDetailGroup[] = [
  group('retail', 'Retail details', 'تفاصيل التجزئة', [
    text('buildingName', 'Centre name', 'اسم المركز'),
    num('floorsAboveGround', 'Floors', 'الطوابق', { max: 100, syncTo: 'floors' }),
    num('retailUnits', 'Shop units', 'وحدات المحلات', { max: 20000, syncTo: 'shops' }),
    num('anchorTenants', 'Anchor tenants', 'المستأجرون الرئيسيون', { max: 200 }),
    bool('foodCourt', 'Food court', 'منطقة مطاعم'),
    bool('cinema', 'Cinema', 'سينما'),
    num('parkingSpaces', 'Parking spaces', 'مواقف السيارات', { max: 100000 }),
    num('loadingDocks', 'Loading docks', 'منصات التحميل', { max: 200 }),
    num('passengerLifts', 'Passenger lifts', 'مصاعد الركاب', { max: 200 }),
    num('serviceLifts', 'Service lifts', 'مصاعد الخدمة', { max: 200 }),
    text('tradingHours', 'Trading hours', 'ساعات العمل', { maxLength: 120 }),
  ]),
  FIRE_LIFE_SAFETY,
  COOLING_WATER_POWER,
  MANAGEMENT_PERMITS,
];

const HOTEL_DETAILS: AssetDetailGroup[] = [
  group('hotel', 'Rooms and operations', 'الغرف والتشغيل', [
    text('buildingName', 'Hotel / resort name', 'اسم الفندق / المنتجع'),
    num('hotelKeys', 'Rooms / keys', 'الغرف / المفاتيح', { max: 10000, syncTo: 'units', helperEn: 'Collected for operations. Measured service area still drives the FM price.', helperAr: 'تُجمع للتشغيل. مساحة الخدمة المقاسة تبقى عامل سعر إدارة المرافق.' }),
    num('floorsAboveGround', 'Floors', 'الطوابق', { max: 300, syncTo: 'floors' }),
    num('passengerLifts', 'Passenger lifts', 'مصاعد الركاب', { max: 200 }),
    num('serviceLifts', 'Service lifts', 'مصاعد الخدمة', { max: 200 }),
    num('fbOutlets', 'F&B outlets', 'منافذ الأغذية والمشروبات', { max: 200 }),
    num('meetingRooms', 'Meeting / banquet rooms', 'قاعات الاجتماعات / الاحتفالات', { max: 200 }),
    bool('spa', 'Spa', 'سبا'),
    bool('privatePool', 'Swimming pool', 'مسبح', { syncTo: 'pool' }),
    bool('beachfront', 'Beachfront', 'على الشاطئ'),
    sel('starRating', 'Star rating (if any)', 'التصنيف بالنجوم (إن وجد)', [
      { value: 'unrated', en: 'Unrated / not declared', ar: 'غير مصنف / غير مصرح' },
      { value: '3', en: '3 star', ar: '3 نجوم' },
      { value: '4', en: '4 star', ar: '4 نجوم' },
      { value: '5', en: '5 star', ar: '5 نجوم' },
    ]),
    num('kitchens', 'Kitchens', 'المطابخ', { max: 100 }),
    bool('laundry', 'On-site laundry', 'مغسلة في الموقع'),
    bool('staffHousingOnSite', 'Staff housing on site', 'سكن موظفين في الموقع'),
    num('parkingSpaces', 'Parking spaces', 'مواقف السيارات', { max: 100000 }),
  ]),
  FIRE_LIFE_SAFETY,
  COOLING_WATER_POWER,
  MANAGEMENT_PERMITS,
];

const HOSPITAL_DETAILS: AssetDetailGroup[] = [
  group('hospital', 'Clinical capacity', 'السعة السريرية', [
    text('buildingName', 'Hospital name', 'اسم المستشفى'),
    num('hospitalBeds', 'Inpatient beds', 'أسرة التنويم', { max: 10000, syncTo: 'units', helperEn: 'Information only. Measured service area drives the FM price.', helperAr: 'للمعلومات فقط. مساحة الخدمة المقاسة هي عامل سعر إدارة المرافق.' }),
    num('theatres', 'Operating theatres', 'غرف العمليات', { max: 200 }),
    num('icuBeds', 'ICU beds', 'أسرة العناية المركزة', { max: 2000 }),
    num('clinics', 'Outpatient clinics', 'عيادات خارجية', { max: 2000 }),
    num('labs', 'Laboratories', 'المختبرات', { max: 200 }),
    bool('pharmacy', 'Pharmacy', 'صيدلية'),
    bool('imaging', 'Imaging / radiology', 'تصوير / أشعة'),
    num('isolationRooms', 'Isolation rooms', 'غرف العزل', { max: 500 }),
    bool('medicalGas', 'Medical gas system', 'نظام الغاز الطبي'),
    bool('helicopterPad', 'Helipad', 'مهبط مروحية'),
    num('floorsAboveGround', 'Floors', 'الطوابق', { max: 200, syncTo: 'floors' }),
    num('passengerLifts', 'Passenger / bed lifts', 'مصاعد الركاب / الأسرة', { max: 200 }),
    num('serviceLifts', 'Service lifts', 'مصاعد الخدمة', { max: 200 }),
  ]),
  FIRE_LIFE_SAFETY,
  COOLING_WATER_POWER,
  MANAGEMENT_PERMITS,
];

const CLINIC_DETAILS: AssetDetailGroup[] = [
  group('clinic', 'Clinic details', 'تفاصيل العيادة', [
    text('buildingName', 'Clinic name', 'اسم العيادة'),
    num('treatmentRooms', 'Treatment rooms', 'غرف العلاج', { max: 500, syncTo: 'units', helperEn: 'Information only. Measured service area drives the FM price.', helperAr: 'للمعلومات فقط. مساحة الخدمة المقاسة هي عامل سعر إدارة المرافق.' }),
    num('consultationRooms', 'Consultation rooms', 'غرف الكشف', { max: 500 }),
    num('dentalChairs', 'Dental chairs', 'كراسي الأسنان', { max: 200 }),
    bool('labOnSite', 'Lab on site', 'مختبر في الموقع'),
    bool('imaging', 'Imaging / radiology', 'تصوير / أشعة'),
    num('floorsAboveGround', 'Floors occupied', 'الطوابق المشغولة', { max: 100, syncTo: 'floors' }),
  ]),
  FIRE_LIFE_SAFETY,
];

const SCHOOL_DETAILS: AssetDetailGroup[] = [
  group('school', 'School details', 'تفاصيل المدرسة', [
    text('buildingName', 'School name', 'اسم المدرسة'),
    num('classrooms', 'Classrooms', 'الفصول', { max: 2000, helperEn: 'Information only. Measured service area drives the FM price.', helperAr: 'للمعلومات فقط. مساحة الخدمة المقاسة هي عامل سعر إدارة المرافق.' }),
    num('studentCapacity', 'Student capacity', 'سعة الطلاب', { max: 20000, syncTo: 'units' }),
    num('labs', 'Laboratories', 'المختبرات', { max: 200 }),
    num('sportsHalls', 'Sports halls', 'القاعات الرياضية', { max: 50 }),
    bool('canteen', 'Canteen / kitchen', 'مقصف / مطبخ'),
    bool('boarding', 'Boarding', 'سكن داخلي'),
    bool('playgrounds', 'Playgrounds', 'ملاعب'),
    text('ageRange', 'Age range / stages', 'الفئة العمرية / المراحل', { maxLength: 80 }),
    num('floorsAboveGround', 'Floors', 'الطوابق', { max: 50, syncTo: 'floors' }),
    num('passengerLifts', 'Lifts', 'المصاعد', { max: 50 }),
  ]),
  FIRE_LIFE_SAFETY,
  COOLING_WATER_POWER,
  MANAGEMENT_PERMITS,
];

const WAREHOUSE_DETAILS: AssetDetailGroup[] = [
  group('warehouse', 'Warehouse details', 'تفاصيل المستودع', [
    text('buildingName', 'Warehouse name', 'اسم المستودع'),
    num('clearHeightM', 'Clear height (metres)', 'الارتفاع الصافي (متر)', { max: 80 }),
    num('loadingDocks', 'Loading docks', 'منصات التحميل', { max: 500 }),
    bool('dockLevelers', 'Dock levelers', 'روافع الرصيف'),
    bool('coldStorage', 'Cold storage', 'تخزين مبرد'),
    text('coldStorageTemp', 'Cold storage temperature band', 'نطاق حرارة التخزين المبرد', { maxLength: 80 }),
    bool('racking', 'Racking installed', 'رفوف مركبة'),
    bool('officeMezzanine', 'Office mezzanine', 'ميزانين مكتبي'),
    num('truckCourts', 'Truck court / yard bays', 'ساحة الشاحنات', { max: 500 }),
    bool('hazardousGoods', 'Hazardous goods stored', 'مواد خطرة مخزّنة'),
  ]),
  FIRE_LIFE_SAFETY,
  COOLING_WATER_POWER,
  MANAGEMENT_PERMITS,
];

const INDUSTRIAL_DETAILS: AssetDetailGroup[] = [
  group('industrial', 'Industrial details', 'تفاصيل العقار الصناعي', [
    text('buildingName', 'Facility name', 'اسم المنشأة'),
    num('workshops', 'Workshops', 'الورش', { max: 200 }),
    num('productionLines', 'Production lines', 'خطوط الإنتاج', { max: 200 }),
    bool('hazardousMaterials', 'Hazardous materials on site', 'مواد خطرة في الموقع'),
    bool('cranes', 'Cranes / hoists', 'رافعات / أوناش'),
    num('powerCapacityKva', 'Power capacity (kVA)', 'قدرة الكهرباء (ك.ف.أ)', { max: 1_000_000 }),
    num('officeAreaSqft', 'Office area (sq ft)', 'مساحة المكاتب (قدم²)', { max: 1_000_000 }),
    num('loadingDocks', 'Loading docks', 'منصات التحميل', { max: 500 }),
  ]),
  FIRE_LIFE_SAFETY,
  COOLING_WATER_POWER,
  MANAGEMENT_PERMITS,
];

const ACCOMMODATION_DETAILS: AssetDetailGroup[] = [
  group('accommodation', 'Accommodation details', 'تفاصيل السكن', [
    text('buildingName', 'Camp / building name', 'اسم السكن / المبنى'),
    num('bedCount', 'Beds', 'الأسرة', { max: 100000, syncTo: 'beds', helperEn: 'Required on the measurements card. This copies the bed count used for pricing.', helperAr: 'مطلوب في بطاقة القياسات. يُنسخ هنا عدد الأسرة المستخدم في التسعير.' }),
    num('roomCount', 'Rooms', 'الغرف', { max: 100000 }),
    num('buildingsCount', 'Buildings / blocks', 'المباني / البلوكات', { max: 500 }),
    num('kitchens', 'Kitchens', 'المطابخ', { max: 200 }),
    bool('laundry', 'Laundry', 'مغسلة'),
    num('washrooms', 'Washrooms', 'دورات المياه', { max: 5000 }),
    bool('clinicOnSite', 'Clinic on site', 'عيادة في الموقع'),
    bool('recreation', 'Recreation area', 'منطقة ترفيه'),
    num('occupancy', 'Typical occupancy', 'الإشغال المعتاد', { max: 100000 }),
    bool('fireWarden', 'Fire warden arrangements', 'ترتيبات مشرف الحريق'),
    num('floorsAboveGround', 'Floors', 'الطوابق', { max: 80, syncTo: 'floors' }),
    num('passengerLifts', 'Lifts', 'المصاعد', { max: 50 }),
  ]),
  FIRE_LIFE_SAFETY,
  COOLING_WATER_POWER,
  MANAGEMENT_PERMITS,
];

const GOVERNMENT_DETAILS: AssetDetailGroup[] = [
  group('government', 'Government property details', 'تفاصيل العقار الحكومي', [
    text('buildingName', 'Facility name', 'اسم المنشأة'),
    text('departmentName', 'Department / entity', 'الجهة / الإدارة'),
    text('reraDldOrPermitNumber', 'Emirate permit or asset number', 'رقم التصريح أو الأصل', { maxLength: 80 }),
    bool('publicAccess', 'Public access', 'دخول عام'),
    num('meetingHalls', 'Meeting halls', 'قاعات الاجتماعات', { max: 200 }),
    num('floorsAboveGround', 'Floors', 'الطوابق', { max: 200, syncTo: 'floors' }),
    num('passengerLifts', 'Passenger lifts', 'مصاعد الركاب', { max: 200 }),
    num('serviceLifts', 'Service lifts', 'مصاعد الخدمة', { max: 200 }),
    num('parkingSpaces', 'Parking spaces', 'مواقف السيارات', { max: 100000 }),
  ]),
  FIRE_LIFE_SAFETY,
  COOLING_WATER_POWER,
  MANAGEMENT_PERMITS,
];

const MAJLIS_DETAILS: AssetDetailGroup[] = [
  group('majlis', 'Majlis details', 'تفاصيل المجلس', [
    text('buildingName', 'Majlis name', 'اسم المجلس'),
    num('guestCapacity', 'Guest capacity', 'سعة الضيوف', { max: 20000, syncTo: 'units', helperEn: 'Information only. Majlis is priced as one facility, not by guest count.', helperAr: 'للمعلومات فقط. يُسعَّر المجلس كمنشأة واحدة وليس حسب عدد الضيوف.' }),
    bool('diningHall', 'Dining hall', 'قاعة طعام'),
    bool('outdoorMajlis', 'Outdoor majlis', 'مجلس خارجي'),
    bool('kitchen', 'Kitchen', 'مطبخ'),
    bool('prayerRoom', 'Prayer room', 'غرفة صلاة'),
    text('eventFrequency', 'Typical event frequency', 'تكرار الفعاليات المعتاد', { maxLength: 120 }),
    num('parkingSpaces', 'Parking spaces', 'مواقف السيارات', { max: 5000 }),
    bool('privateGarden', 'Garden / landscaping', 'حديقة / تنسيق موقع'),
  ]),
  FIRE_LIFE_SAFETY,
  COOLING_WATER_POWER,
];

const MOSQUE_EXTRAS: AssetDetailGroup[] = [
  group('mosque-extras', 'Additional mosque details', 'تفاصيل إضافية للمسجد', [
    num('prayerHallAreaSqft', 'Prayer hall area (sq ft)', 'مساحة قاعة الصلاة (قدم²)', { max: 1_000_000, helperEn: 'Optional. The mandatory mosque profile still uses measured area and worshipper capacity for pricing.', helperAr: 'اختياري. ما زال ملف المسجد الإلزامي يستخدم المساحة المقاسة وسعة المصلين للتسعير.' }),
    num('mensHallCapacity', "Men's prayer hall capacity", 'سعة مصلى الرجال', { max: 100000 }),
    num('womensHallCapacity', "Women's prayer hall capacity", 'سعة مصلى النساء', { max: 100000 }),
    num('minarets', 'Minarets', 'المآذن', { max: 20 }),
    bool('imamResidence', 'Imam residence', 'سكن الإمام'),
    num('parkingSpaces', 'Parking spaces', 'مواقف السيارات', { max: 10000 }),
    num('fridayCapacity', 'Friday peak capacity', 'سعة ذروة الجمعة', { max: 100000 }),
    bool('soundSystem', 'Sound system', 'نظام صوت'),
    bool('funeralFacility', 'Funeral / washing facility', 'مغسلة / تجهيز الجنائز'),
    sel('mosqueOwnership', 'Mosque ownership', 'ملكية المسجد', [
      { value: 'private', en: 'Private', ar: 'خاص' },
      { value: 'community', en: 'Community', ar: 'مجتمعي' },
      { value: 'government', en: 'Government', ar: 'حكومي' },
    ], { helperEn: 'A mosque is not automatically tagged as a government owner.', helperAr: 'لا يُصنَّف المسجد تلقائياً كمالك حكومي.' }),
  ]),
];

const STADIUM_DETAILS: AssetDetailGroup[] = [
  group('venue', 'Venue capacity', 'سعة الموقع', [
    text('buildingName', 'Venue name', 'اسم الموقع'),
    num('seatedCapacity', 'Seated capacity', 'السعة الجالسة', { max: 200000, syncTo: 'units', helperEn: 'Operational information only. Measured service area drives the FM price.', helperAr: 'معلومة تشغيلية فقط. مساحة الخدمة المقاسة هي عامل سعر إدارة المرافق.' }),
    num('standingCapacity', 'Standing capacity', 'السعة الواقفة', { max: 200000 }),
    text('pitchType', 'Pitch / court type', 'نوع الملعب / الأرضية', { maxLength: 80 }),
    bool('floodlights', 'Floodlights', 'إضاءة كاشفة'),
    num('hospitalityBoxes', 'Hospitality boxes', 'صناديق الضيافة', { max: 2000 }),
    bool('mediaCentre', 'Media centre', 'مركز إعلامي'),
    num('parkingSpaces', 'Parking spaces', 'مواقف السيارات', { max: 100000 }),
    num('eventDaysPerYear', 'Typical event days per year', 'أيام الفعاليات المعتادة في السنة', { max: 366 }),
  ]),
  FIRE_LIFE_SAFETY,
  COOLING_WATER_POWER,
  MANAGEMENT_PERMITS,
];

const FARM_DETAILS: AssetDetailGroup[] = [
  group('farm', 'Farm / estate details', 'تفاصيل المزرعة / العزبة', [
    text('buildingName', 'Estate name', 'اسم العزبة'),
    num('landAreaSqft', 'Land area (sq ft)', 'مساحة الأرض (قدم²)', { max: 50_000_000, helperEn: 'Information only. Farm / Estate uses a flat facility rate, not a land-area multiplier.', helperAr: 'للمعلومات فقط. تُسعَّر المزرعة / العزبة بسعر منشأة ثابت وليس بمضاعف مساحة الأرض.' }),
    num('buildingsCount', 'Buildings on the land', 'المباني على الأرض', { max: 500 }),
    bool('irrigation', 'Irrigation system', 'نظام ري'),
    bool('livestock', 'Livestock', 'ثروة حيوانية'),
    bool('staffHousingOnSite', 'Staff housing', 'سكن عمال'),
    bool('wells', 'Wells / water supply', 'آبار / إمداد مياه'),
    bool('greenhouses', 'Greenhouses', 'بيوت محمية'),
    bool('datePalms', 'Date palms / orchard', 'نخيل / بستان'),
    bool('farmhouse', 'Farmhouse / main residence', 'بيت المزرعة / السكن الرئيسي'),
  ]),
  COOLING_WATER_POWER,
];

const OFFICE_EXTRAS: AssetDetailGroup = group('office-tenancy', 'Office occupancy', 'إشغال المكتب', [
  sel('tenancyType', 'Tenancy', 'نوع الإشغال', [
    { value: 'single', en: 'Single tenant', ar: 'مستأجر واحد' },
    { value: 'multi', en: 'Multi tenant', ar: 'متعدد المستأجرين' },
  ]),
  num('typicalFloorPlateSqft', 'Typical floor plate (sq ft)', 'مسطح الطابق المعتاد (قدم²)', { max: 1_000_000 }),
  bool('reception', 'Reception / lobby', 'استقبال / لوبي'),
  num('meetingRooms', 'Meeting rooms', 'غرف الاجتماعات', { max: 500 }),
  sel('fitOutStandard', 'Fit-out standard', 'مستوى التجهيز', [
    { value: 'shell', en: 'Shell and core', ar: 'هيكل أساسي' },
    { value: 'fitted', en: 'Fitted', ar: 'مجهز' },
    { value: 'furnished', en: 'Furnished', ar: 'مفروش' },
  ]),
]);

function highRise(groups: AssetDetailGroup[]): AssetDetailGroup[] {
  return [HIGH_RISE_CORE, ...groups, FIRE_LIFE_SAFETY, COOLING_WATER_POWER, MANAGEMENT_PERMITS];
}

export const ASSET_TYPE_DETAIL_GROUPS: Record<string, AssetDetailGroup[]> = {
  Villa: VILLA_DETAILS,
  Apartment: APARTMENT_DETAILS,
  'Residential Building': highRise([UNIT_MIX_RESIDENTIAL]),
  'Commercial Building': highRise([UNIT_MIX_COMMERCIAL]),
  Office: highRise([UNIT_MIX_COMMERCIAL, OFFICE_EXTRAS]),
  'Gym / Fitness Centre': GYM_EXTRAS,
  'Retail Center': RETAIL_DETAILS,
  Mall: RETAIL_DETAILS,
  Hotel: HOTEL_DETAILS,
  Resort: HOTEL_DETAILS,
  Hospital: HOSPITAL_DETAILS,
  Clinic: CLINIC_DETAILS,
  School: SCHOOL_DETAILS,
  Warehouse: WAREHOUSE_DETAILS,
  'Industrial Property': INDUSTRIAL_DETAILS,
  'Labour Camp': ACCOMMODATION_DETAILS,
  'Staff Accommodation': ACCOMMODATION_DETAILS,
  'Government Property': GOVERNMENT_DETAILS,
  'Government Majlis': MAJLIS_DETAILS,
  'Private Majlis': MAJLIS_DETAILS,
  'Mosque / Masjid': MOSQUE_EXTRAS,
  'Mixed-Use Tower': highRise([UNIT_MIX_MIXED]),
  Skyscraper: highRise([UNIT_MIX_MIXED]),
  Stadium: STADIUM_DETAILS,
  'Sports Complex': STADIUM_DETAILS,
  'Event Venue': STADIUM_DETAILS,
  'Farm / Estate': FARM_DETAILS,
};

function uniqueFields(fields: AssetDetailField[]): AssetDetailField[] {
  const seen = new Set<string>();
  const output: AssetDetailField[] = [];
  for (const field of fields) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    output.push(field);
  }
  return output;
}

export function fieldsForPropertyType(propertyType: string): AssetDetailField[] {
  const groups = ASSET_TYPE_DETAIL_GROUPS[propertyType] || [];
  return uniqueFields(groups.flatMap((groupItem) => groupItem.fields));
}

export const ASSET_DETAIL_FIELD_INDEX: Record<string, AssetDetailField> = uniqueFields(
  Object.values(ASSET_TYPE_DETAIL_GROUPS).flatMap((groups) => groups.flatMap((groupItem) => groupItem.fields)),
).reduce((index, field) => {
  index[field.key] = field;
  return index;
}, {} as Record<string, AssetDetailField>);

export const ASSET_DETAIL_ALLOWED_KEYS = Object.freeze(Object.keys(ASSET_DETAIL_FIELD_INDEX).sort());

const TEXT_TYPES = new Set<AssetDetailFieldType>(['text', 'select', 'date']);

export function isBlankCount(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

export function sanitizeAssetDetailValue(field: AssetDetailField, raw: unknown): AssetDetailValue | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (field.type === 'boolean') {
    if (raw === true || raw === 'yes' || raw === 'true') return true;
    if (raw === false || raw === 'no' || raw === 'false') return false;
    return undefined;
  }
  if (field.type === 'number') {
    const parsed = typeof raw === 'string' ? Number.parseFloat(raw.trim()) : Number(raw);
    if (!Number.isFinite(parsed) || parsed < (field.min ?? 0) || parsed > (field.max ?? 1_000_000)) return undefined;
    return parsed;
  }
  if (!TEXT_TYPES.has(field.type)) return undefined;
  const textValue = String(raw).trim().slice(0, field.maxLength ?? 200);
  if (!textValue) return undefined;
  if (field.type === 'select' && field.options && !field.options.some((option) => option.value === textValue)) return undefined;
  if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(textValue) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(textValue)) {
    // Keep a short free-text expiry if it is not a clear date; do not invent one.
    if (textValue.length > 32) return undefined;
  }
  return textValue;
}

export function sanitizeAssetDetails(propertyType: string, raw: unknown): Record<string, AssetDetailValue> {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const typeFields = fieldsForPropertyType(propertyType);
  const fieldByKey = Object.fromEntries(typeFields.map((field) => [field.key, field]));
  const output: Record<string, AssetDetailValue> = {};
  for (const [key, value] of Object.entries(source)) {
    const field = fieldByKey[key];
    if (!field) continue;
    const next = sanitizeAssetDetailValue(field, value);
    if (next !== undefined) output[key] = next;
  }
  return output;
}

export type AssetDetailsPropertyPatch = {
  assetDetails: Record<string, AssetDetailValue>;
  floors?: number;
  units?: number;
  beds?: number;
  bedrooms?: number;
  lifts?: number;
  offices?: number;
  shops?: number;
  bmu?: boolean;
  fireAlarm?: boolean;
  hvac?: boolean;
  districtCooling?: boolean;
  tank?: boolean;
  pumps?: boolean;
  gen?: boolean;
  pool?: boolean;
  ownerType?: string;
};

export function applyAssetDetailsToProperty(propertyType: string, raw: unknown): AssetDetailsPropertyPatch {
  const assetDetails = sanitizeAssetDetails(propertyType, raw);
  const patch: AssetDetailsPropertyPatch = { assetDetails };
  const fields = fieldsForPropertyType(propertyType);
  for (const field of fields) {
    if (!field.syncTo || !(field.key in assetDetails)) continue;
    const value = assetDetails[field.key];
    if (field.syncTo === 'bedrooms' && (value === 0 || value === '0' || typeof value === 'number' || typeof value === 'string')) {
      patch.bedrooms = Number(value);
      continue;
    }
    if (typeof value === 'boolean') {
      (patch as Record<string, unknown>)[field.syncTo] = value;
      continue;
    }
    if (typeof value === 'number') {
      (patch as Record<string, unknown>)[field.syncTo] = value;
    }
  }
  const passenger = typeof assetDetails.passengerLifts === 'number' ? assetDetails.passengerLifts : undefined;
  const service = typeof assetDetails.serviceLifts === 'number' ? assetDetails.serviceLifts : undefined;
  if (passenger !== undefined || service !== undefined) {
    patch.lifts = (passenger || 0) + (service || 0);
  }
  if (assetDetails.mosqueOwnership === 'government') patch.ownerType = 'Government';
  else if (assetDetails.mosqueOwnership === 'private' || assetDetails.mosqueOwnership === 'community') patch.ownerType = 'Private';
  return patch;
}

export function missingRequiredAssetDetails(propertyType: string, details: unknown): string[] {
  const source = details && typeof details === 'object' ? details as Record<string, unknown> : {};
  return fieldsForPropertyType(propertyType)
    .filter((field) => field.required)
    .filter((field) => sanitizeAssetDetailValue(field, source[field.key]) === undefined)
    .map((field) => field.key);
}

export function assertAssetTypeCoverage(propertyTypes: readonly string[]): void {
  for (const type of propertyTypes) {
    if (!ASSET_TYPE_DETAIL_GROUPS[type]?.length) throw new Error(`Missing type-specific details for ${type}`);
  }
}
