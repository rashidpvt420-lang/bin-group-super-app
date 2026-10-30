import { binThemeTokens } from '../theme/binGroupTheme';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, FormControlLabel, Link, Stack, TextField, Typography } from '@mui/material';
import { auth, db, doc, getDoc, serverTimestamp, setDoc } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';

export default function AccountPrivacyRequestPage() {
  const navigate = useNavigate();
  const { isRTL, lang } = useLanguage();
  const [notes, setNotes] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);
  const [alreadyRequested, setAlreadyRequested] = React.useState(false);
  const user = auth.currentUser;
  const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);

  const submitRequest = async () => {
    if (!user) {
      setError(label('You must be signed in to send this request.', 'يجب تسجيل الدخول لإرسال هذا الطلب.'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      // One request per account, keyed by the user's own uid (Firestore rules enforce this).
      // The request is only recorded for admin review; nothing is deleted automatically.
      const ref = doc(db, 'accountDeletionRequests', user.uid);
      const existing = await getDoc(ref).catch(() => null);
      if (existing?.exists()) {
        setAlreadyRequested(true);
        setSubmitted(true);
        return;
      }
      await setDoc(ref, {
        userId: user.uid,
        email: user.email || '',
        notes: notes.trim().slice(0, 1000),
        status: 'pending_review',
        source: 'in_app_account_deletion',
        requestedAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || label('Could not submit request. Try again or contact support.', 'تعذر إرسال الطلب. حاول مرة أخرى أو تواصل مع الدعم.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ minHeight: '100dvh', bgcolor: '#F8F9FB', py: { xs: 3, md: 6 }, px: 2 }}>
      <Card sx={{ maxWidth: 760, mx: 'auto', borderRadius: 4, border: '1px solid #E5E7EB', boxShadow: '0 18px 50px rgba(17,24,39,0.08)' }}>
        <CardContent sx={{ p: { xs: 3, md: 5 } }}>
          <Stack spacing={3}>
            <Button
              type="button"
              variant="text"
              aria-label={label('Back', 'رجوع')}
              onClick={() => navigate(-1)}
              sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', minWidth: 0, px: 0.5, color: '#667085', fontWeight: 900 }}
            >
              {label('← Back', 'رجوع →')}
            </Button>
            <Box>
              <Typography variant="overline" sx={{ color: '#B8932F', fontWeight: 950, letterSpacing: 2 }}>
                {label('ACCOUNT & PRIVACY', 'الحساب والخصوصية')}
              </Typography>
              <Typography variant="h4" sx={{ color: '#111827', fontWeight: 950, mt: 1 }}>
                {label('Request account deletion', 'طلب حذف الحساب')}
              </Typography>
              <Typography sx={{ color: '#667085', fontWeight: 700, mt: 1.5, lineHeight: 1.8 }}>
                {label(
                  'Ask BIN GROUP to delete your account and personal data. We verify your identity first and complete verified requests within 30 days. Your data is not deleted immediately. Contract, invoice, payment, dispute, audit, and legal evidence records may be retained when required by UAE law or contract.',
                  'اطلب من BIN GROUP حذف حسابك وبياناتك الشخصية. نتحقق من هويتك أولاً وننفذ الطلبات الموثقة خلال 30 يوماً. لا يتم حذف بياناتك فوراً. قد يتم الاحتفاظ بسجلات العقود والفواتير والمدفوعات والنزاعات والتدقيق والأدلة القانونية عندما يتطلب القانون الإماراتي أو العقد ذلك.'
                )}
              </Typography>
              <Typography sx={{ color: '#667085', fontWeight: 700, mt: 1 }}>
                <Link href="/delete-account" target="_blank" rel="noopener">{label('How account deletion works', 'كيف يتم حذف الحساب')}</Link>
              </Typography>
            </Box>

            {submitted ? (
              <Alert severity="success" sx={{ fontWeight: 800 }}>
                {alreadyRequested
                  ? label('We already have an account deletion request for your account. It is waiting for review; no further action is needed.', 'لدينا بالفعل طلب حذف لحسابك قيد المراجعة. لا حاجة لأي إجراء إضافي.')
                  : label('Your request was submitted for review. We will contact you through your registered email to verify your identity, and complete verified requests within 30 days.', 'تم إرسال طلبك للمراجعة. سنتواصل معك عبر بريدك المسجل للتحقق من هويتك وننفذ الطلبات الموثقة خلال 30 يوماً.')}
              </Alert>
            ) : (
              <>
                <TextField
                  label={label('Notes optional', 'الملاحظات اختيارية')}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  multiline
                  minRows={4}
                  fullWidth
                />
                <FormControlLabel
                  control={<Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />}
                  label={label('I understand this asks BIN GROUP to permanently delete my account and personal data.', 'أفهم أن هذا يطلب من BIN GROUP حذف حسابي وبياناتي الشخصية نهائياً.')}
                />
                {error && <Alert severity="error">{error}</Alert>}
                <Button
                  variant="contained"
                  color="error"
                  disabled={submitting || !confirmed}
                  onClick={submitRequest}
                  sx={{ alignSelf: isRTL ? 'flex-start' : 'flex-end', borderRadius: 3, fontWeight: 950, px: 3, py: 1.2 }}
                >
                  {submitting ? <CircularProgress size={20} sx={{ color: binThemeTokens.textPrimary }} /> : label('Submit account deletion request', 'إرسال طلب حذف الحساب')}
                </Button>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
