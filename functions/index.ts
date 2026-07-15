import { FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {
    parseFirebaseStoragePath,
    assertOcrCallerRole,
    verifyStorageObjectOwnership,
} from "./ocrSecurityGuards";
import { enforceAiUsageQuota } from "./aiUsageQuota";

// [V10] PRODUCTION GRADE FULL-STACK STABILIZATION
setGlobalOptions({ region: "europe-west3", enforceAppCheck: true });

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// Secrets
const openAiKey = defineSecret("OPENAI_API_KEY");
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const iotGatewayToken = defineSecret("IOT_GATEWAY_TOKEN");

// ─── AUDIT HELPER ──────────────────────────────────────────────────────────

async function logAudit(data: {
    actorId: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string;
    before?: any;
    after?: any;
    reason?: string;
    metadata?: any;
}) {
    try {
        await db.collection("audit_logs").add({
            ...data,
            createdAt: FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error("Audit Logging Failed:", err);
    }
}

// ─── GEOSPATIAL HELPERS ────────────────────────────────────────────────────

const geoHashBase32 = "0123456789bcdefghjkmnpqrstuvwxyz";

function geohashForLocation(latitude: number, longitude: number, precision = 9) {
    let idx = 0; let bit = 0; let evenBit = true; let geohash = "";
    let latMin = -90; let latMax = 90; let lonMin = -180; let lonMax = 180;
    while (geohash.length < precision) {
        if (evenBit) {
            const lonMid = (lonMin + lonMax) / 2;
            if (longitude >= lonMid) { idx = idx * 2 + 1; lonMin = lonMid; }
            else { idx *= 2; lonMax = lonMid; }
        } else {
            const latMid = (latMin + latMax) / 2;
            if (latitude >= latMid) { idx = idx * 2 + 1; latMin = latMid; }
            else { idx *= 2; latMax = latMid; }
        }
        evenBit = !evenBit;
        if (++bit === 5) { geohash += geoHashBase32.charAt(idx); bit = 0; idx = 0; }
    }
    return geohash;
}

function normalizeGeo(source: any) {
    const lat = Number(source?.geo?.lat ?? source?.location?.lat ?? source?.coordinates?.lat ?? source?.lat);
    const lng = Number(source?.geo?.lng ?? source?.location?.lng ?? source?.coordinates?.lng ?? source?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return {
        point: new admin.firestore.GeoPoint(lat, lng),
        lat, lng,
        geohash: source?.geo?.geohash || geohashForLocation(lat, lng),
        source: source?.geo?.source || "property_record",
        placeId: source?.geo?.placeId || source?.googlePlaceId || "",
        address: source?.geo?.address || source?.addressLine || source?.address || "",
        emirate: source?.geo?.emirate || source?.emirate || "",
        city: source?.geo?.city || source?.city || source?.area || source?.serviceZone || "",
        area: source?.geo?.area || source?.area || source?.serviceZone || "",
        verified: source?.geo?.verified === true,
        updatedAt: FieldValue.serverTimestamp()
    };
}

function distanceKm(a: any, b: any) {
    const lat1 = Number(a?.lat); const lng1 = Number(a?.lng);
    const lat2 = Number(b?.lat); const lng2 = Number(b?.lng);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
    const toRad = (value: number) => value * Math.PI / 180;
    const radius = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ─── ACCESS CONTROL ────────────────────────────────────────────────────────

const normalizeRole = (value: unknown) => String(value || "").trim().toLowerCase();

async function hasCallableRoleAccess(authContext: any, allowedRoles: Set<string>) {
    const token = authContext?.token || {};
    if (!authContext?.uid || token.suspended === true) return false;
    const tokenRole = normalizeRole(token.role || token.userRole || token.primaryRole);
    return token.admin === true || token.super_admin === true || token.superAdmin === true || allowedRoles.has(tokenRole);
}

async function assertApprovedTechnicianAccount(authContext: any) {
    const isAdminActor = await hasCallableRoleAccess(
        authContext,
        new Set(["admin", "super_admin", "operations_admin"]),
    );
    if (isAdminActor) return;

    const hasTechnicianClaim = await hasCallableRoleAccess(authContext, new Set(["technician"]));
    if (!hasTechnicianClaim || !authContext?.uid) {
        throw new HttpsError("permission-denied", "Technician access required.");
    }
    const [userSnap, technicianSnap] = await Promise.all([
        db.collection("users").doc(authContext.uid).get(),
        db.collection("technicians").doc(authContext.uid).get(),
    ]);
    const user = userSnap.data() || {};
    const technician = technicianSnap.data() || {};
    const status = normalizeRole(technician.status || user.status);
    const approvalStatus = normalizeRole(technician.approvalStatus || user.approvalStatus);
    const suspended =
        status === "suspended" ||
        technician.suspended === true ||
        user.suspended === true ||
        authContext.token?.suspended === true;
    if (suspended || (status !== "active" && approvalStatus !== "approved")) {
        throw new HttpsError(
            "permission-denied",
            "Only approved, active technicians may perform operational actions.",
        );
    }
}

function assignedTechnicianId(ticketData: FirebaseFirestore.DocumentData) {
    return safeString(ticketData.assignedTechnicianId || ticketData.technicianId || ticketData.assignedTechId || ticketData.techId);
}

async function assertTechnicianTicketMutationAccess(authContext: any, ticketData: FirebaseFirestore.DocumentData) {
    const hasAccess = await hasCallableRoleAccess(authContext, new Set(["technician", "admin", "super_admin", "operations_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Technician access required.");

    const isAdminActor = await hasCallableRoleAccess(authContext, new Set(["admin", "super_admin", "operations_admin"]));
    if (isAdminActor) return;

    await assertApprovedTechnicianAccount(authContext);
    const assignedId = assignedTechnicianId(ticketData);
    if (!assignedId) throw new HttpsError("failed-precondition", "Ticket is not assigned to this technician.");
    if (assignedId !== authContext.uid) throw new HttpsError("permission-denied", "You are not assigned to this mission.");
}

function assertPlainObject(value: any, label: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new HttpsError("invalid-argument", `${label} is required.`);
    }
    return value;
}

function safeString(value: any, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
}

export const submitOwnerOnboarding = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in before submitting onboarding.");

    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["owner", "admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Only an owner or admin can submit owner onboarding.");
    throw new HttpsError(
        "failed-precondition",
        "Legacy owner onboarding is disabled because it accepted client-calculated contract values. Use submitOwnerOnboardingPaymentPackage with a locked server quote and verified signature OTP.",
    );
});


// ─── LEGACY TECHNICIAN DUTY REMOVED IN FAVOR OF STAGE 10 ─────────────────

export const takeTechnicianBreak = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    await assertApprovedTechnicianAccount(request.auth);
    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    const shiftId = userData?.currentShiftId;
    if (!shiftId) throw new HttpsError("failed-precondition", "No active shift found.");

    const now = FieldValue.serverTimestamp();
    const nowDate = new Date();

    const batch = db.batch();
    batch.update(userRef, { dutyStatus: 'ON_BREAK', onDuty: true, isAvailable: false, available: false, breakStartedAt: now, updatedAt: now });
    batch.update(db.collection("technician_shifts").doc(shiftId), {
        status: "ON_BREAK",
        breaks: FieldValue.arrayUnion({ start: nowDate, type: 'STANDARD', startedBy: uid }),
        updatedAt: now
    });

    await batch.commit();
    await logAudit({ actorId: uid, actorRole: "technician", action: "TECH_TAKE_BREAK", targetType: "technician_shift", targetId: shiftId });
    return { status: "SUCCESS" };
});

export const resumeTechnicianDuty = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    await assertApprovedTechnicianAccount(request.auth);
    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    const shiftId = userData?.currentShiftId;
    if (!shiftId) throw new HttpsError("failed-precondition", "No active shift found.");

    const shiftDoc = await db.collection("technician_shifts").doc(shiftId).get();
    const shiftData = shiftDoc.data();
    const breaks = shiftData?.breaks || [];
    if (breaks.length > 0) {
        const lastBreak = breaks[breaks.length - 1];
        if (!lastBreak.end) {
            lastBreak.end = new Date();
        }
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.update(userRef, { dutyStatus: 'ON_DUTY', onDuty: true, isAvailable: true, available: true, breakEndedAt: now, updatedAt: now });
    batch.update(db.collection("technician_shifts").doc(shiftId), {
        status: "ACTIVE",
        breaks,
        updatedAt: now
    });

    await batch.commit();
    await logAudit({ actorId: uid, actorRole: "technician", action: "TECH_RESUME_DUTY", targetType: "technician_shift", targetId: shiftId });
    return { status: "SUCCESS" };
});

export const acceptTechnicianTicket = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["technician", "admin", "super_admin", "operations_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Technician access required.");
    const { ticketId } = request.data;
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const isAdminActor = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin", "operations_admin"]));
    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
        const ticketDoc = await transaction.get(ticketRef);
        if (!ticketDoc.exists) throw new HttpsError("not-found", "Ticket not found.");
        const ticketData = ticketDoc.data()!;
        const existingTechId = assignedTechnicianId(ticketData);

        if (!isAdminActor) {
            const [userDoc, technicianDoc] = await Promise.all([
                transaction.get(db.collection("users").doc(request.auth!.uid)),
                transaction.get(db.collection("technicians").doc(request.auth!.uid)),
            ]);
            const userData = userDoc.data() || {};
            const technicianData = technicianDoc.data() || {};
            const status = normalizeRole(technicianData.status || userData.status);
            const suspended = technicianData.suspended === true || userData.suspended === true || status === "suspended";
            const approved = status === "active" ||
                normalizeRole(technicianData.approvalStatus || userData.approvalStatus) === "approved";
            if (suspended || !approved) {
                throw new HttpsError("permission-denied", "Only approved, active technicians can accept tickets.");
            }
            if (!existingTechId) {
                throw new HttpsError(
                    "failed-precondition",
                    "This mission must be assigned by dispatch before it can be accepted.",
                );
            }
            if (
                normalizeRole(ticketData.status) === "emergency_submitted" &&
                technicianData.emergencyEligible !== true &&
                userData.emergencyEligible !== true
            ) {
                throw new HttpsError("permission-denied", "Emergency eligibility is required to accept an SOS ticket.");
            }
        }

        if (existingTechId && existingTechId !== request.auth!.uid && !isAdminActor) {
            throw new HttpsError("failed-precondition", "Ticket is already assigned to another technician.");
        }

        if (!['OPEN', 'open', 'AUTO_ASSIGNED', 'auto_assigned', 'ASSIGNED', 'assigned', 'pending_assignment', 'PENDING_ASSIGNMENT', 'emergency_submitted', 'EMERGENCY_SUBMITTED'].includes(ticketData.status)) {
            throw new HttpsError("failed-precondition", "Ticket is not available for acceptance.");
        }

        const finalTechId = existingTechId || request.auth!.uid;
        transaction.update(ticketRef, {
            status: 'ACCEPTED',
            assignedTechnicianId: finalTechId,
            technicianId: finalTechId,
            acceptedAt: now,
            updatedAt: now
        });
    });

    await logAudit({
        actorId: request.auth.uid, actorRole: "technician",
        action: "ACCEPT_TICKET", targetType: "maintenanceTickets", targetId: ticketId
    });

    return { status: "SUCCESS" };
});

export const updateTicketLifecycle = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const { ticketId, status, notes, proofType, proofUrl, arrivalLocation } = request.data;
    const allowedStatuses = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED_PENDING_APPROVAL', 'COMPLETED'];
    if (!allowedStatuses.includes(status)) throw new HttpsError("invalid-argument", "Invalid status transition.");
    const hasAccess = await hasCallableRoleAccess(
        request.auth,
        new Set(["technician", "admin", "super_admin", "operations_admin"]),
    );
    if (!hasAccess) throw new HttpsError("permission-denied", "Technician access required.");
    const isAdminActor = await hasCallableRoleAccess(
        request.auth,
        new Set(["admin", "super_admin", "operations_admin"]),
    );
    if (!isAdminActor) await assertApprovedTechnicianAccount(request.auth);

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const requestedStatus = String(status || "").trim().toUpperCase();
    const allowedTransitions: Record<string, string[]> = {
        ACCEPTED: ["EN_ROUTE"],
        ASSIGNED: ["EN_ROUTE"],
        EN_ROUTE: ["ARRIVED"],
        ARRIVED: ["IN_PROGRESS"],
        IN_PROGRESS: ["COMPLETED", "COMPLETED_PENDING_APPROVAL"],
    };
    const now = FieldValue.serverTimestamp();
    let completedOwnerId = "";
    let completedPropertyName = "";
    await db.runTransaction(async (transaction) => {
        const ticketDoc = await transaction.get(ticketRef);
        if (!ticketDoc.exists) throw new HttpsError("not-found", "Ticket not found.");
        const ticketData = ticketDoc.data()!;
        const assignedId = assignedTechnicianId(ticketData);
        if (!isAdminActor && assignedId !== request.auth!.uid) {
            throw new HttpsError("permission-denied", "You are not assigned to this mission.");
        }
        const currentStatus = String(ticketData.status || "").trim().toUpperCase();
        if (!(allowedTransitions[currentStatus] || []).includes(requestedStatus)) {
            throw new HttpsError("failed-precondition", `Invalid ticket transition: ${currentStatus || "UNKNOWN"} -> ${requestedStatus}.`);
        }

        const updateData: any = {
            status: requestedStatus === "COMPLETED" ? "COMPLETED_PENDING_APPROVAL" : requestedStatus,
            updatedAt: now
        };
        if (requestedStatus === 'EN_ROUTE') {
            updateData.onTheWayAt = now;
            updateData.trackingStatus = 'LIVE_TRACKING';
            updateData.dispatchStatus = 'EN_ROUTE';
        }
        if (requestedStatus === 'ARRIVED') {
            if (!arrivalLocation) {
                throw new HttpsError("failed-precondition", "Arrival GPS evidence is required.");
            }
            const lat = Number(arrivalLocation.lat ?? arrivalLocation.latitude);
            const lng = Number(arrivalLocation.lng ?? arrivalLocation.longitude);
            const accuracy = Number(arrivalLocation.accuracy);
            if (
                !Number.isFinite(lat) || !Number.isFinite(lng) ||
                lat < -90 || lat > 90 || lng < -180 || lng > 180 ||
                !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 100
            ) {
                throw new HttpsError("invalid-argument", "Arrival GPS must include coordinates with accuracy of 100 metres or better.");
            }
            let propertyGeo = normalizeGeo(ticketData.jobLocation || ticketData.propertyLocation || ticketData.geo);
            if (!propertyGeo && ticketData.propertyId) {
                const propertySnap = await transaction.get(
                    db.collection("properties").doc(String(ticketData.propertyId)),
                );
                propertyGeo = normalizeGeo(propertySnap.data() || {});
            }
            if (!propertyGeo || distanceKm({ lat, lng }, propertyGeo) > 0.25) {
                throw new HttpsError("failed-precondition", "Arrival location is outside the 250 metre property geofence.");
            }
            const cleanArrivalLocation = {
                lat,
                lng,
                latitude: lat,
                longitude: lng,
                accuracy,
                heading: arrivalLocation.heading ?? null,
                speed: arrivalLocation.speed ?? null,
            };
            updateData.arrivedAt = now;
            updateData.trackingStatus = 'ARRIVED';
            updateData.dispatchStatus = 'ARRIVED';
            updateData.arrivedLocation = cleanArrivalLocation;
            updateData.technicianLocation = cleanArrivalLocation;
            updateData.technicianLocationUpdatedAt = now;
            updateData.gpsVerified = true;
            updateData.gpsVerifiedAt = now;
            updateData.onSiteVerification = 'GPS_VERIFIED';
        }
        if (requestedStatus === 'IN_PROGRESS') {
            updateData.startedAt = now;
            updateData.trackingStatus = 'WORK_STARTED';
            updateData.dispatchStatus = 'IN_PROGRESS';
        }
        if (requestedStatus === 'COMPLETED' || requestedStatus === 'COMPLETED_PENDING_APPROVAL') {
            const nextBeforePhotoUrl = proofType === 'BEFORE' && proofUrl ? proofUrl : ticketData.beforePhotoUrl;
            const nextAfterPhotoUrl = proofType === 'AFTER' && proofUrl ? proofUrl : ticketData.afterPhotoUrl;
            const nextNotes = String(notes || ticketData.notes || ticketData.technicianNotes || '').trim();
            const beforeCollections = [
                ticketData.beforePhotos,
                ticketData.photos,
                ticketData.tenantPhotos,
                ticketData.initialPhotoUrls,
            ];
            const afterCollections = [
                ticketData.afterPhotos,
                ticketData.completionPhotos,
                ticketData.proofPhotos,
                ticketData.evidencePhotos,
            ];
            const hasBeforeProof = Boolean(nextBeforePhotoUrl) ||
                beforeCollections.some((items) => Array.isArray(items) && items.length > 0);
            const hasAfterProof = Boolean(nextAfterPhotoUrl) ||
                afterCollections.some((items) => Array.isArray(items) && items.length > 0);
            if (!hasBeforeProof) {
                throw new HttpsError('failed-precondition', 'Before photo proof is required before completing this ticket.');
            }
            if (!hasAfterProof) {
                throw new HttpsError('failed-precondition', 'After photo proof is required before completing this ticket.');
            }
            if (nextNotes.length < 10) {
                throw new HttpsError('failed-precondition', 'Technician completion notes are required before completing this ticket.');
            }
            updateData.completedAt = now;
            updateData.trackingStatus = 'COMPLETED';
            updateData.dispatchStatus = 'COMPLETED_PENDING_REVIEW';
            updateData.notes = nextNotes;
            updateData.technicianNotes = nextNotes;
            updateData.tenantApprovalRequired = true;
            updateData.tenantApprovalStatus = "PENDING_TENANT_REVIEW";
            updateData.capacityReleasedAt = now;
            if (assignedId) {
                const technicianRef = db.collection("users").doc(assignedId);
                const technicianSnap = await transaction.get(technicianRef);
                if (technicianSnap.exists) {
                    transaction.update(technicianRef, {
                        currentJobCount: Math.max(0, Number(technicianSnap.data()?.currentJobCount || 0) - 1),
                        updatedAt: now,
                    });
                }
            }
            completedOwnerId = safeString(ticketData.ownerId || ticketData.ownerUid);
            completedPropertyName = safeString(ticketData.propertyName, "the property");
        }
        if (proofType && proofUrl) {
            if (proofType === 'BEFORE') updateData.beforePhotoUrl = proofUrl;
            if (proofType === 'AFTER') updateData.afterPhotoUrl = proofUrl;
            if (proofType === 'SIGNATURE') updateData.signatureUrl = proofUrl;
        }
        transaction.update(ticketRef, updateData);
        transaction.set(db.collection("audit_logs").doc(), {
            actorId: request.auth!.uid,
            actorRole: isAdminActor ? "admin" : "technician",
            action: `LIFECYCLE_${requestedStatus}`,
            targetType: "maintenanceTickets",
            targetId: ticketId,
            metadata: { notes: safeString(notes, "").slice(0, 500), proofType: safeString(proofType) },
            createdAt: now,
        });
    });

    // Notify Owner on completion
    if (
        (requestedStatus === 'COMPLETED' || requestedStatus === 'COMPLETED_PENDING_APPROVAL') &&
        completedOwnerId
    ) {
        await dispatchOmniNotification(completedOwnerId, "Mission Completed", `The technician has finished the work at ${completedPropertyName}. View details in your dashboard.`);
    }

    return { status: "SUCCESS" };
});

