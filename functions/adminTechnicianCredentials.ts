import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import { approvedAndReadyTechnician } from "./secureAdminTechnicianAssignment";

// Technician dispatch readiness (adminAssignTechnician, availability GPS, resume duty) requires a
// valid medical card, driving licence and certifications, but nothing in the product could record
// them: the fields were only read. This callable lets Founder/Admin or an HR Manager record the
// outcome of checking the original documents. It never invents values: every field is supplied
// by the reviewer, verified credentials need a future expiry, and every change is audited.

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const FULL_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);
const HR_MANAGER_ROLES = new Set(["hr_admin", "hr_manager"]);
const DECISIONS = new Set(["VERIFIED", "REJECTED"]);
const MAX_EXPIRY_YEARS = 15;
const MAX_CERTIFICATIONS = 20;

type Decision = "VERIFIED" | "REJECTED";
type CredentialInput = { decision: Decision; expiryAt: Timestamp | null; reference: string };

function clean(value: unknown, max = 200): string {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function roleFromClaims(claims: any): string {
    return clean(claims?.role || claims?.userRole || claims?.primaryRole, 60).toLowerCase();
}

function isFullAdmin(claims: any): boolean {
    return FULL_ADMIN_ROLES.has(roleFromClaims(claims)) || claims?.admin === true || claims?.isAdmin === true ||
        claims?.super_admin === true || claims?.superAdmin === true || claims?.ceo === true;
}

async function requireCredentialReviewer(request: any) {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authenticated staff session required.");
    const token = request.auth.token || {};
    if (token.suspended === true) throw new HttpsError("permission-denied", "Suspended accounts cannot record credentials.");
    const actor = await admin.auth().getUser(request.auth.uid);
    const claims = actor.customClaims || {};
    const tokenRole = roleFromClaims(token) || (isFullAdmin(token) ? "admin" : "");
    const currentRole = roleFromClaims(claims) || (isFullAdmin(claims) ? "admin" : "");
    if (actor.disabled || claims.suspended === true || !currentRole || currentRole !== tokenRole) {
        throw new HttpsError("permission-denied", "Current staff authority is inactive or no longer matches this session.");
    }
    if (!isFullAdmin(claims) && !HR_MANAGER_ROLES.has(currentRole)) {
        throw new HttpsError("permission-denied", "Founder/Admin or HR Manager authority is required to record technician credentials.");
    }
    return { actorId: request.auth.uid, actorRole: currentRole };
}

function parseCredentialExpiry(value: unknown, label: string, nowMs = Date.now()): Timestamp {
    const raw = clean(value, 40);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new HttpsError("invalid-argument", `${label} expiry must be a date (YYYY-MM-DD).`);
    const ms = Date.parse(`${raw}T23:59:59.000+04:00`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== raw) {
        throw new HttpsError("invalid-argument", `${label} expiry is not a real calendar date.`);
    }
    if (ms <= nowMs) throw new HttpsError("invalid-argument", `${label} has already expired; it cannot be recorded as verified.`);
    if (ms > nowMs + MAX_EXPIRY_YEARS * 365.25 * 86_400_000) throw new HttpsError("invalid-argument", `${label} expiry is implausibly far in the future.`);
    return Timestamp.fromMillis(ms);
}

function parseCredential(raw: any, label: string, nowMs = Date.now()): CredentialInput | null {
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) throw new HttpsError("invalid-argument", `${label} must be an object.`);
    const decision = clean(raw.decision, 20).toUpperCase();
    if (!DECISIONS.has(decision)) throw new HttpsError("invalid-argument", `${label} decision must be VERIFIED or REJECTED.`);
    const reference = clean(raw.documentReference, 120);
    if (decision === "VERIFIED") {
        if (!reference) throw new HttpsError("invalid-argument", `${label}: record the document number or reference you checked.`);
        return { decision: "VERIFIED", expiryAt: parseCredentialExpiry(raw.expiryDate, label, nowMs), reference };
    }
    return { decision: "REJECTED", expiryAt: null, reference };
}

function stateOf(decision: Decision) {
    return decision === "VERIFIED" ? "verified" : "rejected";
}

function summary(profile: admin.firestore.DocumentData) {
    const millis = (value: any) => (value && typeof value.toMillis === "function" ? value.toMillis() : null);
    return {
        medicalCardStatus: profile.medicalCardStatus ?? null,
        medicalCardExpiryMs: millis(profile.medicalCardExpiry),
        drivingLicenseStatus: profile.drivingLicenseStatus ?? null,
        drivingLicenseExpiryMs: millis(profile.drivingLicenseExpiry),
        certificationsStatus: profile.certificationsStatus ?? null,
        certificationCount: Array.isArray(profile.certifications) ? profile.certifications.length : 0,
    };
}

