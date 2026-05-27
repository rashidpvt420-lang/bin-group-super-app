import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { calculateUaeQuote2026, QuoteOutput, ADD_ON_PRICING } from '@bin/shared';

const createOnboardingSessionId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `onb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export interface PropertyData {
    id: string;
    emirate: string;
    area: string;
    zone: 'A' | 'B' | 'C';
    propertyType: string;
    subType: string;
    useType: 'Rental' | 'Personal' | 'Mixed' | 'Government';
    ownerType: 'Private' | 'Government';
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
    // Systems
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
    // Institutional / Majlis Specific
    majlis: boolean;
    majlisType: 'government' | 'none';
    majlisSubtype?: string;
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
    // Hotel Specific
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
    // Compliance missions
    missions: string[];
    // Status
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
        lat: number;
        lng: number;
    };
    ownerEmail?: string;
    exposure?: string;
    strategy?: 'sale' | 'rent' | 'fm';
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
    paymentMethod: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | null;
    companyProfile: {
        name: string;
        licenseNumber: string;
        contactPerson: string;
        phone: string;
        email: string;
    };
    signupData: {
        name: string;
        email: string;
        phone: string;
        password?: string;
    };
    kycUrls: {
        emiratesId?: string;
        passport?: string;
        titleDeed?: string;
        tradeLicense?: string;
    };
    ownerAccount: {
        uid: string;
        fullName: string;
        email: string;
        mobile: string;
    } | null;
    proofDocuments: {
        propertyProof: File | null;
        emiratesId: File | null;
        passport: File | null;
        tradeLicense: File | null;
        tenancySupport: File | null;
        labels: Record<string, string>;
    };
    propertyData: PropertyData; // Backward compatibility
    
    // Actions
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
    setSelectedPlan: (plan: any) => void;
    toggleAddOn: (id: string) => void;
    setContractId: (id: string) => void;
    setPaymentVerified: (status: boolean) => void;
    setPaymentRequested: (status: boolean) => void;
    setAccountCreated: (status: boolean) => void;
    setValuationResult: (result: any) => void;
    setPaymentManifest: (manifest: any) => void;
    setPaymentMethod: (method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | null) => void;
    setOwnerAccount: (account: OnboardingState['ownerAccount']) => void;
    setProofDocument: (key: keyof Omit<OnboardingState['proofDocuments'], 'labels'>, file: File | null) => void;
    updatePropertyData: (data: Partial<PropertyData>) => void;
    calculateSummary: () => void;
    reset: () => void;
}

const calculatePropertyAnnualValue = (property: PropertyData, selectedAddOns: string[]): QuoteOutput => {
    // Map internal types to Pricing Matrix types
    let assetClassId = 'standard_apartment';
    if (property.propertyType === 'Villa') assetClassId = property.assetGrade === 'Luxury' || property.assetGrade === 'Ultra-Luxury' ? 'luxury_estate_villa' : 'standard_villa';
    else if (property.propertyType === 'Building') assetClassId = 'commercial_tower';
    else if (property.propertyType === 'Commercial') assetClassId = 'small_office';
    else if (property.propertyType === 'Government Majlis') assetClassId = 'government_majlis';
    else if (property.propertyType === 'Hotel') assetClassId = 'mid_scale_hotel';
    
    // Map emirate to camelCase
    const emirateMap: Record<string, string> = {
        'Dubai': 'dubai',
        'Abu Dhabi': 'abuDhabi',
        'Sharjah': 'sharjah',
        'Ajman': 'ajman',
        'RAK': 'rasAlKhaimah',
        'Ras Al Khaimah': 'rasAlKhaimah',
        'Fujairah': 'fujairah',
        'UAQ': 'ummAlQuwain',
        'Umm Al Quwain': 'ummAlQuwain'
    };

    const quote = calculateUaeQuote2026({
        assetClassId,
        emirate: emirateMap[property.emirate] || 'dubai',
        zone: property.zone || 'B',
        contractType: property.strategy === 'rent' ? 'PM_ONLY' : (property.strategy === 'fm' ? 'FM_ONLY' : 'BOTH'),
        sqft: property.sqft,
        units: property.units,
        annualRent: property.annualRent,
        propertyAge: property.age,
        floors: property.floors,
        lifts: property.lifts,
        hasPool: property.pool,
        hasCentralHVAC: property.hvac,
        hasDistrictCooling: property.districtCooling,
        hasCivilDefenseSystem: property.fireAlarm || property.firePump,
        hasSiraCctv: property.sira,
        hasGenerator: property.gen,
        hasBmu: property.bmu,
        addOns: selectedAddOns,
        slaTier: property.slaTier || 'standard',
        paymentPlan: property.paymentPlan || 'annual',
        hasWaterTank: property.tank,
        hvacCount: property.hvacCount,
        offices: property.offices,
        shops: property.shops
    });

    return quote;
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
                const newProperties = items.map((item, index) => ({
                    ...defaultProperty,
                    ...item,
                    id: item.id || `prop-${currentCount + index + 1}`
                }));
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
                    newProperties[index] = { ...newProperties[index], ...data };
                    return { properties: newProperties };
                });
                get().calculateSummary();
            },

            updateCompanyProfile: (data) => set((state) => ({
                companyProfile: { ...state.companyProfile, ...data }
            })),
            
            updateSignupData: (data) => set((state) => ({
                signupData: { ...state.signupData, ...data }
            })),

            updateKycUrls: (data) => set((state) => ({
                kycUrls: { ...state.kycUrls, ...data }
            })),

            setSelectedPlan: (selectedPlan) => set({ selectedPlan }),
            toggleAddOn: (id) => {
                set((state) => ({
                    selectedAddOns: state.selectedAddOns.includes(id)
                        ? state.selectedAddOns.filter(a => a !== id)
                        : [...state.selectedAddOns, id]
                }));
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
            updatePropertyData: (data) => set((state) => ({
                propertyData: { ...state.propertyData, ...data }
            })),
            setProofDocument: (key, file) => set((state) => ({
                proofDocuments: {
                    ...state.proofDocuments,
                    [key]: file,
                    labels: {
                        ...state.proofDocuments.labels,
                        [key]: file?.name || ''
                    }
                }
            })),

            calculateSummary: () => {
                const props = get().properties;
                const selectedAddOns = get().selectedAddOns || [];
                const quoteResults: Record<string, QuoteOutput> = {};
                
                props.forEach(p => {
                    quoteResults[p.id] = calculatePropertyAnnualValue(p, selectedAddOns);
                });

                const summary: PortfolioSummary = {
                    totalProperties: props.length,
                    totalUnits: props.reduce((acc, p) => acc + (p.units || 0), 0),
                    totalRentable: props.filter(p => p.useType === 'Rental' || p.useType === 'Mixed').length,
                    totalPersonal: props.filter(p => p.useType === 'Personal').length,
                    totalMajlis: props.filter(p => p.majlis).length,
                    totalSqFt: props.reduce((acc, p) => acc + (p.sqft || 0), 0),
                    estimatedACV: Object.values(quoteResults).reduce((acc, q) => acc + q.annualTotal, 0),
                    recommendedTier: 'Premium',
                    isMixedUsePortfolio: props.some(p => p.propertyType === 'Mixed-Use' || p.useType === 'Mixed'),
                    isSovereignPortfolio: props.some(p => p.majlisType === 'government' || p.assetGrade === 'Sovereign'),
                    quoteResults
                };
                if (summary.totalUnits > 100 || summary.isSovereignPortfolio) summary.recommendedTier = 'Sovereign Institutional';
                else if (summary.totalUnits > 20) summary.recommendedTier = 'Institutional';
                set({ portfolioSummary: summary });
            },

            reset: () => set({
                step: 1, properties: [], selectedPlan: null, selectedAddOns: [], contractId: null,
                intakeId: null, onboardingSessionId: createOnboardingSessionId(),
                paymentVerified: false, paymentRequested: false, accountCreated: false,
                valuationResult: null, paymentManifest: null, paymentMethod: null,
                companyProfile: { name: '', licenseNumber: '', contactPerson: '', phone: '', email: '' },
                signupData: { name: '', email: '', phone: '' }, kycUrls: {},
                ownerAccount: null,
                proofDocuments: {
                    propertyProof: null,
                    emiratesId: null,
                    passport: null,
                    tradeLicense: null,
                    tenancySupport: null,
                    labels: {}
                }
            })
        }),
        {
            name: 'bin-group-onboarding-v3',
            partialize: (state) => ({
                ...state,
                proofDocuments: {
                    propertyProof: null,
                    emiratesId: null,
                    passport: null,
                    tradeLicense: null,
                    tenancySupport: null,
                    labels: state.proofDocuments.labels
                }
            })
        }
    )
);
