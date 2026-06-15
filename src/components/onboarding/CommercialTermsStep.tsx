import React, { useEffect } from 'react';
import {
    Box, Typography, Grid, Paper, alpha, Stack, Button, Divider, Container, RadioGroup, FormControlLabel, Radio, Chip
} from '@mui/material';
import { Wrench, UserCheck, ShieldCheck, ArrowRight, CalendarCheck, CheckCircle2, XCircle, ClipboardCheck, Timer } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { formatAED } from '../../utils/formatters';

type LocalText = { en: string; ar: string };
const tx = (text: LocalText, ar: boolean) => (ar ? text.ar : text.en);

const copy = {
    serviceScopeDetails: { en: 'Service Scope Details', ar: 'تفاصيل نطاق الخدمة' },
    ppmCoverage: { en: 'PPM, Coverage, Exclusions and Proof', ar: 'الصيانة الوقائية، التغطية، الاستثناءات والإثبات' },
    ppmSchedule: { en: 'PPM Schedule', ar: 'جدول الصيانة الوقائية' },
    completionProof: { en: 'Completion Proof', ar: 'إثبات الإنجاز' },
    ppmProgram: { en: 'PPM Program', ar: 'برنامج الصيانة الوقائية' },
    slaResponse: { en: 'SLA Response', ar: 'استجابة SLA' },
    included: { en: 'Included', ar: 'مشمول' },
    notIncluded: { en: 'Not Included / Approval', ar: 'غير مشمول / يحتاج موافقة' },
    selectedSystems: { en: 'Selected Systems and Add-ons', ar: 'الأنظمة والإضافات المختارة' },
    noSystems: { en: 'No systems selected yet', ar: 'لم يتم اختيار أنظمة بعد' },
    mandatoryAddons: { en: 'Mandatory add-ons calculated from systems', ar: 'الإضافات الإلزامية محسوبة حسب الأنظمة' },
    ppmPrefix: { en: 'PPM:', ar: 'الصيانة الوقائية:' },
    fullAnnualPayment: { en: 'Full annual payment', ar: 'دفعة سنوية كاملة' },
    includedValue: { en: 'Included', ar: 'مشمول' },
    approvalRule: { en: 'Approval Rule', ar: 'قاعدة الموافقة' },
    approvalRuleText: { en: 'Work above AED 1,000 needs owner approval before execution.', ar: 'أي عمل يتجاوز 1,000 درهم يحتاج موافقة المالك قبل التنفيذ.' },
};

const systemLabels: Record<string, LocalText> = {
    electrical: { en: 'Electrical / Power', ar: 'الكهرباء / الطاقة' },
    plumbing: { en: 'Plumbing & Water', ar: 'السباكة والمياه' },
    drainage: { en: 'Drainage & Sewage', ar: 'الصرف الصحي والمجاري' },
    pumps: { en: 'Water Pumps', ar: 'مضخات المياه' },
    hvac: { en: 'HVAC / AC', ar: 'التكييف والتهوية' },
    districtCooling: { en: 'District Cooling', ar: 'التبريد المركزي' },
    tank: { en: 'Water Tank', ar: 'خزان المياه' },
    gen: { en: 'Generator', ar: 'المولد' },
    lifts: { en: 'Lifts', ar: 'المصاعد' },
    fireAlarm: { en: 'Fire Alarm', ar: 'إنذار الحريق' },
    firePump: { en: 'Fire Pump', ar: 'مضخة الحريق' },
    bmu: { en: 'BMU / Facade Access', ar: 'وحدة الواجهات / الوصول للواجهة' },
    pool: { en: 'Swimming Pool', ar: 'المسبح' },
    greaseTrap: { en: 'Grease Trap', ar: 'مصيدة الشحوم' },
    majlisGarden: { en: 'Majlis Garden', ar: 'حديقة المجلس' },
};

const addOnLabels: Record<string, LocalText> = {
    fire_safety: { en: 'Fire Safety AMC', ar: 'عقد سلامة الحريق' },
    water_tank: { en: 'Water Tank Service', ar: 'خدمة خزان المياه' },
    elevator_amc: { en: 'Lift AMC', ar: 'عقد صيانة المصاعد' },
    hvac_pm: { en: 'HVAC Preventive Maintenance', ar: 'صيانة وقائية للتكييف' },
    cleaning: { en: 'Cleaning / Deep Cleaning', ar: 'تنظيف / تنظيف عميق' },
    pest_control: { en: 'Pest Control', ar: 'مكافحة الحشرات' },
    landscaping: { en: 'Landscaping', ar: 'تنسيق الحدائق' },
    move_in_out_inspection: { en: 'Move-in / Move-out Inspection', ar: 'فحص الدخول / الخروج' },
    mep_support: { en: 'MEP Support', ar: 'دعم MEP' },
    waste_management: { en: 'Waste Management', ar: 'إدارة النفايات' },
};

const ppmTextByTier: Record<string, LocalText> = {
    standard: { en: '2x annual PPM visits for selected core systems with completion log.', ar: 'زيارتان سنوياً للصيانة الوقائية للأنظمة الأساسية المختارة مع سجل إنجاز.' },
    premium: { en: '4x annual PPM visits / quarterly inspections with stronger reporting.', ar: '4 زيارات سنوية / فحوصات ربع سنوية مع تقارير أقوى.' },
    elite: { en: '12x annual PPM visits / monthly inspections with standby readiness checks.', ar: '12 زيارة سنوية / فحوصات شهرية مع جاهزية دعم احتياطي.' },
};

const majlisPpmTextByTier: Record<string, LocalText> = {
    standard: { en: '4x annual Majlis readiness and MEP continuity checks.', ar: '4 فحوصات سنوية لجاهزية المجلس واستمرارية MEP.' },
    premium: { en: '12x annual Majlis readiness checks with monthly inspections.', ar: '12 فحصاً سنوياً لجاهزية المجلس مع فحوصات شهرية.' },
    elite: { en: 'Monthly PPM plus pre-event readiness check and standby coordination.', ar: 'صيانة وقائية شهرية مع فحص جاهزية قبل الفعاليات وتنسيق دعم احتياطي.' },
};

