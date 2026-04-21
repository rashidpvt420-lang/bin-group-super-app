import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

// [V8] PRODUCTION GRADE STABILIZATION
setGlobalOptions({ region: "europe-west3" });

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// Secrets
const openAiKey = defineSecret("OPENAI_API_KEY");
const smtpUserSecret = defineSecret("SMTP_USER");
const smtpPassSecret = defineSecret("SMTP_PASS");

// ─── [V7.1] SOVEREIGN PRESTIGE INFRASTRUCTURE ─────────────────────────────────────
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

// ─── [V5] OMNI-CHANNEL NOTIFICATION ENGINE ─────────────────────────────────────────
async function dispatchOmniNotification(userId: string, title: string, body: string, emailOptions: any = null, extraData: any = {}) {
    const result = { pushSent: false, mailQueued: false };
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) {
            console.log(`[V5 Omni] User ${userId} not found. Aborting dispatch.`);
            return result;
        }

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
                    userId: String(userId),
                    ticketId: String(extraData.ticketId || ''),
                    ...Object.entries(extraData).reduce((acc: any, [k, v]) => {
                        acc[k] = (typeof v === 'object' && v !== null) ? JSON.stringify(v) : String(v);
                        return acc;
                    }, {})
                }
            };
            try {
                await admin.messaging().send(payload);
                result.pushSent = true;
            } catch (err: any) {
                console.error(`[V5 Omni] Push transmission failed for ${userId}:`, err.message || err);
            }
        } else {
            console.log(`[V5 Omni] No registered FCM token for ${userId}. Skipping push.`);
        }

        // 2. Dispatch Email
        if (emailOptions && userEmail) {
            await db.collection("mail").add({
                to: userEmail,
                message: {
                    subject: emailOptions.subject || title,
                    html: emailOptions.template || wrapInLuxuryTemplate(`
                        <h2 style="color: #C6A75E;">BIN-GROUP Update</h2>
                        <p>${body}</p>
                    `, title)
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            result.mailQueued = true;
        } else {
            console.log(`[V5 Omni] Email options not provided or no email exists for ${userId}. Skipping email.`);
        }
        
    } catch (error) {
        console.error(`[V5 Omni] Core Dispatch Exception for user ${userId}:`, error);
    }
    
    return result;
}

// ─── [V5] TICKET ROUTING & CONTEXT ATTACHMENT ─────────────────────────────────────
export const autoRouteTicket = onDocumentCreated("maintenanceTickets/{ticketId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ticketData = snap.data();
    const ticketId = event.params.ticketId;

    try {
        // Fetch full context
        const tenantDoc = await db.collection("users").doc(ticketData.tenantId).get();
        const tenantData = tenantDoc.data();

        let propertyData: any = null;
        if (ticketData.propertyId) {
            const propSnap = await db.collection("properties").doc(ticketData.propertyId).get();
            if (propSnap.exists) propertyData = propSnap.data();
        }

        // Attach missing context to the ticket
        const contextUpdate = {
            tenantPhone: tenantData?.phone || tenantData?.phoneNumber || "N/A",
            propertyLocation: {
                address: propertyData?.address || ticketData.address || "UAE Portfolio",
                propertyName: propertyData?.name || ticketData.propertyName || "Institutional Asset",
                unitNumber: ticketData.unitNumber || "N/A",
                floorNumber: ticketData.floorNumber || "N/A",
                location: propertyData?.location || null,
                lat: propertyData?.location?.lat || propertyData?.location?.latitude || null,
                lng: propertyData?.location?.lng || propertyData?.location?.longitude || null
            }
        };
        await snap.ref.update(contextUpdate);

        // Routing Logic
        let emirate = ticketData.emirate || tenantData?.emirate;
        let serviceZone = ticketData.serviceZone || tenantData?.serviceZone;

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
                assignedTechnicianId: bestTech.id,
                assignedTechnicianName: bestTech.displayName || "Technician Specialist",
                status: "assigned",
                autoDispatchStatus: "SUCCESS_V8_CONTEXT",
                dispatchedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await dispatchOmniNotification(
                bestTech.id,
                `MISSION ASSIGNED: ${ticketData.trade || 'Issue'}`,
                `Location: ${contextUpdate.propertyLocation.propertyName}, Unit ${ticketData.unitNumber}. Tap to view.`,
                { subject: "New Mission Assignment - BIN GROUP" },
                { ticketId, url: `/tech/ticket/${ticketId}`, tenantPhone: contextUpdate.tenantPhone }
            );
        }
    } catch (error) {
        console.error(`[V8 Dispatch] Failure:`, error);
    }
});

