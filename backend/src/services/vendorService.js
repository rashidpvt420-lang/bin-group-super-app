const { db, storage } = require('../config/firebase');
const GovernanceService = require('./governanceService');

/**
 * 🏭 Vendor Compliance Registry (Critical Gap 1)
 * Compliance Layer: Tracking trade licenses, insurance, and technician certifications.
 * Features: Expiry alerts, risk categorization, and institutional approval scope.
 */
class VendorService {
    /**
     * Register or Update a Vendor Compliance Record
     */
    async updateVendorCompliance(vendorId, complianceData, actor) {
        const vendorRef = db.collection('vendors').doc(vendorId);
        const {
            tradeLicenseExpiry,
            insuranceExpiry,
            safetyComplianceExpiry,
            hseComplianceLevel = 'STANDARD', // STANDARD | GOLD | CRITICAL
            permitEligibility = [], // e.g., ["WORK_AT_HEIGHT", "CONFINED_SPACE"]
            riskClass = 'LOW', // LOW | MEDIUM | HIGH
            approvedWorkTypes = [],
            technicianCertifications = [], // Array of { name, expiry }
            status = 'ACTIVE_CERTIFIED'
        } = complianceData;

        // Verify Expiry Timestamps (Future-dated validation)
        const now = Date.now();
        const isExpired = tradeLicenseExpiry < now || insuranceExpiry < now;
        
        const finalStatus = isExpired ? 'SUSPENDED_EXPIRED' : status;

        const vendorRecord = {
            vendorId,
            compliance: {
                tradeLicenseExpiry,
                insuranceExpiry,
                safetyComplianceExpiry,
                hseComplianceLevel,
                permitEligibility,
                riskClass,
                approvedWorkTypes,
                technicianCertifications,
                lastVerifiedAt: now,
                verifiedBy: actor.uid
            },
            status: finalStatus,
            systemAlert: isExpired ? `CRITICAL: Compliance Expiry Detected` : 'OK'
        };

        // 🛡️ COMMIT TO LEDGER (vendors/{vendorId}/compliance)
        // Store compliance history in sub-collection for audit
        const historyRef = vendorRef.collection('compliance_history').doc();
        await historyRef.set(vendorRecord.compliance);

        await vendorRef.set(vendorRecord, { merge: true });

        // 🛡️ Log Governance Action: Compliance Update
        await GovernanceService.logInstitutionalAction({
            actorId: actor.uid,
            actorRole: actor.role,
            actionType: 'VENDOR_COMPLIANCE_UPDATED',
            entityType: 'VENDOR',
            entityId: vendorId,
            after: vendorRecord,
            payload: { riskClass, isExpired }
        });

        console.log(`🏭 [Vendor Registry] Compliance updated for ${vendorId}. Status: ${finalStatus}.`);

        return vendorRecord;
    }

    /**
     * Get Certified Vendors for a Work Type (Institutional Triage)
     */
    async getCertifiedVendors(workType) {
        const snap = await db.collection('vendors')
            .where('status', '==', 'ACTIVE_CERTIFIED')
            .where('compliance.approvedWorkTypes', 'array-contains', workType)
            .get();

        return snap.docs.map(doc => doc.data());
    }
}

module.exports = new VendorService();
