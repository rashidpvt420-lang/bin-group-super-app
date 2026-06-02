import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import * as crypto from "crypto";
import { extractTitleDeedData } from "./ocrEngine";
import { generateContractPDF, generatePayslipPDF } from "./pdfEngine";
export { deliverNotificationPush } from "./notificationDelivery";

// [V10] PRODUCTION GRADE FULL-STACK STABILIZATION
setGlobalOptions({ region: "europe-west3" });

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// Secrets
const openAiKey = defineSecret("OPENAI_API_KEY");
const geminiApiKey = defineSecret("GEMINI_API_KEY");
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

function buildPropertyPassportRecord(args: {
    property: any;
    ownerId: string;
    ownerAccount: any;
    intakeId: string;
    contractId: string;
    paymentTransactionId: string;
    selectedPlan: any;
    selectedAddOns: any[];
    estimatedAnnualValue: number;
    paymentMethod: string;
    projectId: string;
    companyId: string;
    timestamp: any;
}) {
    const p = args.property || {};
    const geo = p.geo || {};
    const units = Number(p.units || 0);
    const occupiedUnits = Number(p.occupiedUnits || 0);
    return cleanPlainValue({
        passportId: p.propertyId,
        propertyId: p.propertyId,
        ownerId: args.ownerId,
        ownerName: args.ownerAccount.fullName || args.ownerAccount.name || '',
        ownerEmail: args.ownerAccount.email || '',
        companyId: args.companyId,
        projectId: args.projectId,
        intakeId: args.intakeId,
        emirate: p.emirate || geo.emirate || '',
        city: p.city || geo.city || '',
        zone: p.area || geo.area || '',
        gps: geo.lat && geo.lng ? { lat: geo.lat, lng: geo.lng, geohash: geo.geohash || null } : null,
        location: p.location || null,
        address: p.addressLine || p.address || geo.address || '',
        propertyType: p.propertyType || '',
        assetClass: p.assetGrade || p.subType || 'Standard',
        floors: Number(p.floors || 0),
        units,
        occupiedUnits,
        vacantUnits: Math.max(units - occupiedUnits, 0),
        offices: Number(p.offices || 0),
        shops: Number(p.shops || 0),
        lifts: Number(p.lifts || 0),
        parkingSpaces: Number(p.parkingCapacity || p.parking || 0),
        pools: Number(p.poolsCount || (p.pool ? 1 : 0)),
        gardens: Boolean(p.majlisGarden || p.irrigationSystem),
        buildingAge: Number(p.age || 0),
        conditionRating: p.condition || 'Good',
        currentContractType: args.selectedPlan?.id || args.selectedPlan?.name || 'hybrid',
        contractId: args.contractId,
        contractStartDate: null,
        contractEndDate: null,
        annualContractValue: args.estimatedAnnualValue,
        paymentPlan: args.paymentMethod,
        selectedAddOns: args.selectedAddOns,
        activeTenants: 0,
        tenantHistory: [],
        openTickets: 0,
        closedTickets: 0,
        slaBreaches: 0,
        technicianHistory: [],
        preventiveMaintenanceSchedule: [],
        complianceDocuments: [],
        titleDeedStatus: p.titleDeedStatus || 'manual_review_required',
        corporateOwnerStatus: p.ownerType === 'Government' ? 'government' : 'private',
        insuranceStatus: 'not_recorded',
        fireSafetyStatus: p.fireAlarm || p.firePump ? 'requires_certificate_review' : 'not_recorded',
        elevatorServiceStatus: Number(p.lifts || 0) > 0 ? 'requires_amc_review' : 'not_applicable',
        hvacStatus: p.hvac ? 'requires_pm_schedule' : 'not_recorded',
        plumbingStatus: 'not_recorded',
        electricalStatus: 'not_recorded',
        cleaningStatus: 'not_recorded',
        securityStatus: p.securityLevel || 'Standard',
        serviceHistory: [],
        quoteHistory: [{ intakeId: args.intakeId, annualContractValue: args.estimatedAnnualValue, createdAt: new Date() }],
        contractHistory: [{ contractId: args.contractId, status: 'PENDING_APPROVAL', createdAt: new Date() }],
        paymentHistory: [{ paymentId: args.paymentTransactionId, status: 'PENDING', createdAt: new Date() }],
        photosDocuments: [],
        adminNotes: [],
        riskPriorityLevel: p.condition === 'Poor' || Number(p.age || 0) > 20 ? 'HIGH' : 'NORMAL',
        buildingPerformanceIndex: null,
        lastInspectionDate: null,
        nextInspectionDate: null,
        status: 'PENDING_ADMIN_REVIEW',
        createdAt: args.timestamp,
        updatedAt: args.timestamp
    });
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
    const projectId = admin.app().options.projectId || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "UNKNOWN_PROJECT";
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

    // Persist ALL properties and create/update a canonical Property Passport per property.
    normalizedProperties.forEach((p: any) => {
        const pRef = db.collection("properties_pending").doc(p.propertyId);
        const passportRef = db.collection("propertyPassports").doc(p.propertyId);
        batch.set(pRef, cleanPlainValue({
            ...p,
            intakeId,
            contractId,
            paymentTransactionId,
            source: "OWNER_PUBLIC_ONBOARDING_CALLABLE_V1",
            createdAt: timestamp,
            updatedAt: timestamp
        }), { merge: true });
        batch.set(passportRef, buildPropertyPassportRecord({
            property: p,
            ownerId: uid,
            ownerAccount,
            intakeId,
            contractId,
            paymentTransactionId,
            selectedPlan,
            selectedAddOns: Array.isArray(payload.selectedAddOns) ? payload.selectedAddOns : [],
            estimatedAnnualValue,
            paymentMethod,
            projectId,
            companyId,
            timestamp
        }), { merge: true });
    });

    batch.set(contractRef, cleanPlainValue({
        ...baseLifecycle,
        contractId,
        intakeId,
        propertyId,
        propertyIds: normalizedProperties.map((p: any) => p.propertyId),
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
        propertyIds: normalizedProperties.map((p: any) => p.propertyId),
        contractId,
        paymentTransactionId,
        auditLogId,
        status: "pending_admin_review"
    });

    return {
        intakeId,
        propertyId,
        propertyIds: normalizedProperties.map((p: any) => p.propertyId),
        contractId,
        paymentTransactionId,
        auditLogId,
        status: "pending_admin_review"
    };
});


