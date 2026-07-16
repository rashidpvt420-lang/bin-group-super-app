import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Grid,
    MenuItem,
    Paper,
    Snackbar,
    Stack,
    TextField,
    Typography,
    alpha,
} from '@mui/material';
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Briefcase,
    Building,
    Building2,
    Gem,
    Home,
    Hotel,
    Landmark,
    RefreshCcw,
    Scan,
    ShieldCheck,
    Warehouse,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { useOnboardingStore } from '../../store/onboardingStore';
import type { PropertyData } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { auth, functions, getDownloadURL, ref, storage, uploadBytes } from '../../lib/firebase';

const UAE_EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
const ASSET_TYPE_IDS = new Set([
    'Villa', 'Apartment', 'Residential Building', 'Commercial Building', 'Office', 'Retail Center', 'Mall',
    'Hotel', 'Resort', 'Hospital', 'Clinic', 'School', 'Warehouse', 'Industrial Property', 'Labour Camp',
    'Staff Accommodation', 'Government Property', 'Government Majlis', 'Private Majlis', 'Mosque / Masjid',
    'Mixed-Use Tower', 'Skyscraper', 'Stadium', 'Sports Complex', 'Event Venue', 'Farm / Estate',
]);

const getMosqueRegulatoryAuthority = (emirate: string) => {
    if (emirate === 'Abu Dhabi') return 'Awqaf / ADMDR';
    if (emirate === 'Dubai') return 'IACAD / SIRA';
    if (emirate === 'Sharjah') return 'Sharjah Islamic Affairs';
    return emirate ? 'Local Islamic Affairs Authority' : '';
};

const createEmptyMosqueProfile = (emirate = '') => ({
    mosqueName: '',
    emirate,
    regulatoryAuthority: getMosqueRegulatoryAuthority(emirate),
    assetClass: 'RELIGIOUS_FACILITY',
    riskProfile: 'ASSESSMENT_REQUIRED',
    serviceModel: 'MOSQUE_FM',
    grossFloorAreaSqft: 0,
    propertyAgeYears: 0,
    maxWorshipperCapacity: 0,
    ramadanPeakCapacity: 0,
    wuduAreasCount: 0,
    toiletsCount: 0,
    carpetAreaSqm: 0,
    marbleAreaSqm: 0,
    hvacUnitsCount: 0,
    cctvInstalled: false,
    cctvCameraCount: 0,
    cctvResolution: '',
    storageDays: 0,
    hasDonationBoxCoverage: false,
    ramadanSurgePlanConfirmed: false,
    prayerTimeSchedulingConfirmed: false,
    serviceScope: '',
    preferredContractStructure: '',
});

const cleanExtractedText = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const buildVerifiedOcrPatch = (extracted: any): Partial<PropertyData> => {
    const patch: Partial<PropertyData> = {};
    const propertyType = cleanExtractedText(extracted?.propertyType);
    const area = cleanExtractedText(extracted?.area);
    const emirate = cleanExtractedText(extracted?.emirate);
    const sqft = Number(extracted?.sqft);

    if (propertyType && ASSET_TYPE_IDS.has(propertyType)) patch.propertyType = propertyType;
    if (area) patch.area = area;
    if (UAE_EMIRATES.includes(emirate)) patch.emirate = emirate;
    if (Number.isFinite(sqft) && sqft > 0) patch.sqft = Math.round(sqft);
    return patch;
};

