import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { extractTitleDeedData } from "./ocrEngine";
import { generateContractPDF, generatePayslipPDF } from "./pdfEngine";

// [V8] PRODUCTION GRADE STABILIZATION
setGlobalOptions({ region: "europe-west3" });

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const geoHashBase32 = "0123456789bcdefghjkmnpqrstuvwxyz";

function geohashForLocation(latitude: number, longitude: number, precision = 9) {
    let idx = 0;
    let bit = 0;
    let evenBit = true;
    let geohash = "";
    let latMin = -90;
    let latMax = 90;
    let lonMin = -180;
    let lonMax = 180;

    while (geohash.length < precision) {
        if (evenBit) {
            const lonMid = (lonMin + lonMax) / 2;
            if (longitude >= lonMid) {
                idx = idx * 2 + 1;
                lonMin = lonMid;
            } else {
                idx *= 2;
                lonMax = lonMid;
            }
        } else {
            const latMid = (latMin + latMax) / 2;
            if (latitude >= latMid) {
                idx = idx * 2 + 1;
                latMin = latMid;
            } else {
                idx *= 2;
                latMax = latMid;
            }
        }
        evenBit = !evenBit;
        if (++bit === 5) {
            geohash += geoHashBase32.charAt(idx);
            bit = 0;
            idx = 0;
        }
    }
    return geohash;
}

