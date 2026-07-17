import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();
const compact = (value: unknown) => lower(value).replace(/[^a-z0-9\u0600-\u06ff]/g, "");

function normalizePhone(value: unknown) {
  const raw = text(value).replace(/[\s()-]/g, "");
  if (!raw) return "";
  if (raw.startsWith("00")) return `+${raw.slice(2)}`;
  if (raw.startsWith("05") && raw.length === 10) return `+971${raw.slice(1)}`;
  return raw.startsWith("+") ? raw : `+${raw}`;
}

function ownerRole(record: admin.auth.UserRecord, profile: FirebaseFirestore.DocumentData) {
  return lower(record.customClaims?.role || record.customClaims?.userRole || profile.role || profile.userRole);
}

function verifiedIdentityValues(profile: FirebaseFirestore.DocumentData) {
  return [
    profile.verifiedLegalName,
    profile.legalName,
    profile.kycLegalName,
    profile.identity?.legalName,
    profile.onboarding?.legalName,
    profile.verifiedCompanyName,
    profile.companyLegalName,
    profile.kycCompanyName,
    profile.companyProfile?.legalName,
  ].map(compact).filter(Boolean);
}

function hasVerifiedIdentity(profile: FirebaseFirestore.DocumentData) {
  const status = lower(profile.kycStatus || profile.identityStatus || profile.verificationStatus || profile.ownerKycStatus);
  return profile.kycVerified === true || profile.identityVerified === true || profile.ownerVerified === true || ["verified", "approved", "active"].includes(status);
}

export function validateOwnerProfileChange(input: any, profile: FirebaseFirestore.DocumentData, authRecord: admin.auth.UserRecord) {
  const displayName = text(input?.displayName);
  const phone = normalizePhone(input?.phone || input?.phoneNumber);
  const companyName = text(input?.companyName);
  const billingName = text(input?.billingContact?.name || input?.billingName);
  const billingEmail = lower(input?.billingContact?.email || input?.billingEmail);
  const billingPhone = normalizePhone(input?.billingContact?.phone || input?.billingPhone);
  const preferredContact = lower(input?.preferredContact || input?.notificationPreferences?.preferredContact || "email");
  const language = lower(input?.language || "en") === "ar" ? "ar" : "en";

  if (displayName.length < 2 || displayName.length > 120) throw new HttpsError("invalid-argument", "Owner full name must be between 2 and 120 characters.");
  if (!["email", "phone", "whatsapp"].includes(preferredContact)) throw new HttpsError("invalid-argument", "Preferred contact must be email, phone, or whatsapp.");

  const livePhone = normalizePhone(authRecord.phoneNumber);
  const existingPhone = normalizePhone(profile.phoneNumber || profile.phone);
  if (phone && phone !== existingPhone && phone !== livePhone) {
    throw new HttpsError("failed-precondition", "The new Owner phone must first be verified through Firebase phone authentication.");
  }
  if (billingPhone && billingPhone !== livePhone && billingPhone !== phone) {
    throw new HttpsError("failed-precondition", "Billing phone must match the verified Owner phone.");
  }

  const authEmail = lower(authRecord.email);
  const verifiedBillingEmail = lower(profile.verifiedBillingEmail || profile.billingEmailVerifiedValue);
  if (billingEmail && billingEmail !== authEmail && billingEmail !== verifiedBillingEmail) {
    throw new HttpsError("failed-precondition", "Billing email must match the verified account or verified billing email.");
  }

  const sensitiveIdentityChanged =
    (companyName && compact(companyName) !== compact(profile.companyName || profile.ownerCompanyName)) ||
    (billingName && compact(billingName) !== compact(profile.billingContact?.name || profile.billingName));
  if (sensitiveIdentityChanged) {
    if (!hasVerifiedIdentity(profile)) throw new HttpsError("failed-precondition", "Owner KYC identity must be verified before changing legal or billing identity.");
    const allowed = new Set(verifiedIdentityValues(profile));
    if (companyName && !allowed.has(compact(companyName))) throw new HttpsError("failed-precondition", "Company name must match the verified Owner KYC identity.");
    if (billingName && !allowed.has(compact(billingName))) throw new HttpsError("failed-precondition", "Billing name must match the verified Owner KYC identity.");
  }

  const resolvedPhone = phone || existingPhone;
  const phoneAuthority = resolvedPhone && livePhone && resolvedPhone === livePhone
    ? "FIREBASE_AUTH_PHONE"
    : "UNCHANGED_PROFILE_PHONE";
  return { displayName, phone: resolvedPhone, phoneAuthority, companyName, billingName, billingEmail, billingPhone, preferredContact, language };
}