const AssetProfileStep: React.FC<{ onNext: () => void; onBack?: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty, addProperty } = useOnboardingStore();
    const { t, isRTL, lang } = useLanguage();
    const label = (en: string, ar: string) => lang === 'ar' ? ar : en;
    const [scanning, setScanning] = useState(false);
    const [scanned, setScanned] = useState(false);
    const [ocrError, setOcrError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    React.useEffect(() => {
        if (properties.length === 0) addProperty();
    }, [properties.length, addProperty]);

    const activeProperty = properties[0];
    const isMosque = activeProperty?.propertyType === 'Mosque / Masjid';
    const mosqueProfile = (activeProperty?.mosqueProfile || createEmptyMosqueProfile(activeProperty?.emirate || '')) as Record<string, any>;

    const types = [
        { id: 'Villa', label: label('Villa', 'فيلا'), icon: <Home size={22} />, category: 'Residential' },
        { id: 'Apartment', label: label('Apartment', 'شقة'), icon: <Building size={22} />, category: 'Residential' },
        { id: 'Residential Building', label: label('Residential Building', 'مبنى سكني'), icon: <Building2 size={22} />, category: 'Residential' },
        { id: 'Commercial Building', label: label('Commercial Building', 'مبنى تجاري'), icon: <Warehouse size={22} />, category: 'Commercial' },
        { id: 'Office', label: label('Office', 'مكتب'), icon: <Briefcase size={22} />, category: 'Commercial' },
        { id: 'Retail Center', label: label('Retail Center', 'مركز تجزئة'), icon: <Building size={22} />, category: 'Retail' },
        { id: 'Mall', label: label('Mall', 'مركز تسوق'), icon: <Building2 size={22} />, premium: true, category: 'Retail' },
        { id: 'Hotel', label: label('Hotel', 'فندق'), icon: <Hotel size={22} />, premium: true, useType: 'hospitality', category: 'Hospitality' },
        { id: 'Resort', label: label('Resort', 'منتجع'), icon: <Hotel size={22} />, premium: true, useType: 'hospitality', category: 'Hospitality' },
        { id: 'Hospital', label: label('Hospital', 'مستشفى'), icon: <ShieldCheck size={22} />, premium: true, useType: 'healthcare', category: 'Healthcare' },
        { id: 'Clinic', label: label('Clinic', 'عيادة'), icon: <ShieldCheck size={22} />, premium: true, useType: 'healthcare', category: 'Healthcare' },
        { id: 'School', label: label('School', 'مدرسة'), icon: <Landmark size={22} />, premium: true, useType: 'education', category: 'Education' },
        { id: 'Warehouse', label: label('Warehouse', 'مستودع'), icon: <Warehouse size={22} />, category: 'Industrial' },
        { id: 'Industrial Property', label: label('Industrial Property', 'عقار صناعي'), icon: <Warehouse size={22} />, category: 'Industrial' },
        { id: 'Labour Camp', label: label('Labour Camp', 'سكن عمال'), icon: <Building2 size={22} />, premium: true, category: 'Accommodation' },
        { id: 'Staff Accommodation', label: label('Staff Accommodation', 'سكن موظفين'), icon: <Building2 size={22} />, category: 'Accommodation' },
        { id: 'Government Property', label: label('Government Property', 'عقار حكومي'), icon: <ShieldCheck size={22} />, premium: true, ownerType: 'government', category: 'Government' },
        { id: 'Government Majlis', label: label('Government Majlis', 'مجلس حكومي'), icon: <Landmark size={22} />, premium: true, ownerType: 'government', majlis: true, majlisType: 'government', category: 'Majlis' },
        { id: 'Private Majlis', label: label('Private Majlis', 'مجلس خاص'), icon: <Landmark size={22} />, premium: true, majlis: true, majlisType: 'private', category: 'Majlis' },
        { id: 'Mosque / Masjid', label: label('Mosque / Masjid', 'مسجد'), icon: <Landmark size={22} />, premium: true, useType: 'religious', ownerType: 'government', category: 'Religious' },
        { id: 'Mixed-Use Tower', label: label('Mixed-Use Tower', 'برج متعدد الاستخدامات'), icon: <Gem size={22} />, premium: true, category: 'Tower' },
        { id: 'Skyscraper', label: label('Skyscraper', 'ناطحة سحاب'), icon: <Building2 size={22} />, premium: true, category: 'Tower' },
        { id: 'Stadium', label: label('Stadium', 'استاد'), icon: <Gem size={22} />, premium: true, useType: 'event', category: 'Event' },
        { id: 'Sports Complex', label: label('Sports Complex', 'مجمع رياضي'), icon: <Gem size={22} />, premium: true, useType: 'event', category: 'Event' },
        { id: 'Event Venue', label: label('Event Venue', 'موقع فعاليات'), icon: <Gem size={22} />, premium: true, useType: 'event', category: 'Event' },
        { id: 'Farm / Estate', label: label('Farm / Estate', 'مزرعة / عزبة'), icon: <Home size={22} />, category: 'Estate' },
    ];

    const mosqueWarnings = useMemo(() => {
        if (!isMosque) return [];
        const warnings: string[] = [];
        if (!mosqueProfile.mosqueName) warnings.push(label('Mosque name is required.', 'اسم المسجد مطلوب.'));
        if (!(Number(mosqueProfile.grossFloorAreaSqft) > 0)) warnings.push(label('Measured gross floor area is required.', 'المساحة الإجمالية المقاسة مطلوبة.'));
        if (!(Number(mosqueProfile.maxWorshipperCapacity) > 0)) warnings.push(label('Verified worshipper capacity is required.', 'السعة الموثقة للمصلين مطلوبة.'));
        if (!(Number(mosqueProfile.wuduAreasCount) > 0)) warnings.push(label('Register the actual Wudu areas.', 'سجل مناطق الوضوء الفعلية.'));
        if (mosqueProfile.cctvInstalled && !(Number(mosqueProfile.storageDays) > 0)) warnings.push(label('Enter verified CCTV retention days.', 'أدخل أيام الاحتفاظ الموثقة لتسجيلات الكاميرات.'));
        return warnings;
    }, [isMosque, mosqueProfile, lang]);

    const handleTitleDeedUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setScanning(true);
        setScanned(false);
        setOcrError(null);
        updateProperty(0, { titleDeedStatus: 'scanning' });
        try {
            const uploaderUid = auth.currentUser?.uid;
            if (!uploaderUid) throw new Error('AUTH_REQUIRED_FOR_KYC_UPLOAD');
            const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storageRef = ref(storage, `temp_kyc/${uploaderUid}/${Date.now()}_${safeFileName}`);
            await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });
            const fileUrl = await getDownloadURL(storageRef);
            const ocrNode = httpsCallable(functions, 'processTitleDeedOCR');
            const result: any = await ocrNode({ fileUrl });
            if (result.data?.status !== 'SUCCESS') throw new Error('OCR_NODE_BUSY');

            const verifiedPatch = buildVerifiedOcrPatch(result.data?.data);
            if (Object.keys(verifiedPatch).length === 0) {
                updateProperty(0, { titleDeedStatus: 'manual_review_required' });
                setOcrError(label('No reliable property values were extracted. Enter the details manually or upload a clearer document.', 'لم يتم استخراج بيانات عقار موثوقة. أدخل البيانات يدوياً أو ارفع مستنداً أوضح.'));
                return;
            }

            updateProperty(0, { ...verifiedPatch, titleDeedStatus: 'extracted' });
            setScanned(true);
            setSnackbar({ open: true, message: label('Only verified title-deed values were applied.', 'تم تطبيق القيم الموثقة فقط من سند الملكية.'), severity: 'success' });
        } catch (error) {
            console.error('OCR Failure:', error);
            updateProperty(0, { titleDeedStatus: 'manual_review_required' });
            setOcrError(label('The document could not be verified. No placeholder values were added.', 'تعذر التحقق من المستند. لم تتم إضافة أي قيم افتراضية.'));
        } finally {
            setScanning(false);
            event.target.value = '';
        }
    };

    const selectPropertyType = (type: any) => {
        const mosqueSelected = type.id === 'Mosque / Masjid';
        updateProperty(0, {
            propertyType: type.id,
            subType: mosqueSelected ? 'Mosque Facilities Management' : activeProperty?.subType,
            majlis: Boolean(type.majlis),
            majlisType: type.majlisType || 'none',
            ownerType: type.ownerType || activeProperty?.ownerType || 'Private',
            useType: type.useType || activeProperty?.useType || 'Rental',
            assetGrade: mosqueSelected || type.premium ? 'Sovereign' : activeProperty?.assetGrade || 'Premium',
            mosqueProfile: mosqueSelected ? (activeProperty?.mosqueProfile || createEmptyMosqueProfile(activeProperty?.emirate || '')) : undefined,
            assetClass: mosqueSelected ? 'RELIGIOUS_FACILITY' : undefined,
            riskProfile: mosqueSelected ? 'ASSESSMENT_REQUIRED' : undefined,
            serviceModel: mosqueSelected ? 'MOSQUE_FM' : undefined,
            missions: [],
        });
    };

    const updateMosqueProfile = (patch: Record<string, any>) => {
        const nextProfile = { ...mosqueProfile, ...patch };
        if ('emirate' in patch) nextProfile.regulatoryAuthority = getMosqueRegulatoryAuthority(String(patch.emirate || ''));
        updateProperty(0, {
            emirate: nextProfile.emirate || activeProperty?.emirate,
            mosqueProfile: nextProfile,
        });
    };

    const canProceed = isMosque
        ? Boolean(activeProperty?.propertyType && Number(mosqueProfile.grossFloorAreaSqft) > 0 && Number(mosqueProfile.maxWorshipperCapacity) > 0)
        : Boolean(activeProperty?.propertyType && activeProperty?.units > 0 && activeProperty?.sqft > 0);

    return (
        <Box sx={{ py: 2 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{t('onboarding.asset_profile')}</Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)' }}>{label('Select the actual asset and enter verified measurements. OCR never invents missing values.', 'حدد العقار الفعلي وأدخل القياسات الموثقة. لا ينشئ المسح الضوئي قيماً مفقودة.')}</Typography>
            </Box>

            <Container maxWidth="lg">
                {ocrError && <Alert severity="warning" icon={<AlertTriangle />} sx={{ mb: 3 }} action={<Button component="label" color="inherit" startIcon={<RefreshCcw size={14} />}>{label('Retry', 'إعادة المحاولة')}<input type="file" accept="image/*,.pdf" hidden onChange={handleTitleDeedUpload} /></Button>}>{ocrError}</Alert>}
                <Grid container spacing={4}>
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{ p: { xs: 2, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{label('Asset type', 'نوع العقار')}</Typography>
                            <Grid container spacing={1.5} sx={{ mt: 1 }}>
                                {types.map((type) => {
                                    const selected = activeProperty?.propertyType === type.id;
                                    return <Grid item xs={6} sm={4} key={type.id}><Paper onClick={() => selectPropertyType(type)} sx={{ p: 1.5, minHeight: 105, cursor: 'pointer', borderRadius: 3, textAlign: 'center', bgcolor: selected ? alpha(binThemeTokens.gold, 0.14) : 'rgba(255,255,255,0.03)', border: `1px solid ${selected ? binThemeTokens.gold : 'rgba(255,255,255,0.08)'}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 0.7 }}><Box sx={{ color: selected ? binThemeTokens.gold : 'rgba(255,255,255,0.45)' }}>{type.icon}</Box><Typography variant="caption" fontWeight="900" color="#FFF">{type.label}</Typography><Typography variant="caption" color="rgba(255,255,255,0.5)">{type.category}</Typography></Paper></Grid>;
                                })}
                            </Grid>
                        </Paper>

                        {isMosque && <Paper sx={{ mt: 3, p: { xs: 2, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }}>
                            <Typography variant="h6" fontWeight="950" color="#FFF">{label('Verified mosque facility profile', 'ملف مرافق المسجد الموثق')}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>{label('Enter measured facts only. Compliance is not claimed until reviewed.', 'أدخل الحقائق المقاسة فقط. لا يتم اعتماد الامتثال قبل المراجعة.')}</Typography>
                            {mosqueWarnings.length > 0 && <Alert severity="warning" sx={{ mb: 3 }}>{mosqueWarnings.join(' ')}</Alert>}
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}><TextField fullWidth label={label('Mosque name', 'اسم المسجد')} value={mosqueProfile.mosqueName || ''} onChange={(e) => updateMosqueProfile({ mosqueName: e.target.value })} /></Grid>
                                <Grid item xs={12} sm={6}><TextField select fullWidth label={label('Emirate', 'الإمارة')} value={mosqueProfile.emirate || ''} onChange={(e) => updateMosqueProfile({ emirate: e.target.value })}><MenuItem value="">{label('Select', 'اختر')}</MenuItem>{UAE_EMIRATES.map((emirate) => <MenuItem key={emirate} value={emirate}>{emirate}</MenuItem>)}</TextField></Grid>
                                <Grid item xs={6} sm={4}><TextField fullWidth type="number" label={label('GFA sq.ft', 'المساحة قدم²')} value={mosqueProfile.grossFloorAreaSqft || 0} onChange={(e) => updateMosqueProfile({ grossFloorAreaSqft: Number(e.target.value) || 0 })} /></Grid>
                                <Grid item xs={6} sm={4}><TextField fullWidth type="number" label={label('Age years', 'العمر بالسنوات')} value={mosqueProfile.propertyAgeYears || 0} onChange={(e) => updateMosqueProfile({ propertyAgeYears: Number(e.target.value) || 0 })} /></Grid>
                                <Grid item xs={6} sm={4}><TextField fullWidth type="number" label={label('Verified capacity', 'السعة الموثقة')} value={mosqueProfile.maxWorshipperCapacity || 0} onChange={(e) => updateMosqueProfile({ maxWorshipperCapacity: Number(e.target.value) || 0 })} /></Grid>
                                <Grid item xs={6} sm={4}><TextField fullWidth type="number" label={label('Wudu areas', 'مناطق الوضوء')} value={mosqueProfile.wuduAreasCount || 0} onChange={(e) => updateMosqueProfile({ wuduAreasCount: Number(e.target.value) || 0 })} /></Grid>
                                <Grid item xs={6} sm={4}><TextField fullWidth type="number" label={label('CCTV cameras', 'كاميرات المراقبة')} value={mosqueProfile.cctvCameraCount || 0} onChange={(e) => updateMosqueProfile({ cctvCameraCount: Number(e.target.value) || 0, cctvInstalled: Number(e.target.value) > 0 })} /></Grid>
                                <Grid item xs={6} sm={4}><TextField fullWidth type="number" label={label('Retention days', 'أيام الاحتفاظ')} value={mosqueProfile.storageDays || 0} onChange={(e) => updateMosqueProfile({ storageDays: Number(e.target.value) || 0 })} /></Grid>
                            </Grid>
                        </Paper>}
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{label('Verified details', 'البيانات الموثقة')}</Typography>
                            <Stack spacing={2.5} sx={{ mt: 2 }}>
                                <Button variant="outlined" component="label" startIcon={scanning ? <CircularProgress size={16} /> : <Scan size={18} />} disabled={scanning} sx={{ py: 1.5, borderStyle: 'dashed' }}>{scanning ? label('Scanning', 'جارٍ المسح') : scanned ? label('Verified values applied', 'تم تطبيق القيم الموثقة') : label('Upload title deed for OCR', 'رفع سند الملكية للمسح')}<input type="file" accept="image/*,.pdf" hidden onChange={handleTitleDeedUpload} /></Button>
                                <TextField select fullWidth label={label('Asset grade', 'درجة العقار')} value={activeProperty?.assetGrade || 'Premium'} onChange={(e) => updateProperty(0, { assetGrade: e.target.value as PropertyData['assetGrade'] })}><MenuItem value="Standard">Standard</MenuItem><MenuItem value="Premium">Premium</MenuItem><MenuItem value="Luxury">Luxury</MenuItem><MenuItem value="Sovereign">Sovereign</MenuItem></TextField>
                                {!isMosque && <Grid container spacing={2}>
                                    <Grid item xs={6}><TextField fullWidth label={label('Units', 'الوحدات')} type="number" value={activeProperty?.units || 0} onChange={(e) => updateProperty(0, { units: Number(e.target.value) || 0 })} /></Grid>
                                    <Grid item xs={6}><TextField fullWidth label={label('Floors', 'الطوابق')} type="number" value={activeProperty?.floors || 0} onChange={(e) => updateProperty(0, { floors: Number(e.target.value) || 0 })} /></Grid>
                                    <Grid item xs={6}><TextField fullWidth label={label('Area sq.ft', 'المساحة قدم²')} type="number" value={activeProperty?.sqft || 0} onChange={(e) => updateProperty(0, { sqft: Number(e.target.value) || 0 })} /></Grid>
                                    <Grid item xs={6}><TextField fullWidth label={label('Age', 'العمر')} type="number" value={activeProperty?.age || 0} onChange={(e) => updateProperty(0, { age: Number(e.target.value) || 0 })} /></Grid>
                                </Grid>}
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                    {onBack && <Button fullWidth variant="outlined" onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : undefined}>{label('Back', 'رجوع')}</Button>}
                                    <Button fullWidth variant="contained" onClick={onNext} disabled={!canProceed} endIcon={<ArrowRight style={{ transform: isRTL ? 'rotate(180deg)' : undefined }} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{label('Continue', 'متابعة')}</Button>
                                </Stack>
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}><Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert></Snackbar>
        </Box>
    );
};

export default AssetProfileStep;
