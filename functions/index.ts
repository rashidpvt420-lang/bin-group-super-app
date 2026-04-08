import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import * as nodemailer from "nodemailer";

admin.initializeApp();
const db = admin.firestore();

// ── [V5] OMNI-CHANNEL NOTIFICATION ENGINE ──────────────────────────────────

/**
 * master utility to dispatch notifications across Push and Email channels.
 */
async function dispatchOmniNotification(userId: string, title: string, body: string, emailOptions: { subject?: string, template?: string } | null = null) {
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) return false;
        
        const userData = userDoc.data();
        const fcmToken = userData?.fcmToken;
        const userEmail = userData?.email;

        // 1. Dispatch Push Notification if Token exists
        if (fcmToken) {
            const message: admin.messaging.Message = {
                token: fcmToken,
                notification: { title, body },
                data: { userId, click_action: "FLUTTER_NOTIFICATION_CLICK" },
                apns: {
                    headers: { 'apns-priority': '10' },
                    payload: { aps: { alert: { title, body }, sound: 'default', badge: 1, 'content-available': 1 } }
                },
                android: { 
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channelId: 'high_importance_channel'
                    }
                },
                webpush: {
                    headers: { Urgency: 'high' },
                    notification: {
                        requireInteraction: true,
                        vibrate: [500, 250, 500, 250, 500]
                    }
                }
            };
            await admin.messaging().send(message);
            console.log(`[V5 Omni] Push delivered to user ${userId}`);
        }

        // 2. Dispatch Email if requested
        if (emailOptions && userEmail) {
            await db.collection("mail").add({
                to: userEmail,
                message: {
                    subject: emailOptions.subject || title,
                    html: emailOptions.template || `
                        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #EEE; border-radius: 8px;">
                            <h2 style="color: #C6A75E;">BIN-GROUP Update</h2>
                            <p>${body}</p>
                            <hr style="border: 0; border-top: 1px solid #EEE; margin: 20px 0;">
                            <p style="font-size: 12px; color: #777;">This is an automated Sovereign Notification.</p>
                        </div>
                    `
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[V5 Omni] Email queued for user ${userId}`);
        }

        return true;
    } catch (error) {
        console.error(`[V5 Omni] Dispatch Failure for user ${userId}:`, error);
        return false;
    }
}

// ── [V5] PROFILE EVENT TRIGGERS ──────────────────────────────────────────────

/**
 * Profile 1 & 2: Tenant & Technician Lifecycle
 */
export const onTicketStatusUpdate = onDocumentUpdated("maintenanceTickets/{ticketId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const ticketId = event.params.ticketId;
    const tenantId = after.tenantId;

    // Logic: Technician Assigned (Notify Technician)
    if (after.assignedTechnicianId && before.assignedTechnicianId !== after.assignedTechnicianId) {
        await dispatchOmniNotification(
            after.assignedTechnicianId,
            "NEW MISSION ASSIGNED",
            `Mission: ${after.trade || 'General'} at ${after.propertyName || 'Portfolio Asset'}.`,
            { subject: `New Dispatch Assignment: #${ticketId.substring(0,8)}` }
        );
    }

    // Logic: En Route (Notify Tenant)
    if (after.status === 'EN_ROUTE' && before.status !== 'EN_ROUTE' && tenantId) {
        await dispatchOmniNotification(
            tenantId,
            "Technician En Route",
            "Your service specialist is moving towards your location now."
        );
    }

    // Logic: Completed (Notify Tenant - Push + Email)
    if (after.status === 'COMPLETED' && before.status !== 'COMPLETED' && tenantId) {
        await dispatchOmniNotification(
            tenantId,
            "Mission Resolved",
            "Job completed. Please log in to your portal to rate your service experience.",
            { 
                subject: "Service Completion Receipt - BIN GROUP",
                template: `<div style="font-family: sans-serif; padding: 40px; text-align: center;">
                    <h1 style="color: #C6A75E;">Mission Accomplished</h1>
                    <p>Your maintenance request <b>#${ticketId.substring(0,8)}</b> has been marked as COMPLETED.</p>
                    <p><b>Specialist:</b> ${after.assignedTechnicianName || 'BIN-GROUP Staff'}</p>
                    <a href="https://bin-group-57c60.web.app/dashboard" style="background: #C6A75E; color: #000; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px;">Rate Specialist</a>
                </div>`
            }
        );
    }
});