const responseTextByTier: Record<string, LocalText> = {
    standard: { en: 'Standard response windows with routine scheduling and service documentation.', ar: 'أوقات استجابة قياسية مع جدولة روتينية وتوثيق الخدمة.' },
    premium: { en: 'Priority response, escalation support and stronger owner reporting.', ar: 'استجابة ذات أولوية مع دعم التصعيد وتقارير أقوى للمالك.' },
    elite: { en: 'Fastest response level with standby readiness and executive escalation path.', ar: 'أسرع مستوى استجابة مع جاهزية احتياطية ومسار تصعيد تنفيذي.' },
};

const paymentPlanDetails: Record<string, LocalText> = {
    annual: { en: 'One annual settlement with full contract activation.', ar: 'تسوية سنوية واحدة مع تفعيل كامل للعقد.' },
    quarterly: { en: '15% mobilization first, then four scheduled payments.', ar: 'دفعة تعبئة 15% أولاً، ثم أربع دفعات مجدولة.' },
    monthly: { en: '15% mobilization first, then monthly billing after verification.', ar: 'دفعة تعبئة 15% أولاً، ثم فوترة شهرية بعد التحقق.' },
};

const includedScopes: Record<string, LocalText[]> = {
    pm_only: [
        { en: 'Tenant coordination', ar: 'تنسيق المستأجرين' },
        { en: 'Owner reporting', ar: 'تقارير المالك' },
        { en: 'Complaint management', ar: 'إدارة الشكاوى' },
        { en: 'Rent/admin follow-up', ar: 'متابعة الإيجارات والإدارة' },
    ],
    both: [
        { en: 'PPM and reactive maintenance', ar: 'صيانة وقائية واستجابة للأعطال' },
        { en: 'Tenant coordination', ar: 'تنسيق المستأجرين' },
        { en: 'Owner reporting', ar: 'تقارير المالك' },
        { en: 'Ticket workflow', ar: 'مسار التذاكر' },
        { en: 'Completion proof', ar: 'إثبات الإنجاز' },
    ],
    fm_only: [
        { en: 'PPM calendar', ar: 'تقويم الصيانة الوقائية' },
        { en: 'Reactive maintenance workflow', ar: 'مسار الصيانة التفاعلية' },
        { en: 'Technician dispatch', ar: 'إرسال الفنيين' },
        { en: 'SLA tracking', ar: 'تتبع SLA' },
        { en: 'Completion proof', ar: 'إثبات الإنجاز' },
    ],
};

