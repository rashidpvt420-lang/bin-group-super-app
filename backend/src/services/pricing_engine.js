/**
 * 📊 BIN-GROUP Institutional Pricing Engine (V2.0 — 2026 UAE Reality)
 * Implements Tower-level AMC, PM, and Hybrid contracts across all Emirates.
 */

// 🌍 UAE Regional Pricing Adjustment Matrix
const EMIRATE_FACTORS = {
    'DUBAI': 1.0,           // Baseline
    'ABU_DHABI': 1.08,      // +8% avg
    'SHARJAH': 0.85,        // -15%
    'AJMAN': 0.80,          // -20%
    'RAK': 0.78,            // -22%
    'FUJAIRAH': 0.82,       // -18%
    'UAQ': 0.75,            // -25%
    'AL_AIN': 0.88          // -12%
};

// 🏛️ Maintenance (AMC) Tier Rates (AED/sq.ft/year)
const AMC_RATES = {
    'BASIC': { min: 12, max: 18 },
    'STANDARD': { min: 18, max: 28 },
    'PREMIUM': { min: 28, max: 45 },
    'LUXURY_TFM': { min: 70, max: 120 } // Total Facility Management
};

// 🏘️ Property Management (PM) Rates
const PM_RATES = {
    'PER_UNIT': 1200,      // AED per unit/year (Standard)
    'REVENUE_PERCENT': 0.06 // 6% of Annual Rent
};

/**
 * 🏭 Tier 1: Maintenance Only (AMC)
 * Focus: Technical workload, HVAC, MEP, etc.
 */
function calculateTowerAMC(sqft, tier = 'STANDARD', emirate = 'DUBAI') {
    const s = Number(sqft);
    const rate = AMC_RATES[tier] ? AMC_RATES[tier].min : 18;
    const emirateFactor = EMIRATE_FACTORS[emirate] || 1.0;

    const totalAnnual = s * rate * emirateFactor;
    return {
        totalAnnual,
        monthly: totalAnnual / 12,
        ratePerSqft: rate * emirateFactor,
        tier,
        emirate
    };
}

/**
 * 🏘️ Tier 2: Property Management Only (PM)
 * Focus: Leasing, Ejari, renewals, and tenant admin.
 */
function calculateTowerPM(totalUnits, annualRent, method = 'PER_UNIT') {
    const units = Number(totalUnits);
    const rent = Number(annualRent);

    let totalAnnual = 0;
    if (method === 'REVENUE_PERCENT') {
        totalAnnual = rent * PM_RATES.REVENUE_PERCENT;
    } else {
        totalAnnual = units * PM_RATES.PER_UNIT;
    }

    return {
        totalAnnual,
        monthly: totalAnnual / 12,
        ratePerUnit: totalAnnual / units,
        method
    };
}

/**
 * 🔋 Tier 3: BIN-GROUP Hybrid OS (The Institutional Bundle) ⭐
 * Focus: maintenance + approvals + telemetry + compliance + tenant admin.
 */
function calculateHybridOS(sqft, emirate = 'DUBAI', tier = 'STANDARD') {
    const s = Number(sqft);
    // Bundle rate is typically AMC + 15-20% for full PM/OS overhead.
    const amcRate = AMC_RATES[tier] ? AMC_RATES[tier].min : 18;
    const bundleRate = amcRate * 1.8; // Bundled premium for full OS
    
    const emirateFactor = EMIRATE_FACTORS[emirate] || 1.0;
    const totalAnnual = s * bundleRate * emirateFactor;

    return {
        totalAnnual,
        monthly: totalAnnual / 12,
        ratePerSqft: bundleRate * emirateFactor,
        includes: ['MAINTENANCE', 'PM_ADMIN', 'IA_MONITORING', 'COMPLIANCE_LEGAL'],
        tier,
        emirate
    };
}

module.exports = {
    calculateTowerAMC,
    calculateTowerPM,
    calculateHybridOS,
    EMIRATE_FACTORS,
    AMC_RATES
};
