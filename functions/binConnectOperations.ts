import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const CHANNELS = new Set([
  "company_ceo",
  "admin_support",
  "owner_to_tenant",
  "owner_to_technician",
  "majlis_staff",
  "maintenance_chat",
  "feature_suggestion",
  "dashboard_issue",
]);

const PRIVILEGED_ROLES = new Set([
  "admin",
  "founder",
  "super_admin",
  "operations_manager",
  "operations",
  "supervisor",
]);

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const timestampMillis = (value: unknown): number | null => {
  const maybe = value as { toMillis?: () => number } | null | undefined;
  if (typeof maybe?.toMillis === "function") return maybe.toMillis();
  return null;
};

function publicThread(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    title: text(data.title, 200),
    channel: text(data.channel, 80),
    status: text(data.status, 40),
    priority: text(data.priority, 40),
    sourceRole: text(data.sourceRole, 40),
    createdByEmail: text(data.createdByEmail, 320),
    createdByName: text(data.createdByName, 160),
    recipientHint: text(data.recipientHint, 240),
    context: text(data.context, 500),
    propertyId: text(data.propertyId, 128),
    unitId: text(data.unitId, 128),
    ticketId: text(data.ticketId, 128),
    lastMessage: text(data.lastMessage, 240),
    createdAtMs: timestampMillis(data.createdAt),
    updatedAtMs: timestampMillis(data.updatedAt || data.lastMessageAt),
  };
}

async function resolveActor(request: any) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in is required.");

  const token = request.auth?.token || {};
  let role = text(token.role, 80).toLowerCase();
  let email = text(token.email, 320).toLowerCase();
  let displayName = text(token.name, 160);

  if (!role || !email || !displayName) {
    const userSnap = await db.collection("users").doc(uid).get();
    const user = userSnap.exists ? userSnap.data() || {} : {};
    role = role || text(user.role, 80).toLowerCase();
    email = email || text(user.email, 320).toLowerCase();
    displayName = displayName || text(user.displayName || user.name, 160);
  }

  return { uid, role: role || "user", email, displayName: displayName || email || role || "user" };
}

function assertChannel(value: unknown) {
  const channel = text(value, 80);
  if (!CHANNELS.has(channel)) throw new HttpsError("invalid-argument", "Unsupported BIN Connect channel.");
  return channel;
}

function canAccessThread(actor: { uid: string; role: string }, data: FirebaseFirestore.DocumentData) {
  if (PRIVILEGED_ROLES.has(actor.role)) return true;
  const participants = Array.isArray(data.participantIds) ? data.participantIds.map(String) : [];
  return participants.includes(actor.uid) || data.createdBy === actor.uid || data.assignedAdminId === actor.uid;
}

async function writeAudit(action: string, actor: { uid: string; role: string; email: string }, details: Record<string, unknown>) {
  await db.collection("audit_logs").add({
    action,
    actorUid: actor.uid,
    actorRole: actor.role,
    actorEmail: actor.email,
    source: "BIN_CONNECT",
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const listMyBinConnectThreads = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await resolveActor(request);
    const requestedLimit = Number(request.data?.limit ?? 100);
    const safeLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
      : 100;

    const snapshot = await db
      .collection("binConnectThreads")
      .where("participantIds", "array-contains", actor.uid)
      .limit(safeLimit)
      .get();

    const threads = snapshot.docs
      .map((docSnap) => publicThread(docSnap.id, docSnap.data()))
      .sort((a, b) =>
        (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0),
      );

    return { threads };
  },
);

export const createBinConnectThread = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await resolveActor(request);
    const body = text(request.data?.message, 4000);
    if (!body) throw new HttpsError("invalid-argument", "Message is required.");
    const channel = assertChannel(request.data?.channel);

    const threadRef = db.collection("binConnectThreads").doc();
    const messageRef = threadRef.collection("messages").doc();
    const priority = channel === "dashboard_issue" || channel === "majlis_staff" ? "high" : "normal";
    const title = text(request.data?.title, 200) || channel.replace(/_/g, " ");

    const thread = {
      title,
      channel,
      status: "open",
      sourceRole: actor.role,
      createdBy: actor.uid,
      createdByEmail: actor.email,
      createdByName: actor.displayName,
      participantIds: [actor.uid],
      recipientHint: text(request.data?.recipientHint, 240),
      context: text(request.data?.context, 500),
      propertyId: text(request.data?.propertyId, 128),
      unitId: text(request.data?.unitId, 128),
      ticketId: text(request.data?.ticketId, 128),
      lastMessage: body.slice(0, 240),
      priority,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(threadRef, thread);
    batch.set(messageRef, {
      body,
      senderId: actor.uid,
      senderRole: actor.role,
      senderEmail: actor.email,
      senderName: actor.displayName,
      createdAt: FieldValue.serverTimestamp(),
      system: false,
    });
    await batch.commit();
    await writeAudit("BIN_CONNECT_THREAD_CREATED", actor, { threadId: threadRef.id, channel, priority });
    return { threadId: threadRef.id, status: "open" };
  },
);

export const sendBinConnectMessage = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await resolveActor(request);
    const threadId = text(request.data?.threadId, 128);
    const body = text(request.data?.message, 4000);
    if (!threadId || !body) throw new HttpsError("invalid-argument", "Thread and message are required.");

    const threadRef = db.collection("binConnectThreads").doc(threadId);
    const messageRef = threadRef.collection("messages").doc();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(threadRef);
      if (!snap.exists) throw new HttpsError("not-found", "BIN Connect conversation was not found.");
      const thread = snap.data() || {};
      if (!canAccessThread(actor, thread)) throw new HttpsError("permission-denied", "You are not a participant in this conversation.");

      tx.set(messageRef, {
        body,
        senderId: actor.uid,
        senderRole: actor.role,
        senderEmail: actor.email,
        senderName: actor.displayName,
        createdAt: FieldValue.serverTimestamp(),
        system: false,
      });
      tx.update(threadRef, {
        lastMessage: body.slice(0, 240),
        lastMessageAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        status: thread.status === "resolved" ? "open" : text(thread.status, 40) || "open",
      });
    });

    await writeAudit("BIN_CONNECT_MESSAGE_SENT", actor, { threadId, messageId: messageRef.id });
    return { threadId, messageId: messageRef.id, status: "sent" };
  },
);

export const resolveBinConnectThread = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await resolveActor(request);
    const threadId = text(request.data?.threadId, 128);
    if (!threadId) throw new HttpsError("invalid-argument", "Thread is required.");

    const threadRef = db.collection("binConnectThreads").doc(threadId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(threadRef);
      if (!snap.exists) throw new HttpsError("not-found", "BIN Connect conversation was not found.");
      const thread = snap.data() || {};
      if (!canAccessThread(actor, thread)) throw new HttpsError("permission-denied", "You are not a participant in this conversation.");
      tx.update(threadRef, { status: "resolved", updatedAt: FieldValue.serverTimestamp() });
    });

    await writeAudit("BIN_CONNECT_THREAD_RESOLVED", actor, { threadId });
    return { threadId, status: "resolved" };
  },
);

import type * as FirebaseFirestore from "firebase-admin/firestore";
