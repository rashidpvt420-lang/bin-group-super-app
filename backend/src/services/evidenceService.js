/**
 * 🛡️ BIN-EVIDENCE™ SERVICE
 * Creates an immutable chain of custody for all institutional contracts in the UAE.
 */

const crypto = require('crypto');
const { db } = require('../config/firebase');

class EvidenceService {
    /**
     * Creates a high-fidelity evidence bundle for a contract signature.
     */
    async createEvidenceBundle(contractId, signerData, fileHash) {
        const timestamp = Date.now();
        
        const bundle = {
            contractId,
            signer: {
                uid: signerData.uid,
                email: signerData.email,
                role: signerData.role,
                ip: signerData.ip || '0.0.0.0',
                userAgent: signerData.userAgent || 'UNKNOWN'
            },
            artifact: {
                sha256: fileHash,
                type: 'PDF_CONTRACT',
                version: signerData.version || 1
            },
            governance: {
                timestamp,
                region: 'UAE',
                jurisdiction: 'DIFC/ADGM_ALIGNED'
            }
        };

        // 🧬 Forensic Fingerprint
        const forensicHash = this.calculateForensicHash(bundle);
        
        const evidenceRef = db.collection('evidence_bundles').doc();
        await evidenceRef.set({
            ...bundle,
            id: evidenceRef.id,
            forensicHash,
            createdAt: timestamp
        });

        return {
            bundleId: evidenceRef.id,
            forensicHash
        };
    }

    /**
     * Generates a unique SHA-256 fingerprint for the bundle.
     */
    calculateForensicHash(bundle) {
        const secret = process.env.EVIDENCE_SECRET || 'BIN-LEGAL-2026';
        const content = JSON.stringify({
            cid: bundle.contractId,
            sid: bundle.signer.uid,
            hash: bundle.artifact.sha256,
            ts: bundle.governance.timestamp
        });
        
        return crypto.createHmac('sha256', secret)
            .update(content)
            .digest('hex');
    }

    /**
     * Tracks the lineage of a contract as it gets renewed or amended.
     */
    async trackVersionLineage(originalContractId, newVersionId) {
        const lineageRef = db.collection('contract_lineage').doc(originalContractId);
        const lineageSnap = await lineageRef.get();
        
        if (!lineageSnap.exists) {
            await lineageRef.set({
                rootId: originalContractId,
                versions: [originalContractId, newVersionId],
                updatedAt: Date.now()
            });
        } else {
            await lineageRef.update({
                versions: [...lineageSnap.data().versions, newVersionId],
                updatedAt: Date.now()
            });
        }
    }
}

module.exports = new EvidenceService();
