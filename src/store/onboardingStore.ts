import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { calculateUaeQuote2026 } from '../utils/calculateUaeQuote2026';
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
    missions: string[];
    condition: 'Mint' | 'Good' | 'Fair' | 'Poor';
    assetGrade: 'Standard' | 'Premium' | 'Luxury' | 'Ultra-Luxury' | 'Sovereign';
    currentStatus: string;
    address: string;
    strategy?: 'fm_only' | 'pm_only' | 'both' | 'sale' | 'rent' | 'fm';
    slaTier?: 'standard' | 'premium' | 'elite';
    paymentPlan?: 'annual' | 'quarterly' | 'monthly';
    titleDeedStatus?: 'uploaded' | 'queued' | 'scanning' | 'extracted' | 'verification_pending' | 'verified' | 'mismatch' | 'manual_review_required' | 'rejected';
    mosqueProfile?: Record<string, any>;
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
    [key: string]: any;
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
    contractOtpVerificationId: string | null;
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
    setContractOtpVerificationId: (verificationId: string | null) => void;
    setSelectedPlan: (plan: any) => void;
    toggleAddOn: (id: string) => void;
    setContractId: (id: string) => void;
    setPaymentVerified: (status: boolean) => void;
    setPaymentRequested: (status: boolean) => void;
    setAccountCreated: (status: boolean) => void;
    setValuationResult: (result: any) => void;
    setPaymentManifest: (manifest: any) => void;
    setPaymentMethod: (method: OnboardingState['paymentMethod']) => void;
    setOwnerAccount: (account: OnboardingState['ownerAccount']) => void;
    setProofDocument: (key: keyof Omit<OnboardingState['proofDocuments'], 'labels'>, file: { name: string; size: number; type: string } | null) => void;
    updatePropertyData: (data: Partial<PropertyData>) => void;
    calculateSummary: () => void;
    reset: () => void;
}

const isMosqueAsset = (property: PropertyData) => {
    const descriptor = `${property.propertyType || ''} ${property.subType || ''} ${property.assetClass || ''} ${property.serviceModel || ''}`.toLowerCase();
    return descriptor.includes('mosque') || descriptor.includes('masjid') || descriptor.includes('religious_facility') || descriptor.includes('mosque_fm');
};

const calculatePropertyAnnualValue = (property: PropertyData, selectedAddOns: string[]): QuoteOutput => {
    const mosqueProfile = property.mosqueProfile || {};
    const isMosque = isMosqueAsset(property);
    let assetClassId = 'apt-std';
    if (isMosque) assetClassId = 'mosque_fm';
    else if (property.propertyType === 'Villa') assetClassId = property.assetGrade === 'Luxury' || property.assetGrade === 'Ultra-Luxury' ? 'villa-lux' : 'villa-std';
    else if (property.propertyType === 'Building' || property.propertyType === 'Residential Building') assetClassId = 'com-twr';
    else if (property.propertyType === 'Commercial' || property.propertyType === 'Commercial Building') assetClassId = 'off-sml';
    else if (property.propertyType === 'Government Majlis' || property.propertyType?.toLowerCase() === 'majlis' || property.majlis) assetClassId = 'government_majlis';
    else if (property.propertyType === 'Hotel') assetClassId = 'mid_scale_hotel';

    const emirateMap: Record<string, string> = {
        Dubai: 'dubai',
        'Abu Dhabi': 'abuDhabi',
        Sharjah: 'sharjah',
        Ajman: 'ajman',
        RAK: 'rasAlKhaimah',
        'Ras Al Khaimah': 'rasAlKhaimah',
        Fujairah: 'fujairah',
        UAQ: 'ummAlQuwain',
        'Umm Al Quwain': 'ummAlQuwain',
    };

    return calculateUaeQuote2026({
        assetClassId,
        emirate: emirateMap[property.emirate] || 'dubai',
        zone: property.zone || 'B',
        contractType: property.strategy === 'pm_only' || property.strategy === 'rent' ? 'PM_ONLY' : property.strategy === 'fm_only' || property.strategy === 'fm' ? 'FM_ONLY' : 'BOTH',
        sqft: isMosque ? Number(mosqueProfile.grossFloorAreaSqft) || property.sqft : property.sqft,
        units: isMosque ? Number(mosqueProfile.maxWorshipperCapacity) || property.rooms || property.units : property.units,
        annualRent: property.annualRent,
        propertyAge: isMosque ? Number(mosqueProfile.propertyAgeYears) || property.age : property.age,
        floors: property.floors,
        lifts: property.lifts,
        hasPool: property.pool,
        hasCentralHVAC: isMosque ? true : property.hvac,
        hasDistrictCooling: property.districtCooling,
        hasCivilDefenseSystem: property.fireAlarm || property.firePump,
        hasSiraCctv: isMosque ? Boolean(property.sira || mosqueProfile.cctvInstalled || Number(mosqueProfile.cctvCameraCount) > 0) : property.sira,
        hasGenerator: property.gen,
        hasBmu: property.bmu,
        addOns: selectedAddOns,
        slaTier: property.slaTier || (isMosque ? 'premium' : 'standard'),
        paymentPlan: property.paymentPlan || 'annual',
        hasWaterTank: property.tank,
        hvacCount: property.hvacCount,
        offices: property.offices,
        shops: property.shops,
    });
};

