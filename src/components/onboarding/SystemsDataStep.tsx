import React, { useMemo, useState } from 'react';
import { Box, Typography, Grid, Paper, Checkbox, Button, Stack, Chip, Divider, Container } from '@mui/material';
import { resolvePropertyMandatoryAddOns, useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { resolveAddOnAnnualPrice } from '../../utils/calculateUaeQuote2026';
import { SYSTEM_DRIVEN_ADDON_IDS } from '../../utils/calculateUaeQuote2026';

type LocalText = { en: string; ar: string };
type SystemItem = { key: string; label: LocalText };
type AddOnItem = { id: string; name: LocalText; desc: LocalText; price: number; reason: LocalText; unlock?: LocalText; afterVisit?: boolean };

const aed = (value: number) => `AED ${value.toLocaleString()}`;
const AFTER_VISIT: LocalText = { en: 'Price after site visit', ar: 'السعر بعد زيارة الموقع' };
const label = (text: LocalText, ar: boolean) => (ar ? text.ar : text.en);

// Displayed prices are the engine's annual prices (monthly list x 12 where the list is monthly),
// so the card can never disagree with what the server quote charges.
const addOnPrice = (id: string): number => {
  const annual = resolveAddOnAnnualPrice(id);
  if (annual === null) throw new Error(`Add-on '${id}' has no automatic annual price.`);
  return annual;
};

const ELEVATOR_ADDON_ID = 'elevator_amc';

const copy = {
  audit: { en: 'Systems & Add-ons Audit', ar: 'تدقيق الأنظمة والإضافات' },
  matrix: { en: 'Systems Matrix', ar: 'مصفوفة الأنظمة' },
  intro: { en: 'Select every critical building system. These choices control SLA scope, add-ons, dispatch readiness and quote accuracy.', ar: 'اختر كل نظام أساسي في العقار. هذه الخيارات تحدد نطاق الخدمة، الإضافات، جاهزية الإرسال ودقة التسعير.' },
  addonsOverline: { en: 'Operational Add-ons', ar: 'إضافات تشغيلية' },
  addonsTitle: { en: 'Select Additional Service Layers', ar: 'اختر طبقات خدمة إضافية' },
  addonsDesc: { en: 'Add manpower, compliance, hygiene, standby and specialist services directly to the same systems page before commercial confirmation.', ar: 'أضف خدمات العمالة والامتثال والنظافة والاستعداد والخدمات المتخصصة مباشرة قبل تأكيد العرض التجاري.' },
  required: { en: 'Required', ar: 'إلزامي' },
  annual: { en: 'Annual', ar: 'سنوي' },
  serviceStack: { en: 'Service Stack', ar: 'حزمة الخدمة' },
  scopeSummary: { en: 'Service scope summary', ar: 'ملخص نطاق الخدمة' },
  systemsSelected: { en: 'systems selected', ar: 'أنظمة مختارة' },
  commercialAddons: { en: 'commercial add-ons', ar: 'إضافات تجارية' },
  buildingScope: { en: 'Building systems scope', ar: 'نطاق أنظمة العقار' },
  selected: { en: 'selected', ar: 'مختارة' },
  detailNote: { en: 'Full system details remain selected in the matrix and will be saved to the property scope.', ar: 'تبقى تفاصيل الأنظمة محددة في المصفوفة وسيتم حفظها ضمن نطاق العقار.' },
  commercialTitle: { en: 'Commercial add-ons', ar: 'الإضافات التجارية' },
  totalTitle: { en: 'Annual add-on total', ar: 'إجمالي الإضافات السنوية' },
  totalNote: { en: 'List prices of the add-ons above (required and selected). Location, service level and payment plan factors are applied in the Review quote.', ar: 'أسعار القائمة للإضافات أعلاه (الإلزامية والمختارة). تطبق عوامل الموقع ومستوى الخدمة وخطة الدفع في عرض السعر النهائي للمراجعة.' },
  back: { en: 'Back', ar: 'رجوع' },
  next: { en: 'Continue', ar: 'متابعة' },
  requiredBecause: { en: 'Required by the systems you selected — included in your quote.', ar: 'إلزامي بسبب الأنظمة المختارة — مشمول في عرض السعر.' },
};

const systemGroups: Array<{ title: LocalText; systems: SystemItem[] }> = [
  {
    title: { en: 'Core MEP Systems', ar: 'أنظمة MEP الأساسية' },
    systems: [
      { key: 'electrical', label: { en: 'Electrical / Power', ar: 'الكهرباء / الطاقة' } },
      { key: 'plumbing', label: { en: 'Plumbing & Water', ar: 'السباكة والمياه' } },
      { key: 'drainage', label: { en: 'Drainage & Sewage', ar: 'الصرف الصحي والمجاري' } },
      { key: 'pumps', label: { en: 'Water Pumps', ar: 'مضخات المياه' } },
      { key: 'hvac', label: { en: 'HVAC / AC systems', ar: 'أنظمة التكييف والتهوية' } },
      { key: 'districtCooling', label: { en: 'District cooling', ar: 'التبريد المركزي' } },
      { key: 'tank', label: { en: 'Water tank', ar: 'خزان المياه' } },
      { key: 'gen', label: { en: 'Generator / backup power', ar: 'مولد / طاقة احتياطية' } },
      { key: 'lifts', label: { en: 'Lifts / elevators', ar: 'المصاعد' } },
    ],
  },
  {
    title: { en: 'Life Safety & Compliance', ar: 'السلامة والامتثال' },
    systems: [
      { key: 'fireAlarm', label: { en: 'Fire alarm system', ar: 'نظام إنذار الحريق' } },
      { key: 'firePump', label: { en: 'Fire pump system', ar: 'نظام مضخة الحريق' } },
      { key: 'sira', label: { en: 'SIRA / CCTV system', ar: 'نظام كاميرات / SIRA' } },
      { key: 'emergencyLighting', label: { en: 'Emergency Lighting', ar: 'إضاءة الطوارئ' } },
      { key: 'accessControl', label: { en: 'Access Control', ar: 'التحكم بالدخول' } },
      { key: 'bmu', label: { en: 'BMU / façade access', ar: 'وحدة الواجهات / الوصول للواجهة' } },
      { key: 'wasteMan', label: { en: 'Waste management room', ar: 'غرفة إدارة النفايات' } },
    ],
  },
  {
    title: { en: 'Amenities & Special Assets', ar: 'المرافق والأصول الخاصة' },
    systems: [
      { key: 'bms', label: { en: 'Building Mgmt System (BMS)', ar: 'نظام إدارة المبنى (BMS)' } },
      { key: 'iotSensors', label: { en: 'IoT Sensors', ar: 'حساسات إنترنت الأشياء' } },
      { key: 'pool', label: { en: 'Swimming pool', ar: 'المسبح' } },
      { key: 'gym', label: { en: 'Gymnasium / Fitness', ar: 'النادي الرياضي / اللياقة' } },
      { key: 'centralLPG', label: { en: 'Gas / LPG system', ar: 'نظام الغاز / LPG' } },
      { key: 'greaseTrap', label: { en: 'Grease trap', ar: 'مصيدة الشحوم' } },
      { key: 'majlisGarden', label: { en: 'Majlis garden / landscape', ar: 'حديقة المجلس / تنسيق خارجي' } },
      { key: 'solarIntegration', label: { en: 'Solar integration', ar: 'تكامل الطاقة الشمسية' } },
      { key: 'evReadiness', label: { en: 'EV charging readiness', ar: 'جاهزية شحن السيارات الكهربائية' } },
    ],
  },
];

const addOns: AddOnItem[] = [
  { id: 'fire_safety', name: { en: 'Fire Safety AMC', ar: 'عقد سلامة الحريق' }, price: addOnPrice('fire_safety'), desc: { en: 'Civil Defense compliance checks, alarm readiness and certification support.', ar: 'فحوصات امتثال الدفاع المدني وجاهزية الإنذار ودعم الشهادات.' }, reason: { en: 'Mandatory baseline for UAE occupied assets.', ar: 'متطلب أساسي للعقارات المشغولة في الإمارات.' } , unlock: { en: 'Select a fire alarm or fire pump system to include this.', ar: 'اختر نظام إنذار أو مضخة حريق لإضافة هذا.' } },
  { id: 'water_tank', name: { en: 'Water Tank Sterilization', ar: 'تعقيم خزان المياه' }, price: addOnPrice('water_tank'), desc: { en: 'Quarterly cleaning, sterilization and hygiene documentation.', ar: 'تنظيف وتعقيم ربع سنوي مع توثيق النظافة.' }, reason: { en: 'Required when water tanks exist.', ar: 'مطلوب عند وجود خزانات مياه.' } , unlock: { en: 'Select the water tank system to include this.', ar: 'اختر نظام خزان المياه لإضافة هذا.' } },
  { id: 'elevator_amc', name: { en: 'Elevator / Lift AMC', ar: 'عقد صيانة المصاعد' }, price: addOnPrice('elevator_amc'), desc: { en: 'Lift inspections, safety checks and service coordination.', ar: 'فحوصات المصاعد والسلامة وتنسيق الخدمة.' }, reason: { en: 'Required only when the asset has floors/lifts. Hidden for Majlis assets.', ar: 'مطلوب فقط عند وجود أدوار أو مصاعد. مخفي لأصول المجالس.' } , unlock: { en: 'Select lifts / elevators to include this.', ar: 'اختر المصاعد لإضافة هذا.' } },
  { id: 'hvac_pm', name: { en: 'HVAC Preventive Maintenance', ar: 'صيانة وقائية للتكييف' }, price: addOnPrice('hvac_pm'), desc: { en: 'AC inspections, filters, coils, drain lines and performance checks.', ar: 'فحوصات المكيفات والفلاتر والملفات وخطوط التصريف والأداء.' }, reason: { en: 'UAE climate makes HVAC continuity mission-critical.', ar: 'مناخ الإمارات يجعل استمرارية التكييف أمراً أساسياً.' } , unlock: { en: 'Select HVAC / AC systems to include this.', ar: 'اختر أنظمة التكييف لإضافة هذا.' } },
  { id: 'cleaning', name: { en: 'Cleaning Team / Deep Cleaning', ar: 'فريق تنظيف / تنظيف عميق' }, price: addOnPrice('cleaning'), desc: { en: 'Common area cleaning and scheduled hygiene operations.', ar: 'تنظيف المناطق المشتركة وجدولة عمليات النظافة.' }, reason: { en: 'Recommended for shared facilities and Majlis readiness.', ar: 'موصى به للمرافق المشتركة وجاهزية المجالس.' } },
  { id: 'security', name: { en: 'Security Services / CCTV', ar: 'خدمات أمن / كاميرات' }, price: addOnPrice('security'), desc: { en: 'Guarding coordination, access control and incident logging.', ar: 'تنسيق الحراسة والتحكم بالدخول وتسجيل الحوادث.' }, reason: { en: 'Optional manpower layer for towers, retail and high-value assets.', ar: 'طبقة عمالة اختيارية للأبراج والتجزئة والأصول عالية القيمة.' } },
  { id: 'pest_control', name: { en: 'Pest Control', ar: 'مكافحة الحشرات' }, price: addOnPrice('pest_control'), desc: { en: 'Quarterly municipality-approved pest control treatments.', ar: 'معالجات ربع سنوية معتمدة من البلدية لمكافحة الحشرات.' }, reason: { en: 'Standard preventive hygiene measure.', ar: 'إجراء وقائي قياسي للنظافة.' } },
  { id: 'landscaping', name: { en: 'Landscaping & Irrigation', ar: 'تنسيق الحدائق والري' }, price: addOnPrice('landscaping'), desc: { en: 'Garden maintenance, pruning and irrigation system checks.', ar: 'صيانة الحدائق والتقليم وفحص نظام الري.' }, reason: { en: 'Essential for outdoor and garden spaces.', ar: 'أساسي للمساحات الخارجية والحدائق.' } },
  { id: 'move_in_out_inspection', name: { en: 'Move-in / Move-out Inspection', ar: 'فحص الدخول / الخروج' }, price: addOnPrice('move_in_out_inspection'), desc: { en: 'Snagging and condition report before/after tenancy or event.', ar: 'تقرير ملاحظات وحالة قبل أو بعد الإيجار أو المناسبة.' }, reason: { en: 'Protects asset condition and lifecycle.', ar: 'يحمي حالة الأصل ودورة حياته.' } },
  { id: 'mep_support', name: { en: 'MEP Support', ar: 'دعم MEP' }, price: addOnPrice('mep_support'), desc: { en: 'Integrated mechanical, electrical and plumbing preventive support.', ar: 'دعم وقائي متكامل للميكانيكا والكهرباء والسباكة.' }, reason: { en: 'Core operational resilience layer.', ar: 'طبقة أساسية لاستمرارية التشغيل.' } },
  { id: 'waste_management', name: { en: 'Waste Management', ar: 'إدارة النفايات' }, price: addOnPrice('waste_management'), desc: { en: 'Waste room checks and disposal schedule coordination.', ar: 'فحص غرفة النفايات وتنسيق جدول التخلص.' }, reason: { en: 'Optional hygiene and disposal coordination layer.', ar: 'طبقة اختيارية للنظافة وتنسيق التخلص.' } },
  { id: 'painting_room_refresh', afterVisit: true, name: { en: 'Painting - Room Refresh', ar: 'الدهان - تجديد الغرف' }, price: addOnPrice('painting_room_refresh'), desc: { en: 'Repaint selected rooms. Instant indicative range; fixed price confirmed after a site visit.', ar: 'إعادة دهان غرف مختارة. نطاق سعري تقديري فوري، والسعر النهائي بعد زيارة الموقع.' }, reason: { en: 'Billed separately after the visit. Not part of the annual contract price.', ar: 'يُحتسب بشكل منفصل بعد الزيارة، وليس ضمن سعر العقد السنوي.' } },
  { id: 'painting_full_home', afterVisit: true, name: { en: 'Painting - Full Home Repaint', ar: 'الدهان - إعادة دهان المنزل بالكامل' }, price: addOnPrice('painting_full_home'), desc: { en: 'Full interior repaint with surface preparation, before/after photos and a warranty record.', ar: 'إعادة دهان داخلي كامل مع تجهيز الأسطح وصور قبل وبعد وسجل ضمان.' }, reason: { en: 'Fixed quote after a site visit; you approve it with an OTP.', ar: 'عرض سعر ثابت بعد زيارة الموقع، وتوافق عليه برمز تحقق.' } },
  { id: 'painting_building_exterior', afterVisit: true, name: { en: 'Painting - Building Exterior', ar: 'الدهان - واجهة المبنى الخارجية' }, price: addOnPrice('painting_building_exterior'), desc: { en: 'Exterior façade painting. Needs a site visit, your OTP approval and the community/developer NOC before work starts.', ar: 'دهان الواجهة الخارجية. يتطلب زيارة موقع وموافقتك برمز تحقق وشهادة عدم ممانعة من المجتمع/المطور قبل البدء.' }, reason: { en: 'Fixed quote after a site visit. Includes before/after photos and a warranty record.', ar: 'عرض سعر ثابت بعد زيارة الموقع، مع صور قبل وبعد وسجل ضمان.' } },
];

// Add-ons the engine charges only when a matching system or fact is present. They are never ticked by hand,
// so they appear here only when required, with the same engine price the quote uses.
const systemDrivenExtras: AddOnItem[] = [
  { id: 'sira_renewal', name: { en: 'SIRA / CCTV Compliance Renewal', ar: 'تجديد امتثال SIRA / الكاميرات' }, price: addOnPrice('sira_renewal'), desc: { en: 'SIRA-approved CCTV maintenance and certificate renewal.', ar: 'صيانة الكاميرات المعتمدة من SIRA وتجديد الشهادة.' }, reason: { en: 'Required when a SIRA / CCTV system is selected.', ar: 'إلزامي عند اختيار نظام SIRA / الكاميرات.' } },
  { id: 'facade_access', name: { en: 'Façade Access / BMU Service', ar: 'خدمة الوصول للواجهة / BMU' }, price: addOnPrice('facade_access'), desc: { en: 'BMU inspection, certification and façade access support.', ar: 'فحص وحدة الواجهات واعتمادها ودعم الوصول للواجهة.' }, reason: { en: 'Required when a BMU / façade access system is selected.', ar: 'إلزامي عند اختيار وحدة الواجهات.' } },
  { id: 'pool_care', name: { en: 'Swimming Pool Care', ar: 'العناية بالمسبح' }, price: addOnPrice('pool_care'), desc: { en: 'Water chemistry, filtration and pool plant maintenance.', ar: 'كيمياء المياه والفلترة وصيانة معدات المسبح.' }, reason: { en: 'Required when a swimming pool is selected.', ar: 'إلزامي عند اختيار المسبح.' } },
  { id: 'pca_audit', name: { en: 'Property Condition Audit', ar: 'تدقيق حالة العقار' }, price: addOnPrice('pca_audit'), desc: { en: 'Condition audit of building fabric and MEP assets.', ar: 'تدقيق حالة هيكل المبنى وأصول MEP.' }, reason: { en: 'Required when the building is over 15 years old.', ar: 'إلزامي إذا كان عمر المبنى أكثر من 15 سنة.' } },
  { id: 'emergency_priority', name: { en: 'Emergency Priority Response', ar: 'استجابة طوارئ ذات أولوية' }, price: addOnPrice('emergency_priority'), desc: { en: 'Priority dispatch for emergencies.', ar: 'إرسال فوري للطوارئ.' }, reason: { en: 'Required for mosque facilities.', ar: 'إلزامي لمرافق المساجد.' } },
];

/** Normalised add-on list saved on the property: owner-chosen optional add-ons plus the engine's mandatory ones. */
export const normaliseOwnerAddOns = (stored: unknown, mandatory: string[]): string[] => {
  const optional = (Array.isArray(stored) ? stored : []).map(String).filter((id) => id && !SYSTEM_DRIVEN_ADDON_IDS.has(id) && !mandatory.includes(id));
  return Array.from(new Set([...optional, ...mandatory]));
};

const SystemsDataStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
  const { properties, propertyData, updateProperty, calculateSummary } = useOnboardingStore();
  const { isRTL, lang } = useLanguage();
  const ar = lang === 'ar';
  const [activePropertyIndex, setActivePropertyIndex] = useState(0);
  const activeProperty = properties[activePropertyIndex] || propertyData || ({} as any);
  const storedSelectedIds: string[] = Array.isArray(activeProperty.selectedAddOns) ? activeProperty.selectedAddOns : [];
  // Single source of truth: the same engine rule the client and server quotes use.
  const requiredStackIds = useMemo(() => resolvePropertyMandatoryAddOns(activeProperty), [activeProperty]);
  const visibleAddOns = [...addOns, ...systemDrivenExtras.filter((addon) => requiredStackIds.includes(addon.id) && !addOns.some((item) => item.id === addon.id))];
  const selectedIds = new Set(normaliseOwnerAddOns(storedSelectedIds, requiredStackIds));
  const selectedAddOnRows = visibleAddOns.filter((a) => selectedIds.has(a.id));
  const selectedSystemGroups = systemGroups
    .map((group) => ({ title: group.title, systems: group.systems.filter((system) => Boolean((activeProperty as any)[system.key])) }))
    .filter((group) => group.systems.length > 0);
  const selectedSystemCount = selectedSystemGroups.reduce((count, group) => count + group.systems.length, 0);
  const total = selectedAddOnRows.reduce((sum, a) => sum + a.price, 0);

  const setSystem = (key: string, checked: boolean) => {
    const patch = { [key]: key === 'lifts' ? (checked ? Math.max(activeProperty.lifts || 1, 1) : 0) : checked } as any;
    const mandatory = resolvePropertyMandatoryAddOns({ ...activeProperty, ...patch });
    updateProperty(activePropertyIndex, { ...patch, selectedAddOns: normaliseOwnerAddOns(storedSelectedIds, mandatory) });
    calculateSummary();
  };

  const setAddOn = (id: string, checked: boolean) => {
    if (requiredStackIds.includes(id) || SYSTEM_DRIVEN_ADDON_IDS.has(id)) return;
    const optional = normaliseOwnerAddOns(storedSelectedIds, requiredStackIds).filter((item) => item !== id);
    const next = normaliseOwnerAddOns(checked ? [...optional, id] : optional, requiredStackIds);
    updateProperty(activePropertyIndex, { selectedAddOns: next });
    calculateSummary();
  };

  const continueNext = () => {
    // Persist required add-ons for every property so page 3, Review and the submitted record list them.
    properties.forEach((property, index) => {
      const next = normaliseOwnerAddOns(property.selectedAddOns, resolvePropertyMandatoryAddOns(property));
      const current = Array.isArray(property.selectedAddOns) ? property.selectedAddOns : [];
      if (next.length !== current.length || next.some((id) => !current.includes(id))) updateProperty(index, { selectedAddOns: next });
    });
    calculateSummary();
    onNext();
  };

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ py: { xs: 2, md: 4 } }}>
      <Container maxWidth="xl" disableGutters>
        <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 6, bgcolor: binThemeTokens.card, border: `1px solid ${binThemeTokens.border}` }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: ar ? 0 : 4 }}>{label(copy.audit, ar)}</Typography>
            <Typography variant="h4" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 1 }}>{label(copy.matrix, ar)}</Typography>
            <Typography sx={{ color: binThemeTokens.textSecondary, maxWidth: 900, mx: 'auto', mt: 1 }}>{label(copy.intro, ar)}</Typography>
          </Box>

          {properties.length > 1 && <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
            {properties.map((property, index) => <Chip key={property.id || index} label={property.address || property.propertyType || `Property ${index + 1}`} color={index === activePropertyIndex ? 'primary' : 'default'} onClick={() => setActivePropertyIndex(index)} />)}
          </Stack>}
          <Grid container spacing={2.5} alignItems="stretch">
            <Grid item xs={12} xl={6.8}>
              <Grid container spacing={1.5} sx={{ height: '100%' }}>
                {systemGroups.map((group) => (
                  <Grid item xs={12} md={4} key={group.title.en}>
                    <Paper sx={{ p: 1.8, height: '100%', borderRadius: 4, bgcolor: binThemeTokens.softCanvas, border: `1px solid ${binThemeTokens.border}` }}>
                      <Typography variant="overline" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mb: 1.2, lineHeight: 1.5, letterSpacing: ar ? 0 : undefined }}>{label(group.title, ar)}</Typography>
                      <Stack spacing={0.75}>
                        {group.systems.map((system) => {
                          const checked = Boolean((activeProperty as any)[system.key]);
                          return (
                            <Paper key={system.key} onClick={() => setSystem(system.key, !checked)} sx={{ p: 1, minHeight: 48, borderRadius: 2.5, cursor: 'pointer', display: 'flex', gap: 1, alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row', bgcolor: checked ? 'rgba(198,167,94,.14)' : binThemeTokens.softCanvas, border: `1px solid ${checked ? 'rgba(198,167,94,.65)' : binThemeTokens.border}`, transition: '150ms ease', '&:hover': { borderColor: 'rgba(198,167,94,.7)' } }}>
                              <Checkbox checked={checked} onClick={(e) => e.stopPropagation()} onChange={(e) => setSystem(system.key, e.target.checked)} sx={{ p: 0, color: binThemeTokens.textSecondary, '&.Mui-checked': { color: binThemeTokens.gold } }} />
                              <Typography sx={{ color: checked ? binThemeTokens.textPrimary : binThemeTokens.textSecondary, fontWeight: 850, lineHeight: 1.22, fontSize: { xs: 14, md: 13.5 }, textAlign: isRTL ? 'right' : 'left' }}>{label(system.label, ar)}</Typography>
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Grid>

            <Grid item xs={12} xl={3.2}>
              <Paper sx={{ p: 2, height: '100%', borderRadius: 4, bgcolor: binThemeTokens.softCanvas, border: `1px solid ${binThemeTokens.border}` }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: ar ? 0 : 3 }}>{label(copy.addonsOverline, ar)}</Typography>
                <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 0.5 }}>{label(copy.addonsTitle, ar)}</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.textSecondary, mb: 1.5, lineHeight: 1.55 }}>{label(copy.addonsDesc, ar)}</Typography>
                <Stack spacing={1} sx={{ maxHeight: { xl: 590 }, overflowY: { xl: 'auto' }, pr: { xl: 0.5 } }}>
                  {visibleAddOns.map((addon) => {
                    const checked = selectedIds.has(addon.id);
                    const locked = requiredStackIds.includes(addon.id);
                    const unavailable = !locked && SYSTEM_DRIVEN_ADDON_IDS.has(addon.id);
                    return (
                      <Paper key={addon.id} onClick={() => setAddOn(addon.id, !checked)} sx={{ p: 1.2, borderRadius: 3, cursor: locked || unavailable ? 'default' : 'pointer', opacity: unavailable ? 0.72 : 1, bgcolor: checked ? 'rgba(198,167,94,.1)' : binThemeTokens.softCanvas, border: `1px solid ${checked ? 'rgba(198,167,94,.6)' : binThemeTokens.border}` }}>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="flex-start">
                          <Checkbox checked={checked} disabled={locked || unavailable} inputProps={{ 'aria-label': label(addon.name, ar) }} onClick={(e) => e.stopPropagation()} onChange={(e) => setAddOn(addon.id, e.target.checked)} sx={{ p: 0.2, color: binThemeTokens.textSecondary, '&.Mui-checked': { color: binThemeTokens.gold } }} />
                          <Box sx={{ minWidth: 0, flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={0.75} alignItems="center" flexWrap="wrap">
                              <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, fontSize: 13 }}>{label(addon.name, ar)}</Typography>
                              {locked && <Chip label={label(copy.required, ar)} size="small" sx={{ height: 18, fontSize: 9, color: '#ef4444', bgcolor: 'rgba(239,68,68,.12)', fontWeight: 900 }} />}
                            </Stack>
                            <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.textSecondary, lineHeight: 1.45 }}>{label(addon.desc, ar)}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.goldText, fontWeight: 950, mt: 0.5 }}>{addon.afterVisit ? label(AFTER_VISIT, ar) : <>{aed(addon.price)} / {label(copy.annual, ar)}</>}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.textSecondary, lineHeight: 1.35 }}>{locked ? label(copy.requiredBecause, ar) : unavailable && addon.unlock ? label(addon.unlock, ar) : label(addon.reason, ar)}</Typography>
                          </Box>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} xl={2}>
              <Paper sx={{ p: 2.2, height: '100%', borderRadius: 5, bgcolor: binThemeTokens.softCanvas, border: `1px solid ${binThemeTokens.border}` }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: ar ? 0 : 2 }}>{label(copy.serviceStack, ar)}</Typography>
                <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 900, mb: 0.5 }}>{label(copy.scopeSummary, ar)}</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.textSecondary, mb: 2 }}>{selectedSystemCount} {label(copy.systemsSelected, ar)} · {selectedAddOnRows.length} {label(copy.commercialAddons, ar)}</Typography>
                <Stack spacing={1.5} divider={<Divider sx={{ borderColor: binThemeTokens.border }} />}>
                  <Box>
                    <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mb: 1 }}>{label(copy.buildingScope, ar)}</Typography>
                    <Stack spacing={1}>
                      {systemGroups.map((group) => {
                        const count = selectedSystemGroups.find((selected) => selected.title.en === group.title.en)?.systems.length || 0;
                        return (
                          <Paper key={group.title.en} sx={{ p: 1.15, bgcolor: count > 0 ? 'rgba(198,167,94,.09)' : binThemeTokens.softCanvas, border: `1px solid ${count > 0 ? 'rgba(198,167,94,.34)' : binThemeTokens.border}`, borderRadius: 3 }}>
                            <Typography variant="caption" sx={{ display: 'block', color: count > 0 ? binThemeTokens.textPrimary : binThemeTokens.textSecondary, fontWeight: 900, lineHeight: 1.25 }}>{label(group.title, ar)}</Typography>
                            <Typography variant="caption" sx={{ color: count > 0 ? binThemeTokens.gold : binThemeTokens.textSecondary, fontWeight: 950 }}>{count} {label(copy.selected, ar)}</Typography>
                          </Paper>
                        );
                      })}
                    </Stack>
                    {selectedSystemCount > 0 && <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.textSecondary, mt: 1.25, lineHeight: 1.45 }}>{label(copy.detailNote, ar)}</Typography>}
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mb: 1 }}>{label(copy.commercialTitle, ar)}</Typography>
                    <Stack spacing={1}>
                      {selectedAddOnRows.map((addon) => (
                        <Box key={addon.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                          <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 850, lineHeight: 1.4 }}>{label(addon.name, ar)}</Typography>
                          <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, whiteSpace: 'nowrap' }}>{addon.afterVisit ? label(AFTER_VISIT, ar) : aed(addon.price)}</Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>

                  <Box sx={{ pt: 2 }}>
                    <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, lineHeight: 1.25 }}>{label(copy.totalTitle, ar)}</Typography>
                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, fontWeight: 950, mt: 0.75 }}>{aed(total)}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.textSecondary, mt: 0.75, lineHeight: 1.35 }}>{label(copy.totalNote, ar)}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" size="large" onClick={onBack} sx={{ borderRadius: 100, px: { xs: 4, sm: 6 }, flex: { xs: 1, sm: 'none' }, color: binThemeTokens.textSecondary, borderColor: binThemeTokens.textSecondary }}>{label(copy.back, ar)}</Button>
          <Button variant="contained" size="large" onClick={continueNext} sx={{ borderRadius: 100, px: { xs: 4, sm: 8 }, flex: { xs: 1, sm: 'none' }, bgcolor: binThemeTokens.gold, color: binThemeTokens.textPrimary, fontWeight: 950, '&:hover': { bgcolor: binThemeTokens.goldLight } }}>{label(copy.next, ar)}</Button>
        </Box>
      </Container>
    </Box>
  );
};

export default SystemsDataStep;
