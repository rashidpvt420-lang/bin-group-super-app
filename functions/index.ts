import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import PDFDocument from "pdfkit";
import { getStorage } from "firebase-admin/storage";
import { VertexAI } from '@google-cloud/vertexai';
import { onRequest } from "firebase-functions/v2/https";

admin.initializeApp();
const db = admin.firestore();

// ── UTILITIES ──────────────────────────────────────────────────────────────
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
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
    // ── STAGE 1: WAIT FOR AI TRIAGE ──
    const maxRetries = 10; // Wait up to 30 seconds
    let triageData: any = null;
    let retries = 0;

    while (retries < maxRetries) {
        const latestSnap = await snap.ref.get();
        const data = latestSnap.data();
        if (data?.triageResult) {
            try {
                // The extension returns text, we parse it if it's JSON
                triageData = typeof data.triageResult === 'string' 
                    ? JSON.parse(data.triageResult.replace(/```json|```/g, '').trim()) 
                    : data.triageResult;
                console.log(`[Triage] AI Insights Received:`, triageData);
                break;
            } catch (e) {
                console.error("[Triage] JSON Parse Error:", e);
                triageData = { trade: "GENERAL", priority: data.priority || "OPEN" };
                break;
            }
        }
        console.log(`[Triage] Waiting for AI Extension (Attempt ${retries + 1})...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        retries++;
    }

    const detectedTrade = (triageData?.trade || "GENERAL").toUpperCase();
    const priority = (triageData?.priority || "OPEN").toUpperCase();

    await snap.ref.update({ 
        priority, 
        trade: detectedTrade, 
        intelligenceFlag: "V1.5_GEMINI_ACTIVE",
        triageStatus: triageData ? "COMPLETED" : "FAILED"
    });
    // ── STAGE 2: GEOGRAPHIC DISPATCH ──
    const propertyLat = ticket.locationLat || 25.2048;
    const propertyLon = ticket.locationLon || 55.2708;

    
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
        const assignmentUpdate = {
            assignedTechnician: bestTech.id,
            status: "ASSIGNED",
            dispatchDistanceKm: parseFloat(minDistance.toFixed(2)),
            assignedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await snap.ref.update(assignmentUpdate);

        // ── PUSH NOTIFICATION ──
        if (bestTech.fcmToken) {
            const message = {
                notification: {
                    title: `New ${priority} Ticket Assigned!`,
                    body: `${detectedTrade} issue at ${ticket.unit || 'Property'}. Distance: ${minDistance.toFixed(1)}km`
                },
                data: {
                    ticketId: event.params.ticketId,
                    type: "NEW_ASSIGNMENT",
                    priority: priority
                },
                token: bestTech.fcmToken
            };
            try {
                await admin.messaging().send(message);
                console.log(`[Push] Notification sent to Tech: ${bestTech.id}`);
            } catch (err) {
                console.error(`[Push] FCM Error for tech ${bestTech.id}:`, err);
            }
        }
    } else {
        console.log(`[Dispatch] No available technicians for ${detectedTrade} within range.`);
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

// Trigger 4: Turnover Engine ──> Automatic Work Order Generation
export const onTurnoverQuoteApproved = onDocumentUpdated("turnover-quotes/{quoteId}", async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();

    // Only progress if status changed to APPROVED
    if (before?.status === "APPROVED" || after?.status !== "APPROVED") return;

    console.log(`[Turnover] Quote ${event.params.quoteId} approved. Transitioning to Work Orders...`);

    const ownerId = after?.ownerId;
    const propertyId = after?.propertyId;
    const unitId = after?.unitId;
    
    // Define restoration items to generate tickets for
    const tasks = [
        { key: "paintingCost", label: "Painting & Wall Restoration", trade: "DECOR" },
        { key: "deepCleaningCost", label: "Deep Cleaning & Sterilization", trade: "CLEANING" }
    ];

    const batch = db.batch();
    
    for (const task of tasks) {
        if (after?.[task.key] > 0) {
            const ticketRef = db.collection("tickets").doc();
            batch.set(ticketRef, {
                ownerId,
                propertyId,
                unit: unitId,
                description: `Turnover Restoration: ${task.label}. Quote Reference: ${event.params.quoteId}`,
                trade: task.trade,
                priority: "OPEN",
                status: "PENDING",
                source: "TURNOVER_ENGINE",
                costAllocation: after[task.key],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
    }

    await batch.commit();
    console.log(`[Turnover] Successfully generated work orders for quote: ${event.params.quoteId}`);

    // STAGE 2: GENERATE THE TENDER PDF
    try {
        const bucket = getStorage().bucket();
        const filePath = `turnovers/${event.params.quoteId}/tender_v1.pdf`;
        const file = bucket.file(filePath);

        const docStream = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];
        
        docStream.on('data', buffers.push.bind(buffers));
        
        await new Promise<void>((resolve, reject) => {
            docStream.on('end', () => resolve());
            docStream.on('error', (err) => reject(err));

            // Header - Branding
            docStream.fontSize(24).fillColor("#C6A75E").text("BIN-GROUP MANAGEMENT", { align: "right" });
            docStream.fontSize(10).fillColor("#777").text("Corporate Offices: Office 101, Business Tower, Dubai, UAE", { align: "right" });
            docStream.moveDown(2);

            // Title
            docStream.fontSize(18).fillColor("#000").text("OFFICIAL TURNOVER TENDER", { underline: true });
            docStream.moveDown();

            // Meta Data
            docStream.fontSize(12).text(`Tender Reference: ${event.params.quoteId}`);
            docStream.text(`Unit Reference: ${unitId}`);
            docStream.text(`Approval Date: ${new Date().toLocaleDateString('en-AE')}`);
            docStream.moveDown();
            
            docStream.moveTo(50, docStream.y).lineTo(550, docStream.y).stroke();
            docStream.moveDown();

            // Services Description
            docStream.font('Helvetica-Bold').fontSize(14).text("Itemized Restoration Services");
            docStream.font('Helvetica').moveDown(0.5);
            
            const services = [
                { name: "Painting & Wall Restoration", cost: after?.paintingCost },
                { name: "Deep Cleaning & Disinfection", cost: after?.deepCleaningCost }
            ];

            services.forEach(s => {
                if (s.cost > 0) {
                    docStream.fontSize(12).text(`${s.name}:`, { continued: true }).text(` AED ${s.cost.toLocaleString()}`, { align: "right" });
                }
            });

            docStream.moveDown();
            docStream.fontSize(14).fillColor("#C6A75E").text("Total Tender Value:", { continued: true }).text(` AED ${after?.finalPrice?.toLocaleString()}`, { align: "right" });
            
            docStream.moveDown(4);
            docStream.font('Helvetica-Oblique').fontSize(10).fillColor("#999").text("This tender document is electronically generated and sanctioned upon digital owner approval. No physical signature is required for UAE compliance under the bin-group protocol.", { align: "center" });

            docStream.end();
        });

        const pdfBuffer = Buffer.concat(buffers);
        await file.save(pdfBuffer, { contentType: 'application/pdf' });

        // Generate Signed URL valid for 1 year
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '03-01-2027'
        });

        await event.data?.after.ref.update({
            tenderPdfUrl: url,
            tenderPath: filePath,
            docGenStatus: "COMPLETED",
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            financialStatus: "INVOICED"
        });

        // STAGE 3: FINANCIAL HANDSHAKE
        const invoiceId = `INV-${event.params.quoteId}`;
        const transactionId = `TX-${event.params.quoteId}`;
        
        const finalPrice = after?.finalPrice || 0;
        const today = new Date().toISOString().split('T')[0];

        const financialBatch = db.batch();

        // 1. Create Invoice
        const invoiceRef = db.collection("invoices").doc(invoiceId);
        financialBatch.set(invoiceRef, {
            ownerId,
            propertyId,
            unit: unitId,
            amount: finalPrice,
            currency: "AED",
            status: "DUE",
            type: "TURNOVER_RESTORATION",
            relatedQuote: event.params.quoteId,
            tenderPdfUrl: url,
            dueDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)), // 15 day net
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 2. Add to Ledger (Transactions collection)
        const txRef = db.collection("transactions").doc(transactionId);
        financialBatch.set(txRef, {
            ownerId,
            propertyId,
            amount: finalPrice,
            type: "debit",
            status: "PENDING",
            category: "turnover",
            description: `Turnover Restoration for Unit ${unitId}`,
            date: today,
            relatedInvoice: invoiceId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await financialBatch.commit();
        console.log(`[Turnover] Financial Handshake completed for ${event.params.quoteId}. Ledger updated.`);

    } catch (pdfErr) {
        console.error("[Turnover] Handshake Failure:", pdfErr);
        await event.data?.after.ref.update({ docGenStatus: "FAILED" });
    }
});

// Trigger 5: Property Onboarding ──> Sovereign Audit Vault
export const onPropertyOnboarded = onDocumentCreated("properties/{propertyId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const property = snap.data();

    console.log(`[Onboarding] New property detected: ${event.params.propertyId}. Initiating Sovereign Audit...`);

    try {
        const bucket = getStorage().bucket();
        const filePath = `property-audits/${event.params.propertyId}/sovereign_audit_v1.pdf`;
        const file = bucket.file(filePath);

        const docStream = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];
        docStream.on('data', buffers.push.bind(buffers));

        const sqft = property.builtUpAreaSqFt || property.sqft || 1500;
        const baseOpEx = sqft * 0.12;

        await new Promise<void>((resolve, reject) => {
            docStream.on('end', () => resolve());
            docStream.on('error', (err) => reject(err));

            // Header - Sovereign Audit Branding
            docStream.rect(0, 0, 612, 100).fill("#0B0B0C");
            docStream.fontSize(22).fillColor("#C6A75E").font('Helvetica-Bold').text("BIN-GENESIS™ SOVEREIGN AUDIT", 50, 40);
            docStream.fontSize(10).fillColor("#FFF").font('Helvetica').text(`ASSET ID: ${event.params.propertyId} | TYPE: ${property.propertyType || "RESIDENTIAL"}`, 50, 70);
            
            docStream.moveDown(4).fillColor("#000");

            // Section 1: Asset Lifecycle Forecast
            docStream.fontSize(16).font('Helvetica-Bold').text("5-YEAR ASSET LIFECYCLE FORECAST");
            docStream.moveTo(50, docStream.y + 5).lineTo(550, docStream.y + 5).stroke();
            docStream.moveDown(2);

            for (let i = 0; i < 5; i++) {
                const year = 2026 + i;
                const opEx = (baseOpEx * (1 + (i * 0.05))).toFixed(0);
                const healthScore = (98 - (i * 1.5)).toFixed(1);
                docStream.fontSize(12).font('Helvetica-Bold').text(`Year ${year}:`, { continued: true })
                         .font('Helvetica').text(` Est. OpEx: AED ${Number(opEx).toLocaleString()} | Integrity Score: ${healthScore}%`);
                docStream.moveDown(0.5);
            }

            docStream.moveDown(2);

            // Section 2: Compliance Matrix
            docStream.fontSize(16).font('Helvetica-Bold').text("INSTITUTIONAL COMPLIANCE MATRIX");
            docStream.moveDown();
            
            const requirements = [
                { std: 'Civil Defense (DCD)', req: 'Mandatory 24/7 Monitoring' },
                { std: 'SIRA (Security)', req: 'CCTV & Entry Logic' },
                { std: 'Municipality', req: 'Sovereign Health Reporting' }
            ];

            requirements.forEach(r => {
                docStream.fontSize(11).font('Helvetica-Bold').text(`${r.std}: `, { continued: true })
                         .font('Helvetica').text(r.req);
            });

            // Footer
            docStream.moveDown(8);
            docStream.fontSize(8).fillColor("#999").text("CONFIDENTIAL: This audit is an institutional sovereign document produced by BIN-GENESIS™ Analytics Engine. Access restricted to BIN-GROUP Management and verified Asset Owners.", { align: "center" });

            docStream.end();
        });

        const pdfBuffer = Buffer.concat(buffers);
        await file.save(pdfBuffer, { contentType: 'application/pdf' });
        console.log(`[Onboarding] Sovereign Audit generated for ${event.params.propertyId}`);
    } catch (err) {
        console.error(`[Onboarding] Fault in Sovereign Audit for ${event.params.propertyId}:`, err);
    }
});

/**
 * Trigger 6: Mission Guidance Orchestrator (Vertex AI)
 */
export const getMissionGuidance = onCall({ cors: true, memory: "512MiB" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Sovereign access required.");
    }

    const { context } = request.data;
    if (!context || !context.propertyId) {
        throw new HttpsError("invalid-argument", "Historical context missing.");
    }

    console.log(`[AI-GENESIS] Generating mission guidance for Asset ${context.propertyId}...`);

    try {
        const project = process.env.GCLOUD_PROJECT || 'bin-group-super-app';
        const location = 'us-central1';
        const vertexAI = new VertexAI({ project, location });
        const generativeModel = vertexAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: { responseMimeType: 'application/json' }
        });

        const prompt = `
            Analyze this property historical context and return a JSON object following the MissionGuidancePayload schema.
            Context: ${JSON.stringify(context)}
            
            Schema Requirements:
            {
              "assetResilience": { "healthIndex": number, "predictedDecay12Months": number, "criticalFailureWindows": [...] },
              "financialForecast": { "expectedNetROI": number, "quarterlyProjections": [...], "riskFactors": [...], "guidance": string },
              "alerts": [...]
            }
            
            Focus on UAE real estate dynamics, HVAC summer surge risks, and institutional A-grade asset maintenance standards.
        `;

        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const text = response.candidates?.[0].content.parts[0].text || "{}";
        
        return JSON.parse(text);
    } catch (error: any) {
        console.error("[AI-GENESIS] Vertex AI Failure:", error);
        throw new HttpsError("internal", "AI Orchestration failed. Reverting to local heuristic models.");
    }
});

/**
 * Trigger 7: Proactive Maintenance Orchestrator (CRON)
 * Periodically scans all assets, runs AI analytics, and generates preventive work orders.
 */
export const proactiveMaintenanceCron = onSchedule("every 48 hours", async (event) => {
    console.log("[PROACTIVE-MAINT] Initiating global asset health scan...");

    try {
        const propertiesSnap = await db.collection("properties").get();
        const ticketsRef = db.collection("tickets");

        for (const propDoc of propertiesSnap.docs) {
            const property = propDoc.data();
            const propertyId = propDoc.id;

            // 1. Check for existing open or proposed preventive tickets to avoid duplication
            const existingPreventive = await ticketsRef
                .where("propertyId", "==", propertyId)
                .where("status", "in", ["OPEN", "ASSIGNED", "PREVENTIVE_PROPOSAL"])
                .where("type", "==", "PREVENTIVE")
                .limit(1)
                .get();

            if (!existingPreventive.empty) continue;

            // 2. Fetch context (Briefly aggregate for the CRON)
            const ticketsSnap = await ticketsRef.where("propertyId", "==", propertyId).limit(20).get();
            const workOrderHistory = ticketsSnap.docs.map(d => ({
                ticketId: d.id,
                createdAt: d.data().createdAt?.toDate() || new Date(),
                category: d.data().trade || 'GENERAL',
                cost: d.data().costAllocation || 0,
                trade: d.data().trade || 'GENERAL',
                priority: d.data().priority || 'OPEN'
            }));

            // 3. Run AI Logic (Heuristic for CRON to manage cost/latency)
            if (workOrderHistory.length > 5 || (property.healthIndex && property.healthIndex < 85)) {
                console.log(`[PROACTIVE-MAINT] Asset ${propertyId} requires intervention. Generating proposal...`);

                await ticketsRef.add({
                    propertyId,
                    ownerId: property.ownerId,
                    title: `[PREVENTIVE] AI-Scheduled Maintenance: ${property.area}`,
                    description: `Proactive maintenance proposal generated by BIN-GENESIS™ based on integrity decay (Health Index: ${property.healthIndex || 'N/A'}). Recommended for risk mitigation of critical failure vectors.`,
                    type: "PREVENTIVE",
                    status: "PREVENTIVE_PROPOSAL",
                    priority: "OPEN",
                    trade: "GENERAL", 
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    isAIGenerated: true,
                    integrityImpactScore: 15,
                    suggestedBudget: 450 // Basic preventive call-out estimate
                });

                // NOTE: Here you would typically trigger a notification to the owner
                // via db.collection("notifications").add({...})
            }
        }
    } catch (err) {
        console.error("[PROACTIVE-MAINT] CRON Execution Failure:", err);
    }
});

/**
 * Trigger 8: Sovereign Integrity Audit Generator
 * Compiles AI predictive insights into a stylized, official PDF report.
 */
export const generateIntegrityAudit = onCall({ cors: true, memory: "512MiB" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Sovereign access required.");
    }

    const { intel, propertyName } = request.data as { intel: any, propertyName: string };
    if (!intel || !intel.propertyId) {
        throw new HttpsError("invalid-argument", "Intelligence payload missing.");
    }

    console.log(`[DOC-GEN] Generating Integrity Audit for Asset ${intel.propertyId}...`);

    try {
        const bucket = getStorage().bucket();
        const timestamp = Date.now();
        const filePath = `property-audits/${intel.propertyId}/integrity_audit_${timestamp}.pdf`;
        const file = bucket.file(filePath);

        const docStream = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];
        docStream.on('data', buffers.push.bind(buffers));

        await new Promise<void>((resolve, reject) => {
            docStream.on('end', () => resolve());
            docStream.on('error', (err) => reject(err));

            // --- PAGE 1: COVER ---
            // Institutional Border
            docStream.rect(20, 20, 572, 752).lineWidth(2).strokeColor("#C6A75E").stroke();
            docStream.rect(25, 25, 562, 742).lineWidth(0.5).strokeColor("#C6A75E").stroke();

            // Dark Background Header
            docStream.rect(25, 25, 562, 175).fill("#0B0B0C");
            
            // BIN-GROUP Seal / Branding
            docStream.fontSize(30).fillColor("#C6A75E").font('Helvetica-Bold').text("BIN-GENESIS™", 50, 65);
            docStream.fontSize(14).fillColor("#E6C77A").font('Helvetica').text("SOVEREIGN INTEGRITY AUDIT", 50, 105);
            
            // Decorative Seal Badge (Right side)
            docStream.circle(500, 110, 45).lineWidth(3).strokeColor("#E6C77A").stroke();
            docStream.fontSize(10).fillColor("#E6C77A").font('Helvetica-Bold').text("VERIFIED", 480, 100);
            docStream.text("ASSET", 485, 112);
            docStream.fontSize(8).text("SOVEREIGN", 478, 124);

            docStream.fontSize(10).fillColor("#FFF").font('Helvetica').text(`ASSET ID: ${intel.propertyId}`, 50, 135);
            docStream.text(`GENERATED: ${new Date().toLocaleDateString('en-AE')}`, 50, 150);
            docStream.text(`LOCATION: ${propertyName || 'UAE PORTFOLIO ASSET'}`, 50, 165);

            docStream.moveDown(10).fillColor("#000");

            // --- SECTION 1: ASSET RESILIENCE ---
            docStream.fontSize(18).font('Helvetica-Bold').text("1. ASSET RESILIENCE & INTEGRITY DECAY");
            docStream.moveTo(50, docStream.y + 5).lineTo(550, docStream.y + 5).lineWidth(1).strokeColor("#EEE").stroke();
            docStream.moveDown(2);

            // Health Bar Chart
            const health = intel.assetResilience.healthIndex;
            docStream.fontSize(12).font('Helvetica-Bold').fillColor("#000").text(`Current Asset Health: ${health}%`);
            docStream.rect(50, docStream.y + 5, 400, 15).fill("#F3F4F6");
            docStream.rect(50, docStream.y + 5, (health / 100) * 400, 15).fill("#C6A75E");
            docStream.moveDown(2);

            // Decay Projection
            const decay = intel.assetResilience.predictedDecay12Months;
            docStream.fontSize(11).font('Helvetica-Bold').text(`12-Month Integrity Decay Projection: `, { continued: true })
                     .fillColor("#EF4444").text(`-${decay}%`).fillColor("#000");
            docStream.moveDown(1.5);

            docStream.fontSize(14).font('Helvetica-Bold').text("Critical Failure Boundary Analysis:");
            docStream.moveDown(0.5);
            intel.assetResilience.criticalFailureWindows.forEach((window: any) => {
                docStream.rect(50, docStream.y, 500, 60).lineWidth(0.5).strokeColor("#EEE").stroke();
                docStream.fontSize(11).font('Helvetica-Bold').text(`  Vector: ${window.assetCategory.toUpperCase()}`, 60, docStream.y + 10);
                docStream.fontSize(10).font('Helvetica').text(`  Probability: ${(window.probability * 100).toFixed(0)}% | Estimated Window: ${new Date(window.predictedWindow.start).toLocaleDateString()} - ${new Date(window.predictedWindow.end).toLocaleDateString()}`, 60, docStream.y + 5);
                docStream.fontSize(9).font('Helvetica-Oblique').fillColor("#4B5563").text(`  Guidance: ${window.guidance}`, 60, docStream.y + 5);
                docStream.moveDown(2).fillColor("#000");
            });

            // --- SECTION 2: FINANCIAL YIELD FORECAST ---
            docStream.addPage();
            // Institutional Border (Page 2)
            docStream.rect(20, 20, 572, 752).lineWidth(2).strokeColor("#C6A75E").stroke();

            docStream.fontSize(18).font('Helvetica-Bold').text("2. FINANCIAL YIELD FORECAST", 50, 50);
            docStream.moveTo(50, docStream.y + 5).lineTo(550, docStream.y + 5).lineWidth(1).strokeColor("#EEE").stroke();
            docStream.moveDown(2);

            docStream.fontSize(12).font('Helvetica-Bold').text(`Expected Net ROI (Annualized Target): `, { continued: true })
                     .font('Helvetica').fillColor("#22C55E").text(`${intel.financialForecast.expectedNetROI}%`).fillColor("#000");
            docStream.moveDown(2);

            // Quarterly Data Grid
            docStream.fontSize(14).font('Helvetica-Bold').text("Institutional Projections Grid (AED)");
            docStream.moveDown(0.5);
            
            const startY = docStream.y;
            docStream.rect(50, startY, 500, 20).fill("#F9FAFB");
            docStream.fontSize(10).fillColor("#6B7280").text("QUARTER", 60, startY + 5);
            docStream.text("INCOME", 160, startY + 5);
            docStream.text("EXPENSES", 260, startY + 5);
            docStream.text("NET POSITION", 380, startY + 5);
            
            docStream.fillColor("#000").text("", 50, startY + 25);
            intel.financialForecast.quarterlyProjections.forEach((q: any, i: number) => {
                const yPos = docStream.y;
                if (i % 2 === 1) docStream.rect(50, yPos - 2, 500, 20).fill("#FDFDFD");
                docStream.fillColor("#000").font('Helvetica-Bold').text(q.quarter, 60, yPos);
                docStream.font('Helvetica').text(q.projectedIncome.toLocaleString(), 160, yPos);
                docStream.text(q.projectedExpenses.toLocaleString(), 260, yPos);
                docStream.font('Helvetica-Bold').fillColor("#22C55E").text(`+${q.projectedNet.toLocaleString()}`, 380, yPos);
                docStream.moveDown(1).fillColor("#000");
            });

            docStream.moveDown(2);
            docStream.rect(50, docStream.y, 500, 60).fill("#FFF8E1").strokeColor("#FFD54F").lineWidth(0.5).stroke();
            docStream.fontSize(11).font('Helvetica-Bold').text("Strategic Asset Guidance:", 60, docStream.y + 10);
            docStream.font('Helvetica-Oblique').fontSize(10).text(`"${intel.financialForecast.guidance}"`, 60, docStream.y + 5);
            docStream.moveDown(3);

            // --- SECTION 3: ACTIVE SOVEREIGN ALERTS ---
            if (intel.alerts && intel.alerts.length > 0) {
                docStream.fontSize(18).font('Helvetica-Bold').text("3. ACTIVE SOVEREIGN PROTOCOLS", 50, docStream.y);
                docStream.moveTo(50, docStream.y + 5).lineTo(550, docStream.y + 5).lineWidth(1).strokeColor("#EEE").stroke();
                docStream.moveDown(1.5);

                intel.alerts.forEach((alert: any) => {
                    const color = alert.type === 'CRITICAL' ? "#EF4444" : "#F59E0B";
                    const bgColor = alert.type === 'CRITICAL' ? "#FEF2F2" : "#FFFBEB";
                    
                    docStream.rect(50, docStream.y, 500, 50).fill(bgColor).strokeColor(color).lineWidth(1).stroke();
                    docStream.fontSize(11).fillColor(color).font('Helvetica-Bold').text(`  [${alert.type}] ${alert.message}`, 60, docStream.y + 12);
                    docStream.fontSize(9).fillColor("#374151").font('Helvetica').text(`  Required Action: ${alert.recommendation}`, 60, docStream.y + 5);
                    docStream.moveDown(3).fillColor("#000");
                });
            }

            // --- FOOTER ---
            const range = docStream.bufferedPageRange();
            for (let i = range.start; i < range.start + range.count; i++) {
                docStream.switchToPage(i);
                docStream.fontSize(8).fillColor("#999").text(
                    "This document is an institutional sovereign audit generated by the BIN-GENESIS™ Predictive Engine. All projections are AI-informed probabilistic models for strategic guidance only.",
                    50, 750, { align: "center", width: 500 }
                );
                docStream.text(`Page ${i + 1} of ${range.count}`, 50, 770, { align: "center" });
            }

            docStream.end();
        });

        const pdfBuffer = Buffer.concat(buffers);
        await file.save(pdfBuffer, { contentType: 'application/pdf' });

        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year
        });

        return { url, filePath };
    } catch (err: any) {
        console.error("[DOC-GEN] Audit Generation Failure:", err);
        throw new HttpsError("internal", `Audit Generation Failed: ${err.message}`);
    }
});

/**
 * Trigger 9: Create AI Maintenance Ticket (Manual Sanction)
 * Direct creation of preventive tickets from the Mission Guidance Feed.
 */
export const createAiMaintenanceTicket = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sovereign access required.");
    
    const { propertyId, title, description, trade, priority } = request.data;
    if (!propertyId) throw new HttpsError("invalid-argument", "Property ID required.");

    const ticketRef = await db.collection("tickets").add({
        propertyId,
        ownerId: request.auth.uid,
        title,
        description,
        type: "PREVENTIVE",
        status: "OPEN", // Manually sanctioned tickets start as OPEN
        priority: priority || "OPEN",
        trade: trade || "GENERAL",
        isAIGenerated: true,
        sanctionedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { ticketId: ticketRef.id };
});

/**
 * Trigger 10: Approve Maintenance Proposal
 * Transitions a PREVENTIVE_PROPOSAL to OPEN status, triggering dispatch.
 */
export const approveMaintenanceProposal = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sovereign access required.");

    const { ticketId } = request.data;
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");

    const ticketRef = db.collection("tickets").doc(ticketId);
    const snap = await ticketRef.get();

    if (!snap.exists) throw new HttpsError("not-found", "Proposal not found.");
    if (snap.data()?.status !== "PREVENTIVE_PROPOSAL") {
        throw new HttpsError("failed-precondition", "Document is not a pending proposal.");
    }

    await ticketRef.update({
        status: "OPEN",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: request.auth.uid
    });

    return { success: true };
});

interface LiquidityCache {
    availableFloat: number;
    lastUpdated: admin.firestore.Timestamp;
}

/**
 * Trigger 11: Sovereign System Intelligence (Admin Aggregator)
 */
export const getSovereignSystemStats = onCall({ cors: true }, async (request) => {
    // Only allow Admin/Sovereign access
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.godMode)) {
        throw new HttpsError("permission-denied", "Sovereign Command access required.");
    }

    try {
        const ticketsRef = db.collection("tickets");
        const propertiesRef = db.collection("properties");
        const cacheRef = db.collection("system_cache").doc("liquidity_summary");

        // 1. AI Protocol Adoption (Proposal vs Sanctioned)
        const aiTicketsSnap = await ticketsRef.where("isAIGenerated", "==", true).get();
        let proposedCount = 0;
        let sanctionedCount = 0;
        let declinedCount = 0;
        let totalProjectedBudget = 0;

        aiTicketsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.status === "PREVENTIVE_PROPOSAL") {
                proposedCount++;
                totalProjectedBudget += (data.suggestedBudget || 0);
            } else if (data.status === "OPEN" || data.status === "ASSIGNED" || data.status === "COMPLETED") {
                sanctionedCount++;
            } else if (data.status === "DECLINED_BY_OWNER") {
                declinedCount++;
            }
        });

        // 2. Asset Resilience Heatmap (Risk Zone Monitoring)
        const highRiskPropertiesSnap = await propertiesRef
            .where("healthIndex", "<", 80)
            .orderBy("healthIndex", "asc")
            .limit(10)
            .get();

        const dangerZoneAssets = highRiskPropertiesSnap.docs.map(doc => ({
            id: doc.id,
            area: doc.data().area,
            healthIndex: doc.data().healthIndex,
            ownerId: doc.data().ownerId
        }));

        // 3. Operational Latency (Triage Velocity)
        const completedAiTickets = aiTicketsSnap.docs.filter(d => 
            d.data().status === "COMPLETED" && d.data().approvedAt && d.data().assignedAt
        );
        
        let totalTriageMinutes = 0;
        completedAiTickets.forEach(d => {
            const approved = d.data().approvedAt.toDate();
            const assigned = d.data().assignedAt.toDate();
            totalTriageMinutes += (assigned.getTime() - approved.getTime()) / (1000 * 60);
        });

        const avgTriageLatency = completedAiTickets.length > 0 
            ? Math.round(totalTriageMinutes / completedAiTickets.length) 
            : 0;

        // 4. Financial Liquidity (Cached Aggregation)
        let availableFloat = 45000;
        const cacheSnap = await cacheRef.get();
        if (cacheSnap.exists) {
            const cacheData = cacheSnap.data() as LiquidityCache;
            availableFloat = cacheData.availableFloat;
        }

        return {
            protocolStats: {
                proposed: proposedCount,
                sanctioned: sanctionedCount,
                declined: declinedCount,
                adoptionRate: (sanctionedCount + proposedCount) > 0 
                    ? Math.round((sanctionedCount / (sanctionedCount + proposedCount)) * 100) 
                    : 0
            },
            financials: {
                totalProjectedBudget,
                availableFloat,
                isCached: cacheSnap.exists
            },
            riskHeatmap: {
                dangerZoneAssets,
                highRiskCount: highRiskPropertiesSnap.size
            },
            performance: {
                avgTriageLatencyMinutes: avgTriageLatency,
                activeAssets: (await propertiesRef.count().get()).data().count
            }
        
        };

    } catch (err: any) {
        console.error("[SOVEREIGN-OPS] Aggregation Failure:", err);
        throw new HttpsError("internal", `System Intelligence Failure: ${err.message}`);
    }
});

/**
 * Trigger 12: Liquidity Cache Synchronizer (Transaction Hook)
 * Updates the available float in near real-time whenever a financial ledger entry is finalized.
 */
export const syncLiquidityOnTransaction = onDocumentCreated("transactions/{txId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const tx = snap.data();

    // Only sync settled/confirmed transactions
    if (tx.status !== "COMPLETED" && tx.status !== "SETTLED") return;

    const cacheRef = db.collection("system_cache").doc("liquidity_summary");
    
    await db.runTransaction(async (transaction) => {
        const cacheSnap = await transaction.get(cacheRef);
        let currentFloat = 0;
        
        if (cacheSnap.exists) {
            currentFloat = (cacheSnap.data() as LiquidityCache).availableFloat;
        } else {
            // Initial seed if cache doesn't exist (fallback to expensive count)
            const allTx = await db.collection("transactions")
                .where("status", "in", ["COMPLETED", "SETTLED"])
                .get();
            allTx.forEach(doc => {
                const d = doc.data();
                currentFloat += (d.type === "credit" ? d.amount : -d.amount);
            });
        }

        const adjustment = tx.type === "credit" ? tx.amount : -tx.amount;
        const newFloat = currentFloat + adjustment;

        transaction.set(cacheRef, {
            availableFloat: newFloat,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });

    console.log(`[LIQUIDITY-SYNC] Cache updated with TX ${event.params.txId}.`);
});

/**
 * Trigger 13: Liquidity Cache Synchronizer (Contract Verification Hook)
 * Syncs the cache when an admin verifies a manual payment contract.
 */
export const syncLiquidityOnContractVerified = onDocumentUpdated("contracts/{contractId}", async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();

    // Only trigger if payment was just verified
    if (before?.paymentVerified === true || after?.paymentVerified !== true) return;

    const amount = after?.amountReceived || after?.amount || 0;
    const cacheRef = db.collection("system_cache").doc("liquidity_summary");

    await db.runTransaction(async (transaction) => {
        const cacheSnap = await transaction.get(cacheRef);
        let currentFloat = 0;
        
        if (cacheSnap.exists) {
            currentFloat = (cacheSnap.data() as LiquidityCache).availableFloat;
        }

        transaction.set(cacheRef, {
            availableFloat: currentFloat + amount,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });

    console.log(`[LIQUIDITY-SYNC] Cache updated via Contract Verification: ${event.params.contractId}`);
});

// ── SECURITY & CROSS-ACCOUNT PROTECTION (RISC) ─────────────────────────────

/**
 * [CROSS-ACCOUNT PROTECTION] Google RISC Receiver.
 * This endpoint receives security events from Google (e.g., account compromise).
 * It must be registered in the Google Cloud Console.
 */
export const googleSecurityEvents = onRequest({ cors: true }, async (request, response) => {
    // 1. Verify the Google RISC signature (In production, use google-auth-library to verify JWT)
    // For now, we log the event and trigger a safety lockout if critical.
    const event = request.body;
    console.log("[RISC] Received Security Event:", JSON.stringify(event));

    // Handle specific event types (e.g., https://schemas.google.com/risc/v1/account-disabled)
    if (event.subject && event.subject.email) {
        try {
            const email = event.subject.email;
            const user = await admin.auth().getUserByEmail(email);
            const uid = user.uid;
            
            // Log the security incident in Firestore
            await db.collection("security_incidents").add({
                uid,
                email,
                type: event.event_type || "UNKNOWN_RISC_EVENT",
                raw: event,
                receivedAt: admin.firestore.FieldValue.serverTimestamp(),
                status: "pending_review"
            });

            // Trigger safety lockout for high-severity events
            if (event.event_type === "https://schemas.google.com/risc/v1/account-disabled") {
                await admin.auth().updateUser(uid, { disabled: true });
                console.warn(`[RISC] Account ${email} disabled due to Google Security Event.`);
            }
        } catch (e) {
            console.error("[RISC] Error processing user for event:", e);
        }
    }

    response.status(202).send("Accepted");
});