const defaultProperty: PropertyData = {
    id: '', emirate: 'Dubai', area: '', zone: 'B', propertyType: 'Residential', subType: 'Apartment',
    useType: 'Rental', ownerType: 'Private', floors: 1, units: 1, bedrooms: 1, bathrooms: 1,
    shops: 0, offices: 0, rooms: 0, sqft: 1200, age: 5, pool: false, lifts: 0, tank: false,
    bmu: false, sira: false, fireAlarm: false, firePump: false, escalators: false, centralLPG: false,
    wasteMan: false, gen: false, hvac: false, districtCooling: false, electrical: false, plumbing: false,
    drainage: false, pumps: false, emergencyLighting: false, accessControl: false, bms: false, iotSensors: false,
    gym: false, majlis: false, majlisType: 'none', missions: [], condition: 'Good', assetGrade: 'Premium',
    currentStatus: 'Active', address: '', strategy: 'fm', slaTier: 'standard', paymentPlan: 'annual',
};

const emptySummary = (): PortfolioSummary => ({
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
});

const emptyProofDocuments = (): OnboardingState['proofDocuments'] => ({
    propertyProof: null,
    emiratesId: null,
    passport: null,
    tradeLicense: null,
    tenancySupport: null,
    labels: {},
});

export const useOnboardingStore = create<OnboardingState>()(
    persist(
        (set, get) => ({
            step: 1,
            properties: [],
            portfolioSummary: emptySummary(),
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
            contractOtpVerificationId: null,
            kycUrls: {},
            ownerAccount: null,
            proofDocuments: emptyProofDocuments(),
            propertyData: { ...defaultProperty, id: 'prop-1' },
            setStep: (step) => set({ step }),
            nextStep: () => set((state) => ({ step: state.step + 1 })),
            prevStep: () => set((state) => ({ step: Math.max(1, state.step - 1) })),
            setIntakeId: (intakeId) => set({ intakeId }),
            addProperty: (data) => {
                const newProperty = { ...defaultProperty, ...data, id: data?.id || `prop-${get().properties.length + 1}` };
                set((state) => ({ properties: [...state.properties, newProperty] }));
                get().calculateSummary();
            },
            bulkAddProperties: (items) => {
                const currentCount = get().properties.length;
                const additions = items.map((item, index) => ({ ...defaultProperty, ...item, id: item.id || `prop-${currentCount + index + 1}` }));
                set((state) => ({ properties: [...state.properties, ...additions] }));
                get().calculateSummary();
            },
            removeProperty: (index) => {
                set((state) => ({ properties: state.properties.filter((_, itemIndex) => itemIndex !== index) }));
                get().calculateSummary();
            },
            updateProperty: (index, data) => {
                set((state) => {
                    const properties = [...state.properties];
                    if (properties[index]) properties[index] = { ...properties[index], ...data };
                    return { properties, propertyData: index === 0 ? { ...state.propertyData, ...data } : state.propertyData };
                });
                get().calculateSummary();
            },
            updateCompanyProfile: (data) => set((state) => ({ companyProfile: { ...state.companyProfile, ...data } })),
            updateSignupData: (data) => set((state) => ({ signupData: { ...state.signupData, ...data } })),
            updateKycUrls: (data) => set((state) => ({ kycUrls: { ...state.kycUrls, ...data } })),
            setContractSignature: (isContractSigned, signatureName) => set((state) => ({
                isContractSigned,
                signatureName,
                contractOtpVerificationId: state.signatureName === signatureName ? state.contractOtpVerificationId : null,
            })),
            setContractOtpVerificationId: (contractOtpVerificationId) => set({ contractOtpVerificationId }),
            setSelectedPlan: (selectedPlan) => set({ selectedPlan }),
            toggleAddOn: (id) => {
                set((state) => ({ selectedAddOns: state.selectedAddOns.includes(id) ? state.selectedAddOns.filter((item) => item !== id) : [...state.selectedAddOns, id] }));
                get().calculateSummary();
            },
            setContractId: (contractId) => set({ contractId }),
            setPaymentVerified: (paymentVerified) => set({ paymentVerified }),
            setPaymentRequested: (paymentRequested) => set({ paymentRequested }),
            setAccountCreated: (accountCreated) => set({ accountCreated }),
            setValuationResult: (valuationResult) => set({ valuationResult }),
            setPaymentManifest: (paymentManifest) => set({ paymentManifest }),
            setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
            setOwnerAccount: (ownerAccount) => set({ ownerAccount, accountCreated: Boolean(ownerAccount) }),
            updatePropertyData: (data) => {
                set((state) => ({ propertyData: { ...state.propertyData, ...data } }));
                get().calculateSummary();
            },
            setProofDocument: (key, file) => set((state) => ({
                proofDocuments: {
                    ...state.proofDocuments,
                    [key]: file,
                    labels: { ...state.proofDocuments.labels, [key]: file?.name || '' },
                },
            })),
            calculateSummary: () => {
                const properties = get().properties.length > 0 ? get().properties : [get().propertyData];
                const quoteResults: Record<string, QuoteOutput> = {};
                for (const property of properties) quoteResults[property.id] = calculatePropertyAnnualValue(property, get().selectedAddOns || []);
                let estimatedACV = Object.values(quoteResults).reduce((total, quote) => total + quote.annualTotal, 0);
                if (estimatedACV === 0) estimatedACV = Math.round(properties.reduce((total, property) => total + (property.annualRent || 0), 0) * 0.95);
                const summary: PortfolioSummary = {
                    totalProperties: get().properties.length > 0 ? properties.length : 1,
                    totalUnits: properties.reduce((total, property) => total + (property.units || 0), 0),
                    totalRentable: properties.filter((property) => property.useType === 'Rental' || property.useType === 'Mixed').length,
                    totalPersonal: properties.filter((property) => property.useType === 'Personal').length,
                    totalMajlis: properties.filter((property) => property.majlis).length,
                    totalSqFt: properties.reduce((total, property) => total + (property.sqft || 0), 0),
                    estimatedACV,
                    recommendedTier: 'Premium',
                    isMixedUsePortfolio: properties.some((property) => property.propertyType === 'Mixed-Use' || property.useType === 'Mixed'),
                    isSovereignPortfolio: properties.some((property) => property.majlisType === 'government' || property.assetGrade === 'Sovereign' || isMosqueAsset(property)),
                    quoteResults,
                };
                if (summary.totalUnits > 100 || summary.isSovereignPortfolio) summary.recommendedTier = 'Sovereign Institutional';
                else if (summary.totalUnits > 20) summary.recommendedTier = 'Institutional';
                set({ portfolioSummary: summary });
            },
            reset: () => set({
                step: 1,
                properties: [],
                portfolioSummary: emptySummary(),
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
                contractOtpVerificationId: null,
                kycUrls: {},
                ownerAccount: null,
                proofDocuments: emptyProofDocuments(),
                propertyData: { ...defaultProperty, id: 'prop-1' },
            }),
        }),
        {
            name: 'bin-group-onboarding-v3',
            // Version bump intentionally invalidates legacy browser blobs that
            // persisted passwords, KYC URLs, payment manifests and property data.
            version: 4,
            partialize: (state) => ({
                step: state.step,
                intakeId: state.intakeId,
            }),
        },
    ),
);
