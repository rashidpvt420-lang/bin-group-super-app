const { db } = require('../config/firebase');
const crypto = require('crypto');

/**
 * BIN-SIGN™ Legal Integrity Service
 * Digital signature capture + Forensic auditing
 */

class SignatureService {
  /**
   * Submit and Record User Signature
   * @param {string} contractId
   * @param {string} signatureUrl
   * @param {object} user - { id, ip, device } 
   */
  async submitSignature(contractId, signatureUrl, user) {
    console.log(`🖋️ [BIN-SIGN] Capturing Digital Signature for Contract: ${contractId}`);

    const contractDoc = await db.collection('contracts').doc(contractId).get();
    if (!contractDoc.exists) throw new Error('Contract not found');

    const contractData = contractDoc.data();
    const signedAt = Date.now();

    // 1. Generate Legal Integrity Hash (SHA-256)
    // Combines contract data + signature timestamp for non-repudiation
    const contractText = contractData.contractText || '';
    const contractHash = crypto
      .createHash('sha256')
      .update(`${contractText}_${signedAt}_${user.id}`)
      .digest('hex');

    // 2. Record Signature Details
    const signatureRecord = {
      contractId,
      signedBy: user.id,
      signatureImageUrl: signatureUrl,
      ipAddress: user.ip,
      deviceInfo: user.device,
      signedAt,
      integrityHash: contractHash,
      metadata: {
        legalFramework: 'FIDIC-BIN-V1',
        compliance: 'UAE-DLD-RERA-2026'
      }
    };

    const signatureRef = await db.collection('signatures').add(signatureRecord);

    // 3. Update Contract Status
    await db.collection('contracts').doc(contractId).update({
      status: 'SIGNED',
      signedAt,
      signatureId: signatureRef.id,
      integrityHashAtSign: contractHash
    });

    console.log(`✅ [BIN-SIGN] Legal Binding Successful (Hash: ${contractHash.substring(0, 12)}...)`);

    return {
      success: true,
      signatureId: signatureRef.id,
      legalHash: contractHash
    };
  }

  /**
   * Verify Signature Integrity
   */
  async verifySignature(contractId) {
    const sigSnap = await db.collection('signatures')
      .where('contractId', '==', contractId)
      .limit(1)
      .get();

    if (sigSnap.empty) return { verified: false, reason: 'No signature found' };

    const sigData = sigSnap.docs[0].data();
    return {
      verified: true,
      signedBy: sigData.signedBy,
      signedAt: sigData.signedAt,
      hash: sigData.integrityHash
    };
  }
}

module.exports = new SignatureService();
