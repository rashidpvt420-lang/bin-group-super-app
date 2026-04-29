import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { extractTitleDeedData } from "./ocrEngine";
import { generateContractPDF, generatePayslipPDF } from "./pdfEngine";

// [V10] PRODUCTION GRADE FULL-STACK STABILIZATION
setGlobalOptions({ region: "europe-west3" });

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// Secrets
const openAiKey = defineSecret("OPENAI_API_KEY");
const smtpUserSecret = defineSecret("SMTP_USER");
const smtpPassSecret = defineSecret("SMTP_PASS");

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
            createdAt: admin.firestore.FieldValue.serverTimestamp()
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
    const tokenRole = normalizeRole(token.role || token.userRole || token.primaryRole);
    if (token.admin === true || token.super_admin === true || token.superAdmin === true || allowedRoles.has(tokenRole)) return true;
    const userDoc = await db.collection("users").doc(authContext.uid).get();
    const userData = userDoc.data() || {};
    const firestoreRole = normalizeRole(userData.role || userData.userRole || userData.primaryRole);
    return userData.isAdmin === true || userData.admin === true || userData.superAdmin === true || userData.super_admin === true || allowedRoles.has(firestoreRole);
}

function assertPlainObject(value: any, label: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new HttpsError("invalid-argument", `${label} is required.`);
    }
    return value;
}

function cleanPlainValue(value: any): any {
    if (value === undefined) return null;
    if (value === null) return null;
    if (value instanceof admin.firestore.GeoPoint) return value;
    if (value instanceof admin.firestore.FieldValue) return value;
    if (value instanceof admin.firestore.Timestamp) return value;
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map(cleanPlainValue);
    if (typeof value === "object") {
        const output: any = {};
        Object.entries(value).forEach(([key, entry]) => {
            if (typeof entry !== "function") output[key] = cleanPlainValue(entry);
        });
        return output;
    }
    return value;
}

