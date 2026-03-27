/**
 * BIN Group Professional Quotation Service
 * Implements the Dual-Engine Architecture (B2C Unit-Based & B2B Area-Based)
 */

class QuotationService {
  /**
   * Main entry point for quote calculation.
   * Redirects to the appropriate engine based on property type.
   */
  static async computeQuote(params, config) {
    const isB2C = ['villa', 'apartment_unit'].includes(params.propertyType);
    
    if (isB2C) {
      return this._computeB2CQuote(params, config);
    } else {
      const quote = this._computeB2BQuote(params, config);
      // Apply RERA-weighted alignment as a final layer
      return this._calculateWeightedServiceCharge(quote, params, config);
    }
  }

  /**
   * WEIGHTED ALGORITHM LAYER:
   * Re-calibrates the base quote against RERA benchmarks and complexity weights.
   */
  static _calculateWeightedServiceCharge(quote, params, config) {
    const { communityType = 'standard', assetComplexity = 1.0 } = params;
    const { reraBenchmarks = {} } = config;

    // 1. Community Weighting (Dubai Marina vs. International City)
    const communityWeight = {
      'prime': 1.25,
      'high': 1.15,
      'standard': 1.0,
      'economical': 0.85
    }[communityType] || 1.0;

    // 2. RERA Benchmark Calibration
    const benchmarkRate = reraBenchmarks[params.propertyType] || 15; // default 15 AED/sqft
    const calculatedSqftRate = quote.finalQuote / quote.metrics.areaSqft;
    
    // Penalty if too high/low compared to benchmark
    let benchmarkWeight = 1.0;
    if (calculatedSqftRate > benchmarkRate * 1.2) benchmarkWeight = 0.95; // Scale down for competitiveness
    if (calculatedSqftRate < benchmarkRate * 0.8) benchmarkWeight = 1.05; // Scale up for sustainability

    const finalWeightedPrice = quote.finalQuote * communityWeight * assetComplexity * benchmarkWeight;

    return {
      ...quote,
      finalQuote: parseFloat(finalWeightedPrice.toFixed(2)),
      weightedMetrics: {
        communityWeight,
        assetComplexity,
        benchmarkWeight,
        reraBenchmark: benchmarkRate
      }
    };
  }

  /**
   * ENGINE A: Unit-Based logic for Small Assets (Villas/Small Apts)
   */
  static _computeB2CQuote(params, config) {
    const { unitCount = 1, tier = 'standard', portfolioCount = 1 } = params;
    const { b2cUnitRates, discountTiers } = config;

    const ratePerUnit = b2cUnitRates[tier] || 2000;
    const totalMaintenance = unitCount * ratePerUnit;

    const portfolioDiscountPerc = this._getPortfolioDiscount(portfolioCount, discountTiers);
    const finalQuote = totalMaintenance * (1 - portfolioDiscountPerc);

    return {
      engine: 'B2C_UNIT',
      metrics: { costPerUnit: ratePerUnit },
      breakdown: { maintenance: totalMaintenance, management: 0, discounts: { portfolio: totalMaintenance * portfolioDiscountPerc } },
      finalQuote,
      recommended: 'maintenance'
    };
  }