function normalizeGeo(source: any) {
    const lat = Number(source?.geo?.lat ?? source?.location?.lat ?? source?.coordinates?.lat ?? source?.lat);
    const lng = Number(source?.geo?.lng ?? source?.location?.lng ?? source?.coordinates?.lng ?? source?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return {
        point: new admin.firestore.GeoPoint(lat, lng),
        lat,
        lng,
        geohash: source?.geo?.geohash || geohashForLocation(lat, lng),
        source: source?.geo?.source || "property_record",
        placeId: source?.geo?.placeId || source?.googlePlaceId || "",
        address: source?.geo?.address || source?.addressLine || source?.address || "",
        emirate: source?.geo?.emirate || source?.emirate || "",
        city: source?.geo?.city || source?.city || source?.area || source?.serviceZone || "",
        area: source?.geo?.area || source?.area || source?.serviceZone || "",
        verified: source?.geo?.verified === true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
}

function distanceKm(a: any, b: any) {
    const lat1 = Number(a?.lat);
    const lng1 = Number(a?.lng);
    const lat2 = Number(b?.lat);
    const lng2 = Number(b?.lng);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
    const toRad = (value: number) => value * Math.PI / 180;
    const radius = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Secrets
const openAiKey = defineSecret("OPENAI_API_KEY");
const smtpUserSecret = defineSecret("SMTP_USER");
const smtpPassSecret = defineSecret("SMTP_PASS");

const normalizeRole = (value: unknown) => String(value || "").trim().toLowerCase();

async function hasCallableRoleAccess(authContext: any, allowedRoles: Set<string>) {
    const token = authContext?.token || {};
    const tokenRole = normalizeRole(token.role || token.userRole || token.primaryRole);
    if (token.admin === true || token.super_admin === true || token.superAdmin === true || allowedRoles.has(tokenRole)) {
        return true;
    }

    const userDoc = await db.collection("users").doc(authContext.uid).get();
    const userData = userDoc.data() || {};
    const firestoreRole = normalizeRole(userData.role || userData.userRole || userData.primaryRole);
    return userData.isAdmin === true ||
        userData.admin === true ||
        userData.superAdmin === true ||
        userData.super_admin === true ||
        allowedRoles.has(firestoreRole);
}

// ─── [V7.1] SOVEREIGN PRESTIGE INFRASTRUCTURE ─────────────────────────────────────

export const analyzeTitleDeed = onCall({
    cors: true,
    memory: "512MiB",
    timeoutSeconds: 60
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Sovereign access required.");
    }

    const { fileUrl } = request.data;
    if (!fileUrl) {
        throw new HttpsError("invalid-argument", "Missing Title Deed URL.");
    }

    try {
        return await extractTitleDeedData(fileUrl);
    } catch (err) {
        console.error("Title Deed OCR Fault:", err);
        throw new HttpsError("internal", "Institutional OCR engine failed.");
    }
});

export const generateAndEmailPayslip = onCall({
    cors: true,
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: [smtpUserSecret, smtpPassSecret]
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Admin sign-in is required before generating payslips.");
    }

    const hasPayrollAccess = await hasCallableRoleAccess(
        request.auth,
        new Set(["admin", "super_admin", "ceo", "hr_manager", "finance_admin"])
    );
    if (!hasPayrollAccess) {
        throw new HttpsError("permission-denied", "HR or finance admin access is required to generate payslips.");
    }

    const { staffId, payPeriod, staffEmail, staffName, basicSalary, allowances, overtime, deductions } = request.data || {};
    if (!staffId || !payPeriod || !staffEmail || !staffName) {
        throw new HttpsError("invalid-argument", "Staff name, staff email, staff ID, and pay period are required.");
    }

    const smtpUser = smtpUserSecret.value();
    const smtpPass = smtpPassSecret.value();
    if (!smtpUser || !smtpPass) {
        throw new HttpsError("failed-precondition", "Payroll email credentials are not configured.");
    }

    const safeBasicSalary = Number(basicSalary) || 0;
    const safeAllowances = Number(allowances) || 0;
    const safeOvertime = Number(overtime) || 0;
    const safeDeductions = Number(deductions) || 0;
    const netSalary = safeBasicSalary + safeAllowances + safeOvertime - safeDeductions;

    try {
        const pdfUrl = await generatePayslipPDF({
            staffId,
            staffName,
            payPeriod,
            paymentDate: new Date().toLocaleDateString(),
            position: "Field Operations Specialist", // Dynamic in real usage
            basicSalary: safeBasicSalary,
            allowances: safeAllowances,
            overtime: safeOvertime,
            deductions: safeDeductions,
            netSalary
        });

        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        });

        await transporter.sendMail({
            from: `"BIN GROUP HR" <${smtpUser}>`,
            to: staffEmail,
            subject: `Institutional Payslip - ${payPeriod}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #C6A75E;">
                    <h2 style="color: #C6A75E;">BIN GROUP PAY ADVICE</h2>
                    <p>Dear ${staffName},</p>
                    <p>Please find your payslip for the period <b>${payPeriod}</b> attached.</p>
                    <p>Your net salary of <b>AED ${netSalary.toLocaleString()}</b> has been processed.</p>
                    <p><a href="${pdfUrl}" style="background: #C6A75E; color: #000; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 5px;">Download PDF Payslip</a></p>
                    <br/>
                    <p>Best regards,<br/>BIN GROUP HR Department</p>
                </div>
            `
        });

        return { success: true, pdfUrl };
    } catch (err: any) {
        console.error("Payslip engine fault:", err);
        if (err instanceof HttpsError) {
            throw err;
        }
        throw new HttpsError("internal", "Payroll generation or email delivery failed. Check function logs for PDF or SMTP details.");
    }
});
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

/**
 * [INSTITUTIONAL REPAIR TRIGGER - SECURED]
 */