export const syncVerifiedOwnerPhone = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner login required.");
    const uid = request.auth.uid;
    const [authRecord, profileSnap] = await Promise.all([
      admin.auth().getUser(uid),
      db.collection("users").doc(uid).get(),
    ]);
    if (authRecord.disabled || authRecord.customClaims?.suspended === true) throw new HttpsError("permission-denied", "Owner account is disabled or suspended.");
    const profile = profileSnap.data() || {};
    if (ownerRole(authRecord, profile) !== "owner") throw new HttpsError("permission-denied", "Owner role required.");

    const verifiedPhone = normalizePhone(authRecord.phoneNumber);
    if (!verifiedPhone || !/^\+[1-9]\d{7,14}$/.test(verifiedPhone)) {
      throw new HttpsError("failed-precondition", "Firebase Authentication has no verified Owner phone number to sync.");
    }

    const userRef = db.collection("users").doc(uid);
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(userRef);
      if (!fresh.exists) throw new HttpsError("not-found", "Owner profile not found.");
      const previousPhone = normalizePhone(fresh.data()?.phoneNumber || fresh.data()?.phone) || null;
      transaction.set(userRef, {
        phoneNumber: verifiedPhone,
        phone: verifiedPhone,
        phoneVerified: true,
        phoneAuthority: "FIREBASE_AUTH_PHONE",
        phoneVerifiedAt: now,
        ownerProfileUpdatedAt: now,
        ownerProfileUpdatedBy: uid,
        updatedAt: now,
      }, { merge: true });
      transaction.set(auditRef, {
        action: "OWNER_PHONE_VERIFIED_SYNCED",
        actorId: uid,
        actorRole: "owner",
        targetType: "user",
        targetId: uid,
        before: { phoneNumber: previousPhone },
        after: { phoneNumber: verifiedPhone },
        phoneAuthority: "FIREBASE_AUTH_PHONE",
        createdAt: now,
      });
    });

    return { status: "SUCCESS", phoneNumber: verifiedPhone, authority: "FIREBASE_AUTH_PHONE" };
  },
);

export const updateVerifiedOwnerProfile = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner login required.");
    const uid = request.auth.uid;
    const [authRecord, profileSnap] = await Promise.all([
      admin.auth().getUser(uid),
      db.collection("users").doc(uid).get(),
    ]);
    if (authRecord.disabled || authRecord.customClaims?.suspended === true) throw new HttpsError("permission-denied", "Owner account is disabled or suspended.");
    const profile = profileSnap.data() || {};
    if (ownerRole(authRecord, profile) !== "owner") throw new HttpsError("permission-denied", "Owner role required.");

    const value = validateOwnerProfileChange(request.data, profile, authRecord);
    const now = FieldValue.serverTimestamp();
    const userRef = db.collection("users").doc(uid);
    const auditRef = db.collection("audit_logs").doc();
    const before = {
      displayName: profile.displayName || null,
      phoneNumber: profile.phoneNumber || profile.phone || null,
      companyName: profile.companyName || profile.ownerCompanyName || null,
      billingContact: profile.billingContact || null,
      preferredContact: profile.notificationPreferences?.preferredContact || profile.preferredContact || null,
    };
    const after = {
      displayName: value.displayName,
      phoneNumber: value.phone,
      companyName: value.companyName,
      billingContact: { name: value.billingName, email: value.billingEmail, phone: value.billingPhone },
      preferredContact: value.preferredContact,
    };

    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(userRef);
      if (!fresh.exists) throw new HttpsError("not-found", "Owner profile not found.");
      transaction.set(userRef, {
        displayName: value.displayName,
        phoneNumber: value.phone,
        phone: value.phone,
        companyName: value.companyName,
        ownerCompanyName: value.companyName,
        billingContact: after.billingContact,
        notificationPreferences: {
          ...(fresh.data()?.notificationPreferences || {}),
          preferredContact: value.preferredContact,
          language: value.language,
        },
        language: value.language,
        ownerProfileUpdatedAt: now,
        ownerProfileUpdatedBy: uid,
        updatedAt: now,
      }, { merge: true });
      transaction.set(auditRef, {
        action: "OWNER_VERIFIED_PROFILE_UPDATED",
        actorId: uid,
        actorRole: "owner",
        targetType: "user",
        targetId: uid,
        before,
        after,
        phoneAuthority: value.phoneAuthority,
        identityAuthority: "OWNER_KYC_RECORD",
        createdAt: now,
      });
    });

    if (authRecord.displayName !== value.displayName) await admin.auth().updateUser(uid, { displayName: value.displayName });
    return { status: "SUCCESS", profile: after };
  },
);
