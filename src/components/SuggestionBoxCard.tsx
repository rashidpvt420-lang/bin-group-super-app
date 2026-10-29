import { useState } from 'react';
import { Alert, Box, MenuItem, TextField } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { auth, collection, db, doc, serverTimestamp, writeBatch } from '../lib/firebase';
import { UiButton, UiCard } from './ui';

export type SuggestionRole = 'owner' | 'tenant' | 'technician' | 'broker';
export const SUGGESTION_CATEGORIES = ['new_feature', 'improvement', 'problem', 'other'] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];
export const SUGGESTION_LIMITS = { titleMin: 3, titleMax: 120, messageMin: 10, messageMax: 2000 } as const;

/** Builds the exact create payload the user_suggestions rule accepts (createdAt is set by the caller). */
export function buildSuggestionPayload(uid: string, role: SuggestionRole, category: SuggestionCategory, title: string, message: string) {
  return {
    createdBy: uid,
    role,
    category,
    title: title.trim().slice(0, SUGGESTION_LIMITS.titleMax),
    message: message.trim().slice(0, SUGGESTION_LIMITS.messageMax),
    status: 'new' as const,
    source: 'dashboard_suggestion_box' as const,
  };
}

const CATEGORY_LABELS: Record<SuggestionCategory, [string, string]> = {
  new_feature: ['New feature', 'ميزة جديدة'],
  improvement: ['Improve something', 'تحسين شيء موجود'],
  problem: ['Report a problem', 'الإبلاغ عن مشكلة'],
  other: ['Other', 'أخرى'],
};

/** Dashboard suggestion box for owners, tenants, technicians and brokers. Only BIN GROUP admins can read submissions. */
export default function SuggestionBoxCard({ role }: { role: SuggestionRole }) {
  const { isRTL, lang } = useLanguage();
  const ar = lang === 'ar';
  const t = (en: string, arText: string) => (ar ? arText : en);
  const [category, setCategory] = useState<SuggestionCategory>('new_feature');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const valid = title.trim().length >= SUGGESTION_LIMITS.titleMin && message.trim().length >= SUGGESTION_LIMITS.messageMin;

  const submit = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !valid) return;
    setState('sending');
    try {
      // One batch: the suggestion plus the per-user rate-limit stamp (rules allow one every 2 minutes).
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'user_suggestions')), { ...buildSuggestionPayload(uid, role, category, title, message), createdAt: serverTimestamp() });
      batch.set(doc(db, 'user_suggestion_limits', uid), { lastAt: serverTimestamp() });
      await batch.commit();
      setTitle('');
      setMessage('');
      setState('sent');
    } catch {
      setState('error');
    }
  };

  return (
    <UiCard isRTL={isRTL} testId={`${role}-suggestion-box`} label={t('Suggestion box', 'صندوق الاقتراحات')} title={t('Tell us what to build next', 'أخبرنا بما نضيفه لاحقاً')}>
      <Box component="form" onSubmit={(e) => { e.preventDefault(); void submit(); }} sx={{ display: 'grid', gap: 1.25, mt: 1 }}>
        <TextField select size="small" label={t('Type', 'النوع')} value={category} onChange={(e) => setCategory(e.target.value as SuggestionCategory)}>
          {SUGGESTION_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{ar ? CATEGORY_LABELS[c][1] : CATEGORY_LABELS[c][0]}</MenuItem>)}
        </TextField>
        <TextField size="small" label={t('Short title', 'عنوان قصير')} value={title} onChange={(e) => { setTitle(e.target.value); if (state !== 'sending') setState('idle'); }} inputProps={{ maxLength: SUGGESTION_LIMITS.titleMax }} />
        <TextField multiline minRows={3} label={t('Your suggestion', 'اقتراحك')} value={message} onChange={(e) => { setMessage(e.target.value); if (state !== 'sending') setState('idle'); }} inputProps={{ maxLength: SUGGESTION_LIMITS.messageMax }} helperText={t('Only the BIN GROUP team can read this.', 'فريق BIN GROUP فقط يمكنه قراءة هذا.')} />
        {state === 'sent' && <Alert severity="success">{t('Thank you. Your suggestion was sent to the BIN GROUP team.', 'شكراً لك. تم إرسال اقتراحك إلى فريق BIN GROUP.')}</Alert>}
        {state === 'error' && <Alert severity="error">{t('Your suggestion could not be sent. You can send one suggestion every 2 minutes. Please try again shortly.', 'تعذر إرسال اقتراحك. يمكنك إرسال اقتراح واحد كل دقيقتين. حاول مرة أخرى بعد قليل.')}</Alert>}
        <UiButton type="submit" tone="primary" disabled={!valid || state === 'sending'}>{state === 'sending' ? t('Sending…', 'جارٍ الإرسال…') : t('Send suggestion', 'إرسال الاقتراح')}</UiButton>
      </Box>
    </UiCard>
  );
}