  /**
   * ENGINE B: Professional FM Tender logic for Large Assets (Towers/Malls/Schools)
   */
  static _computeB2BQuote(params, config) {
    const {
      propertyType,
      area,
      unit = 'sqft',
      annualRent = 0,
      buildingAge = '5-15y',
      floorCount = 1,
      hvacType = 'split',
      locationTier = 'tier3',
      amenities = [],
      scopeType = 'hard_fm',
      portfolioCount = 1,
      assetValue = 0,
      unitCount = 1
    } = params;

    const {
      baseRates, ageMultipliers, floorMultipliers, hvacMultipliers,
      locationMultipliers, amenityModifiers, scopeFactors, pmRates,
      discountTiers, bundleDiscount, termDiscounts
    } = config;

    // 1. Area Transformation (RERA standards use sqft per year)
    const areaSqft = unit === 'm2' ? area / 0.092903 : area;
    const areaM2 = unit === 'sqft' ? area * 0.092903 : area;

    // 2. The Multiplier Stack & Base Rate Selection
    // Dynamically select rate based on propertyType and complexity (defaulting to middle of range)
    const rateConfig = this._getRateBounds(propertyType, config);
    const baseRateSqft = (rateConfig.min + rateConfig.max) / 2;
    
    const ageMult = ageMultipliers[buildingAge] || 1.0;
    const floorMult = floorMultipliers[this._getFloorTier(floorCount)] || 1.0;
    const hvacMult = hvacMultipliers[hvacType] || 1.0;
    const locMult = locationMultipliers[locationTier] || 1.0;
    const scopeMult = scopeFactors[scopeType] || 1.0;
    
    // Calculate Amenity Impact from the specific config mapping
    const amenityMult = 1.0 + amenities.reduce((acc, a) => acc + (amenityModifiers[a] || 0), 0);

    // 3. Maintenance Waterfall (Sqft-based Calculation)
    const maintenanceSubtotal = areaSqft * baseRateSqft * ageMult * floorMult * hvacMult * locMult * scopeMult * amenityMult;

    // 4. Smart Upsell (Add-ons)
    const { upsells = [] } = params;
    const { upsellMultipliers = {} } = config;
    const upsellCost = upsells.reduce((acc, u) => acc + (maintenanceSubtotal * (upsellMultipliers[u] || 0)), 0);

    // 5. Property Management Fee (Type-specific)
    const pmRate = this._getPMFeeRate(propertyType, config);
    const pmFee = annualRent * pmRate;

    // 6. Integrated Discounts
    const combinedBase = maintenanceSubtotal + upsellCost + pmFee;
    let finalSubtotal = combinedBase;
    let bundleSavings = 0;
    if (pmFee > 0) {
      bundleSavings = combinedBase * (bundleDiscount || 0.10);
      finalSubtotal -= bundleSavings;
    }

    // 7. Portfolio Discount
    const portfolioDiscountPerc = this._getPortfolioDiscount(portfolioCount, discountTiers);
    const portfolioSavings = finalSubtotal * portfolioDiscountPerc;
    let finalPrice = finalSubtotal - portfolioSavings;

    // 8. Contract Term Discount (e.g., 2yr = 2%, 3yr = 5%) pulled from config
    const { contractTerm = 1 } = params;
    const termDiscountPerc = (termDiscounts && termDiscounts[contractTerm]) || 0;
    const termSavings = finalPrice * termDiscountPerc;
    finalPrice -= termSavings;

    // 9. ROI Impact Analytics
    const maintenanceIntensity = annualRent > 0 ? (finalPrice / annualRent) : 0;
    const netOperatingIncome = annualRent - finalPrice;
    const roiScore = assetValue > 0 ? (finalPrice / assetValue) * 100 : null;

    return {
      engine: 'B2B_TENDER',
      metrics: {
        areaSqft: parseFloat(areaSqft.toFixed(2)),
        areaM2: parseFloat(areaM2.toFixed(2)),
        ratePerSqft: maintenanceSubtotal / areaSqft,
        costPerUnit: finalPrice / unitCount,
        maintenanceIntensity: parseFloat((maintenanceIntensity * 100).toFixed(2)),
        netOperatingIncome: parseFloat(netOperatingIncome.toFixed(2))
      },
      breakdown: {
        maintenance: maintenanceSubtotal,
        upsells: upsellCost,
        management: pmFee,
        discounts: { 
          bundle: bundleSavings, 
          portfolio: portfolioSavings,
          term: termSavings
        },
        components: {
          mep: maintenanceSubtotal * 0.35,
          cleaning: maintenanceSubtotal * 0.25,
          security: maintenanceSubtotal * 0.25,
          mgmt: maintenanceSubtotal * 0.15
        }
      },
      finalQuote: finalPrice,
      roiScore: roiScore ? parseFloat(roiScore.toFixed(2)) : null,
      recommended: pmFee > 0 ? 'integrated' : 'maintenance'
    };
  }

