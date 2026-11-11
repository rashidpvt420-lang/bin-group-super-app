import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { rateLimitDocId, wouldExceedLimit } from "./whatsappPolicy";

/** Transactionally increment a rate-limit counter. Returns false when the limit is already reached. */
export async function claimRateLimit(
  db: Firestore,
  kind: "out" | "in" | "inburst",
  subject: string,
  window: string,
  limit: number,
): Promise<boolean> {
  const ref = db.doc(`whatsapp_rate_limits/${rateLimitDocId(kind, subject, window)}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = Number(snap.data()?.count || 0);
    if (wouldExceedLimit(count, limit)) return false;
    tx.set(ref, {
      kind,
      subject,
      window,
      count: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}
