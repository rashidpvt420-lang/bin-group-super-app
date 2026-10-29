import { FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

export const DASHBOARD_AI_ROLES = ["owner", "tenant", "technician", "broker"] as const;
type DashboardRole = typeof DASHBOARD_AI_ROLES[number];
export const PROPOSAL_TTL_MS = 10 * 60 * 1000;

// The AI may only propose actions from this allowlist. Each action is executed server-side,
// scoped to the caller's own uid, and only after an explicit confirm call.
export const DASHBOARD_AI_ACTIONS: Record<string, { roles: readonly DashboardRole[]; summary: string }> = {
  mark_my_notifications_read: {
    roles: DASHBOARD_AI_ROLES,
    summary: "Mark all of your unread notifications as read.",
  },
};

// Money and approval decisions are never available to the AI, whatever the role.
const FORBIDDEN_INTENT = /\b(approv\w*|reject\w*|pay|paid|payment\w*|refund\w*|cheque|cash|invoice\w*|payout\w*|commission\w*|verify|kyc|dispatch|assign\w*|delete\w*)\b/i;

export type IntentResult =
  | { kind: "action"; action: keyof typeof DASHBOARD_AI_ACTIONS }
  | { kind: "forbidden"; reason: string }
  | { kind: "none" };

export function classifyDashboardIntent(text: string): IntentResult {
  const t = String(text || "").toLowerCase();
  if (FORBIDDEN_INTENT.test(t)) {
    return {
      kind: "forbidden",
      reason: "The AI cannot approve, reject, pay, refund, verify, dispatch or delete anything. Payments by cash or cheque are confirmed only by a BIN GROUP finance admin with MFA.",
    };
  }
  if (/\b(mark|clear|read)\b/.test(t) && /\bnotification/.test(t)) {
    return { kind: "action", action: "mark_my_notifications_read" };
  }
  return { kind: "none" };
}

function callerRole(request: any): DashboardRole {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to use dashboard AI actions.");
  const role = String(request.auth?.token?.role || "").toLowerCase();
  if (!(DASHBOARD_AI_ROLES as readonly string[]).includes(role)) {
    throw new HttpsError("permission-denied", "Dashboard AI actions are available to owner, tenant, technician and broker accounts.");
  }
  return role as DashboardRole;
}

export const proposeDashboardAiAction = onCall({ cors: true, enforceAppCheck: true, timeoutSeconds: 20 }, async (request) => {
  const role = callerRole(request);
  const uid = request.auth!.uid;
  const text = String(request.data?.text || "").slice(0, 500);
  const intent = classifyDashboardIntent(text);
  if (intent.kind === "forbidden") return { proposal: null, refused: true, message: intent.reason };
  if (intent.kind === "none") return { proposal: null, refused: false };
  const spec = DASHBOARD_AI_ACTIONS[intent.action];
  if (!spec.roles.includes(role)) return { proposal: null, refused: true, message: "This action is not available for your role." };
  const db = admin.firestore();
  const ref = db.collection("ai_action_proposals").doc();
  const nowMs = Date.now();
  await ref.set({
    uid,
    role,
    action: intent.action,
    summary: spec.summary,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + PROPOSAL_TTL_MS),
  });
  return { proposal: { id: ref.id, action: intent.action, summary: spec.summary }, refused: false };
});

async function executeAction(action: string, uid: string): Promise<{ changed: number }> {
  const db = admin.firestore();
  if (action === "mark_my_notifications_read") {
    let changed = 0;
    for (const field of ["recipientId", "userId"]) {
      const snap = await db.collection("notifications").where(field, "==", uid).where("read", "==", false).limit(200).get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.update(d.ref, { read: true, readAt: FieldValue.serverTimestamp() }));
      await batch.commit();
      changed += snap.size;
    }
    return { changed };
  }
  throw new HttpsError("failed-precondition", "Unknown action.");
}

export const confirmDashboardAiAction = onCall({ cors: true, enforceAppCheck: true, timeoutSeconds: 30 }, async (request) => {
  const role = callerRole(request);
  const uid = request.auth!.uid;
  const proposalId = String(request.data?.proposalId || "");
  const decision = request.data?.decision === "cancel" ? "cancel" : "confirm";
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(proposalId)) throw new HttpsError("invalid-argument", "Invalid proposal.");
  const db = admin.firestore();
  const ref = db.collection("ai_action_proposals").doc(proposalId);
  const action = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const p = snap.data();
    if (!snap.exists || !p || p.uid !== uid) throw new HttpsError("not-found", "Proposal not found.");
    if (p.status !== "pending") throw new HttpsError("failed-precondition", "This proposal was already handled.");
    if (p.expiresAt?.toMillis?.() < Date.now()) throw new HttpsError("deadline-exceeded", "This proposal expired. Ask again.");
    const spec = DASHBOARD_AI_ACTIONS[p.action];
    if (!spec || !spec.roles.includes(role) || p.role !== role) throw new HttpsError("permission-denied", "Action not allowed.");
    tx.update(ref, { status: decision === "cancel" ? "cancelled" : "executing", decidedAt: FieldValue.serverTimestamp() });
    return String(p.action);
  });
  if (decision === "cancel") return { status: "cancelled" };
  const result = await executeAction(action, uid);
  await ref.update({ status: "executed", executedAt: FieldValue.serverTimestamp(), result });
  await db.collection("ai_action_audit").add({ uid, role, proposalId, action, result, at: FieldValue.serverTimestamp() });
  return { status: "executed", result };
});