// ─── LEGACY TECHNICIAN DUTY REMOVED IN FAVOR OF STAGE 10 ─────────────────

export const takeTechnicianBreak = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    const shiftId = userData?.currentShiftId;
    if (!shiftId) throw new HttpsError("failed-precondition", "No active shift found.");

    const now = admin.firestore.FieldValue.serverTimestamp();

    const batch = db.batch();
    batch.update(userRef, { dutyStatus: 'BREAK', updatedAt: now });
    batch.update(db.collection("technician_shifts").doc(shiftId), {
        breaks: admin.firestore.FieldValue.arrayUnion({ start: new Date(), type: 'STANDARD' }),
        updatedAt: now
    });

    await batch.commit();
    return { status: "SUCCESS" };
});

export const resumeTechnicianDuty = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
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

    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.update(userRef, { dutyStatus: 'WORKING', updatedAt: now });
    batch.update(db.collection("technician_shifts").doc(shiftId), {
        breaks,
        updatedAt: now
    });

    await batch.commit();
    return { status: "SUCCESS" };
});

export const acceptTechnicianTicket = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["technician", "admin", "super_admin", "operations_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Technician access required.");
    const { ticketId } = request.data;
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();
    if (!ticketDoc.exists) throw new HttpsError("not-found", "Ticket not found.");
    const ticketData = ticketDoc.data()!;

    const existingTechId = ticketData.assignedTechnicianId || ticketData.technicianId || '';
    if (existingTechId && existingTechId !== request.auth.uid) {
        throw new HttpsError("failed-precondition", "Ticket is already assigned to another technician.");
    }

    if (!['OPEN', 'open', 'AUTO_ASSIGNED', 'auto_assigned', 'assigned', 'pending_assignment'].includes(ticketData.status)) {
        throw new HttpsError("failed-precondition", "Ticket is not available for acceptance.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await ticketRef.update({
        status: 'ACCEPTED',
        assignedTechnicianId: request.auth.uid,
        acceptedAt: now,
        updatedAt: now
    });

    await logAudit({
        actorId: request.auth.uid, actorRole: "technician",
        action: "ACCEPT_TICKET", targetType: "maintenanceTickets", targetId: ticketId
    });

    return { status: "SUCCESS" };
});

