import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Grid, MenuItem, Paper,
  Snackbar, Stack, TextField, Typography, alpha,
} from '@mui/material';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Briefcase, Building, Building2, CopyPlus,
  Dumbbell, Gem, Home, Hotel, Landmark, RefreshCcw, Scan, ShieldCheck, Trash2, Warehouse,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { useOnboardingStore } from '../../store/onboardingStore';
import type { PropertyData } from '../../store/onboardingStore';
import { ASSET_PROFILE_PROPERTY_TYPES } from '../../utils/calculateUaeQuote2026';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { auth, functions, getDownloadURL, ref, storage, uploadBytes } from '../../lib/firebase';
import PropertyInventoryPanel from './PropertyInventoryPanel';

const UAE_EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
const ASSET_TYPE_IDS = new Set<string>(ASSET_PROFILE_PROPERTY_TYPES);
const SQFT_PRICED_TYPES = new Set([
  'Residential Building', 'Commercial Building', 'Office', 'Gym / Fitness Centre', 'Retail Center', 'Mall', 'Hotel', 'Resort',
  'Hospital', 'Clinic', 'School', 'Warehouse', 'Industrial Property', 'Government Property',
  'Mixed-Use Tower', 'Skyscraper', 'Stadium', 'Sports Complex', 'Event Venue',
]);
const UNIT_PRICED_TYPES = new Set(['Apartment', 'Villa', 'Labour Camp', 'Staff Accommodation']);

const authority = (emirate: string) => emirate === 'Abu Dhabi' ? 'Awqaf / ADMDR'
  : emirate === 'Dubai' ? 'IACAD / SIRA'
    : emirate === 'Sharjah' ? 'Sharjah Islamic Affairs'
      : emirate ? 'Local Islamic Affairs Authority' : '';

const emptyMosque = (emirate = '') => ({
  mosqueName: '', emirate, regulatoryAuthority: authority(emirate), assetClass: 'RELIGIOUS_FACILITY',
  riskProfile: 'ASSESSMENT_REQUIRED', serviceModel: 'MOSQUE_FM', grossFloorAreaSqft: 0,
  propertyAgeYears: 0, maxWorshipperCapacity: 0, ramadanPeakCapacity: 0, wuduAreasCount: 0,
  toiletsCount: 0, carpetAreaSqm: 0, marbleAreaSqm: 0, hvacUnitsCount: 0,
  cctvInstalled: false, cctvCameraCount: 0, cctvResolution: '', storageDays: 0,
  hasDonationBoxCoverage: false, ramadanSurgePlanConfirmed: false, prayerTimeSchedulingConfirmed: false,
});

const emptyGym = (current?: PropertyData) => ({
  format: '',
  scopeMode: 'GYM_STANDALONE',
  separateBinScope: true,
  declaredServiceAreaSqft: Number(current?.sqft || 0),
  verifiedServiceAreaSqft: 0,
  maxLicensedCapacity: Number(current?.units || 0),
  typicalActiveMembers: 0,
  openingSchedule: 'STANDARD_HOURS',
  changingRooms: 0,
  showers: 0,
  groupStudios: 0,
  wetFacilities: [] as string[],
  swimmingPool: Boolean(current?.pool),
  poolScope: 'none',
  treatmentRecoveryArea: false,
  equipmentCount: 0,
  suggestedComplexity: 'STANDARD_DRY',
  verifiedComplexity: '',
  pmPricingBasis: 'annual_rent',
  sportsEstablishmentApprovalStatus: 'not_available',
  insuranceStatus: 'not_available',
  floorPlanStatus: 'not_available',
});

