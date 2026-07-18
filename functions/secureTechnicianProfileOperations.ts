import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ALLOWED_KEYS = new Set([
  "serviceZonePreference",
  "emergencyContact",
  "language",
]);
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
  return lower(
    record.customClaims?.role ||
    record.customClaims?.userRole ||
    record.customClaims?.primaryRole ||
    profile.role ||
    profile.userRole ||
    profile.primaryRole,
  );
}

function activeProfile(profile: FirebaseFirestore.DocumentData) {
  return profile.suspended !== true && ![
    "suspended",
    "disabled",
    "rejected",
    "inactive",
  ].includes(lower(profile.status));
}

function presence(value: {
  serviceZonePreference?: unknown;
  emergencyContact?: { name?: unknown; phone?: unknown };
  language?: unknown;
}) {
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
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new HttpsError("invalid-argument", "Technician profile preferences are required.");
    }
    const unexpectedKeys = Object.keys(raw).filter((key) => !ALLOWED_KEYS.has(key));
    if (unexpectedKeys.length) {
      throw new HttpsError(
        "invalid-argument",
        `Unsupported Technician profile fields: ${unexpectedKeys.join(", ")}`,
      );
    }

    const uid = request.auth.uid;
    const [record, profileSnap] = await Promise.all([
      admin.auth().getUser(uid),
      db.collection("users").doc(uid).get(),
    ]);
    if (!profileSnap.exists) throw new HttpsError("not-found", "Technician profile not found.");
    const profile = profileSnap.data() || {};
    if (record.disabled || request.auth.token?.suspended === true || !activeProfile(profile)) {
      throw new HttpsError("permission-denied", "Technician account is disabled or suspended.");
    }
    if (technicianRole(record, profile) !== "technician") {
      throw new HttpsError("permission-denied", "Technician role required.");
    }

    const serviceZonePreference = requiredText(
      raw.serviceZonePreference,
      "Service-zone preference",
      120,
    );
    const emergencyName = requiredText(
      raw.emergencyContact?.name,
      "Emergency-contact name",
      120,
    );
    const emergencyPhone = normalizePhone(raw.emergencyContact?.phone);
    if (emergencyPhone && !/^\+[1-9]\d{7,14}$/.test(emergencyPhone)) {
      throw new HttpsError("invalid-argument", "Emergency-contact phone must use a valid international format.");
    }
    if (Boolean(emergencyName) !== Boolean(emergencyPhone)) {
      throw new HttpsError(
        "invalid-argument",
        "Emergency-contact name and phone must be provided together.",
      );
    }
    const language = lower(raw.language) === "ar" ? "ar" : "en";
    const before = presence({
      serviceZonePreference: profile.serviceZonePreference,
      emergencyContact: profile.emergencyContact,
      language: profile.language,
    });
    const after = presence({
      serviceZonePreference,
      emergencyContact: { name: emergencyName, phone: emergencyPhone },
      language,
    });
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
        emergencyContact: {
          name: emergencyName,
          phone: emergencyPhone,
        },
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
        authoritativeIdentityFieldsExcluded: [
          "displayName",
          "phone",
          "phoneNumber",
          "requestedTrade",
          "trade",
          "specialty",
          "primaryTrade",
          "serviceZone",
          "isAvailable",
          "onDuty",
          "dutyStatus",
        ],
        sensitiveValuesExcluded: true,
        createdAt: now,
      });
    });

    return {
      status: "SUCCESS",
      profile: {
        serviceZonePreference,
        emergencyContact: {
          name: emergencyName,
          phone: emergencyPhone,
        },
        language,
      },
    };
  },
);