const propertyTypeInclusions: Record<string, LocalText[]> = {
    'Hotel': [
        { en: 'Guest room MEP emergency response (24/7)', ar: 'استجابة طوارئ MEP لغرف الضيوف (24/7)' },
        { en: 'Pool & gym system maintenance', ar: 'صيانة أنظمة المسبح والصالة الرياضية' },
        { en: 'HVAC hotel-priority cooling schedule', ar: 'جدول تبريد بأولوية فندقية' },
        { en: 'Commercial kitchen grease trap service', ar: 'خدمة مصيدة الشحوم للمطبخ التجاري' },
        { en: 'Concierge maintenance coordination', ar: 'تنسيق صيانة الكونسيرج' },
        { en: 'Fire safety & elevator AMC', ar: 'عقد صيانة أنظمة الحريق والمصاعد' },
    ],
    'Resort': [
        { en: 'Resort-wide MEP emergency response (24/7)', ar: 'استجابة طوارئ MEP للمنتجع (24/7)' },
        { en: 'Pool & waterpark system maintenance', ar: 'صيانة أنظمة المسبح وألعاب المياه' },
        { en: 'HVAC hotel-priority cooling schedule', ar: 'جدول تبريد بأولوية فندقية' },
        { en: 'Landscaping & irrigation support', ar: 'دعم التنسيق والري' },
        { en: 'Concierge maintenance coordination', ar: 'تنسيق صيانة الكونسيرج' },
        { en: 'Fire safety & elevator AMC', ar: 'عقد صيانة أنظمة الحريق والمصاعد' },
    ],
    'Hospital': [
        { en: 'Critical medical systems MEP support', ar: 'دعم MEP للأنظمة الطبية الحرجة' },
        { en: '24/7 emergency dispatch protocol', ar: 'بروتوكول إرسال الطوارئ 24/7' },
        { en: 'Infection control-compliant maintenance', ar: 'صيانة متوافقة مع مكافحة العدوى' },
        { en: 'Generator & backup power AMC', ar: 'عقد صيانة المولد والطاقة الاحتياطية' },
        { en: 'Medical gas systems visual inspection', ar: 'فحص بصري لأنظمة الغاز الطبي' },
        { en: 'Fire & life safety systems AMC', ar: 'عقد صيانة أنظمة الحريق وسلامة الحياة' },
    ],
    'Clinic': [
        { en: 'Medical facility MEP maintenance', ar: 'صيانة MEP للمرفق الطبي' },
        { en: 'HVAC sanitized air quality maintenance', ar: 'صيانة جودة الهواء المعقم' },
        { en: 'Emergency electrical response', ar: 'استجابة طوارئ كهربائية' },
        { en: 'Fire & safety systems AMC', ar: 'عقد صيانة أنظمة الحريق والسلامة' },
        { en: 'Water tank sterilization', ar: 'تعقيم خزان المياه' },
    ],
    'School': [
        { en: 'Classroom electrical & AC maintenance', ar: 'صيانة الكهرباء والتكييف في الفصول' },
        { en: 'Lab safety systems inspection', ar: 'فحص أنظمة سلامة المختبرات' },
        { en: 'Cafeteria plumbing & grease trap', ar: 'السباكة ومصيدة الشحوم في الكافتيريا' },
        { en: 'Sports & outdoor facility maintenance', ar: 'صيانة المرافق الرياضية والخارجية' },
        { en: 'Emergency & evacuation system checks', ar: 'فحوصات أنظمة الطوارئ والإخلاء' },
        { en: 'Water tank & potable water compliance', ar: 'امتثال خزان المياه والمياه الصالحة للشرب' },
    ],
    'Mosque / Masjid': [
        { en: 'Prayer-time safe maintenance scheduling', ar: 'جدولة صيانة آمنة خلال أوقات الصلاة' },
        { en: '5x daily Wudu area cleaning cycles', ar: '5 دورات تنظيف يومية لمناطق الوضوء' },
        { en: 'Ramadan surge-ready MEP protocol', ar: 'بروتوكول MEP جاهز لذروة رمضان' },
        { en: 'Awqaf / IACAD compliance reporting', ar: 'تقارير الامتثال لـ الأوقاف / IACAD' },
        { en: 'CCTV 30-day storage compliance', ar: 'امتثال تخزين CCTV لـ 30 يوماً' },
        { en: 'Emergency MEP 24/7 response', ar: 'استجابة MEP للطوارئ 24/7' },
    ],
    'Stadium': [
        { en: 'Event-day MEP readiness checks', ar: 'فحوصات جاهزية MEP في يوم الفعاليات' },
        { en: 'Crowd safety systems maintenance', ar: 'صيانة أنظمة سلامة الجماهير' },
        { en: 'VIP suite & facilities maintenance', ar: 'صيانة مرافق الدرجة الأولى' },
        { en: 'Pitch / court lighting & irrigation', ar: 'إضاءة وري الملعب / الملاعب' },
        { en: 'Concessions & food court systems', ar: 'أنظمة مناطق الطعام والوجبات' },
        { en: 'CCTV crowd monitoring AMC', ar: 'عقد صيانة نظام مراقبة الجماهير' },
    ],
    'Sports Complex': [
        { en: 'Sports facility MEP maintenance', ar: 'صيانة MEP للمنشأة الرياضية' },
        { en: 'Pitch / court lighting systems', ar: 'أنظمة إضاءة الملاعب' },
        { en: 'Changing room plumbing & HVAC', ar: 'سباكة وتكييف غرف تغيير الملابس' },
        { en: 'Fire & emergency systems AMC', ar: 'عقد صيانة أنظمة الحريق والطوارئ' },
        { en: 'Water tank sterilization', ar: 'تعقيم خزان المياه' },
    ],
    'Event Venue': [
        { en: 'Event-day MEP standby support', ar: 'دعم MEP احتياطي في يوم الفعاليات' },
        { en: 'Lighting & AV infrastructure maintenance', ar: 'صيانة البنية التحتية للإضاءة والصوت/الصورة' },
        { en: 'HVAC event-scale cooling', ar: 'تبريد HVAC بمستوى الفعاليات' },
        { en: 'Kitchen & catering systems support', ar: 'دعم أنظمة المطبخ والتموين' },
        { en: 'Fire safety & emergency systems', ar: 'أنظمة سلامة الحريق والطوارئ' },
    ],
    'Government Majlis': [
        { en: 'Majlis event-day readiness checks', ar: 'فحوصات جاهزية المجلس ليوم الفعالية' },
        { en: 'Full MEP systems maintenance', ar: 'صيانة أنظمة MEP الكاملة' },
        { en: 'Garden & exterior deep care', ar: 'العناية العميقة بالحديقة والمناطق الخارجية' },
        { en: 'CCTV & security systems AMC', ar: 'عقد صيانة أنظمة CCTV والأمن' },
        { en: 'VIP-grade completion reporting', ar: 'تقارير إنجاز بمستوى VIP' },
    ],
    'Private Majlis': [
        { en: 'Majlis MEP maintenance & PPM', ar: 'صيانة MEP والصيانة الوقائية للمجلس' },
        { en: 'Garden & exterior care', ar: 'العناية بالحديقة والمناطق الخارجية' },
        { en: 'Event-day standby technician', ar: 'فني احتياطي ليوم الفعاليات' },
        { en: 'Fire safety systems inspection', ar: 'فحص أنظمة سلامة الحريق' },
    ],
    'Mall': [
        { en: 'Retail unit MEP response & PPM', ar: 'استجابة ومتابعة صيانة وقائية لوحدات التجزئة' },
        { en: 'HVAC common area cooling management', ar: 'إدارة تبريد المناطق المشتركة' },
        { en: 'Escalator & elevator AMC', ar: 'عقد صيانة السلالم المتحركة والمصاعد' },
        { en: 'Food court grease trap service', ar: 'خدمة مصيدة الشحوم لمنطقة المطاعم' },
        { en: 'Fire safety & emergency systems', ar: 'أنظمة سلامة الحريق والطوارئ' },
        { en: 'CCTV & security AMC', ar: 'عقد صيانة CCTV والأمن' },
    ],
};

