export type BrokerDocumentState = 'missing' | 'pending' | 'verified';

type BrokerReadinessSummary = {
  payout?: { eligible?: boolean; blockReasons?: string[] };
  kyc?: { profileCompletionScore?: number; reraVerified?: boolean; ibanVerified?: boolean; approvalBound?: boolean };
} | null | undefined;

/** ELIGIBLE is only shown when the server says so AND a real KYC score exists. A 0% profile is not eligible. */
export function brokerPayoutDisplayEligible(summary: BrokerReadinessSummary): boolean {
  if (!summary?.payout?.eligible) return false;
  if ((summary.payout.blockReasons || []).length > 0) return false;
  const score = Number(summary.kyc?.profileCompletionScore || 0);
  if (!(score > 0)) return false;
  if (summary.kyc?.reraVerified !== true || summary.kyc?.ibanVerified !== true) return false;
  return true;
}

/** Document vault level follows actual uploads and verifications. It is not a fixed LEVEL 2 badge. */
export function brokerDocumentLevelLabel(statuses: BrokerDocumentState[]): string {
  const total = statuses.length;
  const verified = statuses.filter((status) => status === 'verified').length;
  const uploaded = statuses.filter((status) => status !== 'missing').length;
  if (total > 0 && verified === total) return 'LEVEL 2 VERIFIED';
  if (uploaded === 0) return 'LEVEL 0 — DOCUMENTS MISSING';
  if (verified === 0) return `LEVEL 1 — ${uploaded} OF ${total} UPLOADED`;
  return `LEVEL 2 IN PROGRESS — ${verified} OF ${total} VERIFIED`;
}
