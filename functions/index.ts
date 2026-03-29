import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// ── UTILITIES ──────────────────────────────────────────────────────────────
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// ── IDENTITY & ACCESS MANAGEMENT ─────────────────────────────────────────────

import { beforeUserCreated } from "firebase-functions/v2/identity";

/**
 * [CRITICAL STABILITY] Auto-grant Admin claims on first login.
 * This is a blocking function. It must return quickly to avoid auth timeouts.
 */
export const autoGrantAdminOnFirstLogin = beforeUserCreated(async (event) => {
    const user = event.data;
    if (!user?.email) return;

    try {
        const emailKey = user.email.replace(/\./g, "_").replace(/@/g, "_");
        
        // Use a timeout for the DB read
        const grantDocPromise = db.collection("pending_admin_grants").doc(emailKey).get();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 5000));
        
        const grantDoc = await Promise.race([grantDocPromise, timeoutPromise]) as admin.firestore.DocumentSnapshot;

        if (grantDoc.exists) {
            const grant = grantDoc.data()!;
            const claims: Record<string, unknown> = {
                admin: grant.isAdmin ?? false,
                role: grant.role ?? "technical",
                godMode: grant.godMode ?? false,
            };

            // Apply claims immediately
            await admin.auth().setCustomUserClaims(user.uid, claims);

            // Create persistent user profile
            await db.collection("users").doc(user.uid).set({
                uid: user.uid,
                email: user.email,
                displayName: grant.displayName || user.displayName || "Team Member",
                role: grant.role || "technical",
                isAdmin: grant.isAdmin || false,
                godMode: grant.godMode || false,
                status: "active",
                grantedBy: grant.grantedBy || "system",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Mark grant as claimed
            await grantDoc.ref.update({ 
                status: "claimed", 
                claimedAt: admin.firestore.FieldValue.serverTimestamp(), 
                uid: user.uid 
            });
            
            console.log(`[IAM] Successfully provisioned admin access for ${user.email}`);
            
            // Return custom claims to be included in the initial ID token
            return {
                customClaims: claims
            };
        }
        return; // Ensure path returns when no grant exists
    } catch (err) {
        console.error("[IAM] Blocking function failure:", err);
        return; // Return without modification on failure
    }
});

