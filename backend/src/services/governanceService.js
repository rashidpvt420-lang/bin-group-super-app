const { db } = require('../config/firebase');
const crypto = require('crypto');

/**
 * AuditShield™ — Institutional Governance Engine
 * Implements immutable, append-only audit trails for RERA/DLD compliance.
 */

class GovernanceService {
    /**
     * Generate a Forensic Hash for an Action Payload
     */
    hashPayload(payload) {
        const secret = process.env.AUDIT_SECRET || 'BIN-GOVERNANCE-2026';
        return crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
    }

    /**
     * Log a high-trust action to the GovernanceAudit collection
     * STRICT SCHEMA: eventType, entityType, entityId, actor.uid, actor.role, 
     * subjectUid, requestId, timestamp, before, after, jurisdiction, forensicHash, sourceService, outcome
     */
    async logInstitutionalAction(params) {
        const {
            actorId,
            actorRole, 
            actionType, 
            entityType, 
            entityId,
            subjectUid = null,
            requestId = `REQ-${this.generateId()}`,
            payload = {}, 
            before = null,
            after = null,
            sourceService = 'CORE_BACKEND',
            outcome = 'SUCCESS',
            metadata = {}
        } = params;

        if (!actorId || !actionType) {
            throw new Error("Governance Audit Error: Missing Actor or Action Type");
        }

        const timestamp = Date.now();
        
        // 🛡️ Forensic Signature includes before/after snapshots for state-change verification
        const forensicHash = this.hashPayload({ 
            actionType, 
            entityId, 
            actorId, 
            timestamp, 
            before, 
            after, 
            outcome 
        });

        const logEntry = {
            auditId: `AUDIT-${this.generateId()}`,
            requestId,
            timestamp,
            date: new Date(timestamp).toISOString(),
            eventType: actionType,
            sourceService,
            outcome,
            actor: {
                uid: actorId,
                role: actorRole,
                ipHash: this.hashPayload(metadata.ipAddress || '0.0.0.0').slice(0, 16),
                deviceHash: this.hashPayload(metadata.deviceInfo || 'Institutional Browser').slice(0, 16)
            },
            entity: {
                type: entityType,
                id: entityId
            },
            subjectUid,
            stateChange: {
                before,
                after
            },
            integrity: {
                forensicHash,
                algorithm: 'HMAC-SHA256',
                jurisdiction: 'AE_DUBAI', // ISO standard jurisdiction ID
                compliesWith: ['DLD-PGR-01', 'RERA-KYC-22']
            },
            status: 'COMMITTED_IMMUTABLE'
        };

        // 🛡️ WRITE TO APPEND-ONLY LEDGER (Hardened by Firestore Security Rules)
        const auditRef = db.collection('governanceAudit').doc(logEntry.auditId);
        await auditRef.set(logEntry);

        console.log(`📑 [AuditShield] ${actionType} logged. Integrity Signature: ${forensicHash.slice(0, 10)}...`);

        return logEntry.auditId;
    }

    /**
     * Get Audit Trail for a specific entity (Institutional Analysis)
     */
    async getEntityAuditTrail(entityType, entityId) {
        const snap = await db.collection('governanceAudit')
            .where('entity.type', '==', entityType)
            .where('entity.id', '==', entityId)
            .orderBy('timestamp', 'desc')
            .get();

        return snap.docs.map(doc => doc.data());
    }

    /**
     * Verify the integrity of a specific audit log entry
     * Re-calculates hash and compares.
     */
    async verifyIntegrity(auditId) {
        const auditLogDoc = await db.collection('governanceAudit').doc(auditId).get();
        if (!auditLogDoc.exists) return { verified: false, error: 'LOG_NOT_FOUND' };
        
        const auditLog = auditLogDoc.data();

        // Re-calculate hash based on the strict forensic structure
        const reHash = this.hashPayload({ 
            actionType: auditLog.eventType, 
            entityId: auditLog.entity.id, 
            actorId: auditLog.actor.uid, 
            timestamp: auditLog.timestamp, 
            before: auditLog.stateChange.before, 
            after: auditLog.stateChange.after, 
            outcome: auditLog.outcome 
        });

        const isVerified = reHash === auditLog.integrity.forensicHash;
        
        return {
            verified: isVerified,
            auditId,
            eventType: auditLog.eventType,
            timestamp: auditLog.timestamp,
            integritySignature: auditLog.integrity.forensicHash
        };
    }

    generateId() {
        return Math.random().toString(36).substr(2, 9).toUpperCase();
    }
}

module.exports = new GovernanceService();