const suggestedGymComplexity = (profile: Record<string, any>) => {
  const wetCount = Array.isArray(profile.wetFacilities) ? profile.wetFacilities.filter(Boolean).length : 0;
  if (wetCount > 0 || profile.swimmingPool === true || profile.treatmentRecoveryArea === true) return 'WET_RECOVERY';
  if (Number(profile.groupStudios || 0) > 1 || Number(profile.showers || 0) >= 4 || Number(profile.changingRooms || 0) >= 2
    || Number(profile.equipmentCount || 0) >= 60 || profile.openingSchedule === '24_7') return 'ENHANCED';
  return 'STANDARD_DRY';
};

const blankAssetCard = (): Partial<PropertyData> => ({
  emirate: '', area: '', address: '', propertyType: '', subType: '', floors: 0, units: 0, sqft: 0, age: 0,
  annualRent: undefined, annualRevenue: undefined, assetGrade: 'Standard', majlis: false, majlisType: 'none',
  ownerType: 'Private', useType: 'Rental', missions: [],
});

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const verifiedOcrPatch = (extracted: any): Partial<PropertyData> => {
  const patch: Partial<PropertyData> = {};
  const propertyType = clean(extracted?.propertyType);
  const area = clean(extracted?.area);
  const emirate = clean(extracted?.emirate);
  const sqft = Number(extracted?.sqft);
  if (propertyType && ASSET_TYPE_IDS.has(propertyType)) patch.propertyType = propertyType;
  if (area) patch.area = area;
  if (UAE_EMIRATES.includes(emirate)) patch.emirate = emirate;
  if (Number.isFinite(sqft) && sqft > 0) patch.sqft = Math.round(sqft);
  return patch;
};

const metadataForType = (id: string, current?: PropertyData): Partial<PropertyData> => {
  const mosqueSelected = id === 'Mosque / Masjid';
  const gymSelected = id === 'Gym / Fitness Centre';
  const majlis = id === 'Government Majlis' || id === 'Private Majlis';
  return {
    propertyType: id,
    subType: mosqueSelected ? 'Mosque Facilities Management' : gymSelected ? 'Sports / Wellness' : (current?.subType || ''),
    majlis,
    majlisType: id === 'Government Majlis' ? 'government' : id === 'Private Majlis' ? 'private' : 'none',
    ownerType: ['Government Property', 'Government Majlis', 'Mosque / Masjid'].includes(id) ? 'Government' : 'Private',
    useType: ['Hotel', 'Resort'].includes(id) ? 'hospitality'
      : ['Hospital', 'Clinic'].includes(id) ? 'healthcare'
        : id === 'School' ? 'education'
          : mosqueSelected ? 'religious'
            : gymSelected ? 'commercial'
              : current?.useType || 'Rental',
    mosqueProfile: mosqueSelected ? current?.mosqueProfile || emptyMosque(current?.emirate || '') : undefined,
    gymProfile: gymSelected ? current?.gymProfile || emptyGym(current) : undefined,
    assetClass: mosqueSelected ? 'RELIGIOUS_FACILITY' : gymSelected ? 'GYM_FITNESS_CENTRE' : undefined,
    riskProfile: mosqueSelected ? 'ASSESSMENT_REQUIRED' : gymSelected ? 'VISIT_VERIFICATION_REQUIRED' : undefined,
    serviceModel: mosqueSelected ? 'MOSQUE_FM' : gymSelected ? 'GYM_FM_PM' : undefined,
    gym: gymSelected,
    missions: [],
  };
};

const unitsLabel = (type: string, ar: boolean) => {
  const labels: Record<string, [string, string]> = {
    Apartment: ['Apartment count', 'عدد الشقق'], Villa: ['Villa count', 'عدد الفلل'], Hotel: ['Rooms / keys', 'الغرف / المفاتيح'],
    Resort: ['Rooms / keys', 'الغرف / المفاتيح'], Hospital: ['Beds / capacity', 'الأسرة / السعة'], Clinic: ['Treatment capacity', 'السعة العلاجية'],
    School: ['Student capacity', 'سعة الطلاب'], 'Labour Camp': ['Beds', 'الأسرة'], 'Staff Accommodation': ['Beds', 'الأسرة'],
    'Government Majlis': ['Guest capacity', 'سعة الضيوف'], 'Private Majlis': ['Guest capacity', 'سعة الضيوف'],
    'Gym / Fitness Centre': ['Maximum / licensed capacity', 'السعة القصوى / المرخصة'],
    Stadium: ['Venue capacity', 'سعة الموقع'], 'Sports Complex': ['Venue capacity', 'سعة الموقع'], 'Event Venue': ['Venue capacity', 'سعة الموقع'],
  };
  const pair = labels[type] || ['Units / capacity', 'الوحدات / السعة'];
  return ar ? pair[1] : pair[0];
};