const remainingPropertyTypeInclusions: Record<string, LocalText[]> = {
    'Villa': [
        { en: 'MEP preventive maintenance (electrical, plumbing, AC)', ar: 'صيانة وقائية لـ MEP (كهرباء، سباكة، تكييف)' },
        { en: 'Private pool & garden care', ar: 'صيانة المسبح والحديقة الخاصة' },
        { en: 'Water tank sterilization', ar: 'تعقيم خزان المياه' },
        { en: 'Generator AMC', ar: 'عقد صيانة المولد' },
        { en: 'Fire alarm & safety systems', ar: 'إنذار الحريق وأنظمة السلامة' },
    ],
    'Apartment': [
        { en: 'Building common area MEP maintenance', ar: 'صيانة MEP للمناطق المشتركة بالمبنى' },
        { en: 'Elevator AMC', ar: 'عقد صيانة المصاعد' },
        { en: 'Fire safety systems', ar: 'أنظمة سلامة الحريق' },
        { en: 'Water pump & tank service', ar: 'خدمة مضخة وخزان المياه' },
        { en: 'AC units maintenance', ar: 'صيانة وحدات التكييف' },
    ],
    'Residential Building': [
        { en: 'Building MEP maintenance (all common systems)', ar: 'صيانة MEP للمبنى (جميع الأنظمة المشتركة)' },
        { en: 'Elevator AMC', ar: 'عقد صيانة المصاعد' },
        { en: 'Fire safety & emergency systems', ar: 'أنظمة سلامة الحريق والطوارئ' },
        { en: 'Water tank sterilization & pump service', ar: 'تعقيم الخزان وصيانة المضخة' },
        { en: 'Common area lighting & electrical', ar: 'إضاءة وكهرباء المناطق المشتركة' },
    ],
    'Commercial Building': [
        { en: 'Office floor MEP maintenance', ar: 'صيانة MEP لأدوار المكاتب' },
        { en: 'Central HVAC system maintenance', ar: 'صيانة نظام HVAC المركزي' },
        { en: 'Elevator & escalator AMC', ar: 'عقد صيانة المصاعد والسلالم المتحركة' },
        { en: 'Fire safety & emergency systems', ar: 'أنظمة سلامة الحريق والطوارئ' },
        { en: 'Generator standby & AMC', ar: 'مولد احتياطي وعقد صيانة' },
        { en: 'Building access control systems', ar: 'أنظمة التحكم بالدخول' },
    ],
    'Office': [
        { en: 'Workspace MEP maintenance', ar: 'صيانة MEP لمساحة العمل' },
        { en: 'AC units & ventilation service', ar: 'خدمة وحدات التكييف والتهوية' },
        { en: 'Fire & emergency AMC', ar: 'عقد صيانة الحريق والطوارئ' },
        { en: 'Electrical safety checks', ar: 'فحوصات سلامة الكهرباء' },
        { en: 'Water tank sterilization', ar: 'تعقيم خزان المياه' },
    ],
    'Retail Center': [
        { en: 'Shop MEP emergency response', ar: 'استجابة طوارئ MEP للمحلات' },
        { en: 'Escalator & elevator AMC', ar: 'عقد صيانة السلالم المتحركة والمصاعد' },
        { en: 'Food court grease trap service', ar: 'خدمة مصيدة الشحوم لمنطقة المطاعم' },
        { en: 'Fire safety & CCTV AMC', ar: 'عقد صيانة الحريق والكاميرات' },
        { en: 'Common area cleaning systems', ar: 'أنظمة تنظيف المناطق المشتركة' },
        { en: 'Parking area lighting & systems', ar: 'إضاءة وأنظمة منطقة الانتظار' },
    ],
    'Warehouse': [
        { en: 'Industrial MEP maintenance', ar: 'صيانة MEP الصناعية' },
        { en: 'Fire pump & sprinkler system AMC', ar: 'عقد صيانة مضخة الحريق والرشاشات' },
        { en: 'Loading bay door & shutter systems', ar: 'أنظمة أبواب وشترات منطقة التحميل' },
        { en: 'HVAC & industrial ventilation', ar: 'تكييف وتهوية صناعية' },
        { en: 'Emergency lighting & electrical safety', ar: 'إضاءة طوارئ وسلامة كهربائية' },
    ],
    'Industrial Property': [
        { en: 'Heavy MEP maintenance', ar: 'صيانة MEP الثقيلة' },
        { en: 'Fire safety systems AMC', ar: 'عقد صيانة أنظمة سلامة الحريق' },
        { en: 'Industrial ventilation & HVAC', ar: 'تهوية وتكييف صناعي' },
        { en: 'Power systems & electrical safety', ar: 'أنظمة الطاقة وسلامة الكهرباء' },
        { en: 'Safety compliance reporting', ar: 'تقارير الامتثال للسلامة' },
    ],
    'Labour Camp': [
        { en: 'Accommodation MEP maintenance', ar: 'صيانة MEP للإقامة' },
        { en: 'Water tank sterilization (all blocks)', ar: 'تعقيم خزانات المياه (جميع المباني)' },
        { en: 'Pest control AMC', ar: 'عقد صيانة مكافحة الآفات' },
        { en: 'Fire safety systems', ar: 'أنظمة سلامة الحريق' },
        { en: 'Laundry & kitchen systems maintenance', ar: 'صيانة أنظمة المغسلة والمطبخ' },
        { en: 'Ministry-compliant health & safety log', ar: 'سجل صحة وسلامة متوافق مع الوزارة' },
    ],
    'Staff Accommodation': [
        { en: 'Accommodation MEP maintenance', ar: 'صيانة MEP للإقامة' },
        { en: 'Water tank sterilization', ar: 'تعقيم خزان المياه' },
        { en: 'Fire safety systems', ar: 'أنظمة سلامة الحريق' },
        { en: 'Common area maintenance', ar: 'صيانة المناطق المشتركة' },
        { en: 'AC unit service', ar: 'خدمة وحدات التكييف' },
    ],
    'Government Property': [
        { en: 'Government-standard MEP maintenance', ar: 'صيانة MEP بمعايير حكومية' },
        { en: 'Security & access control systems AMC', ar: 'عقد صيانة أنظمة الأمن والتحكم بالدخول' },
        { en: 'VIP area priority response', ar: 'استجابة ذات أولوية لمنطقة كبار الشخصيات' },
        { en: 'Fire & emergency systems AMC', ar: 'عقد صيانة أنظمة الحريق والطوارئ' },
        { en: 'CCTV & surveillance AMC', ar: 'عقد صيانة CCTV والمراقبة' },
        { en: 'Government compliance documentation', ar: 'وثائق الامتثال الحكومية' },
    ],
    'Mixed-Use Tower': [
        { en: 'Residential floor MEP response', ar: 'استجابة MEP للطوابق السكنية' },
        { en: 'Commercial floor MEP systems', ar: 'أنظمة MEP للطوابق التجارية' },
        { en: 'Multiple elevator banks AMC', ar: 'عقد صيانة بنوك المصاعد المتعددة' },
        { en: 'Pool & gym maintenance', ar: 'صيانة المسبح والصالة الرياضية' },
        { en: 'Retail podium fire safety & systems', ar: 'سلامة الحريق وأنظمة البودية التجارية' },
        { en: 'District cooling or central HVAC', ar: 'التبريد المركزي أو HVAC المركزي' },
    ],
    'Skyscraper': [
        { en: 'High-rise MEP systems maintenance', ar: 'صيانة أنظمة MEP للمباني الشاهقة' },
        { en: 'Facade / BMU access & maintenance', ar: 'صيانة واجهة الوصول / BMU' },
        { en: 'Elevator bank AMC (30+ floors)', ar: 'عقد صيانة بنوك المصاعد (30+ طابق)' },
        { en: 'District cooling optimization', ar: 'تحسين التبريد المركزي' },
        { en: 'Fire & life safety systems AMC', ar: 'عقد صيانة أنظمة الحريق وسلامة الحياة' },
        { en: 'Building management system (BMS) support', ar: 'دعم نظام إدارة المبنى (BMS)' },
    ],
    'Farm / Estate': [
        { en: 'Irrigation system maintenance & repairs', ar: 'صيانة وإصلاح نظام الري' },
        { en: 'Pump room MEP maintenance', ar: 'صيانة MEP لغرفة المضخات' },
        { en: 'Landscape lighting & external electrical', ar: 'إضاءة الحديقة والكهرباء الخارجية' },
        { en: 'Generator AMC', ar: 'عقد صيانة المولد' },
        { en: 'Staff quarters MEP maintenance', ar: 'صيانة MEP لسكن الموظفين' },
    ],
};

