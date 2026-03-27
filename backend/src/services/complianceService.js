/**
 * 🛡️ BIN-COMPLIANCE™ VENDOR REGISTRY
 * Manages institutional eligibility for third-party contractors in the UAE.
 */

const { db } = require('../config/firebase');

class ComplianceService {
    /**
     * Updates or initializes a vendor's compliance record.
     */
    async updateVendorCompliance(vendorId, complianceData) {
        const {
            tradeLicenseExpiry,
            insuranceExpiry,
            hseCertificationExpiry,
            riskClass, // LOW, MEDIUM, HIGH
            approvedCategories = []
        } = complianceData;

        const complianceRef = db.collection('vendor_compliance').doc(vendorId);
        const timestamp = Date.now();

        const record = {
            vendorId,
            tradeLicenseExpiry,
            insuranceExpiry,
            hseCertificationExpiry,
            riskClass,
            approvedCategories,
            status: this.evaluateStatus(complianceData),
            lastVerifiedAt: timestamp,
            updatedAt: timestamp
        };

        await complianceRef.set(record);
        return record;
    }

    /**
     * Logic to determine if a vendor is 'ELIGIBLE', 'EXPIRING_SOON', or 'BLOCKED'.
     */
    evaluateStatus(data) {
        const now = Date.now();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;

        const expiries = [
            data.tradeLicenseExpiry,
            data.insuranceExpiry,
            data.hseCertificationExpiry
        ];

        if (expiries.some(exp => now > exp)) return 'BLOCKED';
        if (expiries.some(exp => (exp - now) < thirtyDays)) return 'EXPIRING_SOON';
        
        return 'ELIGIBLE';
    }

    /**
     * Critical gatekeeper for maintenance dispatch.
     * Prevents assigning work to non-compliant vendors.
     */
    async isVendorEligible(vendorId, requiredCategory) {
        const snap = await db.collection('vendor_compliance').doc(vendorId).get();
        if (!snap.exists) return false;

        const compliance = snap.data();
        
        // 1. Status Check
        if (compliance.status === 'BLOCKED') return false;

        // 2. Category Check
        if (requiredCategory && !compliance.approvedCategories.includes(requiredCategory)) {
            return false;
        }

        return true;
    }
}

module.exports = new ComplianceService();