export const ownerReviewTicketCompletion = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["owner", "admin", "super_admin", "operations_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Owner or admin access required.");

    const ticketId = safeString(request.data?.ticketId);
    const action = safeString(request.data?.action).toUpperCase();
    const reason = safeString(request.data?.reason || request.data?.notes);
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");

    const allowedActions = new Set(["APPROVE_CLOSE", "DISPUTE", "REQUEST_REVISIT", "ESCALATE"]);
    if (!allowedActions.has(action)) throw new HttpsError("invalid-argument", "Invalid owner review action.");
    if (action !== "APPROVE_CLOSE" && reason.length < 8) {
        throw new HttpsError("invalid-argument", "A clear reason is required for dispute, revisit, or escalation.");
    }

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();
    if (!ticketDoc.exists) throw new HttpsError("not-found", "Ticket not found.");
    const ticketData = ticketDoc.data() || {};
    const uid = request.auth.uid;
    const email = normalizeRole(request.auth.token?.email);
    const ticketOwnerEmail = normalizeRole(ticketData.ownerEmail);
    const tokenRole = normalizeRole(request.auth.token?.role || request.auth.token?.userRole || request.auth.token?.primaryRole);
    const isAdmin = request.auth.token?.admin === true || request.auth.token?.super_admin === true || request.auth.token?.superAdmin === true || ["admin", "super_admin", "operations_admin"].includes(tokenRole);
    if (!isAdmin) {
        const ownerUser = await admin.auth().getUser(uid);
        if (
            tokenRole !== "owner" ||
            request.auth.token?.email_verified !== true ||
            request.auth.token?.suspended === true ||
            ownerUser.disabled ||
            !ownerUser.emailVerified
        ) {
            throw new HttpsError("permission-denied", "A verified, active owner account is required.");
        }
    }
    const isTicketOwner = ticketData.ownerId === uid ||
        ticketData.ownerUid === uid ||
        (request.auth.token?.email_verified === true && !!email && ticketOwnerEmail === email);

    if (!isAdmin && !isTicketOwner) {
        throw new HttpsError("permission-denied", "This ticket is not linked to your owner account.");
    }
    const reviewableStatuses = new Set([
        "completed",
        "completed_pending_approval",
        "resolved",
        "resolved_pending_approval",
        "awaiting_owner_approval",
        "awaiting_review",
    ]);
    if (!reviewableStatuses.has(normalizeRole(ticketData.status))) {
        throw new HttpsError("failed-precondition", "Ticket is not ready for owner completion review.");
    }

    const now = FieldValue.serverTimestamp();
    const baseUpdate: any = {
        ownerReviewAction: action,
        ownerReviewReason: reason || null,
        ownerReviewedAt: now,
        ownerReviewedBy: uid,
        ownerReviewedByEmail: request.auth.token?.email || null,
        updatedAt: now,
        updatedBy: uid,
        updatedByRole: isAdmin ? "admin" : "owner"
    };

    if (action === "APPROVE_CLOSE") {
        Object.assign(baseUpdate, {
            status: "CLOSED",
            ownerApproved: true,
            ownerVerifiedAt: now,
            tenantApprovalRequired: false,
            closedAt: now,
            closureSource: "OWNER_REVIEW"
        });
    }

    if (action === "DISPUTE") {
        Object.assign(baseUpdate, {
            status: "DISPUTED",
            ownerApproved: false,
            ownerDisputeReason: reason,
            disputeReason: reason,
            disputedAt: now,
            disputeSource: "OWNER_REVIEW"
        });
    }

    if (action === "REQUEST_REVISIT") {
        Object.assign(baseUpdate, {
            status: "REOPENED",
            ownerApproved: false,
            revisitRequested: true,
            revisitReason: reason,
            technicianStatus: "REVISIT_REQUESTED",
            reopenedAt: now,
            reopenSource: "OWNER_REVIEW"
        });
    }

    if (action === "ESCALATE") {
        Object.assign(baseUpdate, {
            status: "ESCALATED",
            ownerApproved: false,
            escalationReason: reason,
            escalatedAt: now,
            escalationSource: "OWNER_REVIEW"
        });
    }

    await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(ticketRef);
        if (!freshSnap.exists) throw new HttpsError("not-found", "Ticket not found.");
        const fresh = freshSnap.data() || {};
        const freshOwnerEmail = normalizeRole(fresh.ownerEmail);
        const stillOwned = fresh.ownerId === uid ||
            fresh.ownerUid === uid ||
            (request.auth!.token?.email_verified === true && !!email && freshOwnerEmail === email);
        if (!isAdmin && !stillOwned) {
            throw new HttpsError("permission-denied", "This ticket is no longer linked to your owner account.");
        }
        if (!reviewableStatuses.has(normalizeRole(fresh.status))) {
            throw new HttpsError("failed-precondition", "Ticket is no longer ready for owner completion review.");
        }
        transaction.update(ticketRef, baseUpdate);
    });

    await logAudit({
        actorId: uid,
        actorRole: isAdmin ? "admin" : "owner",
        action: `OWNER_TICKET_${action}`,
        targetType: "maintenanceTickets",
        targetId: ticketId,
        before: { status: ticketData.status, ownerApproved: ticketData.ownerApproved },
        after: { status: baseUpdate.status, ownerApproved: baseUpdate.ownerApproved },
        reason: reason || undefined,
        metadata: {
            propertyId: ticketData.propertyId || "",
            propertyName: ticketData.propertyName || "",
            assignedTechnicianId: ticketData.assignedTechnicianId || ""
        }
    });

    const ref8 = ticketId.substring(0, 8).toUpperCase();
    const notificationTitle = action === "APPROVE_CLOSE"
        ? "Owner closed ticket"
        : action === "DISPUTE"
            ? "Owner disputed ticket"
            : action === "REQUEST_REVISIT"
                ? "Owner requested revisit"
                : "Owner escalated ticket";
    const notificationBody = reason
        ? `${notificationTitle} #${ref8}: ${reason}`
        : `${notificationTitle} #${ref8}.`;

    const notifyTargets = new Set<string>();
    if (ticketData.assignedTechnicianId) notifyTargets.add(String(ticketData.assignedTechnicianId));
    if (ticketData.technicianId) notifyTargets.add(String(ticketData.technicianId));
    if (ticketData.tenantId) notifyTargets.add(String(ticketData.tenantId));
    if (ticketData.tenantUid) notifyTargets.add(String(ticketData.tenantUid));

    await Promise.allSettled(Array.from(notifyTargets)
        .filter((targetId) => targetId && targetId !== uid)
        .map((targetId) => dispatchOmniNotification(targetId, notificationTitle, notificationBody, {
            extraData: { ticketId, type: "owner_ticket_review", action },
            url: targetId === ticketData.assignedTechnicianId || targetId === ticketData.technicianId
                ? `/technician/job/${ticketId}`
                : `/tenant/ticket/${ticketId}`
        })));

    return { status: "SUCCESS", ticketId, action, nextStatus: baseUpdate.status };
});

// ─── [V10] TICKET LIFECYCLE & AUTO-REPAIR ──────────────────────────────────────────

