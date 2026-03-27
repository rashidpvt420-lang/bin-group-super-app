/**
 * BIN Group: Financial Waterfall Logic
 * Calculates the net payout to the owner based on the UAE rental waterfall.
 * Formula: Rent - (Management Fee + VAT + Active Maintenance) = Net Owner Payout
 */

class FinancialWaterfall {
  /**
   * Computes the waterfall for a specific billing period.
   * @param {Object} params 
   * @param {number} params.grossRent - Total rent collected for the period (AED).
   * @param {number} params.managementFeePerc - Management fee percentage (e.g., 0.05 for 5%).
   * @param {number} params.maintenanceCosts - Total cost of approved work orders in period.
   * @param {boolean} params.isVatRegistered - Whether the owner is VAT registered.
   */
  static calculatePayout(params) {
    const { 
      grossRent, 
      managementFeePerc, 
      maintenanceCosts, 
      isVatRegistered = true 
    } = params;

    const VAT_RATE = 0.05;

    // 1. Management Fee Calculation
    const managementFee = grossRent * managementFeePerc;
    const managementFeeVat = managementFee * VAT_RATE;

    // 2. Maintenance Burden
    // Note: Maintenance costs from vendors usually already include 5% VAT.
    const maintenanceVat = maintenanceCosts * (VAT_RATE / (1 + VAT_RATE)); 
    const maintenanceNet = maintenanceCosts - maintenanceVat;

    // 3. Total Deductions
    const totalDeductions = managementFee + managementFeeVat + maintenanceCosts;

    // 4. Net Payout
    const netPayout = grossRent - totalDeductions;

    return {
      grossRent,
      deductions: {
        managementFee: {
          net: parseFloat(managementFee.toFixed(2)),
          vat: parseFloat(managementFeeVat.toFixed(2)),
          total: parseFloat((managementFee + managementFeeVat).toFixed(2))
        },
        maintenance: {
          total: parseFloat(maintenanceCosts.toFixed(2))
        },
        totalDeductions: parseFloat(totalDeductions.toFixed(2))
      },
      netPayout: parseFloat(netPayout.toFixed(2)),
      payoutYield: parseFloat(((netPayout / grossRent) * 100).toFixed(2))
    };
  }
}

module.exports = FinancialWaterfall;