  static _getFloorTier(count) {
    if (count > 60) return '60+';
    if (count > 30) return '30-60';
    if (count > 10) return '10-30';
    return '1-10';
  }

  static _getRateBounds(type, config) {
    const map = {
      'villa': { min: config.villaRateMin, max: config.villaRateMax },
      'residential_mid': { min: config.midResidentialRateMin, max: config.midResidentialRateMax },
      'residential_premium': { min: config.premiumResidentialRateMin, max: config.premiumResidentialRateMax },
      'residential_luxury': { min: config.luxuryResidentialRateMin, max: config.luxuryResidentialRateMax },
      'commercial': { min: config.commercialRateMin, max: config.commercialRateMax },
      'mall': { min: config.mallRateMin, max: config.mallRateMax },
      'warehouse': { min: config.warehouseRateMin, max: config.warehouseRateMax }
    };
    return map[type] || { min: 8, max: 18 };
  }

  static _getPMFeeRate(type, config) {
    if (type === 'villa') return config.managementFeeVilla || 0.07;
    if (['commercial', 'mall', 'warehouse'].includes(type)) return config.managementFeeCommercial || 0.08;
    return config.managementFeeResidential || 0.05;
  }

  static _getPortfolioDiscount(count, discounts) {
    if (!discounts) return 0;
    // Handle both array and object-based discount configs
    if (Array.isArray(discounts)) {
      const sorted = [...discounts].sort((a, b) => b.count - a.count);
      const tier = sorted.find(t => count >= t.count);
      return tier ? tier.discount : 0;
    } else {
      const counts = Object.keys(discounts).map(Number).sort((a, b) => b - a);
      const matched = counts.find(c => count >= c);
      return matched ? discounts[matched] : 0;
    }
  }

  /**
   * Finalize a Quote for Onboarding
   * Stores the quote and its forensic hash in the ledger.
   */
  static async saveAndFinalizeQuote(ownerId, propertyId, quoteData) {
    const { db } = require('../config/firebase');
    const GovernanceService = require('./governanceService');

    const quoteId = `QUOTE-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const timestamp = Date.now();

    // 🧬 Generate Forensic Hash for the Quote
    const quoteHash = this.calculateQuoteHash(quoteData);

    const finalizedQuote = {
      quoteId,
      ownerId,
      propertyId,
      timestamp,
      data: quoteData,
      status: 'APPROVED',
      immutableQuoteHash: quoteHash,
      metadata: {
        engine: quoteData.engine,
        finalPrice: quoteData.finalQuote,
        jurisdiction: 'AE-DXB'
      }
    };

    // 🛡️ Save to Ledger
    await db.collection('Quotations').doc(quoteId).set(finalizedQuote);

    // 🔒 Log to Governance
    await GovernanceService.logInstitutionalAction({
      actorId: ownerId,
      actorRole: 'OWNER',
      actionType: 'QUOTE_APPROVE',
      entityType: 'QUOTE',
      entityId: quoteId,
      payload: { 
        finalPrice: quoteData.finalQuote,
        quoteHash 
      },
      metadata: { description: `Quote approved for property ${propertyId}` }
    });

    return finalizedQuote;
  }

  /**
   * Forensic Hash for Quotation Data
   */
  static calculateQuoteHash(quoteData) {
    const crypto = require('crypto');
    const secret = process.env.AUDIT_SECRET || 'BIN-GOVERNANCE-2026';
    
    // Hash core commercial elements
    const payload = JSON.stringify({
      finalQuote: quoteData.finalQuote,
      engine: quoteData.engine,
      breakdown: quoteData.breakdown
    });

    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }
}

module.exports = QuotationService;
