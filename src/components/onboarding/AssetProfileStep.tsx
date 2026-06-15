import React, { useMemo, useState } from 'react';
import {
    Box, Typography, Grid, Paper, alpha, Stack, TextField, MenuItem, Container, Button, CircularProgress, Snackbar, Alert, Chip, Divider
} from '@mui/material';
import {
    Home, Building2, Building, Hotel, Landmark, Gem,
    Briefcase, Warehouse, ShieldCheck, ArrowRight, ArrowLeft, Scan, AlertTriangle, RefreshCcw, Check
} from 'lucide-react';
import { useOnboardingStore, inferAssetGrade } from '../../store/onboardingStore';
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

const createDefaultHotelProfile = () => ({
    starRating: 3,
    roomsCount: 0,
    bedsCount: 0,
    conferenceRoomsCount: 0,
    hasRestaurant: false,
    hasPool: false,
    hasGym: false,
    hasSpa: false,
    hasConferenceRoom: false,
});

const createDefaultSchoolProfile = () => ({
    institutionType: 'School' as string,
    studentCapacity: 0,
    classroomsCount: 0,
    labsCount: 0,
    sportsCourtCount: 0,
    hasSwimmingPool: false,
    hasAuditorium: false,
    hasCafeteria: false,
    hasLibrary: false,
});

const createDefaultHospitalProfile = () => ({
    facilityType: 'Hospital' as string,
    bedsCount: 0,
    wardsCount: 0,
    icuBeds: 0,
    operatingTheatersCount: 0,
    hasEmergencyDept: true,
    hasMedicalGas: false,
    hasPharmacy: false,
    hasLaboratory: false,
    hasOperatingTheaters: false,
});

const createDefaultStadiumProfile = () => ({
    seatingCapacity: 0,
    pitchesCount: 1,
    courtsCount: 0,
    vipSuitesCount: 0,
    hasChangeRooms: true,
    hasConcessionsArea: false,
    hasLightingSystem: false,
    hasPublicAddress: false,
    hasVIPSuite: false,
});

const createDefaultVillaProfile = () => ({
    bedrooms: 3,
    bathrooms: 3,
    hasPrivatePool: false,
    gardenSqm: 0,
    hasStaffQuarters: false,
    parkingSpaces: 2,
    hasBBQArea: false,
    hasSolarPanels: false,
});

const createDefaultResidentialProfile = () => ({
    unitsCount: 0,
    avgBedrooms: 2,
    liftsCount: 0,
    parkingBays: 0,
    hasPool: false,
    hasGym: false,
    hasLobby: false,
    hasMaids: false,
});

const createDefaultCommercialProfile = () => ({
    officesCount: 0,
    meetingRooms: 0,
    receptionAreas: 1,
    parkingBays: 0,
    liftsCount: 0,
    hasDataRoom: false,
    hasCanteen: false,
    hasPrayer: false,
});

const createDefaultRetailProfile = () => ({
    shopsCount: 0,
    foodCourtUnits: 0,
    escalatorsCount: 0,
    liftsCount: 0,
    parkingBays: 0,
    hasAnchorTenant: false,
    hasSecurity: true,
    hasGym: false,
});

const createDefaultWarehouseProfile = () => ({
    loadingBays: 0,
    rackingLevels: 0,
    powerLoadKW: 0,
    ceilingHeightMeters: 6,
    shutterDoors: 0,
    hasSprinklers: false,
    hasFirePump: true,
    hasMezzanine: false,
    hasOfficeArea: false,
    hasHazmat: false,
});

const createDefaultLabourCampProfile = () => ({
    bedsCount: 0,
    blocksCount: 0,
    toiletsPerBlock: 4,
    kitchensCount: 1,
    laundryUnitsCount: 0,
    waterTanksCount: 1,
    hasPestControlZone: true,
    hasFireSafety: true,
    hasCanteen: false,
    hasMedicalRoom: false,
});

const createDefaultGovernmentProfile = () => ({
    govPropertyType: 'Government Office' as string,
    meetingRooms: 0,
    staffCount: 0,
    hasVIPArea: false,
    hasCeremonialSpace: false,
    hasPublicServiceCounter: false,
    securityLevel: 'Standard' as string,
    hasDataCenter: false,
});

const createDefaultMajlisProfile = () => ({
    guestsCapacity: 0,
    majlisRoomsCount: 1,
    hasGarden: false,
    gardenSqm: 0,
    hasKitchen: true,
    hasVIPRoom: false,
    eventHallsCount: 0,
    hasCarPark: true,
    hasCCTV: false,
});

const createDefaultMixedUseProfile = () => ({
    residentialFloors: 0,
    commercialFloors: 0,
    totalUnits: 0,
    podiumShopsCount: 0,
    liftsCount: 0,
    hasHotelComponent: false,
    hasServiced: false,
    hasPool: false,
    hasGym: false,
});

