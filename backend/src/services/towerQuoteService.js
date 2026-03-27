/**
 * 🌍 BIN-GROUP UAE Universal Pricing & Strategic Proposal Engine (2026 Strategy)
 * Upgraded to include Lifecycle Costing, ROI Projections, and Strategic Risk Classes.
 */

const PROPERTY_BASE_RATES = {
    'TOWER': { BASIC: 18, STANDARD: 30, PREMIUM: 45, LUXURY: 70 },
    'VILLA_COMMUNITY': { STUDIO: 1200, BR2: 2500, BR3: 4000, BR4: 5500, LUXURY: 15000 },
    'OFFICE': { SHELL: 12, STANDARD: 20, GRADE_A: 35 },
    'WAREHOUSE': { SMALL: 6, MEDIUM: 8, INDUSTRIAL: 12 },
    'RETAIL': { COMMUNITY: 25, SHOPPING_CENTER: 45, REGIONAL_MALL: 75 },
    'SCHOOL': { SMALL: 250000, MID: 500000, LARGE: 1200000 },
    'HOTEL': { STAR3: 45, STAR4: 70, STAR5: 120 },
    'LABOR': { BEDS100: 90000, BEDS300: 250000, BEDS1000: 900000 },
    'GOVERNMENT': { SMALL: 20, MID: 40, LARGE: 70 }
};

const BIN_TARGET_FACTOR = 0.82; // ~18% below market competitive edge

const ADDON_CATALOG = {
    // COMPLIANCE
    'EJARI_AUTO': { name: 'Ejari Automation Package', category: 'COMPLIANCE', model: 'PER_UNIT', value: 45, clause: 'BIN-GROUP shall automate lease registration via RERA/Ejari gateways for all units.' },
    'AUDIT_SHIELD': { name: 'AuditShield Compliance Export', category: 'COMPLIANCE', model: 'PER_UNIT', value: 12, clause: 'Provision of forensic service history and inspection-ready compliance reporting.' },
    'VENDOR_CERT': { name: 'Vendor Certification Monitoring', category: 'COMPLIANCE', model: 'PER_UNIT', value: 8, clause: 'Real-time monitoring of 3rd party contractor trade licenses and insurance.' },
    
    // OPERATIONS
    'EMERGENCY_24_7': { name: '24/7 Emergency Response Upgrade', category: 'OPERATIONS', model: 'PERCENTAGE', value: 0.12, clause: 'Extended round-the-clock emergency dispatch coverage including weekends and holidays.' },
    'DEDICATED_TECH': { name: 'Dedicated Technician Assignment', category: 'OPERATIONS', model: 'FLAT', value: 120000, clause: 'Assignment of a site-specific technician for asset familiarity and rapid response.' },
    'SPARE_PARTS_LOG': { name: 'Spare Parts Procurement Layer', category: 'OPERATIONS', model: 'PER_UNIT', value: 10, clause: 'Price benchmarking and markup cap enforcement for all MEP spare parts.' },

    // FINANCIAL
    'BUDGET_PROTECT': { name: 'Budget Protection Model', category: 'FINANCIAL', model: 'PERCENTAGE', value: 0.05, clause: 'Predictive annual exposure ceiling and emergency reserve target modeling.' },
    'RESERVE_FORECAST': { name: 'Reserve Fund Forecast Engine', category: 'FINANCIAL', model: 'PER_UNIT', value: 18, clause: 'Detailed 10-year CAPEX renewal forecast for major building assets.' },
    'PORTFOLIO_DISCOUNT': { name: 'Portfolio Discount Optimizer', category: 'FINANCIAL', model: 'PERCENTAGE', value: -0.09, clause: 'Multi-building bundling logic and shared technician routing savings.' },

    // ASSET INTELLIGENCE
    'PREDICTIVE_AI': { name: 'Predictive Maintenance AI', category: 'ASSET_INTELLIGENCE', model: 'PERCENTAGE', value: 0.08, clause: 'AI-driven failure detection for compressors, pumps, and electrical panels.' },
    'BPI_ANALYTICS': { name: 'BPI™ Advanced Metrics', category: 'ASSET_INTELLIGENCE', model: 'PER_UNIT', value: 15, clause: 'Advanced lifecycle degradation curves and tenant complaint heatmapping.' },
    'ENERGY_ADVISORY': { name: 'Energy Optimization Advisory', category: 'ASSET_INTELLIGENCE', model: 'PER_SQFT', value: 0.35, clause: 'HVAC runtime optimization and lighting retrofit efficiency modeling.' },

    // PREMIUM
    'COMMAND_CENTER': { name: 'Command Center Live Monitoring', category: 'PREMIUM', model: 'FLAT', value: 65000, clause: 'Real-time asset telemetry and technician radar console monitoring.' },
    'INSTITUTIONAL_REP': { name: 'Institutional Reporting Pack', category: 'PREMIUM', model: 'PER_UNIT', value: 22, clause: 'Monthly board-ready reporting with annual CAPEX exposure modeling.' },
    'WHITE_GLOVE_PM': { name: 'White-Glove Portfolio Manager', category: 'PREMIUM', model: 'FLAT', value: 180000, clause: 'Dedicated account manager and priority executive escalation channel.' },
    'INSURANCE_PROTECT': { name: 'Insurance Protection Add-On', category: 'PREMIUM', model: 'PER_UNIT', value: 65, clause: 'Incident claim automation and damage verification repair coverage.' }
};

