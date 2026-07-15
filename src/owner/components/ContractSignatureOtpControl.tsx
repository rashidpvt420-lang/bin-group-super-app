import React, { useEffect, useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Props = {
  contractId: string;
  contractHash: string;
  email: string;
  propertyName?: string;
  signatureName: string;
  onVerified: (verificationId: string | null) => void;
};

export default function ContractSignatureOtpControl({
  contractId,
  contractHash,
  email,
  propertyName,
  signatureName,
  onVerified,
}: Props) {
  const { lang, isRTL } = useLanguage();
  const [requestId, setRequestId] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const copy = (en: string, ar: string) => (lang === 'ar' ? ar : en);

  useEffect(() => {
    setRequestId('');
    setOtp('');
    setVerified(false);
    setError('');
    onVerified(null);
  }, [contractId, contractHash, signatureName, onVerified]);

  const requestOtp = async () => {
    if (!contractId || !contractHash || !email || !signatureName.trim()) {
      setError(copy('Enter your legal signature name before requesting the OTP.', 'أدخل اسم التوقيع القانوني قبل طلب رمز التحقق.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const callable = httpsCallable(functions, 'requestContractSignatureOtp');
      const result = await callable({
        contractId,
        contractHash,
        email,
        propertyName: propertyName || 'BIN GROUP contract',
      });
      const data = result.data as { requestId?: string };
      if (!data.requestId) throw new Error('OTP request reference was not returned.');
      setRequestId(data.requestId);
      setOtp('');
      setVerified(false);
      onVerified(null);
    } catch (err: any) {
      setError(err?.message || copy('OTP delivery failed.', 'تعذر إرسال رمز التحقق.'));
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!requestId || !/^\d{6}$/.test(otp)) {
      setError(copy('Enter the 6-digit OTP sent to your email.', 'أدخل رمز التحقق المكون من 6 أرقام المرسل إلى بريدك الإلكتروني.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const callable = httpsCallable(functions, 'verifyContractSignatureOtp');
      const result = await callable({ requestId, otp, signature: signatureName.trim() });
      const data = result.data as { verificationId?: string };
      if (!data.verificationId) throw new Error('OTP verification evidence was not returned.');
      setVerified(true);
      onVerified(data.verificationId);
    } catch (err: any) {
      setVerified(false);
      onVerified(null);
      setError(err?.message || copy('OTP verification failed.', 'فشل التحقق من الرمز.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1.5} sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>
        {copy(
          'Verify the signature through the OTP sent to your authenticated email. The contract cannot be signed without this server evidence.',
          'تحقق من التوقيع عبر الرمز المرسل إلى بريدك الإلكتروني المسجل. لا يمكن توقيع العقد دون هذا الإثبات من الخادم.',
        )}
      </Typography>
      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5}>
        <Button
          variant="outlined"
          disabled={busy || !contractId || !contractHash || !signatureName.trim()}
          onClick={requestOtp}
          sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}
        >
          {copy(requestId ? 'RESEND OTP' : 'SEND CONTRACT OTP', requestId ? 'إعادة إرسال الرمز' : 'إرسال رمز العقد')}
        </Button>
        {requestId && (
          <>
            <TextField
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              label={copy('6-digit OTP', 'رمز التحقق من 6 أرقام')}
              inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code' }}
              InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }}
              InputProps={{ style: { color: '#fff' } }}
            />
            <Button
              variant="contained"
              disabled={busy || otp.length !== 6 || verified}
              onClick={verifyOtp}
              sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}
            >
              {verified ? copy('OTP VERIFIED', 'تم التحقق') : copy('VERIFY OTP', 'تحقق من الرمز')}
            </Button>
          </>
        )}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {verified && <Alert severity="success">{copy('Signature OTP verified.', 'تم التحقق من رمز توقيع العقد.')}</Alert>}
    </Stack>
  );
}
