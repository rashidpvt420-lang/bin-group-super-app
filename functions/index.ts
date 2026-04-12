import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { beforeUserCreated } from "firebase-functions/v2/identity";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

// [V7] Multi-Region Enterprise Mesh
setGlobalOptions({ region: "europe-west3" });

admin.initializeApp();
const db = admin.firestore();

// ── [V7.1] SOVEREIGN PRESTIGE INFRASTRUCTURE ──────────────────────────────────────
const PRESTIGE_FOOTER = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; font-size: 10px; color: #888; text-align: center;">  
        <p>BINCONSTRUCTION™ UAE | Trade License: 1029432 | DEWA Approved Asset Manager</p>
        <p>Level 88, Sovereign Tower, Sheikh Zayed Road, Dubai, UAE</p>
        <p style="margin-top: 10px; color: #666;">DATA PRIVACY NOTICE: This communication contains sovereign institutional information. Unauthorized disclosure or reproduction is strictly prohibited under UAE PDPL Federal Law No. 45/2021.</p>
    </div>
`;

function wrapInLuxuryTemplate(content: string, subject: string) {
    return `
        <div style="background-color: #0B0B0C; color: #FFFFFF; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; line-height: 1.6;">
            <div style="max-width: 600px; margin: 0 auto; border: 1px solid #D4AF37; border-radius: 12px; overflow: hidden; background: #161618;">
                <div style="background: linear-gradient(135deg, #C6A75E, #D4AF37); padding: 30px; text-align: center;">
                    <h1 style="color: #0B0B0C; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; font-weight: 900;">BIN GROUP</h1>
                </div>
                <div style="padding: 40px;">
                    <h2 style="color: #D4AF37; margin-top: 0; font-weight: 700;">${subject}</h2>
                    <div style="color: #E0E0E0;">${content}</div>
                    ${PRESTIGE_FOOTER}
                </div>
            </div>
        </div>
    `;
}

async function notifyCEO(event: string, details: string) {
    console.log(`[CEO-HEARTBEAT] High-Value Event Tracked: ${event} | ${details}`);
}

// ── [V5] OMNI-CHANNEL NOTIFICATION ENGINE ───────────────────────────────────────
async function dispatchOmniNotification(userId: string, title: string, body: string, emailOptions: any = null, extraData: any = {}) { 
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) return false;

        const userData = userDoc.data();
        const fcmToken = userData?.fcmToken;
        const userEmail = userData?.email;

        // 1. Dispatch Push Notification if Token exists
        if (fcmToken) {
            const payload: admin.messaging.TokenMessage = {
                token: fcmToken,
                notification: { title, body },
                webpush: {
                    headers: { Urgency: 'high' },
                    notification: {
                        requireInteraction: true,
                        vibrate: [500, 250, 500, 250, 500],
                        data: {
                            url: extraData.url || '/tech'
                        }
                    }
                },
                data: {
                    userId,
                    ticketId: String(extraData.ticketId || ''),
                    ...extraData
                }
            };
            await admin.messaging().send(payload);
            console.log(`[V5 Omni] Push delivered to user ${userId}`);
        }

        // 2. Dispatch Email if requested
        if (emailOptions && userEmail) {
            await db.collection("mail").add({
                to: userEmail,
                message: {
                    subject: emailOptions.subject || title,
                    html: emailOptions.template || wrapInLuxuryTemplate(`
                        <h2 style="color: #C6A75E;">BIN-GROUP Update</h2>
                        <p>${body}</p>
                        <p style="font-size: 14px; opacity: 0.8;">Action required or information received regarding your institutional account.</p>
                    `, title)
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

// ── [V5] PROFILE EVENT TRIGGERS ────────────────────────────────────────────────
export const onTicketStatusUpdate = onDocumentUpdated("maintenanceTickets/{ticketId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const ticketId = event.params.ticketId;
    const tenantId = after.tenantId;

    // Logic: Technician Assigned
    if (after.assignedTechnicianId && before.assignedTechnicianId !== after.assignedTechnicianId) {
        await dispatchOmniNotification(
            after.assignedTechnicianId,
            "NEW MISSION ASSIGNED",
            `Mission: ${after.trade || 'General'} at ${after.propertyName || 'Portfolio Asset'}.`,
            { subject: `New Dispatch Assignment: #${ticketId.substring(0, 8)}` },
            { ticketId, url: `/tech/ticket/${ticketId}` }
        );
    }

    // Logic: En Route
    if (after.status === 'EN_ROUTE' && before.status !== 'EN_ROUTE' && tenantId) {
        await dispatchOmniNotification(tenantId, "Technician En Route", "Your service specialist is moving towards your location now.");
    }

    // [V7.2] Reputation Engine: Automated Success Survey
    if (after.status === 'COMPLETED' && before.status !== 'COMPLETED' && tenantId) {
        const googleBusinessLink = "https://g.page/bin-groups-dubai/review";
        await dispatchOmniNotification(tenantId, "Mission Accomplished", `High-performance service delivered. Your maintenance request #${ticketId.substring(0,8)} is now 5-star verified.`, {
            subject: "Mission Accomplished - BIN GROUP Prestige Service",
            template: wrapInLuxuryTemplate(`
                <h2 style="color: #D4AF37; text-align: center;">MISSION ACCOMPLISHED</h2>
                <div style="text-align: center; margin: 30px 0;">
                    <p>Your property specialist has successfully resolved the maintenance assignment at <b>${after.propertyName || 'Institutional Asset'}</b>.</p>
                    <p style="font-size: 14px; opacity: 0.8;">Verification Signature & Photo Proof secured in BIN-VAULT.</p>
                </div>
                <div style="text-align: center; margin-top: 40px; padding: 20px; border: 1px dashed #D4AF37; border-radius: 8px;">
                    <p style="margin-bottom: 20px;">We strive for institutional excellence. Would you take 30 seconds to support our growth?</p>
                    <a href="${googleBusinessLink}" style="display: inline-block; background: #D4AF37; color: #0B0B0C; padding: 15px 30px; text-decoration: none; font-weight: 900; border-radius: 4px; letter-spacing: 1px;">RATE OUR SERVICE ON GOOGLE</a>
                </div>
                <p style="font-size: 12px; margin-top: 40px; text-align: center; opacity: 0.6;">High-resolution evidence and institutional receipts are available in your Sovereign Dashboard.</p>
            `, "SUCCESS SURVEY")
        });
    }
});