export const institutionalRepairTrigger = onCall({
    cors: true,
}, async (request) => {
    // 1. Admin Auth Check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Sovereign Admin credentials required.");
    }
    const hasRepairAccess = await hasCallableRoleAccess(
        request.auth,
        new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "support_admin"])
    );
    if (!hasRepairAccess) {
        throw new HttpsError("permission-denied", "Admin repair access is required.");
    }

    const dryRun = request.data.dryRun !== false; // Default to true for safety
    const batch = db.batch();
    const tickets = await db.collection("maintenanceTickets").get();
    
    const repairLog: any[] = [];
    let docsMatched = 0;
    let docsUpdated = 0;
    let docsSkipped = 0;
    const repairedTicketIds: string[] = [];
    const orphanTicketIds: string[] = [];
    const invalidStatusTicketIds: string[] = [];

    const statusMap: Record<string, string> = {
        'assigned': 'ASSIGNED',
        'pending': 'OPEN',
        'CLAIMED': 'ASSIGNED',
        'taken': 'ASSIGNED',
        'finished': 'COMPLETED',
        'done': 'COMPLETED'
    };

    for (const ticketDoc of tickets.docs) {
        const t = ticketDoc.data();
        let needsFix = false;
        const update: any = { 
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            repairSource: 'SECURED_ADMIN_TRIGGER'
        };
        const changes: any = { before: {}, after: {} };

        // A. Status Normalization
        if (statusMap[t.status]) {
            changes.before.status = t.status;
            update.status = statusMap[t.status];
            changes.after.status = update.status;
            needsFix = true;
            invalidStatusTicketIds.push(ticketDoc.id);
        } else if (t.status === 'ASSIGNED' && !t.assignedTechnicianId) {
            changes.before.status = t.status;
            update.status = 'OPEN';
            changes.after.status = update.status;
            needsFix = true;
            invalidStatusTicketIds.push(ticketDoc.id);
        }

        // B. Relational Orphan Repair (Deterministic only)
        if (!t.propertyId || t.propertyId === 'UNASSOCIATED' || !t.unitId || t.unitId === 'UNASSOCIATED') {
            orphanTicketIds.push(ticketDoc.id);
            if (t.tenantId) {
                const tenantDoc = await db.collection("users").doc(t.tenantId).get();
                const tenantData = tenantDoc.data();
                
                if (tenantData?.propertyId && tenantData?.unitId && tenantData.propertyId !== 'UNASSOCIATED') {
                    changes.before.propertyId = t.propertyId;
                    changes.before.unitId = t.unitId;
                    
                    update.propertyId = tenantData.propertyId;
                    update.unitId = tenantData.unitId;
                    update.propertyName = tenantData.propertyName || t.propertyName;
                    update.unitNumber = tenantData.unitNumber || t.unitNumber;
                    update.ownerId = tenantData.ownerId || t.ownerId;
                    
                    changes.after.propertyId = update.propertyId;
                    changes.after.unitId = update.unitId;
                    needsFix = true;
                } else {
                    docsSkipped++;
                    repairLog.push({ id: ticketDoc.id, status: 'SKIPPED', reason: 'Ambiguous relational link' });
                    continue;
                }
            } else {
                docsSkipped++;
                repairLog.push({ id: ticketDoc.id, status: 'SKIPPED', reason: 'No tenantId to anchor repair' });
                continue;
            }
        }

        if (needsFix) {
            docsMatched++;
            if (!dryRun) {
                batch.update(ticketDoc.ref, update);
                docsUpdated++;
                repairedTicketIds.push(ticketDoc.id);
            }
            repairLog.push({ id: ticketDoc.id, changes });
        }
    }

    const summary = {
        dryRun,
        project: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || admin.app().options.projectId || 'bin-group-57c60',
        database: '(default)',
        collection: 'maintenanceTickets',
        docsMatched,
        docsUpdated,
        docsSkipped,
        repairedTicketIds,
        orphanTicketIds,
        invalidStatusTicketIds,
        log: repairLog
    };

    // Audit Log Write
    if (!dryRun && docsUpdated > 0) {
        await batch.commit();
        await db.collection("repair_audit_logs").add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            adminId: request.auth.uid,
            summary
        });
    }

    return summary;
});

