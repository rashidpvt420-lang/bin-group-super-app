import React, { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Award, Briefcase, KeyRound, Save, ShieldCheck, User } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { auth, db, doc, functions, getDoc, sendPasswordResetEmail, updateProfile } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };

type BrokerKycResult = {
  status: 'SUCCESS';
  idempotent: boolean;
  brokerKycStatus: string;
  profileCompletionScore: number;
  reraStatus: string;
  reraVerified: boolean;
  reraLicenseMasked: string;
  bankIbanMasked: string;
  commissionTermsVersion: string;
};

const CURRENT_TERMS_VERSION = 'BIN_BROKER_TERMS_2026_01';
const inputSx = {
  '& .MuiFilledInput-root': { bgcolor: '#F3F4F6', borderRadius: 3, color: binThemeTokens.textPrimary },
  '& .MuiInputLabel-root': { color: binThemeTokens.textSecondary },
};

export default function BrokerProfilePage() {
  const { user } = useRole();
  const { isRTL, lang } = useLanguage();
  const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [brokerData, setBrokerData] = useState<any>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [reraLicense, setReraLicense] = useState('');
  const [primaryRegion, setPrimaryRegion] = useState('Dubai, UAE');
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState('');
  const [emiratesIdNumber, setEmiratesIdNumber] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [bankIban, setBankIban] = useState('');
  const [brokerTerritory, setBrokerTerritory] = useState('Dubai');
  const [commissionAgreementAccepted, setCommissionAgreementAccepted] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      try {
        const [publicSnap, privateResult] = await Promise.all([
          getDoc(doc(db, 'users', user.uid)),
          getDoc(doc(db, 'broker_kyc_profiles', user.uid)).catch((error) => {
            console.info('Private Broker KYC profile is not available yet.', error);
            return null;
          }),
        ]);
        const publicData = publicSnap.exists() ? publicSnap.data() : {};
        const privateData = privateResult?.exists() ? privateResult.data() : {};
        const data = { ...publicData, ...privateData };
        setBrokerData(data);
        setDisplayName(data.displayName || user.displayName || '');
        setPhone(data.phoneNumber || data.phone || '');
        setCompanyName(data.companyName || '');
        setReraLicense(data.reraLicense || '');
        setPrimaryRegion(data.primaryRegion || data.region || 'Dubai, UAE');
        setTradeLicenseNumber(data.tradeLicenseNumber || '');
        setEmiratesIdNumber(data.emiratesIdNumber || '');
        setPassportNumber(data.passportNumber || '');
        setBankName(data.bankName || '');
        setBankAccountHolder(data.bankAccountHolder || data.displayName || user.displayName || '');
        setBankIban(data.bankIban || '');
        setBrokerTerritory(data.brokerTerritory || data.primaryRegion || data.region || 'Dubai');
        setCommissionAgreementAccepted(Boolean(data.commissionAgreementAccepted));
      } catch (error) {
        console.error('Broker profile fetch failed:', error);
        setNotice({ type: 'error', text: label('Broker profile could not be loaded.', 'تعذر تحميل ملف الوسيط.') });
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user?.uid, user?.displayName, lang]);

  const handleSave = async () => {
    if (!user?.uid) return;
    if (!displayName.trim()) {
      setNotice({ type: 'warning', text: label('Full professional name is required.', 'الاسم المهني الكامل مطلوب.') });
      return;
    }
    setUpdating(true);
    setNotice(null);
    try {
      const submitBrokerKycProfile = httpsCallable<Record<string, unknown>, BrokerKycResult>(functions, 'submitBrokerKycProfile');
      const response = await submitBrokerKycProfile({
        displayName: displayName.trim(),
        phone: phone.trim(),
        companyName: companyName.trim(),
        reraLicense: reraLicense.trim(),
        primaryRegion: primaryRegion.trim(),
        tradeLicenseNumber: tradeLicenseNumber.trim(),
        emiratesIdNumber: emiratesIdNumber.trim(),
        passportNumber: passportNumber.trim(),
        bankName: bankName.trim(),
        bankAccountHolder: bankAccountHolder.trim(),
        bankIban: bankIban.trim(),
        brokerTerritory: brokerTerritory.trim(),
        commissionAgreementAccepted,
        commissionTermsVersion: CURRENT_TERMS_VERSION,
        language: lang,
      });

      if (auth.currentUser && auth.currentUser.displayName !== displayName.trim()) {
        await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      }

      setBrokerData((previous: any) => ({
        ...previous,
        displayName: displayName.trim(),
        phone: phone.trim(),
        phoneNumber: phone.trim(),
        companyName: companyName.trim(),
        reraLicense: reraLicense.trim(),
        primaryRegion: primaryRegion.trim(),
        tradeLicenseNumber: tradeLicenseNumber.trim(),
        emiratesIdNumber: emiratesIdNumber.trim(),
        passportNumber: passportNumber.trim(),
        bankName: bankName.trim(),
        bankAccountHolder: bankAccountHolder.trim(),
        bankIban: bankIban.trim(),
        brokerTerritory: brokerTerritory.trim(),
        commissionAgreementAccepted,
        ...response.data,
      }));
      setNotice({
        type: 'success',
        text: response.data.idempotent
          ? label('Broker KYC profile was already up to date.', 'ملف التحقق للوسيط محدث بالفعل.')
          : label('Broker KYC profile submitted securely for review.', 'تم إرسال ملف التحقق للوسيط بأمان للمراجعة.'),
      });
    } catch (error: any) {
      console.error('Broker KYC submission failed:', error);
      setNotice({ type: 'error', text: error?.message || label('Failed to submit Broker KYC profile.', 'فشل إرسال ملف التحقق للوسيط.') });
    } finally {
      setUpdating(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
      setNotice({ type: 'warning', text: label('No email is attached to this account.', 'لا يوجد بريد إلكتروني مرتبط بهذا الحساب.') });
      return;
    }
    setResetting(true);
    setNotice(null);
    try {
      auth.languageCode = isRTL ? 'ar' : 'en';
      await sendPasswordResetEmail(auth, user.email, {
        url: `${window.location.origin}/login?email=${encodeURIComponent(user.email)}&intendedRole=broker`,
        handleCodeInApp: false,
      });
      setNotice({ type: 'success', text: label('Password reset email sent. Check inbox or spam folder.', 'تم إرسال رابط إعادة تعيين كلمة المرور. تحقق من البريد الوارد أو الرسائل غير المرغوب فيها.') });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || label('Could not send password reset email.', 'تعذر إرسال بريد إعادة تعيين كلمة المرور.') });
    } finally {
      setResetting(false);
    }
  };

  const readinessChecks = [
    { label: label('Professional name', 'الاسم المهني'), complete: Boolean(displayName.trim()) },
    { label: label('Phone number', 'رقم الهاتف'), complete: Boolean(phone.trim()) },
    { label: label('Brokerage firm', 'شركة الوساطة'), complete: Boolean(companyName.trim()) },
    { label: label('RERA license', 'رخصة ريرا'), complete: Boolean(reraLicense.trim()) },
    { label: label('ID or trade license', 'هوية أو رخصة تجارية'), complete: Boolean(tradeLicenseNumber.trim() || emiratesIdNumber.trim() || passportNumber.trim()) },
    { label: label('Territory', 'النطاق الجغرافي'), complete: Boolean((brokerTerritory || primaryRegion).trim()) },
    { label: label('Bank and IBAN', 'البنك والآيبان'), complete: Boolean(bankName.trim() && bankAccountHolder.trim() && bankIban.trim()) },
    { label: label('Commission agreement', 'اتفاقية العمولة'), complete: commissionAgreementAccepted },
  ];
  const readinessScore = Math.round((readinessChecks.filter((item) => item.complete).length / readinessChecks.length) * 100);
  const reraStatus = String(brokerData?.reraStatus || 'NOT_SUBMITTED');
  const payoutEligible = Boolean(brokerData?.reraVerified && commissionAgreementAccepted && bankIban.trim());

  return (
    <BrokerPageFrame
      title={label('Broker Profile', 'ملف الوسيط')}
      subtitle={label('Professional profile, private KYC vault, payout readiness, and account security', 'الملف المهني وخزنة التحقق الخاصة وجاهزية المدفوعات وأمان الحساب')}
      loading={loading}
      actions={null}
    >
      <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
        {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}
        <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ mb: 3, borderRadius: 3 }}>
          {label(
            'Identity, licence and bank values are stored in a private server-written KYC vault. The public profile receives only masked summaries and review status.',
            'يتم حفظ بيانات الهوية والترخيص والبنك في خزنة تحقق خاصة يكتبها الخادم فقط. يظهر في الملف العام ملخص مقنع وحالة المراجعة فقط.',
          )}
        </Alert>

        <Grid container spacing={4}>
          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 4, borderRadius: 7, bgcolor: binThemeTokens.softCanvas, border: '1px solid #E5E7EB', textAlign: 'center' }}>
              <Avatar sx={{ width: 100, height: 100, mx: 'auto', bgcolor: '#020617', color: binThemeTokens.gold }}>
                <Typography variant="h3" fontWeight="950">{displayName?.charAt(0) || <User size={42} />}</Typography>
              </Avatar>
              <Typography variant="h5" fontWeight="950" sx={{ mt: 2 }}>{displayName || label('Broker', 'الوسيط')}</Typography>
              <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{companyName || label('Brokerage partner', 'شريك وساطة')}</Typography>
              <Stack spacing={2} sx={{ mt: 4 }}>
                <Box sx={{ p: 2, bgcolor: '#F3F4F6', borderRadius: 3, textAlign: isRTL ? 'right' : 'left' }}>
                  <Typography variant="caption" fontWeight="900">{label('PARTNER ID', 'رقم الشريك')}</Typography>
                  <Typography variant="body2" fontFamily="monospace">BIN-{user?.uid?.substring(0, 8).toUpperCase()}</Typography>
                </Box>
                <Box sx={{ p: 2, bgcolor: alpha(payoutEligible ? '#10b981' : '#f59e0b', 0.08), borderRadius: 3 }}>
                  <Typography variant="caption" fontWeight="900">{label('PAYOUT STATUS', 'حالة المدفوعات')}</Typography>
                  <Typography variant="body2" fontWeight="900" color={payoutEligible ? '#047857' : '#b45309'}>
                    {payoutEligible ? label('Eligible', 'مؤهل') : label('Verification required', 'التحقق مطلوب')}
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            <Paper sx={{ mt: 3, p: 4, borderRadius: 7, border: '1px solid #E5E7EB' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight="950">{label('Profile readiness', 'جاهزية الملف')}</Typography>
                <Chip label={`${readinessScore}%`} color={readinessScore === 100 ? 'success' : 'warning'} />
              </Stack>
              <LinearProgress variant="determinate" value={readinessScore} sx={{ my: 2, height: 8, borderRadius: 99 }} />
              <Stack spacing={1}>
                {readinessChecks.map((check) => (
                  <Stack key={check.label} direction="row" justifyContent="space-between">
                    <Typography variant="caption">{check.label}</Typography>
                    <Typography variant="caption" fontWeight="900" color={check.complete ? '#047857' : '#b45309'}>{check.complete ? '✓' : '—'}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={8}>
            <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 7, border: '1px solid #E5E7EB' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Box>
                  <Typography variant="h6" fontWeight="950">{label('Professional and KYC details', 'البيانات المهنية وبيانات التحقق')}</Typography>
                  <Typography variant="caption" color="text.secondary">{label(`Review status: ${reraStatus.replaceAll('_', ' ')}`, `حالة المراجعة: ${reraStatus}`)}</Typography>
                </Box>
                <Award color={binThemeTokens.gold} />
              </Stack>

              <Grid container spacing={2.5}>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Professional name', 'الاسم المهني')} value={displayName} onChange={(event) => setDisplayName(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Phone', 'الهاتف')} value={phone} onChange={(event) => setPhone(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Brokerage company', 'شركة الوساطة')} value={companyName} onChange={(event) => setCompanyName(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('RERA licence', 'رخصة ريرا')} value={reraLicense} onChange={(event) => setReraLicense(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Primary region', 'المنطقة الأساسية')} value={primaryRegion} onChange={(event) => setPrimaryRegion(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Broker territory', 'نطاق الوسيط')} value={brokerTerritory} onChange={(event) => setBrokerTerritory(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth variant="filled" label={label('Trade licence', 'الرخصة التجارية')} value={tradeLicenseNumber} onChange={(event) => setTradeLicenseNumber(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth variant="filled" label={label('Emirates ID', 'الهوية الإماراتية')} value={emiratesIdNumber} onChange={(event) => setEmiratesIdNumber(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth variant="filled" label={label('Passport', 'جواز السفر')} value={passportNumber} onChange={(event) => setPassportNumber(event.target.value)} sx={inputSx} /></Grid>
              </Grid>

              <Divider sx={{ my: 4 }} />
              <Typography variant="subtitle1" fontWeight="950" sx={{ mb: 2 }}>{label('Private payout details', 'بيانات المدفوعات الخاصة')}</Typography>
              <Grid container spacing={2.5}>
                <Grid item xs={12} md={4}><TextField fullWidth variant="filled" label={label('Bank name', 'اسم البنك')} value={bankName} onChange={(event) => setBankName(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth variant="filled" label={label('Account holder', 'اسم صاحب الحساب')} value={bankAccountHolder} onChange={(event) => setBankAccountHolder(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth variant="filled" label={label('UAE IBAN', 'رقم الآيبان الإماراتي')} value={bankIban} onChange={(event) => setBankIban(event.target.value.toUpperCase())} sx={inputSx} /></Grid>
              </Grid>

              <FormControlLabel
                sx={{ mt: 3, alignItems: 'flex-start' }}
                control={<Checkbox checked={commissionAgreementAccepted} onChange={(event) => setCommissionAgreementAccepted(event.target.checked)} />}
                label={label(
                  `I accept BIN GROUP Broker commission terms ${CURRENT_TERMS_VERSION}.`,
                  `أوافق على شروط عمولة وسيط BIN GROUP بالإصدار ${CURRENT_TERMS_VERSION}.`,
                )}
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
                <Button variant="contained" size="large" startIcon={updating ? <CircularProgress size={18} color="inherit" /> : <Save size={18} />} onClick={handleSave} disabled={updating} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                  {label('Submit secure KYC profile', 'إرسال ملف التحقق الآمن')}
                </Button>
                <Button variant="outlined" size="large" startIcon={resetting ? <CircularProgress size={18} /> : <KeyRound size={18} />} onClick={handlePasswordReset} disabled={resetting}>
                  {label('Reset password', 'إعادة تعيين كلمة المرور')}
                </Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </BrokerPageFrame>
  );
}