export const onUnitStateChange = onDocumentUpdated("units/{unitId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    if (after.leaseStatus === 'EXPIRED' && before.leaseStatus !== 'EXPIRED' && after.ownerId) {
        await dispatchOmniNotification(after.ownerId, "ACTION REQUIRED: Lease Expiry", `The lease for Unit ${after.unitNumber} has expired. Automated turnover engine initiated.`, { subject: "CRITICAL: Lease Expiry Notification" });
    }

    if (after.status === 'VACANT' && before.status !== 'VACANT') {
        const brokersSnap = await db.collection("users").where("role", "==", "broker").where("status", "==", "active").get();
        const notificationPromises = brokersSnap.docs.map(doc =>
            dispatchOmniNotification(doc.id, "New Inventory Available", `Unit ${after.unitNumber} at ${after.propertyName || 'Portfolio'} is now VACANT and ready for leasing.`)
        );
        await Promise.all(notificationPromises);
    }
});

// ── IDENTITY & ACCESS MANAGEMENT ───────────────────────────────────────────────
export const autoGrantAdminOnFirstLogin = beforeUserCreated(async (event) => {
    const user = event.data;
    if (!user?.email) return;

    try {
        const email = user.email.toLowerCase();
        const emailKey = email.replace(/\./g, "_").replace(/@/g, "_");
        const grantDoc = await db.collection("pending_admin_grants").doc(emailKey).get();

        if (grantDoc.exists) {
            const grant = grantDoc.data()!;
            const claims = { admin: grant.isAdmin ?? false, role: grant.role ?? "technical" };

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
            }
            await pendingTenantDoc.ref.update({ status: "claimed", claimedAt: admin.firestore.FieldValue.serverTimestamp(), uid: user.uid });
            return { customClaims: claims };
        }
    } catch (err) {
        console.error("[IAM] Blocking function failure:", err);
    }
    return;
});

