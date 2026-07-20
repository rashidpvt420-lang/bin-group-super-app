import React from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  multiFactor,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import { BadgeCheck, KeyRound, MailCheck, MessageSquareText, RefreshCw, ShieldAlert } from 'lucide-react';
import { auth, functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

type Props = {
  enrolled: boolean;
  currentPhone?: string;
  isRTL: boolean;
  onEnrolled?: () => Promise<void> | void;
};

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };
type ReadinessTarget = {
  displayName: string;
  emailMasked: string;
  role: string;
  emailVerified: boolean;
  phoneMfaEnrolled: boolean;
  recoveryApprover: boolean;
  blockers: string[];
};
type ReadinessOverview = {
  status: 'READY' | 'BLOCKED';
  launchReady: boolean;
  summary: {
    activeAdminCount: number;
    emailVerifiedCount: number;
    phoneMfaEnrolledCount: number;
    recoveryApproverCount: number;
    recoveryApproverReadyCount: number;
    recoveryQuorumReady: boolean;
    blockingAccountCount: number;
  };
  blockers: ReadinessTarget[];
  sensitiveValuesExcluded: boolean;
  hardLaunchClaim: boolean;
};

const normalizePhone = (value: string) => {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '');
  if (!raw) return '';
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  if (raw.startsWith('05') && raw.length === 10) return `+971${raw.slice(1)}`;
  return raw.startsWith('+') ? raw : `+${raw}`;
};

