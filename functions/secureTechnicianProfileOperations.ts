import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ALLOWED_KEYS = new Set(["serviceZonePreference", "emergencyContact", "language"]);
const CREDENTIAL_TYPES = new Set(["medical_card", "driving_licence", "trade_certificate", "safety_certificate", "other"]);
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();

function normalizePhone(value: unknown) {
  const raw = text(value).replace(/[\s()-]/g, "");
  if (!raw) return "";
  if (raw.startsWith("00")) return `+${raw.slice(2)}`;
  if (raw.startsWith("05") && raw.length === 10) return `+971${raw.slice(1)}`;
  return raw.startsWith("+") ? raw : `+${raw}`;
}

function requiredText(value: unknown, label: string, maxLength: number, required = false) {
  const output = text(value);
  if (required && !output) throw new HttpsError("invalid-argument", `${label} is required.`);
  if (output.length > maxLength) throw new HttpsError("invalid-argument", `${label} is too long.`);
  return output;
}

function technicianRole(record: admin.auth.UserRecord, profile: FirebaseFirestore.DocumentData) {
  return lower(record.customClaims?.role || record.customClaims?.userRole || record.customClaims?.primaryRole || profile.role || profile.userRole || profile.primaryRole);
}

function activeProfile(profile: FirebaseFirestore.DocumentData) {
  return profile.suspended !== true && !["suspended", "disabled", "rejected", "inactive"].includes(lower(profile.status));
}

async function requireActiveTechnician(uid: string) {
  const [record, profileSnap] = await Promise.all([admin.auth().getUser(uid), db.collection("users").doc(uid).get()]);
  if (!profileSnap.exists) throw new HttpsError("not-found", "Technician profile not found.");
  const profile = profileSnap.data() || {};
  if (record.disabled || record.customClaims?.suspended === true || !activeProfile(profile)) throw new HttpsError("permission-denied", "Technician account is disabled or suspended.");
  if (technicianRole(record, profile) !== "technician") throw new HttpsError("permission-denied", "Technician role required.");
  return { record, profile };
}

function presence(value: { serviceZonePreference?: unknown; emergencyContact?: { name?: unknown; phone?: unknown }; language?: unknown }) {
  return {
    serviceZonePreferencePresent: Boolean(text(value.serviceZonePreference)),
    emergencyContactNamePresent: Boolean(text(value.emergencyContact?.name)),
    emergencyContactPhonePresent: Boolean(normalizePhone(value.emergencyContact?.phone)),
    language: lower(value.language) === "ar" ? "ar" : "en",
  };
}

export const updateTechnicianProfilePreferences = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Technician login required.");
    const raw = request.data;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpsError("invalid-argument", "Technician profile preferences are required.");
    const unexpectedKeys = Object.keys(raw).filter((key) => !ALLOWED_KEYS.has(key));
    if (unexpectedKeys.length) throw new HttpsError("invalid-argument", `Unsupported Technician profile fields: ${unexpectedKeys.join(", ")}`);

    const uid = request.auth.uid;
    const { profile } = await requireActiveTechnician(uid);
    const serviceZonePreference = requiredText(raw.serviceZonePreference, "Service-zone preference", 120);
    const emergencyName = requiredText(raw.emergencyContact?.name, "Emergency-contact name", 120);
    const emergencyPhone = normalizePhone(raw.emergencyContact?.phone);
    if (emergencyPhone && !/^\+[1-9]\d{7,14}$/.test(emergencyPhone)) throw new HttpsError("invalid-argument", "Emergency-contact phone must use a valid international format.");
    if (Boolean(emergencyName) !== Boolean(emergencyPhone)) throw new HttpsError("invalid-argument", "Emergency-contact name and phone must be provided together.");
    const language = lower(raw.language) === "ar" ? "ar" : "en";
    const before = presence({ serviceZonePreference: profile.serviceZonePreference, emergencyContact: profile.emergencyContact, language: profile.language });
    const after = presence({ serviceZonePreference, emergencyContact: { name: emergencyName, phone: emergencyPhone }, language });
    const changedFields: string[] = [];
    if (text(profile.serviceZonePreference) !== serviceZonePreference) changedFields.push("serviceZonePreference");
    if (text(profile.emergencyContact?.name) !== emergencyName) changedFields.push("emergencyContact.name");
    if (normalizePhone(profile.emergencyContact?.phone) !== emergencyPhone) changedFields.push("emergencyContact.phone");
    if ((lower(profile.language) === "ar" ? "ar" : "en") !== language) changedFields.push("language");

    const userRef = db.collection("users").doc(uid);
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(userRef);
      if (!fresh.exists) throw new HttpsError("not-found", "Technician profile not found.");
      transaction.update(userRef, {
        serviceZonePreference,
        emergencyContact: { name: emergencyName, phone: emergencyPhone },
        language,
        technicianPreferencesUpdatedAt: now,
        technicianPreferencesUpdatedBy: uid,
        updatedAt: now,
      });
      transaction.set(auditRef, {
        action: "TECHNICIAN_PROFILE_PREFERENCES_UPDATED",
        actorId: uid,
        actorRole: "technician",
        targetType: "users",
        targetId: uid,
        before,
        after,
        changedFields,
        authoritativeIdentityFieldsExcluded: ["displayName", "phone", "phoneNumber", "requestedTrade", "trade", "specialty", "primaryTrade", "serviceZone", "isAvailable", "onDuty", "dutyStatus"],
        sensitiveValuesExcluded: true,
        createdAt: now,
      });
    });

    return { status: "SUCCESS", profile: { serviceZonePreference, emergencyContact: { name: emergencyName, phone: emergencyPhone }, language } };
  },
);