// ─── [V5] OMNI-CHANNEL NOTIFICATION ENGINE (UPGRADED) ──────────────────────────────
async function dispatchOmniNotification(userId: string, title: string, body: string, options: any = {}) {
    const result = { pushSent: false, mailQueued: false, outcomes: [] as any[], pushFallbackRequired: false };
    const eventKey = options.eventKey || `${userId}_${title.replace(/\s+/g, '_')}`;
    const dedupWindowMs = 60000; // 60s suppression window

    try {
        // 1. DUPLICATE SUPPRESSION
        const dedupRef = db.collection("notification_dedup").doc(eventKey);
        const dedupDoc = await dedupRef.get();
        if (dedupDoc.exists) {
            const lastSent = dedupDoc.data()?.timestamp?.toMillis() || 0;
            if (Date.now() - lastSent < dedupWindowMs) {
                console.log(`[NOTIFY] Suppressing duplicate event: ${eventKey}`);
                return result;
            }
        }

        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) return result;

        const userData = userDoc.data();
        const fcmTokens: string[] = userData?.fcmTokens || (userData?.fcmToken ? [userData.fcmToken] : []);
        const userEmail = userData?.email;
        const isIOS = userData?.platform === 'ios' || userData?.userAgent?.toLowerCase().includes('iphone');
        const isStandalone = userData?.isStandalone === true;

        // IPHONE HARDENING: Mark fallback if on iOS but not in standalone mode
        if (isIOS && !isStandalone) {
            result.pushFallbackRequired = true;
        }

        // 2. PUSH DISPATCH (Multi-device)
        if (fcmTokens.length > 0) {
            const messages = fcmTokens.map(token => ({
                token,
                notification: { title, body },
                data: { ...options.extraData, url: options.url || '/' }
            }));

            const response = await admin.messaging().sendEach(messages).catch(e => {
                console.error("[NOTIFY] SendEach Fault:", e);
                return null;
            });

            if (response) {
                const invalidTokens: string[] = [];
                response.responses.forEach((res, idx) => {
                    const token = fcmTokens[idx];
                    if (!res.success) {
                        const error = res.error as any;
                        if (error?.code === 'messaging/registration-token-not-registered' || error?.code === 'messaging/invalid-registration-token') {
                            invalidTokens.push(token);
                        }
                    }
                    result.outcomes.push({ token: token.substring(0, 8) + "...", success: res.success, error: res.error?.message });
                });

                if (invalidTokens.length > 0) {
                    await db.collection("users").doc(userId).update({
                        fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens)
                    });
                }

                if (response.successCount > 0) result.pushSent = true;
            }
        } else {
            result.pushFallbackRequired = true;
        }

        // 3. CRITICAL FALLBACK STRATEGY (SMS/Email/Banner)
        const isCritical = ['NEW_MISSION', 'TECH_EN_ROUTE', 'OWNER_NOC', 'PAYMENT_VERIFIED', 'URGENT_ISSUE', 'OVERDUE_APPROVAL'].includes(options.type);
        
        if (result.pushFallbackRequired && isCritical) {
            // Trigger Email Fallback
            if (userEmail) {
                await db.collection("mail").add({
                    to: userEmail,
                    message: {
                        subject: `[URGENT] ${title}`,
                        html: wrapInLuxuryTemplate(`<p>${body}</p><p><i>This is an automated fallback alert because push notifications are disabled on your device.</i></p>`, title)
                    },
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                result.mailQueued = true;
            }

            // In-app urgent banner payload
            await db.collection("in_app_alerts").add({
                userId,
                title,
                body,
                severity: 'CRITICAL',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false
            });
        }

        // 4. LOG & LOCK
        await dedupRef.set({ timestamp: admin.firestore.FieldValue.serverTimestamp() });
        await db.collection("notification_outcomes").add({
            userId, title, eventKey, ...result, createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

    } catch (err) {
        console.error("🚨 [NOTIFY] Critical Handshake Failure:", err);
    }
    return result;
}

// Communication Triggers
export const onApprovalStagnant = onSchedule("every 24 hours", async () => {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pending = await db.collection("maintenanceTickets")
        .where("status", "==", "AWAITING_OWNER_APPROVAL")
        .where("updatedAt", "<", admin.firestore.Timestamp.fromDate(fortyEightHoursAgo))
        .get();

    for (const doc of pending.docs) {
        const data = doc.data();
        if (data.ownerId) {
            await dispatchOmniNotification(data.ownerId, "REMINDER: Quote Approval Required", `Mission #${doc.id.substring(0,8)} is awaiting your authorization.`);
        }
    }
});

export const onTicketStatusChanged = onDocumentUpdated("maintenanceTickets/{id}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (before?.status === after?.status) return;

    if (after?.status === 'ESTIMATED' && after?.ownerId) {
        await dispatchOmniNotification(after.ownerId, "NEW QUOTE GENERATED", `A technical estimate for #${event.params.id.substring(0,8)} is ready for review.`);
    }
});

// ─── [V11] MAINTENANCE APPROVAL ENGINE & CRONS ───────────────────────────────────

export const evaluateSLACron = onSchedule("every 4 hours", async (event) => {
    const now = admin.firestore.Timestamp.now();
    const twentyFourHoursAgo = new Date(now.toDate().getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.toDate().getTime() - 48 * 60 * 60 * 1000);

    const batch = db.batch();

    // 1. Stale OPEN tickets (Breach Detection)
    const staleTickets = await db.collection("maintenanceTickets")
        .where("status", "in", ["OPEN", "assigned"])
        .where("createdAt", "<", admin.firestore.Timestamp.fromDate(twentyFourHoursAgo))
        .get();

    for (const doc of staleTickets.docs) {
        const ticket = doc.data();
        if (ticket.slaViolated) continue;

        batch.update(doc.ref, { slaViolated: true, lastEscalatedAt: now });

        if (ticket.ownerId) {
            const ownerSnap = await db.collection("owners").doc(ticket.ownerId).get();
            const ownerData = ownerSnap.data();
            const tier = ownerData?.planType || 'institutional';
            let penaltyAmount = tier === 'sovereign' ? 150 : (tier === 'premium' ? 100 : 50);

            const creditRef = db.collection("transactions").doc();
            batch.set(creditRef, {
                ownerId: ticket.ownerId,
                propertyId: ticket.propertyId || 'PORTFOLIO',
                ticketId: doc.id,
                type: 'SLA_CREDIT',
                amount: penaltyAmount,
                description: `SLA Breach Credit: Resolution delay on Mission #${doc.id.substring(0,8)}`,
                status: 'RECONCILED',
                createdAt: now
            });

            const breachRef = db.collection("sla_breaches").doc();
            batch.set(breachRef, {
                ticketId: doc.id,
                ownerId: ticket.ownerId,
                tier,
                penaltyAmount,
                detectedAt: now,
                resolved: false
            });
        }

        const adminsSnap = await db.collection("users").where("role", "in", ["admin", "ADMIN"]).get();
        for (const adminDoc of adminsSnap.docs) {
            await dispatchOmniNotification(adminDoc.id, "SLA BREACH", `Ticket #${doc.id.substring(0,8)} is stagnant. Penalty applied.`);
        }
    }

    // 2. Overdue Approvals (> 48h)
    const overdueApprovals = await db.collection("maintenanceTickets")
        .where("status", "==", "AWAITING_OWNER_APPROVAL")
        .where("updatedAt", "<", admin.firestore.Timestamp.fromDate(fortyEightHoursAgo))
        .get();

    for (const doc of overdueApprovals.docs) {
        batch.update(doc.ref, { status: 'OVERDUE_APPROVAL', lastEscalatedAt: now });
        const data = doc.data();
        if (data.ownerId) {
            await dispatchOmniNotification(data.ownerId, "APPROVAL OVERDUE", `Mission #${doc.id.substring(0,8)} requires urgent approval.`);
        }
    }

    await batch.commit();
});

export const onMaintenanceTicketCreated = onDocumentCreated("maintenanceTickets/{ticketId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ticket = snap.data();
    
    // Auto-enrichment
    const update: any = { 
        createdAt: ticket.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        intelligenceFlag: "ACTIVE" 
    };

    // Priority Escalation Logic
    const text = ((ticket.description || "") + (ticket.trade || "")).toLowerCase();
    const urgentKeywords = ["flood", "fire", "smoke", "burst", "leak", "danger", "sos", "power"];
    if (urgentKeywords.some(key => text.includes(key))) {
        update.priority = "EMERGENCY";
    }

    await snap.ref.update(update);
});

