export interface RangeValue {
    min: number;
    max: number;
    target?: number;
}

export interface AssetClassBenchmark {
    id: string;
    category: string;
    label: string;
    minimumAnnualContract: number;
    pmRate: string;
    ifm: string;
    pricingUnit: string;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
    // Internal ranges for the pricing engine
    maintenanceRange: RangeValue;
    managementRange: RangeValue;
    combinedRange: RangeValue;
}

export interface EmirateMultiplier {
    label: string;
    value: string;
    isPremium: boolean;
}

export const BIN_CONTRACT_TYPES = {
    FM_ONLY: 'Maintenance Only (IFM)',
    PM_ONLY: 'Property Management Only (Leasing/Financials)',
    BOTH: 'Total Care Hybrid (FM + PM)'
};

export interface MajlisPackage {
    id: string;
    label: string;
    basePrice: number;
    features: string[];
}

export const MAJLIS_MAINTENANCE_PACKAGES: MajlisPackage[] = [
    {
        id: 'majlis-basic',
        label: 'Majlis Basic Maintenance',
        basePrice: 12000,
        features: ['AC Maintenance', 'Electrical', 'Plumbing', 'Civil / Handyman']
    },
    {
        id: 'majlis-premium',
        label: 'Majlis Premium Maintenance',
        basePrice: 25000,
        features: ['AC Maintenance', 'Electrical', 'Plumbing', 'Civil / Handyman', 'Cleaning Add-on', 'Pre-event Inspection']
    },
    {
        id: 'majlis-elite',
        label: 'Majlis Elite / Standby Maintenance',
        basePrice: 45000,
        features: [
            'AC Maintenance', 'Electrical', 'Plumbing', 'Civil / Handyman', 
            'Cleaning Team', 'Event Standby Technician', 'Emergency Response (30 min)',
            'Pre/Post-event Inspection', 'VIP Support'
        ]
    }
];

export const SERVICE_ADDONS = [
    { id: 'tech_standby', label: 'Technician Standby', price: 1500, unit: 'per event' },
    { id: 'cleaning_team', label: 'Cleaning Team', price: 800, unit: 'per visit' },
    { id: 'security', label: 'Security', price: 2000, unit: 'per month' },
    { id: 'event_support', label: 'Event Support', price: 3000, unit: 'per event' },
    { id: 'deep_cleaning', label: 'Deep Cleaning', price: 1200, unit: 'per service' },
    { id: 'pest_control', label: 'Pest Control', price: 600, unit: 'per quarter' },
    { id: 'landscaping', label: 'Landscaping', price: 1500, unit: 'per month' },
    { id: 'cctv_security', label: 'CCTV/Security Systems', price: 5000, unit: 'one-time' },
    { id: 'fire_safety', label: 'Fire Safety', price: 2500, unit: 'annual' },
    { id: 'emergency_priority', label: 'Emergency Priority', price: 1000, unit: 'annual' },
    { id: 'fitout_quote', label: 'Fit-out Quotation', price: 0, unit: 'free' },
    { id: 'inspection_move', label: 'Move-in/Move-out Inspection', price: 500, unit: 'per unit' }
];

export interface PricingMatrix {
    version: string;
    lastUpdated: string;
    zones: Record<string, {
        label: string;
        description: string;
        multiplier: number;
    }>;
    emirateMultipliers: EmirateMultiplier[];
    assetClasses: AssetClassBenchmark[];
}

