import React from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { addDoc, auth, collection, db, serverTimestamp } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';

export default function AccountPrivacyRequestPage() {
  const { isRTL, lang } = useLanguage();
  const [notes, setNotes] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState('');
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
      await addDoc(collection(db, 'pilotFeedback'), {
        status: 'new',
        type: 'ACCOUNT_DATA_CLOSURE_REQUEST',
        priority: 'STORE_COMPLIANCE',
        userId: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        notes: notes.trim(),
        requestedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        source: 'in_app_account_privacy_page',
        reviewState: 'PENDING_ADMIN_REVIEW',
        legalNote: 'Some records may be retained where required for contracts, invoices, payments, fraud prevention, dispute evidence, audit trail, or UAE legal/compliance obligations.',
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
            <Box>
              <Typography variant="overline" sx={{ color: '#B8932F', fontWeight: 950, letterSpacing: 2 }}>
                {label('ACCOUNT & PRIVACY', 'الحساب والخصوصية')}
              </Typography>
              <Typography variant="h4" sx={{ color: '#111827', fontWeight: 950, mt: 1 }}>
                {label('Request account and data review', 'طلب مراجعة الحساب والبيانات')}
              </Typography>
              <Typography sx={{ color: '#667085', fontWeight: 700, mt: 1.5, lineHeight: 1.8 }}>
                {label(
                  'Use this page to request account closure or personal data review. BIN GROUP will review the request and process it where legally possible. Contract, invoice, payment, dispute, audit, and legal evidence records may be retained when required by law or business obligations.',
                  'استخدم هذه الصفحة لطلب إغلاق الحساب أو مراجعة البيانات الشخصية. ستقوم BIN GROUP بمراجعة الطلب وتنفيذه حيثما يسمح القانون. قد يتم الاحتفاظ بسجلات العقود والفواتير والمدفوعات والنزاعات والتدقيق والأدلة القانونية عند الحاجة قانونياً أو تشغيلياً.'
                )}
              </Typography>
            </Box>

            {submitted ? (
              <Alert severity="success" sx={{ fontWeight: 800 }}>
                {label('Your request was submitted for admin review. You will be contacted through your registered email if verification is required.', 'تم إرسال طلبك للمراجعة الإدارية. سيتم التواصل معك عبر بريدك المسجل إذا كانت هناك حاجة للتحقق.')}
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
                {error && <Alert severity="error">{error}</Alert>}
                <Button
                  variant="contained"
                  color="error"
                  disabled={submitting}
                  onClick={submitRequest}
                  sx={{ alignSelf: isRTL ? 'flex-start' : 'flex-end', borderRadius: 3, fontWeight: 950, px: 3, py: 1.2 }}
                >
                  {submitting ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : label('Submit account privacy request', 'إرسال طلب الخصوصية')}
                </Button>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