export const updateTicketLifecycle = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const { ticketId, status, notes, proofType, proofUrl } = request.data;
    const allowedStatuses = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED_PENDING_APPROVAL', 'COMPLETED'];
    if (!allowedStatuses.includes(status)) throw new HttpsError("invalid-argument", "Invalid status transition.");

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();
    if (!ticketDoc.exists) throw new HttpsError("not-found", "Ticket not found.");
    const ticketData = ticketDoc.data()!;

    if (ticketData.assignedTechnicianId !== request.auth.uid && request.auth.token?.admin !== true) {
        throw new HttpsError("permission-denied", "You are not assigned to this mission.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const updateData: any = {
        status,
        updatedAt: now
    };

    if (status === 'EN_ROUTE') updateData.onTheWayAt = now;
    if (status === 'ARRIVED') updateData.arrivedAt = now;
    if (status === 'IN_PROGRESS') updateData.startedAt = now;
    if (status === 'COMPLETED' || status === 'COMPLETED_PENDING_APPROVAL') {
        updateData.completedAt = now;
        updateData.notes = notes || ticketData.notes;
    }

    if (proofType && proofUrl) {
        if (proofType === 'BEFORE') updateData.beforePhotoUrl = proofUrl;
        if (proofType === 'AFTER') updateData.afterPhotoUrl = proofUrl;
        if (proofType === 'SIGNATURE') updateData.signatureUrl = proofUrl;
    }

    await ticketRef.update(updateData);

    await logAudit({
        actorId: request.auth.uid, actorRole: "technician",
        action: `LIFECYCLE_${status}`, targetType: "maintenanceTickets", targetId: ticketId,
        metadata: { notes, proofType }
    });

    // Notify Owner on completion
    if (status === 'COMPLETED' && ticketData.ownerId) {
        await dispatchOmniNotification(ticketData.ownerId, "Mission Completed", `The technician has finished the work at ${ticketData.propertyName}. View details in your dashboard.`);
    }

    return { status: "SUCCESS" };
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
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        if (ownerId) await dispatchOmniNotification(ownerId, "AUTO-REPAIR ACTIVE", `A minor repair (AED ${after.estimatedCost}) at ${prop} has been auto-approved.`);
        await logAudit({ actorId: "SYSTEM_RULES", actorRole: "system", action: "AUTO_APPROVAL", targetType: "maintenanceTickets", targetId: ticketId, metadata: { cost: after.estimatedCost, threshold: 1000 } });
    } else if (after.status === "ESTIMATED" && ownerId) {
        await dispatchOmniNotification(ownerId, "NEW QUOTE GENERATED", `A technical estimate for #${ref8} is ready.`);
    }
});