export const onTicketStatusChanged = onDocumentUpdated({ document: "maintenanceTickets/{id}" }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;
    const evidenceBecameReady =
        before?.evidenceStatus !== "TENANT_EVIDENCE_UPLOADED" &&
        after.evidenceStatus === "TENANT_EVIDENCE_UPLOADED";
    if (
        evidenceBecameReady &&
        !safeString(after.assignedTechnicianId || after.technicianId)
    ) {
        const readyUpdate = {
            dispatchStatus: "PENDING_ASSIGNMENT",
            trackingStatus: "WAITING_FOR_TECHNICIAN",
            evidenceReadyAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };
        await event.data!.after.ref.set(readyUpdate, { merge: true });
        await attemptAutoAssignment(event.data!.after.ref, { ...after, ...readyUpdate });
    }
    if (before?.status === after.status) return;

    const ticketId = event.params.id;
    const terminalStatuses = new Set([
        "completed",
        "completed_pending_approval",
        "completed_pending_tenant_approval",
        "closed",
        "cancelled",
        "rejected",
    ]);
    const beforeStatus = normalizeRole(before?.status);
    const afterStatus = normalizeRole(after.status);
    if (
        terminalStatuses.has(afterStatus) &&
        !terminalStatuses.has(beforeStatus) &&
        !after.capacityReleasedAt
    ) {
        const ticketRef = event.data!.after.ref;
        await db.runTransaction(async (transaction) => {
            const freshTicketSnap = await transaction.get(ticketRef);
            const freshTicket = freshTicketSnap.data() || {};
            if (
                !freshTicketSnap.exists ||
                freshTicket.capacityReleasedAt ||
                !terminalStatuses.has(normalizeRole(freshTicket.status))
            ) return;
            const technicianId = assignedTechnicianId(freshTicket);
            if (!technicianId) {
                transaction.set(ticketRef, { capacityReleasedAt: FieldValue.serverTimestamp() }, { merge: true });
                return;
            }
            const technicianRef = db.collection("users").doc(technicianId);
            const technicianSnap = await transaction.get(technicianRef);
            transaction.set(ticketRef, { capacityReleasedAt: FieldValue.serverTimestamp() }, { merge: true });
            if (technicianSnap.exists) {
                transaction.set(technicianRef, {
                    currentJobCount: Math.max(0, Number(technicianSnap.data()?.currentJobCount || 0) - 1),
                    updatedAt: FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        });
    }

    await logAudit({
        actorId: after.updatedBy || "SYSTEM",
        actorRole: after.updatedByRole || "system",
        action: "STATUS_CHANGE",
        targetType: "maintenanceTickets",
        targetId: ticketId,
        before: before?.status,
        after: after.status
    });

    // ── Requester IDs (ticket may be from tenant OR owner) ────────────────
    const tenantId: string = after.tenantId || after.tenantUid || "";
    const ownerId: string = after.ownerId || after.ownerUid || "";
    const techId: string = after.assignedTechnicianId || "";
    const techName: string = after.assignedTechnicianName || "Your Technician";
    const prop: string = after.propertyName || "the property";
    const ref8: string = ticketId.substring(0, 8).toUpperCase();

    // Helper: notify both requester parties (tenant + owner) but not the technician
    const notifyRequester = async (title: string, body: string) => {
        const tasks: Promise<any>[] = [];
        if (tenantId && tenantId !== techId) tasks.push(dispatchOmniNotification(tenantId, title, body, { extraData: { ticketId, type: "ticket_status" }, url: `/tenant/ticket/${ticketId}` }));
        if (ownerId && ownerId !== techId && ownerId !== tenantId) tasks.push(dispatchOmniNotification(ownerId, title, body, { extraData: { ticketId, type: "ticket_status" }, url: `/owner/ticket/${ticketId}` }));
        await Promise.allSettled(tasks);
    };

    // ── Status-based notifications ────────────────────────────────────────
    const statusNorm = (after.status || "").toLowerCase();

    if (["accepted", "assigned", "technician_assigned"].includes(statusNorm)) {
        await notifyRequester("Technician Assigned ✓", `${techName} has accepted ticket #${ref8} and will be on the way soon.`);
        if (techId) await dispatchOmniNotification(techId, "Job Accepted", `You are now assigned to #${ref8} at ${prop}.`, { extraData: { ticketId, type: "job_assigned" }, url: `/technician/job/${ticketId}` });
    }
    else if (["on_the_way", "en_route"].includes(statusNorm)) {
        await notifyRequester("Technician On The Way 🚗", `${techName} is heading to ${prop} now. Track live in your app.`);
    }
    else if (["arrived"].includes(statusNorm)) {
        await notifyRequester("Technician Arrived 📍", `${techName} has arrived at ${prop} and is starting the job.`);
    }
    else if (["in_progress", "work_started"].includes(statusNorm)) {
        await notifyRequester("Work In Progress 🔧", `${techName} has started work on ticket #${ref8}.`);
    }
    else if (["completed", "completed_pending_approval", "completed_pending_tenant_approval"].includes(statusNorm)) {
        await notifyRequester("Work Completed ✅", `${techName} has completed ticket #${ref8}. Please confirm the resolution.`);
    }
    else if (["cancelled", "escalated"].includes(statusNorm)) {
        await notifyRequester("Ticket Update", `Ticket #${ref8} status changed to: ${after.status?.replace(/_/g, " ")}.`);
    }

    // ── Legacy: auto-quote logic ──────────────────────────────────────────
    if (after.status === "ESTIMATED" && after.estimatedCost && Number(after.estimatedCost) <= 1000) {
        await event.data?.after.ref.update({
            status: "APPROVED",
            approvalType: "AUTO_REPAIR_THRESHOLD",
            approvedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });
        if (ownerId) await dispatchOmniNotification(ownerId, "AUTO-REPAIR ACTIVE", `A minor repair (AED ${after.estimatedCost}) at ${prop} has been auto-approved.`);
        await logAudit({ actorId: "SYSTEM_RULES", actorRole: "system", action: "AUTO_APPROVAL", targetType: "maintenanceTickets", targetId: ticketId, metadata: { cost: after.estimatedCost, threshold: 1000 } });
    } else if (after.status === "ESTIMATED" && ownerId) {
        await dispatchOmniNotification(ownerId, "NEW QUOTE GENERATED", `A technical estimate for #${ref8} is ready.`);
    }
});


async function attemptAutoAssignment(ticketRef: admin.firestore.DocumentReference, ticketData: any) {
    const ticketId = ticketRef.id;
    try {
        const status = normalizeRole(ticketData.status);
        if (!["open", "pending_assignment", "emergency_submitted"].includes(status)) return;
        if (
            ticketData.photoEvidenceRequired === true &&
            ticketData.evidenceStatus !== "TENANT_EVIDENCE_UPLOADED"
        ) return;
        const requesterRole = normalizeRole(ticketData.requesterRole);
        const source = safeString(ticketData.source).toUpperCase();
        if (requesterRole === "tenant" || source === "TENANT_PORTAL") {
            const tenantId = safeString(ticketData.tenantId || ticketData.tenantUid);
            const unitId = safeString(ticketData.unitId);
            const propertyId = safeString(ticketData.propertyId);
            if (!tenantId || !unitId || !propertyId) return;
            const unitSnap = await db.collection("units").doc(unitId).get();
            const unit = unitSnap.data() || {};
            const unitTenantId = safeString(
                unit.tenantId || unit.tenantUid || unit.userId || unit.authUid,
            );
            if (
                !unitSnap.exists ||
                unitTenantId !== tenantId ||
                safeString(unit.propertyId) !== propertyId
            ) return;
        }
        // Works for both tenant-filed AND owner-filed tickets
        const requesterId: string = ticketData.tenantId || ticketData.tenantUid || ticketData.ownerId || "";
        const requesterDoc = requesterId ? await db.collection("users").doc(requesterId).get() : null;
        const requesterData = requesterDoc?.data();

        let propertyData: any = null;
        if (ticketData.propertyId) {
            const propSnap = await db.collection("properties").doc(ticketData.propertyId).get();
            if (propSnap.exists) propertyData = propSnap.data();
        }

        const propertyGeo = normalizeGeo(propertyData || ticketData);
        const contextUpdate = {
            companyId: ticketData.companyId || propertyData?.companyId || "BIN_GROUP",
            tenantPhone: requesterData?.phone || requesterData?.phoneNumber || ticketData.tenantPhone || "N/A",
            ownerId: propertyData?.ownerId || ticketData.ownerId || null,
            emirate: propertyGeo?.emirate || propertyData?.emirate || ticketData.emirate || requesterData?.emirate || "",
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
        await ticketRef.update(contextUpdate);

        if (!propertyGeo || !contextUpdate.emirate) {
            await ticketRef.update({
                status: "pending_assignment",
                assignmentStatus: "admin_manual_assignment",
                assignmentError: "Missing geo-anchor."
            });
            return;
        }

        const techQuery = await db.collection("users")
            .where("role", "in", ["technician", "specialist"])
            .where("onDuty", "==", true)
            .limit(100)
            .get();
        const requiredSkill = String(ticketData.complaintCategory || ticketData.category || ticketData.trade || "").toLowerCase();

        const candidates = techQuery.docs
            .map((d) => ({ id: d.id, data: d.data() }))
            .filter((tech) => {
                const data = tech.data;
                const onDuty = data.onDuty === true;
                const approved = ["active", "approved"].includes(String(data.status || "").toLowerCase()) &&
                    data.suspended !== true;
                const hasCapacity = Number(data.currentJobCount || 0) < Number(data.maxConcurrentJobs || 3);
                const sameEmirate = String(data.emirate || "").toLowerCase() === String(contextUpdate.emirate).toLowerCase();
                const skills = Array.isArray(data.tradeSkills) ? data.tradeSkills.map((s: any) => String(s).toLowerCase()) : [String(data.trade || "").toLowerCase()];
                const skillMatch = !requiredSkill || skills.some((s: string) => requiredSkill.includes(s) || s.includes(requiredSkill));
                return onDuty && approved && hasCapacity && sameEmirate && skillMatch;
            })
            .map((tech) => ({
                ...tech,
                distance: distanceKm(normalizeGeo(tech.data), propertyGeo),
                sameArea: String(tech.data.primaryArea || "").toLowerCase() === String(contextUpdate.area).toLowerCase()
            }))
            .sort((a, b) => Number(b.sameArea) - Number(a.sameArea) || a.distance - b.distance);

        if (candidates.length > 0) {
            const bestTech = candidates[0];
            const technicianRef = db.collection("users").doc(bestTech.id);
            const assigned = await db.runTransaction(async (transaction) => {
                const [freshTicketSnap, freshTechnicianSnap] = await Promise.all([
                    transaction.get(ticketRef),
                    transaction.get(technicianRef),
                ]);
                const freshTicket = freshTicketSnap.data() || {};
                const freshTechnician = freshTechnicianSnap.data() || {};
                if (
                    !freshTicketSnap.exists ||
                    safeString(freshTicket.assignedTechnicianId || freshTicket.technicianId) ||
                    !freshTechnicianSnap.exists ||
                    freshTechnician.onDuty !== true ||
                    freshTechnician.suspended === true ||
                    !["active", "approved"].includes(normalizeRole(freshTechnician.status)) ||
                    Number(freshTechnician.currentJobCount || 0) >= Number(freshTechnician.maxConcurrentJobs || 3)
                ) {
                    return false;
                }
                transaction.update(ticketRef, {
                    assignedTechnicianId: bestTech.id,
                    technicianId: bestTech.id,
                    assignedTechnicianName: freshTechnician.displayName || freshTechnician.name || "Specialist",
                    assignedTechnicianPhone: freshTechnician.phone || freshTechnician.phoneNumber || "",
                    assignedTechnicianAvatar: freshTechnician.photoURL || "",
                    technicianSpecialty: freshTechnician.specialty || freshTechnician.trade || "",
                    status: "AUTO_ASSIGNED",
                    dispatchStatus: "AUTO_ASSIGNED",
                    trackingStatus: "TECHNICIAN_ASSIGNED",
                    autoAssignedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                });
                transaction.update(technicianRef, {
                    currentJobCount: FieldValue.increment(1),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                return true;
            });
            if (!assigned) return;

            await dispatchOmniNotification(bestTech.id, "New Job Assigned", `${ticketData.category || ticketData.complaintCategory || "Fault"} at ${contextUpdate.propertyLocation.propertyName}`, {
                url: `/technician/job/${ticketId}`,
                extraData: { ticketId, openRoute: true }
            });

            await logAudit({
                actorId: "DISPATCH_ENGINE",
                actorRole: "system",
                action: "AUTO_ASSIGN",
                targetType: "maintenanceTickets",
                targetId: ticketId,
                metadata: { techId: bestTech.id, reason: bestTech.sameArea ? "AREA_MATCH" : "DISTANCE" }
            });
        }
    } catch (err) {
        console.error("AutoRoute Failure:", err);
    }
}

export const autoRouteTicket = onDocumentCreated({ document: "maintenanceTickets/{ticketId}" }, async (event) => {
    const snap = event.data;
    if (!snap) return;
    if (
        snap.data().photoEvidenceRequired === true &&
        snap.data().evidenceStatus !== "TENANT_EVIDENCE_UPLOADED"
    ) return;
    await attemptAutoAssignment(snap.ref, snap.data());
});

export const createAiMaintenanceTicket = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["owner", "admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Owner or admin access required.");

    const { propertyId, title, description, trade, priority } = request.data || {};
    if (!propertyId) throw new HttpsError("invalid-argument", "Property ID is required.");
    if (!title) throw new HttpsError("invalid-argument", "Title is required.");

    const propertyDoc = await db.collection("properties").doc(propertyId).get();
    if (!propertyDoc.exists) throw new HttpsError("not-found", "Property not found.");
    const propertyData = propertyDoc.data()!;

    if (propertyData.ownerId !== request.auth.uid && request.auth.token?.admin !== true) {
        throw new HttpsError("permission-denied", "You do not own this property.");
    }

    const now = FieldValue.serverTimestamp();
    const ticketRef = db.collection("maintenanceTickets").doc();
    const tradeValue = safeString(trade, "GENERAL");
    await ticketRef.set({
        propertyId,
        propertyName: propertyData.name || propertyData.propertyName || propertyData.address || "Institutional Asset",
        ownerId: propertyData.ownerId,
        title: safeString(title),
        description: safeString(description),
        trade: tradeValue,
        category: tradeValue,
        priority: safeString(priority, "NORMAL"),
        status: "OPEN",
        source: "ai_mission_guidance",
        createdBy: request.auth.uid,
        createdAt: now,
        updatedAt: now
    });

    await logAudit({
        actorId: request.auth.uid, actorRole: "owner",
        action: "AI_TICKET_CREATE", targetType: "maintenanceTickets", targetId: ticketRef.id,
        metadata: { propertyId, trade: tradeValue, priority }
    });

    return { status: "SUCCESS", ticketId: ticketRef.id };
});

export const approveMaintenanceProposal = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["owner", "admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Owner or admin access required.");

    const { ticketId } = request.data || {};
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID is required.");

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();
    if (!ticketDoc.exists) throw new HttpsError("not-found", "Proposal not found.");
    const ticketData = ticketDoc.data()!;

    if (ticketData.status !== "PREVENTIVE_PROPOSAL") {
        throw new HttpsError("failed-precondition", "This ticket is not a pending preventive proposal.");
    }

    let ownerId: string | null = ticketData.ownerId || null;
    if (ticketData.propertyId) {
        const propertyDoc = await db.collection("properties").doc(ticketData.propertyId).get();
        if (propertyDoc.exists) ownerId = propertyDoc.data()?.ownerId || ownerId;
    }

    if (ownerId !== request.auth.uid && request.auth.token?.admin !== true) {
        throw new HttpsError("permission-denied", "You are not authorized to approve this proposal.");
    }

    const now = FieldValue.serverTimestamp();
    await ticketRef.update({
        status: "OPEN",
        ownerId,
        approvalType: "OWNER_SANCTIONED",
        approvedBy: request.auth.uid,
        approvedAt: now,
        updatedAt: now
    });

    await logAudit({
        actorId: request.auth.uid, actorRole: "owner",
        action: "APPROVE_PREVENTIVE_PROPOSAL", targetType: "maintenanceTickets", targetId: ticketId
    });

    await attemptAutoAssignment(ticketRef, { ...ticketData, status: "OPEN", ownerId });

    return { status: "SUCCESS" };
});


// ─── OMNI-CHANNEL NOTIFICATION ENGINE ───────────────────────────────────────

async function sendTwilioSMS(to: string, message: string) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
        console.info(`[SMS MOCK] To: ${to}, Message: ${message}`);
        return;
    }
    try {
        const authString = Buffer.from(`${sid}:${token}`).toString("base64");
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: "POST",
            headers: {
                "Authorization": `Basic ${authString}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                To: to,
                From: from,
                Body: message
            })
        });
        if (!response.ok) {
            const errText = await response.text();
            console.error("[Twilio SMS Error]:", errText);
        } else {
            console.log(`[Twilio SMS Success] Message sent to ${to}`);
        }
    } catch (error) {
        console.error("[Twilio SMS Exception]:", error);
    }
}

async function dispatchOmniNotification(userId: string, title: string, body: string, options: any = {}) {
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) return;
        const userData = userDoc.data();

        // 1. Push notification (FCM)
        const fcmTokens: string[] = userData?.fcmTokens || [];
        if (fcmTokens.length > 0) {
            const messages = fcmTokens.map(token => ({
                token,
                notification: { title, body },
                data: { ...options.extraData, url: options.url || '/' }
            }));
            await admin.messaging().sendEach(messages);
        }

        // 2. Email Notification fallback
        if (userData?.email && options.type === 'CRITICAL') {
            await db.collection("mail").add({
                to: userData.email,
                message: {
                    subject: `[BIN GROUP] ${title}`,
                    html: `<p>${body}</p>`
                },
                createdAt: FieldValue.serverTimestamp()
            });
        }

        // 3. SMS Notification fallback
        if (userData?.phone || userData?.mobile) {
            const phone = userData.phone || userData.mobile;
            await sendTwilioSMS(phone, `[${title}] ${body}`);
        }
    } catch (err) {
        console.error("Notification Error:", err);
    }
}

// ─── INFRASTRUCTURE CALLABLES ──────────────────────────────────────────────

export const processTitleDeedOCR = onCall({ cors: true }, async (request) => {
    // ── Auth + Role: delegated to assertOcrCallerRole ─────────────────────
    // Adapts Firestore lookup to the injected GetUserRoleFn interface.
    const { isAdmin } = await assertOcrCallerRole(
        request.auth ? { uid: request.auth.uid, token: request.auth.token as Record<string, unknown> } : null,
        async (uid) => {
            const doc = await db.collection("users").doc(uid).get();
            return (doc.data() || {}) as Record<string, unknown>;
        }
    );

    const { fileUrl } = request.data;
    if (!fileUrl || typeof fileUrl !== "string" || fileUrl.trim() === "") {
        throw new HttpsError("invalid-argument", "Missing or invalid document stream.");
    }
    const normalizedUrl = fileUrl.trim();

    // ── Per-object ownership check (owners only; admins bypass) ──────────
    if (!isAdmin) {
        let storagePath: string;
        try {
            storagePath = parseFirebaseStoragePath(normalizedUrl);
        } catch {
            throw new HttpsError("invalid-argument", "Could not resolve Storage object path from the provided URL.");
        }

        // Adapts firebase-admin getMetadata() to the injected GetFileMetaFn interface.
        await verifyStorageObjectOwnership(
            storagePath,
            request.auth!.uid,
            async (path) => {
                const bucket = admin.storage().bucket();
                const [metadata] = await bucket.file(path).getMetadata();
                return metadata as Record<string, unknown>;
            }
        );
    }

    try {
        const { extractTitleDeedData } = await import("./ocrEngine");
        const extractedData = await extractTitleDeedData(normalizedUrl);
        await logAudit({
            actorId: request.auth!.uid, actorRole: isAdmin ? "admin" : "owner",
            action: "OCR_SCAN", targetType: "properties", targetId: "temp",
            // fileUrl intentionally omitted from audit metadata to prevent SSRF URL logging
            metadata: { mimeSource: "firebase-storage", ownershipVerified: !isAdmin }
        });
        return { status: "SUCCESS", data: extractedData };
    } catch (err: any) {
        throw new HttpsError("internal", "Document parsing node failed.");
    }
});

export const generateInstitutionalContract = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sovereign identity required.");
    const contractData = assertPlainObject(request.data?.contractData, "Contract payload");
    const propertyId = safeString(contractData.propertyId || contractData.propertyPassportId || contractData.passportId);
    const contractId = safeString(contractData.contractId || contractData.id);
    let requesterEmail = safeString(request.auth.token?.email).toLowerCase();
    const hasPrivilegedAccess = await hasCallableRoleAccess(
        request.auth,
        new Set(["admin", "super_admin", "ceo", "operations_admin", "finance_admin", "account_manager"])
    );
    if (!propertyId && !contractId) {
        throw new HttpsError("invalid-argument", "Property ID or Contract ID is required.");
    }

    if (!hasPrivilegedAccess) {
        const ownerAccess = await hasCallableRoleAccess(request.auth, new Set(["owner"]));
        if (!ownerAccess || request.auth.token?.email_verified !== true || request.auth.token?.suspended === true) {
            throw new HttpsError("permission-denied", "A verified, active owner account is required.");
        }
        const requesterUser = await admin.auth().getUser(request.auth.uid);
        if (requesterUser.disabled || !requesterUser.emailVerified) {
            throw new HttpsError("permission-denied", "A verified, active owner account is required.");
        }
        requesterEmail = safeString(requesterUser.email || requesterEmail).toLowerCase();
        let authorized = false;

        if (propertyId) {
            const propertyDoc = await db.collection("properties").doc(propertyId).get();
            if (propertyDoc.exists) {
                const property = propertyDoc.data() || {};
                authorized =
                    safeString(property.ownerId) === request.auth.uid ||
                    safeString(property.ownerUid) === request.auth.uid ||
                    safeString(property.userId) === request.auth.uid ||
                    (Boolean(requesterEmail) && safeString(property.ownerEmail).toLowerCase() === requesterEmail);
            }
        }

        if (!authorized && contractId) {
            const contractDoc = await db.collection("contracts").doc(contractId).get();
            if (contractDoc.exists) {
                const contract = contractDoc.data() || {};
                authorized =
                    safeString(contract.ownerId) === request.auth.uid ||
                    safeString(contract.ownerUid) === request.auth.uid ||
                    safeString(contract.userId) === request.auth.uid ||
                    (Boolean(requesterEmail) && safeString(contract.ownerEmail).toLowerCase() === requesterEmail);
            }
        }

        if (!authorized) {
            throw new HttpsError("permission-denied", "You are not authorized to generate this contract.");
        }
    }

    try {
        const payload = hasPrivilegedAccess ? contractData : { ...contractData, ownerId: request.auth.uid };
        const { generateContractPDF } = await import("./pdfEngine");
        const pdfUrl = await generateContractPDF(payload);
        await logAudit({
            actorId: request.auth.uid,
            actorRole: hasPrivilegedAccess ? "admin" : "owner",
            action: "CONTRACT_GENERATE",
            targetType: "contracts",
            targetId: contractId || "new",
            metadata: { propertyId: propertyId || null }
        });
        return { status: "SUCCESS", pdfUrl };
    } catch (err: any) {
        throw new HttpsError("internal", "Contract synthesis failed.");
    }
});

export const generateAndEmailPayslip = onCall({
    cors: true,
    enforceAppCheck: true
}, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Admin access required.");
    const hasPayrollAccess = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin", "ceo", "hr_manager", "finance_admin"]));
    if (!hasPayrollAccess) throw new HttpsError("permission-denied", "Unauthorized.");
    throw new HttpsError(
        "failed-precondition",
        "Legacy client-supplied payroll generation is disabled. Generate a server-authoritative payroll batch and settle its payrollId.",
    );
});

export const generateIntegrityAudit = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["owner", "admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Owner or admin access required.");

    const { intel, propertyName } = request.data || {};
    const payload = assertPlainObject(intel, "Intelligence payload");
    const propertyId = safeString(payload.propertyId);
    if (!propertyId) throw new HttpsError("invalid-argument", "Property ID is required in the intelligence payload.");

    const propertyDoc = await db.collection("properties").doc(propertyId).get();
    if (!propertyDoc.exists) throw new HttpsError("not-found", "Property not found.");
    if (propertyDoc.data()?.ownerId !== request.auth.uid && request.auth.token?.admin !== true) {
        throw new HttpsError("permission-denied", "You do not own this property.");
    }

    try {
        const { generateIntegrityAuditPDF } = await import("./pdfEngine");
        const url = await generateIntegrityAuditPDF({
            propertyId,
            propertyName: safeString(propertyName, "Property"),
            intel: payload
        });

        await logAudit({
            actorId: request.auth.uid, actorRole: "owner",
            action: "INTEGRITY_AUDIT_GENERATE", targetType: "properties", targetId: propertyId
        });

        return { status: "SUCCESS", url };
    } catch (err: any) {
        console.error("Integrity audit generation failed:", err);
        throw new HttpsError("internal", "Audit generation failed.");
    }
});

// ─── ADMIN PRICING, COMPLIANCE & ROI TOOLING ───────────────────────────────

export const calculateAMCV2 = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Admin access required.");

    const { propertyName, zone, buildingAge, numUnits } = request.data || {};
    const age = Number(buildingAge);
    const units = Number(numUnits);
    if (!Number.isFinite(age) || age < 0) throw new HttpsError("invalid-argument", "A valid building age is required.");
    if (!Number.isFinite(units) || units <= 0) throw new HttpsError("invalid-argument", "A valid unit count is required.");

    const ageBonus = 1 + Math.min(age * 0.012, 0.40);
    const ratePerUnit = Math.round(3500 * ageBonus);
    const baseAED = ratePerUnit * units;

    return {
        propertyName: safeString(propertyName, "Property"),
        zone: safeString(zone, "Standard"),
        baseAED,
        ratePerUnit,
        numUnits: units
    };
});

export const exportComplianceReport = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Admin access required.");

    const monthsRaw = Number(request.data?.months);
    const months = Number.isFinite(monthsRaw) && monthsRaw > 0 ? Math.min(monthsRaw, 36) : 12;

    try {
        const periodEnd = new Date();
        const periodStart = new Date(periodEnd.getTime() - months * 30 * 24 * 60 * 60 * 1000);
        const periodStartTs = admin.firestore.Timestamp.fromDate(periodStart);

        const [snakeSnap, camelSnap, ticketsSnap] = await Promise.all([
            db.collection("audit_logs").where("createdAt", ">=", periodStartTs).orderBy("createdAt", "desc").limit(2000).get(),
            db.collection("auditLogs").where("createdAt", ">=", periodStartTs).orderBy("createdAt", "desc").limit(2000).get(),
            db.collection("maintenanceTickets").where("updatedAt", ">=", periodStartTs).get()
        ]);

        const CRITICAL_KEYWORDS = ["REJECT", "CRITICAL", "FAIL", "BREACH", "FRAUD", "SUSPEND", "TERMINATE", "DELETE"];
        const entries: Array<Record<string, any>> = [];
        let contractEvents = 0;
        let criticalEvents = 0;

        const consume = (snap: admin.firestore.QuerySnapshot) => {
            snap.forEach(doc => {
                const data = doc.data();
                const action = safeString(data.action, "UNKNOWN_ACTION");
                if (action.includes("CONTRACT")) contractEvents++;
                if (CRITICAL_KEYWORDS.some(k => action.includes(k))) criticalEvents++;
                entries.push({
                    id: doc.id,
                    actorId: data.actorId || null,
                    actorRole: data.actorRole || null,
                    action,
                    targetType: data.targetType || null,
                    targetId: data.targetId || null,
                    reason: data.reason || null,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null
                });
            });
        };
        consume(snakeSnap);
        consume(camelSnap);
        entries.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

        let slaBreaches = 0;
        let slaTracked = 0;
        ticketsSnap.forEach(doc => {
            slaTracked++;
            if (doc.data().slaViolated === true) slaBreaches++;
        });
        const slaCompliancePct = slaTracked > 0 ? Math.round(((slaTracked - slaBreaches) / slaTracked) * 1000) / 10 : 100;

        const report = {
            generatedAt: new Date().toISOString(),
            periodMonths: months,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            summary: {
                totalAuditEvents: entries.length,
                contractEvents,
                slaCompliancePct,
                slaBreaches,
                criticalEvents
            },
            entries: entries.slice(0, 1000)
        };

        await logAudit({
            actorId: request.auth.uid, actorRole: "admin",
            action: "EXPORT_COMPLIANCE_REPORT", targetType: "audit_logs", targetId: "ALL",
            metadata: { months }
        });

        return { status: "SUCCESS", report };
    } catch (err: any) {
        console.error("Compliance report export failed:", err);
        throw new HttpsError("internal", "Compliance report export failed.");
    }
});

export const generateTrialROIReport = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Admin access required.");

    const propertyId = safeString(request.data?.propertyId);
    if (!propertyId) throw new HttpsError("invalid-argument", "Property ID is required.");

    const propertyDoc = await db.collection("properties").doc(propertyId).get();
    if (!propertyDoc.exists) throw new HttpsError("not-found", "Property not found.");
    const propertyData = propertyDoc.data()!;

    try {
        const periodEnd = new Date();
        const periodStart = new Date(periodEnd.getTime() - 90 * 24 * 60 * 60 * 1000);

        const ticketsSnap = await db.collection("maintenanceTickets").where("propertyId", "==", propertyId).get();

        const resolvedStatuses = new Set(["COMPLETED", "completed", "CLOSED", "closed", "RESOLVED", "resolved"]);
        let totalResolved = 0;
        let totalPending = 0;
        let slaCompliant = 0;
        let slaTracked = 0;
        let resolutionHoursSum = 0;
        let resolutionSamples = 0;
        let preventedCost = 0;
        const categoryCounts: Record<string, number> = {};

        ticketsSnap.forEach(doc => {
            const data = doc.data();
            const status = String(data.status || "");
            const category = safeString(data.category || data.trade, "GENERAL");
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;

            if (resolvedStatuses.has(status)) {
                totalResolved++;
                preventedCost += Number(data.estimatedCost) || Number(data.actualCost) || 0;

                const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
                const completedAt = data.completedAt?.toDate ? data.completedAt.toDate() : null;
                if (createdAt && completedAt) {
                    resolutionHoursSum += (completedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
                    resolutionSamples++;
                }

                slaTracked++;
                if (!data.slaViolated) slaCompliant++;
            } else {
                totalPending++;
            }
        });

        const totalTickets = totalResolved + totalPending;
        const avgResolutionHours = resolutionSamples > 0 ? Math.round((resolutionHoursSum / resolutionSamples) * 10) / 10 : 0;
        const slaComplianceRate = slaTracked > 0 ? Math.round((slaCompliant / slaTracked) * 1000) / 10 : 100;

        const topCategories: [string, number][] = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const passportSnap = await db.collection("propertyPassports").doc(propertyId).get();
        const passportData = passportSnap.exists ? passportSnap.data() : null;
        const rawHealthScore = passportData ? Number(passportData.assetHealthScore ?? passportData.healthScore) : NaN;
        const assetHealthScore = Number.isFinite(rawHealthScore) ? rawHealthScore : null;

        const ownerId = safeString(propertyData.ownerId);
        const ownerDoc = ownerId ? await db.collection("users").doc(ownerId).get() : null;
        const ownerName = ownerDoc?.exists
            ? safeString(ownerDoc.data()?.name || ownerDoc.data()?.displayName, "Property Owner")
            : "Property Owner";

        const headline = slaComplianceRate >= 90
            ? "Portfolio is operating within institutional SLA standards."
            : slaComplianceRate >= 75
                ? "Portfolio performance is acceptable but has room for improvement."
                : "Portfolio SLA compliance requires immediate attention.";

        const recommendation = totalPending > 0
            ? `${totalPending} mission(s) remain open. Prioritize dispatch to protect SLA compliance.`
            : "All missions resolved within the reporting window. Maintain the current preventive maintenance cadence.";

        const report = {
            propertyId,
            propertyName: safeString(propertyData.name || propertyData.propertyName || propertyData.address, "Institutional Asset"),
            ownerName,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            totalTickets,
            totalResolved,
            totalPending,
            avgResolutionHours,
            slaComplianceRate,
            totalPreventedCostAED: Math.round(preventedCost),
            assetHealthScore,
            topCategories,
            trialSummary: { headline, recommendation },
            generatedAt: new Date().toISOString()
        };

        await logAudit({
            actorId: request.auth.uid, actorRole: "admin",
            action: "GENERATE_ROI_REPORT", targetType: "properties", targetId: propertyId
        });

        return report;
    } catch (err: any) {
        console.error("ROI report generation failed:", err);
        throw new HttpsError("internal", "ROI report generation failed.");
    }
});

export const notifyRole = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Admin access required.");

    const payload = assertPlainObject(request.data, "Notification payload");
    const role = safeString(payload.role);
    const title = safeString(payload.title);
    const body = safeString(payload.body);
    const allowedRoles = new Set(["owner", "tenant", "technician", "broker", "admin"]);
    if (!allowedRoles.has(role)) throw new HttpsError("invalid-argument", "A valid target role is required.");
    if (!title || !body) throw new HttpsError("invalid-argument", "Notification title and body are required.");

    const type = safeString(payload.type, "ADMIN_BROADCAST");
    const link = payload.link ? safeString(payload.link) : null;

    try {
        const usersSnap = await db.collection("users").where("role", "==", role).limit(500).get();
        if (usersSnap.empty) {
            return { status: "SUCCESS", notified: 0 };
        }

        const now = FieldValue.serverTimestamp();
        const batch = db.batch();
        usersSnap.forEach(userDoc => {
            const ref = db.collection("notifications").doc();
            batch.set(ref, {
                userId: userDoc.id,
                role,
                title,
                body,
                type,
                link,
                status: "PENDING",
                read: false,
                createdAt: now,
                source: "ADMIN_NOTIFY_ROLE"
            });
        });
        await batch.commit();

        await logAudit({
            actorId: request.auth.uid, actorRole: "admin",
            action: "NOTIFY_ROLE_BROADCAST", targetType: "users", targetId: role,
            metadata: { count: usersSnap.size, type }
        });

        return { status: "SUCCESS", notified: usersSnap.size };
    } catch (err: any) {
        console.error("Role notification broadcast failed:", err);
        throw new HttpsError("internal", "Role notification broadcast failed.");
    }
});

type OpenAiChatResponse = {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
};

type GeminiGenerateResponse = {
    error?: { message?: string };
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
                inlineData?: { data?: string };
            }>;
        };
    }>;
};

export const getMissionGuidance = onCall({ cors: true, secrets: [openAiKey] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Session invalid.');
    await enforceAiUsageQuota(
        request.auth,
        "mission",
        new Set(["owner", "admin", "super_admin", "ceo"]),
    );
    try {
        const { context, input: rawInput } = request.data;
        const prompt = rawInput || (context
            ? `You are BIN GROUP's property intelligence AI. Analyze this property data and provide a concise strategic maintenance recommendation (2-3 sentences):\n${JSON.stringify(context).substring(0, 2000)}`
            : 'Provide general property maintenance guidance for a UAE property.');
        const apiKey = openAiKey.value();
        if (!apiKey) {
            throw new HttpsError("failed-precondition", "AI service is not configured. OpenAI API key is missing.");
        }
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: "You are the BIN GROUP AI assistant. Be concise and practical." }, { role: "user", content: prompt }],
                max_tokens: 250
            })
        });
        const data = await response.json() as OpenAiChatResponse;
        if (!response.ok) {
            console.error("[getMissionGuidance] OpenAI request failed:", response.status, data?.error?.message || data);
            throw new HttpsError('internal', 'AI backend unavailable.');
        }
        const guidance = data.choices?.[0]?.message?.content;
        if (!guidance) throw new HttpsError('internal', 'AI backend returned no guidance.');
        return { status: "SUCCESS", guidance };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error("[getMissionGuidance] Unexpected error:", error);
        throw new HttpsError('internal', 'AI backend unavailable.');
    }
});

