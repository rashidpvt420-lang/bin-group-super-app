/**
 * Owner self-serve tenant invite (feature 7, owner/tenant deep audit 2026-10-21 §6).
 * Uses the same secure model as the admin flow: a tenant_invitations row holding only the SHA-256
 * of a random token, 14-day expiry, and acceptance through acceptTenantInvitation at /tenant-invite.
 * The raw link is returned once to the owner (copy / QR) and emailed to the tenant.
 */
import * as crypto from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OPTS = { cors: true, region: "europe-west3", enforceAppCheck: true } as const;
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const DAILY_LIMIT = 30;

function requireOwner(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const role = text(auth.token?.role || auth.token?.userRole || auth.token?.primaryRole, 40).toLowerCase();
  if (role !== "owner" || auth.token?.email_verified !== true || auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "A verified, active owner account is required.");
  }
  return auth.uid as string;
}

async function ownedUnit(ownerUid: string, unitId: string) {
  const unit = (await db.collection("units").doc(unitId).get()).data();
  if (!unit) throw new HttpsError("not-found", "Unit not found.");
  const propertyId = text(unit.propertyId, 160);
  const property = propertyId ? (await db.collection("properties").doc(propertyId).get()).data() || {} : {};
  if (text(property.ownerId || property.ownerUid || unit.ownerId, 160) !== ownerUid) throw new HttpsError("permission-denied", "This unit is not on your property.");
  return { unit, propertyId, property };
}

export function inviteState(invite: any, nowMs = Date.now()) {
  const status = text(invite?.status, 20).toLowerCase();
  if (status === "accepted") return "ACCEPTED";
  if (status === "cancelled") return "CANCELLED";
  const exp = typeof invite?.expiresAt?.toMillis === "function" ? invite.expiresAt.toMillis() : NaN;
  if (status === "expired" || (Number.isFinite(exp) && exp < nowMs)) return "EXPIRED";
  if (invite?.openedAt) return "OPENED";
  return status === "sent" ? "SENT" : "PENDING";
}

export const ownerInviteTenantToUnit = onCall(OPTS, async (request) => {
  const ownerUid = requireOwner(request.auth);
  const unitId = text(request.data?.unitId, 160);
  const tenantEmail = text(request.data?.tenantEmail, 200).toLowerCase();
  const tenantName = text(request.data?.tenantName, 120) || "Tenant";
  if (!unitId || !EMAIL.test(tenantEmail)) throw new HttpsError("invalid-argument", "unitId and a valid tenant email are required.");
  const { unit, propertyId, property } = await ownedUnit(ownerUid, unitId);
  if (text(unit.tenantId || unit.tenantUid || unit.currentTenantId, 160)) throw new HttpsError("failed-precondition", "This unit already has a linked tenant.");

  const since = Timestamp.fromMillis(Date.now() - 86_400_000);
  const recent = await db.collection("tenant_invitations").where("invitedByOwnerId", "==", ownerUid).where("createdAt", ">=", since).count().get();
  if (recent.data().count >= DAILY_LIMIT) throw new HttpsError("resource-exhausted", `You can send up to ${DAILY_LIMIT} invitations a day.`);

  const open = await db.collection("tenant_invitations").where("unitId", "==", unitId).where("status", "==", "sent").get();
  const rawToken = crypto.randomBytes(32).toString("hex");
  const inviteLink = `https://bin-groups.com/tenant-invite?token=${rawToken}`;
  const expiresAt = Timestamp.fromMillis(Date.now() + 14 * 86_400_000);
  const ref = db.collection("tenant_invitations").doc();
  const propertyName = text(property.propertyName || property.name, 160) || "your property";
  const unitNumber = text(unit.unitNumber, 40) || unitId;
  const batch = db.batch();
  open.docs.forEach((d) => batch.update(d.ref, { status: "cancelled", cancelledReason: "REPLACED_BY_OWNER_REINVITE", updatedAt: FieldValue.serverTimestamp() }));
  batch.set(ref, {
    propertyId, unitId, unitNumber, propertyName, tenantEmail, tenantName, ownerId: ownerUid, invitedByOwnerId: ownerUid,
    source: "OWNER_SELF_SERVE", inviteTokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
    status: "sent", emailStatus: "queued", sentAt: FieldValue.serverTimestamp(), expiresAt,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection("mail").doc(), {
    to: tenantEmail,
    message: {
      subject: "You are invited to the BIN GROUP Tenant Portal",
      text: `Hello ${tenantName},\n\nYour owner invited you to the BIN GROUP Tenant Portal for Unit ${unitNumber} at ${propertyName}.\n\nAccept: ${inviteLink}\n\nThis link expires in 14 days.\n\nSupport: support@bin-groups.com`,
      html: `<p>Hello ${escapeHtml(tenantName)},</p><p>Your owner invited you to the BIN GROUP Tenant Portal for Unit ${escapeHtml(unitNumber)} at ${escapeHtml(propertyName)}.</p><p><a href="${inviteLink}">Accept invitation</a></p><p>This link expires in 14 days.</p>`,
    },
    metadata: { type: "tenant_invitation", invitationId: ref.id, propertyId, unitId, createdBy: ownerUid, source: "OWNER_SELF_SERVE" },
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection("audit_logs").doc(), { action: "OWNER_INVITED_TENANT_TO_UNIT", actorId: ownerUid, actorRole: "owner", invitationId: ref.id, unitId, propertyId, replaced: open.size, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { status: "SENT", invitationId: ref.id, inviteLink, expiresAt: expiresAt.toDate().toISOString(), replaced: open.size };
});

export const ownerListTenantInvitations = onCall(OPTS, async (request) => {
  const ownerUid = requireOwner(request.auth);
  const snap = await db.collection("tenant_invitations").where("invitedByOwnerId", "==", ownerUid).limit(200).get();
  return {
    invitations: snap.docs.map((d) => {
      const v = d.data();
      return { id: d.id, unitId: v.unitId || null, unitNumber: v.unitNumber || null, tenantEmail: v.tenantEmail, tenantName: v.tenantName, state: inviteState(v), expiresAt: v.expiresAt?.toDate?.().toISOString?.() || null };
    }),
  };
});