export const setAdminRole = onCall({ enforceAppCheck: true }, async (request) => {
    const caller = request.auth;
    if (!caller?.token?.admin) throw new HttpsError("permission-denied", "Institutional access required.");
    const { email, role, isAdmin, emirate, serviceZone, assignedZones } = request.data;
    if (!email) throw new HttpsError("invalid-argument", "Email is required.");

    try {
        const existing = await admin.auth().getUserByEmail(email);
        const uid = existing.uid;
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
            grantedBy: caller.token?.email || caller.uid,
            grantedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "pending_first_login",
        });
    }
    return { success: true };
});

export const adminCreateUser = onCall({ enforceAppCheck: true }, async (request) => {
    const caller = request.auth;
    if (!caller?.token?.admin) throw new HttpsError("permission-denied", "Institutional access required.");
    const { email, displayName, role, emirate, serviceZone, assignedZones } = request.data;
    if (!email || !role) throw new HttpsError("invalid-argument", "Invalid Argument");

    let uid;
    try {
        const existingUser = await admin.auth().getUserByEmail(email);
        uid = existingUser.uid;
    } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
            const newUser = await admin.auth().createUser({ email, displayName });
            uid = newUser.uid;
        } else throw new HttpsError("internal", err.message);
    }

    await admin.auth().setCustomUserClaims(uid, { role, status: 'active' });
    await db.collection("users").doc(uid).set({
        uid, email: email.toLowerCase(), displayName: displayName || "New User",
        role, status: "active", emirate: emirate || null, serviceZone: serviceZone || null,
        assignedZones: assignedZones || [], updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isOffDuty: false, joinDate: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true, uid };
});

// ── MAIL QUEUE PROCESSOR ──────────────────────────────────────────────────────
export const processMailQueue = onDocumentCreated("mail/{docId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: 'CEO@bin-groups.com', pass: 'uqrkyuvsozsvxhyn' }
        });

        const rawHtml = data.message?.html || data.html || "<p>Notification from BIN GROUP.</p>";
        const subject = data.message?.subject || data.subject || "BIN GROUP Notification";

        await transporter.sendMail({
            from: '"BIN GROUP" <CEO@bin-groups.com>',
            to: data.to,
            subject: subject,
            html: rawHtml
        });

        await snap.ref.update({ delivery: { state: 'SUCCESS', sentAt: admin.firestore.FieldValue.serverTimestamp() } });
    } catch (error: any) {
        console.error("FATAL MAIL ERROR:", error);
        await snap.ref.update({ delivery: { state: 'ERROR', error: error.message } });
    }
});

// ── SYSTEM TRIGGERS & CRONS ───────────────────────────────────────────────────
export const evaluateSLACron = onSchedule("every 4 hours", async (event) => {
    const now = admin.firestore.Timestamp.now();
    const twentyFourHoursAgo = new Date(now.toDate().getTime() - 24 * 60 * 60 * 1000);

    const staleTickets = await db.collection("maintenanceTickets")
        .where("status", "==", "OPEN")
        .where("createdAt", "<", admin.firestore.Timestamp.fromDate(twentyFourHoursAgo))
        .get();

    for (const doc of staleTickets.docs) {
        await doc.ref.update({ slaViolated: true, lastEscalatedAt: now });
        const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
        await Promise.all(adminsSnap.docs.map(adminDoc =>
            dispatchOmniNotification(adminDoc.id, "CRITICAL: SLA BREACH", `Ticket #${doc.id.substring(0,8)} has been open for > 24 hours.`)
        ));
    }
});

export const onMaintenanceTicketCreated = onDocumentCreated("maintenanceTickets/{ticketId}", async (event) => {
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
            techQuery = await db.collection("users")
                .where("role", "==", "technician")
                .where("isOffDuty", "==", false)
                .where("assignedZones", "array-contains", "Global Operations")
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

            await dispatchOmniNotification(
                bestTech.id,
                `NEW MISSION: ${ticketData.tenantName || 'Resident'} - ${serviceZone}`,
                `${ticketData.trade || 'Issue'} at Floor ${ticketData.floorNumber || 'N/A'}, Unit ${ticketData.unitNumber || 'N/A'}. Tap for details.`,
                { subject: "Urgent Duty Assignment - BIN GROUP" },
                { ticketId: snap.id, url: `/tech/ticket/${snap.id}` }
            );

            if (ticketData.priority === 'EMERGENCY') {
                notifyCEO("EMERGENCY_DISPATCH", `MISSION #${snap.id.substring(0,8)} | TECH: ${bestTech.displayName} | AREA: ${serviceZone}`);
            }
        }
    } catch (error) {
        console.error(`[V5 Dispatch] Failure:`, error);
    }
});