const AssetProfileStep: React.FC<{ onNext: () => void; onBack?: () => void }> = ({ onNext, onBack }) => {
  const { properties, updateProperty, addProperty, removeProperty } = useOnboardingStore();
  const { t, isRTL, lang } = useLanguage();
  const ar = lang === 'ar';
  const label = (en: string, arText: string) => ar ? arText : en;
  const [activeIndex, setActiveIndex] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  React.useEffect(() => { if (!properties.length) addProperty(blankAssetCard()); }, [properties.length, addProperty]);
  React.useEffect(() => { if (activeIndex >= properties.length) setActiveIndex(Math.max(0, properties.length - 1)); }, [activeIndex, properties.length]);

  const active = properties[activeIndex];
  const isMosque = active?.propertyType === 'Mosque / Masjid';
  const isGym = active?.propertyType === 'Gym / Fitness Centre';
  const mosque = (active?.mosqueProfile || emptyMosque(active?.emirate || '')) as Record<string, any>;
  const gym = (active?.gymProfile || emptyGym(active)) as Record<string, any>;
  const categories: Record<string, [string, string]> = {
    Residential: ['Residential', 'سكني'], Commercial: ['Commercial', 'تجاري'], Retail: ['Retail', 'تجزئة'],
    Hospitality: ['Hospitality', 'ضيافة'], Healthcare: ['Healthcare', 'رعاية صحية'], Education: ['Education', 'تعليمي'],
    Industrial: ['Industrial', 'صناعي'], Accommodation: ['Accommodation', 'سكن'], Government: ['Government', 'حكومي'],
    Majlis: ['Majlis', 'مجلس'], Religious: ['Religious', 'ديني'], Tower: ['Tower', 'برج'], Event: ['Event', 'فعاليات'], Estate: ['Estate', 'عزبة'],
  };
  const types = [
    ['Villa', 'Villa', 'فيلا', Home, 'Residential'], ['Apartment', 'Apartment', 'شقة', Building, 'Residential'],
    ['Residential Building', 'Residential Building', 'مبنى سكني', Building2, 'Residential'], ['Commercial Building', 'Commercial Building', 'مبنى تجاري', Warehouse, 'Commercial'],
    ['Office', 'Office', 'مكتب', Briefcase, 'Commercial'], ['Gym / Fitness Centre', 'Gym / Fitness Centre', 'نادي رياضي / مركز لياقة', Dumbbell, 'Commercial'],
    ['Retail Center', 'Retail Center', 'مركز تجزئة', Building, 'Retail'], ['Mall', 'Mall', 'مركز تسوق', Building2, 'Retail'],
    ['Hotel', 'Hotel', 'فندق', Hotel, 'Hospitality'], ['Resort', 'Resort', 'منتجع', Hotel, 'Hospitality'],
    ['Hospital', 'Hospital', 'مستشفى', ShieldCheck, 'Healthcare'], ['Clinic', 'Clinic', 'عيادة', ShieldCheck, 'Healthcare'],
    ['School', 'School', 'مدرسة', Landmark, 'Education'], ['Warehouse', 'Warehouse', 'مستودع', Warehouse, 'Industrial'],
    ['Industrial Property', 'Industrial Property', 'عقار صناعي', Warehouse, 'Industrial'], ['Labour Camp', 'Labour Camp', 'سكن عمال', Building2, 'Accommodation'],
    ['Staff Accommodation', 'Staff Accommodation', 'سكن موظفين', Building2, 'Accommodation'], ['Government Property', 'Government Property', 'عقار حكومي', ShieldCheck, 'Government'],
    ['Government Majlis', 'Government Majlis', 'مجلس حكومي', Landmark, 'Majlis'], ['Private Majlis', 'Private Majlis', 'مجلس خاص', Landmark, 'Majlis'],
    ['Mosque / Masjid', 'Mosque / Masjid', 'مسجد', Landmark, 'Religious'], ['Mixed-Use Tower', 'Mixed-Use Tower', 'برج متعدد الاستخدامات', Gem, 'Tower'],
    ['Skyscraper', 'Skyscraper', 'ناطحة سحاب', Building2, 'Tower'], ['Stadium', 'Stadium', 'استاد', Gem, 'Event'],
    ['Sports Complex', 'Sports Complex', 'مجمع رياضي', Gem, 'Event'], ['Event Venue', 'Event Venue', 'موقع فعاليات', Gem, 'Event'],
    ['Farm / Estate', 'Farm / Estate', 'مزرعة / عزبة', Home, 'Estate'],
  ] as const;

  const warningsFor = (property: PropertyData) => {
    const warnings: string[] = [];
    if (!ASSET_TYPE_IDS.has(property.propertyType)) warnings.push(label('asset type', 'نوع العقار'));
    if (!UAE_EMIRATES.includes(property.emirate)) warnings.push(label('emirate', 'الإمارة'));
    if (SQFT_PRICED_TYPES.has(property.propertyType) && !(Number(property.sqft) > 0)) warnings.push(label('measured service area', 'مساحة الخدمة المقاسة'));
    if (UNIT_PRICED_TYPES.has(property.propertyType) && !(Number(property.units) > 0)) warnings.push(unitsLabel(property.propertyType, ar));
    if (property.propertyType === 'Gym / Fitness Centre') {
      const value = property.gymProfile || {};
      if (!String(value.format || '').trim()) warnings.push(label('gym format', 'نوع النادي الرياضي'));
      if (!(Number(property.floors) > 0)) warnings.push(label('floors occupied', 'الطوابق المشغولة'));
      if (!String(value.scopeMode || '').trim()) warnings.push(label('gym scope', 'نطاق النادي'));
      if (String(value.scopeMode || '').toUpperCase() === 'GYM_WITHIN_PARENT_ASSET' && value.separateBinScope !== true) {
        warnings.push(label('separate BIN GROUP gym scope or keep it as a parent-property amenity', 'نطاق مستقل للنادي لدى BIN GROUP أو إبقاؤه كمرفق تابع للعقار الرئيسي'));
      }
    }
    if (property.propertyType === 'Mosque / Masjid') {
      const value = property.mosqueProfile || {};
      if (!String(value.mosqueName || '').trim()) warnings.push(label('mosque name', 'اسم المسجد'));
      if (!(Number(value.grossFloorAreaSqft) > 0)) warnings.push(label('measured mosque area', 'مساحة المسجد المقاسة'));
      if (!(Number(value.maxWorshipperCapacity) > 0)) warnings.push(label('worshipper capacity', 'سعة المصلين'));
      if (!(Number(value.wuduAreasCount) > 0)) warnings.push(label('Wudu areas', 'مناطق الوضوء'));
      if (value.cctvInstalled && !(Number(value.storageDays) > 0)) warnings.push(label('CCTV retention', 'مدة حفظ الكاميرات'));
    }
    return warnings;
  };

  const activeWarnings = useMemo(() => active ? warningsFor(active) : [], [active, lang]);
  const allWarnings = useMemo(() => properties.map((property, index) => ({ index, warnings: warningsFor(property) })).filter((item) => item.warnings.length), [properties, lang]);
  const setProperty = (patch: Partial<PropertyData>) => updateProperty(activeIndex, patch);
  const selectType = (type: typeof types[number]) => setProperty(metadataForType(type[0], active));
  const updateMosque = (patch: Record<string, any>) => {
    const next = { ...mosque, ...patch };
    if ('emirate' in patch) next.regulatoryAuthority = authority(String(patch.emirate || ''));
    setProperty({ emirate: next.emirate || active?.emirate, mosqueProfile: next });
  };
  const updateGym = (patch: Record<string, any>) => {
    const draft = { ...gym, ...patch };
    const next = { ...draft, suggestedComplexity: suggestedGymComplexity(draft) };
    const propertyPatch: Partial<PropertyData> = { gymProfile: next, gym: true };
    if ('declaredServiceAreaSqft' in patch) propertyPatch.sqft = Math.max(0, Number(patch.declaredServiceAreaSqft || 0));
    if ('maxLicensedCapacity' in patch) propertyPatch.units = Math.max(0, Number(patch.maxLicensedCapacity || 0));
    if ('swimmingPool' in patch) propertyPatch.pool = patch.swimmingPool === true;
    if ('pmPricingBasis' in patch) {
      if (patch.pmPricingBasis === 'annual_rent') propertyPatch.annualRevenue = undefined;
      if (patch.pmPricingBasis === 'managed_operating_revenue') propertyPatch.annualRent = undefined;
      if (patch.pmPricingBasis === 'flat_custom') { propertyPatch.annualRent = undefined; propertyPatch.annualRevenue = undefined; }
    }
    setProperty(propertyPatch);
  };

  const scanTitleDeed = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setScanning(true); setOcrError(''); setProperty({ titleDeedStatus: 'scanning' });
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('AUTH_REQUIRED_FOR_KYC_UPLOAD');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileRef = ref(storage, `temp_kyc/${uid}/${Date.now()}_${safeName}`);
      await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
      const fileUrl = await getDownloadURL(fileRef);
      const result: any = await httpsCallable(functions, 'processTitleDeedOCR')({ fileUrl });
      if (result.data?.status !== 'SUCCESS') throw new Error('OCR_NODE_BUSY');
      const patch = verifiedOcrPatch(result.data?.data);
      if (!Object.keys(patch).length) {
        setProperty({ titleDeedStatus: 'manual_review_required' });
        setOcrError(label('No reliable property values were extracted. Enter them manually or upload a clearer document.', 'لم يتم استخراج بيانات موثوقة. أدخلها يدوياً أو ارفع مستنداً أوضح.'));
      } else {
        const metadata = patch.propertyType ? metadataForType(patch.propertyType, active) : {};
        setProperty({ ...metadata, ...patch, titleDeedStatus: 'extracted' });
        setSnackbar({ open: true, message: label('Only verified title-deed values were applied to this property.', 'تم تطبيق قيم سند الملكية الموثقة فقط على هذا العقار.'), severity: 'success' });
      }
    } catch (error) {
      console.error('OCR Failure:', error);
      setProperty({ titleDeedStatus: 'manual_review_required' });
      setOcrError(label('The document could not be verified. No placeholder values were added.', 'تعذر التحقق من المستند. لم تتم إضافة قيم افتراضية.'));
    } finally { setScanning(false); event.target.value = ''; }
  };

  const addAnother = () => { addProperty(blankAssetCard()); setActiveIndex(properties.length); };
  const removeActive = () => {
    if (properties.length <= 1) return;
    removeProperty(activeIndex);
    setActiveIndex(Math.max(0, activeIndex - 1));
  };
  const continuePortfolio = () => {
    if (allWarnings.length) {
      const first = allWarnings[0];
      setActiveIndex(first.index);
      setValidationError(label(`Property ${first.index + 1} is incomplete: ${first.warnings.join(', ')}.`, `العقار ${first.index + 1} غير مكتمل: ${first.warnings.join('، ')}.`));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setValidationError('');
    onNext();
  };

  if (!active) return <Box py={8} textAlign="center"><CircularProgress /></Box>;

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ py: 2 }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{t('onboarding.asset_profile')}</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.62)' }}>{label('Add every property in the portfolio, then complete each asset card. OCR never invents missing values.', 'أضف جميع عقارات المحفظة ثم أكمل بطاقة كل عقار. لا ينشئ المسح قيماً مفقودة.')}</Typography>
      </Box>
      <Container maxWidth="xl">
        {validationError && <Alert severity="warning" sx={{ mb: 3 }}>{validationError}</Alert>}
        {ocrError && <Alert severity="warning" icon={<AlertTriangle />} sx={{ mb: 3 }} action={<Button component="label" color="inherit" startIcon={<RefreshCcw size={14} />}>{label('Retry', 'إعادة المحاولة')}<input type="file" accept="image/*,.pdf" hidden onChange={scanTitleDeed} /></Button>}>{ocrError}</Alert>}

        <Paper sx={{ p: 2.5, mb: 3, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.78)', border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }}>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" gap={2} alignItems={{ xs: 'stretch', md: 'center' }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap" useFlexGap>
              {properties.map((property, index) => <Chip key={property.id || index} onClick={() => { setActiveIndex(index); setValidationError(''); }} label={`${label('Property', 'العقار')} ${index + 1} · ${ASSET_TYPE_IDS.has(property.propertyType) ? property.propertyType : label('Unclassified', 'غير مصنف')}`} color={index === activeIndex ? 'primary' : 'default'} variant={index === activeIndex ? 'filled' : 'outlined'} sx={{ fontWeight: 900 }} />)}
            </Stack>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1}>
              <Button startIcon={<CopyPlus size={17} />} onClick={addAnother} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>{label('Add Property', 'إضافة عقار')}</Button>
              <Button startIcon={<Trash2 size={17} />} onClick={removeActive} disabled={properties.length <= 1} color="error" variant="outlined">{label('Remove', 'إزالة')}</Button>
            </Stack>
          </Stack>
        </Paper>

        <Grid container spacing={4}>
          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: { xs: 2, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" mb={2} gap={2}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{label('Asset type', 'نوع العقار')}</Typography>
                <Button component="label" startIcon={scanning ? <CircularProgress size={16} /> : <Scan size={17} />} disabled={scanning} variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>{label('Scan title deed', 'مسح سند الملكية')}<input hidden type="file" accept="image/*,.pdf" onChange={scanTitleDeed} /></Button>
              </Stack>
              <Grid container spacing={1.5}>{types.map((type) => { const [id, en, arText, Icon, category] = type; const selected = active.propertyType === id; return <Grid item xs={6} sm={4} key={id}><Paper onClick={() => selectType(type)} sx={{ p: 1.5, minHeight: 110, cursor: 'pointer', borderRadius: 3, textAlign: 'center', bgcolor: selected ? alpha(binThemeTokens.gold, 0.14) : 'rgba(255,255,255,0.03)', border: `1px solid ${selected ? binThemeTokens.gold : 'rgba(255,255,255,0.08)'}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 0.7 }}><Icon size={22} color={selected ? binThemeTokens.gold : 'rgba(255,255,255,0.45)'} /><Typography variant="caption" fontWeight={900} color="#FFF">{label(en, arText)}</Typography><Typography variant="caption" color="rgba(255,255,255,0.5)">{label(...categories[category])}</Typography></Paper></Grid>; })}</Grid>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Typography variant="h6" fontWeight={950} color="#FFF" mb={2}>{label(`Property ${activeIndex + 1} measurements`, `قياسات العقار ${activeIndex + 1}`)}</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}><TextField fullWidth select label={label('Emirate', 'الإمارة')} value={active.emirate || ''} onChange={(event) => setProperty({ emirate: event.target.value })}><MenuItem value="">{label('Select emirate', 'اختر الإمارة')}</MenuItem>{UAE_EMIRATES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField></Grid>
                <Grid item xs={12}><TextField fullWidth label={label('Area / community', 'المنطقة / المجتمع')} value={active.area || ''} onChange={(event) => setProperty({ area: event.target.value })} /></Grid>
                <Grid item xs={6}><TextField fullWidth type="number" label={unitsLabel(active.propertyType, ar)} helperText={isGym ? label('Information only — does not multiply Gym pricing', 'للمعلومات فقط — لا تضاعف سعر النادي') : undefined} value={active.units || 0} onChange={(event) => { const value = Math.max(0, Number(event.target.value)); if (isGym) updateGym({ maxLicensedCapacity: value }); else setProperty({ units: value }); }} /></Grid>
                <Grid item xs={6}><TextField fullWidth type="number" label={isGym ? label('Floors occupied', 'الطوابق المشغولة') : label('Floors', 'الطوابق')} value={active.floors || 0} onChange={(event) => setProperty({ floors: Math.max(0, Number(event.target.value)) })} /></Grid>
                <Grid item xs={6}><TextField fullWidth type="number" label={label('Measured service area (sq ft)', 'مساحة الخدمة المقاسة (قدم²)')} value={active.sqft || 0} onChange={(event) => { const value = Math.max(0, Number(event.target.value)); if (isGym) updateGym({ declaredServiceAreaSqft: value }); else setProperty({ sqft: value }); }} /></Grid>
                <Grid item xs={6}><TextField fullWidth type="number" label={label('Property age (years)', 'عمر العقار (سنوات)')} value={active.age || 0} onChange={(event) => setProperty({ age: Math.max(0, Number(event.target.value)) })} /></Grid>
                {!isGym && <Grid item xs={12}><TextField fullWidth type="number" label={label('Annual rent / managed revenue (AED) — required only for PM', 'الإيجار / الإيراد السنوي المدار (درهم) — مطلوب فقط للإدارة')} value={active.annualRent ?? ''} onChange={(event) => setProperty({ annualRent: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value)) })} /></Grid>}
                <Grid item xs={12}><TextField fullWidth select label={label('Asset grade', 'درجة العقار')} value={active.assetGrade || 'Standard'} onChange={(event) => setProperty({ assetGrade: event.target.value as any })}><MenuItem value="Standard">{label('Standard', 'قياسي')}</MenuItem><MenuItem value="Premium">{label('Premium', 'مميز')}</MenuItem><MenuItem value="Luxury">{label('Luxury', 'فاخر')}</MenuItem><MenuItem value="Ultra-Luxury">{label('Ultra-Luxury', 'فائق الفخامة')}</MenuItem><MenuItem value="Sovereign">{label('Sovereign', 'سيادي')}</MenuItem></TextField></Grid>
              </Grid>
              <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'rgba(255,255,255,0.5)' }}>{label('Pricing uses the driver appropriate to the selected asset: unit, bed, measured service area, or one facility. Capacity is never used as a price multiplier unless the class is explicitly bed/unit priced.', 'يستخدم التسعير عامل القياس المناسب للعقار: وحدة أو سرير أو مساحة خدمة مقاسة أو منشأة واحدة. لا تُستخدم السعة كمضاعف للسعر إلا عندما يكون التسعير صراحةً حسب السرير/الوحدة.')}</Typography>
              {!!activeWarnings.length && <Alert severity="warning" sx={{ mt: 2 }}>{label('Missing', 'ناقص')}: {activeWarnings.join(ar ? '، ' : ', ')}</Alert>}
            </Paper>
          </Grid>
        </Grid>

        <PropertyInventoryPanel property={active} onChange={setProperty} ar={ar} isRTL={isRTL} />

        {isMosque && <Paper sx={{ p: { xs: 3, md: 4 }, mt: 4, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }}>
          <Typography variant="h5" fontWeight={950} color="#FFF">{label('Mandatory Mosque Operations Profile', 'ملف تشغيل المسجد الإلزامي')}</Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>{label('These values control prayer-time scheduling, Ramadan surge planning, Wudu maintenance and CCTV compliance.', 'تتحكم هذه القيم في جدولة أوقات الصلاة وخطة رمضان وصيانة الوضوء والامتثال للكاميرات.')}</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}><TextField fullWidth label={label('Mosque name', 'اسم المسجد')} value={mosque.mosqueName || ''} onChange={(event) => updateMosque({ mosqueName: event.target.value })} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label={label('Regulatory authority', 'الجهة التنظيمية')} value={mosque.regulatoryAuthority || authority(active.emirate)} InputProps={{ readOnly: true }} /></Grid>
            <Grid item xs={6} md={3}><TextField fullWidth type="number" label={label('Measured area sq ft', 'المساحة المقاسة قدم²')} value={mosque.grossFloorAreaSqft || 0} onChange={(event) => { const value = Number(event.target.value); updateMosque({ grossFloorAreaSqft: value }); setProperty({ sqft: value }); }} /></Grid>
            <Grid item xs={6} md={3}><TextField fullWidth type="number" label={label('Worshipper capacity', 'سعة المصلين')} value={mosque.maxWorshipperCapacity || 0} onChange={(event) => { const value = Number(event.target.value); updateMosque({ maxWorshipperCapacity: value }); setProperty({ units: value }); }} /></Grid>
            <Grid item xs={6} md={3}><TextField fullWidth type="number" label={label('Wudu areas', 'مناطق الوضوء')} value={mosque.wuduAreasCount || 0} onChange={(event) => updateMosque({ wuduAreasCount: Number(event.target.value) })} /></Grid>
            <Grid item xs={6} md={3}><TextField fullWidth type="number" label={label('Toilets', 'دورات المياه')} value={mosque.toiletsCount || 0} onChange={(event) => updateMosque({ toiletsCount: Number(event.target.value) })} /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth select label={label('CCTV installed', 'الكاميرات مركبة')} value={mosque.cctvInstalled ? 'yes' : 'no'} onChange={(event) => updateMosque({ cctvInstalled: event.target.value === 'yes' })}><MenuItem value="no">{label('No', 'لا')}</MenuItem><MenuItem value="yes">{label('Yes', 'نعم')}</MenuItem></TextField></Grid>
            {mosque.cctvInstalled && <><Grid item xs={6} md={4}><TextField fullWidth type="number" label={label('Camera count', 'عدد الكاميرات')} value={mosque.cctvCameraCount || 0} onChange={(event) => updateMosque({ cctvCameraCount: Number(event.target.value) })} /></Grid><Grid item xs={6} md={4}><TextField fullWidth type="number" label={label('Retention days', 'أيام الاحتفاظ')} value={mosque.storageDays || 0} onChange={(event) => updateMosque({ storageDays: Number(event.target.value) })} /></Grid></>}
          </Grid>
        </Paper>}

        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} justifyContent="space-between" sx={{ mt: 4 }}>
          <Button variant="outlined" onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : undefined} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : undefined} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', borderRadius: 100, px: 4 }}>{label('Back', 'رجوع')}</Button>
          <Button variant="contained" onClick={continuePortfolio} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', borderRadius: 100, px: 6, fontWeight: 950 }}>{label(`Continue with ${properties.length} ${properties.length === 1 ? 'property' : 'properties'}`, `المتابعة مع ${properties.length} عقار`)}</Button>
        </Stack>
      </Container>
      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar((current) => ({ ...current, open: false }))}><Alert severity={snackbar.severity}>{snackbar.message}</Alert></Snackbar>
    </Box>
  );
};

export default AssetProfileStep;