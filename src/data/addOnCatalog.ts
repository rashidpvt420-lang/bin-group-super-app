export interface ProductionAddOn {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  price: number;
  category: 'maintenance' | 'renovation' | 'smart' | 'outdoor' | 'authority' | 'fitout';
}

export const PRODUCTION_ADD_ONS: ProductionAddOn[] = [
  { id: 'technical_standby_majlis_event', name: 'Technical standby for majlis / event venue', nameAr: 'فني مناوب للمجلس أو موقع الفعالية', description: 'Dedicated standby technician for majlis, events and urgent site support.', descriptionAr: 'فني مناوب مخصص للمجالس والفعاليات والدعم العاجل في الموقع.', price: 2500, category: 'maintenance' },
  { id: 'tank_cleaning', name: 'Tank cleaning', nameAr: 'تنظيف خزانات المياه', description: 'Water tank cleaning, sterilization and hygiene readiness service.', descriptionAr: 'تنظيف وتعقيم خزانات المياه وتجهيزها صحياً.', price: 1500, category: 'maintenance' },
  { id: 'painting_room', name: 'Painting room', nameAr: 'دهان غرفة', description: 'Single-room painting allowance including labor and standard materials.', descriptionAr: 'دهان غرفة واحدة شامل العمالة والمواد القياسية.', price: 1200, category: 'renovation' },
  { id: 'painting_villa', name: 'Painting villa', nameAr: 'دهان فيلا', description: 'Villa repainting allowance for internal or external standard repainting work.', descriptionAr: 'بدل دهان فيلا للأعمال الداخلية أو الخارجية القياسية.', price: 15000, category: 'renovation' },
  { id: 'full_building_painting', name: 'Full building painting', nameAr: 'دهان مبنى كامل', description: 'Full building repainting allowance for residential or commercial buildings.', descriptionAr: 'بدل دهان مبنى كامل سكني أو تجاري.', price: 120000, category: 'renovation' },
  { id: 'mall_repaint_night_shift', name: 'Mall repaint / night-shift painting', nameAr: 'دهان مول / أعمال ليلية', description: 'Retail or mall repainting with night-shift operational allowance.', descriptionAr: 'دهان محلات أو مول مع بدل تنفيذ ليلي.', price: 18000, category: 'renovation' },
  { id: 'joinery_package', name: 'Joinery package', nameAr: 'باقة أعمال النجارة', description: 'Joinery repair, cabinets, doors, wall features and finishing coordination.', descriptionAr: 'أعمال نجارة وإصلاح خزائن وأبواب وتنسيق التشطيبات.', price: 25000, category: 'fitout' },
  { id: 'smart_lighting', name: 'Smart lighting', nameAr: 'إضاءة ذكية', description: 'Smart lighting controls and selected fixture upgrade allowance.', descriptionAr: 'أنظمة تحكم إضاءة ذكية وبدل تطوير وحدات مختارة.', price: 8500, category: 'smart' },
  { id: 'av_majlis_media_setup', name: 'AV / majlis media setup', nameAr: 'تجهيز صوتيات ومرئيات للمجلس', description: 'Audio, video and majlis media coordination for premium spaces.', descriptionAr: 'تجهيز صوتيات ومرئيات وتنسيق إعلامي للمجالس والمساحات الفاخرة.', price: 22000, category: 'smart' },
  { id: 'pantry_service_area_upgrade', name: 'Pantry / service area upgrade', nameAr: 'تطوير البانتري / منطقة الخدمة', description: 'Upgrade allowance for pantry, service area, counters and utility support.', descriptionAr: 'بدل تطوير البانتري ومنطقة الخدمة والأسطح والمرافق.', price: 18000, category: 'fitout' },
  { id: 'garden_redesign', name: 'Garden redesign', nameAr: 'إعادة تصميم الحديقة', description: 'Garden redesign allowance including layout, planting and execution coordination.', descriptionAr: 'بدل إعادة تصميم الحديقة شامل التخطيط والزراعة والتنسيق التنفيذي.', price: 15000, category: 'outdoor' },
  { id: 'irrigation', name: 'Irrigation', nameAr: 'نظام الري', description: 'Irrigation system repair, extension or upgrade allowance.', descriptionAr: 'بدل إصلاح أو توسعة أو تطوير نظام الري.', price: 6500, category: 'outdoor' },
  { id: 'outdoor_lighting', name: 'Outdoor lighting', nameAr: 'إضاءة خارجية', description: 'Outdoor lighting upgrade for gardens, facades, walkways and majlis access.', descriptionAr: 'تطوير الإضاءة الخارجية للحدائق والواجهات والممرات ومداخل المجلس.', price: 5500, category: 'outdoor' },
  { id: 'signage_retail_frontage', name: 'Signage / retail frontage', nameAr: 'لوحات وواجهة تجارية', description: 'Retail signage, frontage, entrance identity and authority-ready coordination.', descriptionAr: 'لوحات وواجهة تجارية وهوية مدخل مع تنسيق جاهز للجهات.', price: 12500, category: 'fitout' },
  { id: 'flooring_replacement', name: 'Flooring replacement', nameAr: 'استبدال الأرضيات', description: 'Flooring replacement allowance for tiles, vinyl, parquet or selected finishes.', descriptionAr: 'بدل استبدال الأرضيات للبلاط أو الفينيل أو الباركيه أو التشطيبات المختارة.', price: 15000, category: 'renovation' },
  { id: 'wall_feature_cladding', name: 'Wall feature / cladding', nameAr: 'جدار ديكور / تكسية', description: 'Feature wall, decorative cladding or premium wall treatment allowance.', descriptionAr: 'بدل جدار ديكور أو تكسية أو معالجة فاخرة للجدران.', price: 9500, category: 'fitout' },
  { id: 'false_ceiling_gypsum', name: 'False ceiling / gypsum works', nameAr: 'سقف مستعار / أعمال جبس', description: 'Ceiling, access panels, lighting coordination and ceiling finishing.', descriptionAr: 'سقف جبس وألواح وصول وتنسيق إضاءة وتشطيب السقف.', price: 8500, category: 'fitout' },
  { id: 'acoustic_treatment', name: 'Acoustic treatment', nameAr: 'معالجة صوتية', description: 'Acoustic treatment allowance for majlis, offices, meeting rooms and media rooms.', descriptionAr: 'بدل معالجة صوتية للمجالس والمكاتب وغرف الاجتماعات والإعلام.', price: 14000, category: 'fitout' },
  { id: 'smart_home_package', name: 'Smart home package', nameAr: 'باقة المنزل الذكي', description: 'Smart home automation allowance for selected lighting, controls and sensors.', descriptionAr: 'بدل أتمتة المنزل الذكي للإضاءة والتحكم والحساسات المختارة.', price: 28000, category: 'smart' },
  { id: 'waterproofing_allowance', name: 'Waterproofing allowance', nameAr: 'بدل العزل المائي', description: 'Waterproofing repair allowance for wet areas, roof leaks and risk zones.', descriptionAr: 'بدل إصلاح العزل المائي للمناطق الرطبة وتسربات الأسطح ومناطق الخطر.', price: 7500, category: 'maintenance' },
  { id: 'authority_noc_handling', name: 'Authority / NOC handling', nameAr: 'متابعة الجهات والتصاريح', description: 'Authority coordination, NOC handling and document submission support.', descriptionAr: 'تنسيق الجهات ومتابعة شهادات عدم الممانعة ودعم تقديم المستندات.', price: 8000, category: 'authority' }
];

export function getAddOnText(addon: ProductionAddOn, lang: 'en' | 'ar') {
  return {
    name: lang === 'ar' ? addon.nameAr : addon.name,
    description: lang === 'ar' ? addon.descriptionAr : addon.description
  };
}

export function formatAddOnPrice(price: number) {
  return `AED ${price.toLocaleString()}`;
}
