// Plain-language EN/AR labels for AI Design workflow states (audit 2026-11-04).
// Owners must never see raw enum codes such as AI_CONCEPT_READY or WAITING_PAYMENT.
type Label = { en: string; ar: string };

export const DESIGN_STATUS_LABELS: Record<string, Label> = {
  DRAFT: { en: 'Draft', ar: 'مسودة' },
  AI_CONCEPT_READY: { en: 'Design options ready - pick one', ar: 'خيارات التصميم جاهزة - اختر واحدًا' },
  BROKER_CONCEPT_READY: { en: 'Marketing design ready', ar: 'تصميم التسويق جاهز' },
  AWAITING_OWNER_APPROVAL: { en: 'Waiting for owner approval', ar: 'بانتظار موافقة المالك' },
  PENDING_OWNER_NOC: { en: 'Waiting for owner NOC', ar: 'بانتظار عدم ممانعة المالك' },
  OWNER_APPROVED_TENANT_TO_PAY: { en: 'Approved - tenant pays deposit', ar: 'تمت الموافقة - المستأجر يدفع العربون' },
  OWNER_APPROVED_OWNER_TO_PAY: { en: 'Approved - owner pays deposit', ar: 'تمت الموافقة - المالك يدفع العربون' },
  DEPOSIT_PENDING: { en: 'Deposit not paid yet', ar: 'لم يُدفع العربون بعد' },
  PAYMENT_PENDING: { en: 'Payment being checked by admin', ar: 'الدفع قيد مراجعة الإدارة' },
  PAYMENT_SUBMITTED: { en: 'Payment submitted', ar: 'تم تقديم الدفع' },
  PAID: { en: 'Deposit confirmed', ar: 'تم تأكيد العربون' },
  ENGINEER_REVIEW: { en: 'With engineer for review', ar: 'لدى المهندس للمراجعة' },
  ADMIN_REVIEW: { en: 'With admin for review', ar: 'لدى الإدارة للمراجعة' },
  WORK_ORDER_READY: { en: 'Work order ready', ar: 'أمر العمل جاهز' },
  EXECUTION_READY: { en: 'Work is done and ready for handover', ar: 'العمل اكتمل وجاهز للتسليم' },
  CHOICE_REVISION_PENDING: { en: 'Confirm the chosen design again', ar: 'يلزم تأكيد التصميم المختار من جديد' },
  READY_FOR_HANDOVER: { en: 'Ready for handover', ar: 'جاهز للتسليم' },
  AWAITING_CHOICE_REVISION: { en: 'Waiting for the chosen design to be confirmed', ar: 'بانتظار تأكيد التصميم المختار' },
  AWAITING_ADMIN_HANDOFF: { en: 'Waiting for admin to send it to the engineer', ar: 'بانتظار إرسال الإدارة إلى المهندس' },
  PAYMENT_VERIFIED: { en: 'Deposit verified', ar: 'تم التحقق من العربون' },
  OWNER_REJECTED: { en: 'Rejected by owner', ar: 'رفضه المالك' },
  REJECTED: { en: 'Rejected', ar: 'مرفوض' },
  FAILED: { en: 'Design images could not be created', ar: 'تعذر إنشاء صور التصميم' },
  IMAGES_NOT_READY: { en: 'Design images not ready', ar: 'صور التصميم غير جاهزة' },
  PAYMENT_NOT_STARTED: { en: 'Payment not started', ar: 'لم يبدأ الدفع' },
  REQUEST_CREATED: { en: 'Request received', ar: 'تم استلام الطلب' },
  WAITING_PAYMENT: { en: 'Waiting for deposit', ar: 'بانتظار العربون' },
  READY_FOR_SCOPE_REVIEW: { en: 'Ready for scope review', ar: 'جاهز لمراجعة النطاق' },
  AI_RENDER_COMPLETE: { en: 'Design images ready', ar: 'صور التصميم جاهزة' },
  AI_RENDER_IN_PROGRESS: { en: 'Creating design images', ar: 'جارٍ إنشاء صور التصميم' },
  AI_RENDER_FAILED: { en: 'Design images could not be created', ar: 'تعذر إنشاء صور التصميم' },
};

export function designStatusLabel(status: unknown, lang: 'en' | 'ar' = 'en'): string {
  const key = String(status || 'DRAFT').trim().toUpperCase();
  const known = DESIGN_STATUS_LABELS[key];
  if (known) return known[lang];
  // Unknown code: readable sentence case, never the raw underscore enum.
  const words = key.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * An "options ready" state is only honest when generated images actually exist.
 * Otherwise the owner sees "Design images not ready" instead of AI_CONCEPT_READY.
 */
export function honestDesignStatus(status: unknown, generatedImageCount: number): string {
  const key = String(status || 'DRAFT').trim().toUpperCase();
  if (['AI_CONCEPT_READY', 'BROKER_CONCEPT_READY'].includes(key) && generatedImageCount < 1) return 'IMAGES_NOT_READY';
  return key;
}
