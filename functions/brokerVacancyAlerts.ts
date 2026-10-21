/**
 * Broker vacancy alerts (feature 6, owner/tenant deep audit 2026-10-21 §9).
 * When a Home Discovery listing becomes verified/public, KYC- and RERA-approved brokers whose
 * emirate matches (or who set no emirate) get an in-app alert with a referral link.
 * Commission wording comes from system_config/broker_commission.summary; no rate is invented here.
 */
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import type * as FirebaseFirestore from "firebase-admin/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const norm = (value: unknown) => text(value, 60).toUpperCase().replace(/[^A-Z]/g, "");

export function isLiveListing(data: any) {
  const status = text(data?.status || data?.availabilityStatus || data?.listingStatus, 40).toUpperCase();
  return Boolean(data) && data.active === true && data.approved === true && data.hasBinContract === true && data.verifiedByAdmin === true
    && data.notRented !== false && !["RENTED", "CLOSED", "INACTIVE", "WITHDRAWN"].includes(status);
}

/** Public profile check; the private KYC doc is checked separately. */
export function brokerEligible(profile: any, privateKyc: any, listingEmirate: string) {
  const role = text(profile?.role || profile?.userRole, 40).toLowerCase();
  const status = text(profile?.status || profile?.accountStatus, 40).toLowerCase();
  if (role !== "broker" || ["suspended", "disabled", "rejected", "deleted"].includes(status)) return false;
  if (profile?.reraVerified !== true || text(profile?.brokerKycStatus || profile?.kycStatus, 40).toLowerCase() !== "verified") return false;
  if (!privateKyc || privateKyc.reraVerified !== true || text(privateKyc.brokerKycStatus || privateKyc.kycStatus, 40).toLowerCase() !== "verified") return false;
  const hash = text(privateKyc.submissionHash, 80);
  if (!hash || hash !== text(privateKyc.approvedSubmissionHash || profile?.approvedSubmissionHash, 80)) return false;
  if (profile?.vacancyAlertsOptOut === true) return false;
  const prefs: string[] = [profile?.emirate, ...(Array.isArray(profile?.serviceEmirates) ? profile.serviceEmirates : [])].map(norm).filter(Boolean);
  return prefs.length === 0 || prefs.includes(norm(listingEmirate));
}

export async function alertBrokersForListing(listingId: string, listing: any) {
  const emirate = text(listing.emirate, 40);
  const commission = text((await db.collection("system_config").doc("broker_commission").get()).data()?.summary, 300)
    || "Commission as per your signed BIN broker agreement.";
  const title = text(listing.unitTitle || listing.title || listing.propertyName || "New BIN verified listing", 140);
  const rent = Number(listing.annualRent || 0);
  let sent = 0; let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let q = db.collection("users").where("role", "==", "broker").orderBy("__name__").limit(200);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const kyc = (await db.collection("broker_kyc_profiles").doc(doc.id).get()).data();
      if (!brokerEligible(doc.data(), kyc, emirate)) continue;
      await db.collection("notifications").doc(`broker_vacancy_${listingId}_${doc.id}`).set({
        userId: doc.id, role: "broker", type: "BROKER_VACANCY_ALERT",
        title: `New vacancy: ${title}`,
        body: `${[text(listing.area || listing.community, 80), emirate.replace(/_/g, " ")].filter(Boolean).join(", ")}${rent > 0 ? ` · AED ${rent.toLocaleString("en-AE")}/yr` : ""}. ${commission}`,
        link: `/broker/listings?listing=${encodeURIComponent(listingId)}&ref=${encodeURIComponent(doc.id)}`,
        listingId, read: false, status: "PENDING", createdAt: FieldValue.serverTimestamp(), source: "BROKER_VACANCY_ALERT",
      }, { merge: true });
      sent += 1;
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 200) break;
  }
  return { sent };
}

/** SAFETY: broker alerts stay OFF until system_config/vacancy.brokerAlertsEnabled is explicitly true. */
export async function brokerVacancyAlertsEnabled(): Promise<boolean> {
  const cfg = (await db.collection("system_config").doc("vacancy").get()).data();
  return cfg?.brokerAlertsEnabled === true;
}

export const notifyBrokersOfNewVacancy = onDocumentWritten({ document: "contractorProfiles/{listingId}", region: "europe-west3", retry: true }, async (event) => {
  const before = event.data?.before?.data(); const after = event.data?.after?.data();
  if (!after || !isLiveListing(after) || isLiveListing(before)) return;
  if (!(await brokerVacancyAlertsEnabled())) return;
  await alertBrokersForListing(event.params.listingId, after);
});
