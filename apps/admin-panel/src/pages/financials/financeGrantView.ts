// Pure helpers for the Finance grants screen (unit tested). They only explain and disable; the
// callables adminRequestFinanceRoleAssignment / adminApproveFinanceRoleAssignment /
// adminRejectFinanceRoleAssignment remain the authority.

export const FINANCE_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
export const FINANCE_REGRANT_ACTION = 'REGRANT_FINANCE_AUTHORITY';

export type GrantViewer = { uid: string; role: string; canRequest: boolean; canApprove: boolean };
export type PendingGrant = {
  authorizationId: string;
  actionType: string;
  targetUid: string;
  targetEmail: string;
  targetDisplayName?: string;
  targetRole: string;
  previousRole: string;
  requesterId: string;
  requesterEmail: string;
  requesterRole: string;
  createdAtMs: number | null;
  expiresAtMs: number | null;
  isExpired: boolean;
  viewerIsRequester: boolean;
  viewerIsTarget: boolean;
  viewerCanApprove: boolean;
  viewerCanReject: boolean;
};
export type FinanceAccount = {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  active: boolean;
  explicitClaim: boolean;
  totpEnrolled: boolean;
  financeApprovalPending: boolean;
  grantedAtMs: number | null;
  grantAgeMs: number | null;
  grantExpiresAtMs: number | null;
  grantFresh: boolean;
  pendingRegrant: boolean;
  viewerIsTarget: boolean;
  viewerCanRequestRegrant: boolean;
};

type Copy = (en: string, ar: string) => string;

/** Why the Approve button is disabled for this viewer, or '' when it is allowed. Mirrors the server. */
export function approveBlockReason(grant: PendingGrant, viewer: GrantViewer | null, mfaVerified: boolean, nowMs: number, t: Copy): string {
  if (!mfaVerified) return t('Sign in again with MFA before approving.', 'سجّل الدخول مجدداً بالتحقق الثنائي قبل الموافقة.');
  if (!viewer?.canApprove) return t('Only a Super Admin, CEO or Finance Controller can approve.', 'الموافقة متاحة فقط للمشرف العام أو الرئيس التنفيذي أو المراقب المالي.');
  if (grant.viewerIsRequester || grant.requesterId === viewer.uid) return t('You requested this. A different person must approve it.', 'أنت من قدّم هذا الطلب. يجب أن يوافق عليه شخص آخر.');
  if (grant.viewerIsTarget || grant.targetUid === viewer.uid) return t('You cannot approve a grant for your own account.', 'لا يمكنك الموافقة على صلاحية لحسابك.');
  if (grant.isExpired || grant.expiresAtMs === null || nowMs >= grant.expiresAtMs) return t('This request expired after 24 hours. Ask for a new one.', 'انتهت صلاحية الطلب بعد 24 ساعة. اطلب طلباً جديداً.');
  return '';
}

/** Why Reject is disabled ('' when allowed). The server lets the target reject but never the requester. */
export function rejectBlockReason(grant: PendingGrant, viewer: GrantViewer | null, mfaVerified: boolean, nowMs: number, t: Copy): string {
  if (!mfaVerified) return t('Sign in again with MFA before rejecting.', 'سجّل الدخول مجدداً بالتحقق الثنائي قبل الرفض.');
  if (!viewer?.canApprove) return t('Only a Super Admin, CEO or Finance Controller can reject.', 'الرفض متاح فقط للمشرف العام أو الرئيس التنفيذي أو المراقب المالي.');
  if (grant.viewerIsRequester || grant.requesterId === viewer.uid) return t('You requested this. A different person must review it.', 'أنت من قدّم هذا الطلب. يجب أن يراجعه شخص آخر.');
  if (grant.isExpired || grant.expiresAtMs === null || nowMs >= grant.expiresAtMs) return t('This request already expired.', 'انتهت صلاحية هذا الطلب.');
  return '';
}

/** Why "Request re-grant" is disabled ('' when allowed). */
export function regrantBlockReason(account: FinanceAccount, viewer: GrantViewer | null, mfaVerified: boolean, t: Copy): string {
  if (!mfaVerified) return t('Sign in again with MFA before requesting.', 'سجّل الدخول مجدداً بالتحقق الثنائي قبل الطلب.');
  if (!viewer?.canRequest) return t('Only a Super Admin or CEO can request a Finance grant.', 'طلب صلاحية المالية متاح فقط للمشرف العام أو الرئيس التنفيذي.');
  if (account.viewerIsTarget || account.uid === viewer.uid) return t('You cannot request a grant for yourself.', 'لا يمكنك طلب صلاحية لنفسك.');
  if (!account.active) return t('The account is suspended or disabled. Use the reactivation flow.', 'الحساب موقوف أو معطّل. استخدم مسار إعادة التفعيل.');
  if (!account.explicitClaim) return t('The account has no explicit Finance claim yet. Use the assignment flow.', 'لا يملك الحساب صلاحية مالية صريحة بعد. استخدم مسار التعيين.');
  if (account.pendingRegrant) return t('A re-grant is already waiting for approval.', 'يوجد طلب تجديد بانتظار الموافقة.');
  return '';
}

export function formatDuration(ms: number | null, t: Copy): string {
  if (ms === null || !Number.isFinite(ms)) return t('unknown', 'غير معروف');
  const negative = ms < 0;
  const totalMinutes = Math.floor(Math.abs(ms) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const text = hours > 0 ? t(`${hours}h ${minutes}m`, `${hours} س ${minutes} د`) : t(`${minutes}m`, `${minutes} د`);
  return negative ? t(`${text} ago`, `منذ ${text}`) : text;
}

export function formatDubaiTime(ms: number | null, isRTL: boolean): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const formatted = new Date(ms).toLocaleString(isRTL ? 'ar-AE' : 'en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatted} ${isRTL ? '(بتوقيت دبي)' : '(Dubai)'}`;
}

export function roleLabel(role: string, t: Copy): string {
  switch (role) {
    case 'finance_admin': return t('Finance Admin', 'مسؤول المالية');
    case 'finance_manager': return t('Finance Manager', 'مدير المالية');
    case 'finance_controller': return t('Finance Controller', 'المراقب المالي');
    case 'super_admin': return t('Super Admin', 'المشرف العام');
    case 'ceo': return t('CEO', 'الرئيس التنفيذي');
    default: return role ? role.replace(/_/g, ' ') : t('unknown', 'غير معروف');
  }
}

export function actionLabel(actionType: string, t: Copy): string {
  switch (actionType) {
    case FINANCE_REGRANT_ACTION: return t('Re-grant (refresh 24h authorization)', 'تجديد (تحديث تفويض 24 ساعة)');
    case 'REACTIVATE_STAFF':
    case 'RESTORE_AUTHORITY': return t('Reactivate Finance approver', 'إعادة تفعيل معتمد مالي');
    case 'DEMOTE_STAFF':
    case 'REVOKE_AUTHORITY':
    case 'DEMOTE_FINANCE_APPROVER':
    case 'REVOKE_FINANCE_APPROVER': return t('Remove Finance authority', 'إزالة الصلاحية المالية');
    default: return t('Assign Finance role', 'تعيين دور مالي');
  }
}