const createDefaultFarmProfile = () => ({
    landAcres: 0,
    irrigationZones: 0,
    pumpsCount: 0,
    landscapingSqm: 0,
    hasStaffQuarters: false,
    staffQuartersCount: 0,
    hasGenerator: false,
    externalLightingPoints: 0,
    hasPaddock: false,
    hasStorageBuilding: false,
});

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
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    React.useEffect(() => {
        if (properties.length === 0) addProperty();
    }, [properties.length, addProperty]);

    const activeProperty = properties[0];
    const mosqueProfile = (activeProperty as any)?.mosqueProfile || createDefaultMosqueProfile(activeProperty?.emirate || 'Dubai');
    const isMosque = activeProperty?.propertyType === 'Mosque / Masjid';
    const pt = activeProperty?.propertyType || '';
    const isHotel = pt === 'Hotel' || pt === 'Resort';
    const isSchool = pt === 'School';
    const isHospital = pt === 'Hospital' || pt === 'Clinic';
    const isStadium = ['Stadium', 'Sports Complex', 'Event Venue'].includes(pt);
    const isVilla = pt === 'Villa';
    const isResidential = pt === 'Apartment' || pt === 'Residential Building';
    const isCommercial = pt === 'Commercial Building' || pt === 'Office';
    const isRetail = pt === 'Retail Center';
    const isWarehouse = pt === 'Warehouse' || pt === 'Industrial Property';
    const isLabourCamp = pt === 'Labour Camp' || pt === 'Staff Accommodation';
    const isGovernment = pt === 'Government Property';
    const isGovMajlis = pt === 'Government Majlis';
    const isPrivateMajlis = pt === 'Private Majlis';
    const isMixedUse = pt === 'Mixed-Use Tower' || pt === 'Skyscraper';
    const isFarm = pt === 'Farm / Estate';

    const inferredGrade = useMemo(() => inferAssetGrade((activeProperty || {}) as any), [activeProperty]);
    const gradeOrder = ['Standard', 'Premium', 'Luxury', 'Sovereign'];
    const effectiveGrade = gradeOrder[Math.max(gradeOrder.indexOf(inferredGrade), gradeOrder.indexOf(activeProperty?.assetGrade || 'Standard'))];
    const gradeColor = effectiveGrade === 'Standard' ? 'rgba(255,255,255,0.55)' : effectiveGrade === 'Premium' ? '#60a5fa' : binThemeTokens.gold;

    const hotelProfile = (activeProperty as any)?.hotelProfile || createDefaultHotelProfile();
    const schoolProfile = (activeProperty as any)?.schoolProfile || createDefaultSchoolProfile();
    const hospitalProfile = (activeProperty as any)?.hospitalProfile || createDefaultHospitalProfile();
    const stadiumProfile = (activeProperty as any)?.stadiumProfile || createDefaultStadiumProfile();
    const villaProfile = (activeProperty as any)?.villaProfile || createDefaultVillaProfile();
    const residentialProfile = (activeProperty as any)?.residentialProfile || createDefaultResidentialProfile();
    const commercialProfile = (activeProperty as any)?.commercialProfile || createDefaultCommercialProfile();
    const retailProfile = (activeProperty as any)?.retailProfile || createDefaultRetailProfile();
    const warehouseProfile = (activeProperty as any)?.warehouseProfile || createDefaultWarehouseProfile();
    const labourCampProfile = (activeProperty as any)?.labourCampProfile || createDefaultLabourCampProfile();
    const governmentProfile = (activeProperty as any)?.governmentProfile || createDefaultGovernmentProfile();
    const majlisProfile = (activeProperty as any)?.majlisProfile || createDefaultMajlisProfile();
    const mixedUseProfile = (activeProperty as any)?.mixedUseProfile || createDefaultMixedUseProfile();
    const farmProfile = (activeProperty as any)?.farmProfile || createDefaultFarmProfile();

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
                setSnackbar({ open: true, message: 'Title deed data extracted successfully.', severity: 'success' });
            } else {
                throw new Error('OCR_NODE_BUSY');
            }
        } catch (err) {
            console.error('OCR Failure:', err);
            setOcrError('Scanner node busy or document unclear. Please fill data manually or retry.');
            updateProperty(0, { titleDeedStatus: 'manual_review_required' });
        } finally {
            setScanning(false);
        }
    };

    const types: any[] = [
        { id: 'Villa', label: t('onboarding.type.villa'), icon: <Home size={22} />, category: 'Residential' },
        { id: 'Apartment', label: t('onboarding.type.apartment'), icon: <Building size={22} />, category: 'Residential' },
        { id: 'Residential Building', label: t('onboarding.type.res_building'), icon: <Building2 size={22} />, category: 'Residential' },
        { id: 'Commercial Building', label: t('onboarding.type.com_building'), icon: <Warehouse size={22} />, category: 'Commercial' },
        { id: 'Office', label: t('onboarding.type.office'), icon: <Briefcase size={22} />, category: 'Commercial' },
        { id: 'Retail Center', label: t('onboarding.type.retail'), icon: <Building size={22} />, category: 'Commercial' },
        { id: 'Mall', label: t('onboarding.type.mall'), icon: <Building2 size={22} />, premium: true, category: 'Retail' },
        { id: 'Hotel', label: t('onboarding.type.hotel'), icon: <Hotel size={22} />, premium: true, useType: 'hospitality', category: 'Hospitality' },
        { id: 'Resort', label: t('onboarding.type.resort'), icon: <Hotel size={22} />, premium: true, useType: 'hospitality', category: 'Hospitality' },
        { id: 'Hospital', label: t('onboarding.type.hospital'), icon: <ShieldCheck size={22} />, premium: true, useType: 'healthcare', category: 'Healthcare' },
        { id: 'Clinic', label: t('onboarding.type.clinic'), icon: <ShieldCheck size={22} />, premium: true, useType: 'healthcare', category: 'Healthcare' },
        { id: 'School', label: t('onboarding.type.school'), icon: <Landmark size={22} />, premium: true, useType: 'education', category: 'Education' },
        { id: 'Warehouse', label: t('onboarding.type.warehouse'), icon: <Warehouse size={22} />, category: 'Industrial' },
        { id: 'Industrial Property', label: t('onboarding.type.industrial'), icon: <Warehouse size={22} />, category: 'Industrial' },
        { id: 'Labour Camp', label: t('onboarding.type.labour_camp'), icon: <Building2 size={22} />, premium: true, category: 'Accommodation' },
        { id: 'Staff Accommodation', label: t('onboarding.type.staff_acc'), icon: <Building2 size={22} />, category: 'Accommodation' },
        { id: 'Government Property', label: t('onboarding.type.gov_prop'), icon: <ShieldCheck size={22} />, premium: true, ownerType: 'government', category: 'Government' },
        { id: 'Government Majlis', label: t('onboarding.type.gov_majlis'), icon: <Landmark size={22} />, premium: true, ownerType: 'government', majlis: true, majlisType: 'government', category: 'Majlis' },
        { id: 'Private Majlis', label: t('onboarding.type.priv_majlis'), icon: <Landmark size={22} />, premium: true, majlis: true, majlisType: 'private', category: 'Majlis' },
        { id: 'Mosque / Masjid', label: isRTL ? 'مسجد' : 'Mosque / Masjid', icon: <Landmark size={22} />, premium: true, useType: 'religious', ownerType: 'government', assetClass: 'RELIGIOUS_FACILITY', category: 'Religious' },
        { id: 'Mixed-Use Tower', label: t('onboarding.type.mixed_tower'), icon: <Gem size={22} />, premium: true, category: 'Tower' },
        { id: 'Skyscraper', label: t('onboarding.type.skyscraper'), icon: <Building2 size={22} />, premium: true, category: 'Tower' },
        { id: 'Stadium', label: t('onboarding.type.stadium'), icon: <Gem size={22} />, premium: true, useType: 'event', category: 'Event' },
        { id: 'Sports Complex', label: t('onboarding.type.sports_complex'), icon: <Gem size={22} />, premium: true, useType: 'event', category: 'Event' },
        { id: 'Event Venue', label: t('onboarding.type.event_venue'), icon: <Gem size={22} />, premium: true, useType: 'event', category: 'Event' },
        { id: 'Farm / Estate', label: t('onboarding.type.farm'), icon: <Home size={22} />, category: 'Estate' },
    ];

    const selectPropertyType = (type: any) => {
        const isSelectedMosque = type.id === 'Mosque / Masjid';
        const isSelectedHotel = type.id === 'Hotel' || type.id === 'Resort';
        const isSelectedSchool = type.id === 'School';
        const isSelectedHospital = type.id === 'Hospital' || type.id === 'Clinic';
        const isSelectedStadium = ['Stadium', 'Sports Complex', 'Event Venue'].includes(type.id);
        const isSelectedVilla = type.id === 'Villa';
        const isSelectedResidential = type.id === 'Apartment' || type.id === 'Residential Building';
        const isSelectedCommercial = type.id === 'Commercial Building' || type.id === 'Office';
        const isSelectedRetail = type.id === 'Retail Center';
        const isSelectedWarehouse = type.id === 'Warehouse' || type.id === 'Industrial Property';
        const isSelectedLabourCamp = type.id === 'Labour Camp' || type.id === 'Staff Accommodation';
        const isSelectedGov = type.id === 'Government Property';
        const isSelectedGovMajlis = type.id === 'Government Majlis';
        const isSelectedPrivateMajlis = type.id === 'Private Majlis';
        const isSelectedMixedUse = type.id === 'Mixed-Use Tower' || type.id === 'Skyscraper';
        const isSelectedFarm = type.id === 'Farm / Estate';
        const nextEmirate = activeProperty?.emirate || 'Dubai';

        const missionsMap: Record<string, string[]> = {
            'Mosque / Masjid': ['Prayer-time safe scheduling', '5 daily Wudu cleaning cycles', 'Ramadan surge readiness', 'Awqaf/IACAD compliance reporting', 'CCTV/SIRA review'],
            Hotel: ['24/7 guest MEP response', 'Pool & gym maintenance', 'Restaurant grease trap service', 'Concierge coordination', 'HVAC hotel priority'],
            Resort: ['24/7 guest MEP response', 'Pool & waterpark maintenance', 'Restaurant systems', 'Landscaping & irrigation', 'HVAC hotel priority'],
            School: ['Classroom & lab safety', 'Cafeteria systems', 'Emergency evacuation AMC', 'Student-safe scheduling', 'Sports facility care'],
            Hospital: ['Critical medical systems MEP', '24/7 emergency dispatch', 'Infection control compliance', 'Generator AMC', 'Medical gas visual inspection'],
            Clinic: ['Medical facility MEP', '24/7 emergency response', 'HVAC sanitized air quality', 'Fire & safety AMC', 'Water tank sterilization'],
            Stadium: ['Event-day MEP readiness', 'Crowd safety systems', 'Pitch irrigation maintenance', 'VIP facilities priority', 'CCTV crowd monitoring'],
            'Sports Complex': ['Sports facility MEP', 'Pitch lighting systems', 'Changing room services', 'Fire & emergency AMC', 'Water tank sterilization'],
            'Event Venue': ['Event-day MEP standby', 'Lighting & AV infrastructure', 'HVAC event-scale cooling', 'Kitchen & catering systems', 'Fire safety emergency systems'],
            Villa: ['MEP preventive maintenance', 'Pool & garden care', 'AC units service', 'Water tank sterilization', 'Generator AMC'],
            Apartment: ['Building common area MEP', 'Elevator AMC', 'Fire safety systems', 'Water pump service', 'AC maintenance'],
            'Residential Building': ['Building MEP maintenance', 'Elevator AMC', 'Fire safety systems', 'Water tank sterilization', 'Common area care'],
            'Commercial Building': ['Office MEP maintenance', 'HVAC central system', 'Elevator AMC', 'Fire safety & emergency', 'Generator standby'],
            Office: ['Workspace MEP maintenance', 'AC unit service', 'Fire & emergency AMC', 'Electrical safety', 'Water tank sterilization'],
            'Retail Center': ['Shop MEP response', 'Escalator & elevator AMC', 'Food court grease trap', 'Fire safety & CCTV AMC', 'Common area cleaning systems'],
            Mall: ['Retail MEP response', 'Escalator & elevator AMC', 'Food court systems', 'Fire safety & CCTV', 'Parking lighting & systems'],
            Warehouse: ['Industrial MEP maintenance', 'Fire pump & sprinkler AMC', 'Loading bay door systems', 'HVAC ventilation', 'Emergency lighting'],
            'Industrial Property': ['Heavy MEP maintenance', 'Fire safety systems AMC', 'Industrial ventilation', 'Power systems maintenance', 'Safety compliance reporting'],
            'Labour Camp': ['Accommodation MEP', 'Water tank sterilization', 'Pest control AMC', 'Fire safety systems', 'Laundry & kitchen systems'],
            'Staff Accommodation': ['Accommodation MEP', 'Water tank sterilization', 'Fire safety systems', 'Common area maintenance', 'AC unit service'],
            'Government Property': ['Gov-standard MEP maintenance', 'Security systems AMC', 'VIP area priority response', 'Fire & emergency systems', 'Building access control'],
            'Government Majlis': ['Majlis event-day readiness', 'Full MEP systems', 'Garden & exterior deep care', 'CCTV & security AMC', 'VIP-grade completion reporting'],
            'Private Majlis': ['Majlis MEP maintenance', 'Garden & exterior care', 'Event-day standby technician', 'Fire safety inspection', 'Water tank sterilization'],
            'Mixed-Use Tower': ['Residential MEP response', 'Commercial MEP systems', 'Multiple lift AMC', 'Pool & gym maintenance', 'Retail podium fire safety'],
            Skyscraper: ['High-rise MEP systems', 'Facade / BMU maintenance', 'Elevator bank AMC (30+)', 'District cooling optimization', 'Fire & life safety systems'],
            'Farm / Estate': ['Irrigation system maintenance', 'Pump room MEP', 'Landscape lighting systems', 'Generator AMC', 'Staff quarters MEP'],
        };

        updateProperty(0, {
            propertyType: type.id,
            subType: isSelectedMosque ? 'Mosque Facilities Management' : activeProperty?.subType,
            majlis: Boolean(type.majlis),
            majlisType: type.majlisType || 'none',
            ownerType: type.ownerType || activeProperty?.ownerType || 'Private',
            useType: type.useType || activeProperty?.useType || 'Rental',
            assetGrade: isSelectedMosque || type.premium ? 'Sovereign' : activeProperty?.assetGrade || 'Premium',
            sira: isSelectedMosque || isSelectedLabourCamp ? true : activeProperty?.sira,
            tank: isSelectedMosque || isSelectedLabourCamp ? true : activeProperty?.tank,
            hvac: isSelectedMosque || isSelectedHotel || isSelectedHospital || isSelectedCommercial ? true : activeProperty?.hvac,
            fireAlarm: isSelectedMosque || isSelectedHospital || isSelectedLabourCamp || isSelectedWarehouse ? true : activeProperty?.fireAlarm,
            mosqueProfile: isSelectedMosque ? createDefaultMosqueProfile(nextEmirate) : (activeProperty as any)?.mosqueProfile,
            hotelProfile: isSelectedHotel ? createDefaultHotelProfile() : (activeProperty as any)?.hotelProfile,
            schoolProfile: isSelectedSchool ? createDefaultSchoolProfile() : (activeProperty as any)?.schoolProfile,
            hospitalProfile: isSelectedHospital ? createDefaultHospitalProfile() : (activeProperty as any)?.hospitalProfile,
            stadiumProfile: isSelectedStadium ? createDefaultStadiumProfile() : (activeProperty as any)?.stadiumProfile,
            villaProfile: isSelectedVilla ? createDefaultVillaProfile() : (activeProperty as any)?.villaProfile,
            residentialProfile: isSelectedResidential ? createDefaultResidentialProfile() : (activeProperty as any)?.residentialProfile,
            commercialProfile: isSelectedCommercial ? createDefaultCommercialProfile() : (activeProperty as any)?.commercialProfile,
            retailProfile: isSelectedRetail ? createDefaultRetailProfile() : (activeProperty as any)?.retailProfile,
            warehouseProfile: isSelectedWarehouse ? createDefaultWarehouseProfile() : (activeProperty as any)?.warehouseProfile,
            labourCampProfile: isSelectedLabourCamp ? createDefaultLabourCampProfile() : (activeProperty as any)?.labourCampProfile,
            governmentProfile: isSelectedGov ? createDefaultGovernmentProfile() : (activeProperty as any)?.governmentProfile,
            majlisProfile: (isSelectedGovMajlis || isSelectedPrivateMajlis) ? createDefaultMajlisProfile() : (activeProperty as any)?.majlisProfile,
            mixedUseProfile: isSelectedMixedUse ? createDefaultMixedUseProfile() : (activeProperty as any)?.mixedUseProfile,
            farmProfile: isSelectedFarm ? createDefaultFarmProfile() : (activeProperty as any)?.farmProfile,
            assetClass: isSelectedMosque ? 'RELIGIOUS_FACILITY' : (activeProperty as any)?.assetClass,
            riskProfile: isSelectedMosque ? 'HIGH_FOOTFALL_SENSITIVE_ASSET' : isSelectedHospital ? 'CRITICAL_HEALTHCARE_ASSET' : isSelectedWarehouse ? 'INDUSTRIAL_ASSET' : (activeProperty as any)?.riskProfile,
            serviceModel: isSelectedMosque ? 'MOSQUE_FM' : isSelectedHotel ? 'HOSPITALITY_FM' : isSelectedHospital ? 'HEALTHCARE_FM' : isSelectedLabourCamp ? 'ACCOMMODATION_FM' : (activeProperty as any)?.serviceModel,
            missions: missionsMap[type.id] || activeProperty?.missions || [],
        } as any);
    };

    const updateMosqueProfile = (patch: Record<string, any>) => {
        const nextProfile = { ...mosqueProfile, ...patch };
        if (patch.emirate) nextProfile.regulatoryAuthority = getMosqueRegulatoryAuthority(patch.emirate);
        updateProperty(0, {
            emirate: nextProfile.emirate,
            age: nextProfile.propertyAgeYears || activeProperty?.age || 0,
            sqft: nextProfile.grossFloorAreaSqft || activeProperty?.sqft || 0,
            units: Math.max(1, nextProfile.wuduAreasCount || activeProperty?.units || 1),
            rooms: nextProfile.maxWorshipperCapacity || activeProperty?.rooms || 0,
            mosqueProfile: nextProfile,
        } as any);
    };

    const updateHotelProfile = (patch: Record<string, any>) => {
        const nextProfile = { ...hotelProfile, ...patch };
        updateProperty(0, {
            rooms: nextProfile.roomsCount || 0,
            beds: nextProfile.bedsCount || 0,
            units: nextProfile.roomsCount || 0,
            hasPool: nextProfile.hasPool,
            hasGym: nextProfile.hasGym,
            hotelProfile: nextProfile,
        } as any);
    };

    const updateSchoolProfile = (patch: Record<string, any>) => {
        const nextProfile = { ...schoolProfile, ...patch };
        updateProperty(0, {
            units: nextProfile.classroomsCount || 0,
            schoolProfile: nextProfile,
        } as any);
    };

    const updateHospitalProfile = (patch: Record<string, any>) => {
        const nextProfile = { ...hospitalProfile, ...patch };
        updateProperty(0, {
            beds: nextProfile.bedsCount || 0,
            units: Math.max(nextProfile.wardsCount || 0, 1),
            hospitalProfile: nextProfile,
        } as any);
    };

    const updateStadiumProfile = (patch: Record<string, any>) => {
        const nextProfile = { ...stadiumProfile, ...patch };
        updateProperty(0, {
            units: nextProfile.seatingCapacity ? Math.max(1, Math.ceil(nextProfile.seatingCapacity / 100)) : activeProperty?.units || 0,
            stadiumProfile: nextProfile,
        } as any);
    };

    const updateVillaProfile = (patch: Record<string, any>) => {
        const next = { ...villaProfile, ...patch };
        updateProperty(0, { bedrooms: next.bedrooms || 3, pool: next.hasPrivatePool, units: Math.max(1, activeProperty?.units || 1), villaProfile: next } as any);
    };

    const updateResidentialProfile = (patch: Record<string, any>) => {
        const next = { ...residentialProfile, ...patch };
        updateProperty(0, { units: next.unitsCount || activeProperty?.units || 0, lifts: next.liftsCount || 0, pool: next.hasPool, gym: next.hasGym, residentialProfile: next } as any);
    };

    const updateCommercialProfile = (patch: Record<string, any>) => {
        const next = { ...commercialProfile, ...patch };
        updateProperty(0, { offices: next.officesCount || 0, units: Math.max(next.officesCount || 0, 1), lifts: next.liftsCount || 0, commercialProfile: next } as any);
    };

    const updateRetailProfile = (patch: Record<string, any>) => {
        const next = { ...retailProfile, ...patch };
        updateProperty(0, { shops: next.shopsCount || 0, units: Math.max(next.shopsCount || 0, 1), lifts: next.liftsCount || 0, escalators: (next.escalatorsCount || 0) > 0, retailProfile: next } as any);
    };

    const updateWarehouseProfile = (patch: Record<string, any>) => {
        const next = { ...warehouseProfile, ...patch };
        updateProperty(0, { units: Math.max(next.loadingBays || 1, 1), gen: next.hasSprinklers || activeProperty?.gen, warehouseProfile: next } as any);
    };

    const updateLabourCampProfile = (patch: Record<string, any>) => {
        const next = { ...labourCampProfile, ...patch };
        updateProperty(0, { units: next.bedsCount || activeProperty?.units || 0, tank: next.waterTanksCount > 0, labourCampProfile: next } as any);
    };

    const updateGovernmentProfile = (patch: Record<string, any>) => {
        const next = { ...governmentProfile, ...patch };
        updateProperty(0, { units: Math.max(next.meetingRooms || 1, 1), governmentProfile: next } as any);
    };

    const updateMajlisProfile = (patch: Record<string, any>) => {
        const next = { ...majlisProfile, ...patch };
        updateProperty(0, { units: Math.max(next.guestsCapacity || 1, 1), rooms: next.guestsCapacity || 0, majlisProfile: next } as any);
    };

    const updateMixedUseProfile = (patch: Record<string, any>) => {
        const next = { ...mixedUseProfile, ...patch };
        updateProperty(0, { units: next.totalUnits || activeProperty?.units || 0, lifts: next.liftsCount || 0, pool: next.hasPool, gym: next.hasGym, mixedUseProfile: next } as any);
    };

    const updateFarmProfile = (patch: Record<string, any>) => {
        const next = { ...farmProfile, ...patch };
        updateProperty(0, { sqft: Math.max(next.landAcres * 43560 || activeProperty?.sqft || 1000, 1000), units: Math.max(1, activeProperty?.units || 1), farmProfile: next } as any);
    };

    const canProceed = Boolean(
        activeProperty?.propertyType &&
        activeProperty?.sqft > 0 &&
        (activeProperty?.units > 0 || activeProperty?.rooms > 0 || activeProperty?.beds > 0)
    );
    const selectedType = types.find((type) => type.id === activeProperty?.propertyType);

    return (
        <Box sx={{ py: 2 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.asset_profile')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 760, mx: 'auto' }}>
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
                            <Button size="small" color="inherit" component="label" startIcon={<RefreshCcw size={14} />}>
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
                        <Paper sx={{ p: { xs: 2.2, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Stack spacing={1.5} sx={{ mb: 3 }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" spacing={2}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block' }}>
                                        1. {t('onboarding.asset_type').toUpperCase()}
                                    </Typography>
                                    <Chip size="small" label={`${types.length} asset types`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }} />
                                </Stack>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.6 }}>
                                    Scroll or tap below. BIN GROUP supports villas, apartments, towers, hotels, hospitals, schools, mosques, majlis, warehouses, labour camps, staff accommodation and government assets.
                                </Typography>
                                <Stack direction="row" flexWrap="wrap" gap={1}>
                                    {['Residential', 'Commercial', 'Hospitality', 'Healthcare', 'Government', 'Majlis', 'Industrial'].map((category) => (
                                        <Chip key={category} size="small" label={category} sx={{ height: 22, bgcolor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', fontWeight: 800, fontSize: 10 }} />
                                    ))}
                                </Stack>
                            </Stack>

                            <Grid container spacing={{ xs: 1.2, sm: 2 }}>
                                {types.map((type) => {
                                    const isSelected = activeProperty?.propertyType === type.id;
                                    return (
                                        <Grid item xs={6} sm={4} key={type.id}>
                                            <Paper
                                                onClick={() => selectPropertyType(type)}
                                                sx={{
                                                    p: { xs: 1.4, sm: 2 },
                                                    minHeight: { xs: 104, sm: 122 },
                                                    cursor: 'pointer',
                                                    bgcolor: isSelected ? alpha(binThemeTokens.gold, 0.15) : 'rgba(255,255,255,0.02)',
                                                    border: `2px solid ${isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.06)'}`,
                                                    borderRadius: { xs: 3, sm: 3.5 },
                                                    transition: 'all 0.2s ease',
                                                    textAlign: 'center',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 0.75,
                                                    position: 'relative',
                                                    boxShadow: isSelected ? `0 0 0 1px ${binThemeTokens.gold}` : 'none',
                                                    '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198, 167, 94, 0.05)' }
                                                }}
                                            >
                                                {isSelected && (
                                                    <Box sx={{ position: 'absolute', top: 5, right: 5, bgcolor: binThemeTokens.gold, borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Check size={11} color="#000" strokeWidth={3} />
                                                    </Box>
                                                )}
                                                <Box sx={{ color: isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.35)', display: 'flex', justifyContent: 'center' }}>
                                                    {type.icon}
                                                </Box>
                                                <Typography variant="caption" fontWeight="950" sx={{ color: isSelected ? binThemeTokens.gold : '#FFF', display: 'block', lineHeight: 1.18, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                                                    {type.label}
                                                </Typography>
                                                <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap" useFlexGap>
                                                    {type.premium && <Chip size="small" label="Sovereign" sx={{ height: 17, fontSize: 9, color: '#000', bgcolor: binThemeTokens.gold, fontWeight: 900 }} />}
                                                    {type.ownerType === 'government' && <Chip size="small" label="Gov" sx={{ height: 17, fontSize: 9, color: '#bfdbfe', bgcolor: 'rgba(59,130,246,0.14)', fontWeight: 900 }} />}
                                                    {type.assetClass === 'RELIGIOUS_FACILITY' && <Chip size="small" label="Awqaf" sx={{ height: 17, fontSize: 9, color: '#000', bgcolor: binThemeTokens.gold, fontWeight: 900 }} />}
                                                </Stack>
                                            </Paper>
                                        </Grid>
                                    );
                                })}
                            </Grid>

                            {activeProperty?.propertyType && (
                                <Box sx={{ mt: 3 }}>
                                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 3 }} />
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mb: 2 }}>3. Property Profile</Typography>
                                </Box>
                            )}

                        {isMosque && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
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

                        {isHotel && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Hotel / Resort Profile</Typography>
                                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Guest-First. 24/7 Ready. Hospitality Grade.</Typography>
                                    </Box>
                                    <Hotel color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}>
                                        <TextField select fullWidth size="small" label="Star rating" value={hotelProfile.starRating || 3} onChange={(e) => updateHotelProfile({ starRating: Number(e.target.value) })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                            {[1, 2, 3, 4, 5].map((s) => <MenuItem key={s} value={s}>{s}★</MenuItem>)}
                                        </TextField>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Rooms" value={hotelProfile.roomsCount || 0} onChange={(e) => updateHotelProfile({ roomsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Beds" value={hotelProfile.bedsCount || 0} onChange={(e) => updateHotelProfile({ bedsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Conference rooms" value={hotelProfile.conferenceRoomsCount || 0} onChange={(e) => updateHotelProfile({ conferenceRoomsCount: Number(e.target.value) || 0, hasConferenceRoom: Number(e.target.value) > 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[
                                        { key: 'hasPool', label: 'Swimming Pool' },
                                        { key: 'hasGym', label: 'Gym / Fitness' },
                                        { key: 'hasRestaurant', label: 'Restaurant / F&B' },
                                        { key: 'hasSpa', label: 'Spa / Wellness' },
                                    ].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateHotelProfile({ [key]: !hotelProfile[key] })}
                                            sx={{ bgcolor: hotelProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: hotelProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${hotelProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['24/7 Guest MEP Response', 'Pool & Gym AMC', 'Restaurant Grease Trap', 'Concierge Coordination', 'HVAC Hotel Priority'].map((badge) => (
                                        <Chip key={badge} label={badge} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />
                                    ))}
                                </Stack>
                            </Paper>
                        )}

                        {isSchool && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>School / University Profile</Typography>
                                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Safe. Compliant. Student-Ready.</Typography>
                                    </Box>
                                    <Landmark color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <TextField select fullWidth size="small" label="Institution type" value={schoolProfile.institutionType || 'School'} onChange={(e) => updateSchoolProfile({ institutionType: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                            {['School', 'University', 'College', 'Vocational Institute', 'Nursery'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                                        </TextField>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Student capacity" value={schoolProfile.studentCapacity || 0} onChange={(e) => updateSchoolProfile({ studentCapacity: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Classrooms" value={schoolProfile.classroomsCount || 0} onChange={(e) => updateSchoolProfile({ classroomsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Labs" value={schoolProfile.labsCount || 0} onChange={(e) => updateSchoolProfile({ labsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Sports courts" value={schoolProfile.sportsCourtCount || 0} onChange={(e) => updateSchoolProfile({ sportsCourtCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[
                                        { key: 'hasSwimmingPool', label: 'Swimming Pool' },
                                        { key: 'hasAuditorium', label: 'Auditorium / Hall' },
                                        { key: 'hasCafeteria', label: 'Cafeteria' },
                                        { key: 'hasLibrary', label: 'Library' },
                                    ].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateSchoolProfile({ [key]: !schoolProfile[key] })}
                                            sx={{ bgcolor: schoolProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: schoolProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${schoolProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Lab Safety Systems', 'Classroom AC AMC', 'Cafeteria Grease Trap', 'Emergency Evacuation', 'Water Tank Sterilization'].map((badge) => (
                                        <Chip key={badge} label={badge} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />
                                    ))}
                                </Stack>
                            </Paper>
                        )}

                        {isHospital && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Hospital / Clinic Profile</Typography>
                                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Critical. Compliant. 24/7 Emergency Ready.</Typography>
                                    </Box>
                                    <ShieldCheck color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <TextField select fullWidth size="small" label="Facility type" value={hospitalProfile.facilityType || 'Hospital'} onChange={(e) => updateHospitalProfile({ facilityType: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                            {['Hospital', 'Specialist Clinic', 'Day Surgery', 'Polyclinic', 'Medical Centre'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                                        </TextField>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Beds" value={hospitalProfile.bedsCount || 0} onChange={(e) => updateHospitalProfile({ bedsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Wards" value={hospitalProfile.wardsCount || 0} onChange={(e) => updateHospitalProfile({ wardsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="ICU beds" value={hospitalProfile.icuBeds || 0} onChange={(e) => updateHospitalProfile({ icuBeds: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Operating theaters" value={hospitalProfile.operatingTheatersCount || 0} onChange={(e) => updateHospitalProfile({ operatingTheatersCount: Number(e.target.value) || 0, hasOperatingTheaters: Number(e.target.value) > 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[
                                        { key: 'hasEmergencyDept', label: 'Emergency Dept.' },
                                        { key: 'hasMedicalGas', label: 'Medical Gas' },
                                        { key: 'hasPharmacy', label: 'Pharmacy' },
                                        { key: 'hasLaboratory', label: 'Laboratory' },
                                    ].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateHospitalProfile({ [key]: !hospitalProfile[key] })}
                                            sx={{ bgcolor: hospitalProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: hospitalProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${hospitalProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Critical Systems Priority', 'Medical Gas Inspection', '24/7 Emergency Dispatch', 'Infection Control Protocol', 'Generator AMC'].map((badge) => (
                                        <Chip key={badge} label={badge} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />
                                    ))}
                                </Stack>
                            </Paper>
                        )}

                        {isStadium && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Stadium / Sports / Event Profile</Typography>
                                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Event-Ready. Crowd-Safe. Maximum Uptime.</Typography>
                                    </Box>
                                    <Gem color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Seating capacity" value={stadiumProfile.seatingCapacity || 0} onChange={(e) => updateStadiumProfile({ seatingCapacity: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Pitches / fields" value={stadiumProfile.pitchesCount || 0} onChange={(e) => updateStadiumProfile({ pitchesCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="Courts" value={stadiumProfile.courtsCount || 0} onChange={(e) => updateStadiumProfile({ courtsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <TextField fullWidth size="small" type="number" label="VIP suites" value={stadiumProfile.vipSuitesCount || 0} onChange={(e) => updateStadiumProfile({ vipSuitesCount: Number(e.target.value) || 0, hasVIPSuite: Number(e.target.value) > 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[
                                        { key: 'hasChangeRooms', label: 'Changing Rooms' },
                                        { key: 'hasConcessionsArea', label: 'Concessions / F&B' },
                                        { key: 'hasLightingSystem', label: 'Floodlighting' },
                                        { key: 'hasPublicAddress', label: 'PA / AV System' },
                                    ].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateStadiumProfile({ [key]: !stadiumProfile[key] })}
                                            sx={{ bgcolor: stadiumProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: stadiumProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${stadiumProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Event-Day MEP Standby', 'Pitch Irrigation', 'Crowd Safety Systems', 'VIP Facilities Priority', 'CCTV Crowd Monitoring'].map((badge) => (
                                        <Chip key={badge} label={badge} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />
                                    ))}
                                </Stack>
                            </Paper>
                        )}

                        {isVilla && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Villa / Estate Profile</Typography><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Residential. Private. Premium Care.</Typography></Box>
                                    <Home color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Bedrooms" value={villaProfile.bedrooms || 3} onChange={(e) => updateVillaProfile({ bedrooms: Number(e.target.value) || 3 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Bathrooms" value={villaProfile.bathrooms || 3} onChange={(e) => updateVillaProfile({ bathrooms: Number(e.target.value) || 3 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Parking spaces" value={villaProfile.parkingSpaces || 2} onChange={(e) => updateVillaProfile({ parkingSpaces: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Garden sqm" value={villaProfile.gardenSqm || 0} onChange={(e) => updateVillaProfile({ gardenSqm: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[{ key: 'hasPrivatePool', label: 'Private Pool' }, { key: 'hasStaffQuarters', label: 'Staff Quarters' }, { key: 'hasBBQArea', label: 'BBQ Area' }, { key: 'hasSolarPanels', label: 'Solar Panels' }].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateVillaProfile({ [key]: !villaProfile[key] })} sx={{ bgcolor: villaProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: villaProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${villaProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['MEP Preventive Maintenance', 'AC Service', 'Pool & Garden Care', 'Water Tank Sterilization', 'Generator AMC'].map((b) => <Chip key={b} label={b} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />)}
                                </Stack>
                            </Paper>
                        )}

                        {isResidential && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Apartment / Residential Building Profile</Typography><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Residential. Multi-Unit. Building Scale.</Typography></Box>
                                    <Building color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Total units" value={residentialProfile.unitsCount || 0} onChange={(e) => updateResidentialProfile({ unitsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Avg bedrooms/unit" value={residentialProfile.avgBedrooms || 2} onChange={(e) => updateResidentialProfile({ avgBedrooms: Number(e.target.value) || 1 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Lifts" value={residentialProfile.liftsCount || 0} onChange={(e) => updateResidentialProfile({ liftsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Parking bays" value={residentialProfile.parkingBays || 0} onChange={(e) => updateResidentialProfile({ parkingBays: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[{ key: 'hasPool', label: 'Pool' }, { key: 'hasGym', label: 'Gym' }, { key: 'hasLobby', label: 'Lobby' }, { key: 'hasMaids', label: "Maid's Rooms" }].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateResidentialProfile({ [key]: !residentialProfile[key] })} sx={{ bgcolor: residentialProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: residentialProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${residentialProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Common Area MEP', 'Elevator AMC', 'Fire Safety Systems', 'Water Pump Service', 'Water Tank Sterilization'].map((b) => <Chip key={b} label={b} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />)}
                                </Stack>
                            </Paper>
                        )}

                        {isCommercial && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Commercial Building / Office Profile</Typography><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Commercial. Corporate. Business Grade.</Typography></Box>
                                    <Briefcase color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Office units" value={commercialProfile.officesCount || 0} onChange={(e) => updateCommercialProfile({ officesCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Meeting rooms" value={commercialProfile.meetingRooms || 0} onChange={(e) => updateCommercialProfile({ meetingRooms: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Lifts" value={commercialProfile.liftsCount || 0} onChange={(e) => updateCommercialProfile({ liftsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Parking bays" value={commercialProfile.parkingBays || 0} onChange={(e) => updateCommercialProfile({ parkingBays: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[{ key: 'hasDataRoom', label: 'Server / Data Room' }, { key: 'hasCanteen', label: 'Cafeteria / Canteen' }, { key: 'hasPrayer', label: 'Prayer Room' }, { key: 'receptionAreas', label: 'Reception Lobby' }].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateCommercialProfile({ [key]: typeof commercialProfile[key] === 'boolean' ? !commercialProfile[key] : 1 })} sx={{ bgcolor: commercialProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: commercialProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${commercialProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Office MEP Maintenance', 'HVAC Central System', 'Elevator AMC', 'Fire Safety & Emergency', 'Generator Standby'].map((b) => <Chip key={b} label={b} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />)}
                                </Stack>
                            </Paper>
                        )}

                        {isRetail && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Retail Center Profile</Typography><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Retail. Footfall. High Availability.</Typography></Box>
                                    <Building2 color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Shops / units" value={retailProfile.shopsCount || 0} onChange={(e) => updateRetailProfile({ shopsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Food court units" value={retailProfile.foodCourtUnits || 0} onChange={(e) => updateRetailProfile({ foodCourtUnits: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Escalators" value={retailProfile.escalatorsCount || 0} onChange={(e) => updateRetailProfile({ escalatorsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Lifts" value={retailProfile.liftsCount || 0} onChange={(e) => updateRetailProfile({ liftsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[{ key: 'hasAnchorTenant', label: 'Anchor Tenant' }, { key: 'hasSecurity', label: 'Security / CCTV' }, { key: 'hasGym', label: 'Gym / Wellness' }].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateRetailProfile({ [key]: !retailProfile[key] })} sx={{ bgcolor: retailProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: retailProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${retailProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Shop MEP Response', 'Escalator & Elevator AMC', 'Food Court Grease Trap', 'Fire Safety & CCTV AMC', 'Common Area Cleaning'].map((b) => <Chip key={b} label={b} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />)}
                                </Stack>
                            </Paper>
                        )}

                        {isWarehouse && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Warehouse / Industrial Profile</Typography><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Industrial. Fire-Ready. Operationally Safe.</Typography></Box>
                                    <Warehouse color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Loading bays" value={warehouseProfile.loadingBays || 0} onChange={(e) => updateWarehouseProfile({ loadingBays: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Shutter doors" value={warehouseProfile.shutterDoors || 0} onChange={(e) => updateWarehouseProfile({ shutterDoors: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Power load (KW)" value={warehouseProfile.powerLoadKW || 0} onChange={(e) => updateWarehouseProfile({ powerLoadKW: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Ceiling height (m)" value={warehouseProfile.ceilingHeightMeters || 6} onChange={(e) => updateWarehouseProfile({ ceilingHeightMeters: Number(e.target.value) || 6 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[{ key: 'hasSprinklers', label: 'Sprinkler System' }, { key: 'hasFirePump', label: 'Fire Pump' }, { key: 'hasMezzanine', label: 'Mezzanine Floor' }, { key: 'hasOfficeArea', label: 'Office Area' }, { key: 'hasHazmat', label: 'Hazmat Zone' }].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateWarehouseProfile({ [key]: !warehouseProfile[key] })} sx={{ bgcolor: warehouseProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: warehouseProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${warehouseProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Industrial MEP Maintenance', 'Fire Pump & Sprinkler AMC', 'Loading Bay Door Systems', 'HVAC Ventilation', 'Emergency Lighting'].map((b) => <Chip key={b} label={b} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />)}
                                </Stack>
                            </Paper>
                        )}

                        {isLabourCamp && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Labour Camp / Staff Accommodation Profile</Typography><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Compliant. Hygienic. Ministry-Ready.</Typography></Box>
                                    <Building2 color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Total beds" value={labourCampProfile.bedsCount || 0} onChange={(e) => updateLabourCampProfile({ bedsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Blocks / buildings" value={labourCampProfile.blocksCount || 0} onChange={(e) => updateLabourCampProfile({ blocksCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Toilets per block" value={labourCampProfile.toiletsPerBlock || 4} onChange={(e) => updateLabourCampProfile({ toiletsPerBlock: Number(e.target.value) || 4 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Water tanks" value={labourCampProfile.waterTanksCount || 1} onChange={(e) => updateLabourCampProfile({ waterTanksCount: Number(e.target.value) || 1 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Kitchens" value={labourCampProfile.kitchensCount || 1} onChange={(e) => updateLabourCampProfile({ kitchensCount: Number(e.target.value) || 1 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Laundry units" value={labourCampProfile.laundryUnitsCount || 0} onChange={(e) => updateLabourCampProfile({ laundryUnitsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[{ key: 'hasPestControlZone', label: 'Pest Control Zone' }, { key: 'hasFireSafety', label: 'Fire Safety' }, { key: 'hasCanteen', label: 'Canteen' }, { key: 'hasMedicalRoom', label: 'Medical Room' }].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateLabourCampProfile({ [key]: !labourCampProfile[key] })} sx={{ bgcolor: labourCampProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: labourCampProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${labourCampProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Accommodation MEP', 'Water Tank Sterilization', 'Pest Control AMC', 'Fire Safety Systems', 'Laundry & Kitchen Systems'].map((b) => <Chip key={b} label={b} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />)}
                                </Stack>
                            </Paper>
                        )}

                        {(isGovernment) && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Government Property Profile</Typography><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Institutional. Compliant. Sovereign Grade.</Typography></Box>
                                    <ShieldCheck color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}><TextField select fullWidth size="small" label="Property type" value={governmentProfile.govPropertyType || 'Government Office'} onChange={(e) => updateGovernmentProfile({ govPropertyType: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>{['Government Office', 'Authority / Department', 'Court Building', 'Ministry', 'Municipality', 'Police Station', 'Military Base'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Meeting rooms" value={governmentProfile.meetingRooms || 0} onChange={(e) => updateGovernmentProfile({ meetingRooms: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Staff count" value={governmentProfile.staffCount || 0} onChange={(e) => updateGovernmentProfile({ staffCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={12} sm={6}><TextField select fullWidth size="small" label="Security level" value={governmentProfile.securityLevel || 'Standard'} onChange={(e) => updateGovernmentProfile({ securityLevel: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>{['Standard', 'Restricted', 'High Security', 'Sovereign'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField></Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[{ key: 'hasVIPArea', label: 'VIP Area' }, { key: 'hasCeremonialSpace', label: 'Ceremonial Space' }, { key: 'hasPublicServiceCounter', label: 'Public Counter' }, { key: 'hasDataCenter', label: 'Data Center' }].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateGovernmentProfile({ [key]: !governmentProfile[key] })} sx={{ bgcolor: governmentProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: governmentProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${governmentProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Gov-Standard MEP', 'Security Systems AMC', 'VIP Priority Response', 'Fire & Emergency Systems', 'Access Control AMC'].map((b) => <Chip key={b} label={b} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />)}
                                </Stack>
                            </Paper>
                        )}

                        {(isGovMajlis || isPrivateMajlis) && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{isGovMajlis ? 'Government' : 'Private'} Majlis Profile</Typography><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Majlis. Event-Ready. VIP Standard.</Typography></Box>
                                    <Landmark color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Guests capacity" value={majlisProfile.guestsCapacity || 0} onChange={(e) => updateMajlisProfile({ guestsCapacity: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Majlis rooms" value={majlisProfile.majlisRoomsCount || 1} onChange={(e) => updateMajlisProfile({ majlisRoomsCount: Number(e.target.value) || 1 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Garden sqm" value={majlisProfile.gardenSqm || 0} onChange={(e) => updateMajlisProfile({ gardenSqm: Number(e.target.value) || 0, hasGarden: Number(e.target.value) > 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Event halls" value={majlisProfile.eventHallsCount || 0} onChange={(e) => updateMajlisProfile({ eventHallsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[{ key: 'hasGarden', label: 'Garden / Courtyard' }, { key: 'hasKitchen', label: 'Kitchen / Pantry' }, { key: 'hasVIPRoom', label: 'VIP Room' }, { key: 'hasCarPark', label: 'Car Park' }, { key: 'hasCCTV', label: 'CCTV' }].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateMajlisProfile({ [key]: !majlisProfile[key] })} sx={{ bgcolor: majlisProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: majlisProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${majlisProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Majlis Event-Day Readiness', 'Full MEP Systems', 'Garden Deep Care', 'CCTV & Security AMC', 'VIP-Grade Reporting'].map((b) => <Chip key={b} label={b} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />)}
                                </Stack>
                            </Paper>
                        )}

                        {isMixedUse && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Mixed-Use Tower / Skyscraper Profile</Typography><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Multi-Function. High-Rise. 24/7 Operations.</Typography></Box>
                                    <Gem color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Residential floors" value={mixedUseProfile.residentialFloors || 0} onChange={(e) => updateMixedUseProfile({ residentialFloors: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Commercial floors" value={mixedUseProfile.commercialFloors || 0} onChange={(e) => updateMixedUseProfile({ commercialFloors: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Total units" value={mixedUseProfile.totalUnits || 0} onChange={(e) => updateMixedUseProfile({ totalUnits: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Lifts" value={mixedUseProfile.liftsCount || 0} onChange={(e) => updateMixedUseProfile({ liftsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Podium shops" value={mixedUseProfile.podiumShopsCount || 0} onChange={(e) => updateMixedUseProfile({ podiumShopsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[{ key: 'hasHotelComponent', label: 'Hotel Component' }, { key: 'hasServiced', label: 'Serviced Apartments' }, { key: 'hasPool', label: 'Pool' }, { key: 'hasGym', label: 'Gym' }].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateMixedUseProfile({ [key]: !mixedUseProfile[key] })} sx={{ bgcolor: mixedUseProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: mixedUseProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${mixedUseProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Residential MEP Response', 'Commercial MEP Systems', 'Multiple Lift AMC', 'Pool & Gym Maintenance', 'Retail Podium Fire Safety'].map((b) => <Chip key={b} label={b} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />)}
                                </Stack>
                            </Paper>
                        )}

                        {isFarm && (
                            <Paper sx={{ mt: 4, p: { xs: 2.5, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Farm / Estate Profile</Typography><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Estate. Irrigation. Outdoor Systems.</Typography></Box>
                                    <Home color={binThemeTokens.gold} />
                                </Stack>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Land acres" value={farmProfile.landAcres || 0} onChange={(e) => updateFarmProfile({ landAcres: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Irrigation zones" value={farmProfile.irrigationZones || 0} onChange={(e) => updateFarmProfile({ irrigationZones: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Pumps" value={farmProfile.pumpsCount || 0} onChange={(e) => updateFarmProfile({ pumpsCount: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Landscaping sqm" value={farmProfile.landscapingSqm || 0} onChange={(e) => updateFarmProfile({ landscapingSqm: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="External lighting pts" value={farmProfile.externalLightingPoints || 0} onChange={(e) => updateFarmProfile({ externalLightingPoints: Number(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Staff quarters" value={farmProfile.staffQuartersCount || 0} onChange={(e) => updateFarmProfile({ staffQuartersCount: Number(e.target.value) || 0, hasStaffQuarters: Number(e.target.value) > 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                </Grid>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 3 }}>
                                    {[{ key: 'hasGenerator', label: 'Generator' }, { key: 'hasStorageBuilding', label: 'Storage Building' }, { key: 'hasPaddock', label: 'Paddock / Animal Area' }].map(({ key, label }) => (
                                        <Chip key={key} label={label} onClick={() => updateFarmProfile({ [key]: !farmProfile[key] })} sx={{ bgcolor: farmProfile[key] ? alpha(binThemeTokens.gold, 0.2) : 'rgba(255,255,255,0.04)', color: farmProfile[key] ? binThemeTokens.gold : 'rgba(255,255,255,0.6)', border: `1px solid ${farmProfile[key] ? alpha(binThemeTokens.gold, 0.5) : 'rgba(255,255,255,0.1)'}`, fontWeight: 900, cursor: 'pointer' }} />
                                    ))}
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
                                    {['Irrigation System Maintenance', 'Pump Room MEP', 'Landscape Lighting', 'Generator AMC', 'Staff Quarters MEP'].map((b) => <Chip key={b} label={b} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }} />)}
                                </Stack>
                            </Paper>
                        )}
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: { xs: 3, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                2. {t('onboarding.verification').toUpperCase()}
                            </Typography>
                            <Stack spacing={3}>
                                <Button
                                    variant="outlined"
                                    component="label"
                                    fullWidth
                                    startIcon={scanning ? <CircularProgress size={16} color="inherit" /> : <Scan size={18} />}
                                    sx={{ mb: 1, py: 1.5, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, borderStyle: 'dashed' }}
                                >
                                    {scanning ? t('onboarding.scanning') : scanned ? t('onboarding.scanned') : t('onboarding.scan_btn')}
                                    {!scanning && !scanned && <input type="file" accept="image/*,.pdf" hidden onChange={handleTitleDeedUpload} />}
                                </Button>

                                {selectedType && (
                                    <Paper sx={{ p: 2, borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.08), border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'block' }}>Selected asset</Typography>
                                        <Typography variant="subtitle2" sx={{ color: '#FFF', fontWeight: 950 }}>{selectedType.label}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>{selectedType.category} · {selectedType.premium ? 'Sovereign / enhanced pricing logic' : 'Standard pricing logic'}</Typography>
                                    </Paper>
                                )}

                                <Box>
                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>Auto-detected grade:</Typography>
                                        <Chip label={inferredGrade} size="small" sx={{ bgcolor: alpha(gradeColor, 0.15), color: gradeColor, fontWeight: 900, fontSize: 11, height: 20 }} />
                                        {effectiveGrade !== inferredGrade && (
                                            <Chip label={`→ ${effectiveGrade} (manual)`} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900, fontSize: 11, height: 20 }} />
                                        )}
                                    </Stack>
                                    <TextField
                                        select fullWidth label="Asset Grade / درجة الأصل" size="small"
                                        value={activeProperty?.assetGrade || 'Standard'}
                                        onChange={(e) => updateProperty(0, { assetGrade: e.target.value as any })}
                                        helperText={
                                            effectiveGrade === 'Standard' ? 'Standard spec — base pricing applies' :
                                            effectiveGrade === 'Premium' ? 'Premium spec — 20% grade premium applies' :
                                            effectiveGrade === 'Luxury' ? 'Luxury spec — 45% grade premium applies' :
                                            'Sovereign / Ultra-Luxury — highest pricing tier'
                                        }
                                        FormHelperTextProps={{ sx: { color: gradeColor, fontWeight: 700 } }}
                                        sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                    >
                                        <MenuItem value="Standard">Standard — base spec</MenuItem>
                                        <MenuItem value="Premium">Premium — 20% premium</MenuItem>
                                        <MenuItem value="Luxury">Luxury — 45% premium</MenuItem>
                                        <MenuItem value="Sovereign">Sovereign — 2× rate</MenuItem>
                                    </TextField>
                                </Box>

                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <TextField fullWidth label={isMosque ? 'Wudu areas' : isHotel ? 'Rooms' : isSchool ? 'Classrooms' : isHospital ? 'Wards' : isStadium ? 'Capacity / 100' : t('onboarding.units')} type="number" size="small" value={activeProperty?.units || 0} onChange={(e) => updateProperty(0, { units: parseInt(e.target.value) || 0 })} InputProps={{ endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null }} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField fullWidth label={t('onboarding.floors')} type="number" size="small" value={activeProperty?.floors || 1} onChange={(e) => updateProperty(0, { floors: parseInt(e.target.value) || 1 })} InputProps={{ endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null }} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField fullWidth label={t('onboarding.sqft')} type="number" size="small" value={activeProperty?.sqft || 0} onChange={(e) => updateProperty(0, { sqft: parseInt(e.target.value) || 0 })} InputProps={{ endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null }} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField fullWidth label={t('onboarding.age')} type="number" size="small" value={activeProperty?.age || 0} onChange={(e) => updateProperty(0, { age: parseInt(e.target.value) || 0 })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
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
