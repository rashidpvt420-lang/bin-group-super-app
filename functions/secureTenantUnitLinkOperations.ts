import { HttpsError, onCall } from "firebase-functions/v2/https";
import { adminResolveTenantUnitLink as legacyAdminResolveTenantUnitLink } from "./profileP1Workflows";

const text = (value: unknown) => String(value ?? "").trim();

export function assertTenantUnitLinkReviewEvidence(data: any) {
  const decision = text(data?.decision).toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'decision must be APPROVE or REJECT.');
  }
  const reason = text(data?.reason || data?.rejectionReason || data?.notes);
  if (decision === 'REJECT' && reason.length < 8) {
    throw new HttpsError(
      'invalid-argument',
      'A rejection reason of at least 8 characters is required and retained in the review history.',
    );
  }
  return { decision, reason };
}

async function runSecured(request: any) {
  const { reason } = assertTenantUnitLinkReviewEvidence(request.data);
  request.data = {
    ...(request.data || {}),
    reason: reason || null,
  };
  if (typeof (legacyAdminResolveTenantUnitLink as any)?.run !== 'function') {
    throw new HttpsError('internal', 'Tenant unit-link review handler is unavailable.');
  }
  return (legacyAdminResolveTenantUnitLink as any).run(request);
}

export const adminResolveTenantUnitLink = onCall(
  { cors: true, region: 'europe-west3', enforceAppCheck: true },
  runSecured,
);