/**
 * [V11] SECURE ARCHITECTURAL CONCEPT GENERATOR
 * Calls Gemini from backend-only using Secret Manager.
 */
export const generateDesignConcept = onCall({ cors: true, secrets: [geminiApiKey] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Session invalid.');

    const uid = request.auth.uid;
    const tokenRole = normalizeRole(
        request.auth.token.role ||
        request.auth.token.userRole ||
        request.auth.token.primaryRole,
    );
    const isAdmin = request.auth.token.admin === true ||
        request.auth.token.isAdmin === true ||
        request.auth.token.superAdmin === true ||
        request.auth.token.super_admin === true ||
        ["admin", "super_admin", "ceo", "manager", "operations_admin"].includes(tokenRole);

    if (!isAdmin) throw new HttpsError('permission-denied', 'Unauthorized execution node.');

    try {
        const { requestId, scope, designStyle, imageBase64, mimeType } = request.data;
        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("failed-precondition", "AI service is not configured. Gemini API key is missing.");
        }

        const fullPrompt = `You are the Sovereign AI Architect for BIN GROUP LLC. 
            Redesign this ${scope?.zoneType || 'space'} using a ${designStyle} interior design style. 
            Maintain the original room structure, windows, and doors, but upgrade all materials, furniture, and lighting to ultra-premium institutional quality.
            Generate both a technical concept summary in JSON and a high-fidelity architectural render.`;

        const payload: any = {
            contents: [{
                parts: [
                    { text: fullPrompt }
                ]
            }],
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"],
                responseMimeType: "application/json"
            }
        };

        if (imageBase64 && mimeType) {
            payload.contents[0].parts.push({
                inlineData: { mimeType, data: imageBase64 }
            });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({})) as GeminiGenerateResponse;
            throw new Error(errData?.error?.message || `Gemini Error: ${response.statusText}`);
        }

        const result = await response.json() as GeminiGenerateResponse;
        const textPart = result.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
        const imagePart = result.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData?.data;

        const aiResponse = textPart ? JSON.parse(textPart) : {};

        // Sovereign Audit Log
        await logAudit({
            actorId: uid,
            actorRole: "admin",
            action: "GENERATE_DESIGN_CONCEPT",
            targetType: "design_requests",
            targetId: requestId || "unknown",
            metadata: { style: designStyle, zone: scope?.zoneType, hasImage: !!imagePart, timestamp: new Date().toISOString() }
        });

        return {
            status: "SUCCESS",
            concept: {
                conceptTitle: aiResponse.conceptTitle || "Sovereign Design Concept",
                conceptSummary: aiResponse.conceptSummary || "A bespoke architectural transformation.",
                recommendedMaterials: aiResponse.recommendedMaterials || [],
                estimatedScope: aiResponse.estimatedScope || "Institutional Grade Execution",
                generatedAt: new Date().toISOString()
            },
            generatedImage: imagePart || null
        };
    } catch (error: any) {
        console.error("Gemini Backend Failure:", error);
        throw new HttpsError('internal', 'Sovereign AI Synthesis faulty.');
    }
});