function safeString(value: any, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function assertOwnerSubmissionGeo(property: any) {
    const geoSource = property?.geo || property?.location || property?.coordinates || {};
    const lat = Number(geoSource.lat ?? geoSource.latitude);
    const lng = Number(geoSource.lng ?? geoSource.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new HttpsError("invalid-argument", "A valid property geo-anchor is required before submission.");
    }
    if (lat === 0 && lng === 0) {
        throw new HttpsError("invalid-argument", "Default coordinates cannot be used for property onboarding.");
    }

    const source = safeString(geoSource.source || property?.geoSource || "google_maps");
    const isManual = source === "admin_manual";
    const address = safeString(geoSource.address || property?.addressLine || property?.address);
    const emirate = safeString(geoSource.emirate || property?.emirate);
    let city = safeString(geoSource.city || property?.city || property?.area);
    let area = safeString(geoSource.area || property?.area || city);

    if (!address && !geoSource.placeId && !property?.googlePlaceId) {
        throw new HttpsError("invalid-argument", "Address or Google Place ID is required for property onboarding.");
    }
    if (!emirate || (!city && !area)) {
        throw new HttpsError("invalid-argument", "Emirate and city/area are required for property onboarding.");
    }

    let normalizedEmirate = emirate;
    if (normalizedEmirate.toLowerCase() === "al ain" || city.toLowerCase() === "al ain" || area.toLowerCase().includes("falaj hazza")) {
        normalizedEmirate = "Abu Dhabi";
        city = "Al Ain";
        area = area.toLowerCase().includes("falaj hazza") ? "Falaj Hazza" : area || "Al Ain";
    }

    return {
        point: new admin.firestore.GeoPoint(lat, lng),
        lat,
        lng,
        geohash: safeString(geoSource.geohash, geohashForLocation(lat, lng)),
        address,
        emirate: normalizedEmirate,
        city: city || area,
        area: area || city,
        placeId: safeString(geoSource.placeId || property?.googlePlaceId || (isManual ? "MANUAL" : "")),
        source: isManual ? "admin_manual" : "google_maps",
        verified: false,
        verifiedBy: null,
        verifiedAt: null,
        requiresGeoReview: true,
        dispatchReady: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
}

function getPlanCoverageForSubmission(selectedPlan: any) {
    return {
        included: Array.isArray(selectedPlan?.features) ? selectedPlan.features : [],
        excluded: Array.isArray(selectedPlan?.exclusions) ? selectedPlan.exclusions : [],
        pricingBasis: selectedPlan?.id || selectedPlan?.name || "hybrid",
        slaLevel: selectedPlan?.id === "hybrid" ? "Priority" : "Standard"
    };
}

export const submitOwnerOnboarding = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in before submitting onboarding.");

    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["owner", "admin", "super_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Only an owner or admin can submit owner onboarding.");

    const uid = request.auth.uid;
    const payload = assertPlainObject(request.data || {}, "Onboarding payload");
    const ownerAccount = assertPlainObject(payload.ownerAccount || {}, "Owner account");
    if (ownerAccount.uid && ownerAccount.uid !== uid && request.auth.token?.admin !== true) {
        throw new HttpsError("permission-denied", "Owner onboarding can only be submitted for the signed-in owner.");
    }

    const properties = Array.isArray(payload.properties) ? payload.properties : [];
    if (!properties.length) throw new HttpsError("invalid-argument", "At least one property is required.");

    const selectedPlan = assertPlainObject(payload.selectedPlan || payload.servicePlan || {}, "Service plan");
    const payment = assertPlainObject(payload.payment || {}, "Payment");
    const paymentMethod = safeString(payment.method || payload.paymentMethod);
    if (!paymentMethod) throw new HttpsError("invalid-argument", "Payment method is required.");

    const onboardingSessionId = safeString(payload.onboardingSessionId, `session_${Date.now()}`);
    const submissionId = safeString(payload.idempotencyKey, `${uid}_${onboardingSessionId}`);
    const intakeId = submissionId;
    const propertyId = safeString(properties[0]?.propertyId || properties[0]?.id, `${submissionId}_property`);
    const contractId = `${submissionId}_contract`;
    const paymentTransactionId = `${submissionId}_mobilization`;
    const auditLogId = `${submissionId}_submit`;
    const companyId = "BIN_GROUP";
    const projectId = "bin-group-57c60";
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const planCoverage = getPlanCoverageForSubmission(selectedPlan);
    const estimatedAnnualValue = Number(payload.pricing?.annualContractValue || payload.portfolioSummary?.estimatedACV || 2500);
    const mobilizationAmount = Math.round(estimatedAnnualValue * 0.15);
    const proofDocuments = cleanPlainValue(payload.proofDocuments || {});

    console.info("submitOwnerOnboarding.received", {
        uid,
        tokenRole: request.auth.token?.role || null,
        payloadKeys: Object.keys(payload),
        propertyCount: properties.length,
        proofKeys: Object.keys(proofDocuments)
    });

    const normalizedProperties = properties.map((property: any, index: number) => {
        const geo = assertOwnerSubmissionGeo(property);
        return cleanPlainValue({
            ...property,
            companyId,
            projectId,
            ownerId: uid,
            propertyId: index === 0 ? propertyId : safeString(property.propertyId || property.id, `${submissionId}_property_${index}`),
            propertyName: property.propertyName || property.name || property.address || `${property.propertyType || "Property"} ${index + 1}`,
            addressLine: property.addressLine || property.address || geo.address,
            googlePlaceId: property.googlePlaceId || geo.placeId || null,
            emirate: geo.emirate,
            city: geo.city,
            area: geo.area,
            geo,
            location: { lat: geo.lat, lng: geo.lng },
            coordinates: { lat: geo.lat, lng: geo.lng },
            status: "PENDING_ADMIN_REVIEW",
            activationState: "LOCKED_PENDING_ADMIN_APPROVAL",
            dispatchReady: false,
            verified: false,
            approved: false,
            updatedAt: timestamp
        });
    });

    const baseLifecycle = {
        companyId,
        projectId,
        ownerId: uid,
        userId: uid,
        createdBy: uid,
        createdByRole: request.auth.token?.admin === true ? "admin" : "owner",
        visibility: "admin_owner",
        auditVersion: 1
    };

    const intakeRef = db.collection("intake_submissions").doc(intakeId);
    const propertyRef = db.collection("properties_pending").doc(propertyId);
    const contractRef = db.collection("contracts").doc(contractId);
    const paymentRef = db.collection("payment_transactions").doc(paymentTransactionId);
    const auditRef = db.collection("audit_logs").doc(auditLogId);
    const ownerRef = db.collection("owners").doc(uid);
    const userRef = db.collection("users").doc(uid);

    const [existingIntake, , existingContract, existingPayment, existingOwner] = await Promise.all([
        intakeRef.get(),
        propertyRef.get(),
        contractRef.get(),
        paymentRef.get(),
        ownerRef.get()
    ]);

    const batch = db.batch();

    batch.set(intakeRef, cleanPlainValue({
        ...baseLifecycle,
        intakeId,
        idempotencyKey: submissionId,
        onboardingSessionId,
        ownerAccount: {
            uid,
            fullName: ownerAccount.fullName || ownerAccount.name || "",
            email: ownerAccount.email || request.auth.token?.email || "",
            mobile: ownerAccount.mobile || ownerAccount.phone || "",
            createdBeforePayment: true
        },
        contactInfo: cleanPlainValue(payload.contactInfo || {}),
        companyProfile: cleanPlainValue(payload.companyProfile || {}),
        properties: normalizedProperties,
        propertyDetails: normalizedProperties,
        selectedPlan: cleanPlainValue(selectedPlan),
        servicePlan: {
            id: selectedPlan?.id || "hybrid",
            name: selectedPlan?.name || selectedPlan?.packageName || "Institutional Package",
            coverage: planCoverage.included,
            exclusions: planCoverage.excluded,
            slaLevel: planCoverage.slaLevel
        },
        contractType: selectedPlan?.id || selectedPlan?.name || "hybrid",
        selectedAddOns: cleanPlainValue(Array.isArray(payload.selectedAddOns) ? payload.selectedAddOns : []),
        addOns: cleanPlainValue(Array.isArray(payload.addOns) ? payload.addOns : payload.selectedAddOns || []),
        proofDocuments,
        ownerIdentityDocuments: {
            emiratesId: proofDocuments.emiratesId || null,
            passport: proofDocuments.passport || null,
            tradeLicense: proofDocuments.tradeLicense || null
        },
        titleDeed: {
            status: proofDocuments.propertyProof ? "uploaded" : "missing",
            verificationStatus: proofDocuments.propertyProof ? "manual_review_required" : "missing",
            source: "OWNER_UPLOADED_DOCUMENT",
            verifiedFieldsLocked: false,
            locationGeoAnchorRequired: true
        },
        portfolioSummary: cleanPlainValue(payload.portfolioSummary || {}),
        pricing: {
            annualContractValue: estimatedAnnualValue,
            mobilizationPercent: 15,
            mobilizationAmount,
            currency: "AED"
        },
        payment: {
            paymentId: paymentTransactionId,
            contractId,
            method: paymentMethod,
            state: "PAYMENT_PENDING",
            amount: mobilizationAmount,
            currency: "AED",
            mobilizationPercent: 15
        },
        paymentState: "PAYMENT_PENDING",
        paymentStatus: "PENDING",
        paymentGate: {
            required: true,
            mobilizationPercent: 15,
            dashboardUnlockRequiresAdminApproval: true
        },
        adminReviewState: "AWAITING_VERIFICATION",
        activationState: "LOCKED_PENDING_ADMIN_APPROVAL",
        status: "AWAITING_VERIFICATION",
        source: "OWNER_PUBLIC_ONBOARDING_CALLABLE_V1",
        ...(existingIntake.exists ? {} : { createdAt: timestamp }),
        updatedAt: timestamp
    }), { merge: true });

    // FIX: Iterate through ALL properties and save to pending collection
    normalizedProperties.forEach((p: any) => {
        const pRef = db.collection("properties_pending").doc(p.propertyId);
        batch.set(pRef, cleanPlainValue({
            ...p,
            intakeId,
            contractId,
            paymentTransactionId,
            source: "OWNER_PUBLIC_ONBOARDING_CALLABLE_V1",
            createdAt: timestamp,
            updatedAt: timestamp
        }), { merge: true });
    });

    batch.set(contractRef, cleanPlainValue({
        ...baseLifecycle,
        contractId,
        intakeId,
        propertyId,
        idempotencyKey: `${submissionId}_contract`,
        status: "PENDING_APPROVAL",
        contractStatus: "draft",
        activationStatus: "LOCKED_PENDING_ADMIN_APPROVAL",
        paymentVerified: false,
        paymentStatus: "PENDING",
        approved: false,
        packageName: selectedPlan?.name || selectedPlan?.packageName || "Institutional Package",
        planType: selectedPlan?.id || "hybrid",
        selectedAddOns: cleanPlainValue(Array.isArray(payload.selectedAddOns) ? payload.selectedAddOns : []),
        coverage: planCoverage.included,
        exclusions: planCoverage.excluded,
        signatureState: {
            ownerSigned: false,
            binGroupsSigned: false,
            pdfGenerated: false,
            emailed: false
        },
        paymentSchedule: {
            mobilizationPercent: 15,
            mobilizationAmount,
            remainingBalance: Math.max(estimatedAnnualValue - mobilizationAmount, 0),
            currency: "AED"
        },
        portfolioSummary: cleanPlainValue(payload.portfolioSummary || {}),
        annualContractValue: estimatedAnnualValue,
        depositAmount: mobilizationAmount,
        ...(existingContract.exists ? {} : { createdAt: timestamp }),
        updatedAt: timestamp
    }), { merge: true });

    batch.set(paymentRef, cleanPlainValue({
        ...baseLifecycle,
        paymentId: paymentTransactionId,
        intakeId,
        propertyId,
        contractId,
        idempotencyKey: `${submissionId}_mobilization`,
        amount: mobilizationAmount,
        currency: "AED",
        method: paymentMethod,
        gateway: paymentMethod === "BANK_TRANSFER" ? "MANUAL_BANK" : "MANUAL",
        status: "PENDING",
        verificationState: "ADMIN_VERIFICATION_REQUIRED",
        verified: false,
        unlocksDashboard: false,
        history: [{ status: "PENDING", timestamp: new Date(), note: "15% mobilization submitted for admin verification." }],
        ...(existingPayment.exists ? {} : { createdAt: timestamp }),
        updatedAt: timestamp
    }), { merge: true });

    batch.set(ownerRef, cleanPlainValue({
        ownerId: uid,
        uid,
        name: ownerAccount.fullName || ownerAccount.name || "",
        displayName: ownerAccount.fullName || ownerAccount.name || "",
        email: ownerAccount.email || request.auth.token?.email || "",
        phone: ownerAccount.mobile || ownerAccount.phone || "",
        status: "PAYMENT_PENDING",
        dashboardUnlocked: false,
        activeContractId: contractId,
        latestIntakeId: intakeId,
        testAccount: existingOwner.data()?.testAccount === true || request.auth.token?.testAccount === true,
        ...(existingOwner.exists ? {} : { createdAt: timestamp }),
        updatedAt: timestamp
    }), { merge: true });

    batch.set(userRef, cleanPlainValue({
        role: "owner",
        status: "PAYMENT_PENDING",
        dashboardUnlocked: false,
        activeContractId: contractId,
        latestIntakeId: intakeId,
        updatedAt: timestamp
    }), { merge: true });

    batch.set(auditRef, cleanPlainValue({
        actorId: uid,
        actorRole: request.auth.token?.admin === true ? "admin" : "owner",
        action: "OWNER_ONBOARDING_SUBMIT",
        targetType: "intake_submissions",
        targetId: intakeId,
        after: {
            intakeId,
            propertyId,
            contractId,
            paymentTransactionId,
            status: "pending_admin_review"
        },
        metadata: {
            callable: "submitOwnerOnboarding",
            idempotencyKey: submissionId,
            payloadKeys: Object.keys(payload)
        },
        createdAt: timestamp
    }), { merge: true });

    await batch.commit();

    console.info("submitOwnerOnboarding.committed", {
        uid,
        intakeId,
        propertyId,
        contractId,
        paymentTransactionId,
        auditLogId,
        status: "pending_admin_review"
    });

    return {
        intakeId,
        propertyId,
        contractId,
        paymentTransactionId,
        auditLogId,
        status: "pending_admin_review"
    };
});

