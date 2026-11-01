// Client-side precheck mirroring functions/paintingFinanceApprover.ts. It only decides whether the page
// should call financeListPaintingInvoices; the server gate (App Check, role, MFA, active account) stays
// authoritative. Admins without a Finance role see an explanation instead of triggering a 403.
export const PAINTING_FINANCE_ROLES = new Set(['finance_manager', 'finance_controller']);

export function canReviewPaintingPayments(claims: Record<string, unknown> | null | undefined): boolean {
  if (!claims) return false;
  const role = String(claims.role || claims.financeRole || '').trim().toLowerCase();
  if (!PAINTING_FINANCE_ROLES.has(role) || claims.suspended === true) return false;
  if (claims.email_verified !== true) return false;
  const fb = claims.firebase && typeof claims.firebase === 'object' ? (claims.firebase as Record<string, unknown>) : {};
  return Boolean(fb.sign_in_second_factor);
}