// ─── SCHEDULED MISSIONS ────────────────────────────────────────────────────

export const onApprovalStagnant = onSchedule({ schedule: "every 24 hours" }, async () => {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pending = await db.collection("maintenanceTickets")
        .where("status", "==", "AWAITING_OWNER_APPROVAL")
        .where("updatedAt", "<", admin.firestore.Timestamp.fromDate(fortyEightHoursAgo))
        .get();
    for (const doc of pending.docs) {
        const data = doc.data();
        if (data.ownerId) await dispatchOmniNotification(data.ownerId, "REMINDER: Quote Approval Required", `Mission #${doc.id.substring(0, 8)} is awaiting authorization.`);
    }
});

export const evaluateSLACron = onSchedule("every 4 hours", async () => {
    const now = admin.firestore.Timestamp.now();
    const twentyFourHoursAgo = new Date(now.toDate().getTime() - 24 * 60 * 60 * 1000);
    const staleTickets = await db.collection("maintenanceTickets")
        .where("status", "in", ["OPEN", "assigned"])
        .where("createdAt", "<", admin.firestore.Timestamp.fromDate(twentyFourHoursAgo))
        .get();
    for (const doc of staleTickets.docs) {
        await doc.ref.update({ slaViolated: true, lastEscalatedAt: now });
    }
});

export const scheduledDailyBackup = onSchedule("0 3 * * *", async () => {
    try {
        const client = new admin.firestore.v1.FirestoreAdminClient();
        const projectId = admin.app().options.projectId || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'UNKNOWN_PROJECT';
        const bucket = `gs://${projectId}.appspot.com/backups/live/${new Date().toISOString()}`;
        await client.exportDocuments({ name: client.databasePath(projectId, '(default)'), outputUriPrefix: bucket, collectionIds: [] });
    } catch (err) { }
});

// ─── SUMMARY SYNC ──────────────────────────────────────────────────────────

export const syncOwnerSummary = onDocumentUpdated("maintenanceTickets/{id}", async (event) => {
    const data = event.data?.after.data();
    if (!data?.ownerId) return;
    const ownerId = data.ownerId;
    const ticketsSnap = await db.collection("maintenanceTickets").where("ownerId", "==", ownerId).get();
    const propsSnap = await db.collection("properties").where("ownerId", "==", ownerId).get();
    let openCount = 0;
    ticketsSnap.forEach(docSnap => { if (!['COMPLETED', 'CLOSED', 'RESOLVED'].includes(docSnap.data().status)) openCount++; });
    await db.collection("owner_summaries").doc(ownerId).set({
        openTickets: openCount,
        propertyCount: propsSnap.size,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
});

export const syncAdminSummary = onDocumentCreated("maintenanceTickets/{id}", async () => {
    const summaryRef = db.collection("admin_summaries").doc("global");
    await summaryRef.update({
        openTickets: FieldValue.increment(1),
        lastUpdated: FieldValue.serverTimestamp()
    }).catch(() => summaryRef.set({ openTickets: 1, lastUpdated: FieldValue.serverTimestamp() }));
});

// ─── TENANT INVITATION SYSTEM ───────────────────────────────────────────────

function hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export const validateTenantInvitation = onCall({ cors: true }, async (request) => {
    const { token } = request.data || {};
    if (!token) throw new HttpsError("invalid-argument", "Token required.");

    const tokenHash = hashToken(token);
    const inviteSnap = await db.collection("tenant_invitations")
        .where("inviteTokenHash", "==", tokenHash)
        .limit(1)
        .get();

    if (inviteSnap.empty) throw new HttpsError("not-found", "Invalid or expired invitation.");

    const invite = inviteSnap.docs[0].data();
    if (invite.status === 'accepted' || invite.status === 'cancelled') {
        throw new HttpsError("failed-precondition", "This invitation is no longer active.");
    }

    // Safety check for expiresAt
    if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
        throw new HttpsError("failed-precondition", "This invitation has expired.");
    }

    return {
        tenantName: invite.tenantName,
        tenantEmail: invite.tenantEmail,
        propertyId: invite.propertyId,
        propertyName: invite.propertyName || "Institutional Asset",
        unitNumber: invite.unitNumber,
        expiresAt: invite.expiresAt.toDate().toISOString()
    };
});

export const sendTenantInvitations = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sovereign identity required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Admin access required.");

    const { importBatchId, propertyId, invitationIds } = request.data || {};
    let queryRef: admin.firestore.Query = db.collection("tenant_invitations").where("status", "==", "pending");

    if (invitationIds && Array.isArray(invitationIds)) {
        // Simple manual filter if needed, or query by IDs if count is low
    } else if (importBatchId) {
        queryRef = queryRef.where("importBatchId", "==", importBatchId);
    } else if (propertyId) {
        queryRef = queryRef.where("propertyId", "==", propertyId);
    }

    const snap = await queryRef.get();
    let sentCount = 0;
    let skippedCount = 0;

    const batch = db.batch();
    const now = Date.now();
    const expiresAt = new Date(now + 14 * 24 * 60 * 60 * 1000);

    for (const doc of snap.docs) {
        const invite = doc.data();
        if (invite.status !== 'pending' && invite.status !== 'failed') {
            skippedCount++;
            continue;
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawToken);

        const mailRef = db.collection("mail").doc();
        const mailDocumentId = mailRef.id;

        batch.update(doc.ref, {
            inviteTokenHash: tokenHash,
            status: 'sent',
            emailStatus: 'queued',
            emailQueuedAt: FieldValue.serverTimestamp(),
            mailDocumentId: mailDocumentId,
            sentAt: FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            updatedAt: FieldValue.serverTimestamp()
        });

        // Email Job
        const inviteLink = "https://bin-groups.com/tenant-invite?token=" + rawToken;
        const region = "europe-west3";
        const projectId = admin.app().options.projectId || process.env.GCLOUD_PROJECT || "bin-group-57c60";
        const trackingPixel = `https://${region}-${projectId}.cloudfunctions.net/trackTenantInvitationOpen?token=${rawToken}`;

        batch.set(mailRef, {
            to: invite.tenantEmail,
            message: {
                subject: "You are invited to BIN GROUP Tenant Portal",
                text: `Hello ${invite.tenantName},\n\nYou are invited to join the BIN GROUP Tenant Portal for Unit ${invite.unitNumber} at ${invite.propertyName || "your property"}.\n\nAccept Invitation: ${inviteLink}\n\nThis link expires on ${expiresAt.toLocaleDateString()}.\n\nSupport: support@bin-groups.com`,
                html: `<div style='font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;'>
                      <div style='text-align: center; margin-bottom: 20px;'>
                        <h1 style='color: #000; margin: 0;'>BIN GROUP</h1>
                        <p style='color: #666; font-size: 0.9rem;'>Institutional Asset Management</p>
                      </div>
                      <hr style='border: 0; border-top: 1px solid #eee;' />
                      <div style='padding: 20px 0;'>
                        <p>Hello <strong>${invite.tenantName}</strong>,</p>
                        <p>You have been invited to the Sovereign Tenant Portal for:</p>
                        <div style='background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;'>
                            <p style='margin: 5px 0;'><strong>Property:</strong> ${invite.propertyName || "Institutional Asset"}</p>
                            <p style='margin: 5px 0;'><strong>Unit:</strong> ${invite.unitNumber}</p>
                        </div>
                        <div style='text-align: center; margin: 40px 0;'>
                          <a href='${inviteLink}' style='background: #000; color: #fff; padding: 18px 30px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 1rem; display: inline-block;'>ACCEPT INVITATION</a>
                        </div>
                        <p style='font-size: 0.85rem; color: #666; line-height: 1.5;'>This secure link is unique to you and will expire on <strong>${expiresAt.toLocaleDateString()}</strong>. After expiry, you will need to request a new invitation from your property administrator.</p>
                      </div>
                      <hr style='border: 0; border-top: 1px solid #eee;' />
                      <div style='text-align: center; padding-top: 20px;'>
                        <p style='font-size: 0.75rem; color: #999; margin: 0;'>© 2026 BIN GROUP UAE. All Rights Reserved.</p>
                        <p style='font-size: 0.75rem; color: #999; margin: 5px 0;'>Security Notice: Do not share this link with others.</p>
                      </div>
                      <img src='${trackingPixel}' width='1' height='1' style='display:none;' />
                      </div>`
            },
            metadata: {
                type: "tenant_invitation",
                invitationId: doc.id,
                tenantId: invite.tenantId || "N/A",
                propertyId: invite.propertyId,
                unitId: invite.unitId || "N/A",
                batchId: importBatchId || "manual",
                createdBy: request.auth.uid,
                createdAt: FieldValue.serverTimestamp()
            }
        });

        batch.set(db.collection("tenant_invitation_events").doc(), {
            invitationId: doc.id,
            type: 'SENT',
            timestamp: FieldValue.serverTimestamp(),
            actorId: request.auth.uid
        });

        sentCount++;
        if (sentCount >= 450) break; // Batch limit safety
    }

    if (sentCount > 0) {
        await batch.commit();
        await logAudit({
            actorId: request.auth.uid,
            actorRole: 'admin',
            action: 'SEND_INVITATIONS',
            targetType: 'tenant_invitations',
            targetId: importBatchId || 'bulk',
            metadata: { sentCount, skippedCount }
        });
    }

    return { sentCount, skippedCount };
});

export const resendTenantInvitation = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sovereign identity required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Admin access required.");

    const { invitationId } = request.data || {};
    if (!invitationId) throw new HttpsError("invalid-argument", "Invitation ID required.");

    const inviteRef = db.collection("tenant_invitations").doc(invitationId);
    const inviteDoc = await inviteRef.get();
    if (!inviteDoc.exists) throw new HttpsError("not-found", "Invitation not found.");

    const invite = inviteDoc.data()!;
    if (invite.status === 'accepted') throw new HttpsError("failed-precondition", "Invitation already accepted.");

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const mailRef = db.collection("mail").doc();
    const mailDocumentId = mailRef.id;
    const batch = db.batch();

    batch.update(inviteRef, {
        inviteTokenHash: tokenHash,
        status: 'sent',
        emailStatus: 'queued',
        emailQueuedAt: FieldValue.serverTimestamp(),
        mailDocumentId: mailDocumentId,
        sentAt: FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        resendCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
    });

    const inviteLink = "https://bin-groups.com/tenant-invite?token=" + rawToken;

    batch.set(mailRef, {
        to: invite.tenantEmail,
        message: {
            subject: "RE: Your invitation to BIN GROUP Tenant Portal",
            html: `<div style='font-family: sans-serif; padding: 20px; color: #333;'>
                    <p>Hello ${invite.tenantName},</p>
                    <p>We are resending your invitation to the BIN GROUP Tenant Portal.</p>
                    <div style='margin: 30px 0;'>
                      <a href='${inviteLink}' style='background: #000; color: #fff; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>RE-ACCEPT INVITATION</a>
                    </div>
                   </div>`
        },
        metadata: {
            type: "tenant_invitation_resend",
            invitationId: invitationId,
            tenantId: invite.tenantId || "N/A",
            propertyId: invite.propertyId,
            createdBy: request.auth.uid,
            createdAt: FieldValue.serverTimestamp()
        }
    });

    batch.set(db.collection("tenant_invitation_events").doc(), {
        invitationId,
        type: 'RESENT',
        timestamp: FieldValue.serverTimestamp(),
        actorId: request.auth.uid
    });

    await batch.commit();
    return { success: true };
});