export const autoRouteTicket = onDocumentCreated("maintenanceTickets/{ticketId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ticketData = snap.data();

    try {
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
        const requiredSkill = String(ticketData.complaintCategory || ticketData.category || ticketData.trade || "").toLowerCase();

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
                technicianId: bestTech.id,
                assignedTechnicianName: bestTech.data.displayName || bestTech.data.name || "Specialist",
                assignedTechnicianPhone: bestTech.data.phone || bestTech.data.phoneNumber || "",
                assignedTechnicianAvatar: bestTech.data.photoURL || "",
                technicianSpecialty: bestTech.data.specialty || bestTech.data.trade || "",
                status: "AUTO_ASSIGNED",
                dispatchStatus: "AUTO_ASSIGNED",
                trackingStatus: "TECHNICIAN_ASSIGNED",
                autoAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await dispatchOmniNotification(bestTech.id, "New Job Assigned", `${ticketData.category || ticketData.complaintCategory || "Fault"} at ${contextUpdate.propertyLocation.propertyName}`, {
                url: `/technician/job/${event.params.ticketId}`,
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

async function sendWhatsAppTemplate(to: string, templateName: string, languageCode = "en", bodyText = "") {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneId || !token) {
        console.info(`[WhatsApp MOCK] To: ${to}, Template: ${templateName}, BodyText: ${bodyText}`);
        return;
    }
    try {
        const formattedPhone = to.replace(/[^0-9]/g, "");
        const response = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: formattedPhone,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    components: bodyText ? [
                        {
                            type: "body",
                            parameters: [{ type: "text", text: bodyText }]
                        }
                    ] : []
                }
            })
        });
        if (!response.ok) {
            const errText = await response.text();
            console.error("[WhatsApp Error]:", errText);
        } else {
            console.log(`[WhatsApp Success] Template ${templateName} sent to ${to}`);
        }
    } catch (error) {
        console.error("[WhatsApp Exception]:", error);
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
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // 3. SMS Notification fallback
        if (userData?.phone || userData?.mobile) {
            const phone = userData.phone || userData.mobile;
            await sendTwilioSMS(phone, `[${title}] ${body}`);

            // 4. WhatsApp Notification fallback
            const templateName = options.whatsappTemplate || "bin_group_alert";
            await sendWhatsAppTemplate(phone, templateName, "en", body);
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

/**
 * [V11] SECURE ARCHITECTURAL CONCEPT GENERATOR
 * Calls Gemini from backend-only using Secret Manager.
 */
export const generateDesignConcept = onCall({ cors: true, secrets: [geminiApiKey] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Session invalid.');

    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    // Enterprise Admin Check
    const isAdmin = request.auth.token.admin === true ||
        request.auth.token.role === "admin" ||
        userData?.role === "admin" ||
        userData?.isAdmin === true;

    if (!isAdmin) throw new HttpsError('permission-denied', 'Unauthorized execution node.');

    try {
        const { requestId, scope, designStyle, imageBase64, mimeType } = request.data;
        const apiKey = geminiApiKey.value();

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
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `Gemini Error: ${response.statusText}`);
        }

        const result = await response.json();
        const textPart = result.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text;
        const imagePart = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;

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

export const onApprovalStagnant = onSchedule("every 24 hours", async () => {
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
            emailQueuedAt: admin.firestore.FieldValue.serverTimestamp(),
            mailDocumentId: mailDocumentId,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });

        batch.set(db.collection("tenant_invitation_events").doc(), {
            invitationId: doc.id,
            type: 'SENT',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
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
        emailQueuedAt: admin.firestore.FieldValue.serverTimestamp(),
        mailDocumentId: mailDocumentId,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        resendCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }
    });

    batch.set(db.collection("tenant_invitation_events").doc(), {
        invitationId,
        type: 'RESENT',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
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
    if (invite.expiresAt.toDate() < new Date()) {
        await inviteDoc.ref.update({ status: 'expired' });
        throw new HttpsError("failed-precondition", "Invitation expired.");
    }

    const authUid = request.auth.uid;
    const authEmail = request.auth.token.email?.toLowerCase();
    if (authEmail !== invite.tenantEmail.toLowerCase()) {
        throw new HttpsError("permission-denied", "This invitation was sent to a different email address.");
    }

    const batch = db.batch();

    // Update User
    batch.update(db.collection("users").doc(authUid), {
        role: "tenant",
        status: "active",
        displayName: invite.tenantName,
        propertyId: invite.propertyId,
        unitId: invite.unitId,
        tenantInvitationId: inviteDoc.id,
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update Unit
    if (invite.unitId) {
        batch.update(db.collection("units").doc(invite.unitId), {
            tenantId: authUid,
            tenantName: invite.tenantName,
            tenantEmail: invite.tenantEmail,
            occupancyStatus: "occupied",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    // Update Invitation
    batch.update(inviteDoc.ref, {
        status: 'accepted',
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        acceptedBy: authUid
    });

    // Update Leases & Ledgers (if they were created with the stub ID)
    const stubId = invite.tenantId;
    if (stubId && stubId !== authUid) {
        const leases = await db.collection("leases").where("tenantId", "==", stubId).get();
        for (const d of leases.docs) {
            batch.update(d.ref, { tenantId: authUid });
        }

        const ledgers = await db.collection("tenant_ledger").where("tenantId", "==", stubId).get();
        for (const d of ledgers.docs) {
            batch.update(d.ref, { tenantId: authUid });
        }

        // Delete stub if it exists
        batch.delete(db.collection("users").doc(stubId));
    }

    batch.set(db.collection("tenant_invitation_events").doc(), {
        invitationId: inviteDoc.id,
        type: 'ACCEPTED',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actorId: authUid
    });

    await batch.commit();
    return { status: "success", redirect: "/tenant" };
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
                    openedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                await db.collection("tenant_invitation_events").add({
                    invitationId: inviteDoc.id,
                    type: 'OPENED',
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
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
        batch.update(doc.ref, { status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.set(db.collection("tenant_invitation_events").doc(), {
            invitationId: doc.id,
            type: 'EXPIRED',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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

    const passportId = `passport_${propertyId}`;
    const passportRef = db.collection("property_passports").doc(passportId);

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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
        const ticketsSnap = await db.collection("maintenanceTickets").get();
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
                    repairs.repairedAt = admin.firestore.FieldValue.serverTimestamp();
                    repairs.repairType = 'status_recovery';
                }
            }

            if (needsRepair) {
                if (!dryRun) {
                    batch.update(ticketDoc.ref, {
                        ...repairs,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedBy: request.auth.uid,
                        repairMetadata: {
                            source: 'institutionalRepairTrigger',
                            timestamp: new Date().toISOString()
                        }
                    });
                    batchCount++;
                    docsUpdated++;

                    if (batchCount >= 450) { // Safety margin for 500 limit
                        await batch.commit();
                        batchCount = 0;
                    }
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
            createdAt: admin.firestore.FieldValue.serverTimestamp()
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

    const techId = request.auth.uid;
    const techRef = db.collection("users").doc(techId);

    await techRef.update({
        onDuty: true,
        dutyStatus: "ON_DUTY",
        dutyStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logAudit({
        actorId: techId,
        actorRole: "technician",
        action: "TECH_START_DUTY",
        targetType: "user",
        targetId: techId
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

    return { success: true };
});

/**
 * Technician ends their duty shift.
 * Blocks if there is an active job.
 */
export const endTechnicianDuty = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");

    const isTech = await hasCallableRoleAccess(request.auth, new Set(["technician", "admin"]));
    if (!isTech) throw new HttpsError("permission-denied", "Technician access required.");

    const techId = request.auth.uid;
    const techDoc = await db.collection("users").doc(techId).get();
    const techData = techDoc.data() || {};

    // Block if active ticket
    if (techData.currentTicketId || techData.dutyStatus === "ON_JOB") {
        throw new HttpsError("failed-precondition", "Cannot end duty with an active job. Please complete or reassign your ticket first.");
    }

    await techDoc.ref.update({
        onDuty: false,
        dutyStatus: "OFF_DUTY",
        dutyEndedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logAudit({
        actorId: techId,
        actorRole: "technician",
        action: "TECH_END_DUTY",
        targetType: "user",
        targetId: techId
    });

    return { success: true };
});

/**
 * Technician accepts an assigned job.
 */
export const acceptTechnicianJob = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");
    const { ticketId } = request.data;
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");

    const techId = request.auth.uid;
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Ticket not found.");

    await db.runTransaction(async (transaction) => {
        transaction.update(ticketRef, {
            status: "assigned", // Keep sovereign status, update sub-status
            technicianStatus: "ACCEPTED",
            acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.update(db.collection("users").doc(techId), {
            dutyStatus: "ON_JOB",
            currentTicketId: ticketId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
    const ticketData = ticketSnap.data() || {};

    await ticketRef.update({
        status: "IN_PROGRESS",
        technicianStatus: "WORK_STARTED",
        workStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
    await db.collection("maintenanceTickets").doc(ticketId).update({
        status: "on_hold",
        technicianStatus: "WAITING_PARTS",
        pausedAt: admin.firestore.FieldValue.serverTimestamp(),
        pauseReason: reason || "Waiting for parts",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
    const { ticketId, afterPhotos, notes } = request.data;
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");
    if (!afterPhotos || !Array.isArray(afterPhotos) || afterPhotos.length === 0) {
        throw new HttpsError("invalid-argument", "Photographic proof (afterPhotos) is mandatory to finish work.");
    }

    const techId = request.auth.uid;
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    const ticketData = ticketSnap.data() || {};

    await db.runTransaction(async (transaction) => {
        transaction.update(ticketRef, {
            status: "COMPLETED",
            technicianStatus: "COMPLETED",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            afterPhotos,
            completionNotes: notes || "",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.update(db.collection("users").doc(techId), {
            dutyStatus: "ON_DUTY",
            currentTicketId: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
        closedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true };
});

/**
 * [V14] IOT GATEWAY TRIGGER
 * Standardized endpoint for Smart Building Sensors to pulse telemetry or trigger alarms.
 */
export const triggerIoTEvent = onRequest(async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    try {
        const payload = req.body;
        const { device_id, property_id, event_type, urgency, telemetry, auth_token } = payload;
        if (!auth_token || auth_token !== "BIN_IOT_CORE_SECURE_2026") {
            res.status(401).send("Unauthorized Device Node");
            return;
        }
        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const eventId = `iot_${Date.now()}_${device_id}`;
        await db.collection("telemetry_logs").doc(eventId).set({
            deviceId: device_id, propertyId: property_id, type: event_type,
            urgency: urgency || "nominal", telemetry: telemetry || {},
            timestamp, processed: false
        });
        if (urgency === "critical" || event_type === "leak_detected" || event_type === "fire_alarm") {
            const ticketId = `auto_${Date.now()}_${property_id}`;
            await db.collection("maintenanceTickets").doc(ticketId).set({
                propertyId: property_id, title: `IOT ALERT: ${event_type.replace("_", " ").toUpperCase()}`,
                description: `Automated alert triggered by device ${device_id}. Telemetry: ${JSON.stringify(telemetry)}`,
                status: "OPEN", priority: "EMERGENCY", category: "PLUMBING", source: "IOT_SENSOR",
                deviceId: device_id, createdAt: timestamp, updatedAt: timestamp
            });
            await logAudit({
                actorId: device_id, actorRole: "iot_device", action: "IOT_CRITICAL_TRIGGER",
                targetType: "maintenanceTickets", targetId: ticketId, metadata: { event_type, urgency }
            });
        }
        res.status(200).json({ success: true, eventId, message: urgency === "critical" ? "Triage initiated" : "Telemetry logged" });
    } catch (error: any) {
        console.error("IoT Gateway Failure:", error);
        res.status(500).json({ error: error.message });
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
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
});

/**
 * [V15] SOVEREIGN PAYMENT PROCESSOR
 * Atomic transaction processing for AED institutional payments.
 */
export const processPayment = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Identity verification failed.");

    const { invoiceId, paymentMethod, amount } = request.data;
    if (!invoiceId || !amount) throw new HttpsError("invalid-argument", "Transaction payload incomplete.");

    const uid = request.auth.uid;
    const invoiceRef = db.collection("invoices").doc(invoiceId);

    return await db.runTransaction(async (transaction) => {
        const invoiceSnap = await transaction.get(invoiceRef);
        if (!invoiceSnap.exists) throw new HttpsError("not-found", "Invoice node not found.");

        const invoiceData = invoiceSnap.data()!;
        if (invoiceData.status === "PAID") throw new HttpsError("failed-precondition", "Transaction already settled.");

        const txId = `TXN-${Date.now()}-${uid.substring(0, 5)}`;
        const receiptId = `RCPT-${Date.now()}`;

        // 1. Log Atomic Transaction
        transaction.set(db.collection("transactions").doc(txId), {
            txId, uid, invoiceId, amount,
            currency: "AED",
            status: "SUCCESS",
            method: paymentMethod || "SOVEREIGN_WALLET",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {
                ip: request.rawRequest.ip || "unknown",
                userAgent: request.rawRequest.headers["user-agent"] || "unknown"
            }
        });

        // 2. Update Invoice Status
        transaction.update(invoiceRef, {
            status: "PAID",
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            transactionId: txId,
            receiptId
        });

        // 3. Generate Digital Receipt (Audit collections)
        transaction.set(db.collection("receipts").doc(receiptId), {
            receiptId, txId, invoiceId, uid, amount,
            taxAmount: amount * 0.05, // 5% VAT UAE
            netAmount: amount * 0.95,
            issuedAt: admin.firestore.FieldValue.serverTimestamp(),
            complianceCode: "UAE-VAT-COMPLIANT-2026"
        });

        // 4. Update Sovereign Ledger
        const ledgerRef = db.collection("ledgers").doc(uid);
        transaction.set(ledgerRef, {
            totalPaid: admin.firestore.FieldValue.increment(amount),
            lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "CURRENT"
        }, { merge: true });

        return {
            status: "SUCCESS",
            transactionId: txId,
            receiptId,
            message: "Sovereign settlement complete."
        };
    });
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

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
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

export const onChatMessageSent = onDocumentCreated("maintenanceTickets/{ticketId}/messages/{messageId}", async (event) => {
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

    const beforeStatus = before?.dutyStatus || "OFF";
    const afterStatus = after.dutyStatus || "OFF";
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
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } 
    else if (beforeStatus === "WORKING" && afterStatus === "BREAK") {
        await attendanceRef.update({
            breaks: admin.firestore.FieldValue.arrayUnion({ start: now }),
            status: "break",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await attendanceRef.update({
                status: "working",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }
});

export const onTicketTechnicianAssignmentChanged = onDocumentUpdated("maintenanceTickets/{id}", async (event) => {
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

// ─── BIN-GPT ENGINEER COMMAND TRIGGER ────────────────────────────────────────
// Restores the function Firebase expects in europe-west3.
// This trigger ONLY records the command and prepares it for a secure
// backend/GitHub Actions runner. It does NOT execute any GitHub code directly.

export const onBinGptEngineerCommandCreated = onDocumentCreated(
    "binGptEngineerCommands/{commandId}",
    async (event) => {
        const commandId = event.params.commandId;
        const data = event.data?.data();
        if (!data) return;

        const now = admin.firestore.FieldValue.serverTimestamp();
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
                commandHistory: admin.firestore.FieldValue.arrayUnion(historyEntry),
                auditTrail: admin.firestore.FieldValue.arrayUnion(auditEntry),
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
