import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { TECHNICIAN_GPS_CONSENT_COLLECTION, LEGAL_CONSENT_VERSION } from "./ownerInitialContractPolicy";
import { clientIpFromRequest, deviceIdFromRequest } from "./contractAcceptanceAudit";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const recordTechnicianGpsConsent = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required.");
    const role = String(request.auth.token?.role || request.auth.token?.userRole || request.auth.token?.primaryRole || "").toLowerCase();
    if (role !== "technician") {
      throw new HttpsError("permission-denied", "Only a technician can record technician GPS consent.");
    }
    if (request.data?.consentActiveDutyOnly !== true) {
      throw new HttpsError("invalid-argument", "Explicit consent to active-duty-only GPS tracking is required.");
    }
    const uid = request.auth.uid;
    const now = FieldValue.serverTimestamp();
    const auditRef = db.collection(TECHNICIAN_GPS_CONSENT_COLLECTION).doc();
    await db.runTransaction(async (transaction) => {
      transaction.create(auditRef, {
        uid,
        consentActiveDutyOnly: true,
        consentVersion: LEGAL_CONSENT_VERSION,
        ip: clientIpFromRequest(request),
        deviceId: deviceIdFromRequest(request),
        createdAt: now,
        serverTimestamp: now,
        immutable: true,
      });
      transaction.set(db.collection("users").doc(uid), {
        technicianGpsActiveDutyConsent: true,
        technicianGpsActiveDutyConsentAt: now,
        technicianGpsConsentVersion: LEGAL_CONSENT_VERSION,
        updatedAt: now,
      }, { merge: true });
    });
    return { ok: true, consentId: auditRef.id };
  },
);
