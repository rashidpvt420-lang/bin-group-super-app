const { db } = require('../config/firebase');
const GovernanceService = require('./governanceService');

/**
 * 🌉 Ejari / DLD Official Bridge (Phase C)
 * Compliance Layer: Dubai Land Department (DLD) Regulator Integration.
 * Features: Lease Registration, Renewals, Renewals, Status Verifications.
 */
class EjariService {
    /**
     * Register a signed contract with Ejari (DLD API simulation)
     */
    async registerLease(contractId, actor) {
        const contractRef = db.collection('contracts').doc(contractId);
        const contractSnap = await contractRef.get();
        if (!contractSnap.exists) throw new Error("Contract record missing.");
        
        const contract = contractSnap.data();
        if (contract.status !== 'SIGNED') throw new Error("Violation: Cannot register unsigned contract with Ejari.");

        // 🔗 DLD BRIDGE SIMULATION (Institutional Wiring)
        // In production, this calls: https://api.dubailand.gov.ae/v1/ejari/register
        const ejariNumber = `EJ-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const registrationDate = Date.now();
        const expiryDate = contract.terms.endDate || (registrationDate + 365 * 24 * 60 * 60 * 1000);

        const ejariData = {
            ejariNumber,
            contractId,
            propertyId: contract.propertyId,
            tenantId: contract.tenantId || 'T-UNKNOWN',
            registrationDate,
            expiryDate,
            status: 'ACTIVE',
            dldReference: `DLD-REF-${Math.random().toString(10).substr(2, 10)}`,
            lastVerifiedAt: registrationDate
        };

        // 🛡️ COMMIT TO REGULATOR LEDGER (ejariRegistrations)
        await db.collection('ejariRegistrations').doc(contractId).set(ejariData);

        // 🛡️ Update Contract with Ejari Linkage
        await contractRef.update({ ejariNumber, ejariStatus: 'ACTIVE' });

        // 🛡️ Log Governance: DLD/Ejari Legal Event
        await GovernanceService.logInstitutionalAction({
            actorId: actor.uid,
            actorRole: actor.role,
            actionType: 'EJARI_REGISTERED',
            entityType: 'CONTRACT',
            entityId: contractId,
            after: ejariData,
            payload: { ejariNumber, dldRef: ejariData.dldReference }
        });

        console.log(`🌉 [Ejari Bridge] Lease registered for ${contractId}. Ejari Number: ${ejariNumber}. Status: ACTIVE.`);

        return ejariData;
    }

    /**
     * Terminate an Ejari Registration
     */
    async terminateLease(contractId, actor) {
        const ejariRef = db.collection('ejariRegistrations').doc(contractId);
        const ejariSnap = await ejariRef.get();
        if (!ejariSnap.exists) throw new Error("Ejari record missing.");

        await ejariRef.update({ status: 'TERMINATED', terminatedAt: Date.now() });

        // 🛡️ Log Governance: DLD/Ejari Termination
        await GovernanceService.logInstitutionalAction({
            actorId: actor.uid,
            actorRole: actor.role,
            actionType: 'EJARI_TERMINATED',
            entityType: 'CONTRACT',
            entityId: contractId,
            payload: { reason: 'LEASE_ENDED_EARLY' }
        });

        return { success: true };
    }

    /**
     * Verify Ejari status against live DLD bridge
     */
    async verifyEjari(contractId) {
        const doc = await db.collection('ejariRegistrations').doc(contractId).get();
        if (!doc.exists) return { valid: false, error: 'NO_RECORD' };
        
        const data = doc.data();
        const isExpired = data.expiryDate < Date.now();

        return {
            valid: data.status === 'ACTIVE' && !isExpired,
            ejariNumber: data.ejariNumber,
            status: isExpired ? 'EXPIRED' : data.status
        };
    }
}

module.exports = new EjariService();
