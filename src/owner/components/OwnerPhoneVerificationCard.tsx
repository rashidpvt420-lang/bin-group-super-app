import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { PhoneAuthProvider, RecaptchaVerifier, updatePhoneNumber } from 'firebase/auth';
import { BadgeCheck, MessageSquareText, RefreshCw } from 'lucide-react';
import { auth, functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Props = {
  currentPhone?: string;
  isRTL: boolean;
  lang: string;
  onVerified: (phone: string) => void;
};

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };

const normalizePhone = (value: string) => {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '');
  if (!raw) return '';
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  if (raw.startsWith('05') && raw.length === 10) return `+971${raw.slice(1)}`;
  return raw.startsWith('+') ? raw : `+${raw}`;
};

export default function OwnerPhoneVerificationCard({ currentPhone = '', isRTL, lang, onVerified }: Props) {
  const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [targetPhone, setTargetPhone] = useState(currentPhone);
  const [sentPhone, setSentPhone] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [challengeUid, setChallengeUid] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaId = 'owner-phone-recaptcha';

  useEffect(() => {
    if (!verificationId) setTargetPhone(currentPhone || '');
  }, [currentPhone, verificationId]);

  useEffect(() => () => {
    verifierRef.current?.clear();
    verifierRef.current = null;
  }, []);

  const clearChallenge = () => {
    setVerificationId('');
    setChallengeUid('');
    setSentPhone('');
    setOtp('');
  };

  const syncVerifiedPhone = async () => {
    const syncPhone = httpsCallable(functions, 'syncVerifiedOwnerPhone');
    const result = await syncPhone({});
    const data = result.data as { phoneNumber?: string };
    const verifiedPhone = normalizePhone(data.phoneNumber || auth.currentUser?.phoneNumber || '');
    if (!verifiedPhone) throw new Error('VERIFIED_PHONE_SYNC_EMPTY');
    setTargetPhone(verifiedPhone);
    onVerified(verifiedPhone);
    return verifiedPhone;
  };

  const requestOtp = async () => {
    const normalized = normalizePhone(targetPhone);
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setNotice({ type: 'warning', text: label('Enter a valid international phone number, for example +9715XXXXXXXX.', 'أدخل رقم هاتف دولي صالح، مثل +9715XXXXXXXX.') });
      return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setNotice({ type: 'error', text: label('Owner login is required before phone verification.', 'يجب تسجيل دخول المالك قبل التحقق من الهاتف.') });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      if (normalizePhone(currentUser.phoneNumber || '') === normalized) {
        const verifiedPhone = await syncVerifiedPhone();
        setNotice({ type: 'success', text: label(`Firebase Auth phone ${verifiedPhone} is synchronized.`, `تمت مزامنة رقم Firebase Auth ${verifiedPhone}.`) });
        return;
      }

      verifierRef.current?.clear();
      auth.languageCode = isRTL ? 'ar' : 'en';
      verifierRef.current = new RecaptchaVerifier(auth, recaptchaId, {
        size: 'invisible',
      });
      const provider = new PhoneAuthProvider(auth);
      const id = await provider.verifyPhoneNumber(normalized, verifierRef.current);
      setVerificationId(id);
      setChallengeUid(currentUser.uid);
      setSentPhone(normalized);
      setOtp('');
      setNotice({ type: 'info', text: label(`SMS verification code sent to ${normalized}.`, `تم إرسال رمز التحقق برسالة نصية إلى ${normalized}.`) });
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
      const message = code === 'auth/too-many-requests'
        ? label('Too many SMS attempts. Try again later.', 'عدد محاولات الرسائل النصية كبير. حاول لاحقاً.')
        : label('Could not send the Firebase phone verification code.', 'تعذر إرسال رمز التحقق من الهاتف عبر Firebase.');
      setNotice({ type: 'error', text: message });
      clearChallenge();
    } finally {
      verifierRef.current?.clear();
      verifierRef.current = null;
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !verificationId || !/^\d{6}$/.test(otp)) return;
    if (!challengeUid || currentUser.uid !== challengeUid) {
      clearChallenge();
      setNotice({ type: 'error', text: label('The authenticated Owner changed. Request a new SMS challenge.', 'تغيّر حساب المالك المصادق عليه. اطلب تحدي رسالة نصية جديداً.') });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, otp);
      await updatePhoneNumber(currentUser, credential);
      await currentUser.reload();
      await currentUser.getIdToken(true);
      const verifiedPhone = await syncVerifiedPhone();
      clearChallenge();
      setNotice({ type: 'success', text: label(`Phone ${verifiedPhone} is verified and saved.`, `تم توثيق الرقم ${verifiedPhone} وحفظه.`) });
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
      const message = code === 'auth/requires-recent-login'
        ? label('For security, sign out and sign in again before changing the phone.', 'لأسباب أمنية، سجّل الخروج ثم الدخول مجدداً قبل تغيير الهاتف.')
        : code === 'auth/invalid-verification-code'
          ? label('The SMS verification code is incorrect.', 'رمز التحقق المرسل غير صحيح.')
          : label('Phone verification failed.', 'فشل التحقق من الهاتف.');
      setNotice({ type: 'error', text: message });
    } finally {
      setBusy(false);
    }
  };

  const resetChallenge = () => {
    clearChallenge();
    setNotice(null);
  };

  return (
    <Paper data-testid="owner-phone-verification-card" sx={{ p: 3, mt: 3, borderRadius: 4, border: `1px solid ${binThemeTokens.gold}55`, bgcolor: 'rgba(198,167,94,0.06)' }}>
      <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <BadgeCheck size={22} color={binThemeTokens.gold} />
        <Box>
          <Typography variant="subtitle1" fontWeight="950" color="#FFF">{label('Verify Owner Mobile by SMS', 'توثيق هاتف المالك برسالة نصية')}</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>{label('Firebase Authentication verifies ownership before the profile can use a changed number.', 'تتحقق مصادقة Firebase من ملكية الرقم قبل استخدام الرقم الجديد في الملف.')}</Typography>
        </Box>
      </Stack>

      {notice && <Alert severity={notice.type} sx={{ mb: 2 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <Stack spacing={2}>
        <TextField
          data-testid="owner-phone-target"
          fullWidth
          label={label('New mobile number', 'رقم الهاتف المتحرك الجديد')}
          value={targetPhone}
          onChange={(event) => setTargetPhone(event.target.value)}
          disabled={busy || Boolean(verificationId)}
          helperText={label('Use international format. UAE local 05 numbers are normalized to +971.', 'استخدم الصيغة الدولية. يتم تحويل أرقام الإمارات التي تبدأ بـ 05 إلى +971.')}
          sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& .MuiInputLabel-root, & .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.55)' } }}
        />

        {!verificationId ? (
          <Button data-testid="owner-phone-send-otp" variant="outlined" startIcon={busy ? <CircularProgress size={18} /> : <MessageSquareText size={18} />} disabled={busy} onClick={requestOtp} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
            {label('Send Firebase SMS Code', 'إرسال رمز Firebase برسالة نصية')}
          </Button>
        ) : (
          <Stack spacing={2}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)' }}>{label(`Challenge issued for ${sentPhone}. The code stays only in this verification session and is submitted directly to Firebase Authentication.`, `تم إصدار التحدي للرقم ${sentPhone}. يبقى الرمز في جلسة التحقق هذه فقط ويُرسل مباشرة إلى مصادقة Firebase.`)}</Typography>
            <TextField
              data-testid="owner-phone-otp"
              fullWidth
              label={label('6-digit SMS code', 'رمز الرسالة النصية من 6 أرقام')}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputProps={{ inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code' }}
              sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' } }}
            />
            <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5}>
              <Button data-testid="owner-phone-verify-otp" variant="contained" disabled={busy || otp.length !== 6} onClick={verifyOtp} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                {busy ? <CircularProgress size={18} /> : label('Verify and Save Phone', 'توثيق الهاتف وحفظه')}
              </Button>
              <Button data-testid="owner-phone-reset-otp" variant="text" startIcon={<RefreshCw size={17} />} disabled={busy} onClick={resetChallenge} sx={{ color: 'rgba(255,255,255,0.7)' }}>
                {label('Use Another Number', 'استخدام رقم آخر')}
              </Button>
            </Stack>
          </Stack>
        )}
      </Stack>
      <Box id={recaptchaId} />
    </Paper>
  );
}