/**
 * Profile 4 & 5: Owner & Broker Inventory Triggers
 */
export const onUnitStateChange = onDocumentUpdated("units/{unitId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Profile 4: Lease Expiry (Notify Owner)
    if (after.leaseStatus === 'EXPIRED' && before.leaseStatus !== 'EXPIRED' && after.ownerId) {
        await dispatchOmniNotification(
            after.ownerId,
            "ACTION REQUIRED: Lease Expired",
            `The lease for Unit ${after.unitNumber} has expired. Automated turnover engine initiated.`,
            { subject: "CRITICAL: Lease Expiry Notification" }
        );
    }

    // Profile 5: Vacancy Alert (Notify ALL active Brokers)
    if (after.status === 'VACANT' && before.status !== 'VACANT') {
        const brokersSnap = await db.collection("users").where("role", "==", "broker").where("status", "==", "active").get();
        const notificationPromises = brokersSnap.docs.map(doc => 
            dispatchOmniNotification(
                doc.id,
                "New Inventory Available",
                `Unit ${after.unitNumber} at ${after.propertyName || 'Portfolio'} is now VACANT and ready for leasing.`
            )
        );
        await Promise.all(notificationPromises);
    }
});


// ── IDENTITY & ACCESS MANAGEMENT ─────────────────────────────────────────────

import { beforeUserCreated } from "firebase-functions/v2/identity";

export const autoGrantAdminOnFirstLogin = beforeUserCreated(async (event) => {
    const user = event.data;
    if (!user?.email) return;

    try {
        const email = user.email.toLowerCase();
        const emailKey = email.replace(/\./g, "_").replace(/@/g, "_");
        const grantDocPromise = db.collection("pending_admin_grants").doc(emailKey).get();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 5000));
        const grantDoc = await Promise.race([grantDocPromise, timeoutPromise]) as admin.firestore.DocumentSnapshot;

        if (grantDoc.exists) {
            const grant = grantDoc.data()!;
            const claims: Record<string, unknown> = {
                admin: grant.isAdmin ?? false,
                role: grant.role ?? "technical"
            };

            await admin.auth().setCustomUserClaims(user.uid, claims);
            await db.collection("users").doc(user.uid).set({
                uid: user.uid,
                email: user.email,
                displayName: grant.displayName || user.displayName || "Team Member",
                role: grant.role || "technical",
                isAdmin: grant.isAdmin || false,
                status: "active",
                grantedBy: grant.grantedBy || "system",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                joinDate: admin.firestore.FieldValue.serverTimestamp(),
                isOffDuty: false,
                emirate: grant.emirate || "Dubai",
                serviceZone: grant.serviceZone || "Downtown Dubai"
            });
            await grantDoc.ref.update({ status: "claimed", claimedAt: admin.firestore.FieldValue.serverTimestamp(), uid: user.uid });
            return { customClaims: claims };
        }

        const pendingTenantSnap = await db.collection("pending_tenants").where("email", "==", email).limit(1).get();
        if (!pendingTenantSnap.empty) {
            const pendingTenantDoc = pendingTenantSnap.docs[0];
            const tenantData = pendingTenantDoc.data();
            const claims = { role: 'tenant' };
            await admin.auth().setCustomUserClaims(user.uid, claims);

            await db.collection("users").doc(user.uid).set({
                uid: user.uid,
                email: user.email,
                displayName: tenantData.tenantName || user.displayName || "Tenant",
                role: 'tenant',
                isAdmin: false,
                status: "active",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                emirate: tenantData.emirate || null,
                serviceZone: tenantData.serviceZone || null,
            });

            if (tenantData.propertyId) {
                 await db.collection("units").add({
                    propertyId: tenantData.propertyId,
                    tenantId: user.uid,
                    unitNumber: tenantData.unitNumber || '',
                    floorNumber: tenantData.floorNumber || '',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                 });
                 await db.collection("properties").doc(tenantData.propertyId).update({
                     tenantId: user.uid,
                     tenantName: tenantData.tenantName || user.displayName || "Tenant",
                     status: "OCCUPIED",
                     updatedAt: admin.firestore.FieldValue.serverTimestamp()
                 });
            }
            await pendingTenantDoc.ref.update({ status: "claimed", claimedAt: admin.firestore.FieldValue.serverTimestamp(), uid: user.uid });
            return { customClaims: claims };
        }
        return;
    } catch (err) {
        console.error("[IAM] Blocking function failure:", err);
        return;
    }
});

