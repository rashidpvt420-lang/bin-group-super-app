import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const serverTimestamp = FieldValue.serverTimestamp;

function text(value: unknown, label: string, maxLength: number) {
  const output = String(value || "").trim();
  if (!output) throw new HttpsError("invalid-argument", `${label} is required.`);
  if (output.length > maxLength) throw new HttpsError("invalid-argument", `${label} is too long.`);
  return output;
}

function email(value: unknown) {
  const output = text(value, "ownerEmail", 160).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(output)) throw new HttpsError("invalid-argument", "Valid owner email is required.");
  return output;
}

function ref(value: unknown, fallback = "") {
  const output = String(value || fallback || "").trim();
  if (!output) return "";
  return output.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 160);
}

function assertOwner(request: any, ownerUid: string, ownerEmail: string) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication required.");
  if (request.auth.uid !== ownerUid) throw new HttpsError("permission-denied", "Owner UID does not match authenticated account.");
  const tokenEmail = String(request.auth.token?.email || "").trim().toLowerCase();
  if (tokenEmail && tokenEmail !== ownerEmail) throw new HttpsError("permission-denied", "Owner email does not match authenticated account.");
}

export const uploadOwnerOnboardingProofDocument = onCall({ cors: true, memory: "512MiB" }, async (request) => {
  const ownerUid = text(request.data?.ownerUid, "ownerUid", 120);
  const ownerEmail = email(request.data?.ownerEmail);
  assertOwner(request, ownerUid, ownerEmail);

  const intakeId = ref(request.data?.intakeId, ownerUid);
  const onboardingSessionId = ref(request.data?.onboardingSessionId, intakeId || ownerUid);
  const docType = ref(request.data?.docType, "document");
  const filename = String(request.data?.filename || `${docType}.bin`).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
  const contentType = text(request.data?.contentType || "application/octet-stream", "contentType", 120);
  const encodedDocument = text(request.data?.encodedDocument, "encodedDocument", 12 * 1024 * 1024);

  if (!contentType.match(/^image\//) && contentType !== "application/pdf" && contentType !== "application/octet-stream") {
    throw new HttpsError("invalid-argument", "Only PDF and image documents are allowed.");
  }

  const cleanPayload = encodedDocument.includes(",") ? encodedDocument.split(",").pop() || "" : encodedDocument;
  const buffer = Buffer.from(cleanPayload, "base64");
  if (!buffer.length) throw new HttpsError("invalid-argument", "Document payload is empty.");
  if (buffer.length > 8 * 1024 * 1024) throw new HttpsError("invalid-argument", "Document exceeds the secure fallback upload limit of 8MB.");

  const token = db.collection("_download_tokens").doc().id;
  const storagePath = `onboarding-proof/${ownerUid}/${onboardingSessionId}/${docType}/${Date.now()}_${filename}`;
  const bucket = admin.storage().bucket();

  await bucket.file(storagePath).save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      metadata: {
        firebaseStorageDownloadTokens: token,
        uploadedBy: ownerEmail,
        ownerUid,
        intakeId,
        onboardingSessionId,
        docType,
        uploadedVia: "callable_fallback",
        uploadedAt: new Date().toISOString()
      }
    }
  });

  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

  await db.collection("audit_logs").add({
    action: "ONBOARDING_PROOF_UPLOADED_SERVER_FALLBACK",
    actorId: ownerUid,
    actorRole: "owner",
    ownerUid,
    ownerEmail,
    intakeId,
    onboardingSessionId,
    docType,
    storagePath,
    size: buffer.length,
    createdAt: serverTimestamp()
  });

  return { success: true, downloadUrl, storagePath, docType, size: buffer.length };
});