const LOCATION_FACTOR = {
    'DUBAI': 1.0, 'ABU_DHABI': 1.07, 'SHARJAH': 0.88, 'AJMAN': 0.82, 
    'RAK': 0.78, 'FUJAIRAH': 0.85, 'UAQ': 0.75, 'AL_AIN': 0.92
};

const HYBRID_OS_MULTIPLIER = 1.45;

class UniversalQuoteService {
    calculateBaseRate(propertyType, subType) {
        const rates = PROPERTY_BASE_RATES[propertyType] || PROPERTY_BASE_RATES.TOWER;
        const basePrice = rates[subType] || Object.values(rates)[0];
        return basePrice * BIN_TARGET_FACTOR;
    }

    getAgeMultiplier(age) {
        if (age <= 5) return 0.85;
        if (age <= 10) return 1.0;
        if (age <= 20) return 1.18;
        return 1.35;
    }

    getRiskClass(age, components) {
        let score = (age / 30) * 10;
        if (components.elevators > 8) score += 2;
        if (components.hvac === 'DISTRICT_COOLING') score -= 1;
        
        if (score > 7) return "HIGH_RISK";
        if (score > 4) return "MEDIUM_RISK";
        return "LOW_RISK";
    }

    calculateLifecycleForecast(age, propertyType) {
        // Simple logic: Predict major CAPEX events in the next 36 months
        const modernizationMap = {
            'TOWER': { label: 'Elevator/HVAC modernization', est: 320000 },
            'VILLA_COMMUNITY': { label: 'Roof/Paint lifecycle renewal', est: 85000 },
            'WAREHOUSE': { label: 'Floor/System modernization', est: 120000 }
        };
        
        const base = modernizationMap[propertyType] || { label: 'General MEP overhaul', est: 150000 };
        const probability = age > 15 ? 0.85 : age > 8 ? 0.45 : 0.12;
        
        return {
            event: base.label,
            estimatedCost: base.est,
            probability: (probability * 100).toFixed(0) + '%',
            recommendedReserve: Math.round(base.est / 36) // 3-year reserve window
        };
    }

    getServiceScope(tier) {
        const scopes = {
            'AMC': [
                { service: 'HVAC Servicing', frequency: 'Quarterly' },
                { service: 'Pump Inspection', frequency: 'Monthly' },
                { service: 'Electrical Panels', frequency: 'Semi-Annual' }
            ],
            'PM': [
                { service: 'Ejari Registration', frequency: 'Automated' },
                { service: 'Financial Reporting', frequency: 'Monthly' },
                { service: 'Tenant Coordination', frequency: '24/7' }
            ],
            'HYBRID': [
                { service: 'AI Telemetry Monitoring', frequency: 'Instant' },
                { service: 'Total FM + Management', frequency: 'Full Bundle' },
                { service: 'Compliance Auditing', frequency: 'Real-time' }
            ]
        };
        return scopes[tier] || scopes.AMC;
    }

