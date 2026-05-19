import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;

async function assertAdmin(auth: any) {
  if (!auth) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const token = auth.token || {};
  const role = String(token.role || token.userRole || "").toLowerCase();
  if (token.admin === true || token.isAdmin === true || ["admin", "super_admin", "ceo", "manager"].includes(role)) return;
  const userSnap = await db.collection("users").doc(auth.uid).get();
  const user = userSnap.data() || {};
  const userRole = String(user.role || user.userRole || "").toLowerCase();
  if (user.admin === true || user.isAdmin === true || ["admin", "super_admin", "ceo", "manager"].includes(userRole)) return;
  throw new HttpsError("permission-denied", "Admin access required.");
}

export const adminSendOwnerOnboardingMessage = onCall({ cors: true }, async (request) => {
  await assertAdmin(request.auth);
  const intakeId = String(request.data?.intakeId || "").trim();
  const subject = String(request.data?.subject || "BIN GROUP onboarding update").trim();
  const body = String(request.data?.message || "Please contact BIN GROUP Admin to complete your onboarding verification.").trim();
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  const snap = await db.collection("intake_submissions").doc(intakeId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Owner submission not found.");
  const intake = snap.data() || {};
  const ownerEmail = String(intake.ownerEmail || intake.contactInfo?.email || intake.pendingPaymentSubmission?.ownerAccount?.email || intake.pendingPaymentSubmission?.companyProfile?.email || "").trim().toLowerCase();
  const ownerId = String(intake.ownerUid || intake.pendingOwnerId || intake.ownerRegistrationId || ownerEmail || intakeId).replace(/[^A-Za-z0-9_-]/g, "_");
  const batch = db.batch();
  batch.set(db.collection("messages").doc(), { intakeId, ownerId, ownerEmail, fromRole: "admin", toRole: "owner", subject, body, status: "SENT", channel: "APP_AND_EMAIL", createdBy: request.auth?.uid || "admin", createdAt: ts() });
  batch.set(db.collection("notifications").doc(), { userId: ownerId, toRole: "owner", type: "ADMIN_MESSAGE", title: subject, body, read: false, createdAt: ts() });
  if (ownerEmail) batch.set(db.collection("mail").doc(), { to: ownerEmail, message: { subject, html: `<p>${body}</p>` }, metadata: { type: "admin_owner_message", intakeId, ownerId }, createdAt: ts() });
  batch.set(db.collection("audit_logs").doc(), { actorId: request.auth?.uid || "admin", actorRole: "admin", action: "ADMIN_CONTACT_OWNER", targetType: "intake_submissions", targetId: intakeId, createdAt: ts() });
  await batch.commit();
  return { status: "QUEUED" };
});