const propertyTypeExclusions: Record<string, LocalText[]> = {
    'Villa': [
        { en: 'Tenant disputes or rent collection', ar: 'نزاعات المستأجرين أو تحصيل الإيجار' },
        { en: 'Structural / civil works without separate contract', ar: 'أعمال إنشائية / مدنية بدون عقد منفصل' },
        { en: 'Swimming pool chemical supply', ar: 'توريد مواد كيميائية للمسبح' },
        { en: 'Landscaping plants & materials', ar: 'نباتات ومواد تنسيق الحدائق' },
    ],
    'Hotel': [
        { en: 'Guest complaints / hospitality disputes', ar: 'شكاوى الضيوف / نزاعات الضيافة' },
        { en: 'Food & beverage supply', ar: 'توريد الأغذية والمشروبات' },
        { en: 'Guest room furnishing or decoration', ar: 'أثاث أو ديكور غرف الضيوف' },
        { en: 'Revenue management or hotel operations', ar: 'إدارة الإيرادات أو العمليات الفندقية' },
    ],
    'Hospital': [
        { en: 'Medical equipment supply or calibration', ar: 'توريد أو معايرة المعدات الطبية' },
        { en: 'Clinical or patient care services', ar: 'الخدمات السريرية أو رعاية المرضى' },
        { en: 'Pharmaceutical supply', ar: 'توريد الأدوية' },
        { en: 'Medical waste disposal', ar: 'التخلص من النفايات الطبية' },
    ],
    'School': [
        { en: 'Teaching or educational services', ar: 'خدمات التدريس أو التعليم' },
        { en: 'School bus maintenance or transport', ar: 'صيانة الحافلات المدرسية أو النقل' },
        { en: 'Kitchen food supply or catering', ar: 'توريد الطعام أو خدمات التموين' },
        { en: 'IT systems or AV equipment', ar: 'أنظمة تقنية المعلومات أو معدات AV' },
    ],
    'Mosque / Masjid': [
        { en: 'Imam / religious staff employment', ar: 'توظيف الأئمة والموظفين الدينيين' },
        { en: 'Carpet supply or replacement', ar: 'توريد السجاد أو استبداله' },
        { en: 'Chandelier supply without separate quote', ar: 'توريد الثريات بدون عرض سعر منفصل' },
        { en: 'Awqaf authority fees or licensing', ar: 'رسوم الأوقاف أو التراخيص' },
    ],
    'Warehouse': [
        { en: 'Goods storage or inventory management', ar: 'تخزين البضائع أو إدارة المخزون' },
        { en: 'Racking supply or installation', ar: 'توريد أو تركيب الرفوف' },
        { en: 'Forklift or equipment maintenance', ar: 'صيانة الرافعات الشوكية أو المعدات' },
        { en: 'Hazmat disposal without specialist quote', ar: 'التخلص من المواد الخطرة بدون عرض متخصص' },
    ],
    'Labour Camp': [
        { en: 'Labour recruitment or HR services', ar: 'استقطاب العمالة أو خدمات الموارد البشرية' },
        { en: 'Food catering or meal preparation', ar: 'تموين الطعام أو إعداد الوجبات' },
        { en: 'Medical or clinic services', ar: 'الخدمات الطبية أو العيادية' },
        { en: 'Visa or government document processing', ar: 'معالجة التأشيرات أو المستندات الحكومية' },
    ],
    'Stadium': [
        { en: 'Event management or crowd control staffing', ar: 'إدارة الفعاليات أو موظفو التحكم بالحشود' },
        { en: 'Pitch turf supply or replacement', ar: 'توريد أو استبدال العشب' },
        { en: 'Concessions supply or food services', ar: 'توريد الامتيازات أو خدمات الطعام' },
        { en: 'Ticketing or event technology systems', ar: 'أنظمة التذاكر أو التقنية الخاصة بالفعاليات' },
    ],
    'Farm / Estate': [
        { en: 'Agricultural produce or crops', ar: 'المنتجات الزراعية أو المحاصيل' },
        { en: 'Livestock or animal care', ar: 'رعاية الماشية أو الحيوانات' },
        { en: 'Irrigation pipes supply', ar: 'توريد أنابيب الري' },
        { en: 'Agricultural chemicals or fertilizers', ar: 'المبيدات الزراعية أو الأسمدة' },
    ],
    default: [
        { en: 'Repairs above AED 1,000 without owner approval', ar: 'الإصلاحات فوق 1,000 درهم بدون موافقة المالك' },
        { en: 'Major replacement works', ar: 'أعمال الاستبدال الكبيرة' },
        { en: 'Civil renovation or fit-out', ar: 'التجديد المدني أو أعمال التجهيز' },
        { en: 'Materials and specialist invoices unless quoted', ar: 'المواد وفواتير المختصين ما لم يتم تسعيرها' },
    ],
};