// ─── [V10] TICKET LIFECYCLE & AUTO-REPAIR ──────────────────────────────────────────

export const onTicketStatusChanged = onDocumentUpdated("maintenanceTickets/{id}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || before?.status === after.status) return;

    const ticketId = event.params.id;

    await logAudit({
        actorId: after.updatedBy || "SYSTEM",
        actorRole: after.updatedByRole || "system",
        action: "STATUS_CHANGE",
        targetType: "maintenanceTickets",
        targetId: ticketId,
        before: before?.status,
        after: after.status
    });

    if (after.status === 'ESTIMATED' && after.estimatedCost && Number(after.estimatedCost) <= 1000) {
        await event.data?.after.ref.update({
            status: 'APPROVED',
            approvalType: 'AUTO_REPAIR_THRESHOLD',
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (after.ownerId) {
            await dispatchOmniNotification(after.ownerId, "AUTO-REPAIR ACTIVE", `A minor repair (AED ${after.estimatedCost}) at ${after.propertyName} has been auto-approved.`);
        }

        await logAudit({
            actorId: "SYSTEM_RULES",
            actorRole: "system",
            action: "AUTO_APPROVAL",
            targetType: "maintenanceTickets",
            targetId: ticketId,
            metadata: { cost: after.estimatedCost, threshold: 1000 }
        });
    } else if (after.status === 'ESTIMATED' && after.ownerId) {
        await dispatchOmniNotification(after.ownerId, "NEW QUOTE GENERATED", `A technical estimate for #${ticketId.substring(0,8)} is ready.`);
    }

    if (after.status === 'COMPLETED' && after.ownerId) {
        await dispatchOmniNotification(after.ownerId, "MISSION COMPLETED", `Task #${ticketId.substring(0,8)} has been finalized.`);
    }
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
                assignmentError: "Missing geo-anchor."
            });
            return;
        }

        const techQuery = await db.collection("users").where("role", "in", ["technician", "specialist"]).get();
        const requiredSkill = String(ticketData.complaintCategory || ticketData.trade || "").toLowerCase();
        
        const candidates = techQuery.docs
            .map((d) => ({ id: d.id, data: d.data() }))
            .filter((tech) => {
                const data = tech.data;
                const onDuty = data.onDuty === true || data.available === true;
                const hasCapacity = Number(data.currentJobCount || 0) < Number(data.maxConcurrentJobs || 3);
                const sameEmirate = String(data.emirate || "").toLowerCase() === String(contextUpdate.emirate).toLowerCase();
                const skills = Array.isArray(data.tradeSkills) ? data.tradeSkills.map((s: any) => String(s).toLowerCase()) : [String(data.trade || "").toLowerCase()];
                const skillMatch = !requiredSkill || skills.some((s: string) => requiredSkill.includes(s) || s.includes(requiredSkill));
                return onDuty && hasCapacity && sameEmirate && skillMatch;
            })
            .map((tech) => ({
                ...tech,
                distance: distanceKm(normalizeGeo(tech.data), propertyGeo),
                sameArea: String(tech.data.primaryArea || "").toLowerCase() === String(contextUpdate.area).toLowerCase()
            }))
            .sort((a, b) => Number(b.sameArea) - Number(a.sameArea) || a.distance - b.distance);

        if (candidates.length > 0) {
            const bestTech = candidates[0];
            await snap.ref.update({
                assignedTechnicianId: bestTech.id,
                assignedTechnicianName: bestTech.data.displayName || "Specialist",
                status: "assigned",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await dispatchOmniNotification(bestTech.id, "New Job Assigned", `${ticketData.complaintCategory || "Fault"} at ${contextUpdate.propertyLocation.propertyName}`, {
                url: `/tech`,
                extraData: { ticketId: event.params.ticketId, openRoute: true }
            });

            await logAudit({
                actorId: "DISPATCH_ENGINE",
                actorRole: "system",
                action: "AUTO_ASSIGN",
                targetType: "maintenanceTickets",
                targetId: event.params.ticketId,
                metadata: { techId: bestTech.id, reason: bestTech.sameArea ? "AREA_MATCH" : "DISTANCE" }
            });
        }
    } catch (err) {
        console.error("AutoRoute Failure:", err);
    }
});

