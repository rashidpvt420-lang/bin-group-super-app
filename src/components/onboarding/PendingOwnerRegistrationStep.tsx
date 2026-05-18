import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Props = { onNext: () => void; onBack: () => void };

const normalizePhone = (value: string) => value.replace(/[^0-9+]/g, '').trim();
const readable = (value: string | undefined, fallback: string) => (!value || value.includes('.') ? fallback : value);

export default function PendingOwnerRegistrationStep({ onNext, onBack }: Props) {
  const { companyProfile, setOwnerAccount, intakeId } = useOnboardingStore();
  const { t, isRTL, lang } = useLanguage();
  const [fullName, setFullName] = useState(companyProfile.contactPerson || '');
  const [email, setEmail] = useState(companyProfile.email || '');
  const [mobile, setMobile] = useState(companyProfile.phone || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const label = (key: string, fallback: string) => readable(t(key), fallback);

  const validate = () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanMobile = normalizePhone(mobile);
    if (!fullName.trim() || !cleanEmail || !cleanMobile) return label('onboarding.error.all_fields', 'Please complete all account fields before continuing.');
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return label('onboarding.error.invalid_email', 'Enter a valid email address.');
    if (cleanMobile.length < 8) return lang === 'ar' ? 'يرجى إدخال رقم هاتف صحيح.' : 'Enter a valid mobile number.';
    return null;
  };

  const submit = async () => {
    setError(null);
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setBusy(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanMobile = normalizePhone(mobile);
    const cleanName = fullName.trim();

    try {
      const submitPendingOwnerRegistration = httpsCallable(functions, 'submitPendingOwnerRegistration');
      const result: any = await submitPendingOwnerRegistration({
        fullName: cleanName,
        email: cleanEmail,
        mobile: cleanMobile,
        intakeId: intakeId || undefined
      });

      const uid = result?.data?.uid || result?.data?.ownerRegistrationId;
      if (!uid) throw new Error('Owner registration did not return a reference id.');

      setOwnerAccount({ uid, fullName: cleanName, email: cleanEmail, mobile: cleanMobile });
      setSuccess(true);
      setTimeout(onNext, 1000);
    } catch (err: any) {
      console.error('[Owner onboarding] Pending registration failed:', err);
      if (err.code === 'functions/not-found') setError(lang === 'ar' ? 'خدمة تسجيل المالك ما زالت قيد النشر. حاول بعد اكتمال النشر.' : 'Owner registration service is still deploying. Try again after deployment completes.');
      else if (err.code === 'functions/invalid-argument') setError(err.message || label('onboarding.error.generic', 'Registration failed. Please check the details and try again.'));
      else setError(`${label('onboarding.error.generic', 'Registration failed. Please check the details and try again.')} (${err.code || err.message || 'unknown'})`);
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 800, mx: 'auto', py: 4 }}>
        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22,22,24,.8)', border: '1px solid #4ADE80', textAlign: 'center' }}>
          <Typography variant="h4" fontWeight={950} color="#fff">{label('onboarding.success_title', 'Registration Submitted')}</Typography>
          <Typography sx={{ color: '#4ADE80', mt: 2, fontWeight: 800 }}>{label('onboarding.success_locked', 'Your owner registration is pending contract/payment verification and admin approval.')}</Typography>
          <CircularProgress sx={{ mt: 4, color: binThemeTokens.gold }} />
        </Paper>
      </Box>
    );
  }

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 800, mx: 'auto', py: 2 }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight={950} color="#fff">{label('onboarding.acc_creation', 'Create Owner Account')}</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,.55)', mt: 1 }}>{label('onboarding.acc_creation_desc', 'Submit your secure owner registration to continue the contract and payment process.')}</Typography>
      </Box>
      <Paper sx={{ p: { xs: 2, md: 5 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,.65)', border: '1px solid rgba(255,255,255,.06)' }}>
        <Alert severity="info" sx={{ mb: 3 }}>{label('onboarding.acc_creation_warning', 'Your owner access will remain locked until contract/payment verification and admin approval are completed.')}</Alert>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        <Stack spacing={2.5}>
          <TextField label={label('onboarding.full_name', 'Full name')} value={fullName} onChange={(e) => setFullName(e.target.value)} fullWidth InputProps={{ sx: { color: '#fff', bgcolor: 'rgba(0,0,0,.5)', borderRadius: 2 } }} InputLabelProps={{ sx: { color: 'rgba(255,255,255,.55)' } }} />
          <TextField label={label('onboarding.mobile', 'Mobile')} value={mobile} onChange={(e) => setMobile(e.target.value)} fullWidth InputProps={{ sx: { color: '#fff', bgcolor: 'rgba(0,0,0,.5)', borderRadius: 2 } }} InputLabelProps={{ sx: { color: 'rgba(255,255,255,.55)' } }} />
          <TextField label={label('onboarding.email', 'Email')} value={email} onChange={(e) => setEmail(e.target.value)} fullWidth type="email" InputProps={{ sx: { color: '#fff', bgcolor: 'rgba(0,0,0,.5)', borderRadius: 2 } }} InputLabelProps={{ sx: { color: 'rgba(255,255,255,.55)' } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 2 }}>
            <Button variant="outlined" onClick={onBack} disabled={busy} fullWidth sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.25)', py: 1.5, borderRadius: 100, fontWeight: 950 }}>{label('onboarding.back', 'Back')}</Button>
            <Button variant="contained" onClick={submit} disabled={busy} fullWidth sx={{ bgcolor: binThemeTokens.gold, color: '#000', py: 1.5, borderRadius: 100, fontWeight: 950 }}>{busy ? <CircularProgress size={24} color="inherit" /> : label('onboarding.create_btn', 'Submit Registration')}</Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
