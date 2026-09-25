import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type * as FirebaseFirestore from "firebase-admin/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown) => text(value).toLowerCase();
const upper = (value: unknown, max = 80) => text(value, max).toUpperCase();

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
  const role = lower(claims.role || claims.userRole || claims.primaryRole || profile.role || profile.userRole);
  const status = lower(profile.status || profile.accountStatus);
  const submissionHash = text(privateKyc.submissionHash, 80);
  const approvedSubmissionHash = text(privateKyc.approvedSubmissionHash || profile.approvedSubmissionHash, 80);

  if (
    account.disabled ||
    !account.emailVerified ||
    claims.suspended === true ||
    role !== "broker" ||
    ["suspended", "disabled", "rejected", "deleted"].includes(status)
  ) {
    throw new HttpsError("permission-denied", "Current verified Broker authority is required.");
  }
  if (
    !privateSnap.exists ||
    profile.reraVerified !== true ||
    privateKyc.reraVerified !== true ||
    lower(profile.brokerKycStatus || profile.kycStatus) !== "verified" ||
    lower(privateKyc.brokerKycStatus || privateKyc.kycStatus) !== "verified" ||
    !submissionHash ||
    submissionHash !== approvedSubmissionHash
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Approved RERA/KYC evidence bound to the current Broker submission is required for verified listing access.",
    );
  }
  return { uid: auth.uid };
}

function isVerifiedListing(data: FirebaseFirestore.DocumentData) {
  const status = upper(data.status || data.availabilityStatus || data.listingStatus);
  return data.active === true &&
    data.approved === true &&
    data.hasBinContract === true &&
    data.verifiedByAdmin === true &&
    data.notRented !== false &&
    !["RENTED", "CLOSED", "INACTIVE", "WITHDRAWN"].includes(status);
}

function publicListing(id: string, data: FirebaseFirestore.DocumentData) {
  const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const imageUrls = Array.isArray(data.imageUrls)
    ? data.imageUrls.map((value: unknown) => text(value, 1200)).filter((value: string) => /^https:\/\//i.test(value)).slice(0, 12)
    : [];
  const cover = text(data.coverImageUrl || imageUrls[0], 1200);

  return {
    id,
    title: text(data.unitTitle || data.title || data.propertyName || "BIN verified listing", 180),
    propertyType: upper(data.propertyType, 80),
    area: text(data.area || data.community || data.city, 120),
    emirate: upper(data.emirate, 60),
    publicLocationQuery: [
      text(data.area || data.community || data.city, 120),
      upper(data.emirate, 60).replace(/_/g, " "),
    ].filter(Boolean).join(", "),
    annualRent: number(data.annualRent || data.rentAnnual || data.rent),
    bedrooms: number(data.bedrooms || data.beds),
    bathrooms: number(data.bathrooms || data.baths),
    furnishing: upper(data.furnishing || data.furnished, 60),
    coverImageUrl: /^https:\/\//i.test(cover) ? cover : "",
    imageUrls,
    permitVerificationUrl: /^https:\/\//i.test(text(data.permitVerificationUrl, 1200))
      ? text(data.permitVerificationUrl, 1200)
      : "",
    availabilityStatus: "AVAILABLE",
    verifiedByAdmin: true,
  };
}

export const getBrokerVerifiedListings = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, timeoutSeconds: 20 },
  async (request) => {
    await requireApprovedBroker(request.auth);

    try {
      const snapshot = await db.collection("contractorProfiles")
        .where("active", "==", true)
        .limit(100)
        .get();
      const listings = snapshot.docs
        .filter((row) => isVerifiedListing(row.data()))
        .map((row) => publicListing(row.id, row.data()));

      return {
        status: "SUCCESS",
        inventoryState: listings.length ? "AVAILABLE" : "EMPTY",
        listings,
        dataPolicy: "SANITIZED_VERIFIED_LISTINGS_ONLY",
        ownerIdentityExposed: false,
        exactAddressExposed: false,
        exactCoordinatesExposed: false,
        browserClaimAuthority: false,
      };
    } catch (error) {
      console.error("[BrokerListingAccess] verified listing query failed", error);
      throw new HttpsError(
        "unavailable",
        "BROKER_VERIFIED_LISTINGS_UNAVAILABLE",
        { diagnosticCode: "BROKER_LISTING_QUERY_FAILED" },
      );
    }
  },
);
