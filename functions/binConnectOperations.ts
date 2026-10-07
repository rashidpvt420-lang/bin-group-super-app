import { createHash } from "node:crypto";
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type * as FirebaseFirestore from "firebase-admin/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const CHANNELS = new Set(["company_ceo", "admin_support", "owner_to_tenant", "owner_to_technician", "majlis_staff", "maintenance_chat", "feature_suggestion", "dashboard_issue"]);
const STATUSES = new Set(["open", "pending", "in_review", "assigned", "resolved"]);
const PRIORITIES = new Set(["normal", "high", "urgent"]);
const text = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
const roleOf = (claims: any) => text(claims?.role || claims?.userRole || claims?.primaryRole, 80).toLowerCase();
// Match the canonical Firestore Admin authority; profile role strings never grant access.
const hasAdminClaim = (claims: any) => {
  const role = roleOf(claims);
  return (!role && (claims?.admin === true || claims?.isAdmin === true)) ||
    claims?.superAdmin === true || claims?.super_admin === true || claims?.ceo === true ||
    ["admin", "super_admin", "ceo"].includes(role);
};

async function resolveActor(request: any) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  const token = request.auth.token || {};
  let record: admin.auth.UserRecord;
  try { record = await admin.auth().getUser(uid); }
  catch { throw new HttpsError("permission-denied", "The account could not be verified."); }
  const claims = record.customClaims || {};
  const profileSnap = await db.collection("users").doc(uid).get();
  const profile = profileSnap.data() || {};
  if (record.disabled || token.suspended === true || claims.suspended === true ||
      profile.suspended === true || profile.disabled === true ||
      ["disabled", "suspended"].includes(text(profile.status, 40).toLowerCase())) {
    throw new HttpsError("permission-denied", "This account is inactive or suspended.");
  }
  const privileged = hasAdminClaim(token) || hasAdminClaim(claims);
  if (privileged && (!hasAdminClaim(token) || !hasAdminClaim(claims) || token.email_verified !== true ||
      !token.firebase?.sign_in_second_factor || !record.emailVerified ||
      !(record.multiFactor?.enrolledFactors || []).length)) {
    throw new HttpsError("permission-denied", "Current Admin authority and a verified MFA session are required.");
  }
  return { uid, privileged, role: roleOf(claims) || roleOf(token) || "user", email: text(record.email, 320),
    displayName: text(record.displayName || profile.displayName || profile.name || record.email, 160) || "user" };
}
type Actor = Awaited<ReturnType<typeof resolveActor>>;
function assertThreadAccess(actor: Actor, thread: FirebaseFirestore.DocumentData) {
  const participants = Array.isArray(thread.participantIds) ? thread.participantIds : [];
  if (!actor.privileged && !participants.includes(actor.uid) && thread.createdBy !== actor.uid) {
    throw new HttpsError("permission-denied", "You are not a participant in this conversation.");
  }
}
function documentId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError("invalid-argument", "A valid thread is required.");
  return value;
}
function message(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 4000) throw new HttpsError("invalid-argument", "A message of up to 4,000 characters is required.");
  return value.trim();
}
function operationKey(uid: string, requestId: unknown) {
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new HttpsError("invalid-argument", "A valid request identifier is required.");
  return createHash("sha256").update(`${uid}\0${requestId}`).digest("hex");
}
const payloadHash = (payload: unknown) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");
function audit(action: string, actor: Actor, details: Record<string, unknown>) {
  return { action, actorUid: actor.uid, actorRole: actor.role, actorEmail: actor.email, source: "BIN_CONNECT", details, createdAt: FieldValue.serverTimestamp() };
}
function previousResult(snap: FirebaseFirestore.DocumentSnapshot, hash: string) {
  if (!snap.exists) return null;
  const prior = snap.data() || {};
  if (prior.requestHash !== hash) throw new HttpsError("failed-precondition", "This request identifier was already used for a different message.");
  return prior.response;
}
const millis = (value: any): number | null => typeof value?.toMillis === "function" ? value.toMillis() : null;
function publicThread(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, title: text(data.title, 200), channel: text(data.channel, 80), status: text(data.status, 40), priority: text(data.priority, 40),
    sourceRole: text(data.sourceRole, 40), createdByEmail: text(data.createdByEmail, 320), createdByName: text(data.createdByName, 160),
    recipientHint: text(data.recipientHint, 240), context: text(data.context), propertyId: text(data.propertyId, 128), unitId: text(data.unitId, 128),
    ticketId: text(data.ticketId, 128), lastMessage: text(data.lastMessage, 240), createdAtMs: millis(data.createdAt), updatedAtMs: millis(data.updatedAt || data.lastMessageAt) };
}
const options = { cors: true, region: "europe-west3", enforceAppCheck: true } as const;

export const listMyBinConnectThreads = onCall(options, async (request) => {
  const actor = await resolveActor(request);
  const requested = Number(request.data?.limit ?? 100);
  const safeLimit = Number.isFinite(requested) ? Math.max(1, Math.min(100, Math.trunc(requested))) : 100;
  const snapshot = await db.collection("binConnectThreads").where("participantIds", "array-contains", actor.uid).limit(safeLimit).get();
  const threads = snapshot.docs.map(s => publicThread(s.id, s.data())).sort((a, b) => (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0));
  return { threads };
});