// ─── OMNI-CHANNEL NOTIFICATION ENGINE ───────────────────────────────────────

async function dispatchOmniNotification(userId: string, title: string, body: string, options: any = {}) {
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) return;
        const userData = userDoc.data();
        const fcmTokens: string[] = userData?.fcmTokens || [];
        
        if (fcmTokens.length > 0) {
            const messages = fcmTokens.map(token => ({
                token,
                notification: { title, body },
                data: { ...options.extraData, url: options.url || '/' }
            }));
            await admin.messaging().sendEach(messages);
        }

        if (userData?.email && options.type === 'CRITICAL') {
            await db.collection("mail").add({
                to: userData.email,
                message: {
                    subject: `[BIN GROUP] ${title}`,
                    html: `<p>${body}</p>`
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (err) {
        console.error("Notification Error:", err);
    }
}

// ─── INFRASTRUCTURE CALLABLES ──────────────────────────────────────────────

export const processTitleDeedOCR = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sovereign identity required.");
    const { fileUrl } = request.data;
    if (!fileUrl) throw new HttpsError("invalid-argument", "Missing document stream.");
    try {
        const extractedData = await extractTitleDeedData(fileUrl);
        await logAudit({
            actorId: request.auth.uid, actorRole: "user",
            action: "OCR_SCAN", targetType: "properties", targetId: "temp",
            metadata: { fileUrl }
        });
        return { status: "SUCCESS", data: extractedData };
    } catch (err: any) {
        throw new HttpsError("internal", "Document parsing node failed.");
    }
});

export const generateInstitutionalContract = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sovereign identity required.");
    const { contractData } = request.data;
    try {
        const pdfUrl = await generateContractPDF({ ...contractData, ownerId: request.auth.uid });
        await logAudit({
            actorId: request.auth.uid, actorRole: "owner",
            action: "CONTRACT_GENERATE", targetType: "contracts", targetId: contractData.contractId || "new"
        });
        return { status: "SUCCESS", pdfUrl };
    } catch (err: any) {
        throw new HttpsError("internal", "Contract synthesis failed.");
    }
});