export const UAE_PRICING_MATRIX_2026: PricingMatrix = {
    version: "3.1.0",
    lastUpdated: "2026-05-08",
    zones: {
        A: { 
            label: "Premium", 
            description: "Luxury, waterfront (Marina, Palm), branded residences, high-SLA assets", 
            multiplier: 1.30 
        },
        B: { 
            label: "Standard", 
            description: "Mid-market, high-density, mixed-use corridors (JVC, Business Bay)", 
            multiplier: 1.00 
        },
        C: { 
            label: "Budget/Industrial", 
            description: "Industrial zones, labor accommodation, logistics hubs", 
            multiplier: 0.75 
        }
    },
    emirateMultipliers: [
        { label: "Dubai", value: "1.15x", isPremium: true },
        { label: "Abu Dhabi", value: "1.10x", isPremium: true },
        { label: "Sharjah", value: "0.90x", isPremium: false },
        { label: "RAK / Ajman / Fujairah", value: "0.80 - 0.88x", isPremium: false }
    ],
    assetClasses: [
        { 
            id: "apt-std", category: "Residential", label: "Standard Apartment", 
            minimumAnnualContract: 1500, pmRate: "5%", ifm: "7,500 / yr", 
            pricingUnit: "unit", riskLevel: "Low",
            maintenanceRange: { min: 1200, max: 1800, target: 1500 },
            managementRange: { min: 5, max: 8, target: 5 },
            combinedRange: { min: 6500, max: 8500, target: 7500 }
        },
        { 
            id: "apt-lux", category: "Residential", label: "Luxury Apartment", 
            minimumAnnualContract: 6500, pmRate: "7%", ifm: "15,000 / yr", 
            pricingUnit: "unit", riskLevel: "Medium",
            maintenanceRange: { min: 4500, max: 8500, target: 6500 },
            managementRange: { min: 7, max: 10, target: 7 },
            combinedRange: { min: 12000, max: 18000, target: 15000 }
        },
        { 
            id: "villa-std", category: "Residential", label: "Standard Villa", 
            minimumAnnualContract: 6000, pmRate: "5%", ifm: "12,000 / yr", 
            pricingUnit: "unit", riskLevel: "Medium",
            maintenanceRange: { min: 5000, max: 7000, target: 6000 },
            managementRange: { min: 5, max: 8, target: 5 },
            combinedRange: { min: 10000, max: 14000, target: 12000 }
        },
        { 
            id: "villa-lux", category: "Residential", label: "Luxury Estate Villa", 
            minimumAnnualContract: 15000, pmRate: "8%", ifm: "35,000 / yr", 
            pricingUnit: "unit", riskLevel: "High",
            maintenanceRange: { min: 12000, max: 25000, target: 15000 },
            managementRange: { min: 8, max: 12, target: 8 },
            combinedRange: { min: 30000, max: 50000, target: 35000 }
        },
        { 
            id: "apt-sht", category: "Residential", label: "Short Term Apt", 
            minimumAnnualContract: 2500, pmRate: "15%", ifm: "12,000 / yr", 
            pricingUnit: "unit", riskLevel: "High",
            maintenanceRange: { min: 2000, max: 3500, target: 2500 },
            managementRange: { min: 15, max: 20, target: 15 },
            combinedRange: { min: 10000, max: 15000, target: 12000 }
        },
        { 
            id: "off-sml", category: "Commercial", label: "Small Office", 
            minimumAnnualContract: 3500, pmRate: "12 / sqft", ifm: "18 / sqft", 
            pricingUnit: "sqft", riskLevel: "Low",
            maintenanceRange: { min: 8, max: 15, target: 12 },
            managementRange: { min: 4, max: 6, target: 5 },
            combinedRange: { min: 15, max: 22, target: 18 }
        },
        { 
            id: "com-twr", category: "Commercial", label: "Commercial Tower", 
            minimumAnnualContract: 50000, pmRate: "15 / sqft", ifm: "25 / sqft", 
            pricingUnit: "sqft", riskLevel: "High",
            maintenanceRange: { min: 12, max: 20, target: 15 },
            managementRange: { min: 3, max: 5, target: 4 },
            combinedRange: { min: 20, max: 35, target: 25 }
        },
        { 
            id: "rtl-mall", category: "Commercial", label: "Retail Mall", 
            minimumAnnualContract: 150000, pmRate: "35 / sqft", ifm: "55 / sqft", 
            pricingUnit: "sqft", riskLevel: "Critical",
            maintenanceRange: { min: 30, max: 50, target: 35 },
            managementRange: { min: 5, max: 8, target: 6 },
            combinedRange: { min: 50, max: 80, target: 55 }
        },
        { 
            id: "lab-camp", category: "Industrial", label: "Labor Camp", 
            minimumAnnualContract: 20000, pmRate: "80 / bed / mo", ifm: "-", 
            pricingUnit: "bed", riskLevel: "Medium",
            maintenanceRange: { min: 60, max: 100, target: 80 },
            managementRange: { min: 5, max: 10, target: 7 },
            combinedRange: { min: 100, max: 150, target: 120 }
        },
        { 
            id: "hosp", category: "Specialized", label: "Hospital / Clinic", 
            minimumAnnualContract: 75000, pmRate: "85 / sqft", ifm: "-", 
            pricingUnit: "sqft", riskLevel: "High",
            maintenanceRange: { min: 70, max: 120, target: 85 },
            managementRange: { min: 4, max: 8, target: 6 },
            combinedRange: { min: 100, max: 180, target: 140 }
        },
        { 
            id: "data-ctr", category: "Specialized", label: "Data Center", 
            minimumAnnualContract: 250000, pmRate: "60 / sqft", ifm: "-", 
            pricingUnit: "sqft", riskLevel: "Critical",
            maintenanceRange: { min: 50, max: 100, target: 60 },
            managementRange: { min: 10, max: 20, target: 15 },
            combinedRange: { min: 150, max: 300, target: 200 }
        },
        { 
            id: "mix-dev", category: "Specialized", label: "Mixed-Use Dev", 
            minimumAnnualContract: 100000, pmRate: "Variable", ifm: "-", 
            pricingUnit: "sqft", riskLevel: "Medium",
            maintenanceRange: { min: 15, max: 30, target: 20 },
            managementRange: { min: 4, max: 7, target: 5 },
            combinedRange: { min: 25, max: 50, target: 35 }
        },
        {
            id: "government_majlis", category: "Government", label: "Government Majlis",
            minimumAnnualContract: 25000, pmRate: "N/A", ifm: "35,000 / yr",
            pricingUnit: "unit", riskLevel: "High",
            maintenanceRange: { min: 25000, max: 60000, target: 35000 },
            managementRange: { min: 0, max: 0, target: 0 },
            combinedRange: { min: 25000, max: 60000, target: 35000 }
        },
        {
            id: "private_majlis", category: "Residential", label: "Private Majlis",
            minimumAnnualContract: 12000, pmRate: "N/A", ifm: "12,000 / yr",
            pricingUnit: "unit", riskLevel: "Medium",
            maintenanceRange: { min: 12000, max: 35000, target: 18000 },
            managementRange: { min: 0, max: 0, target: 0 },
            combinedRange: { min: 12000, max: 35000, target: 18000 }
        },
        {
            id: "mid_scale_hotel", category: "Hospitality", label: "Mid-Scale Hotel",
            minimumAnnualContract: 150000, pmRate: "12%", ifm: "250,000 / yr",
            pricingUnit: "unit", riskLevel: "High",
            maintenanceRange: { min: 100000, max:200000, target: 150000 },
            managementRange: { min: 10, max: 15, target: 12 },
            combinedRange: { min: 200000, max: 350000, target: 250000 }
        }
    ]
};