export const acceptTenantInvitation = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in to accept invitation.");
    const { token } = request.data || {};
    if (!token) throw new HttpsError("invalid-argument", "Token required.");

    const tokenHash = hashToken(token);
    const inviteSnap = await db.collection("tenant_invitations")
        .where("inviteTokenHash", "==", tokenHash)
        .limit(1)
        .get();

    if (inviteSnap.empty) throw new HttpsError("not-found", "Invalid or expired invitation.");

    const inviteDoc = inviteSnap.docs[0];
    const invite = inviteDoc.data();

    if (invite.status === 'accepted') throw new HttpsError("failed-precondition", "Invitation already used.");
    if (invite.status === 'cancelled') throw new HttpsError("failed-precondition", "Invitation cancelled.");
    const expiresAtMillis = typeof invite.expiresAt?.toMillis === "function"
        ? invite.expiresAt.toMillis()
        : Number.NaN;
    if (!Number.isFinite(expiresAtMillis)) {
        throw new HttpsError("failed-precondition", "Invitation has no valid expiry and cannot be accepted.");
    }
    if (expiresAtMillis < Date.now()) {
        await inviteDoc.ref.update({ status: 'expired' });
        throw new HttpsError("failed-precondition", "Invitation expired.");
    }

    const authUid = request.auth.uid;
    const authEmail = request.auth.token.email?.toLowerCase();
    if (request.auth.token.email_verified !== true) {
        throw new HttpsError("failed-precondition", "Verify the invited email address before accepting the invitation.");
    }
    if (authEmail !== invite.tenantEmail.toLowerCase()) {
        throw new HttpsError("permission-denied", "This invitation was sent to a different email address.");
    }

    let ownerId = "";
    if (invite && invite.propertyId) {
        const propDoc = await db.collection("properties").doc(String(invite.propertyId)).get();
        if (propDoc.exists) {
            ownerId = String(propDoc.data()?.ownerId || "");
        }
    }

    await db.runTransaction(async (transaction) => {
        const currentInviteSnap = await transaction.get(inviteDoc.ref);
        if (!currentInviteSnap.exists) throw new HttpsError("not-found", "Invitation no longer exists.");
        const currentInvite = currentInviteSnap.data() || {};
        if (currentInvite.status === "accepted") throw new HttpsError("already-exists", "Invitation already used.");
        if (currentInvite.status === "cancelled" || currentInvite.status === "expired") {
            throw new HttpsError("failed-precondition", "Invitation is no longer active.");
        }
        if (!currentInvite.expiresAt?.toMillis || currentInvite.expiresAt.toMillis() <= Date.now()) {
            throw new HttpsError("failed-precondition", "Invitation expired.");
        }

        let unitRef: FirebaseFirestore.DocumentReference | null = null;
        if (currentInvite.unitId) {
            unitRef = db.collection("units").doc(currentInvite.unitId);
            const unitSnap = await transaction.get(unitRef);
            if (!unitSnap.exists) throw new HttpsError("not-found", "Invited unit no longer exists.");
            const currentTenantId = String(unitSnap.data()?.tenantId || "").trim();
            if (currentTenantId && currentTenantId !== authUid && currentTenantId !== currentInvite.tenantId) {
                throw new HttpsError("failed-precondition", "Unit is already linked to another tenant.");
            }
        }

        const userRef = db.collection("users").doc(authUid);
        transaction.set(userRef, {
            uid: authUid,
            email: authEmail,
            role: "tenant",
            status: "active",
            displayName: currentInvite.tenantName,
            propertyId: currentInvite.propertyId,
            ownerId,
            unitId: currentInvite.unitId,
            tenantInvitationId: inviteDoc.id,
            acceptedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        if (unitRef) {
            transaction.update(unitRef, {
                tenantId: authUid,
                tenantUid: authUid,
                tenantName: currentInvite.tenantName,
                tenantEmail: currentInvite.tenantEmail,
                occupancyStatus: "occupied",
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        transaction.update(inviteDoc.ref, {
            status: "accepted",
            acceptedAt: FieldValue.serverTimestamp(),
            acceptedBy: authUid
        });
        transaction.set(db.collection("tenant_invitation_events").doc(), {
            invitationId: inviteDoc.id,
            type: "ACCEPTED",
            timestamp: FieldValue.serverTimestamp(),
            actorId: authUid
        });
    });

    const stubId = invite.tenantId;
    if (stubId && stubId !== authUid) {
        const [leases, ledgers] = await Promise.all([
            db.collection("leases").where("tenantId", "==", stubId).limit(200).get(),
            db.collection("tenant_ledger").where("tenantId", "==", stubId).limit(200).get(),
        ]);
        const writer = db.bulkWriter();
        for (const d of leases.docs) writer.update(d.ref, { tenantId: authUid, tenantUid: authUid });
        for (const d of ledgers.docs) writer.update(d.ref, { tenantId: authUid, tenantUid: authUid });
        await writer.close();
    }

    const existingClaims = (await admin.auth().getUser(authUid)).customClaims || {};
    await admin.auth().setCustomUserClaims(authUid, { ...existingClaims, role: "tenant" });
    return { status: "success", redirect: "/tenant", tokenRefreshRequired: true };
});

export const trackTenantInvitationOpen = onRequest(async (req, res) => {
    const { token } = req.query;
    if (token && typeof token === 'string') {
        const tokenHash = hashToken(token);
        const inviteSnap = await db.collection("tenant_invitations")
            .where("inviteTokenHash", "==", tokenHash)
            .limit(1)
            .get();

        if (!inviteSnap.empty) {
            const inviteDoc = inviteSnap.docs[0];
            const invite = inviteDoc.data();
            if (invite.status === 'sent') {
                await inviteDoc.ref.update({
                    status: 'opened',
                    openedAt: FieldValue.serverTimestamp()
                });
                await db.collection("tenant_invitation_events").add({
                    invitationId: inviteDoc.id,
                    type: 'OPENED',
                    timestamp: FieldValue.serverTimestamp()
                });
            }
        }
    }
    res.status(204).send();
});

export const expireTenantInvitations = onSchedule("0 0 * * *", async (event) => {
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection("tenant_invitations")
        .where("status", "in", ["pending", "sent", "opened"])
        .where("expiresAt", "<", now)
        .get();

    const batch = db.batch();
    snap.forEach(doc => {
        batch.update(doc.ref, { status: 'expired', updatedAt: FieldValue.serverTimestamp() });
        batch.set(db.collection("tenant_invitation_events").doc(), {
            invitationId: doc.id,
            type: 'EXPIRED',
            timestamp: FieldValue.serverTimestamp()
        });
    });

    if (snap.size > 0) {
        await batch.commit();
        console.log(`Expired ${snap.size} invitations.`);
    }
});

export const onMailStatusUpdated = onDocumentUpdated("mail/{docId}", async (event) => {
    const after = event.data?.after.data();
    if (!after || !after.delivery || !after.metadata?.invitationId) return;

    const invitationId = after.metadata.invitationId;
    const { state, error } = after.delivery;

    const emailStatus = state === 'SUCCESS' ? 'sent' : (state === 'ERROR' ? 'failed' : 'queued');

    await db.collection("tenant_invitations").doc(invitationId).update({
        emailStatus,
        deliveryError: error || null,
        updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`Updated invitation ${invitationId} email status to ${emailStatus}`);
});

export const onInvitationStatusChanged = onDocumentUpdated("tenant_invitations/{id}", async (event) => {
    const after = event.data?.after.data();
    if (!after || !after.importBatchId) return;

    const batchId = after.importBatchId;
    const batchSnap = await db.collection("tenant_import_batches")
        .where("importBatchId", "==", batchId)
        .limit(1)
        .get();

    if (batchSnap.empty) return;
    const batchRef = batchSnap.docs[0].ref;

    // Aggregate counts
    const invitesSnap = await db.collection("tenant_invitations")
        .where("importBatchId", "==", batchId)
        .get();

    let sent = 0;
    let failed = 0;
    let pending = 0;
    let accepted = 0;

    invitesSnap.forEach(doc => {
        const data = doc.data();
        if (data.status === 'accepted') accepted++;
        else if (data.emailStatus === 'sent') sent++;
        else if (data.emailStatus === 'failed') failed++;
        else pending++;
    });

    await batchRef.update({
        sentCount: sent,
        failedCount: failed,
        pendingCount: pending,
        acceptedCount: accepted,
        updatedAt: FieldValue.serverTimestamp()
    });
});

/**
 * STAGE 3: PROPERTY PASSPORT & RENT LEDGER AUTOMATION
 */

// Helper to calculate totals for a property passport
async function aggregatePassportData(propertyId: string) {
    const propertyRef = db.collection("properties").doc(propertyId);
    const propDoc = await propertyRef.get();
    if (!propDoc.exists) return;

    const propData = propDoc.data()!;
    const ownerId = propData.ownerId;

    // Aggregate Units
    const unitsSnap = await db.collection("units").where("propertyId", "==", propertyId).get();
    const totalUnits = unitsSnap.size;
    let occupiedUnits = 0;
    let vacantUnits = 0;

    unitsSnap.forEach(doc => {
        if (doc.data().occupancyStatus === 'occupied') occupiedUnits++;
        else vacantUnits++;
    });

    // Aggregate Leases & Ledgers
    const leasesSnap = await db.collection("leases").where("propertyId", "==", propertyId).get();
    let activeLeases = 0;
    let expiredLeases = 0;

    leasesSnap.forEach(doc => {
        const data = doc.data();
        if (data.leaseStatus === 'active') activeLeases++;
        else if (data.leaseStatus === 'expired') expiredLeases++;
    });

    const ledgersSnap = await db.collection("tenant_ledger").where("propertyId", "==", propertyId).get();
    let rentCollectedTotal = 0;
    let rentOutstandingTotal = 0;

    ledgersSnap.forEach(doc => {
        const data = doc.data();
        rentCollectedTotal += (Number(data.paidBalance) || 0);
        rentOutstandingTotal += (Number(data.outstandingBalance) || 0);
    });

    // Maintenance Tickets (Assuming maintenanceTickets collection)
    const ticketsSnap = await db.collection("maintenanceTickets").where("propertyId", "==", propertyId).get();
    let openTickets = 0;
    let closedTickets = 0;
    ticketsSnap.forEach(doc => {
        if (doc.data().status === 'closed' || doc.data().status === 'resolved') closedTickets++;
        else openTickets++;
    });

    const passportRef = db.collection("propertyPassports").doc(propertyId);

    await passportRef.set({
        propertyId,
        ownerId,
        propertyName: propData.name,
        propertyType: propData.type || "Institutional",
        emirate: propData.emirate || "Dubai",
        address: propData.address || "",
        totalUnits,
        occupiedUnits,
        vacantUnits,
        activeLeases,
        expiredLeases,
        rentCollectedTotal,
        rentOutstandingTotal,
        maintenanceTicketsOpen: openTickets,
        maintenanceTicketsClosed: closedTickets,
        tenantCount: occupiedUnits,
        passportStatus: 'active',
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`Updated Property Passport for ${propertyId}`);
}

// Triggers for Passport Sync
export const onPropertyCreatedSyncPassport = onDocumentCreated("properties/{propertyId}", async (event) => {
    const data = event.data?.data();
    if (data?.status === 'approved' || data?.status === 'active') {
        await aggregatePassportData(event.params.propertyId);
    }
});

export const onPropertyUpdatedSyncPassport = onDocumentUpdated("properties/{propertyId}", async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    if (after?.status !== before?.status && (after?.status === 'approved' || after?.status === 'active')) {
        await aggregatePassportData(event.params.propertyId);
    }
});

export const onUnitCreatedSyncPassport = onDocumentCreated("units/{unitId}", async (event) => {
    const data = event.data?.data();
    if (data?.propertyId) await aggregatePassportData(data.propertyId);
});

export const onUnitUpdatedSyncPassport = onDocumentUpdated("units/{unitId}", async (event) => {
    const data = event.data?.after.data();
    if (data?.propertyId) await aggregatePassportData(data.propertyId);
});

export const onLeaseCreatedSyncPassport = onDocumentCreated("leases/{leaseId}", async (event) => {
    const data = event.data?.data();
    if (data?.propertyId) await aggregatePassportData(data.propertyId);
});

export const onLeaseChangedSyncPassport = onDocumentUpdated("leases/{leaseId}", async (event) => {
    const data = event.data?.after.data();
    if (data?.propertyId) await aggregatePassportData(data.propertyId);
});

export const onLedgerCreatedSyncPassport = onDocumentCreated("tenant_ledger/{ledgerId}", async (event) => {
    const data = event.data?.data();
    if (data?.propertyId) await aggregatePassportData(data.propertyId);
});

export const onLedgerChangedSyncPassport = onDocumentUpdated("tenant_ledger/{ledgerId}", async (event) => {
    const data = event.data?.after.data();
    if (data?.propertyId) await aggregatePassportData(data.propertyId);
});

export const recalculatePropertyPassport = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Admin access required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Admin access required.");

    const { propertyId } = request.data;
    if (!propertyId) throw new HttpsError("invalid-argument", "Property ID required.");

    await aggregatePassportData(propertyId);
    return { success: true };
});

// ─── INSTITUTIONAL REPAIR TRIGGER ──────────────────────────────────────────

/**
 * Administrative tool to detect and repair orphaned or invalid maintenance tickets.
 * Supports dryRun mode to preview changes before committing.
 */
export const institutionalRepairTrigger = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");

    // Security Check: Verify admin custom claims or Firestore admin role
    const isAdmin = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin"]));
    if (!isAdmin) throw new HttpsError("permission-denied", "Admin access required.");

    const data = request.data || {};
    const dryRun = data.dryRun !== false; // Default to true if not explicitly false
    const maxDocs = Math.max(1, Math.min(200, Math.floor(Number(data.maxDocs) || 100)));
    const afterId = safeString(data.afterId);

    const log: string[] = [];
    const orphanTicketIds: string[] = [];
    const invalidStatusTicketIds: string[] = [];
    let docsMatched = 0;
    let docsUpdated = 0;
    let docsSkipped = 0;

    const allowedStatuses = [
        'OPEN', 'assigned', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS',
        'COMPLETED', 'cancelled', 'deferred', 'pending_approval',
        'on_hold', 'rejected', 'pending_assignment'
    ];

    log.push(`[SYSTEM] Starting institutional repair sequence at ${new Date().toISOString()}`);
    log.push(`[CONFIG] DryRun: ${dryRun} | Target: maintenanceTickets`);

    try {
        let ticketsQuery: admin.firestore.Query = db.collection("maintenanceTickets")
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(maxDocs);
        if (afterId) {
            ticketsQuery = ticketsQuery.startAfter(afterId);
        }
        const ticketsSnap = await ticketsQuery.get();
        docsMatched = ticketsSnap.size;

        const batch = db.batch();
        let batchCount = 0;

        for (const ticketDoc of ticketsSnap.docs) {
            const ticketData = ticketDoc.data();
            const ticketId = ticketDoc.id;
            let needsRepair = false;
            const repairs: any = {};

            // 1. Detect Orphan Tickets (missing critical relational IDs)
            if (!ticketData.propertyId || !ticketData.requesterId) {
                orphanTicketIds.push(ticketId);
                log.push(`[DETECTED] Orphan Ticket ${ticketId}: Missing propertyId(${!!ticketData.propertyId}) or requesterId(${!!ticketData.requesterId})`);
                needsRepair = true;
                repairs.isOrphan = true;
                repairs.repairFlag = 'flagged_orphan';
            }

            // 2. Detect Invalid Statuses (not in the Sovereign Operational Grid)
            if (!ticketData.status || !allowedStatuses.includes(ticketData.status)) {
                invalidStatusTicketIds.push(ticketId);
                log.push(`[DETECTED] Invalid Status for Ticket ${ticketId}: "${ticketData.status || 'UNDEFINED'}"`);
                needsRepair = true;
                if (!dryRun) {
                    repairs.previousStatus = ticketData.status || 'unknown';
                    repairs.status = 'OPEN'; // Auto-recovery to OPEN status
                    repairs.repairedAt = FieldValue.serverTimestamp();
                    repairs.repairType = 'status_recovery';
                }
            }

            if (needsRepair) {
                if (!dryRun) {
                    batch.update(ticketDoc.ref, {
                        ...repairs,
                        updatedAt: FieldValue.serverTimestamp(),
                        updatedBy: request.auth.uid,
                        repairMetadata: {
                            source: 'institutionalRepairTrigger',
                            timestamp: new Date().toISOString()
                        }
                    });
                    batchCount++;
                    docsUpdated++;

                } else {
                    docsSkipped++;
                }
            } else {
                docsSkipped++;
            }
        }

        // Final commit if any remaining
        if (batchCount > 0 && !dryRun) {
            await batch.commit();
        }

        // Write Audit Log on Commit
        if (!dryRun && docsUpdated > 0) {
            await logAudit({
                actorId: request.auth.uid,
                actorRole: "admin",
                action: "INSTITUTIONAL_REPAIR_TICKET",
                targetType: "system",
                targetId: "maintenanceTickets",
                reason: "System-wide maintenance ticket health check and recovery",
                metadata: {
                    docsMatched,
                    docsUpdated,
                    orphanTicketCount: orphanTicketIds.length,
                    invalidStatusCount: invalidStatusTicketIds.length,
                    dryRun: false
                }
            });
            log.push(`[AUDIT] Repair commit logged. Total docs repaired: ${docsUpdated}`);
        }

        log.push(`[COMPLETED] Repair sequence finished. Matched: ${docsMatched}, Updated: ${docsUpdated}, Skipped: ${docsSkipped}`);

        return {
            docsMatched,
            docsUpdated,
            docsSkipped,
            orphanTicketIds,
            invalidStatusTicketIds,
            nextAfterId: ticketsSnap.size === maxDocs
                ? ticketsSnap.docs[ticketsSnap.docs.length - 1]?.id || null
                : null,
            pageLimit: maxDocs,
            log,
            success: true
        };

    } catch (err: any) {
        log.push(`[CRITICAL] Error: ${err.message}`);
        console.error("Institutional Repair Failed:", err);
        throw new HttpsError("internal", "Institutional repair failed: " + err.message);
    }
});

// ─── TECHNICIAN DUTY COMMAND CENTER ────────────────────────────────────────

/**
 * Shared helper to create system notifications for stakeholders.
 * Also triggers a Push Notification if FCM tokens are available.
 */