export const createBinConnectThread = onCall(options, async (request) => {
  const actor = await resolveActor(request);
  const body = message(request.data?.message);
  const channel = text(request.data?.channel, 80);
  if (!CHANNELS.has(channel)) throw new HttpsError("invalid-argument", "Unsupported BIN Connect channel.");
  const key = operationKey(actor.uid, request.data?.requestId);
  const threadRef = db.collection("binConnectThreads").doc(`connect_${key}`);
  const messageRef = threadRef.collection("messages").doc("initial");
  const auditRef = db.collection("audit_logs").doc(`bin_connect_create_${key}`);
  const priority = ["dashboard_issue", "majlis_staff"].includes(channel) ? "high" : "normal";
  const context = { title: text(request.data?.title, 200) || channel.replace(/_/g, " "), recipientHint: text(request.data?.recipientHint, 240),
    context: text(request.data?.context), propertyId: text(request.data?.propertyId, 128), unitId: text(request.data?.unitId, 128), ticketId: text(request.data?.ticketId, 128) };
  const hash = payloadHash({ channel, body, ...context });
  return db.runTransaction(async tx => {
    const prior = previousResult(await tx.get(auditRef), hash);
    if (prior) return prior;
    const response = { threadId: threadRef.id, status: "open" };
    tx.set(threadRef, { ...context, channel, status: "open", sourceRole: actor.role, createdBy: actor.uid, createdByEmail: actor.email,
      createdByName: actor.displayName, participantIds: [actor.uid], lastMessage: body.slice(0, 240), priority,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastMessageAt: FieldValue.serverTimestamp() });
    tx.set(messageRef, { body, senderId: actor.uid, senderRole: actor.role, senderEmail: actor.email, senderName: actor.displayName, createdAt: FieldValue.serverTimestamp(), system: false });
    tx.set(auditRef, { ...audit("BIN_CONNECT_THREAD_CREATED", actor, { threadId: threadRef.id, channel, priority }), requestHash: hash, response });
    return response;
  });
});

export const sendBinConnectMessage = onCall(options, async (request) => {
  const actor = await resolveActor(request);
  const threadId = documentId(request.data?.threadId);
  const body = message(request.data?.message);
  const key = operationKey(actor.uid, request.data?.requestId);
  const threadRef = db.collection("binConnectThreads").doc(threadId);
  const messageRef = threadRef.collection("messages").doc(`message_${key}`);
  const auditRef = db.collection("audit_logs").doc(`bin_connect_send_${key}`);
  const hash = payloadHash({ threadId, body });
  return db.runTransaction(async tx => {
    const snap = await tx.get(threadRef);
    if (!snap.exists) throw new HttpsError("not-found", "BIN Connect conversation was not found.");
    const thread = snap.data() || {};
    assertThreadAccess(actor, thread);
    const prior = previousResult(await tx.get(auditRef), hash);
    if (prior) return prior;
    const response = { threadId, messageId: messageRef.id, status: "sent" };
    tx.set(messageRef, { body, senderId: actor.uid, senderRole: actor.role, senderEmail: actor.email, senderName: actor.displayName, createdAt: FieldValue.serverTimestamp(), system: false });
    tx.update(threadRef, { lastMessage: body.slice(0, 240), lastMessageAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      status: thread.status === "resolved" ? "open" : STATUSES.has(thread.status) ? thread.status : "open" });
    tx.set(auditRef, { ...audit("BIN_CONNECT_MESSAGE_SENT", actor, { threadId, messageId: messageRef.id }), requestHash: hash, response });
    return response;
  });
});

export const resolveBinConnectThread = onCall(options, async (request) => {
  const actor = await resolveActor(request);
  const threadId = documentId(request.data?.threadId);
  const threadRef = db.collection("binConnectThreads").doc(threadId);
  const auditRef = db.collection("audit_logs").doc();
  return db.runTransaction(async tx => {
    const snap = await tx.get(threadRef);
    if (!snap.exists) throw new HttpsError("not-found", "BIN Connect conversation was not found.");
    const thread = snap.data() || {};
    assertThreadAccess(actor, thread);
    if (thread.status !== "resolved") {
      tx.update(threadRef, { status: "resolved", updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef, audit("BIN_CONNECT_THREAD_RESOLVED", actor, { threadId }));
    }
    return { threadId, status: "resolved" };
  });
});

export const updateAdminBinConnectThread = onCall(options, async (request) => {
  const actor = await resolveActor(request);
  if (!actor.privileged) throw new HttpsError("permission-denied", "Current Admin MFA authority is required.");
  const threadId = documentId(request.data?.threadId);
  const changes: Record<string, unknown> = {};
  if (request.data?.status !== undefined) {
    if (!STATUSES.has(request.data.status)) throw new HttpsError("invalid-argument", "Unsupported conversation status.");
    changes.status = request.data.status;
  }
  if (request.data?.priority !== undefined) {
    if (!PRIORITIES.has(request.data.priority)) throw new HttpsError("invalid-argument", "Unsupported conversation priority.");
    changes.priority = request.data.priority;
  }
  if (request.data?.assignedAdminId !== undefined) {
    if (request.data.assignedAdminId !== null && request.data.assignedAdminId !== actor.uid) throw new HttpsError("permission-denied", "Assign this conversation to your own Admin account.");
    changes.assignedAdminId = request.data.assignedAdminId;
  }
  if (!Object.keys(changes).length) throw new HttpsError("invalid-argument", "A conversation update is required.");
  const threadRef = db.collection("binConnectThreads").doc(threadId);
  const auditRef = db.collection("audit_logs").doc();
  return db.runTransaction(async tx => {
    const snap = await tx.get(threadRef);
    if (!snap.exists) throw new HttpsError("not-found", "BIN Connect conversation was not found.");
    const prior = snap.data() || {};
    if (Object.entries(changes).some(([key, value]) => prior[key] !== value)) {
      tx.update(threadRef, { ...changes, updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef, audit("BIN_CONNECT_ADMIN_UPDATED", actor, { threadId, changes }));
    }
    return { threadId, ...changes };
  });
});
