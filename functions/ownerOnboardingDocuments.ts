import type * as FirebaseFirestore from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// F-6: Owner onboarding identity/property documents.
// - Submission only accepts objects the protected upload callable stored under the caller's own
//   `onboarding-proof/{uid}/` prefix, and verifies each object exists and is tagged to that Owner.
//   (Before, any non-empty string/URL was accepted as "proof".)
// - Objects are stored without a Firebase download token; access is through short-lived signed
//   URLs minted per request for the Owner or an Admin, and every access is audit-logged.

export const OWNER_DOCUMENT_PREFIX = "onboarding-proof";
export const OWNER_DOCUMENT_LINK_TTL_SECONDS = 300;
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const text = (value: unknown) => String(value ?? "").trim();

export const ownerDocumentPrefix = (uid: string) => `${OWNER_DOCUMENT_PREFIX}/${uid}/`;

/** Legacy clients sent Firebase Storage download URLs; reduce them to the object path. */
export function storagePathFromDocumentRef(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) return raw;
  let url: URL;
  try { url = new URL(raw); } catch { return ""; }
  const match = url.pathname.match(/\/o\/([^/]+)$/);
  if (url.hostname !== "firebasestorage.googleapis.com" || !match) return "";
  try { return decodeURIComponent(match[1]); } catch { return ""; }
}

export function assertOwnerDocumentPath(uid: string, key: string, path: string) {
  if (!path || path.length > 600 || path.includes("..") || path.includes("//") || !path.startsWith(ownerDocumentPrefix(uid))) {
    throw new HttpsError("failed-precondition", `The ${key} document must be uploaded through the protected BIN GROUP upload for this account.`);
  }
}

export async function verifiedOwnerDocumentPaths(uid: string, data: Record<string, any>): Promise<Record<string, string>> {
  const source = (data?.documentPaths && typeof data.documentPaths === "object")
    ? data.documentPaths
    : (data?.documentUrls && typeof data.documentUrls === "object" ? data.documentUrls : {});
  const entries = Object.entries(source as Record<string, unknown>);
  if (entries.length > 12) throw new HttpsError("invalid-argument", "Too many documents were submitted.");
  const paths: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!KEY_PATTERN.test(key)) throw new HttpsError("invalid-argument", "Invalid document type.");
    if (!text(value)) continue;
    const path = storagePathFromDocumentRef(value);
    assertOwnerDocumentPath(uid, key, path);
    paths[key] = path;
  }
  if (!paths.propertyProof || !((paths.emiratesId && paths.passport) || paths.tradeLicense)) {
    throw new HttpsError("failed-precondition", "Property proof and Owner identity documents are required.");
  }
  const bucket = admin.storage().bucket();
  await Promise.all(Object.entries(paths).map(async ([key, path]) => {
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) throw new HttpsError("failed-precondition", `The ${key} document was not found. Upload it again.`);
    const [metadata] = await file.getMetadata();
    if (text(metadata?.metadata?.ownerUid) !== uid) {
      throw new HttpsError("failed-precondition", `The ${key} document does not belong to this Owner account.`);
    }
  }));
  return paths;
}

export const getOwnerOnboardingDocumentLink = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  const intakeId = text(request.data?.intakeId);
  const key = text(request.data?.key);
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(intakeId) || !KEY_PATTERN.test(key)) throw new HttpsError("invalid-argument", "intakeId and a document key are required.");

  const user = await admin.auth().getUser(request.auth.uid);
  const claims = (user.customClaims || {}) as Record<string, any>;
  if (user.disabled || claims.suspended === true || request.auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "Inactive account.");
  }
  const role = text(claims.role || claims.userRole || claims.primaryRole).toLowerCase();
  const isAdmin = claims.admin === true || claims.isAdmin === true || claims.superAdmin === true || claims.super_admin === true || ADMIN_ROLES.has(role);

  const intakeSnap = await db.collection("intake_submissions").doc(intakeId).get();
  if (!intakeSnap.exists) throw new HttpsError("not-found", "Application not found.");
  const intake = intakeSnap.data() || {};
  const ownerUid = text(intake.ownerUid || intake.ownerId || intake.uid);
  if (!isAdmin && !(role === "owner" && ownerUid && ownerUid === request.auth.uid)) {
    throw new HttpsError("permission-denied", "This document is not available to your account.");
  }
  const path = text(intake.documentPaths?.[key]);
  if (!path) throw new HttpsError("failed-precondition", "This application has no protected Storage path for that document.");
  assertOwnerDocumentPath(ownerUid, key, path);

  const file = admin.storage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("not-found", "The linked document file is missing.");
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + OWNER_DOCUMENT_LINK_TTL_SECONDS * 1000 });

  await db.collection("audit_logs").add({
    actorId: request.auth.uid,
    actorRole: isAdmin ? (role || "admin") : "owner",
    action: "OWNER_ONBOARDING_DOCUMENT_ACCESSED",
    targetType: "intake_submissions",
    targetId: intakeId,
    metadata: { key, storagePath: path },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  } as FirebaseFirestore.DocumentData);

  return { ok: true, url, expiresInSeconds: OWNER_DOCUMENT_LINK_TTL_SECONDS };
});
