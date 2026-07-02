import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

// Milestone days-before-expiry at which to send notices.
// Using slice().reverse().find() to get the MOST-RECENTLY-TRIGGERED milestone
// (smallest value whose threshold the contract has crossed — e.g. if 12 days
// remain we want milestone 14, not 30 or 60).
const RENEWAL_MILESTONES = [120, 90, 60, 45, 30, 14, 7, 3, 1, 0];

function getMilestoneForDays(daysRemaining: number): number | null {
  // Find the smallest milestone that daysRemaining is still <= to.
  // E.g. daysRemaining=12 → milestones where 12<=m = [14,30,45,60,90,120] → smallest = 14.
  const triggered = RENEWAL_MILESTONES.filter((m) => daysRemaining <= m);
  if (triggered.length === 0) return null;
  return Math.min(...triggered);
}

function daysUntil(expiresAt: admin.firestore.Timestamp | null): number {
  if (!expiresAt) return Infinity;
  const now = Date.now();
  const expireMs = expiresAt.toMillis();
  return Math.ceil((expireMs - now) / (1000 * 60 * 60 * 24));
}

function asTimestamp(value: any): admin.firestore.Timestamp | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value as admin.firestore.Timestamp;
  if (value instanceof Date && !isNaN(value.getTime())) return admin.firestore.Timestamp.fromDate(value);
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new admin.firestore.Timestamp(value.seconds, value.nanoseconds ?? 0);
  }
  return null;
}

/**
 * Runs daily at 09:00 Asia/Dubai. Scans all active contracts whose expiresAt
 * is within 120 days, determines the current milestone, and sends a notice if
 * that milestone has not already been sent for this contract cycle.
 */
export const contractRenewalReminder = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: "Asia/Dubai",
    region: "europe-west3",
  },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const cutoff = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
    );

    const contractsSnap = await db
      .collection("contracts")
      .where("status", "in", ["ACTIVE", "active"])
      .where("expiresAt", "<=", cutoff)
      .get();

    if (contractsSnap.empty) {
      console.log("[RenewalReminder] No contracts within 120-day window.");
      return;
    }

    let sent = 0;
    let skipped = 0;

    for (const contractDoc of contractsSnap.docs) {
      const contract = contractDoc.data();
      const contractId = contractDoc.id;
      const expiresAt = asTimestamp(contract.expiresAt || contract.validTo || contract.effectiveTo);
      const daysRemaining = daysUntil(expiresAt);

      if (daysRemaining > 120 || daysRemaining < -30) {
        skipped++;
        continue;
      }

      const milestone = getMilestoneForDays(daysRemaining);
      if (milestone === null) {
        skipped++;
        continue;
      }

      // Check if we already sent a notice for this milestone + contract cycle.
      const noticeKey = `${contractId}_${contract.contractCycle || "INITIAL"}_M${milestone}`;
      const existingNotice = await db.collection("renewalNotices").doc(noticeKey).get();
      if (existingNotice.exists) {
        skipped++;
        continue;
      }

      const ownerId = String(contract.ownerId || contract.ownerUid || "").trim();
      const tenantId = String(contract.tenantId || contract.tenantUid || "").trim();

      // Write the notice record (idempotency key).
      await db.collection("renewalNotices").doc(noticeKey).set({
        contractId,
        ownerId,
        tenantId,
        milestone,
        daysRemaining,
        expiresAtIso: expiresAt ? expiresAt.toDate().toISOString() : null,
        cycle: contract.contractCycle || "INITIAL",
        sentAt: now,
        createdAt: now,
      });

      // Create in-app notifications for both parties.
      const notificationBase = {
        type: "CONTRACT_RENEWAL_REMINDER",
        contractId,
        milestone,
        daysRemaining,
        expiresAtIso: expiresAt ? expiresAt.toDate().toISOString() : null,
        read: false,
        createdAt: now,
      };

      const batch = db.batch();

      if (ownerId) {
        batch.set(db.collection("notifications").doc(), {
          ...notificationBase,
          recipientId: ownerId,
          recipientRole: "owner",
          title: `Contract renewal: ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`,
          body: `Your BIN GROUP service contract expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}. Visit /owner/inspections to review renewal options.`,
        });
      }

      if (tenantId) {
        batch.set(db.collection("notifications").doc(), {
          ...notificationBase,
          recipientId: tenantId,
          recipientRole: "tenant",
          title: `Lease renewal: ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`,
          body: `Your tenancy agreement expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}. Visit your portal to review renewal options.`,
        });
      }

      // Email outbox entry for external delivery (processed by mailDelivery.ts).
      const ownerEmail = String(contract.ownerEmail || "").trim();
      const tenantEmail = String(contract.tenantEmail || contract.tenantContactEmail || "").trim();

      if (ownerEmail) {
        batch.set(db.collection("mail").doc(), {
          to: ownerEmail,
          template: {
            name: "contract_renewal_reminder",
            data: {
              contractId,
              daysRemaining,
              milestone,
              role: "owner",
              expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
            },
          },
          createdAt: now,
        });
      }

      if (tenantEmail) {
        batch.set(db.collection("mail").doc(), {
          to: tenantEmail,
          template: {
            name: "contract_renewal_reminder",
            data: {
              contractId,
              daysRemaining,
              milestone,
              role: "tenant",
              expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
            },
          },
          createdAt: now,
        });
      }

      batch.set(db.collection("auditLogs").doc(), {
        action: "CONTRACT_RENEWAL_NOTICE_SENT",
        contractId,
        ownerId,
        tenantId,
        milestone,
        daysRemaining,
        noticeKey,
        createdAt: now,
      });

      await batch.commit();
      sent++;
    }

    console.log(`[RenewalReminder] Done. sent=${sent}, skipped=${skipped}, total=${contractsSnap.size}`);
  }
);