const excludedScopes: Record<string, LocalText[]> = {
    pm_only: [
        { en: 'PPM visits', ar: 'زيارات الصيانة الوقائية' },
        { en: 'Technical labor', ar: 'العمالة الفنية' },
        { en: 'Parts and materials', ar: 'قطع الغيار والمواد' },
        { en: 'Maintenance repairs unless separately approved', ar: 'إصلاحات الصيانة ما لم تتم الموافقة عليها بشكل منفصل' },
    ],
    default: [
        { en: 'Repairs above AED 1,000 without owner approval', ar: 'الإصلاحات فوق 1,000 درهم بدون موافقة المالك' },
        { en: 'Major replacement works', ar: 'أعمال الاستبدال الكبيرة' },
        { en: 'Civil renovation or fit-out', ar: 'التجديد المدني أو أعمال التجهيز' },
        { en: 'Materials and specialist invoices unless quoted', ar: 'المواد وفواتير المختصين ما لم يتم تسعيرها' },
    ],
};

const CommercialTermsStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, propertyData, selectedAddOns, updateProperty, calculateSummary, portfolioSummary } = useOnboardingStore();
    const { t, isRTL, lang } = useLanguage();
    const ar = lang === 'ar';

    const activePropertyIndex = 0;
    const property = properties[activePropertyIndex] || propertyData || ({} as any);

    useEffect(() => {
        calculateSummary();
    }, [properties, calculateSummary]);

    const plans = [
        { id: 'FM_ONLY', strategy: 'fm_only', name: t('onboarding.plan.amc'), icon: <Wrench size={24} />, desc: t('onboarding.plan.amc_desc') },
        { id: 'PM_ONLY', strategy: 'pm_only', name: t('onboarding.plan.pm'), icon: <UserCheck size={24} />, desc: t('onboarding.plan.pm_desc') },
        { id: 'BOTH', strategy: 'both', name: t('onboarding.plan.ifm'), icon: <ShieldCheck size={24} />, desc: t('onboarding.plan.ifm_desc') }
    ];

    const propertyType = String(property.propertyType || '').toLowerCase();
    const isMajlis = Boolean(property.majlis || propertyType.includes('majlis') || property.useType === 'Government');
    const availablePlans = isMajlis ? plans.filter(p => p.id === 'FM_ONLY') : plans;

    useEffect(() => {
        if (isMajlis && property.strategy !== 'fm_only') updateProperty(activePropertyIndex, { strategy: 'fm_only' });
    }, [isMajlis, property.strategy, updateProperty]);

    const slaTiers = [
        { id: 'standard', label: isMajlis ? t('onboarding.sla.majlis_basic') : t('onboarding.sla.standard'), desc: isMajlis ? t('onboarding.sla.majlis_basic_desc') : t('onboarding.sla.standard_desc'), ppm: isMajlis ? majlisPpmTextByTier.standard : ppmTextByTier.standard },
        { id: 'premium', label: isMajlis ? t('onboarding.sla.majlis_premium') : t('onboarding.sla.premium'), desc: isMajlis ? t('onboarding.sla.majlis_premium_desc') : t('onboarding.sla.premium_desc'), ppm: isMajlis ? majlisPpmTextByTier.premium : ppmTextByTier.premium },
        { id: 'elite', label: isMajlis ? t('onboarding.sla.majlis_elite') : t('onboarding.sla.elite'), desc: isMajlis ? t('onboarding.sla.majlis_elite_desc') : t('onboarding.sla.elite_desc'), ppm: isMajlis ? majlisPpmTextByTier.elite : ppmTextByTier.elite },
    ];

    const paymentPlans = [
        { id: 'annual', label: t('onboarding.payment.annual'), desc: t('onboarding.payment.annual_desc'), detail: paymentPlanDetails.annual },
        { id: 'quarterly', label: t('onboarding.payment.quarterly'), desc: t('onboarding.payment.quarterly_desc'), detail: paymentPlanDetails.quarterly },
        { id: 'monthly', label: t('onboarding.payment.monthly'), desc: t('onboarding.payment.monthly_desc'), detail: paymentPlanDetails.monthly }
    ];

    const handleUpdate = (data: any) => updateProperty(activePropertyIndex, data);
    const quote = portfolioSummary.quoteResults?.[property?.id] || Object.values(portfolioSummary.quoteResults || {})[0];
    const selectedStrategy = property.strategy || 'fm_only';
    const selectedPaymentPlan = property.paymentPlan || 'annual';
    const selectedSlaTier = property.slaTier || 'standard';
    const isAnnualPayment = selectedPaymentPlan === 'annual';
    const selectedPaymentAmount = selectedPaymentPlan === 'monthly' ? quote?.monthlyPayment || 0 : selectedPaymentPlan === 'quarterly' ? quote?.quarterlyPayment || 0 : quote?.annualTotal || 0;
    const selectedPaymentLabel = isAnnualPayment ? tx(copy.fullAnnualPayment, ar) : t(`onboarding.payment.${selectedPaymentPlan}`);
    const selectedPpmText = selectedStrategy === 'pm_only' ? (ar ? 'لا توجد صيانة وقائية تقنية ضمن إدارة العقارات فقط.' : 'No technical PPM included in Property Management Only.') : tx(isMajlis ? majlisPpmTextByTier[selectedSlaTier] : ppmTextByTier[selectedSlaTier], ar);
    const selectedResponseText = tx(responseTextByTier[selectedSlaTier] || responseTextByTier.standard, ar);
    const selectedSystems = Object.entries(systemLabels).filter(([key]) => key === 'lifts' ? Number(property.lifts || 0) > 0 : Boolean(property[key])).map(([key, value]) => key === 'lifts' ? `${tx(value, ar)} (${property.lifts || 1})` : tx(value, ar));
    const selectedAddOnNames = (selectedAddOns || []).map((id) => addOnLabels[id] ? tx(addOnLabels[id], ar) : id.replace(/_/g, ' '));
    const propertyTypeKey = String(property.propertyType || '');
    const allTypeInclusions = { ...propertyTypeInclusions, ...remainingPropertyTypeInclusions };
    const typeSpecificInclusions = allTypeInclusions[propertyTypeKey];
    const includedScope = typeSpecificInclusions || (selectedStrategy === 'pm_only' ? includedScopes.pm_only : selectedStrategy === 'both' ? includedScopes.both : includedScopes.fm_only);
    const excludedScope = propertyTypeExclusions[propertyTypeKey] || (selectedStrategy === 'pm_only' ? excludedScopes.pm_only : excludedScopes.default);

    return (
        <Box sx={{ py: 2 }} dir={isRTL ? 'rtl' : 'ltr'}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{t('onboarding.commercial_title')}</Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 820, mx: 'auto' }}>{t('onboarding.commercial_desc')}</Typography>
            </Box>

            <Container maxWidth="xl">
                <Grid container spacing={4}>
                    <Grid item xs={12} lg={8}>
                        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', mb: 4 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>1. {t('onboarding.plan_select')}</Typography>
                            <Grid container spacing={2}>
                                {availablePlans.map((plan) => {
                                    const isSelected = selectedStrategy === plan.strategy;
                                    return <Grid item xs={12} sm={isMajlis ? 12 : 4} key={plan.id}>
                                        <Paper onClick={() => handleUpdate({ strategy: plan.strategy })} sx={{ p: 3, height: '100%', cursor: 'pointer', bgcolor: isSelected ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.02)', border: `2px solid ${isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`, borderRadius: 4, transition: 'all 0.2s ease', textAlign: 'center' }}>
                                            <Box sx={{ color: binThemeTokens.gold, mb: 2, display: 'flex', justifyContent: 'center' }}>{plan.icon}</Box>
                                            <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{isMajlis ? t('onboarding.plan.majlis') : plan.name}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)', display: 'block', lineHeight: 1.7 }}>{isMajlis ? t('onboarding.plan.majlis_desc') : plan.desc}</Typography>
                                        </Paper>
                                    </Grid>;
                                })}
                            </Grid>
                        </Paper>

                        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(17,17,18,0.82)', border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`, mb: 4 }}>
                            <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} sx={{ mb: 3 }}>
                                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: ar ? 0 : 2 }}>{tx(copy.serviceScopeDetails, ar)}</Typography>
                                    <Typography variant="h6" fontWeight="950" color="#FFF">{tx(copy.ppmCoverage, ar)}</Typography>
                                </Box>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip icon={<CalendarCheck size={16} />} label={tx(copy.ppmSchedule, ar)} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }} />
                                    <Chip icon={<ClipboardCheck size={16} />} label={tx(copy.completionProof, ar)} sx={{ bgcolor: 'rgba(34,197,94,0.12)', color: '#86efac', fontWeight: 900 }} />
                                </Stack>
                            </Stack>
                            <Grid container spacing={2.5}>
                                <Grid item xs={12} md={6}><Paper sx={{ p: 2.5, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}><Typography variant="subtitle2" fontWeight="950" color={binThemeTokens.gold} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}><CalendarCheck size={17} /> {tx(copy.ppmProgram, ar)}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', mt: 1.2, lineHeight: 1.75, textAlign: isRTL ? 'right' : 'left' }}>{selectedPpmText}</Typography></Paper></Grid>
                                <Grid item xs={12} md={6}><Paper sx={{ p: 2.5, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}><Typography variant="subtitle2" fontWeight="950" color={binThemeTokens.gold} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}><Timer size={17} /> {tx(copy.slaResponse, ar)}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', mt: 1.2, lineHeight: 1.75, textAlign: isRTL ? 'right' : 'left' }}>{selectedResponseText}</Typography></Paper></Grid>
                                <Grid item xs={12} md={6}><Paper sx={{ p: 2.5, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}><Typography variant="subtitle2" fontWeight="950" color="#86efac" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}><CheckCircle2 size={17} /> {tx(copy.included, ar)}</Typography><Stack spacing={1} sx={{ mt: 1.5 }}>{includedScope.map(item => <Typography key={item.en} variant="caption" sx={{ color: 'rgba(255,255,255,0.68)', lineHeight: 1.55, textAlign: isRTL ? 'right' : 'left' }}>• {tx(item, ar)}</Typography>)}</Stack></Paper></Grid>
                                <Grid item xs={12} md={6}><Paper sx={{ p: 2.5, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}><Typography variant="subtitle2" fontWeight="950" color="#fca5a5" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}><XCircle size={17} /> {tx(copy.notIncluded, ar)}</Typography><Stack spacing={1} sx={{ mt: 1.5 }}>{excludedScope.map(item => <Typography key={item.en} variant="caption" sx={{ color: 'rgba(255,255,255,0.68)', lineHeight: 1.55, textAlign: isRTL ? 'right' : 'left' }}>• {tx(item, ar)}</Typography>)}</Stack></Paper></Grid>
                                <Grid item xs={12}><Paper sx={{ p: 2.5, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }}><Typography variant="subtitle2" fontWeight="950" color={binThemeTokens.gold}>{tx(copy.selectedSystems, ar)}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>{(selectedSystems.length ? selectedSystems : [tx(copy.noSystems, ar)]).map(item => <Chip key={item} size="small" label={item} sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: '#FFF', fontWeight: 800 }} />)}{(selectedAddOnNames.length ? selectedAddOnNames : [tx(copy.mandatoryAddons, ar)]).map(item => <Chip key={item} size="small" label={item} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }} />)}</Stack></Paper></Grid>
                            </Grid>
                        </Paper>

                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}><Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>2. {t('onboarding.sla_title')}</Typography><RadioGroup value={selectedSlaTier} onChange={(e) => handleUpdate({ slaTier: e.target.value })}>{slaTiers.map(tier => <FormControlLabel key={tier.id} value={tier.id} control={<Radio sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />} label={<Box sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, textAlign: isRTL ? 'right' : 'left' }}><Typography variant="subtitle2" fontWeight="900" color="#FFF">{tier.label}</Typography><Typography variant="caption" color="rgba(255,255,255,0.58)" sx={{ lineHeight: 1.65, display: 'block' }}>{tier.desc}</Typography><Typography variant="caption" color={binThemeTokens.gold} sx={{ lineHeight: 1.65, display: 'block', mt: 0.5 }}>{tx(copy.ppmPrefix, ar)} {tx(tier.ppm, ar)}</Typography></Box>} sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', mr: 0, flexDirection: isRTL ? 'row-reverse' : 'row' }} />)}</RadioGroup></Paper></Grid>
                            <Grid item xs={12} md={6}><Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>3. {t('onboarding.payment_title')}</Typography><RadioGroup value={selectedPaymentPlan} onChange={(e) => handleUpdate({ paymentPlan: e.target.value })}>{paymentPlans.map(plan => <FormControlLabel key={plan.id} value={plan.id} control={<Radio sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />} label={<Box sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, textAlign: isRTL ? 'right' : 'left' }}><Typography variant="subtitle2" fontWeight="900" color="#FFF">{plan.label}</Typography><Typography variant="caption" color="rgba(255,255,255,0.58)" sx={{ lineHeight: 1.65, display: 'block' }}>{plan.desc}</Typography><Typography variant="caption" color={binThemeTokens.gold} sx={{ lineHeight: 1.65, display: 'block', mt: 0.5 }}>{tx(plan.detail, ar)}</Typography></Box>} sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', mr: 0, flexDirection: isRTL ? 'row-reverse' : 'row' }} />)}</RadioGroup></Paper></Grid>
                        </Grid>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.8)', border: `2px solid ${binThemeTokens.gold}`, position: { lg: 'sticky' }, top: 24 }}>
                            <Box sx={{ textAlign: 'center', mb: 3 }}><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: ar ? 0 : 2 }}>{t('onboarding.quote_est')}</Typography><Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>AED {formatAED(quote?.annualTotal || 0)}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{t('onboarding.vat_excl')}</Typography></Box>
                            <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />
                            <Stack spacing={1.5} sx={{ mb: 3 }}>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'block', letterSpacing: ar ? 0 : 0.5 }}>{ar ? 'تفاصيل السعر' : 'Pricing Breakdown'}</Typography>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="caption" color="rgba(255,255,255,0.55)">{ar ? 'الصيانة الأساسية' : 'Base Maintenance'}</Typography><Typography variant="caption" color="rgba(255,255,255,0.85)" fontWeight="700">AED {formatAED(quote?.baseQuote || 0)}</Typography></Box>
                                {(quote?.complexityPremium || 0) > 0 && <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="caption" color="rgba(255,255,255,0.55)">{ar ? 'علاوة التعقيد والامتثال' : 'Complexity & Compliance'}</Typography><Typography variant="caption" color="rgba(255,255,255,0.85)" fontWeight="700">AED {formatAED(quote?.complexityPremium || 0)}</Typography></Box>}
                                {(quote?.addOnTotal || 0) > 0 && <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="caption" color="rgba(255,255,255,0.55)">{ar ? 'خدمات إضافية' : 'Add-on Services'}</Typography><Typography variant="caption" color="rgba(255,255,255,0.85)" fontWeight="700">AED {formatAED(quote?.addOnTotal || 0)}</Typography></Box>}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="caption" color="rgba(255,255,255,0.55)">{ar ? 'مستوى SLA' : 'SLA Tier'}</Typography><Typography variant="caption" color={binThemeTokens.gold} fontWeight="700">{slaTiers.find(s => s.id === selectedSlaTier)?.label}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="caption" color="rgba(255,255,255,0.55)">{ar ? 'خطة الدفع' : 'Payment Plan'}</Typography><Typography variant="caption" color="rgba(255,255,255,0.85)" fontWeight="700">{paymentPlans.find(p => p.id === selectedPaymentPlan)?.label}</Typography></Box>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="caption" color="rgba(255,255,255,0.7)" fontWeight="900">{ar ? 'الإجمالي السنوي (بدون VAT)' : 'Annual Total (excl. VAT)'}</Typography><Typography variant="caption" color={binThemeTokens.gold} fontWeight="950">AED {formatAED(quote?.annualTotal || 0)}</Typography></Box>
                            </Stack>
                            <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.08)' }} />
                            <Stack spacing={2} sx={{ mb: 4 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 2 }}><Typography variant="body2" color="rgba(255,255,255,0.6)">{selectedPaymentLabel}</Typography><Typography variant="body2" fontWeight="900" color={binThemeTokens.gold}>AED {formatAED(selectedPaymentAmount)}</Typography></Box>
                                {isAnnualPayment ? <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 2 }}><Typography variant="body2" color="rgba(255,255,255,0.6)">{t('onboarding.mobilization')}</Typography><Typography variant="body2" fontWeight="900" color="rgba(255,255,255,0.72)">{tx(copy.includedValue, ar)}</Typography></Box> : <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 2 }}><Typography variant="body2" color="rgba(255,255,255,0.6)">{t('onboarding.mobilization')}</Typography><Typography variant="body2" fontWeight="900" color="#FFF">AED {formatAED(quote?.mobilizationFee || 0)}</Typography></Box>}
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                                <Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'block' }}>{tx(copy.ppmSchedule, ar)}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{selectedPpmText}</Typography></Box>
                                <Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'block' }}>{tx(copy.approvalRule, ar)}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{tx(copy.approvalRuleText, ar)}</Typography></Box>
                            </Stack>
                            <Button variant="contained" fullWidth size="large" onClick={onNext} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} sx={{ borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, boxShadow: '0 10px 20px rgba(198, 167, 94, 0.3)', '&:hover': { bgcolor: '#E6C77A' } }}>{t('onboarding.confirm_btn')}</Button>
                            <Button variant="text" fullWidth onClick={onBack} sx={{ mt: 1, color: 'rgba(255,255,255,0.45)', fontWeight: 800 }}>{t('onboarding.revise_btn')}</Button>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default CommercialTermsStep;