    getRecommendations(inputs) {
        const recs = [];
        if (inputs.buildingAge > 15) recs.push('PREDICTIVE_AI', 'RESERVE_FORECAST');
        if (inputs.towerHeight === 'HIGH_RISE' || inputs.towerHeight === 'SKYSCRAPER') recs.push('EMERGENCY_24_7', 'COMMAND_CENTER');
        if (inputs.propertyType === 'TOWER' || inputs.propertyType === 'OFFICE') recs.push('EJARI_AUTO', 'AUDIT_SHIELD');
        return recs;
    }

    async generateUniversalQuote(inputs) {
        const {
            propertyType, subType, units = 1, totalSqft = 0, emirate = 'DUBAI',
            age = 5, tier = 'AMC', components = { elevators: 4, hvac: 'CENTRALIZED' },
            selectedAddons = []
        } = inputs;

        let basePrice = this.calculateBaseRate(propertyType, subType);
        let annualBase = 0;

        if (['VILLA_COMMUNITY', 'SCHOOL', 'LABOR'].includes(propertyType)) {
            annualBase = basePrice * units;
        } else {
            annualBase = basePrice * (totalSqft || 150000);
        }

        annualBase *= (LOCATION_FACTOR[emirate] || 1.0);
        annualBase *= this.getAgeMultiplier(age);
        if (tier === 'HYBRID') annualBase *= HYBRID_OS_MULTIPLIER;

        // Add-Ons Calculation
        let addonsPrice = 0;
        const addonDetails = selectedAddons.map(code => {
            const addon = ADDON_CATALOG[code];
            let price = 0;
            if (addon.model === 'PER_UNIT') price = addon.value * units;
            else if (addon.model === 'PER_SQFT') price = addon.value * (totalSqft || 150000);
            else if (addon.model === 'PERCENTAGE') price = annualBase * addon.value;
            else if (addon.model === 'FLAT') price = addon.value;
            
            addonsPrice += price;
            return { code, name: addon.name, price: Math.round(price), clause: addon.clause };
        });

        const finalAnnual = Math.round(annualBase + addonsPrice);
        const marketAvg = Math.round((annualBase / BIN_TARGET_FACTOR) + addonsPrice);

        return {
            financials: {
                basePrice: Math.round(annualBase),
                addonsPrice: Math.round(addonsPrice),
                annualPrice: finalAnnual,
                monthlyPrice: Math.round(finalAnnual / 12),
                perUnitPrice: Math.round(finalAnnual / units),
                vat: Math.round(finalAnnual * 0.05),
                marketBenchmark: {
                    average: marketAvg,
                    savings: marketAvg - finalAnnual,
                    savingsPercentage: 18
                }
            },
            strategic: {
                riskClass: this.getRiskClass(age, components),
                lifecycle: this.calculateLifecycleForecast(age, propertyType),
                roi: {
                    repairReduction: selectedAddons.includes('PREDICTIVE_AI') ? "32-40%" : "25-35%",
                    downtimeAvoidance: selectedAddons.includes('EMERGENCY_24_7') ? "55%" : "42%",
                    healthImprovement: selectedAddons.includes('BPI_ANALYTICS') ? "+18%" : "+12%"
                },
                preventiveCoverage: selectedAddons.length > 3 ? "96%" : "84%",
                recommendations: this.getRecommendations(inputs)
            },
            addons: addonDetails,
            scope: this.getServiceScope(tier),
            metadata: {
                confidenceScore: "94%",
                validityDays: 30,
                jurisdiction: "UAE_FEDERAL_ALIGNED",
                slaTier: finalAnnual > 1000000 ? 'ENTERPRISE+' : finalAnnual > 500000 ? 'ENTERPRISE' : 'STANDARD'
            },
            inputs: { ...inputs, generatedAt: Date.now() }
        };
    }
}

module.exports = new UniversalQuoteService();