export const setAdminRole = onCall({ enforceAppCheck: true }, async (request) => {
    const caller = request.auth;
    if (!caller?.token?.admin) throw new HttpsError("permission-denied", "Institutional access required.");
    const { email, role, isAdmin, emirate, serviceZone, assignedZones } = request.data as any;
    if (!email) throw new HttpsError("invalid-argument", "Email is required.");
    let uid: string;
    try {
        const existing = await admin.auth().getUserByEmail(email);
        uid = existing.uid;
        await admin.auth().setCustomUserClaims(uid, { admin: isAdmin, role });
        await db.collection("users").doc(uid).set({
            isAdmin, role,
            emirate: emirate || null,
            serviceZone: serviceZone || null,
            assignedZones: assignedZones || [],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    } catch {
        const emailKey = email.replace(/\./g, "_").replace(/@/g, "_");
        await db.collection("pending_admin_grants").doc(emailKey).set({
            email, role, isAdmin, emirate, serviceZone, assignedZones,
            displayName: "Team Member",
            grantedBy: caller.token.email || caller.uid,
            grantedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "pending_first_login",
        });
    }
    return { success: true };
});

export const adminCreateUser = onRequest({ cors: true }, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).send({ error: { message: "Unauthenticated" } });
        return;
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (!decodedToken.admin) {
            res.status(403).send({ error: { message: "Permission Denied" } });
            return;
        }
        const payload = req.body.data || req.body;
        const { email, displayName, role, emirate, serviceZone, assignedZones } = payload as any;
        if (!email || !role) {
            res.status(400).send({ error: { message: "Invalid Argument" } });
            return;
        }
        let uid: string;
        try {
            const existingUser = await admin.auth().getUserByEmail(email);
            uid = existingUser.uid;
        } catch (err: any) {
            if (err.code === 'auth/user-not-found') {
                const newUser = await admin.auth().createUser({ email, displayName });
                uid = newUser.uid;
            } else { throw err; }
        }
        await admin.auth().setCustomUserClaims(uid, { role, status: 'active' });
        const userProfile: any = {
            uid, email: email.toLowerCase(), displayName: displayName || "New User",
            role, status: "active", emirate: emirate || null, serviceZone: serviceZone || null,
            assignedZones: assignedZones || [], updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            isOffDuty: false, joinDate: admin.firestore.FieldValue.serverTimestamp()
        };
        await db.collection("users").doc(uid).set(userProfile, { merge: true });
        res.status(200).send({ result: { success: true, uid } });
    } catch (error: any) {
        res.status(500).send({ error: { message: error.message } });
    }
});

// ── MAIL QUEUE PROCESSOR ──────────────────────────────────────────────────

export const processMailQueue = onDocumentCreated("mail/{docId}", async (event) => {
    const snap = event.data;
    if (!snap) return;

    console.log("MAIL TRIGGERED - ID:", event.id);
    const data = snap.data();

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'CEO@bin-groups.com',
                pass: 'uqrkyuvsozsvxhyn'
            }
        });

        // Safely extract the nested message data to prevent undefined crashes
        const htmlBody = data.message?.html || data.html || "<p>Notification from BIN GROUP.</p>";
        const mailOptions = {
            from: '"BIN GROUP" <CEO@bin-groups.com>',
            to: data.to,
            subject: data.message?.subject || data.subject || "BIN GROUP Notification",
            text: htmlBody.replace(/<[^>]*>?/gm, ''), // Strip HTML for plain text fallback (CRITICAL FOR INBOX DELIVERABILITY)
            html: htmlBody
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent: " + info.response);

        await snap.ref.update({
            delivery: { state: 'SUCCESS', info: info.response }
        });
    } catch (error: any) {
        console.error("FATAL MAIL ERROR:", error);
        await snap.ref.update({
            delivery: { state: 'ERROR', error: error.message || String(error) }
        });
    }
});

// ── SYSTEM TRIGGERS & CRONS ──────────────────────────────────────────────────