async function createNotification(recipientId: string, data: {
    title: string,
    message: string,
    type: "TICKET_UPDATE" | "DUTY_UPDATE" | "SYSTEM",
    ticketId?: string,
    source: string
}) {
    try {
        // 1. Store in Firestore for In-App Notifications
        await db.collection("notifications").add({
            recipientId,
            ...data,
            read: false,
            createdAt: FieldValue.serverTimestamp()
        });

        // 2. Dispatch Push Notification (FCM)
        await sendSovereignPush(recipientId, data.title, data.message, {
            ticketId: data.ticketId,
            type: data.type
        });

    } catch (err) {
        console.error("Notification failed:", err);
    }
}

/**
 * Dispatch FCM Push Notifications to all registered devices for a user.
 */
async function sendSovereignPush(userId: string, title: string, body: string, data: any = {}) {
    try {
        const tokenDocs = await db.collection("users").doc(userId).collection("fcmTokens").get();
        if (tokenDocs.empty) return;

        const tokens = tokenDocs.docs.map(doc => doc.id);
        const messages = tokens.map(token => ({
            token,
            notification: { title, body },
            data: { ...data, click_action: "FLUTTER_NOTIFICATION_CLICK" } // Compatibility
        }));

        await admin.messaging().sendEach(messages);
        console.log(`[FCM] Dispatched ${messages.length} notifications to user ${userId}`);
    } catch (err) {
        console.error("FCM dispatch failure:", err);
    }
}

/**
 * Technician starts their duty shift.
 */
export const startTechnicianDuty = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");

    const isTech = await hasCallableRoleAccess(request.auth, new Set(["technician", "admin"]));
    if (!isTech) throw new HttpsError("permission-denied", "Technician access required.");
    await assertApprovedTechnicianAccount(request.auth);

    const techId = request.auth.uid;
    const techRef = db.collection("users").doc(techId);
    const techDoc = await techRef.get();
    const techData = techDoc.data() || {};
    const technicianProfile = await db.collection("technicians").doc(techId).get();
    const technicianData = technicianProfile.data() || {};
    const technicianStatus = normalizeRole(technicianData.status || techData.status);
    const technicianApproved = technicianStatus === "active" ||
        normalizeRole(technicianData.approvalStatus || techData.approvalStatus) === "approved";
    const technicianSuspended = technicianStatus === "suspended" ||
        technicianData.suspended === true ||
        techData.suspended === true;
    if (technicianSuspended || !technicianApproved) {
        throw new HttpsError("permission-denied", "Only approved, active technicians can start duty.");
    }
    const now = FieldValue.serverTimestamp();
    const nowDate = new Date();
    const gstDate = new Date(nowDate.getTime() + (4 * 60 * 60 * 1000));
    const dateKey = `${gstDate.getUTCFullYear()}${String(gstDate.getUTCMonth() + 1).padStart(2, "0")}${String(gstDate.getUTCDate()).padStart(2, "0")}`;
    const existingShiftId = String(techData.currentShiftId || "");
    const shiftId = existingShiftId || `${techId}_${dateKey}_${nowDate.getTime()}`;
    const shiftRef = db.collection("technician_shifts").doc(shiftId);
    const batch = db.batch();

    const shiftPayload: Record<string, any> = {
        shiftId,
        uid: techId,
        technicianId: techId,
        email: techData.email || request.auth.token?.email || "",
        displayName: techData.displayName || techData.fullName || "Technician",
        dateKey,
        status: "ACTIVE",
        clockIn: admin.firestore.Timestamp.fromDate(nowDate),
        startedAt: admin.firestore.Timestamp.fromDate(nowDate),
        source: "TECHNICIAN_DUTY_CALLABLE",
        createdAt: now,
        updatedAt: now
    };
    if (!existingShiftId) shiftPayload.breaks = [];

    batch.set(shiftRef, shiftPayload, { merge: true });

    batch.update(techRef, {
        onDuty: true,
        isAvailable: true,
        available: true,
        dutyStatus: "ON_DUTY",
        dutyStartedAt: now,
        currentShiftId: shiftId,
        lastSeenAt: now,
        updatedAt: now
    });

    await batch.commit();

    await logAudit({
        actorId: techId,
        actorRole: "technician",
        action: "TECH_START_DUTY",
        targetType: "user",
        targetId: techId,
        metadata: { shiftId, dateKey }
    });

    // Notify Admins (simplified)
    const admins = await db.collection("users").where("role", "==", "admin").limit(5).get();
    for (const adminDoc of admins.docs) {
        await createNotification(adminDoc.id, {
            title: "Technician Online",
            message: `Technician ${techId} has started duty.`,
            type: "DUTY_UPDATE",
            source: "TECH_PORTAL"
        });
    }

    return { success: true, shiftId };
});

/**
 * Technician ends their duty shift.
 * Blocks if there is an active job.
 */
export const endTechnicianDuty = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");

    const isTech = await hasCallableRoleAccess(request.auth, new Set(["technician", "admin"]));
    if (!isTech) throw new HttpsError("permission-denied", "Technician access required.");
    await assertApprovedTechnicianAccount(request.auth);

    const techId = request.auth.uid;
    const techDoc = await db.collection("users").doc(techId).get();
    const techData = techDoc.data() || {};

    // Block if active ticket
    if (techData.currentTicketId || techData.dutyStatus === "ON_JOB") {
        throw new HttpsError("failed-precondition", "Cannot end duty with an active job. Please complete or reassign your ticket first.");
    }

    const now = FieldValue.serverTimestamp();
    const nowDate = new Date();
    const shiftId = String(techData.currentShiftId || "");
    const batch = db.batch();

    batch.update(techDoc.ref, {
        onDuty: false,
        isAvailable: false,
        available: false,
        dutyStatus: "OFF_DUTY",
        dutyEndedAt: now,
        currentShiftId: FieldValue.delete(),
        updatedAt: now
    });

    if (shiftId) {
        batch.set(db.collection("technician_shifts").doc(shiftId), {
            status: "CLOSED",
            clockOut: admin.firestore.Timestamp.fromDate(nowDate),
            endedAt: admin.firestore.Timestamp.fromDate(nowDate),
            updatedAt: now
        }, { merge: true });
    }

    await batch.commit();

    await logAudit({
        actorId: techId,
        actorRole: "technician",
        action: "TECH_END_DUTY",
        targetType: "user",
        targetId: techId,
        metadata: { shiftId: shiftId || null }
    });

    return { success: true, shiftId: shiftId || null };
});

/**
 * Technician accepts an assigned job.
 */
export const acceptTechnicianJob = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");

    const isTech = await hasCallableRoleAccess(request.auth, new Set(["technician", "admin"]));
    if (!isTech) throw new HttpsError("permission-denied", "Technician access required.");
    await assertApprovedTechnicianAccount(request.auth);

    const { ticketId } = request.data;
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");

    const techId = request.auth.uid;
    const now = FieldValue.serverTimestamp();
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const userRef = db.collection("users").doc(techId);

    await db.runTransaction(async (transaction) => {
        const ticketSnap = await transaction.get(ticketRef);
        if (!ticketSnap.exists) throw new HttpsError("not-found", "Ticket not found.");

        const ticketData = ticketSnap.data() || {};
        const statusNorm = String(ticketData.status || "").toLowerCase();
        const technicianStatusNorm = String(ticketData.technicianStatus || "").toLowerCase();
        const assignedTechnicianId = ticketData.assignedTechnicianId || ticketData.technicianId || ticketData.assignedTechId || "";

        const acceptableStatuses = new Set([
            "open",
            "auto_assigned",
            "assigned",
            "pending_assignment",
            "technician_assigned"
        ]);

        if (!acceptableStatuses.has(statusNorm) && technicianStatusNorm !== "assigned") {
            throw new HttpsError("failed-precondition", "Ticket is not available for technician acceptance.");
        }

        if (["completed", "closed", "cancelled", "rejected"].includes(statusNorm)) {
            throw new HttpsError("failed-precondition", "Ticket is already closed or unavailable.");
        }

        if (!assignedTechnicianId && request.auth?.token?.admin !== true) {
            throw new HttpsError(
                "failed-precondition",
                "This mission must be assigned by dispatch before it can be accepted.",
            );
        }
        if (assignedTechnicianId && assignedTechnicianId !== techId && request.auth?.token?.admin !== true) {
            throw new HttpsError("permission-denied", "This ticket is assigned to another technician.");
        }

        transaction.update(ticketRef, {
            assignedTechnicianId: assignedTechnicianId || techId,
            technicianId: assignedTechnicianId || techId,
            status: "ACCEPTED",
            technicianStatus: "ACCEPTED",
            dispatchStatus: "ACCEPTED",
            acceptedAt: now,
            updatedAt: now
        });

        transaction.update(userRef, {
            dutyStatus: "ON_JOB",
            currentTicketId: ticketId,
            activeTicketId: ticketId,
            available: false,
            updatedAt: now
        });
    });

    await logAudit({
        actorId: techId,
        actorRole: "technician",
        action: "TECH_ACCEPT_JOB",
        targetType: "maintenanceTicket",
        targetId: ticketId
    });

    return { success: true };
});

/**
 * Technician starts actual work on site.
 */
export const startTechnicianWork = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");
    const { ticketId } = request.data;
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");

    const techId = request.auth.uid;
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Ticket not found.");
    const ticketData = ticketSnap.data() || {};
    await assertTechnicianTicketMutationAccess(request.auth, ticketData);

    await ticketRef.update({
        status: "IN_PROGRESS",
        technicianStatus: "WORK_STARTED",
        workStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    await logAudit({
        actorId: techId,
        actorRole: "technician",
        action: "TECH_START_WORK",
        targetType: "maintenanceTicket",
        targetId: ticketId
    });

    // Notify Tenant
    if (ticketData.requesterId) {
        await createNotification(ticketData.requesterId, {
            title: "Work Started",
            message: "The technician has started working on your request.",
            type: "TICKET_UPDATE",
            ticketId,
            source: "TECH_PORTAL"
        });
    }

    return { success: true };
});

/**
 * Technician pauses work (e.g. waiting for parts).
 */
export const pauseTechnicianWork = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");
    const { ticketId, reason } = request.data;
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");

    const techId = request.auth.uid;
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Ticket not found.");
    await assertTechnicianTicketMutationAccess(request.auth, ticketSnap.data() || {});

    await ticketRef.update({
        status: "on_hold",
        technicianStatus: "WAITING_PARTS",
        pausedAt: FieldValue.serverTimestamp(),
        pauseReason: reason || "Waiting for parts",
        updatedAt: FieldValue.serverTimestamp()
    });

    await logAudit({
        actorId: techId,
        actorRole: "technician",
        action: "TECH_PAUSE_WORK",
        targetType: "maintenanceTicket",
        targetId: ticketId,
        reason: reason || "Waiting for parts"
    });

    return { success: true };
});

/**
 * Technician finishes work and submits evidence.
 */
export const finishTechnicianWork = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");
    const { ticketId, afterPhotos, beforePhotos, notes } = request.data;
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");
    if (!beforePhotos || !Array.isArray(beforePhotos) || beforePhotos.length === 0) {
        throw new HttpsError("invalid-argument", "Before photo proof is mandatory to finish work.");
    }

    if (!afterPhotos || !Array.isArray(afterPhotos) || afterPhotos.length === 0) {
        throw new HttpsError("invalid-argument", "After photo proof is mandatory to finish work.");
    }

    const completionNotes = String(notes || '').trim();
    if (completionNotes.length < 10) {
        throw new HttpsError("invalid-argument", "Technician completion notes must be at least 10 characters.");
    }

    const techId = request.auth.uid;
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Ticket not found.");
    const ticketData = ticketSnap.data() || {};
    await assertTechnicianTicketMutationAccess(request.auth, ticketData);

    await db.runTransaction(async (transaction) => {
        transaction.update(ticketRef, {
            status: "COMPLETED_PENDING_APPROVAL",
            technicianStatus: "COMPLETED",
            completedAt: FieldValue.serverTimestamp(),
            beforePhotos,
            afterPhotos,
            completionNotes,
            notes: completionNotes,
            technicianNotes: completionNotes,
            tenantApprovalRequired: true,
            updatedAt: FieldValue.serverTimestamp()
        });

        transaction.update(db.collection("users").doc(techId), {
            dutyStatus: "ON_DUTY",
            currentTicketId: null,
            updatedAt: FieldValue.serverTimestamp()
        });
    });

    await logAudit({
        actorId: techId,
        actorRole: "technician",
        action: "TECH_FINISH_WORK",
        targetType: "maintenanceTicket",
        targetId: ticketId,
        metadata: { photoCount: afterPhotos.length }
    });

    // Notify Tenant for Approval
    if (ticketData.requesterId) {
        await createNotification(ticketData.requesterId, {
            title: "Work Completed",
            message: "Technician has finished the work. Please review and approve.",
            type: "TICKET_UPDATE",
            ticketId,
            source: "TECH_PORTAL"
        });
    }

    return { success: true };
});

/**
 * Admin or system closes the job after verification.
 */
export const closeTechnicianJob = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");
    const { ticketId } = request.data;
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");

    const isAdmin = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin"]));
    if (!isAdmin) throw new HttpsError("permission-denied", "Only administrators can close tickets.");
    await db.collection("maintenanceTickets").doc(ticketId).update({
        status: "CLOSED",
        technicianStatus: "CLOSED",
        closedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    await logAudit({
        actorId: request.auth.uid,
        actorRole: "admin",
        action: "ADMIN_CLOSE_TICKET",
        targetType: "maintenanceTicket",
        targetId: ticketId
    });

    return { success: true };
});

/**
 * Registers an FCM token for a user.
 * users/{uid}/fcmTokens/{token}
 */
export const registerFCMToken = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const { token, platform, userAgent } = request.data;
    if (!token) throw new HttpsError("invalid-argument", "Token required.");

    const uid = request.auth.uid;
    await db.collection("users").doc(uid).collection("fcmTokens").doc(token).set({
        token,
        platform: platform || "web",
        userAgent: userAgent || "unknown",
        createdAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true };
});

/**
 * [V14] IOT GATEWAY TRIGGER
 * Standardized endpoint for Smart Building Sensors to pulse telemetry or trigger alarms.
 */
