import React, { useEffect, useMemo } from 'react';
import { Box, Typography, Grid, Paper, Checkbox, Button, Stack, Chip, Divider, Container } from '@mui/material';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type LocalText = { en: string; ar: string };
type SystemItem = { key: string; label: LocalText };
type AddOnItem = { id: string; name: LocalText; desc: LocalText; price: number; reason: LocalText; required?: boolean; defaultSelected?: boolean };

const aed = (value: number) => `AED ${value.toLocaleString()}`;
const label = (text: LocalText, ar: boolean) => (ar ? text.ar : text.en);

const BASE_REQUIRED_STACK_IDS = ['fire_safety', 'water_tank', 'hvac_pm'];
const ELEVATOR_ADDON_ID = 'elevator_amc';
const LEGACY_OPTIONAL_ADDON_IDS = ['waste_management'];
const LEGACY_OPTIONAL_PRUNE_KEY = 'bin-group:onboarding:optional-addons-pruned:v1';

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
  totalNote: { en: 'Systems define scope. Only commercial add-ons are counted in this AED total.', ar: 'الأنظمة تحدد نطاق الخدمة. يتم احتساب الإضافات التجارية فقط في إجمالي الدرهم.' },
  back: { en: 'Back', ar: 'رجوع' },
  next: { en: 'Initialize Analysis', ar: 'بدء التحليل' },
};

const isMajlisAsset = (property: any) => {
  const text = [property?.propertyType, property?.subType, property?.assetClass, property?.majlisType, property?.serviceModel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return Boolean(property?.majlis || property?.majlisGarden || (property?.majlisType && property.majlisType !== 'none') || text.includes('majlis'));
};

const getRequiredStackIds = (property: any) => {
  const ids = [...BASE_REQUIRED_STACK_IDS];
  const hasRealLiftScope = Number(property?.lifts || 0) > 0 || Number(property?.floors || 0) > 1;
  if (!isMajlisAsset(property) && hasRealLiftScope) ids.push(ELEVATOR_ADDON_ID);
  return ids;
};

const getHiddenAddOnIds = (property: any) => (isMajlisAsset(property) ? [ELEVATOR_ADDON_ID] : []);

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
  { id: 'fire_safety', name: { en: 'Fire Safety AMC', ar: 'عقد سلامة الحريق' }, required: true, defaultSelected: true, price: 8000, desc: { en: 'Civil Defense compliance checks, alarm readiness and certification support.', ar: 'فحوصات امتثال الدفاع المدني وجاهزية الإنذار ودعم الشهادات.' }, reason: { en: 'Mandatory baseline for UAE occupied assets.', ar: 'متطلب أساسي للعقارات المشغولة في الإمارات.' } },
  { id: 'water_tank', name: { en: 'Water Tank Sterilization', ar: 'تعقيم خزان المياه' }, required: true, defaultSelected: true, price: 2200, desc: { en: 'Quarterly cleaning, sterilization and hygiene documentation.', ar: 'تنظيف وتعقيم ربع سنوي مع توثيق النظافة.' }, reason: { en: 'Required when water tanks exist.', ar: 'مطلوب عند وجود خزانات مياه.' } },
  { id: 'elevator_amc', name: { en: 'Elevator / Lift AMC', ar: 'عقد صيانة المصاعد' }, price: 7500, desc: { en: 'Lift inspections, safety checks and service coordination.', ar: 'فحوصات المصاعد والسلامة وتنسيق الخدمة.' }, reason: { en: 'Required only when the asset has floors/lifts. Hidden for Majlis assets.', ar: 'مطلوب فقط عند وجود أدوار أو مصاعد. مخفي لأصول المجالس.' } },
  { id: 'hvac_pm', name: { en: 'HVAC Preventive Maintenance', ar: 'صيانة وقائية للتكييف' }, required: true, defaultSelected: true, price: 6680, desc: { en: 'AC inspections, filters, coils, drain lines and performance checks.', ar: 'فحوصات المكيفات والفلاتر والملفات وخطوط التصريف والأداء.' }, reason: { en: 'UAE climate makes HVAC continuity mission-critical.', ar: 'مناخ الإمارات يجعل استمرارية التكييف أمراً أساسياً.' } },
  { id: 'cleaning', name: { en: 'Cleaning Team / Deep Cleaning', ar: 'فريق تنظيف / تنظيف عميق' }, price: 18450, desc: { en: 'Common area cleaning and scheduled hygiene operations.', ar: 'تنظيف المناطق المشتركة وجدولة عمليات النظافة.' }, reason: { en: 'Recommended for shared facilities and Majlis readiness.', ar: 'موصى به للمرافق المشتركة وجاهزية المجالس.' } },
  { id: 'security', name: { en: 'Security Services / CCTV', ar: 'خدمات أمن / كاميرات' }, price: 36600, desc: { en: 'Guarding coordination, access control and incident logging.', ar: 'تنسيق الحراسة والتحكم بالدخول وتسجيل الحوادث.' }, reason: { en: 'Optional manpower layer for towers, retail and high-value assets.', ar: 'طبقة عمالة اختيارية للأبراج والتجزئة والأصول عالية القيمة.' } },
  { id: 'pest_control', name: { en: 'Pest Control', ar: 'مكافحة الحشرات' }, price: 2475, desc: { en: 'Quarterly municipality-approved pest control treatments.', ar: 'معالجات ربع سنوية معتمدة من البلدية لمكافحة الحشرات.' }, reason: { en: 'Standard preventive hygiene measure.', ar: 'إجراء وقائي قياسي للنظافة.' } },
  { id: 'landscaping', name: { en: 'Landscaping & Irrigation', ar: 'تنسيق الحدائق والري' }, price: 12000, desc: { en: 'Garden maintenance, pruning and irrigation system checks.', ar: 'صيانة الحدائق والتقليم وفحص نظام الري.' }, reason: { en: 'Essential for outdoor and garden spaces.', ar: 'أساسي للمساحات الخارجية والحدائق.' } },
  { id: 'move_in_out_inspection', name: { en: 'Move-in / Move-out Inspection', ar: 'فحص الدخول / الخروج' }, price: 1200, desc: { en: 'Snagging and condition report before/after tenancy or event.', ar: 'تقرير ملاحظات وحالة قبل أو بعد الإيجار أو المناسبة.' }, reason: { en: 'Protects asset condition and lifecycle.', ar: 'يحمي حالة الأصل ودورة حياته.' } },
  { id: 'mep_support', name: { en: 'MEP Support', ar: 'دعم MEP' }, price: 13500, desc: { en: 'Integrated mechanical, electrical and plumbing preventive support.', ar: 'دعم وقائي متكامل للميكانيكا والكهرباء والسباكة.' }, reason: { en: 'Core operational resilience layer.', ar: 'طبقة أساسية لاستمرارية التشغيل.' } },
  { id: 'waste_management', name: { en: 'Waste Management', ar: 'إدارة النفايات' }, price: 6600, desc: { en: 'Waste room checks and disposal schedule coordination.', ar: 'فحص غرفة النفايات وتنسيق جدول التخلص.' }, reason: { en: 'Optional hygiene and disposal coordination layer.', ar: 'طبقة اختيارية للنظافة وتنسيق التخلص.' } },
];

const SystemsDataStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
  const { properties, propertyData, updateProperty, selectedAddOns, toggleAddOn, calculateSummary } = useOnboardingStore();
  const { isRTL, lang } = useLanguage();
  const ar = lang === 'ar';
  const activeProperty = properties[0] || propertyData || ({} as any);
  const storedSelectedIds = Array.isArray(selectedAddOns) ? selectedAddOns : [];
  const requiredStackIds = useMemo(() => getRequiredStackIds(activeProperty), [activeProperty]);
  const hiddenAddOnIds = useMemo(() => getHiddenAddOnIds(activeProperty), [activeProperty]);
  const visibleAddOns = addOns.filter((addon) => !hiddenAddOnIds.includes(addon.id));
  const selectedIds = new Set([...storedSelectedIds.filter((id) => !hiddenAddOnIds.includes(id)), ...requiredStackIds]);
  const selectedAddOnRows = visibleAddOns.filter((a) => selectedIds.has(a.id));
  const selectedSystemGroups = systemGroups
    .map((group) => ({ title: group.title, systems: group.systems.filter((system) => Boolean((activeProperty as any)[system.key])) }))
    .filter((group) => group.systems.length > 0);
  const selectedSystemCount = selectedSystemGroups.reduce((count, group) => count + group.systems.length, 0);
  const total = selectedAddOnRows.reduce((sum, a) => sum + a.price, 0);

  useEffect(() => {
    if (typeof window === 'undefined' || window.localStorage.getItem(LEGACY_OPTIONAL_PRUNE_KEY) === 'done') return;
    let changed = false;
    LEGACY_OPTIONAL_ADDON_IDS.forEach((id) => {
      if (storedSelectedIds.includes(id)) {
        toggleAddOn(id);
        changed = true;
      }
    });
    window.localStorage.setItem(LEGACY_OPTIONAL_PRUNE_KEY, 'done');
    if (changed) calculateSummary();
  }, []);

  useEffect(() => {
    let changed = false;
    requiredStackIds.forEach((id) => {
      if (!storedSelectedIds.includes(id)) {
        toggleAddOn(id);
        changed = true;
      }
    });
    hiddenAddOnIds.forEach((id) => {
      if (storedSelectedIds.includes(id)) {
        toggleAddOn(id);
        changed = true;
      }
    });
    if (!changed) calculateSummary();
  }, [requiredStackIds.join('|'), hiddenAddOnIds.join('|')]);

  const setSystem = (key: string, checked: boolean) => {
    updateProperty(0, { [key]: key === 'lifts' ? (checked ? Math.max(activeProperty.lifts || 1, 1) : 0) : checked } as any);
    calculateSummary();
  };

  const setAddOn = (id: string, checked: boolean) => {
    if (requiredStackIds.includes(id) || hiddenAddOnIds.includes(id)) return;
    const isSelected = storedSelectedIds.includes(id);
    if (checked !== isSelected) toggleAddOn(id);
  };

  const continueNext = () => {
    requiredStackIds.forEach((id) => {
      if (!selectedAddOns.includes(id)) toggleAddOn(id);
    });
    hiddenAddOnIds.forEach((id) => {
      if (selectedAddOns.includes(id)) toggleAddOn(id);
    });
    calculateSummary();
    onNext();
  };

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ py: { xs: 2, md: 4 } }}>
      <Container maxWidth="xl" disableGutters>
        <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 6, bgcolor: 'rgba(17,17,18,0.86)', border: '1px solid rgba(198,167,94,0.18)' }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: ar ? 0 : 4 }}>{label(copy.audit, ar)}</Typography>
            <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>{label(copy.matrix, ar)}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,.58)', maxWidth: 900, mx: 'auto', mt: 1 }}>{label(copy.intro, ar)}</Typography>
          </Box>

          <Grid container spacing={2.5} alignItems="stretch">
            <Grid item xs={12} xl={6.8}>
              <Grid container spacing={1.5} sx={{ height: '100%' }}>
                {systemGroups.map((group) => (
                  <Grid item xs={12} md={4} key={group.title.en}>
                    <Paper sx={{ p: 1.8, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}>
                      <Typography variant="overline" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mb: 1.2, lineHeight: 1.5, letterSpacing: ar ? 0 : undefined }}>{label(group.title, ar)}</Typography>
                      <Stack spacing={0.75}>
                        {group.systems.map((system) => {
                          const checked = Boolean((activeProperty as any)[system.key]);
                          return (
                            <Paper key={system.key} onClick={() => setSystem(system.key, !checked)} sx={{ p: 1, minHeight: 48, borderRadius: 2.5, cursor: 'pointer', display: 'flex', gap: 1, alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row', bgcolor: checked ? 'rgba(198,167,94,.14)' : 'rgba(255,255,255,.025)', border: `1px solid ${checked ? 'rgba(198,167,94,.65)' : 'rgba(255,255,255,.06)'}`, transition: '150ms ease', '&:hover': { borderColor: 'rgba(198,167,94,.7)' } }}>
                              <Checkbox checked={checked} onClick={(e) => e.stopPropagation()} onChange={(e) => setSystem(system.key, e.target.checked)} sx={{ p: 0, color: 'rgba(255,255,255,.3)', '&.Mui-checked': { color: binThemeTokens.gold } }} />
                              <Typography sx={{ color: checked ? '#fff' : 'rgba(255,255,255,.72)', fontWeight: 850, lineHeight: 1.22, fontSize: { xs: 14, md: 13.5 }, textAlign: isRTL ? 'right' : 'left' }}>{label(system.label, ar)}</Typography>
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
              <Paper sx={{ p: 2, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: ar ? 0 : 3 }}>{label(copy.addonsOverline, ar)}</Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{label(copy.addonsTitle, ar)}</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.52)', mb: 1.5, lineHeight: 1.55 }}>{label(copy.addonsDesc, ar)}</Typography>
                <Stack spacing={1} sx={{ maxHeight: { xl: 590 }, overflowY: { xl: 'auto' }, pr: { xl: 0.5 } }}>
                  {visibleAddOns.map((addon) => {
                    const checked = selectedIds.has(addon.id);
                    const locked = requiredStackIds.includes(addon.id);
                    return (
                      <Paper key={addon.id} onClick={() => setAddOn(addon.id, !checked)} sx={{ p: 1.2, borderRadius: 3, cursor: locked ? 'default' : 'pointer', bgcolor: checked ? 'rgba(198,167,94,.1)' : 'rgba(255,255,255,.025)', border: `1px solid ${checked ? 'rgba(198,167,94,.6)' : 'rgba(255,255,255,.07)'}` }}>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="flex-start">
                          <Checkbox checked={checked} disabled={locked} onChange={(e) => setAddOn(addon.id, e.target.checked)} sx={{ p: 0.2, color: 'rgba(255,255,255,.3)', '&.Mui-checked': { color: binThemeTokens.gold } }} />
                          <Box sx={{ minWidth: 0, flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={0.75} alignItems="center" flexWrap="wrap">
                              <Typography sx={{ color: '#fff', fontWeight: 950, fontSize: 13 }}>{label(addon.name, ar)}</Typography>
                              {locked && <Chip label={label(copy.required, ar)} size="small" sx={{ height: 18, fontSize: 9, color: '#ef4444', bgcolor: 'rgba(239,68,68,.12)', fontWeight: 900 }} />}
                            </Stack>
                            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.54)', lineHeight: 1.45 }}>{label(addon.desc, ar)}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mt: 0.5 }}>{aed(addon.price)} / {label(copy.annual, ar)}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.38)', lineHeight: 1.35 }}>{label(addon.reason, ar)}</Typography>
                          </Box>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} xl={2}>
              <Paper sx={{ p: 2.2, height: '100%', borderRadius: 5, bgcolor: '#111112', border: '1px solid rgba(198,167,94,.28)' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: ar ? 0 : 2 }}>{label(copy.serviceStack, ar)}</Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 900, mb: 0.5 }}>{label(copy.scopeSummary, ar)}</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.46)', mb: 2 }}>{selectedSystemCount} {label(copy.systemsSelected, ar)} · {selectedAddOnRows.length} {label(copy.commercialAddons, ar)}</Typography>
                <Stack spacing={1.5} divider={<Divider sx={{ borderColor: 'rgba(255,255,255,.06)' }} />}>
                  <Box>
                    <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mb: 1 }}>{label(copy.buildingScope, ar)}</Typography>
                    <Stack spacing={1}>
                      {systemGroups.map((group) => {
                        const count = selectedSystemGroups.find((selected) => selected.title.en === group.title.en)?.systems.length || 0;
                        return (
                          <Paper key={group.title.en} sx={{ p: 1.15, bgcolor: count > 0 ? 'rgba(198,167,94,.09)' : 'rgba(255,255,255,.025)', border: `1px solid ${count > 0 ? 'rgba(198,167,94,.34)' : 'rgba(255,255,255,.06)'}`, borderRadius: 3 }}>
                            <Typography variant="caption" sx={{ display: 'block', color: count > 0 ? '#fff' : 'rgba(255,255,255,.45)', fontWeight: 900, lineHeight: 1.25 }}>{label(group.title, ar)}</Typography>
                            <Typography variant="caption" sx={{ color: count > 0 ? binThemeTokens.gold : 'rgba(255,255,255,.35)', fontWeight: 950 }}>{count} {label(copy.selected, ar)}</Typography>
                          </Paper>
                        );
                      })}
                    </Stack>
                    {selectedSystemCount > 0 && <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.38)', mt: 1.25, lineHeight: 1.45 }}>{label(copy.detailNote, ar)}</Typography>}
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mb: 1 }}>{label(copy.commercialTitle, ar)}</Typography>
                    <Stack spacing={1}>
                      {selectedAddOnRows.map((addon) => (
                        <Box key={addon.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.78)', fontWeight: 850, lineHeight: 1.4 }}>{label(addon.name, ar)}</Typography>
                          <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, whiteSpace: 'nowrap' }}>{aed(addon.price)}</Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>

                  <Box sx={{ pt: 2 }}>
                    <Typography sx={{ color: '#fff', fontWeight: 950, lineHeight: 1.25 }}>{label(copy.totalTitle, ar)}</Typography>
                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, fontWeight: 950, mt: 0.75 }}>{aed(total)}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.4)', mt: 0.75, lineHeight: 1.35 }}>{label(copy.totalNote, ar)}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" size="large" onClick={onBack} sx={{ borderRadius: 100, px: 6, color: 'rgba(255,255,255,.72)', borderColor: 'rgba(255,255,255,.16)' }}>{label(copy.back, ar)}</Button>
          <Button variant="contained" size="large" onClick={continueNext} sx={{ borderRadius: 100, px: 8, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, '&:hover': { bgcolor: '#E6C77A' } }}>{label(copy.next, ar)}</Button>
        </Box>
      </Container>
    </Box>
  );
};

export default SystemsDataStep;