export const getMissionGuidance = onCall({ cors: true, secrets: [openAiKey] }, async (request) => {
    // 1. IAM Auth Lock
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Sovereign ID verification failed. Session invalid.');
    }
    
    try {
        if (!request.data || typeof request.data.input !== "string" || !request.data.input.trim()) {
            return { status: "ERROR", error: "Invalid request payload." };
        }
        const { input, role } = request.data;
        const userRole = role || "unknown";
        
        let apiKey = "";
        try {
            apiKey = openAiKey.value();
        } catch (e: any) {
            console.error("Failed to read OPENAI_API_KEY secret:", e);
            throw new HttpsError('internal', 'AI Key integration fault.');
        }

        if (!apiKey) {
            throw new HttpsError('internal', 'AI Key configuration missing.');
        }

        const systemPrompt = `You are the BIN GROUP Sovereign AI, an elite institutional property management assistant for UAE real estate.
        User Role: ${userRole}
        Tone: Professional, prestigious, authoritative, and helpful.
        Context: UAE Real Estate laws, Dubai/Abu Dhabi standards.
        Instructions: Provide concise, high-impact guidance. If the user reports a critical issue (AC failure, major leak, fire), advise them to use the SOS protocol immediately.`;

        // 2. Make native fetch call
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: input }
                ],
                max_tokens: 250,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("OpenAI API rejection:", response.status, errorData);
            throw new HttpsError('internal', 'AI backend temporarily unavailable. Please try again.');
        }

        const data = await response.json();
        
        return { 
            status: "V8_PRODUCTION_READY", 
            guidance: data.choices?.[0]?.message?.content || "No response generated.",
            timestamp: new Date().toISOString()
        };
    } catch (error: any) {
        console.error("AI Guidance Failure Node:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'AI backend temporarily unavailable. Please try again.');
    }
});

// STUBS & OTHER TRIGGERS
export const onTicketStatusUpdate = onDocumentUpdated("maintenanceTickets/{ticketId}", async (event) => {
    const after = event.data?.after.data();
    if (after?.status === 'EN_ROUTE') {
        await dispatchOmniNotification(after.tenantId, "Technician En Route", "Your service specialist is moving towards your location now.");      
    }
});

export const getSovereignSystemStats = onCall({ cors: true }, async () => ({ status: "OK" }));
export const onMaintenanceTicketCreated = onDocumentCreated("maintenanceTickets/{ticketId}", async (event) => {
    const snap = event.data;
    if (snap) {
        await snap.ref.update({ createdAt: admin.firestore.FieldValue.serverTimestamp(), intelligenceFlag: "ACTIVE" });
    }
});

export const googleSecurityEvents = onRequest({ cors: true }, async (req, res) => { res.status(202).send("Accepted"); });

// [V8] Intake Workflow LIVE
export const onIntakeCreated = onDocumentCreated("intake_submissions/{id}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    
    try {
        const safePropertyData = {
            propertyName: typeof data.propertyName === 'string' ? data.propertyName : 'New Asset',
            propertyType: typeof data.propertyType === 'string' ? data.propertyType : 'Unknown',
            emirate: typeof data.emirate === 'string' ? data.emirate : 'Dubai',
            address: typeof data.address === 'string' ? data.address : '',
            unitCount: typeof data.unitCount === 'number' ? data.unitCount : 0,
            ownerEmail: typeof data.ownerEmail === 'string' ? data.ownerEmail : '',
            ownerPhone: typeof data.ownerPhone === 'string' ? data.ownerPhone : ''
        };

        await db.collection("properties").add({
            ...safePropertyData,
            status: 'PENDING_APPROVAL',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await snap.ref.update({ status: 'PROCESSED', processedAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`[INTAKE] Submission ${event.params.id} routed to sovereign properties vault successfully.`);
    } catch (err) {
        console.error(`[INTAKE] Failure routing ${event.params.id}:`, String(err));
        await snap.ref.update({ status: 'ERROR', error: String(err) });
    }
});

// [V8] Mail Transport LIVE using Firebase Secrets integration
export const processMailQueue = onDocumentCreated({ document: "mail/{docId}", secrets: [smtpUserSecret, smtpPassSecret] }, async (event) => {
    const snap = event.data;
    if (!snap) return;
    const mailData = snap.data();
    
    try {
        const mailTransport = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: smtpUserSecret.value(),
                pass: smtpPassSecret.value()
            }
        });

        await mailTransport.sendMail({
            from: `"BIN GROUP" <${smtpUserSecret.value()}>`,
            to: mailData.to,
            subject: mailData.message?.subject || 'BIN GROUP Update',
            html: mailData.message?.html || ''
        });
        await snap.ref.update({ delivery: { state: 'SUCCESS', deliveredAt: admin.firestore.FieldValue.serverTimestamp() } });
        console.log(`[MAIL] Successfully dispatched outbox ID: ${event.params.docId}`);
    } catch (err: any) {
        console.error(`[MAIL] Dispatch block error for ${event.params.docId}:`, err);
        await snap.ref.update({ delivery: { state: 'ERROR', error: err.message, timestamp: admin.firestore.FieldValue.serverTimestamp() } });
    }
});

// [V8] Automated Sovereign Database Backups LIVE
export const scheduledDailyBackup = onSchedule("0 3 * * *", async () => {
    try {
        const client = new admin.firestore.v1.FirestoreAdminClient();
        const projectId = admin.app().options.projectId || process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || 'bin-group-57c60';
        const databaseName = client.databasePath(projectId, '(default)');
        const bucket = `gs://${projectId}.appspot.com/backups/live/${new Date().toISOString()}`;
        
        await client.exportDocuments({
            name: databaseName,
            outputUriPrefix: bucket,
            collectionIds: [] // Exports all collections
        });
        console.log(`[BACKUP] Initialized sovereign vault snapshot at ${bucket}`);
    } catch (err: any) {
        console.error(`[BACKUP] Systemic export fault:`, err.message || err);
    }
});
