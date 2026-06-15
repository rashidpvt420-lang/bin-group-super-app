import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { calculateUaeQuote2026, ADD_ON_PRICING } from '../utils/calculateUaeQuote2026';
import type { QuoteOutput } from '../utils/calculateUaeQuote2026';

const createOnboardingSessionId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return `onb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export interface PropertyData {
    id: string;
    emirate: string;
    area: string;
    zone: 'A' | 'B' | 'C';
    propertyType: string;
    subType: string;
    useType: 'Rental' | 'Personal' | 'Mixed' | 'Government' | string;
    ownerType: 'Private' | 'Government' | string;
    floors: number;
    units: number;
    bedrooms: number;
    bathrooms: number;
    shops: number;
    offices: number;
    rooms: number;
    sqft: number;
    age: number;
    annualRent?: number;
    annualRevenue?: number;
    pool: boolean;
    lifts: number;
    tank: boolean;
    bmu: boolean;
    sira: boolean;
    fireAlarm: boolean;
    firePump: boolean;
    escalators: boolean;
    centralLPG: boolean;
    wasteMan: boolean;
    gen: boolean;
    hvac: boolean;
    districtCooling: boolean;
    electrical: boolean;
    plumbing: boolean;
    drainage: boolean;
    pumps: boolean;
    emergencyLighting: boolean;
    accessControl: boolean;
    bms: boolean;
    iotSensors: boolean;
    gym: boolean;
    majlis: boolean;
    majlisType: 'government' | 'none' | string;
    majlisSubtype?: string;
    mosqueProfile?: Record<string, any>;
    assetClass?: string;
    riskProfile?: string;
    serviceModel?: string;
    majlisGarden?: boolean;
    authorityName?: string;
    departmentName?: string;
    govPropertySubtype?: 'office' | 'service_center' | 'facility' | 'accommodation' | 'compound' | 'mixed_government_building';
    protocolLevel?: 'Standard' | 'High' | 'Sovereign';
    securityLevel?: 'Standard' | 'Enhanced' | 'Maximum';
    hospitalityReadiness?: boolean;
    guestCapacity?: number;
    parkingCapacity?: number;
    heritageSensitivity?: 'Standard' | 'Cultural' | 'Protected' | 'Sovereign';
    eventUse?: boolean;
    publicAccessLevel?: 'Private' | 'Restricted' | 'Public';
    irrigationSystem?: boolean;
    solarIntegration?: boolean;
    evReadiness?: boolean;
    publicGathering?: boolean;
    governmentUse?: boolean;
    hvacCount?: number;
    hvacType?: string;
    hotelClass?: '3_STAR' | '4_STAR' | '5_STAR' | 'DELUXE' | 'ULTRA_LUXURY';
    roomCount?: number;
    restaurantCount?: number;
    eventHalls?: number;
    spaGym?: boolean;
    laundryKitchenComplexity?: 'Low' | 'Medium' | 'High';
    backOfHouseComplexity?: 'Standard' | 'Complex';
    occupancyProfile?: string;
    chilledWaterProfile?: string;
    commonAreaIntensity?: 'Standard' | 'High' | 'Intense';
    poolsCount?: number;
    missions: string[];
    condition: 'Mint' | 'Good' | 'Fair' | 'Poor';
    assetGrade: 'Standard' | 'Premium' | 'Luxury' | 'Ultra-Luxury' | 'Sovereign';
    currentStatus: string;
    titleDeedStatus?: 'uploaded' | 'queued' | 'scanning' | 'extracted' | 'verification_pending' | 'verified' | 'mismatch' | 'manual_review_required' | 'rejected';
    address: string;
    addressLine?: string;
    city?: string;
    googlePlaceId?: string;
    geo?: {
        point?: { latitude: number; longitude: number };
        lat: number;
        lng: number;
        geohash: string;
        source: string;
        placeId?: string;
        address: string;
        emirate: string;
        city: string;
        area: string;
        verified: boolean;
        dispatchReady?: boolean;
        requiresGeoReview?: boolean;
        verifiedAt?: string;
        updatedAt?: string;
    };
    location?: {
        lat?: number;
        lng?: number;
        latitude?: number;
        longitude?: number;
        address?: string;
        formattedAddress?: string;
        emirate?: string;
        googleMapsUrl?: string;
        plusCode?: string;
        accuracy?: 'EXACT' | 'APPROXIMATE' | 'MISSING';
        quality?: string;
        updatedAt?: string;
        updatedBy?: string;
    };
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
    googleMapsUrl?: string;
    plusCode?: string;
    ownerEmail?: string;
    exposure?: string;
    strategy?: 'fm_only' | 'pm_only' | 'both' | 'sale' | 'rent' | 'fm';
    slaTier?: 'standard' | 'premium' | 'elite';
    paymentPlan?: 'annual' | 'quarterly' | 'monthly';
}

export interface PortfolioSummary {
    totalProperties: number;
    totalUnits: number;
    totalRentable: number;
    totalPersonal: number;
    totalMajlis: number;
    totalSqFt: number;
    estimatedACV: number;
    recommendedTier: string;
    isMixedUsePortfolio: boolean;
    isSovereignPortfolio: boolean;
    quoteResults?: Record<string, QuoteOutput>;
}

export interface OnboardingState {
    step: number;
    properties: PropertyData[];
    portfolioSummary: PortfolioSummary;
    selectedPlan: any | null;
    selectedAddOns: string[];
    contractId: string | null;
    paymentVerified: boolean;
    paymentRequested: boolean;
    accountCreated: boolean;
    valuationResult: any | null;
    intakeId: string | null;
    onboardingSessionId: string;
    paymentManifest: any | null;
    paymentMethod: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'STRIPE' | null;
    companyProfile: { name: string; licenseNumber: string; contactPerson: string; phone: string; email: string };
    signupData: { name: string; email: string; phone: string; password?: string };
    isContractSigned: boolean;
    signatureName: string;
    kycUrls: { emiratesId?: string; passport?: string; titleDeed?: string; tradeLicense?: string };
    ownerAccount: { uid: string; fullName: string; email: string; mobile: string } | null;
    proofDocuments: {
        propertyProof: { name: string; size: number; type: string } | null;
        emiratesId: { name: string; size: number; type: string } | null;
        passport: { name: string; size: number; type: string } | null;
        tradeLicense: { name: string; size: number; type: string } | null;
        tenancySupport: { name: string; size: number; type: string } | null;
        labels: Record<string, string>;
    };
    propertyData: PropertyData;
    setStep: (step: number) => void;
    nextStep: () => void;
    prevStep: () => void;
    setIntakeId: (id: string) => void;
    addProperty: (data?: Partial<PropertyData>) => void;
    bulkAddProperties: (items: Partial<PropertyData>[]) => void;
    removeProperty: (index: number) => void;
    updateProperty: (index: number, data: Partial<PropertyData>) => void;
    updateCompanyProfile: (data: Partial<OnboardingState['companyProfile']>) => void;
    updateSignupData: (data: Partial<OnboardingState['signupData']>) => void;
    updateKycUrls: (data: Partial<OnboardingState['kycUrls']>) => void;
    setContractSignature: (isSigned: boolean, name: string) => void;
    setSelectedPlan: (plan: any) => void;
    toggleAddOn: (id: string) => void;
    setContractId: (id: string) => void;
    setPaymentVerified: (status: boolean) => void;
    setPaymentRequested: (status: boolean) => void;
    setAccountCreated: (status: boolean) => void;
    setValuationResult: (result: any) => void;
    setPaymentManifest: (manifest: any) => void;
    setPaymentMethod: (method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'STRIPE' | null) => void;
    setOwnerAccount: (account: OnboardingState['ownerAccount']) => void;
    setProofDocument: (key: keyof Omit<OnboardingState['proofDocuments'], 'labels'>, file: { name: string; size: number; type: string } | null) => void;
    updatePropertyData: (data: Partial<PropertyData>) => void;
    calculateSummary: () => void;
    reset: () => void;
}

const normalizeText = (...values: unknown[]) => values.filter(Boolean).join(' ').toLowerCase();

const isMosqueAsset = (property: Partial<PropertyData>): boolean => {
    const label = normalizeText(property.propertyType, property.subType, property.assetClass, property.serviceModel);
    return label.includes('mosque') || label.includes('masjid') || label.includes('religious_facility') || label.includes('mosque_fm');
};

const resolveAssetClassId = (property: Partial<PropertyData>): string => {
    const label = normalizeText(property.propertyType, property.subType, property.assetClass, property.serviceModel);
    if (isMosqueAsset(property)) return 'mosque_fm';
    if (label.includes('private majlis')) return 'private_majlis';
    if (label.includes('majlis')) return 'government_majlis';
    if (label.includes('ultra') || label.includes('luxury estate')) return 'villa-lux';
    if (label.includes('villa')) return property.assetGrade === 'Luxury' || property.assetGrade === 'Ultra-Luxury' ? 'villa-lux' : 'villa-std';
    if (label.includes('luxury apartment')) return 'apt-lux';
    if (label.includes('apartment') || label.includes('residential building')) return 'apt-std';
    if (label.includes('skyscraper')) return 'skyscraper';
    if (label.includes('mixed')) return 'mix-dev';
    if (label.includes('commercial building') || label.includes('commercial tower')) return 'com-twr';
    if (label.includes('office')) return 'off-sml';
    if (label.includes('mall') || label.includes('retail')) return 'rtl-mall';
    if (label.includes('hotel') || label.includes('resort')) return 'mid_scale_hotel';
    if (label.includes('hospital') || label.includes('clinic')) return 'hosp';
    if (label.includes('university') || label.includes('campus')) return 'university';
    if (label.includes('school')) return 'school';
    if (label.includes('warehouse')) return 'warehouse';
    if (label.includes('industrial')) return 'industrial_site';
    if (label.includes('labour') || label.includes('labor')) return 'lab-camp';
    if (label.includes('staff accommodation')) return 'staff_acc';
    if (label.includes('government')) return 'government_property';
    if (label.includes('stadium')) return 'stadium';
    if (label.includes('sports complex')) return 'sports_complex';
    if (label.includes('event venue')) return 'event_venue';
    if (label.includes('farm') || label.includes('estate')) return 'farm_estate';
    return 'apt-std';
};

const calculatePropertyAnnualValue = (property: PropertyData, selectedAddOns: string[]): QuoteOutput => {
    const mosqueProfile = property.mosqueProfile || {};
    const isMosque = isMosqueAsset(property);
    const assetClassId = resolveAssetClassId(property);
    const emirateMap: Record<string, string> = {
        Dubai: 'dubai',
        'Abu Dhabi': 'abuDhabi',
        Sharjah: 'sharjah',
        Ajman: 'ajman',
        RAK: 'rasAlKhaimah',
        'Ras Al Khaimah': 'rasAlKhaimah',
        Fujairah: 'fujairah',
        UAQ: 'ummAlQuwain',
        'Umm Al Quwain': 'ummAlQuwain'
    };
    const capacityOrUnits = isMosque
        ? (Number(mosqueProfile.maxWorshipperCapacity) || property.rooms || property.units || 300)
        : (property.roomCount || property.rooms || property.units || 1);
    const beds = property.bedrooms || property.rooms || property.roomCount || property.units || 1;

    return calculateUaeQuote2026({
        assetClassId,
        assetLabel: property.propertyType,
        emirate: emirateMap[property.emirate] || property.emirate || 'dubai',
        zone: property.zone || 'B',
        contractType: property.strategy === 'pm_only' || property.strategy === 'rent' ? 'PM_ONLY' : (property.strategy === 'fm_only' || property.strategy === 'fm' ? 'FM_ONLY' : 'BOTH'),
        sqft: isMosque ? (Number(mosqueProfile.grossFloorAreaSqft) || property.sqft) : property.sqft,
        units: capacityOrUnits,
        beds,
        annualRent: property.annualRent,
        annualRevenue: property.annualRevenue,
        propertyAge: isMosque ? (Number(mosqueProfile.propertyAgeYears) || property.age) : property.age,
        floors: property.floors,
        lifts: property.lifts,
        hasPool: property.pool || Number(property.poolsCount || 0) > 0,
        hasGym: property.gym || property.spaGym,
        hasCentralHVAC: isMosque ? true : property.hvac,
        hasDistrictCooling: property.districtCooling,
        hasCivilDefenseSystem: property.fireAlarm || property.firePump,
        hasSiraCctv: isMosque ? Boolean(property.sira || mosqueProfile.cctvInstalled || Number(mosqueProfile.cctvCameraCount) > 0) : property.sira,
        hasGenerator: property.gen,
        hasBmu: property.bmu,
        addOns: selectedAddOns,
        slaTier: property.slaTier || (isMosque || property.assetGrade === 'Sovereign' ? 'premium' : 'standard'),
        paymentPlan: property.paymentPlan || 'annual',
        hasWaterTank: property.tank || Number(mosqueProfile.waterTanksCount || 0) > 0,
        hvacCount: property.hvacCount || Number(mosqueProfile.hvacUnitsCount || 0),
        offices: property.offices,
        shops: property.shops,
        wuduAreas: isMosque ? Number(mosqueProfile.wuduAreasCount || property.units || 1) : undefined
    });
};

const defaultProperty: PropertyData = {
    id: '',
    emirate: 'Dubai',
    area: '',
    zone: 'B',
    propertyType: 'Residential',
    subType: 'Apartment',
    useType: 'Rental',
    ownerType: 'Private',
    floors: 1,
    units: 1,
    bedrooms: 1,
    bathrooms: 1,
    shops: 0,
    offices: 0,
    rooms: 0,
    sqft: 1200,
    age: 5,
    pool: false,
    lifts: 0,
    tank: false,
    bmu: false,
    sira: false,
    fireAlarm: false,
    firePump: false,
    escalators: false,
    centralLPG: false,
    wasteMan: false,
    gen: false,
    hvac: false,
    districtCooling: false,
    electrical: false,
    plumbing: false,
    drainage: false,
    pumps: false,
    emergencyLighting: false,
    accessControl: false,
    bms: false,
    iotSensors: false,
    gym: false,
    majlis: false,
    majlisType: 'none',
    missions: [],
    condition: 'Good',
    assetGrade: 'Premium',
    currentStatus: 'Active',
    address: '',
    strategy: 'fm',
    slaTier: 'standard',
    paymentPlan: 'annual'
};

export const useOnboardingStore = create<OnboardingState>()(
    persist(
        (set, get) => ({
            step: 1,
            properties: [],
            portfolioSummary: {
                totalProperties: 0,
                totalUnits: 0,
                totalRentable: 0,
                totalPersonal: 0,
                totalMajlis: 0,
                totalSqFt: 0,
                estimatedACV: 0,
                recommendedTier: 'Premium',
                isMixedUsePortfolio: false,
                isSovereignPortfolio: false,
            },
            selectedPlan: null,
            selectedAddOns: [],
            contractId: null,
            paymentVerified: false,
            paymentRequested: false,
            accountCreated: false,
            valuationResult: null,
            intakeId: null,
            onboardingSessionId: createOnboardingSessionId(),
            paymentManifest: null,
            paymentMethod: null,
            companyProfile: { name: '', licenseNumber: '', contactPerson: '', phone: '', email: '' },
            signupData: { name: '', email: '', phone: '' },
            isContractSigned: false,
            signatureName: '',
            kycUrls: {},
            ownerAccount: null,
            proofDocuments: {
                propertyProof: null,
                emiratesId: null,
                passport: null,
                tradeLicense: null,
                tenancySupport: null,
                labels: {}
            },
            propertyData: { ...defaultProperty, id: 'prop-1' },
            setStep: (step) => set({ step }),
            nextStep: () => set((state) => ({ step: state.step + 1 })),
            prevStep: () => set((state) => ({ step: state.step - 1 })),
            setIntakeId: (id) => set({ intakeId: id }),
            addProperty: (data) => {
                const newProperty = { ...defaultProperty, ...data, id: `prop-${get().properties.length + 1}` };
                set((state) => ({ properties: [...state.properties, newProperty] }));
                get().calculateSummary();
            },
            bulkAddProperties: (items) => {
                const currentCount = get().properties.length;
                const newProperties = items.map((item, index) => ({ ...defaultProperty, ...item, id: item.id || `prop-${currentCount + index + 1}` }));
                set((state) => ({ properties: [...state.properties, ...newProperties] }));
                get().calculateSummary();
            },
            removeProperty: (index) => {
                set((state) => ({ properties: state.properties.filter((_, i) => i !== index) }));
                get().calculateSummary();
            },
            updateProperty: (index, data) => {
                set((state) => {
                    const newProperties = [...state.properties];
                    if (newProperties[index]) newProperties[index] = { ...newProperties[index], ...data };
                    const newPropertyData = index === 0 ? { ...state.propertyData, ...data } : state.propertyData;
                    return { properties: newProperties, propertyData: newPropertyData };
                });
                get().calculateSummary();
            },
            updateCompanyProfile: (data) => set((state) => ({ companyProfile: { ...state.companyProfile, ...data } })),
            updateSignupData: (data) => set((state) => ({ signupData: { ...state.signupData, ...data } })),
            updateKycUrls: (data) => set((state) => ({ kycUrls: { ...state.kycUrls, ...data } })),
            setContractSignature: (isSigned, name) => set({ isContractSigned: isSigned, signatureName: name }),
            setSelectedPlan: (selectedPlan) => set({ selectedPlan }),
            toggleAddOn: (id) => {
                set((state) => ({ selectedAddOns: state.selectedAddOns.includes(id) ? state.selectedAddOns.filter(a => a !== id) : [...state.selectedAddOns, id] }));
                get().calculateSummary();
            },
            setContractId: (contractId) => set({ contractId }),
            setPaymentVerified: (paymentVerified) => set({ paymentVerified }),
            setPaymentRequested: (paymentRequested) => set({ paymentRequested }),
            setAccountCreated: (accountCreated) => set({ accountCreated }),
            setValuationResult: (valuationResult) => set({ valuationResult }),
            setPaymentManifest: (paymentManifest) => set({ paymentManifest }),
            setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
            setOwnerAccount: (ownerAccount) => set({ ownerAccount, accountCreated: !!ownerAccount }),
            updatePropertyData: (data) => {
                set((state) => ({ propertyData: { ...state.propertyData, ...data } }));
                get().calculateSummary();
            },
            setProofDocument: (key, file) => set((state) => ({
                proofDocuments: { ...state.proofDocuments, [key]: file, labels: { ...state.proofDocuments.labels, [key]: file?.name || '' } }
            })),
            calculateSummary: () => {
                const props = get().properties.length > 0 ? get().properties : [get().propertyData];
                const selectedAddOns = get().selectedAddOns || [];
                const quoteResults: Record<string, QuoteOutput> = {};
                props.forEach(p => { quoteResults[p.id] = calculatePropertyAnnualValue(p, selectedAddOns); });
                let estimatedACV = Object.values(quoteResults).reduce((acc, q) => acc + q.annualTotal, 0);
                if (estimatedACV === 0) {
                    const totalRent = props.reduce((acc, p) => acc + (p.annualRent || 0), 0);
                    estimatedACV = Math.round(totalRent * 0.95);
                }
                const summary: PortfolioSummary = {
                    totalProperties: get().properties.length > 0 ? props.length : 1,
                    totalUnits: props.reduce((acc, p) => acc + (p.units || p.roomCount || p.rooms || 0), 0),
                    totalRentable: props.filter(p => p.useType === 'Rental' || p.useType === 'Mixed').length,
                    totalPersonal: props.filter(p => p.useType === 'Personal').length,
                    totalMajlis: props.filter(p => p.majlis).length,
                    totalSqFt: props.reduce((acc, p) => acc + (p.sqft || 0), 0),
                    estimatedACV,
                    recommendedTier: 'Premium',
                    isMixedUsePortfolio: props.some(p => p.propertyType === 'Mixed-Use' || p.useType === 'Mixed'),
                    isSovereignPortfolio: props.some(p => p.majlisType === 'government' || p.assetGrade === 'Sovereign' || isMosqueAsset(p) || p.ownerType === 'Government'),
                    quoteResults
                };
                if (summary.totalUnits > 100 || summary.isSovereignPortfolio) summary.recommendedTier = 'Sovereign Institutional';
                else if (summary.totalUnits > 20) summary.recommendedTier = 'Institutional';
                set({ portfolioSummary: summary });
            },
            reset: () => set({
                step: 1,
                properties: [],
                selectedPlan: null,
                selectedAddOns: [],
                contractId: null,
                intakeId: null,
                onboardingSessionId: createOnboardingSessionId(),
                paymentVerified: false,
                paymentRequested: false,
                accountCreated: false,
                valuationResult: null,
                paymentManifest: null,
                paymentMethod: null,
                isContractSigned: false,
                signatureName: '',
                companyProfile: { name: '', licenseNumber: '', contactPerson: '', phone: '', email: '' },
                signupData: { name: '', email: '', phone: '' },
                kycUrls: {},
                ownerAccount: null,
                proofDocuments: {
                    propertyProof: null,
                    emiratesId: null,
                    passport: null,
                    tradeLicense: null,
                    tenancySupport: null,
                    labels: {}
                },
                propertyData: { ...defaultProperty, id: 'prop-1' }
            })
        }),
        {
            name: 'bin-group-onboarding-v3',
            partialize: (state) => ({ ...state, proofDocuments: state.proofDocuments })
        }
    )
);

export const SERVICE_SCOPE_ADD_ONS = ADD_ON_PRICING;