export const setAdminRole = onCall({ enforceAppCheck: true }, async (request) => {
    const caller = request.auth;
    if (!caller?.token?.godMode) {
        throw new HttpsError("permission-denied", "Only God-Mode accounts can promote users.");
    }

    const { email, role, isAdmin, godMode: grantGodMode } = request.data as {
        email: string; role: string; isAdmin: boolean; godMode: boolean;
    };

    if (!email) throw new HttpsError("invalid-argument", "Email is required.");

    let uid: string;
    try {
        const existing = await admin.auth().getUserByEmail(email);
        uid = existing.uid;
        await admin.auth().setCustomUserClaims(uid, { admin: isAdmin, role, godMode: grantGodMode ?? false });
        await db.collection("users").doc(uid).set({
            isAdmin, role, godMode: grantGodMode ?? false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    } catch {
        const emailKey = email.replace(/\./g, "_").replace(/@/g, "_");
        await db.collection("pending_admin_grants").doc(emailKey).set({
            email, role, isAdmin, godMode: grantGodMode ?? false,
            displayName: "Team Member",
            grantedBy: caller.token.email || caller.uid,
            grantedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "pending_first_login",
        });
    }

    return { success: true, message: `Access granted to ${email} as ${role}.` };
});

// Trigger 1: SLA Monitoring CRON
export const evaluateSLACron = onSchedule("every 4 hours", async (event) => {
    const now = admin.firestore.Timestamp.now();
    const fourHoursAgo = new Date(now.toDate().getTime() - 4 * 60 * 60 * 1000);

    const staleTickets = await db.collection("tickets")
        .where("status", "!=", "RESOLVED")
        .where("priority", "==", "EMERGENCY")
        .where("createdAt", "<", admin.firestore.Timestamp.fromDate(fourHoursAgo))
        .get();

    const batch = db.batch();
    staleTickets.forEach((doc: any) => {
        const ticketData = doc.data();
        batch.update(doc.ref, { slaViolated: true, escalationLevel: 1, penaltyApplied: true, lastEscalatedAt: now });

        const tierDist = { "BASIC": 50, "PREMIUM": 100, "ELITE": 250 };
        const contractTier: keyof typeof tierDist = ticketData.contractTier || "BASIC";
        const penaltyAmount = -(tierDist[contractTier] || 50);

        db.collection("invoices").add({
            ownerId: ticketData.ownerId,
            amount: penaltyAmount,
            type: "SLA_CREDIT_PENALTY",
            status: "CREDITED",
            description: `Scaled SLA Breach Credit (${contractTier})`
        });
    });
    await batch.commit();
});

// Trigger 2: Ticket Creation Assignment
export const onTicketCreated = onDocumentCreated("tickets/{ticketId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ticket = snap.data();
    const propertyLat = ticket.locationLat || 25.2048;
    const propertyLon = ticket.locationLon || 55.2708;

    const urgentKeywords = ["flood", "fire", "smoke", "burst", "leak", "danger"];
    const text = (ticket.description || "").toLowerCase();
    let priority = urgentKeywords.some(key => text.includes(key)) ? "EMERGENCY" : "OPEN";

    let detectedTrade = "GENERAL";
    const tradeKeywords: Record<string, string[]> = {
        PLUMBING: ["leak", "burst", "pipe", "toilet", "tap", "flood"],
        HVAC: ["ac", "air conditioning", "cooling", "heat", "fan"],
        ELECTRICAL: ["power", "light", "switch", "short", "wire"]
    };
    Object.entries(tradeKeywords).forEach(([trade, keywords]) => {
        if (keywords.some(key => text.includes(key))) detectedTrade = trade;
    });

    if (ticket.propertyType === "Institutional" || ticket.propertyType === "School") priority = "EMERGENCY";
    if (ticket.propertyType === "HOTEL" && ticket.source === "guestRoom") priority = "EMERGENCY";

    await snap.ref.update({ priority, trade: detectedTrade, intelligenceFlag: "V1.4_ACTIVE" });
    
    const techs = await db.collection("technicians").where("active", "==", true).where("status", "==", "AVAILABLE").get();
    let bestTech: any = null;
    let minDistance = Infinity;

    techs.forEach((doc: any) => {
        const techData = doc.data();
        if (techData.lat && techData.lng && (techData.trade || "").toUpperCase().includes(detectedTrade)) {
            const dist = calculateDistance(propertyLat, propertyLon, techData.lat, techData.lng);
            if (dist < minDistance) { minDistance = dist; bestTech = { id: doc.id, ...techData }; }
        }
    });

    if (bestTech) {
        await snap.ref.update({ assignedTechnician: bestTech.id, status: "ASSIGNED", dispatchDistanceKm: minDistance });
    }
});

// Trigger 3: Manual Payment Handshake
export const createPaymentIntent = onCall({ enforceAppCheck: true }, async (request) => {
    const { amount, currency, ownerId, propertyId, method } = request.data;
    
    const allowed = ['CASH', 'CHEQUE', 'BANK_TRANSFER'];
    if (!method || !allowed.includes(method)) {
        throw new HttpsError("invalid-argument", `Invalid payment method. Allowed methods: ${allowed.join(', ')}`);
    }

    if (method === 'BANK_TRANSFER') {
        throw new HttpsError("failed-precondition", "Bank Transfer is not available yet. Please use Cash or Cheque.");
    }

    if (!amount || !ownerId || !propertyId) {
        throw new HttpsError("invalid-argument", "Missing protocol parameters (amount, ownerId, propertyId).");
    }

    let paymentManifest: any = { method };
    if (method === 'CHEQUE') {
        paymentManifest = { ...paymentManifest, payableTo: "BIN-GROUP MANAGEMENT LLC", dropOffLocation: "Office 101, Business Tower, Dubai", verificationNote: "Activation after clearance." };
    } else if (method === 'CASH') {
        paymentManifest = { ...paymentManifest, officeLocation: "Office 101, Business Tower, Dubai", contactInstruction: "Call +971-50-000-0000", verificationNote: "Instant activation after receipt." };
    }

    const paymentId = `pmt_${admin.firestore.Timestamp.now().toMillis()}`;
    const contractRef = await db.collection("contracts").add({
        paymentId, ownerId, propertyId, status: "AWAITING_VERIFICATION", paymentVerified: false,
        amount, currency: currency || "AED", provider: method, paymentManifest,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { paymentId, paymentManifest, contractId: contractRef.id };
});

export const adminVerifyPayment = onCall({ enforceAppCheck: true }, async (request) => {
    const caller = request.auth;
    if (!caller?.token?.admin) throw new HttpsError("permission-denied", "Admin-only protocol.");

    const { contractId, method, referenceId, amountReceived } = request.data;
    const contractRef = db.collection("contracts").doc(contractId);
    
    await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(contractRef);
        if (!snap.exists) throw new Error("CONTRACT_NOT_FOUND");
        
        const contractData = snap.data();
        const ownerId = contractData?.ownerId;

        // 1. Update Contract Status
        transaction.update(contractRef, {
            paymentVerified: true, status: "AWAITING_ACTIVATION", settledMethod: method,
            settledReferenceId: referenceId, verifiedBy: caller.uid, verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            amountReceived: amountReceived || snap.data()?.amount
        });

        // 2. Unlock Owner Profile
        if (ownerId) {
            const userRef = db.collection("users").doc(ownerId);
            transaction.update(userRef, { 
                status: 'active',
                activatedAt: admin.firestore.FieldValue.serverTimestamp(),
                activatedBy: caller.uid
            });
        }
    });

    return { success: true };
});

export const elevateUserToAdmin_Secure = onCall({ enforceAppCheck: true }, async (request) => {
    const caller = request.auth;
    // Strictly requires godMode to use this bootstrap tool
    if (!caller?.token?.godMode) {
        throw new HttpsError("permission-denied", "Sovereign protocol violation: Unauthorized elevation attempt.");
    }

    const { email } = request.data as { email: string };
    if (!email) throw new HttpsError("invalid-argument", "Target email required.");

    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true, godMode: true, role: 'admin' });
        await db.collection("users").doc(user.uid).set({ isAdmin: true, godMode: true, role: 'admin', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return { success: true };
    } catch (err: any) { throw new HttpsError("internal", err.message); }
});

export const onMaintenanceTicketCreated = onDocumentCreated("maintenanceTickets/{ticketId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ticket = snap.data();
    const text = ((ticket.description || "") + (ticket.issueType || "")).toLowerCase();
    const priority = ["flood", "fire", "smoke", "burst", "leak", "danger", "sos"].some(key => text.includes(key)) ? "EMERGENCY" : (ticket.priority || "MEDIUM");
    await snap.ref.update({ priority, intelligenceFlag: "ACTIVE", createdAt: admin.firestore.FieldValue.serverTimestamp() });
});

export const onIntakeCreated = onDocumentCreated("intake_submissions/{intakeId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    
    await snap.ref.update({ 
        aiAssessment: { score: 74, analyzedAt: admin.firestore.FieldValue.serverTimestamp() },
        status: 'ANALYZED', updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
});
