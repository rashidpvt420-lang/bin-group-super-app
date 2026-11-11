/**
 * Stored owner completion alerts keep asking the owner to confirm even after
 * there are 0 pending sign-offs. Rewrite that CTA when nothing is waiting.
 */

const CONFIRM_RE = /please confirm|approval needed|review and approve|confirm the resolution|please review and approve|your approval needed|approve or reject/i;
const COMPLETED_RE = /work completed|job completed|completed the (job|ticket|work)|completed ticket/i;

export function isOwnerCompletionConfirmAlert(text: unknown): boolean {
  const value = String(text ?? '');
  if (!value.trim()) return false;
  return CONFIRM_RE.test(value) || COMPLETED_RE.test(value);
}

export function formatOwnerCompletionAlert(
  text: unknown,
  pendingSignOffs: number,
  lang: 'en' | 'ar' = 'en',
): string {
  const original = String(text ?? '');
  if (pendingSignOffs > 0 || !isOwnerCompletionConfirmAlert(original)) return original;
  return lang === 'ar'
    ? 'اكتمل هذا العمل وتم تأكيده. لا توجد اعتمادات معلقة.'
    : 'This work has already been confirmed. There are no pending sign-offs.';
}
