import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

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

export const listMyBinConnectThreads = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in is required.");

    const requestedLimit = Number(request.data?.limit ?? 100);
    const safeLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
      : 100;

    const snapshot = await db
      .collection("binConnectThreads")
      .where("participantIds", "array-contains", uid)
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

import type * as FirebaseFirestore from "firebase-admin/firestore";
