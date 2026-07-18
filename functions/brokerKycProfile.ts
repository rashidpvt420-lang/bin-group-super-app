import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const TERMS_VERSION = "BIN_BROKER_TERMS_2026_01";
const SUBMISSION_LIMIT = 10;
const SUBMISSION_WINDOW_MS = 60 * 60 * 1000;
const ALLOWED_KEYS = new Set([
  "displayName",
  "phone",
  "companyName",
  "reraLicense",
  "primaryRegion",
  "tradeLicenseNumber",
  "emiratesIdNumber",
  "passportNumber",
  "bankName",
  "bankAccountHolder",
  "bankIban",
  "brokerTerritory",
  "commissionAgreementAccepted",
  "commissionTermsVersion",
  "language",
]);

const text = (value: unknown) => String(value ?? "").trim();
const roleOf = (value: unknown) => text(value).toLowerCase();

function clean(value: unknown, label: string, maxLength: number, required = false) {
  const output = text(value);
  if (required && !output) throw new HttpsError("invalid-argument", `${label} is required.`);
  if (output.length > maxLength) throw new HttpsError("invalid-argument", `${label} is too long.`);
  return output;
}

function normalizeIban(value: unknown) {
  const iban = text(value).replace(/\s+/g, "").toUpperCase();
  if (iban && !/^AE\d{21}$/.test(iban)) {
    throw new HttpsError("invalid-argument", "A valid UAE IBAN is required.");
  }
  return iban;
}

function maskIdentifier(value: string, visible = 4) {
  if (!value) return "";
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= visible) return "•".repeat(compact.length);
  return `${"•".repeat(Math.min(12, compact.length - visible))}${compact.slice(-visible)}`;
}

function toMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && typeof (value as any).toMillis === "function") {
    return Number((value as any).toMillis());
  }
  return Number(value || 0);
}

async function assertBrokerAccount(authContext: any) {
  if (!authContext?.uid) throw new HttpsError("unauthenticated", "Broker login required.");
  if (authContext.token?.suspended === true) throw new HttpsError("permission-denied", "Suspended broker account.");
  if (authContext.token?.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Verify the broker email before submitting KYC details.");
  }

  const authUser = await admin.auth().getUser(authContext.uid);
  if (authUser.disabled) throw new HttpsError("permission-denied", "Disabled broker account.");

  const tokenRole = roleOf(authContext.token?.role || authContext.token?.userRole || authContext.token?.primaryRole);
  if (tokenRole === "broker") return;

  const profile = await db.collection("users").doc(authContext.uid).get();
  if (roleOf(profile.data()?.role || profile.data()?.userRole || profile.data()?.primaryRole) !== "broker") {
    throw new HttpsError("permission-denied", "Broker role required.");
  }
}

