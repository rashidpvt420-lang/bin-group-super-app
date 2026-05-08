import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { calculateUaeQuote2026, QuoteOutput } from '@bin/shared';

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

export const ADD_ON_PRICING: Record<string, { label: string; base: number; perUnit?: number; perFloor?: number }> = {
    fire_safety: { label: 'Fire Safety System Maintenance', base: 2500, perFloor: 150 },
    water_tank: { label: 'Water Tank Cleaning', base: 1200 },
    elevator_amc: { label: 'Elevator Maintenance', base: 3200, perUnit: 650 },
    pool_care: { label: 'Swimming Pool Maintenance', base: 6000 },
    facade_access: { label: 'Facade/BMU Access', base: 4500, perFloor: 75 },
    'façade_access': { label: 'Facade/BMU Access', base: 4500, perFloor: 75 },
    dist_cooling: { label: 'District Cooling Optimization', base: 3500 },
    sira_renewal: { label: 'CCTV/SIRA Maintenance', base: 1800, perUnit: 35 },
    grease_trap: { label: 'Grease Trap Service', base: 900 },
    pca_audit: { label: 'PCA Asset Audit', base: 5000 },
    majlis_deep_care: { label: 'Majlis Deep Care', base: 8400 },
    majlis_landscaping: { label: 'Landscaping', base: 6000 },
    majlis_exterior_wash: { label: 'Exterior Wash', base: 2800 },
    majlis_standby: { label: 'Event Standby', base: 2500 },
    security: { label: 'Security', base: 12000, perUnit: 450 },
    cleaning: { label: 'Cleaning', base: 9000, perUnit: 300 },
    manpower: { label: 'Manpower', base: 15000, perUnit: 250 },
    concierge: { label: 'Concierge', base: 18000, perUnit: 350 },
    landscaping: { label: 'Landscaping', base: 6000 },
    pest_control: { label: 'Pest Control', base: 1500, perUnit: 50 },
    generator: { label: 'Generator Maintenance', base: 3500 },
    cctv: { label: 'CCTV', base: 1800, perUnit: 35 },
    office_units: { label: 'Office Units Support', base: 2500, perUnit: 225 },
    retail_shops: { label: 'Retail Shops Support', base: 3000, perUnit: 275 },
    parking_management: { label: 'Parking Management', base: 6000, perUnit: 35 },
    waste_management: { label: 'Waste Management', base: 3500, perUnit: 75 },
    mep_support: { label: 'MEP Support', base: 8500, perFloor: 300 },
    hvac_pm: { label: 'HVAC Preventive Maintenance', base: 4500, perUnit: 120 }
};

const resolveMandatoryAddOns = (property: PropertyData): string[] => {
    const ids = new Set<string>();
    ids.add('fire_safety');
    if (property.tank) ids.add('water_tank');
    if ((property.floors || 0) > 2 || (property.lifts || 0) > 0) ids.add('elevator_amc');
    if (property.sira) ids.add('sira_renewal');
    if (property.bmu) ids.add('facade_access');
    if ((property.age || 0) > 15) ids.add('pca_audit');
    if (property.pool) ids.add('pool_care');
    if (property.hvac || (property.hvacCount || 0) > 0) ids.add('hvac_pm');
    return Array.from(ids);
};

const calculateAddOnAnnualValue = (property: PropertyData, selectedAddOns: string[]): number => {
    const ids = new Set([...selectedAddOns, ...resolveMandatoryAddOns(property)]);
    let total = 0;
    ids.forEach((id) => {
        const item = ADD_ON_PRICING[id];
        if (!item) return;
        total += item.base;
        if (item.perUnit) total += item.perUnit * Math.max(property.units || 0, property.offices || 0, property.shops || 0, 1);
        if (item.perFloor) total += item.perFloor * Math.max(property.floors || 0, 1);
    });
    return Math.round(total);
};

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
        contractType: property.strategy === 'rent' ? 'PM' : (property.strategy === 'fm' ? 'IFM' : 'AMC'),
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
        paymentPlan: property.paymentPlan || 'annual'
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