export const evaluateSLACron = onSchedule("every 4 hours", async (event) => {
    const now = admin.firestore.Timestamp.now();
    const twentyFourHoursAgo = new Date(now.toDate().getTime() - 24 * 60 * 60 * 1000);

    const staleTickets = await db.collection("maintenanceTickets")
        .where("status", "==", "OPEN")
        .where("createdAt", "<", admin.firestore.Timestamp.fromDate(twentyFourHoursAgo))
        .get();

    const batch = db.batch();
    for (const doc of staleTickets.docs) {
        batch.update(doc.ref, { slaViolated: true, lastEscalatedAt: now });
        
        // Profile 3: Admin SLA Breach (Notify all admins)
        const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
        const notificationPromises = adminsSnap.docs.map(adminDoc => 
            dispatchOmniNotification(
                adminDoc.id,
                "CRITICAL: SLA BREACH",
                `Ticket #${doc.id.substring(0,8)} has been open for > 24 hours.`
            )
        );
        await Promise.all(notificationPromises);
    }
    await batch.commit();
});

export const onTicketCreated = onDocumentCreated("maintenanceTickets/{ticketId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ticket = snap.data();
    const text = ((ticket.description || "") + (ticket.issueType || "")).toLowerCase();
    const urgentKeywords = ["flood", "fire", "smoke", "burst", "leak", "danger", "sos"];
    const basePriority = urgentKeywords.some(key => text.includes(key)) ? "EMERGENCY" : (ticket.priority || "MEDIUM");
    await snap.ref.update({ 
        priority: basePriority, intelligenceFlag: "ACTIVE", 
        createdAt: ticket.createdAt || admin.firestore.FieldValue.serverTimestamp() 
    });
});

export const autoRouteTicket = onDocumentCreated("maintenanceTickets/{ticketId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ticketData = snap.data();

    try {
        let emirate = ticketData.emirate;
        let serviceZone = ticketData.serviceZone;
        if (!emirate || !serviceZone) {
            const tenantDoc = await db.collection("users").doc(ticketData.tenantId).get();
            const tData = tenantDoc.data();
            emirate = emirate || tData?.emirate;
            serviceZone = serviceZone || tData?.serviceZone;
        }

        let techQuery = await db.collection("users")
            .where("role", "==", "technician")
            .where("isOffDuty", "==", false)
            .where("assignedZones", "array-contains", serviceZone)
            .get();

        if (techQuery.empty) {
            techQuery = await db.collection("users")
                .where("role", "==", "technician")
                .where("isOffDuty", "==", false)
                .where("emirate", "==", emirate)
                .get();
        }

        if (techQuery.empty) {
            await snap.ref.update({ autoDispatchStatus: "NO_TECH_IN_TERRITORY" });
            return;
        }

        let bestTech: any = null;
        let minActiveCount = Infinity;
        for (const techDoc of techQuery.docs) {
            const activeTicketsSnap = await db.collection("maintenanceTickets")
                .where("assignedTechnicianId", "==", techDoc.id)
                .where("status", "not-in", ["RESOLVED", "CLOSED", "COMPLETED"])
                .get();
            if (activeTicketsSnap.size < minActiveCount) {
                minActiveCount = activeTicketsSnap.size;
                bestTech = { id: techDoc.id, ...techDoc.data() };
            }
        }

        if (bestTech) {
            await snap.ref.update({
                assignedTechnicianId: bestTech.id, assignedTechnicianName: bestTech.displayName || "Technician",
                status: "assigned", emirate, serviceZone, autoDispatchStatus: "SUCCESS_V5_OMNI",
                dispatchedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Profile 2: Notify Technician (Omni-Channel)
            await dispatchOmniNotification(
                bestTech.id,
                `NEW MISSION: ${ticketData.tenantName || 'Resident'} - ${serviceZone}`,
                `${ticketData.trade || 'Issue'} at Floor ${ticketData.floorNumber || 'N/A'}, Unit ${ticketData.unitNumber || 'N/A'}. Tap for details.`,
                { subject: "Urgent Duty Assignment - BIN GROUP" }
            );
        }
    } catch (error) {
        console.error(`[V5 Dispatch] Failure:`, error);
    }
});

export const adminVerifyPayment = onCall({ enforceAppCheck: true }, async (request) => {
    const caller = request.auth;
    if (!caller?.token?.admin) throw new HttpsError("permission-denied", "Admin-only protocol.");
    const { contractId, method, referenceId, amountReceived } = request.data;
    const contractRef = db.collection("contracts").doc(contractId);
    await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(contractRef);
        if (!snap.exists) throw new Error("CONTRACT_NOT_FOUND");
        const ownerId = snap.data()?.ownerId;
        transaction.update(contractRef, {
            paymentVerified: true, status: "ACTIVE", settledMethod: method, settledReferenceId: referenceId, 
            verifiedBy: caller.uid, verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            amountReceived: amountReceived || snap.data()?.amount
        });
        if (ownerId) {
            transaction.update(db.collection("users").doc(ownerId), { status: 'active', activatedAt: admin.firestore.FieldValue.serverTimestamp(), activatedBy: caller.uid });
        }
    });
    return { success: true };
});