export const submitTechnicianCredentialRenewal = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, timeoutSeconds: 90, memory: "512MiB" },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Technician login required.");
    const uid = request.auth.uid;
    await requireActiveTechnician(uid);

    const credentialType = lower(request.data?.credentialType);
    const credentialName = requiredText(request.data?.credentialName, "Credential name", 140, true);
    const proposedExpiryText = requiredText(request.data?.proposedExpiryDate, "Proposed expiry date", 40, true);
    const proposedExpiryDate = new Date(proposedExpiryText);
    if (Number.isNaN(proposedExpiryDate.getTime()) || proposedExpiryDate.getTime() <= Date.now()) throw new HttpsError("invalid-argument", "The proposed credential expiry date must be in the future.");
    if (!CREDENTIAL_TYPES.has(credentialType)) throw new HttpsError("invalid-argument", "Unsupported credential type.");

    const fileName = requiredText(request.data?.fileName, "Document filename", 160, true).replace(/[^a-zA-Z0-9._-]/g, "_");
    const contentType = lower(request.data?.contentType);
    if (!ALLOWED_DOCUMENT_TYPES.has(contentType)) throw new HttpsError("invalid-argument", "Credential evidence must be PDF, JPEG, PNG, or WEBP.");
    const encodedDocument = text(request.data?.encodedDocument).replace(/^data:[^;]+;base64,/, "");
    if (!encodedDocument || encodedDocument.length > 8_000_000) throw new HttpsError("invalid-argument", "Credential evidence is missing or larger than 5 MB.");
    let documentBuffer: Buffer;
    try { documentBuffer = Buffer.from(encodedDocument, "base64"); } catch { throw new HttpsError("invalid-argument", "Credential evidence is not valid base64."); }
    if (!documentBuffer.length || documentBuffer.length > 5 * 1024 * 1024) throw new HttpsError("invalid-argument", "Credential evidence is missing or larger than 5 MB.");

    const requestRef = db.collection("technician_credential_renewals").doc();
    const storagePath = `technician-credential-renewals/${uid}/${requestRef.id}/${fileName}`;
    const evidenceHash = crypto.createHash("sha256").update(documentBuffer).digest("hex");
    const bucketFile = admin.storage().bucket().file(storagePath);
    await bucketFile.save(documentBuffer, {
      resumable: false,
      metadata: {
        contentType,
        cacheControl: "private, max-age=0, no-store",
        metadata: { technicianId: uid, renewalRequestId: requestRef.id, credentialType, evidenceHash },
      },
    });
    const [storageMetadata] = await bucketFile.getMetadata();
    const now = FieldValue.serverTimestamp();
    const renewalRecord = {
      requestId: requestRef.id,
      technicianId: uid,
      credentialType,
      credentialName,
      proposedExpiryAt: Timestamp.fromDate(proposedExpiryDate),
      evidencePath: storagePath,
      evidenceName: fileName,
      evidenceContentType: contentType,
      evidenceHash,
      evidenceGeneration: String(storageMetadata.generation || ""),
      status: "PENDING_ADMIN_REVIEW",
      reviewState: "PENDING_ADMIN_REVIEW",
      createdAt: now,
      updatedAt: now,
    };
    const auditRef = db.collection("audit_logs").doc();
    const batch = db.batch();
    batch.create(requestRef, renewalRecord);
    for (const collectionName of ["users", "technicians"]) {
      batch.set(db.collection(collectionName).doc(uid), {
        credentialRenewalPending: true,
        credentialRenewalStatus: "PENDING_ADMIN_REVIEW",
        latestCredentialRenewalRequestId: requestRef.id,
        credentialRenewalSubmittedAt: now,
        updatedAt: now,
      }, { merge: true });
    }
    batch.set(auditRef, {
      action: "TECHNICIAN_CREDENTIAL_RENEWAL_SUBMITTED",
      actorId: uid,
      actorRole: "technician",
      targetType: "technician_credential_renewals",
      targetId: requestRef.id,
      credentialType,
      credentialName,
      proposedExpiryAt: Timestamp.fromDate(proposedExpiryDate),
      evidenceHash,
      sensitiveValuesExcluded: true,
      createdAt: now,
    });
    await batch.commit();
    return { status: "SUCCESS", requestId: requestRef.id, reviewState: "PENDING_ADMIN_REVIEW", evidenceHash, proposedExpiryAtMs: proposedExpiryDate.getTime() };
  },
);

export const listTechnicianCredentialRenewals = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Technician login required.");
    const uid = request.auth.uid;
    await requireActiveTechnician(uid);
    const snapshot = await db.collection("technician_credential_renewals").where("technicianId", "==", uid).limit(25).get();
    const requests = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        requestId: item.id,
        credentialType: data.credentialType || "other",
        credentialName: data.credentialName || "Credential",
        status: data.status || data.reviewState || "PENDING_ADMIN_REVIEW",
        proposedExpiryAtMs: data.proposedExpiryAt?.toMillis?.() || 0,
        createdAtMs: data.createdAt?.toMillis?.() || 0,
        rejectionReason: data.rejectionReason || "",
      };
    }).sort((left, right) => right.createdAtMs - left.createdAtMs);
    return { status: "SUCCESS", requests };
  },
);