export const generateAndEmailPayslip = onCall({
    cors: true,
    secrets: [smtpUserSecret, smtpPassSecret]
}, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Admin access required.");
    const hasPayrollAccess = await hasCallableRoleAccess(request.auth, new Set(["admin", "super_admin", "ceo", "hr_manager", "finance_admin"]));
    if (!hasPayrollAccess) throw new HttpsError("permission-denied", "Unauthorized.");

    const { staffId, payPeriod, staffName, basicSalary, allowances, overtime, deductions } = request.data || {};
    const netSalary = Number(basicSalary) + Number(allowances) + Number(overtime) - Number(deductions);

    try {
        const pdfUrl = await generatePayslipPDF({ staffId, staffName, payPeriod, paymentDate: new Date().toLocaleDateString(), basicSalary, allowances, overtime, deductions, netSalary });
        return { success: true, pdfUrl };
    } catch (err: any) {
        throw new HttpsError("internal", "Payroll failed.");
    }
});

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
                messages: [{ role: "system", content: "You are the BIN GROUP AI assistant." }, { role: "user", content: input }],
                max_tokens: 250
            })
        });
        const data = await response.json();
        return { status: "SUCCESS", guidance: data.choices?.[0]?.message?.content };
    } catch (error) {
        throw new HttpsError('internal', 'AI backend unavailable.');
    }
});

