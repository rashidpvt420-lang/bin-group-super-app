import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function clean(value: unknown, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizedRole(auth: any) {
  const token = auth?.token || {};
  return clean(token.role || token.userRole || token.primaryRole, 40).toLowerCase();
}

function assignedTechnicianId(data: FirebaseFirestore.DocumentData) {
  return clean(
    data.assignedTechnicianId ||
      data.technicianId ||
      data.assignedTechId ||
      data.technicianUid ||
      data.techId,
    128,
  );
}

function confirmationId(ticketId: string, technicianId: string) {
  return `${ticketId}__after_work__${technicianId}`;
}

function assertStorageUrl(downloadUrl: string, bucketName: string, storagePath: string) {
  let parsed: URL;
  try {
    parsed = new URL(downloadUrl);
  } catch {
    throw new HttpsError("invalid-argument", "After-work evidence URL is invalid.");
  }
  const encodedPath = encodeURIComponent(storagePath);
  const allowedHost = parsed.hostname === "firebasestorage.googleapis.com" || parsed.hostname === "storage.googleapis.com";
  const referencesBucket = parsed.pathname.includes(bucketName);
  const referencesObject = parsed.pathname.includes(encodedPath) || parsed.pathname.includes(storagePath);
  if (!allowedHost || !referencesBucket || !referencesObject) {
    throw new HttpsError("invalid-argument", "After-work evidence URL does not match the verified Storage object.");
  }
}

export const submitTechnicianAfterWorkEvidence = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Technician login required.");
    if (request.auth.token?.suspended === true) throw new HttpsError("permission-denied", "Technician account is suspended.");
    if (!["technician", "tech"].includes(normalizedRole(request.auth))) {
      throw new HttpsError("permission-denied", "Technician access required.");
    }

    const technicianId = request.auth.uid;
    const ticketId = clean(request.data?.ticketId, 128);
    const storagePath = clean(request.data?.storagePath, 600);
    const downloadUrl = clean(request.data?.downloadUrl, 2000);
    if (!ticketId || !storagePath || !downloadUrl) {
      throw new HttpsError("invalid-argument", "ticketId, storagePath and downloadUrl are required.");
    }

    const requiredPrefix = `maintenanceTickets/${ticketId}/proofPhotos/`;
    if (!storagePath.startsWith(requiredPrefix) || storagePath.includes("..")) {
      throw new HttpsError("invalid-argument", "After-work evidence must use the ticket proofPhotos path.");
    }

    const [profileSnap, ticketSnap] = await Promise.all([
      db.collection("technicians").doc(technicianId).get(),
      db.collection("maintenanceTickets").doc(ticketId).get(),
    ]);
    if (!profileSnap.exists) throw new HttpsError("failed-precondition", "Approved technician profile is required.");
    const profile = profileSnap.data() || {};
    const profileStatus = clean(profile.status || profile.approvalStatus, 40).toLowerCase();
    if (profile.suspended === true || !["active", "approved"].includes(profileStatus)) {
      throw new HttpsError("permission-denied", "Only approved, active technicians can submit work evidence.");
    }
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Mission not found.");
    const ticket = ticketSnap.data() || {};
    if (assignedTechnicianId(ticket) !== technicianId) {
      throw new HttpsError("permission-denied", "This mission is not assigned to your technician account.");
    }
    if (clean(ticket.status, 80).toUpperCase() !== "IN_PROGRESS") {
      throw new HttpsError("failed-precondition", "After-work evidence can only be confirmed while the assigned mission is in progress.");
    }

    const bucket = admin.storage().bucket();
    assertStorageUrl(downloadUrl, bucket.name, storagePath);
    const object = bucket.file(storagePath);
    const [exists] = await object.exists();
    if (!exists) throw new HttpsError("failed-precondition", "Uploaded after-work evidence object was not found.");
    const [metadata] = await object.getMetadata();
    const contentType = clean(metadata.contentType, 120).toLowerCase();
    const sizeBytes = Number(metadata.size || 0);
    const custom = metadata.metadata || {};
    if (!contentType.startsWith("image/") || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 10 * 1024 * 1024) {
      throw new HttpsError("failed-precondition", "After-work evidence must be a valid image up to 10 MB.");
    }
    if (
      clean(custom.ticketId, 128) !== ticketId ||
      clean(custom.technicianId, 128) !== technicianId ||
      clean(custom.evidenceType, 80) !== "technician_after_work"
    ) {
      throw new HttpsError("permission-denied", "After-work evidence metadata does not match the authenticated mission.");
    }

    const ticketRef = ticketSnap.ref;
    const confirmationRef = db.collection("technicianEvidenceConfirmations").doc(confirmationId(ticketId, technicianId));
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(ticketRef);
      if (!current.exists) throw new HttpsError("not-found", "Mission not found.");
      const currentData = current.data() || {};
      if (assignedTechnicianId(currentData) !== technicianId) {
        throw new HttpsError("permission-denied", "Mission assignment changed before evidence confirmation.");
      }
      if (clean(currentData.status, 80).toUpperCase() !== "IN_PROGRESS") {
        throw new HttpsError("failed-precondition", "Mission is no longer accepting after-work evidence.");
      }

      transaction.update(ticketRef, {
        technicianAfterPhotos: FieldValue.arrayUnion(downloadUrl),
        technicianAfterPhotoUrl: currentData.technicianAfterPhotoUrl || downloadUrl,
        technicianAfterEvidenceAt: now,
        technicianAfterEvidenceBy: technicianId,
        technicianAfterEvidenceState: "CONFIRMED",
        afterPhotos: FieldValue.arrayUnion(downloadUrl),
        afterPhotoUrl: currentData.afterPhotoUrl || downloadUrl,
        completionPhotos: FieldValue.arrayUnion(downloadUrl),
        proofPhotos: FieldValue.arrayUnion(downloadUrl),
        evidencePhotos: FieldValue.arrayUnion(downloadUrl),
        updatedAt: now,
      });

      transaction.set(confirmationRef, {
        ticketId,
        technicianId,
        evidenceType: "technician_after_work",
        state: "CONFIRMED",
        storagePath,
        downloadUrl,
        contentType,
        sizeBytes,
        confirmedAt: now,
      });

      transaction.set(auditRef, {
        actorId: technicianId,
        actorRole: "technician",
        action: "TECHNICIAN_AFTER_WORK_EVIDENCE_CONFIRMED",
        targetType: "maintenanceTickets",
        targetId: ticketId,
        metadata: {
          confirmationId: confirmationRef.id,
          storagePath,
          contentType,
          sizeBytes,
          sensitiveValuesExcluded: true,
        },
        createdAt: now,
      });
    });

    return {
      status: "SUCCESS",
      ticketId,
      storagePath,
      downloadUrl,
      confirmationId: confirmationRef.id,
      evidenceState: "TECHNICIAN_AFTER_WORK_CONFIRMED",
    };
  },
);

import type * as FirebaseFirestore from "firebase-admin/firestore";