export default function AdminMfaEnrollmentCard({ enrolled, currentPhone = '', isRTL, onEnrolled }: Props) {
  const copy = React.useCallback((en: string, ar: string) => (isRTL ? ar : en), [isRTL]);
  const [phone, setPhone] = React.useState(currentPhone);
  const [verificationId, setVerificationId] = React.useState('');
  const [challengeUid, setChallengeUid] = React.useState('');
  const [code, setCode] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [emailNotice, setEmailNotice] = React.useState<Notice | null>(null);
  const [emailVerified, setEmailVerified] = React.useState(auth.currentUser?.emailVerified === true);
  const [readiness, setReadiness] = React.useState<ReadinessOverview | null>(null);
  const [readinessBusy, setReadinessBusy] = React.useState(false);
  const [readinessError, setReadinessError] = React.useState('');
  const verifierRef = React.useRef<RecaptchaVerifier | null>(null);
  const recaptchaId = 'admin-mfa-enrollment-recaptcha';

  React.useEffect(() => {
    if (!verificationId) setPhone(currentPhone || '');
  }, [currentPhone, verificationId]);

  React.useEffect(() => () => {
    verifierRef.current?.clear();
    verifierRef.current = null;
  }, []);

  const loadReadiness = React.useCallback(async () => {
    setReadinessBusy(true);
    setReadinessError('');
    try {
      const result = await httpsCallable(functions, 'getAdminMfaReadinessOverview')({});
      setReadiness(result.data as ReadinessOverview);
    } catch (error) {
      const codeValue = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
      if (codeValue === 'functions/permission-denied' || codeValue === 'functions/unauthenticated') {
        setReadiness(null);
      } else {
        setReadinessError(copy(
          'The protected launch-readiness inventory could not be loaded.',
          'تعذر تحميل قائمة جاهزية الإطلاق المحمية.',
        ));
      }
    } finally {
      setReadinessBusy(false);
    }
  }, [copy]);

  React.useEffect(() => { void loadReadiness(); }, [loadReadiness]);

  const clearChallenge = () => {
    verifierRef.current?.clear();
    verifierRef.current = null;
    setVerificationId('');
    setChallengeUid('');
    setCode('');
  };

  const friendlyError = (error: unknown) => {
    const codeValue = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
    if (codeValue === 'auth/requires-recent-login') {
      return copy(
        'For security, sign out and sign in again before enrolling MFA.',
        'لأسباب أمنية، سجّل الخروج ثم الدخول مجدداً قبل تسجيل المصادقة متعددة العوامل.',
      );
    }
    if (codeValue === 'auth/invalid-verification-code') {
      return copy('The SMS verification code is incorrect.', 'رمز التحقق المرسل غير صحيح.');
    }
    if (codeValue === 'auth/too-many-requests') {
      return copy('Too many security attempts. Try again later.', 'عدد محاولات الأمان كبير. حاول لاحقاً.');
    }
    if (codeValue === 'auth/second-factor-already-in-use') {
      return copy('This phone factor is already enrolled.', 'عامل الهاتف هذا مسجّل بالفعل.');
    }
    return copy('Admin MFA enrollment failed.', 'فشل تسجيل المصادقة متعددة العوامل للمسؤول.');
  };

  const sendVerificationEmail = async () => {
    const user = auth.currentUser;
    if (!user) {
      setEmailNotice({ type: 'error', text: copy('Admin login is required.', 'يجب تسجيل دخول المسؤول.') });
      return;
    }
    setEmailBusy(true);
    setEmailNotice(null);
    try {
      await sendEmailVerification(user, {
        url: `${window.location.origin}/profile?email_verified=1`,
        handleCodeInApp: false,
      });
      setEmailNotice({
        type: 'success',
        text: copy(
          `Verification email sent to ${user.email || 'the signed-in Admin email'}. Open the message, verify, then return here and refresh status.`,
          'تم إرسال رسالة التحقق إلى بريد المسؤول المسجل. افتح الرسالة وأكمل التحقق ثم عد إلى هنا وحدّث الحالة.',
        ),
      });
    } catch (error) {
      setEmailNotice({ type: 'error', text: friendlyError(error) });
    } finally {
      setEmailBusy(false);
    }
  };

  const refreshEmailStatus = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setEmailBusy(true);
    setEmailNotice(null);
    try {
      await user.reload();
      await user.getIdToken(true);
      const verified = user.emailVerified === true;
      setEmailVerified(verified);
      setEmailNotice({
        type: verified ? 'success' : 'warning',
        text: verified
          ? copy('Firebase confirms this Admin email is verified.', 'تؤكد Firebase أن بريد المسؤول موثّق.')
          : copy('Firebase still reports this email as unverified.', 'لا تزال Firebase تعرض البريد على أنه غير موثّق.'),
      });
      if (verified) {
        await onEnrolled?.();
        await loadReadiness();
      }
    } catch (error) {
      setEmailNotice({ type: 'error', text: friendlyError(error) });
    } finally {
      setEmailBusy(false);
    }
  };

  const sendCode = async () => {
    const user = auth.currentUser;
    const normalized = normalizePhone(phone);
    if (!user) {
      setNotice({ type: 'error', text: copy('Admin login is required.', 'يجب تسجيل دخول المسؤول.') });
      return;
    }
    if (!emailVerified) {
      setNotice({
        type: 'warning',
        text: copy('Verify the Admin email before enrolling phone MFA.', 'وثّق بريد المسؤول قبل تسجيل مصادقة الهاتف.'),
      });
      return;
    }
    if (!consent) {
      setNotice({
        type: 'warning',
        text: copy(
          'Confirm that this protected Admin phone may receive security codes.',
          'أكّد أن هاتف المسؤول المحمي يمكنه استقبال رموز الأمان.',
        ),
      });
      return;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setNotice({
        type: 'warning',
        text: copy('Enter a valid international phone number, for example +9715XXXXXXXX.', 'أدخل رقم هاتف دولي صالح، مثل +9715XXXXXXXX.'),
      });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      verifierRef.current?.clear();
      auth.languageCode = isRTL ? 'ar' : 'en';
      verifierRef.current = new RecaptchaVerifier(auth, recaptchaId, { size: 'invisible' });
      const session = await multiFactor(user).getSession();
      const provider = new PhoneAuthProvider(auth);
      const id = await provider.verifyPhoneNumber({ phoneNumber: normalized, session }, verifierRef.current);
      setPhone(normalized);
      setVerificationId(id);
      setChallengeUid(user.uid);
      setCode('');
      setNotice({
        type: 'info',
        text: copy('A Firebase MFA code was sent to the protected Admin phone.', 'تم إرسال رمز مصادقة Firebase إلى هاتف المسؤول المحمي.'),
      });
    } catch (error) {
      clearChallenge();
      setNotice({ type: 'error', text: friendlyError(error) });
    } finally {
      verifierRef.current?.clear();
      verifierRef.current = null;
      setBusy(false);
    }
  };

  const verifyAndEnroll = async () => {
    const user = auth.currentUser;
    if (!user || !verificationId || !/^\d{6}$/.test(code)) return;
    if (!challengeUid || challengeUid !== user.uid) {
      clearChallenge();
      setNotice({
        type: 'error',
        text: copy('The authenticated Admin changed. Request a new MFA challenge.', 'تغيّر حساب المسؤول المصادق عليه. اطلب تحدي مصادقة جديداً.'),
      });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, code);
      const assertion = PhoneMultiFactorGenerator.assertion(credential);
      await multiFactor(user).enroll(assertion, 'BIN GROUP Admin phone');
      await user.reload();
      await user.getIdToken(true);
      const finalizeRecovery = httpsCallable(functions, 'finalizeOwnAdminMfaRecovery');
      await finalizeRecovery({});
      setNotice({
        type: 'success',
        text: copy(
          'Admin MFA was enrolled. You will now be signed out and must complete MFA on the next login.',
          'تم تسجيل المصادقة متعددة العوامل للمسؤول. سيتم تسجيل خروجك الآن ويجب إكمال المصادقة عند تسجيل الدخول التالي.',
        ),
      });
      clearChallenge();
      await onEnrolled?.();
      await loadReadiness();
      window.setTimeout(() => {
        sessionStorage.removeItem('bin-admin-security-session');
        void signOut(auth).finally(() => {
          window.location.href = '/login?mfa_enrolled=1';
        });
      }, 900);
    } catch (error) {
      setNotice({ type: 'error', text: friendlyError(error) });
    } finally {
      setBusy(false);
    }
  };

  const mfaCard = enrolled ? (
    <Paper data-testid="admin-mfa-enrollment-complete" sx={{ p: 3, borderRadius: 4, border: '1px solid rgba(16,185,129,0.35)' }}>
      <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
        <BadgeCheck color="#10b981" />
        <Box>
          <Typography fontWeight={950}>{copy('Admin MFA enrolled', 'تم تسجيل المصادقة متعددة العوامل')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {copy('Firebase requires the enrolled second factor during Admin sign-in.', 'تتطلب Firebase العامل الثاني المسجّل أثناء تسجيل دخول المسؤول.')}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  ) : (
    <Paper data-testid="admin-mfa-enrollment-card" sx={{ p: 3, borderRadius: 4, border: `1px solid ${binThemeTokens.gold}66` }}>
      <Stack spacing={2}>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
          <KeyRound color={binThemeTokens.gold} />
          <Box>
            <Typography fontWeight={950}>{copy('Enroll required Admin MFA', 'تسجيل المصادقة المطلوبة للمسؤول')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {copy('Use a protected Admin-controlled phone. The SMS code is sent directly to Firebase Authentication and is never stored by BIN GROUP.', 'استخدم هاتفاً محمياً تحت سيطرة المسؤول. يُرسل رمز الرسالة مباشرة إلى مصادقة Firebase ولا تخزنه BIN GROUP.')}
            </Typography>
          </Box>
        </Stack>

        {notice && <Alert severity={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert>}

        <TextField
          data-testid="admin-mfa-phone"
          fullWidth
          label={copy('Protected Admin phone', 'هاتف المسؤول المحمي')}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={busy || Boolean(verificationId)}
          helperText={copy('Use international format. UAE 05 numbers are normalized to +971.', 'استخدم الصيغة الدولية. يتم تحويل أرقام الإمارات التي تبدأ بـ 05 إلى +971.')}
        />

        <FormControlLabel
          control={<Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy || Boolean(verificationId)} />}
          label={copy('I control this phone and authorize security-code delivery for the Admin account.', 'أتحكم بهذا الهاتف وأوافق على إرسال رموز الأمان لحساب المسؤول.')}
        />

        {!verificationId ? (
          <Button
            data-testid="admin-mfa-send-code"
            variant="contained"
            startIcon={busy ? <CircularProgress size={18} /> : <MessageSquareText size={18} />}
            disabled={busy || !consent || !emailVerified}
            onClick={sendCode}
            sx={{ bgcolor: binThemeTokens.gold, color: '#020617', fontWeight: 950 }}
          >
            {copy('Send Firebase MFA code', 'إرسال رمز مصادقة Firebase')}
          </Button>
        ) : (
          <Stack spacing={2}>
            <TextField
              data-testid="admin-mfa-code"
              fullWidth
              label={copy('6-digit MFA code', 'رمز المصادقة من 6 أرقام')}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputProps={{ inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code' }}
              disabled={busy}
            />
            <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5}>
              <Button
                data-testid="admin-mfa-enroll"
                variant="contained"
                disabled={busy || code.length !== 6}
                onClick={verifyAndEnroll}
                sx={{ bgcolor: binThemeTokens.gold, color: '#020617', fontWeight: 950 }}
              >
                {busy ? <CircularProgress size={18} /> : copy('Verify and enroll MFA', 'تحقق وسجّل المصادقة')}
              </Button>
              <Button
                data-testid="admin-mfa-reset"
                variant="text"
                startIcon={<RefreshCw size={17} />}
                disabled={busy}
                onClick={() => {
                  clearChallenge();
                  setNotice(null);
                }}
              >
                {copy('Use another phone', 'استخدام هاتف آخر')}
              </Button>
            </Stack>
          </Stack>
        )}
      </Stack>
      <Box id={recaptchaId} />
    </Paper>
  );

  return (
    <Stack spacing={2.5}>
      {!emailVerified && (
        <Paper data-testid="admin-email-verification-card" sx={{ p: 3, borderRadius: 4, border: '1px solid rgba(245,158,11,0.45)' }}>
          <Stack spacing={2}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
              <MailCheck color="#f59e0b" />
              <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                <Typography fontWeight={950}>{copy('Verify the Admin email', 'توثيق بريد المسؤول')}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {copy('Production access requires Firebase to confirm the signed-in Admin email before phone MFA enrollment.', 'يتطلب وصول الإنتاج أن تؤكد Firebase بريد المسؤول المسجل قبل تسجيل مصادقة الهاتف.')}
                </Typography>
              </Box>
            </Stack>
            {emailNotice && <Alert severity={emailNotice.type} onClose={() => setEmailNotice(null)}>{emailNotice.text}</Alert>}
            <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5}>
              <Button data-testid="admin-send-email-verification" variant="contained" disabled={emailBusy} onClick={() => void sendVerificationEmail()}>
                {emailBusy ? <CircularProgress size={18} /> : copy('Send verification email', 'إرسال رسالة التحقق')}
              </Button>
              <Button data-testid="admin-refresh-email-verification" variant="outlined" disabled={emailBusy} startIcon={<RefreshCw size={17} />} onClick={() => void refreshEmailStatus()}>
                {copy('Refresh verification status', 'تحديث حالة التوثيق')}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {(readiness || readinessBusy || readinessError) && (
        <Paper data-testid="admin-mfa-readiness-overview" sx={{ p: 3, borderRadius: 4, border: readiness?.launchReady ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(239,68,68,0.35)' }}>
          <Stack spacing={2}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" justifyContent="space-between">
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
                <ShieldAlert color={readiness?.launchReady ? '#10b981' : '#ef4444'} />
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Typography fontWeight={950}>{copy('Production Admin MFA readiness', 'جاهزية مصادقة مسؤولي الإنتاج')}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {copy('Available only to CEO and Super Admin accounts. Email addresses are masked.', 'متاحة فقط لحسابات الرئيس التنفيذي والمسؤول الأعلى. عناوين البريد مخفية جزئياً.')}
                  </Typography>
                </Box>
              </Stack>
              <Button size="small" variant="outlined" disabled={readinessBusy} onClick={() => void loadReadiness()}>{readinessBusy ? <CircularProgress size={16} /> : copy('Refresh', 'تحديث')}</Button>
            </Stack>
            {readinessError && <Alert severity="error">{readinessError}</Alert>}
            {readiness && (
              <>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={copy(`Active: ${readiness.summary.activeAdminCount}`, `النشطون: ${readiness.summary.activeAdminCount}`)} />
                  <Chip color={readiness.summary.emailVerifiedCount === readiness.summary.activeAdminCount ? 'success' : 'warning'} label={copy(`Email verified: ${readiness.summary.emailVerifiedCount}`, `البريد الموثق: ${readiness.summary.emailVerifiedCount}`)} />
                  <Chip color={readiness.summary.phoneMfaEnrolledCount === readiness.summary.activeAdminCount ? 'success' : 'warning'} label={copy(`Phone MFA: ${readiness.summary.phoneMfaEnrolledCount}`, `مصادقة الهاتف: ${readiness.summary.phoneMfaEnrolledCount}`)} />
                  <Chip color={readiness.summary.recoveryQuorumReady ? 'success' : 'error'} label={copy(`Recovery ready: ${readiness.summary.recoveryApproverReadyCount}/${readiness.summary.recoveryApproverCount}`, `استعادة جاهزة: ${readiness.summary.recoveryApproverReadyCount}/${readiness.summary.recoveryApproverCount}`)} />
                </Stack>
                <Alert severity={readiness.launchReady ? 'success' : 'warning'}>
                  {readiness.launchReady
                    ? copy('Every active privileged account is email-verified and phone-MFA enrolled, and the recovery quorum is ready.', 'كل حساب مميز نشط موثق البريد ومسجل بمصادقة الهاتف، ونصاب الاستعادة جاهز.')
                    : copy('The protected production gate remains blocked until every listed account completes its own verification and MFA enrollment.', 'ستبقى بوابة الإنتاج المحمية متوقفة حتى يكمل كل حساب مدرج التحقق وتسجيل المصادقة الخاصة به.')}
                </Alert>
                {!!readiness.blockers.length && <Divider />}
                <Stack spacing={1.25}>
                  {readiness.blockers.map((target, index) => (
                    <Box key={`${target.emailMasked}-${target.role}-${index}`} sx={{ p: 1.75, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
                      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" gap={1.5}>
                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                          <Typography fontWeight={900}>{target.displayName}</Typography>
                          <Typography variant="body2" color="text.secondary">{target.emailMasked} · {target.role.replaceAll('_', ' ')}</Typography>
                        </Box>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap" useFlexGap>
                          {target.recoveryApprover && <Chip size="small" color="error" label={copy('Recovery approver', 'مسؤول استعادة')} />}
                          {!target.emailVerified && <Chip size="small" color="warning" label={copy('Email unverified', 'البريد غير موثق')} />}
                          {!target.phoneMfaEnrolled && <Chip size="small" color="warning" label={copy('Phone MFA missing', 'مصادقة الهاتف مفقودة')} />}
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
          </Stack>
        </Paper>
      )}

      {mfaCard}
    </Stack>
  );
}