export async function submitBrokerKycProfileHandler(request: any) {
  await assertBrokerAccount(request.auth);

  const raw = request.data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpsError("invalid-argument", "Broker KYC payload is required.");
  }
  const unexpectedKeys = Object.keys(raw).filter((key) => !ALLOWED_KEYS.has(key));
  if (unexpectedKeys.length > 0) {
    throw new HttpsError("invalid-argument", `Unsupported Broker KYC fields: ${unexpectedKeys.join(", ")}`);
  }

  const uid = request.auth!.uid;
  const displayName = clean(raw.displayName, "Professional name", 120, true);
  const phone = clean(raw.phone, "Phone", 40, true).replace(/[^0-9+]/g, "");
  if (phone.length < 8) throw new HttpsError("invalid-argument", "A valid phone number is required.");
  const companyName = clean(raw.companyName, "Brokerage company", 160, true);
  const reraLicense = clean(raw.reraLicense, "RERA license", 80);
  const primaryRegion = clean(raw.primaryRegion, "Primary region", 120, true);
  const brokerTerritory = clean(raw.brokerTerritory, "Broker territory", 120, true);
  const tradeLicenseNumber = clean(raw.tradeLicenseNumber, "Trade license number", 100);
  const emiratesIdNumber = clean(raw.emiratesIdNumber, "Emirates ID number", 40);
  const passportNumber = clean(raw.passportNumber, "Passport number", 40);
  const bankName = clean(raw.bankName, "Bank name", 120);
  const bankAccountHolder = clean(raw.bankAccountHolder, "Bank account holder", 160);
  const bankIban = normalizeIban(raw.bankIban);
  const commissionAgreementAccepted = raw.commissionAgreementAccepted === true;
  const commissionTermsVersion = clean(raw.commissionTermsVersion, "Commission terms version", 80) || TERMS_VERSION;
  const language = ["en", "ar"].includes(text(raw.language).toLowerCase()) ? text(raw.language).toLowerCase() : "en";

  if (commissionAgreementAccepted && commissionTermsVersion !== TERMS_VERSION) {
    throw new HttpsError("failed-precondition", "Accept the current BIN GROUP Broker commission terms.");
  }
  if (bankIban && (!bankName || !bankAccountHolder)) {
    throw new HttpsError("failed-precondition", "Bank name and account holder are required with an IBAN.");
  }

  const identityProvided = Boolean(tradeLicenseNumber || emiratesIdNumber || passportNumber);
  const checks = [
    displayName,
    phone,
    companyName,
    reraLicense,
    identityProvided,
    brokerTerritory || primaryRegion,
    bankName,
    bankAccountHolder,
    bankIban,
    commissionAgreementAccepted,
  ];
  const profileCompletionScore = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const brokerKycStatus = profileCompletionScore === 100 ? "PENDING_REVIEW" : "INCOMPLETE";
  const reraStatus = reraLicense ? "PENDING" : "NOT_SUBMITTED";

  const canonical = {
    uid,
    displayName,
    phone,
    companyName,
    reraLicense,
    primaryRegion,
    brokerTerritory,
    tradeLicenseNumber,
    emiratesIdNumber,
    passportNumber,
    bankName,
    bankAccountHolder,
    bankIban,
    commissionAgreementAccepted,
    commissionTermsVersion,
    language,
  };
  const submissionHash = crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");

  const privateRef = db.collection("broker_kyc_profiles").doc(uid);
  const publicRef = db.collection("users").doc(uid);
  const rateRef = db.collection("broker_kyc_submission_limits").doc(uid);
  let idempotent = false;

  await db.runTransaction(async (transaction) => {
    const [privateSnap, publicSnap, rateSnap] = await Promise.all([
      transaction.get(privateRef),
      transaction.get(publicRef),
      transaction.get(rateRef),
    ]);
    const existingPrivate = privateSnap.data() || {};
    idempotent = existingPrivate.submissionHash === submissionHash;

    const now = FieldValue.serverTimestamp();
    if (!idempotent) {
      const nowMs = Date.now();
      const rate = rateSnap.data() || {};
      const previousWindow = toMillis(rate.windowStartedAtMs || rate.windowStartedAt);
      const inWindow = previousWindow > 0 && nowMs - previousWindow < SUBMISSION_WINDOW_MS;
      const count = inWindow ? Number(rate.count || 0) : 0;
      if (count >= SUBMISSION_LIMIT) {
        throw new HttpsError("resource-exhausted", "Too many Broker KYC updates. Try again later.");
      }

      transaction.set(rateRef, {
        brokerUid: uid,
        windowStartedAtMs: inWindow ? previousWindow : nowMs,
        count: count + 1,
        updatedAt: now,
      }, { merge: true });

      transaction.set(privateRef, {
        ...canonical,
        email: request.auth?.token?.email || publicSnap.data()?.email || null,
        reraStatus,
        reraVerified: false,
        brokerKycStatus,
        profileCompletionScore,
        bankIbanMasked: maskIdentifier(bankIban),
        reraLicenseMasked: maskIdentifier(reraLicense),
        tradeLicenseMasked: maskIdentifier(tradeLicenseNumber),
        emiratesIdMasked: maskIdentifier(emiratesIdNumber),
        passportMasked: maskIdentifier(passportNumber),
        submissionHash,
        submittedAt: now,
        updatedAt: now,
        createdAt: existingPrivate.createdAt || now,
      }, { merge: true });
    }

    transaction.set(publicRef, {
      uid,
      displayName,
      phone,
      phoneNumber: phone,
      companyName,
      primaryRegion,
      brokerTerritory,
      reraStatus,
      reraVerified: false,
      reraLicenseMasked: maskIdentifier(reraLicense),
      bankIbanMasked: maskIdentifier(bankIban),
      bankNameMasked: bankName ? `${bankName.slice(0, 2)}•••` : "",
      commissionAgreementAccepted,
      commissionTermsVersion,
      brokerKycStatus,
      brokerProfileCompletion: profileCompletionScore,
      profileCompletionScore,
      language,
      // Remove fields written by the retired direct-client Broker profile.
      reraLicense: FieldValue.delete(),
      tradeLicenseNumber: FieldValue.delete(),
      emiratesIdNumber: FieldValue.delete(),
      passportNumber: FieldValue.delete(),
      bankName: FieldValue.delete(),
      bankAccountHolder: FieldValue.delete(),
      bankIban: FieldValue.delete(),
      iban: FieldValue.delete(),
      updatedAt: now,
    }, { merge: true });

    if (!idempotent) {
      transaction.set(db.collection("audit_logs").doc(), {
        action: "BROKER_KYC_PROFILE_SUBMITTED",
        actorId: uid,
        actorRole: "broker",
        targetType: "broker_kyc_profiles",
        targetId: uid,
        metadata: {
          brokerKycStatus,
          profileCompletionScore,
          reraSubmitted: Boolean(reraLicense),
          identityProvided,
          bankSubmitted: Boolean(bankIban),
          agreementAccepted: commissionAgreementAccepted,
          submissionHash,
        },
        createdAt: now,
      });
    }
  });

  return {
    status: "SUCCESS",
    idempotent,
    brokerKycStatus,
    profileCompletionScore,
    reraStatus,
    reraVerified: false,
    reraLicenseMasked: maskIdentifier(reraLicense),
    bankIbanMasked: maskIdentifier(bankIban),
    commissionTermsVersion,
  };
}

export const submitBrokerKycProfile = onCall(
  { cors: true, enforceAppCheck: true },
  submitBrokerKycProfileHandler,
);