export const adminRecordTechnicianCredentials = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
    const { actorId, actorRole } = await requireCredentialReviewer(request);
    await requirePrivilegedMfaSession(request.auth);
    const payload = request.data || {};
    const technicianId = clean(payload.technicianId, 128);
    if (!technicianId) throw new HttpsError("invalid-argument", "Technician UID is required.");
    if (technicianId === actorId) throw new HttpsError("permission-denied", "Reviewers cannot record their own credentials.");
    const reviewNote = clean(payload.reviewNote, 500);
    if (reviewNote.length < 8) throw new HttpsError("invalid-argument", "Describe which original documents you checked (at least 8 characters).");

    const nowMs = Date.now();
    const medical = parseCredential(payload.medicalCard, "Medical card", nowMs);
    const licence = parseCredential(payload.drivingLicence, "Driving licence", nowMs);
    let certifications: Array<Record<string, unknown>> | null = null;
    if (payload.certifications !== undefined) {
        if (!Array.isArray(payload.certifications) || payload.certifications.length === 0 || payload.certifications.length > MAX_CERTIFICATIONS) {
            throw new HttpsError("invalid-argument", `Certifications must list 1-${MAX_CERTIFICATIONS} documents.`);
        }
        certifications = payload.certifications.map((item: any, index: number) => {
            const name = clean(item?.name, 120);
            if (!name) throw new HttpsError("invalid-argument", `Certification ${index + 1} needs a name.`);
            const parsed = parseCredential(item, `Certification "${name}"`, nowMs)!;
            return {
                name,
                status: stateOf(parsed.decision),
                expiryAt: parsed.expiryAt,
                documentReference: parsed.reference || null,
                verifiedBy: actorId,
                verifiedAtMs: nowMs,
            };
        });
    }
    if (!medical && !licence && !certifications) {
        throw new HttpsError("invalid-argument", "Provide at least one credential decision (medical card, driving licence or certifications).");
    }
    const renewalRequestId = clean(payload.renewalRequestId, 128);

    const userRef = db.collection("users").doc(technicianId);
    const technicianRef = db.collection("technicians").doc(technicianId);
    const renewalRef = renewalRequestId ? db.collection("technician_credential_renewals").doc(renewalRequestId) : null;
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();

    const result = await db.runTransaction(async (transaction) => {
        const [userSnap, technicianSnap, renewalSnap] = await Promise.all([
            transaction.get(userRef),
            transaction.get(technicianRef),
            renewalRef ? transaction.get(renewalRef) : Promise.resolve(null),
        ]);
        if (!userSnap.exists) throw new HttpsError("not-found", "Technician profile was not found.");
        const user = userSnap.data() || {};
        if (clean(user.role, 40).toLowerCase() !== "technician") throw new HttpsError("failed-precondition", "Credentials can only be recorded for a Technician account.");
        if (renewalRef && (!renewalSnap?.exists || clean(renewalSnap.data()?.technicianId, 128) !== technicianId)) {
            throw new HttpsError("not-found", "The credential renewal request does not belong to this technician.");
        }
        if (renewalSnap?.exists && clean(renewalSnap.data()?.status, 40).toUpperCase() !== "PENDING_ADMIN_REVIEW") {
            throw new HttpsError("failed-precondition", "This credential renewal request has already been reviewed.");
        }
        const technician = technicianSnap.exists ? technicianSnap.data() || {} : {};
        const before = summary({ ...user, ...technician });

        const update: Record<string, unknown> = {
            credentialsReviewedAt: now,
            credentialsReviewedBy: actorId,
            credentialsReviewNote: reviewNote,
            updatedAt: now,
        };
        if (medical) {
            Object.assign(update, {
                medicalCardStatus: stateOf(medical.decision),
                medicalCardExpiry: medical.expiryAt,
                medicalCardReference: medical.reference || null,
                medicalCardVerifiedBy: actorId,
                medicalCardVerifiedAt: now,
            });
        }
        if (licence) {
            Object.assign(update, {
                drivingLicenseStatus: stateOf(licence.decision),
                drivingLicenseExpiry: licence.expiryAt,
                drivingLicenseReference: licence.reference || null,
                drivingLicenseVerifiedBy: actorId,
                drivingLicenseVerifiedAt: now,
            });
        }
        if (certifications) {
            Object.assign(update, {
                certifications,
                certificationsStatus: certifications.every((item) => item.status === "verified") ? "verified" : "rejected",
                certificationsVerifiedBy: actorId,
                certificationsVerifiedAt: now,
            });
        }
        if (renewalRef) {
            const decisions = [medical?.decision, licence?.decision, ...(certifications || []).map((item) => item.status === "verified" ? "VERIFIED" : "REJECTED")].filter(Boolean);
            const approved = decisions.every((value) => value === "VERIFIED");
            transaction.set(renewalRef, {
                status: approved ? "APPROVED" : "REJECTED",
                reviewState: approved ? "APPROVED" : "REJECTED",
                reviewedBy: actorId,
                reviewedAt: now,
                reviewNote,
                ...(approved ? {} : { rejectionReason: reviewNote }),
                updatedAt: now,
            }, { merge: true });
            Object.assign(update, {
                credentialRenewalPending: false,
                credentialRenewalStatus: approved ? "APPROVED" : "REJECTED",
            });
        }
        transaction.set(userRef, update, { merge: true });
        transaction.set(technicianRef, update, { merge: true });

        const after = summary({ ...user, ...technician, ...update, medicalCardExpiry: medical ? medical.expiryAt : (technician.medicalCardExpiry ?? user.medicalCardExpiry), drivingLicenseExpiry: licence ? licence.expiryAt : (technician.drivingLicenseExpiry ?? user.drivingLicenseExpiry) });
        transaction.set(auditRef, {
            actorId,
            actorRole,
            action: "ADMIN_RECORD_TECHNICIAN_CREDENTIALS",
            targetType: "users",
            targetId: technicianId,
            before,
            after,
            decisions: {
                medicalCard: medical?.decision || null,
                drivingLicence: licence?.decision || null,
                certifications: certifications ? certifications.map((item) => ({ name: item.name, status: item.status })) : null,
            },
            renewalRequestId: renewalRequestId || null,
            reviewNote,
            mfaVerified: true,
            createdAt: now,
        });
        const readiness = approvedAndReadyTechnician({ ...user, ...update }, { ...technician, ...update }, true, true, nowMs);
        return { remaining: readiness.failures };
    });

    return { status: "SUCCESS", technicianId, auditId: auditRef.id, remainingReadinessFailures: result.remaining };
});
