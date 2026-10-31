/**
 * Payout-detail change alerts (gap audit 2026-11-01, item 3).
 * Whenever an IBAN, bank name or account holder is added, changed or removed on an owner bank account
 * (ownerBankAccounts) or a broker KYC profile (broker_kyc_profiles), the server:
 *   - writes an admin-visible payout_change_alerts row (masked values only, never the full IBAN),
 *   - notifies the account holder in EN and AR ("if this was not you, contact BIN GROUP"),
 *   - emails the holder's Firebase-verified address when there is one,
 *   - writes an audit_logs row.
 * Alerts never approve, verify or block anything; payout verification gates are unchanged.
 */
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export const OWNER_BANK_FIELDS = ["iban", "bankName", "accountHolder", "accountHolderName"];
export const BROKER_BANK_FIELDS = ["bankIban", "bankName", "bankAccountHolder"];

export function maskIban(value: unknown) {
  const v = text(value, 64).replace(/\s+/g, "").toUpperCase();
  return v ? `${v.slice(0, 2)}${"*".repeat(Math.max(0, v.length - 6))}${v.slice(-4)}` : "";
}

/** Returns the changed payout fields (null when nothing payout-related changed). */
export function payoutChange(before: Record<string, any> | null, after: Record<string, any> | null, fields: string[]) {
  const changed = fields.filter((f) => text(before?.[f], 400) !== text(after?.[f], 400));
  if (!changed.length) return null;
  const kind = !before ? "ADDED" : !after ? "REMOVED" : "CHANGED";
  return { kind, changed };
}

async function verifiedEmail(uid: string) {
  try {
    const u = await admin.auth().getUser(uid);
    return u.emailVerified && !u.disabled ? text(u.email, 320) : "";
  } catch { return ""; }
}

async function raise(opts: { source: string; docId: string; eventId: string; holderUid: string; role: "owner" | "broker"; ibanField: string; before: any; after: any; fields: string[] }) {
  const change = payoutChange(opts.before, opts.after, opts.fields);
  if (!change || !opts.holderUid) return;
  const db = admin.firestore();
  const id = `${opts.source}_${opts.docId}_${opts.eventId}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300);
  const alertRef = db.collection("payout_change_alerts").doc(id);
  const title = "Your payout bank details changed";
  const titleAr = "تم تغيير بيانات حسابك البنكي للدفعات";
  const body = `Your ${change.changed.join(", ")} was ${change.kind.toLowerCase()}. If this was not you, contact BIN GROUP support immediately.`;
  const bodyAr = "تم تعديل بيانات حسابك البنكي. إذا لم تقم بذلك، تواصل مع دعم BIN GROUP فوراً.";
  const email = await verifiedEmail(opts.holderUid);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(alertRef)).exists) return;
    const now = FieldValue.serverTimestamp();
    tx.create(alertRef, {
      source: opts.source, docId: opts.docId, holderUid: opts.holderUid, holderRole: opts.role, kind: change.kind, changedFields: change.changed,
      maskedIbanBefore: maskIban(opts.before?.[opts.ibanField]), maskedIbanAfter: maskIban(opts.after?.[opts.ibanField]),
      status: "OPEN", createdAt: now,
    });
    tx.create(db.collection("notifications").doc(`payout_change_${id}`.slice(0, 300)), {
      userId: opts.holderUid, recipientId: opts.holderUid, role: opts.role, type: "PAYOUT_DETAILS_CHANGED", title, body, titleAr, bodyAr,
      link: opts.role === "owner" ? "/owner/iban" : "/broker/profile", read: false, status: "PENDING", createdAt: now, source: "PAYOUT_CHANGE_ALERT",
    });
    if (email) {
      tx.create(db.collection("mail").doc(`payout_change_${id}`.slice(0, 300)), {
        to: email, type: "PAYOUT_DETAILS_CHANGED", status: "PENDING",
        message: { subject: `[BIN GROUP] ${title}`, html: `<p>${body}</p><p dir="rtl">${bodyAr}</p>` }, createdAt: now,
      });
    }
    tx.create(db.collection("audit_logs").doc(), {
      action: "PAYOUT_DETAILS_CHANGED", actorId: "SYSTEM", targetType: opts.source, targetId: opts.docId,
      metadata: { holderUid: opts.holderUid, kind: change.kind, changedFields: change.changed, alertId: id }, createdAt: now,
    });
  });
}

export const onOwnerBankAccountChanged = onDocumentWritten({ document: "ownerBankAccounts/{accountId}", region: "europe-west3", retry: true }, async (event) => {
  const before = event.data?.before?.exists === false ? null : event.data?.before?.data() || null;
  const after = event.data?.after?.exists === false ? null : event.data?.after?.data() || null;
  const holderUid = text(after?.ownerId || after?.ownerUid || before?.ownerId || before?.ownerUid, 128);
  await raise({ source: "ownerBankAccounts", docId: event.params.accountId, eventId: text((event as any).id, 120) || String(Date.now()), holderUid, role: "owner", ibanField: "iban", before, after, fields: OWNER_BANK_FIELDS });
});

export const onBrokerPayoutDetailsChanged = onDocumentWritten({ document: "broker_kyc_profiles/{uid}", region: "europe-west3", retry: true }, async (event) => {
  const before = event.data?.before?.exists === false ? null : event.data?.before?.data() || null;
  const after = event.data?.after?.exists === false ? null : event.data?.after?.data() || null;
  await raise({ source: "broker_kyc_profiles", docId: event.params.uid, eventId: text((event as any).id, 120) || String(Date.now()), holderUid: event.params.uid, role: "broker", ibanField: "bankIban", before, after, fields: BROKER_BANK_FIELDS });
});
