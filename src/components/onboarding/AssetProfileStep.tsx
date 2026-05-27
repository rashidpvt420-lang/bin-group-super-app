import React, { useMemo, useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, TextField, MenuItem, Container, Button, CircularProgress, Snackbar, Alert, Chip
} from '@mui/material';
import { 
    Home, Building2, Building, Hotel, Landmark, Gem, 
    Briefcase, Warehouse, ShieldCheck, ArrowRight, ArrowLeft, Scan, AlertTriangle, RefreshCcw
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { storage, ref, uploadBytes, getDownloadURL, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';

const UAE_EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

const getMosqueRegulatoryAuthority = (emirate: string) => {
    if (emirate === 'Abu Dhabi') return 'Awqaf / ADMDR';
    if (emirate === 'Dubai') return 'IACAD / SIRA';
    if (emirate === 'Sharjah') return 'Sharjah Islamic Affairs';
    return 'Local Islamic Affairs Authority';
};

const createDefaultMosqueProfile = (emirate = 'Dubai') => ({
    mosqueName: '',
    emirate,
    regulatoryAuthority: getMosqueRegulatoryAuthority(emirate),
    assetClass: 'RELIGIOUS_FACILITY',
    riskProfile: 'HIGH_FOOTFALL_SENSITIVE_ASSET',
    serviceModel: 'MOSQUE_FM',
    grossFloorAreaSqm: 0,
    grossFloorAreaSqft: 0,
    commissioningYear: new Date().getFullYear(),
    propertyAgeYears: 0,
    maxWorshipperCapacity: 300,
    dailyPrayerFootfallEstimate: 150,
    fridayJummahCapacity: 500,
    ramadanPeakCapacity: 750,
    hasImamResidence: false,
    hasMuezzinResidence: false,
    hasFemalePrayerArea: true,
    hasQuranClassrooms: false,
    hasMajlisArea: false,
    hasParkingArea: true,
    hasExternalCourtyard: false,
    hasMinaret: true,
    numberOfMinarets: 1,
    hasDome: true,
    numberOfDomes: 1,
    wuduAreasCount: 1,
    toiletsCount: 4,
    waterTanksCount: 1,
    ablutionFountainsCount: 0,
    carpetAreaSqm: 0,
    carpetMaterial: 'Synthetic',
    marbleAreaSqm: 0,
    marbleCondition: 'Good',
    chandeliersCount: 0,
    chandelierSizeCategory: 'Medium',
    ceilingHeightMeters: 5,
    hvacUnitsCount: 0,
    hvacTotalTonnage: 0,
    hvacType: 'Split Units',
    paSystemInstalled: true,
    internalSpeakersCount: 0,
    externalSpeakersCount: 0,
    amplifierCount: 1,
    cctvInstalled: false,
    cctvCameraCount: 0,
    cctvResolution: '4MP',
    hasDonationBoxCoverage: false,
    hasEntranceFacialCoverage: false,
    storageDays: 30,
    siraOrAdmccCompliant: false,
    serviceScope: 'Full IFM',
    shariaCompliantContractRequired: true,
    preferredContractStructure: 'Wakalah',
    complianceRules: {
        noMaintenanceDuringPrayerTimes: true,
        wuduCleaningAfterEveryPrayer: true,
        emergencyMepResponseRequired: true,
        maxUtilityDowntimeHours: 5,
        emergencyContainmentTargetHours: 24,
        documentationRequiredOnSite: true,
        prayerTimeSchedulingRequired: true,
        ramadanSurgePlanRequired: true,
        cctvComplianceRequired: true,
        audioRecordingProhibitedUnlessApproved: true,
    },
    cleaningSchedule: {
        fajr: 'Post-prayer cleaning',
        dhuhr: 'Post-prayer cleaning',
        asr: 'Post-prayer cleaning',
        maghrib: 'Post-prayer cleaning',
        isha: 'Post-prayer cleaning',
        jummah: 'Deep crowd cleaning',
        ramadanTaraweeh: 'Additional night cleaning',
    },
    complianceBadges: [
        'Prayer-Time Safe Scheduling',
        'Wudu Cleaning Active',
        'Ramadan Ready',
        'CCTV 30-Day Storage Verified',
    ],
});

const AssetProfileStep: React.FC<{ onNext: () => void; onBack?: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty, addProperty } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const [scanning, setScanning] = useState(false);
    const [scanned, setScanned] = useState(false);
    const [ocrError, setOcrError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success'|'error' });

    React.useEffect(() => {
        if (properties.length === 0) {
            addProperty();
        }
    }, [properties.length, addProperty]);

    const activeProperty = properties[0];
    const mosqueProfile = (activeProperty as any)?.mosqueProfile || createDefaultMosqueProfile(activeProperty?.emirate || 'Dubai');
    const isMosque = activeProperty?.propertyType === 'Mosque / Masjid';

    const mosqueComplianceWarnings = useMemo(() => {
        const warnings: string[] = [];
        if (!isMosque) return warnings;
        if ((mosqueProfile.storageDays || 0) < 30) warnings.push('CCTV storage must be minimum 30 days.');
        if (mosqueProfile.cctvResolution === '2MP') warnings.push('CCTV resolution should be upgraded to 4MP minimum.');
        if (!mosqueProfile.hasDonationBoxCoverage) warnings.push('Donation box CCTV coverage is required.');
        if ((mosqueProfile.wuduAreasCount || 0) < 1) warnings.push('At least one Wudu area must be registered.');
        if (!mosqueProfile.complianceRules?.ramadanSurgePlanRequired) warnings.push('Ramadan surge plan must be active.');
        return warnings;
    }, [isMosque, mosqueProfile]);

    const handleTitleDeedUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanning(true);
        setOcrError(null);
        try {
            const storageRef = ref(storage, `temp_kyc/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const fileUrl = await getDownloadURL(storageRef);

            const ocrNode = httpsCallable(functions, 'processTitleDeedOCR');
            const result: any = await ocrNode({ fileUrl });

            if (result.data.status === 'SUCCESS') {
                const extracted = result.data.data;
                updateProperty(0, {
                    propertyType: extracted.propertyType || 'Apartment',
                    sqft: extracted.sqft || 1850,
                    area: extracted.area || '',
                    emirate: extracted.emirate || 'Dubai',
                    titleDeedStatus: 'extracted'
                });
                setScanned(true);
                setSnackbar({ open: true, message: "Title deed data extracted successfully.", severity: 'success' });
            } else {
                throw new Error("OCR_NODE_BUSY");
            }
        } catch (err) {
            console.error("OCR Failure:", err);
            setOcrError("Scanner node busy or document unclear. Please fill data manually or retry.");
            updateProperty(0, { titleDeedStatus: 'manual_review_required' });
        } finally {
            setScanning(false);
        }
    };

    const types = [
        { id: 'Villa', label: t('onboarding.type.villa'), icon: <Home size={24} /> },
        { id: 'Apartment', label: t('onboarding.type.apartment'), icon: <Building size={24} /> },
        { id: 'Residential Building', label: t('onboarding.type.res_building'), icon: <Building2 size={24} /> },
        { id: 'Commercial Building', label: t('onboarding.type.com_building'), icon: <Warehouse size={24} /> },
        { id: 'Office', label: t('onboarding.type.office'), icon: <Briefcase size={24} /> },
        { id: 'Retail Center', label: t('onboarding.type.retail'), icon: <Building size={24} /> },
        { id: 'Mall', label: t('onboarding.type.mall'), icon: <Building2 size={24} />, premium: true },
        { id: 'Hotel', label: t('onboarding.type.hotel'), icon: <Hotel size={24} />, premium: true, useType: 'hospitality' },
        { id: 'Mosque / Masjid', label: isRTL ? 'مسجد' : 'Mosque / Masjid', icon: <Landmark size={24} />, premium: true, useType: 'religious', ownerType: 'government', assetClass: 'RELIGIOUS_FACILITY' },
        { id: 'Hospital', label: t('onboarding.type.hospital'), icon: <ShieldCheck size={24} />, premium: true, useType: 'healthcare' },
        { id: 'Clinic', label: t('onboarding.type.clinic'), icon: <ShieldCheck size={24} />, premium: true, useType: 'healthcare' },
        { id: 'School', label: t('onboarding.type.school'), icon: <Landmark size={24} />, premium: true, useType: 'education' },
        { id: 'Warehouse', label: t('onboarding.type.warehouse'), icon: <Warehouse size={24} /> },
        { id: 'Labour Camp', label: t('onboarding.type.labour_camp'), icon: <Building2 size={24} />, premium: true },
        { id: 'Government Property', label: t('onboarding.type.gov_prop'), icon: <ShieldCheck size={24} />, premium: true, ownerType: 'government' },
        { id: 'Government Majlis', label: t('onboarding.type.gov_majlis'), icon: <Landmark size={24} />, premium: true, ownerType: 'government', majlis: true, majlisType: 'government' },
        { id: 'Private Majlis', label: t('onboarding.type.priv_majlis'), icon: <Landmark size={24} />, premium: true, majlis: true, majlisType: 'private' },
        { id: 'Mixed-Use Tower', label: t('onboarding.type.mixed_tower'), icon: <Gem size={24} />, premium: true },
        { id: 'Skyscraper', label: t('onboarding.type.skyscraper'), icon: <Building2 size={24} />, premium: true },
        { id: 'Stadium', label: t('onboarding.type.stadium'), icon: <Gem size={24} />, premium: true, useType: 'event' },
        { id: 'Sports Complex', label: t('onboarding.type.sports_complex'), icon: <Gem size={24} />, premium: true, useType: 'event' },
        { id: 'Event Venue', label: t('onboarding.type.event_venue'), icon: <Gem size={24} />, premium: true, useType: 'event' },
        { id: 'Resort', label: t('onboarding.type.resort'), icon: <Hotel size={24} />, premium: true, useType: 'hospitality' },
        { id: 'Industrial Property', label: t('onboarding.type.industrial'), icon: <Warehouse size={24} /> },
        { id: 'Staff Accommodation', label: t('onboarding.type.staff_acc'), icon: <Building2 size={24} /> },
        { id: 'Farm / Estate', label: t('onboarding.type.farm'), icon: <Home size={24} /> },
    ];

    const selectPropertyType = (type: typeof types[number]) => {
        const isSelectedMosque = type.id === 'Mosque / Masjid';
        const nextEmirate = activeProperty?.emirate || 'Dubai';
        updateProperty(0, {
            propertyType: type.id,
            subType: isSelectedMosque ? 'Mosque Facilities Management' : activeProperty?.subType,
            majlis: Boolean((type as any).majlis),
            majlisType: (type as any).majlisType || 'none',
            ownerType: (type as any).ownerType || activeProperty?.ownerType || 'Private',
            useType: (type as any).useType || activeProperty?.useType || 'Rental',
            assetGrade: isSelectedMosque ? 'Sovereign' : activeProperty?.assetGrade || 'Premium',
            sira: isSelectedMosque ? true : activeProperty?.sira,
            tank: isSelectedMosque ? true : activeProperty?.tank,
            hvac: isSelectedMosque ? true : activeProperty?.hvac,
            fireAlarm: isSelectedMosque ? true : activeProperty?.fireAlarm,
            mosqueProfile: isSelectedMosque ? createDefaultMosqueProfile(nextEmirate) : (activeProperty as any)?.mosqueProfile,
            assetClass: isSelectedMosque ? 'RELIGIOUS_FACILITY' : (activeProperty as any)?.assetClass,
            riskProfile: isSelectedMosque ? 'HIGH_FOOTFALL_SENSITIVE_ASSET' : (activeProperty as any)?.riskProfile,
            serviceModel: isSelectedMosque ? 'MOSQUE_FM' : (activeProperty as any)?.serviceModel,
            missions: isSelectedMosque
                ? ['Prayer-time safe scheduling', '5 daily Wudu cleaning cycles', 'Ramadan surge readiness', 'Awqaf/IACAD compliance reporting', 'CCTV/SIRA review']
                : activeProperty?.missions || [],
        } as any);
    };

    const updateMosqueProfile = (patch: Record<string, any>) => {
        const nextProfile = { ...mosqueProfile, ...patch };
        if (patch.emirate) {
            nextProfile.regulatoryAuthority = getMosqueRegulatoryAuthority(patch.emirate);
        }
        updateProperty(0, {
            emirate: nextProfile.emirate,
            age: nextProfile.propertyAgeYears || activeProperty?.age || 0,
            sqft: nextProfile.grossFloorAreaSqft || activeProperty?.sqft || 0,
            units: Math.max(1, nextProfile.wuduAreasCount || activeProperty?.units || 1),
            rooms: nextProfile.maxWorshipperCapacity || activeProperty?.rooms || 0,
            mosqueProfile: nextProfile,
        } as any);
    };

    const canProceed = activeProperty?.propertyType && activeProperty?.units > 0 && activeProperty?.sqft > 0;

    return (
        <Box sx={{ py: 2 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.asset_profile')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {t('onboarding.asset_desc')}
                </Typography>
            </Box>

            <Container maxWidth="lg">
                {ocrError && (
                    <Alert 
                        severity="warning" 
                        icon={<AlertTriangle />}
                        sx={{ mb: 4, bgcolor: 'rgba(255, 152, 0, 0.1)', color: '#ffb74d', border: '1px solid rgba(255,152,0,0.2)' }}
                        action={
                            <Button size="small" color="inherit" component="label" startIcon={<RefreshCcw size={14}/>}>
                                {t('onboarding.retry_scan')}
                                <input type="file" accept="image/*,.pdf" hidden onChange={handleTitleDeedUpload} />
                            </Button>
                        }
                    >
                        {ocrError}
                    </Alert>
                )}

                <Grid container spacing={4}>
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                1. {t('onboarding.asset_type').toUpperCase()}
                            </Typography>
                            <Grid container spacing={2}>
                                {types.map((type) => (
                                    <Grid item xs={12} sm={4} key={type.id}>
                                        <Paper 
                                            onClick={() => selectPropertyType(type)}
                                            sx={{ 
                                                p: 2, 
                                                cursor: 'pointer',
                                                bgcolor: activeProperty?.propertyType === type.id ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.02)',
                                                border: `1px solid ${activeProperty?.propertyType === type.id ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`,
                                                borderRadius: 3,
                                                transition: 'all 0.2s ease',
                                                textAlign: 'center',
                                                '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198, 167, 94, 0.05)' }
                                            }}
                                        >
                                            <Box sx={{ color: activeProperty?.propertyType === type.id ? binThemeTokens.gold : 'rgba(255,255,255,0.3)', mb: 1, display: 'flex', justifyContent: 'center' }}>
                                                {type.icon}
                                            </Box>
                                            <Typography variant="caption" fontWeight="900" sx={{ color: '#FFF', display: 'block', lineHeight: 1.2 }}>
                                                {type.label}
                                            </Typography>
                                            {(type as any).assetClass === 'RELIGIOUS_FACILITY' && (
                                                <Chip size="small" label="Awqaf / IACAD" sx={{ mt: 1, height: 18, fontSize: 10, color: '#000', bgcolor: binThemeTokens.gold }} />
                                            )}
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                        </Paper>

                        {isMosque && (
                            <Paper sx={{ mt: 4, p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Mosque Facility Profile</Typography>
                                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Clean. Compliant. Prayer-Time Safe. Ramadan Ready.</Typography>
                                    </Box>
                                    <Landmark color={binThemeTokens.gold} />
                                </Stack>

                                {mosqueComplianceWarnings.length > 0 && (
                                    <Alert severity="warning" sx={{ mb: 3, bgcolor: 'rgba(255,152,0,0.1)', color: '#ffb74d', border: '1px solid rgba(255,152,0,0.25)' }}>
                                        {mosqueComplianceWarnings.join(' ')}
                                    </Alert>
                                )}

                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <TextField fullWidth size="small" label="Mosque name" value={mosqueProfile.mosqueName || ''} onChange={(e) => updateMosqueProfile({ mosqueName: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField select fullWidth size="small" label="Emirate / Authority" value={mosqueProfile.emirate || 'Dubai'} onChange={(e) => updateMosqueProfile({ emirate: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                            {UAE_EMIRATES.map((emirate) => <MenuItem key={emirate} value={emirate}>{emirate} — {getMosqueRegulatoryAuthority(emirate)}</MenuItem>)}
                                        </TextField>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="GFA sq.ft" value={mosqueProfile.grossFloorAreaSqft || 0} onChange={(e) => updateMosqueProfile({ grossFloorAreaSqft: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Age years" value={mosqueProfile.propertyAgeYears || 0} onChange={(e) => updateMosqueProfile({ propertyAgeYears: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Capacity" value={mosqueProfile.maxWorshipperCapacity || 0} onChange={(e) => updateMosqueProfile({ maxWorshipperCapacity: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Ramadan peak" value={mosqueProfile.ramadanPeakCapacity || 0} onChange={(e) => updateMosqueProfile({ ramadanPeakCapacity: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Wudu areas" value={mosqueProfile.wuduAreasCount || 0} onChange={(e) => updateMosqueProfile({ wuduAreasCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Carpet sqm" value={mosqueProfile.carpetAreaSqm || 0} onChange={(e) => updateMosqueProfile({ carpetAreaSqm: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Marble sqm" value={mosqueProfile.marbleAreaSqm || 0} onChange={(e) => updateMosqueProfile({ marbleAreaSqm: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Chandeliers" value={mosqueProfile.chandeliersCount || 0} onChange={(e) => updateMosqueProfile({ chandeliersCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="HVAC units" value={mosqueProfile.hvacUnitsCount || 0} onChange={(e) => updateMosqueProfile({ hvacUnitsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="CCTV cameras" value={mosqueProfile.cctvCameraCount || 0} onChange={(e) => updateMosqueProfile({ cctvCameraCount: Number(e.target.value) || 0, cctvInstalled: Number(e.target.value) > 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField select fullWidth size="small" label="CCTV resolution" value={mosqueProfile.cctvResolution || '4MP'} onChange={(e) => updateMosqueProfile({ cctvResolution: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                            {['2MP', '4MP', '8MP', 'Mixed'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                                        </TextField>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField select fullWidth size="small" label="Mosque FM package" value={mosqueProfile.serviceScope || 'Full IFM'} onChange={(e) => updateMosqueProfile({ serviceScope: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                            {['Basic MEP', 'Comprehensive AMC', 'Full IFM'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                                        </TextField>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField select fullWidth size="small" label="Contract structure" value={mosqueProfile.preferredContractStructure || 'Wakalah'} onChange={(e) => updateMosqueProfile({ preferredContractStructure: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                            {['Standard AMC', 'FIDIC Short Form', 'Ijarah', 'Wakalah'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                                        </TextField>
                                    </Grid>
                                </Grid>

                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {['No maintenance during prayer', '5x Wudu cleaning daily', 'Emergency MEP 24/7', 'Ramadan surge plan', 'Awqaf/IACAD report export', 'CCTV 30-day storage'].map((badge) => (
                                        <Chip key={badge} label={badge} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />
                                    ))}
                                </Stack>
                            </Paper>
                        )}
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                2. {t('onboarding.verification').toUpperCase()}
                            </Typography>
                            <Stack spacing={3}>
                                    <Button 
                                        variant="outlined" 
                                        component="label"
                                        fullWidth
                                        startIcon={scanning ? <CircularProgress size={16} color="inherit" /> : <Scan size={18} />}
                                        sx={{ mb: 3, py: 1.5, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, borderStyle: 'dashed' }}
                                    >
                                        {scanning ? t('onboarding.scanning') : scanned ? t('onboarding.scanned') : t('onboarding.scan_btn')}
                                        {!scanning && !scanned && <input type="file" accept="image/*,.pdf" hidden onChange={handleTitleDeedUpload} />}
                                    </Button>

                                    <TextField 
                                        select fullWidth label={t('onboarding.asset_type')} size="small"
                                        value={activeProperty?.assetGrade || 'Premium'} 
                                        onChange={(e) => updateProperty(0, { assetGrade: e.target.value as any })}
                                        sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                    >
                                    <MenuItem value="Standard">{t('onboarding.grade.standard')}</MenuItem>
                                    <MenuItem value="Premium">{t('onboarding.grade.premium')}</MenuItem>
                                    <MenuItem value="Luxury">{t('onboarding.grade.luxury')}</MenuItem>
                                    <MenuItem value="Sovereign">{t('onboarding.grade.sovereign')}</MenuItem>
                                </TextField>

                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label={isMosque ? 'Wudu areas' : t('onboarding.units')} type="number" size="small"
                                            value={activeProperty?.units || 0} 
                                            onChange={(e) => updateProperty(0, { units: parseInt(e.target.value) || 0 })}
                                            InputProps={{
                                                endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null
                                            }}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label={t('onboarding.floors')} type="number" size="small"
                                            value={activeProperty?.floors || 1} 
                                            onChange={(e) => updateProperty(0, { floors: parseInt(e.target.value) || 1 })}
                                            InputProps={{
                                                endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null
                                            }}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label={t('onboarding.sqft')} type="number" size="small"
                                            value={activeProperty?.sqft || 0} 
                                            onChange={(e) => updateProperty(0, { sqft: parseInt(e.target.value) || 0 })}
                                            InputProps={{
                                                endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null
                                            }}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label={t('onboarding.age')} type="number" size="small"
                                            value={activeProperty?.age || 0} 
                                            onChange={(e) => updateProperty(0, { age: parseInt(e.target.value) || 0 })}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                    </Grid>
                                </Grid>

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    {onBack && (
                                        <Button
                                            variant="outlined"
                                            fullWidth
                                            size="large"
                                            onClick={onBack}
                                            startIcon={!isRTL ? <ArrowLeft /> : null}
                                            endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null}
                                            sx={{ mt: 2, borderRadius: 4, color: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}
                                        >
                                            {t('onboarding.back')}
                                        </Button>
                                    )}
                                    <Button
                                        variant="contained" fullWidth size="large"
                                        onClick={onNext} disabled={!canProceed}
                                        endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}
                                        sx={{ mt: 2, borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                                    >
                                        {t('onboarding.continue')}
                                    </Button>
                                </Stack>
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default AssetProfileStep;