export const triggerIoTEvent = onRequest({
    cors: false,
    secrets: [iotGatewayToken],
}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    try {
        const payload = assertPlainObject(req.body || {}, "IoT event");
        const deviceId = safeString(payload.device_id);
        const propertyId = safeString(payload.property_id);
        const eventType = safeString(payload.event_type);
        const sourceEventId = safeString(payload.event_id);
        const urgency = safeString(payload.urgency || "nominal").toLowerCase();
        const occurredAtMs = Date.parse(safeString(payload.timestamp || payload.occurred_at));
        const telemetry = assertPlainObject(payload.telemetry || {}, "IoT telemetry");
        if (
            !deviceId ||
            !propertyId ||
            !sourceEventId ||
            !/^[A-Za-z0-9_.:-]{3,180}$/.test(sourceEventId) ||
            !/^[a-z0-9_:-]{2,80}$/i.test(eventType) ||
            !Number.isFinite(occurredAtMs) ||
            Math.abs(Date.now() - occurredAtMs) > 5 * 60 * 1000 ||
            JSON.stringify(telemetry).length > 16_000
        ) {
            res.status(400).send("Invalid or stale IoT event");
            return;
        }
        const configuredToken = iotGatewayToken.value();
        if (!configuredToken) {
            res.status(503).send("IoT gateway is not configured");
            return;
        }
        const provided = Buffer.from(String(req.get("x-iot-gateway-token") || ""));
        const expected = Buffer.from(configuredToken);
        if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
            res.status(401).send("Unauthorized Device Node");
            return;
        }
        const eventHash = crypto.createHash("sha256")
            .update(`${deviceId}|${propertyId}|${eventType}|${sourceEventId}`)
            .digest("hex");
        const eventId = `iot_${eventHash}`;
        const ticketId = `iot_ticket_${eventHash}`;
        const eventRef = db.collection("telemetry_logs").doc(eventId);
        const deviceRef = db.collection("iot_devices").doc(deviceId);
        const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
        const isCritical = urgency === "critical" || eventType === "leak_detected" || eventType === "fire_alarm";
        let duplicate = false;
        await db.runTransaction(async (transaction) => {
            const [eventSnap, deviceSnap] = await Promise.all([
                transaction.get(eventRef),
                transaction.get(deviceRef),
            ]);
            if (eventSnap.exists) {
                duplicate = true;
                return;
            }
            const device = deviceSnap.data() || {};
            if (
                !deviceSnap.exists ||
                device.active !== true ||
                safeString(device.propertyId) !== propertyId
            ) {
                throw new HttpsError("permission-denied", "IoT device is not registered for this property.");
            }
            const timestamp = FieldValue.serverTimestamp();
            transaction.create(eventRef, {
                eventId: sourceEventId,
                eventHash,
                deviceId,
                propertyId,
                type: eventType,
                urgency,
                telemetry,
                occurredAt: admin.firestore.Timestamp.fromMillis(occurredAtMs),
                receivedAt: timestamp,
                processed: isCritical,
                duplicate: false,
            });
            if (isCritical) {
                transaction.create(ticketRef, {
                    propertyId,
                    title: `IOT ALERT: ${eventType.replace(/_/g, " ").toUpperCase()}`,
                    description: `Automated alert triggered by registered device ${deviceId}.`,
                    status: "OPEN",
                    priority: "EMERGENCY",
                    category: eventType === "fire_alarm" ? "FIRE_SAFETY" : "IOT_ALERT",
                    source: "IOT_SENSOR",
                    sourceEventId,
                    sourceEventHash: eventHash,
                    deviceId,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                });
                transaction.create(db.collection("audit_logs").doc(`iot_${eventHash}`), {
                    actorId: deviceId,
                    actorRole: "iot_device",
                    action: "IOT_CRITICAL_TRIGGER",
                    targetType: "maintenanceTickets",
                    targetId: ticketId,
                    metadata: { eventType, urgency, eventHash },
                    createdAt: timestamp,
                });
            }
        });
        res.status(200).json({
            success: true,
            eventId,
            duplicate,
            ticketId: isCritical ? ticketId : null,
            message: duplicate ? "Duplicate event acknowledged" : isCritical ? "Triage initiated" : "Telemetry logged",
        });
    } catch (error: any) {
        const status = error instanceof HttpsError && error.code === "permission-denied" ? 403 : 500;
        console.error("IoT Gateway Failure:", { code: error?.code || "internal" });
        res.status(status).json({ error: status === 403 ? "Device registration rejected" : "IoT event processing failed" });
    }
});

/**
 * [V12] PENDING TENANT ONBOARDING TRIGGER
 * Automates welcome email generation when an admin pre-loads a tenant.
 */
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
                    <a href="https://bin-groups.com/login" style="display: inline-block; background: #C6A75E; color: #000; padding: 14px 32px; text-decoration: none; font-weight: 900; border-radius: 100px; margin-top: 20px;">Sign Up Now</a>
                    <hr style="border: 0; border-top: 1px solid #EEE; margin: 32px 0;">
                    <p style="font-size: 12px; color: #94A3B8;">This is a sovereign institutional communication. Unauthorized access is monitored.</p>
                </div>
            `
        },
        createdAt: FieldValue.serverTimestamp()
    });
});

/**
 * [V15] SOVEREIGN PAYMENT PROCESSOR
 * Atomic transaction processing for AED institutional payments.
 */
export const processPayment = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Identity verification failed.");
    throw new HttpsError(
        "failed-precondition",
        "Legacy client-authoritative settlement is disabled. Use a verified Stripe checkout or an audited finance-admin payment approval.",
    );
});


/**
 * [PHASE 5] ADMIN UNIT OPERATIONS CONTROL
 * Allows administrators to update unit lifecycle state, occupancy, and maintenance status.
 */
export const updateUnitOpsState = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Admin identity required.");
    const adminUid = request.auth.uid;
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin", "ceo"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Only administrators can update unit lifecycle states.");

    const payload = assertPlainObject(request.data || {}, "Unit update payload");
    const unitId = safeString(payload.unitId);

    if (!unitId) throw new HttpsError("invalid-argument", "Unit ID is required.");

    const occupancyStatus = safeString(payload.occupancyStatus);
    const tenantStatus = safeString(payload.tenantStatus);
    const maintenanceStatus = safeString(payload.maintenanceStatus);
    const adminStatusNotes = safeString(payload.adminStatusNotes);

    // Validation
    const validOccupancy = ["vacant", "occupied", "under_maintenance"];
    const validTenantStatus = ["none", "invited", "active", "moved_out"];
    const validMaintenance = ["normal", "under_maintenance", "blocked"];

    if (occupancyStatus && !validOccupancy.includes(occupancyStatus)) {
        throw new HttpsError("invalid-argument", `Invalid occupancyStatus: ${occupancyStatus}`);
    }
    if (tenantStatus && !validTenantStatus.includes(tenantStatus)) {
        throw new HttpsError("invalid-argument", `Invalid tenantStatus: ${tenantStatus}`);
    }
    if (maintenanceStatus && !validMaintenance.includes(maintenanceStatus)) {
        throw new HttpsError("invalid-argument", `Invalid maintenanceStatus: ${maintenanceStatus}`);
    }

    const unitRef = db.collection("units").doc(unitId);
    const unitSnap = await unitRef.get();
    if (!unitSnap.exists) throw new HttpsError("not-found", "Unit record not found.");

    const timestamp = FieldValue.serverTimestamp();
    const updates: any = {
        updatedAt: timestamp,
        statusUpdatedAt: timestamp,
        statusUpdatedBy: adminUid
    };

    if (occupancyStatus) updates.occupancyStatus = occupancyStatus;
    if (tenantStatus) updates.tenantStatus = tenantStatus;
    if (maintenanceStatus) updates.maintenanceStatus = maintenanceStatus;
    if (adminStatusNotes !== undefined) updates.adminStatusNotes = adminStatusNotes;

    await db.runTransaction(async (transaction) => {
        transaction.update(unitRef, updates);

        // Audit Log
        const auditRef = db.collection("audit_logs").doc();
        transaction.set(auditRef, {
            action: "UNIT_OPS_UPDATE",
            actorId: adminUid,
            actorRole: "admin",
            targetType: "units",
            targetId: unitId,
            before: unitSnap.data(),
            after: { ...unitSnap.data(), ...updates },
            createdAt: timestamp
        });
    });

    return { success: true };
});

// ─── LIVE CHAT & PUSH NOTIFICATIONS ────────────────────────────────────────

export const onChatMessageSent = onDocumentCreated({ document: "maintenanceTickets/{ticketId}/messages/{messageId}" }, async (event) => {
    const snap = event.data;
    if (!snap) return;

    const message = snap.data();
    const ticketId = event.params.ticketId;
    const senderId = message.senderId;

    // Look up the ticket
    const ticketSnap = await db.collection("maintenanceTickets").doc(ticketId).get();
    if (!ticketSnap.exists) return;
    const ticket = ticketSnap.data() || {};

    const tenantId = ticket.tenantId || ticket.reporterId;
    const techId = ticket.assignedTechnicianId;

    if (!tenantId && !techId) return;

    let targetUserId = "";
    let senderName = message.senderName || "User";

    if (senderId === tenantId) {
        // Sender is tenant, notify technician
        targetUserId = techId;
    } else if (senderId === techId) {
        // Sender is technician, notify tenant
        targetUserId = tenantId;
    } else {
        // Could be an admin or someone else, decide if we notify anyone. For now, try to notify both if they didn't send it?
        // Wait, usually the message has a `senderRole` or similar. Let's just default to returning if not tenant or tech.
        return;
    }

    if (!targetUserId) return;

    const textSnippet = message.text ? (message.text.length > 50 ? message.text.substring(0, 50) + "..." : message.text) : (message.imageUrl ? "Sent an image" : "Sent a message");

    await dispatchOmniNotification(targetUserId, `New Message from ${senderName}`, textSnippet, {
        extraData: { ticketId, type: "chat_message" },
        url: `/ticket/${ticketId}`
    });
});

export const onTechnicianDutyStatusChanged = onDocumentUpdated("users/{uid}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;
    
    const role = String(after.role || "").toLowerCase();
    if (role !== "technician") return;

    const normalizeDutyLifecycleStatus = (value: any) => {
        const status = String(value || "OFF").trim().replace(/\s+/g, "_").toUpperCase();
        if (["ON_DUTY", "WORKING", "ACTIVE", "READY", "AVAILABLE"].includes(status)) return "WORKING";
        if (["ON_BREAK", "BREAK", "STANDBY"].includes(status)) return "BREAK";
        if (["OFF_DUTY", "OFF", "OFFLINE", "INACTIVE"].includes(status)) return "OFF";
        return status;
    };
    const beforeStatus = normalizeDutyLifecycleStatus(before?.dutyStatus);
    const afterStatus = normalizeDutyLifecycleStatus(after.dutyStatus);
    if (beforeStatus === afterStatus) return;

    const uid = event.params.uid;
    const now = new Date();
    
    // YYYYMMDD dateKey in Gulf Standard Time (GST, UTC+4)
    const gstOffset = 4 * 60 * 60 * 1000;
    const gstDate = new Date(now.getTime() + gstOffset);
    const yyyy = gstDate.getUTCFullYear();
    const mm = String(gstDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(gstDate.getUTCDate()).padStart(2, '0');
    const dateKey = `${yyyy}${mm}${dd}`;
    
    const docId = `${uid}_${dateKey}`;
    const attendanceRef = db.collection("attendance").doc(docId);

    if (beforeStatus === "OFF" && afterStatus === "WORKING") {
        await attendanceRef.set({
            uid,
            technicianId: uid,
            email: after.email || "",
            displayName: after.displayName || after.fullName || "Technician",
            dateKey,
            clockIn: admin.firestore.Timestamp.fromDate(now),
            status: "working",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    } 
    else if (beforeStatus === "WORKING" && afterStatus === "BREAK") {
        await attendanceRef.update({
            breaks: FieldValue.arrayUnion({ start: now }),
            status: "break",
            updatedAt: FieldValue.serverTimestamp()
        });
    }
    else if (beforeStatus === "BREAK" && afterStatus === "WORKING") {
        const snap = await attendanceRef.get();
        if (snap.exists) {
            const data = snap.data() || {};
            const breaks = Array.isArray(data.breaks) ? [...data.breaks] : [];
            if (breaks.length > 0) {
                const last = breaks[breaks.length - 1];
                if (last && !last.end) {
                    last.end = now;
                }
            }
            await attendanceRef.update({
                breaks,
                status: "working",
                updatedAt: FieldValue.serverTimestamp()
            });
        } else {
            await attendanceRef.update({
                status: "working",
                updatedAt: FieldValue.serverTimestamp()
            });
        }
    }
    else if ((beforeStatus === "WORKING" || beforeStatus === "BREAK") && afterStatus === "OFF") {
        const snap = await attendanceRef.get();
        if (snap.exists) {
            const data = snap.data() || {};
            const breaks = Array.isArray(data.breaks) ? [...data.breaks] : [];
            if (beforeStatus === "BREAK" && breaks.length > 0) {
                const last = breaks[breaks.length - 1];
                if (last && !last.end) {
                    last.end = now;
                }
            }

            const clockInTs = data.clockIn;
            let clockInDate = now;
            if (clockInTs instanceof admin.firestore.Timestamp) {
                clockInDate = clockInTs.toDate();
            } else if (clockInTs) {
                clockInDate = new Date(clockInTs);
            }

            const totalMinutes = Math.max(0, Math.round((now.getTime() - clockInDate.getTime()) / 60000));
            
            let scheduledMinutes = 480; // 8 hours default
            const workingHoursStr = after.workingHours || "";
            if (workingHoursStr) {
                const match = workingHoursStr.match(/(\d+)\s*(AM|PM)\s*-\s*(\d+)\s*(AM|PM)/i);
                if (match) {
                    let startHour = parseInt(match[1], 10);
                    const startAmpm = match[2].toUpperCase();
                    let endHour = parseInt(match[3], 10);
                    const endAmpm = match[4].toUpperCase();
                    if (startAmpm === 'PM' && startHour < 12) startHour += 12;
                    if (startAmpm === 'AM' && startHour === 12) startHour = 0;
                    if (endAmpm === 'PM' && endHour < 12) endHour += 12;
                    if (endAmpm === 'AM' && endHour === 12) endHour = 0;
                    let diffHours = endHour - startHour;
                    if (diffHours < 0) diffHours += 24;
                    scheduledMinutes = diffHours * 60;
                }
            }

            const overtimeMinutes = totalMinutes > scheduledMinutes ? (totalMinutes - scheduledMinutes) : 0;

            await attendanceRef.update({
                breaks,
                clockOut: admin.firestore.Timestamp.fromDate(now),
                totalMinutes,
                overtimeMinutes,
                status: "completed",
                updatedAt: FieldValue.serverTimestamp()
            });
        }
    }
});

export const onTicketTechnicianAssignmentChanged = onDocumentUpdated({ document: "maintenanceTickets/{id}" }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;

    const ticketId = event.params.id;
    const beforeTechId = before?.assignedTechnicianId;
    const afterTechId = after.assignedTechnicianId;

    if (beforeTechId !== afterTechId && afterTechId) {
        const ref8 = ticketId.substring(0, 8).toUpperCase();
        const category = after.category || after.issueType || "Maintenance";
        const propertyName = after.propertyName || "Property";

        await dispatchOmniNotification(afterTechId, "New Job Assigned", `Job Assigned: #${ref8} at ${propertyName} (${category}).`, {
            url: `/technician/job/${ticketId}`
        });

        await logAudit({
            actorId: after.updatedBy || "SYSTEM",
            actorRole: after.updatedByRole || "system",
            action: "MANUAL_TECHNICIAN_ASSIGNMENT_NOTIFY",
            targetType: "maintenanceTickets",
            targetId: ticketId,
            metadata: { technicianId: afterTechId }
        });
    }
});

// Restores the Firebase trigger while keeping command execution outside Functions.
export const onBinGptEngineerCommandCreated = onDocumentCreated(
    "binGptEngineerCommands/{commandId}",
    async (event) => {
        const commandId = event.params.commandId;
        const data = event.data?.data();
        if (!data) return;

        const now = FieldValue.serverTimestamp();
        const isoNow = new Date().toISOString();

        const historyEntry = {
            status: "PLAN_CREATED",
            at: isoNow,
            note: "Command received by backend trigger. Queued for secure runner."
        };

        const auditEntry = {
            action: "BACKEND_TRIGGER_ACCEPTED",
            actorUid: "SYSTEM",
            actorEmail: "system@bin-groups.com",
            actorRole: "system",
            at: isoNow,
            note: "onBinGptEngineerCommandCreated fired. Command queued for GitHub Actions runner."
        };

        try {
            await db.collection("binGptEngineerCommands").doc(commandId).update({
                status: "PLAN_CREATED",
                runnerState: "WAITING_FOR_SECURE_BACKEND_RUNNER",
                runnerStatus: "WAITING_FOR_SECURE_BACKEND_RUNNER",
                buildStatus: data.buildStatus || "NOT_STARTED",
                deploymentStatus: data.deploymentStatus || "NOT_STARTED",
                commandHistory: FieldValue.arrayUnion(historyEntry),
                auditTrail: FieldValue.arrayUnion(auditEntry),
                updatedAt: now
            });

            console.info("onBinGptEngineerCommandCreated: command accepted", {
                commandId,
                createdBy: data.createdBy || "unknown",
                status: "PLAN_CREATED"
            });
        } catch (err) {
            console.error("onBinGptEngineerCommandCreated: failed to update command document", {
                commandId,
                err
            });
        }
    }
);

// ─── NEW FEATURES ─────────────────────────────────────────────────────────
export { assessDamage } from "./damageAssessment";
export * from "./adminReports";
