import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PropertyData {
    id: string;
    emirate: string;
    area: string;
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
    majlisType: 'government' | 'none'; // Restricted to Government only per final business rules
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
    address: string;
    ownerEmail?: string;
    exposure?: string;
    strategy?: 'sale' | 'rent' | 'fm';
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
    paymentManifest: any | null;
    paymentMethod: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | null;
    companyProfile: {
        name: string;
        licenseNumber: string;
        contactPerson: string;
        phone: string;
        email: string;
    };
    propertyData: PropertyData; // Backward compatibility for single-asset logic
    updatePropertyData: (data: Partial<PropertyData>) => void;

    // Actions
    setStep: (step: number) => void;
    nextStep: () => void;
    prevStep: () => void;
    setIntakeId: (id: string) => void;
    addProperty: (data?: Partial<PropertyData>) => void;
    removeProperty: (index: number) => void;
    updateProperty: (index: number, data: Partial<PropertyData>) => void;
    bulkAddProperties: (properties: PropertyData[]) => void;
    updateCompanyProfile: (data: Partial<OnboardingState['companyProfile']>) => void;
    setSelectedPlan: (plan: any) => void;
    toggleAddOn: (id: string) => void;
    setContractId: (id: string) => void;
    setPaymentVerified: (status: boolean) => void;
    setPaymentRequested: (status: boolean) => void;
    setAccountCreated: (status: boolean) => void;
    setValuationResult: (result: any) => void;
    setPaymentManifest: (manifest: any) => void;
    setPaymentMethod: (method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | null) => void;
    calculateSummary: () => void;
    reset: () => void;
}

const defaultProperty: PropertyData = {
    id: '',
    emirate: 'Dubai',
    area: '',
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
    majlisSubtype: '',
    majlisGarden: false,
    heritageSensitivity: 'Standard',
    guestCapacity: 0,
    parkingCapacity: 0,
    hospitalityReadiness: false,
    irrigationSystem: false,
    solarIntegration: false,
    evReadiness: false,
    securityLevel: 'Standard',
    protocolLevel: 'Standard',
    publicGathering: false,
    governmentUse: false,
    eventUse: false,
    missions: [],
    condition: 'Good',
    assetGrade: 'Premium',
    currentStatus: 'Active',
    address: '',
    exposure: 'Community',
    strategy: 'fm',
};

export const useOnboardingStore = create<OnboardingState>()(
    persist(
        (set, get) => ({
            step: 1,
            properties: [{ ...defaultProperty, id: 'prop-1' }],
            portfolioSummary: {
                totalProperties: 1,
                totalUnits: 1,
                totalRentable: 1,
                totalPersonal: 0,
                totalMajlis: 0,
                totalSqFt: 1200,
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
            paymentManifest: null,
            paymentMethod: null,
            companyProfile: {
                name: '',
                licenseNumber: '',
                contactPerson: '',
                phone: '',
                email: '',
            },
            propertyData: { ...defaultProperty, id: 'prop-1' },

            setStep: (step) => set({ step }),
            nextStep: () => set((state) => ({ step: state.step + 1 })),
            prevStep: () => set((state) => ({ step: state.step - 1 })),
            setIntakeId: (id) => set({ intakeId: id }),
            
            addProperty: (data) => {
                const newProperty = { 
                    ...defaultProperty, 
                    ...data, 
                    id: `prop-${get().properties.length + 1}` 
                };
                set((state) => ({
                    properties: [...state.properties, newProperty]
                }));
                get().calculateSummary();
            },

            removeProperty: (index) => {
                set((state) => ({
                    properties: state.properties.filter((_, i) => i !== index)
                }));
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

            bulkAddProperties: (newProps) => {
                set({ properties: newProps });
                get().calculateSummary();
            },

            updateCompanyProfile: (data) => set((state) => ({
                companyProfile: { ...state.companyProfile, ...data }
            })),
            
            updatePropertyData: (data) => {
                set((state) => ({
                    propertyData: { ...state.propertyData, ...data },
                    properties: state.properties.map((p, i) => i === 0 ? { ...p, ...data } : p)
                }));
                get().calculateSummary();
            },

            setSelectedPlan: (selectedPlan) => set({ selectedPlan }),
            toggleAddOn: (id) => set((state) => ({
                selectedAddOns: state.selectedAddOns.includes(id)
                    ? state.selectedAddOns.filter(a => a !== id)
                    : [...state.selectedAddOns, id]
            })),
            setContractId: (contractId) => set({ contractId }),
            setPaymentVerified: (paymentVerified) => set({ paymentVerified }),
            setPaymentRequested: (paymentRequested) => set({ paymentRequested }),
            setAccountCreated: (accountCreated) => set({ accountCreated }),
            setValuationResult: (valuationResult) => set({ valuationResult }),
            setPaymentManifest: (paymentManifest) => set({ paymentManifest }),
            setPaymentMethod: (paymentMethod) => set({ paymentMethod }),

            calculateSummary: () => {
                const props = get().properties;
                const summary: PortfolioSummary = {
                    totalProperties: props.length,
                    totalUnits: props.reduce((acc, p) => acc + (p.units || 1), 0),
                    totalRentable: props.filter(p => p.useType === 'Rental' || p.useType === 'Mixed').length,
                    totalPersonal: props.filter(p => p.useType === 'Personal').length,
                    totalMajlis: props.filter(p => p.majlis).length,
                    totalSqFt: props.reduce((acc, p) => acc + (p.sqft || 0), 0),
                    estimatedACV: 0, // Calculated in pricing engine later
                    recommendedTier: 'Premium',
                    isMixedUsePortfolio: props.some(p => p.propertyType === 'Mixed-Use' || p.useType === 'Mixed'),
                    isSovereignPortfolio: props.some(p => p.majlisType === 'government' || p.assetGrade === 'Sovereign' || p.propertyType === 'GOVERNMENT_MAJLIS' || p.propertyType === 'GOVERNMENT_PROPERTY'),
                };

                // Logic for tier recommendation
                if (summary.totalUnits > 100 || summary.isSovereignPortfolio) {
                    summary.recommendedTier = 'Sovereign Institutional';
                } else if (summary.totalUnits > 20) {
                    summary.recommendedTier = 'Institutional';
                } else {
                    summary.recommendedTier = 'Premium';
                }

                set({ portfolioSummary: summary });
            },

            reset: () => set({
                step: 1,
                properties: [{ ...defaultProperty, id: 'prop-1' }],
                selectedPlan: null,
                selectedAddOns: [],
                contractId: null,
                paymentVerified: false,
                paymentRequested: false,
                accountCreated: false,
                valuationResult: null,
                paymentManifest: null,
                paymentMethod: null,
                companyProfile: {
                    name: '',
                    licenseNumber: '',
                    contactPerson: '',
                    phone: '',
                    email: '',
                }
            })
        }),
        { name: 'bin-group-onboarding-v2' }
    )
);