// ─── SCHEDULED MISSIONS ────────────────────────────────────────────────────

export const onApprovalStagnant = onSchedule("every 24 hours", async () => {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pending = await db.collection("maintenanceTickets")
        .where("status", "==", "AWAITING_OWNER_APPROVAL")
        .where("updatedAt", "<", admin.firestore.Timestamp.fromDate(fortyEightHoursAgo))
        .get();
    for (const doc of pending.docs) {
        const data = doc.data();
        if (data.ownerId) await dispatchOmniNotification(data.ownerId, "REMINDER: Quote Approval Required", `Mission #${doc.id.substring(0,8)} is awaiting authorization.`);
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
        const projectId = admin.app().options.projectId || 'bin-group-57c60';
        const bucket = `gs://${projectId}.appspot.com/backups/live/${new Date().toISOString()}`;
        await client.exportDocuments({ name: client.databasePath(projectId, '(default)'), outputUriPrefix: bucket, collectionIds: [] });
    } catch (err) {}
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
});

export const syncAdminSummary = onDocumentCreated("maintenanceTickets/{id}", async () => {
    const summaryRef = db.collection("admin_summaries").doc("global");
    await summaryRef.update({
        openTickets: admin.firestore.FieldValue.increment(1),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => summaryRef.set({ openTickets: 1, lastUpdated: admin.firestore.FieldValue.serverTimestamp() }));
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

export const onIntakeCreated = onDocumentCreated("intake_submissions/{id}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    try {
        await db.collection("properties").add({ propertyName: data.propertyName || 'New Asset', ownerEmail: data.ownerEmail, status: 'PENDING_APPROVAL', createdAt: admin.firestore.FieldValue.serverTimestamp() });
        await snap.ref.update({ status: 'PROCESSED' });
    } catch (err) {
        await snap.ref.update({ status: 'ERROR', error: String(err) });
    }
});