export const adminVerifyPayment = onCall({ enforceAppCheck: true }, async (request) => {
    const caller = request.auth;
    if (!caller?.token?.admin) throw new HttpsError("permission-denied", "Admin-only protocol.");
    const { contractId, method, referenceId, amountReceived } = request.data;

    await db.runTransaction(async (transaction) => {
        const contractRef = db.collection("contracts").doc(contractId);
        const snap = await transaction.get(contractRef);
        if (!snap.exists) throw new Error("CONTRACT_NOT_FOUND");
        const ownerId = snap.data()?.ownerId;

        transaction.update(contractRef, {
            paymentVerified: true,
            status: "ACTIVE",
            settledMethod: method,
            settledReferenceId: referenceId,
            verifiedBy: caller.uid,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            amountReceived: amountReceived || snap.data()?.amount
        });
        if (ownerId) {
            transaction.update(db.collection("users").doc(ownerId), {
                status: 'active',
                activatedAt: admin.firestore.FieldValue.serverTimestamp(),
                activatedBy: caller.uid
            });
        }
        notifyCEO("OWNER_ACTIVATED", `CONTRACT #${contractId} | VALUE: ${amountReceived}`);
    });
    return { success: true };
});

export const onPendingTenantCreated = onDocumentCreated("pending_tenants/{tenantId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    if (!data.email) return;

    await db.collection("mail").add({
        to: data.email,
        message: {
            subject: "Institutional Access: BIN GROUP Portal",
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #000; border: 1px solid #EEE; border-radius: 8px; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #C6A75E; font-size: 22px;">Institutional Onboarding</h1>
                    <p>You have been granted access to the BIN GROUP institutional asset management platform.</p>
                    <div style="background: #F8FAFC; padding: 15px; border-radius: 4px; margin: 15px 0;">
                        <p style="margin: 0;"><b>Property:</b> ${data.propertyName || 'Portfolio Asset'}</p>
                        <p style="margin: 5px 0 0;"><b>Unit:</b> ${data.unitNumber || 'N/A'}</p>
                    </div>
                    <a href="https://bin-group-57c60.web.app/login" style="display: inline-block; background: #C6A75E; color: #000; padding: 12px 24px; text-decoration: none; font-weight: 900; border-radius: 4px;">Sign Up Now</a>
                </div>
            `
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
});

// STUBS FOR REMAINING FUNCTIONS
export const getMissionGuidance = onCall({ cors: true }, async () => ({ status: "V5_ONLINE", guidance: "Sovereign protocol active." }));
export const getSovereignSystemStats = onCall({ cors: true }, async () => ({ status: "OK" }));
export const googleSecurityEvents = onRequest({ cors: true }, async (req, res) => { res.status(202).send("Accepted"); });
export const onIntakeCreated = onDocumentCreated("intake_submissions/{id}", async () => {});
export const onTurnoverQuoteApproved = onDocumentUpdated("turnover-quotes/{id}", async () => {});
export const onPropertyOnboarded = onDocumentCreated("properties/{id}", async () => {});
export const syncLiquidityOnTransaction = onDocumentCreated("transactions/{id}", async () => {});
export const syncLiquidityOnContractVerified = onDocumentUpdated("contracts/{id}", async () => {});
export const generateIntegrityAudit = onCall({ cors: true }, async () => ({ url: "" }));
export const proactiveMaintenanceCron = onSchedule("every 48 hours", async () => {});
export const createAiMaintenanceTicket = onCall({ cors: true }, async () => ({ ticketId: "" }));
export const approveMaintenanceProposal = onCall({ cors: true }, async () => ({ success: true }));
export const onUserUpdatedAudit = onDocumentUpdated("users/{userId}", async () => {});
export const scheduledDailyBackup = onSchedule("0 3 * * *", async () => {});
