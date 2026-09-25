import * as admin from "firebase-admin";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown) => text(value).toLowerCase();
const upper = (value: unknown, max = 80) => text(value, max).toUpperCase();
const email = (value: unknown) => text(value, 320).toLowerCase();
const money = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

async function requireApprovedBroker(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Broker login required.");
  const [account, publicSnap, privateSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
    db.collection("broker_kyc_profiles").doc(auth.uid).get(),
  ]);
  const claims = account.customClaims || {};
  const profile = publicSnap.data() || {};
  const privateKyc = privateSnap.data() || {};
  const role = lower(claims.role || claims.userRole || claims.primaryRole || profile.role);
  const status = lower(profile.status || profile.accountStatus);
  const submissionHash = text(privateKyc.submissionHash, 80);
  const approvedHash = text(privateKyc.approvedSubmissionHash || profile.approvedSubmissionHash, 80);
  const kycStatus = upper(profile.brokerKycStatus || profile.kycStatus || privateKyc.brokerKycStatus, 40);

  if (
    account.disabled ||
    !account.emailVerified ||
    !account.email ||
    claims.suspended === true ||
    role !== "broker" ||
    ["suspended", "disabled", "rejected", "deleted"].includes(status)
  ) {
    throw new HttpsError("permission-denied", "Current verified Broker authority is required.");
  }
  if (
    !privateSnap.exists ||
    !["VERIFIED", "APPROVED"].includes(kycStatus) ||
    profile.reraVerified !== true ||
    privateKyc.reraVerified !== true ||
    !submissionHash ||
    submissionHash !== approvedHash
  ) {
    throw new HttpsError("failed-precondition", "Approved Broker KYC/RERA is required before submitting referrals.");
  }

  return {
    uid: auth.uid as string,
    email: email(account.email),
    name: text(account.displayName || profile.displayName || profile.fullName || "Broker Partner", 160),
  };
}

function verifiedListing(data: FirebaseFirestore.DocumentData) {
  const status = upper(data.status || data.availabilityStatus || data.listingStatus, 60);
  return data.active === true &&
    data.approved === true &&
    data.hasBinContract === true &&
    data.verifiedByAdmin === true &&
    data.notRented !== false &&
    !["RENTED", "CLOSED", "INACTIVE", "WITHDRAWN"].includes(status);
}

export const submitBrokerReferral = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, timeoutSeconds: 20 },
  async (request) => {
    const broker = await requireApprovedBroker(request.auth);
    const clientRequestId = text(request.data?.clientRequestId, 160);
    const referralType = lower(request.data?.referralType, 40);
    const clientName = text(request.data?.clientName, 160);
    const phone = text(request.data?.phone, 80);
    const clientEmail = email(request.data?.email);
    const notes = text(request.data?.notes, 1500);
    const estimatedValue = money(request.data?.estimatedValue);
    const contractType = lower(request.data?.contractType, 80);
    const signedDate = text(request.data?.signedDate, 40);
    const listingId = text(request.data?.listingId, 160);
    const propertyName = text(request.data?.propertyName, 180);
    const propertyType = text(request.data?.propertyType, 100);
    const location = text(request.data?.location, 180);
    const units = text(request.data?.units, 40);

    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(clientRequestId)) {
      throw new HttpsError("invalid-argument", "A stable client request id is required.");
    }
    if (!["property", "contract"].includes(referralType) || !clientName) {
      throw new HttpsError("invalid-argument", "Referral type and client name are required.");
    }
    if (referralType === "contract" && !listingId) {
      throw new HttpsError("invalid-argument", "A verified listing is required for contract referrals.");
    }

    const referralId = "ref_" + createHash("sha256")
      .update(broker.uid + ":" + clientRequestId)
      .digest("hex")
      .slice(0, 48);
    const referralRef = db.collection("referrals").doc(referralId);
    const auditRef = db.collection("audit_logs").doc();
    const listingRef = listingId ? db.collection("contractorProfiles").doc(listingId) : null;

    const outcome = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(referralRef);
      if (existing.exists) {
        const data = existing.data() || {};
        if (data.brokerId !== broker.uid || text(data.clientRequestId, 160) !== clientRequestId) {
          throw new HttpsError("already-exists", "This referral request id is already bound to another record.");
        }
        return { idempotent: true };
      }

      let listing: FirebaseFirestore.DocumentData | null = null;
      if (listingRef) {
        const listingSnap = await transaction.get(listingRef);
        if (!listingSnap.exists || !verifiedListing(listingSnap.data() || {})) {
          throw new HttpsError("failed-precondition", "The selected BIN listing is no longer verified and available.");
        }
        listing = listingSnap.data() || {};
      }

      const attributionId = "broker_referral_" + broker.uid + "_" + referralId;
      const now = FieldValue.serverTimestamp();
      const payload: Record<string, unknown> = {
        brokerId: broker.uid,
        brokerUid: broker.uid,
        brokerEmail: broker.email,
        brokerName: broker.name,
        createdByUid: broker.uid,
        broughtByRole: "broker",
        broughtByUid: broker.uid,
        broughtByEmail: broker.email,
        attributionSource: "BROKER_PORTAL_REFERRAL_SERVER",
        sourceChannel: "broker_portal",
        attributionId,
        sourceReferralId: referralId,
        clientRequestId,
        referralType,
        clientName,
        phone: phone || null,
        email: clientEmail || null,
        notes: notes || null,
        estimatedValue: estimatedValue || null,
        status: "submitted",
        lifecycleStatus: "REFERRAL_SUBMITTED",
        createdAt: now,
        updatedAt: now,
      };

      if (listing) {
        payload.listingId = listingId;
        payload.propertyId = text(listing.propertyId, 160) || null;
        payload.propertyName = text(listing.propertyName || listing.unitTitle || listing.title, 180) || null;
        payload.location = text(listing.area || listing.community || listing.city || listing.emirate, 180) || null;
        payload.ownerId = text(listing.ownerId || listing.ownerUid, 160) || null;
        payload.ownerUid = text(listing.ownerUid || listing.ownerId, 160) || null;
        payload.ownerEmail = email(listing.ownerEmail) || null;
        payload.contractType = contractType || "annual_lease";
        payload.signedDate = signedDate || null;
        payload.listingBindingVerified = true;
      } else {
        payload.propertyName = propertyName || null;
        payload.propertyType = propertyType || null;
        payload.location = location || null;
        payload.units = units || null;
        payload.listingBindingVerified = false;
      }

      transaction.create(referralRef, payload);
      transaction.create(auditRef, {
        action: "BROKER_REFERRAL_SUBMITTED",
        actorId: broker.uid,
        actorRole: "broker",
        targetType: "referrals",
        targetId: referralId,
        metadata: {
          referralType,
          listingId: listingId || null,
          clientRequestId,
          attributionId,
          listingBindingVerified: Boolean(listing),
          privateOwnerLinkageServerResolved: Boolean(listing),
        },
        createdAt: now,
      });
      return { idempotent: false };
    });

    return {
      status: "SUCCESS",
      referralId,
      attributionId: "broker_referral_" + broker.uid + "_" + referralId,
      idempotent: outcome.idempotent,
    };
  },
);