export const autoRouteTicket = onDocumentCreated("maintenanceTickets/{ticketId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ticketData = snap.data();

    try {
        const tenantDoc = await db.collection("users").doc(ticketData.tenantId).get();
        const tenantData = tenantDoc.data();

        let propertyData: any = null;
        if (ticketData.propertyId) {
            const propSnap = await db.collection("properties").doc(ticketData.propertyId).get();
            if (propSnap.exists) propertyData = propSnap.data();
        }

        const propertyGeo = normalizeGeo(propertyData || ticketData);
        const contextUpdate = {
            companyId: ticketData.companyId || propertyData?.companyId || "BIN_GROUP",
            tenantPhone: tenantData?.phone || tenantData?.phoneNumber || "N/A",
            ownerId: propertyData?.ownerId || ticketData.ownerId || null,
            emirate: propertyGeo?.emirate || propertyData?.emirate || ticketData.emirate || tenantData?.emirate || "",
            city: propertyGeo?.city || propertyData?.city || ticketData.city || "",
            area: propertyGeo?.area || propertyData?.area || ticketData.area || propertyData?.serviceZone || "",
            geo: propertyGeo,
            propertyLocation: {
                address: propertyGeo?.address || propertyData?.address || ticketData.address || "UAE Portfolio",
                propertyName: propertyData?.name || ticketData.propertyName || "Institutional Asset",
                unitNumber: ticketData.unitNumber || "N/A",
                floorNumber: ticketData.floorNumber || "N/A",
                location: propertyGeo ? { lat: propertyGeo.lat, lng: propertyGeo.lng } : null,
                geo: propertyGeo
            }
        };
        await snap.ref.update(contextUpdate);

        if (!propertyGeo || !contextUpdate.emirate) {
            await snap.ref.update({
                status: "pending_assignment",
                assignmentStatus: "admin_manual_assignment",
                assignmentError: "Missing verified geo-anchor. Admin review is required.",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection("adminAlerts").add({
                companyId: contextUpdate.companyId,
                type: "GEO_ANCHOR_MISSING",
                ticketId: event.params.ticketId,
                propertyId: ticketData.propertyId || null,
                message: "Ticket cannot auto-assign until property geo-anchor is verified.",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return;
        }

        // Routing Logic
        const techQuery = await db.collection("users")
            .where("role", "==", "technician")
            .get();

        const requiredSkill = String(ticketData.complaintCategory || ticketData.trade || "").toLowerCase();
        const candidates = techQuery.docs
            .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }))
            .filter((tech) => {
                const data = tech.data;
                const onDuty = data.onDuty === true || data.available === true || data.isOffDuty === false;
                const hasCapacity = Number(data.currentJobCount || 0) < Number(data.maxConcurrentJobs || 3);
                const emiratesCovered = Array.isArray(data.emiratesCovered) ? data.emiratesCovered : [data.emirate].filter(Boolean);
                const sameEmirate = emiratesCovered.map((e: any) => String(e).toLowerCase()).includes(String(contextUpdate.emirate).toLowerCase());
                const skills = Array.isArray(data.tradeSkills) ? data.tradeSkills.map((s: any) => String(s).toLowerCase()) : [String(data.trade || data.specialization || "").toLowerCase()];
                const skillMatch = !requiredSkill || skills.some((skill: string) => requiredSkill.includes(skill) || skill.includes(requiredSkill));
                return onDuty && hasCapacity && sameEmirate && skillMatch;
            })
            .map((tech) => {
                const data = tech.data;
                const liveLocation = normalizeGeo({ geo: data.liveLocation, location: data.liveLocation });
                const citiesCovered = Array.isArray(data.citiesCovered) ? data.citiesCovered.map((c: any) => String(c).toLowerCase()) : [];
                const sameCity = citiesCovered.includes(String(contextUpdate.city).toLowerCase()) || String(data.currentDutyArea || data.primaryArea || "").toLowerCase() === String(contextUpdate.city).toLowerCase();
                const sameArea = String(data.currentDutyArea || data.primaryArea || "").toLowerCase() === String(contextUpdate.area).toLowerCase();
                return {
                    ...tech,
                    distance: liveLocation ? distanceKm(liveLocation, propertyGeo) : Number.POSITIVE_INFINITY,
                    sameCity,
                    sameArea,
                    jobCount: Number(data.currentJobCount || 0),
                    rating: Number(data.rating || 0)
                };
            })
            .sort((a, b) => Number(b.sameArea) - Number(a.sameArea) || Number(b.sameCity) - Number(a.sameCity) || a.distance - b.distance || a.jobCount - b.jobCount || b.rating - a.rating);

        if (candidates.length > 0) {
            const bestTech = candidates[0];
            console.log("[AUTO_ROUTE_DECISION]", {
                ticketId: event.params.ticketId,
                assignedTechnicianId: bestTech.id,
                emirate: contextUpdate.emirate,
                city: contextUpdate.city,
                area: contextUpdate.area,
                sameArea: bestTech.sameArea,
                sameCity: bestTech.sameCity,
                distanceKm: Number.isFinite(bestTech.distance) ? Number(bestTech.distance.toFixed(2)) : null,
                candidateCount: candidates.length
            });
            await snap.ref.update({
                assignedTechnicianId: bestTech.id,
                assignedTechnicianName: bestTech.data.displayName || bestTech.data.name || "Specialist",
                status: "assigned",
                assignmentStatus: "technician_notified",
                assignmentReason: {
                    sameArea: bestTech.sameArea,
                    sameCity: bestTech.sameCity,
                    distanceKm: Number.isFinite(bestTech.distance) ? Number(bestTech.distance.toFixed(2)) : null,
                    emirate: contextUpdate.emirate
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await dispatchOmniNotification(bestTech.id, "New Job Assigned", `${ticketData.complaintCategory || ticketData.trade || "Fault"} at ${contextUpdate.propertyLocation.propertyName}, ${contextUpdate.area || contextUpdate.emirate}`, {
                url: `/tech`,
                extraData: {
                    ticketId: event.params.ticketId,
                    propertyId: ticketData.propertyId,
                    tenantId: ticketData.tenantId,
                    priority: ticketData.priority || "MEDIUM",
                    openRoute: true
                }
            });
        } else {
            console.log("[AUTO_ROUTE_ESCALATION]", {
                ticketId: event.params.ticketId,
                emirate: contextUpdate.emirate,
                city: contextUpdate.city,
                area: contextUpdate.area,
                reason: "NO_LOCAL_TECHNICIAN"
            });
            await snap.ref.update({
                status: "pending_assignment",
                assignmentStatus: "admin_manual_assignment",
                assignmentError: `No on-duty ${contextUpdate.emirate} technician matched this ticket.`,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection("adminAlerts").add({
                companyId: contextUpdate.companyId,
                type: "NO_LOCAL_TECHNICIAN",
                ticketId: event.params.ticketId,
                propertyId: ticketData.propertyId || null,
                emirate: contextUpdate.emirate,
                city: contextUpdate.city || null,
                area: contextUpdate.area || null,
                message: `No local technician available for ${contextUpdate.area || contextUpdate.city || contextUpdate.emirate}.`,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (err) {
        console.error("AutoRoute Failure:", err);
    }
});

// ─── [V8] AI MISSION GUIDANCE ─────────────────────────────────────────────────────
export const getMissionGuidance = onCall({ cors: true, secrets: [openAiKey] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Session invalid.');
    
    try {
        const { input } = request.data;
        const apiKey = openAiKey.value();
        
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are the BIN GROUP Sovereign AI assistant for UAE property operations." },
                    { role: "user", content: input }
                ],
                max_tokens: 250
            })
        });

        if (!response.ok) throw new Error("AI Backend Rejection");
        const data = await response.json();
        return { status: "SUCCESS", guidance: data.choices?.[0]?.message?.content };
    } catch (error) {
        throw new HttpsError('internal', 'AI backend unavailable.');
    }
});

// ─── [V8] CORE SYSTEM LOGIC ───────────────────────────────────────────────────────

export const onIntakeCreated = onDocumentCreated("intake_submissions/{id}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    try {
        await db.collection("properties").add({
            propertyName: data.propertyName || 'New Asset',
            ownerEmail: data.ownerEmail,
            status: 'PENDING_APPROVAL',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await snap.ref.update({ status: 'PROCESSED' });
    } catch (err) {
        await snap.ref.update({ status: 'ERROR', error: String(err) });
    }
});

export const processMailQueue = onDocumentCreated({ document: "mail/{docId}", secrets: [smtpUserSecret, smtpPassSecret] }, async (event) => {
    const snap = event.data;
    if (!snap) return;
    try {
        const mailTransport = nodemailer.createTransport({
            host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: smtpUserSecret.value(), pass: smtpPassSecret.value() }
        });
        const mailData = snap.data();
        await mailTransport.sendMail({
            from: `"BIN GROUP" <${smtpUserSecret.value()}>`,
            to: mailData.to,
            subject: mailData.message?.subject || 'Update',
            html: mailData.message?.html || ''
        });
        await snap.ref.update({ delivery: { state: 'SUCCESS', deliveredAt: admin.firestore.FieldValue.serverTimestamp() } });
    } catch (err: any) {
        await snap.ref.update({ delivery: { state: 'ERROR', error: err.message } });
    }
});

export const scheduledDailyBackup = onSchedule("0 3 * * *", async () => {
    try {
        const client = new admin.firestore.v1.FirestoreAdminClient();
        const projectId = admin.app().options.projectId || 'bin-group-57c60';
        const bucket = `gs://${projectId}.appspot.com/backups/live/${new Date().toISOString()}`;
        await client.exportDocuments({ name: client.databasePath(projectId, '(default)'), outputUriPrefix: bucket, collectionIds: [] });
    } catch (err: any) {
        console.error("Backup Failure:", err.message);
    }
});

// ─── [V12] ASYNC SUMMARY AGGREGATORS ──────────────────────────────────────────

export const syncOwnerSummary = onDocumentUpdated("maintenanceTickets/{id}", async (event) => {
    const data = event.data?.after.data();
    if (!data?.ownerId) return;

    const ownerId = data.ownerId;
    const ticketsSnap = await db.collection("maintenanceTickets").where("ownerId", "==", ownerId).get();
    const propsSnap = await db.collection("properties").where("ownerId", "==", ownerId).get();
    
    let openCount = 0;
    let totalBpi = 0;
    const riskAssets: any[] = [];

    ticketsSnap.forEach(docSnap => {
        const t = docSnap.data();
        if (!['COMPLETED', 'CLOSED', 'RESOLVED'].includes(t.status)) openCount++;
    });

    propsSnap.forEach(docSnap => {
        const p = docSnap.data();
        const score = p.lastBpi || 90;
        totalBpi += score;
        if (score < 75) riskAssets.push({ id: docSnap.id, name: p.propertyName || p.name, score });
    });

    await db.collection("owner_summaries").doc(ownerId).set({
        openTickets: openCount,
        propertyCount: propsSnap.size,
        avgBpi: propsSnap.size > 0 ? Math.round(totalBpi / propsSnap.size) : 100,
        riskAssets,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
});

export const syncAdminSummary = onDocumentCreated("maintenanceTickets/{id}", async (event) => {
    const summaryRef = db.collection("admin_summaries").doc("global");
    await summaryRef.update({
        openTickets: admin.firestore.FieldValue.increment(1),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => summaryRef.set({ openTickets: 1, lastUpdated: admin.firestore.FieldValue.serverTimestamp() }));
});

export const googleSecurityEvents = onRequest({ cors: true }, async (req, res) => { res.status(202).send("Accepted"); });
export const getSovereignSystemStats = onCall({ cors: true }, async () => ({ status: "OK" }));

/**
 * [V8.2] INSTITUTIONAL DOCUMENT OCR PROTOCOL
 */
export const processTitleDeedOCR = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sovereign identity required.");
    
    const { fileUrl } = request.data;
    if (!fileUrl) throw new HttpsError("invalid-argument", "Missing document stream.");

    try {
        const extractedData = await extractTitleDeedData(fileUrl);
        
        // Log OCR attempt for audit
        await db.collection("ocr_audit_logs").add({
            userId: request.auth.uid,
            fileUrl,
            extractedData,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            status: "SUCCESS",
            data: extractedData,
            verified: (extractedData.confidenceScore || 0) > 0.85
        };
    } catch (err: any) {
        console.error("OCR Protocol Fault:", err);
        throw new HttpsError("internal", "Document parsing node failed.");
    }
});

/**
 * [V8.2] INSTITUTIONAL CONTRACT GENERATION PROTOCOL
 */
export const generateInstitutionalContract = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sovereign identity required.");
    
    const { contractData } = request.data;
    if (!contractData) throw new HttpsError("invalid-argument", "Missing contract payload.");

    try {
        const pdfUrl = await generateContractPDF({
            ...contractData,
            ownerId: request.auth.uid
        });

        return {
            status: "SUCCESS",
            pdfUrl,
            timestamp: new Date().toISOString()
        };
    } catch (err: any) {
        console.error("Contract Node Fault:", err);
        throw new HttpsError("internal", "Contract synthesis failed.");
    }
});