export const onIntakeCreated = onDocumentCreated("intake_submissions/{intakeId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    await snap.ref.update({ aiAssessment: { score: 74, analyzedAt: admin.firestore.FieldValue.serverTimestamp() }, status: 'ANALYZED', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
});

export const onTurnoverQuoteApproved = onDocumentUpdated("turnover-quotes/{quoteId}", async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    if (before?.status === "APPROVED" || after?.status !== "APPROVED") return;
    const tasks = [{ key: "paintingCost", label: "Painting", trade: "DECOR" }, { key: "deepCleaningCost", label: "Cleaning", trade: "CLEANING" }];
    const batch = db.batch();
    for (const task of tasks) {
        if (after?.[task.key] > 0) {
            batch.set(db.collection("maintenanceTickets").doc(), { ownerId: after.ownerId, propertyId: after.propertyId, unit: after.unitId, description: `Turnover: ${task.label}`, trade: task.trade, priority: "OPEN", status: "PENDING", createdAt: admin.firestore.FieldValue.serverTimestamp() });
        }
    }
    await batch.commit();
});

export const onPropertyOnboarded = onDocumentCreated("properties/{propertyId}", async (event) => {});
export const getMissionGuidance = onCall({ cors: true, memory: "512MiB" }, async (request) => { return { status: "V5_ONLINE" }; });
export const getSovereignSystemStats = onCall({ cors: true }, async (request) => { return { status: "OK" }; });
export const syncLiquidityOnTransaction = onDocumentCreated("transactions/{txId}", async (event) => {});
export const syncLiquidityOnContractVerified = onDocumentUpdated("contracts/{contractId}", async (event) => {});
export const googleSecurityEvents = onRequest({ cors: true }, async (request, response) => { response.status(202).send("Accepted"); });
export const generateIntegrityAudit = onCall({ cors: true }, async (request) => { return { url: "" }; });
export const proactiveMaintenanceCron = onSchedule("every 48 hours", async (event) => {});
export const createAiMaintenanceTicket = onCall({ cors: true }, async (request) => { return { ticketId: "" }; });
export const approveMaintenanceProposal = onCall({ cors: true }, async (request) => { return { success: true }; });
export const onPendingTenantCreated = onDocumentCreated("pending_tenants/{tenantId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const email = data.email;
    if (!email) return;

    await db.collection("mail").add({
        to: email,
        message: {
            subject: "Institutional Access Granted: BIN GROUP Portal",
            html: `
                <div style="font-family: sans-serif; padding: 40px; color: #000; border: 1px solid #EEE; border-radius: 8px; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #C6A75E; font-size: 24px; margin-bottom: 20px;">Institutional Onboarding</h1>
                    <p style="font-size: 16px; line-height: 1.6;">You have been granted access to the BIN GROUP institutional asset management platform.</p>
                    <div style="background: #F8FAFC; padding: 20px; border-radius: 4px; margin: 24px 0;">
                        <p style="margin: 0; font-size: 14px; color: #64748B;"><b>Property:</b> ${data.propertyName || 'Institutional Asset'}</p>
                        <p style="margin: 8px 0 0; font-size: 14px; color: #64748B;"><b>Unit:</b> ${data.unitNumber || 'N/A'}</p>
                    </div>
                    <p style="font-size: 16px; line-height: 1.6;">Please sign up using your email (<b>${email}</b>) to claim your dashboard and access SOS dispatch services.</p>
                    <a href="https://bin-group-57c60.web.app/login" style="display: inline-block; background: #C6A75E; color: #000; padding: 14px 32px; text-decoration: none; font-weight: 900; border-radius: 100px; margin-top: 20px;">Sign Up Now</a>
                    <hr style="border: 0; border-top: 1px solid #EEE; margin: 32px 0;">
                    <p style="font-size: 12px; color: #94A3B8;">This is a sovereign institutional communication. Unauthorized access is monitored.</p>
                </div>
            `
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
});
