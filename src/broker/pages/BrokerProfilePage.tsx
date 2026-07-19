import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Checkbox, Chip, CircularProgress, Divider, FormControlLabel,
  Grid, LinearProgress, Paper, Stack, TextField, Typography, alpha
} from '@mui/material';
import { Award, Briefcase, KeyRound, RefreshCcw, Save, ShieldCheck, ShieldX, User } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { auth, functions, sendPasswordResetEmail } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };
type BrokerSummary = {
  profile: {
    displayName: string;
    email: string;
    phone: string;
    companyName: string;
    primaryRegion: string;
    brokerTerritory: string;
  };
  kyc: {
    submitted: boolean;
    brokerKycStatus: string;
    reraStatus: string;
    reraVerified: boolean;
    ibanVerified: boolean;
    profileCompletionScore: number;
    reraLicenseMasked: string;
    tradeLicenseMasked: string;
    emiratesIdMasked: string;
    passportMasked: string;
    bankIbanMasked: string;
    bankNameMasked: string;
    commissionAgreementAccepted: boolean;
    commissionTermsVersion: string;
    approvalBound: boolean;
    reviewedAtMs: number;
    reviewReason: string;
  };
  payout: { eligible: boolean; blockReasons: string[]; hold: boolean };
};

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
  const label = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [summary, setSummary] = useState<BrokerSummary | null>(null);
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

  const loadSummary = async (silent = false) => {
    if (!user?.uid) return;
    if (!silent) setLoading(true);
    try {
      const callable = httpsCallable(functions, 'getBrokerKycProfileSummary');
      const result = await callable({});
      const next = result.data as BrokerSummary;
      setSummary(next);
      setDisplayName(next.profile.displayName || user.displayName || '');
      setPhone(next.profile.phone || '');
      setCompanyName(next.profile.companyName || '');
      setPrimaryRegion(next.profile.primaryRegion || 'Dubai, UAE');
      setBrokerTerritory(next.profile.brokerTerritory || 'Dubai');
      setCommissionAgreementAccepted(next.kyc.commissionAgreementAccepted);
      setBankAccountHolder(next.profile.displayName || user.displayName || '');
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || label('Broker profile could not be loaded.', 'تعذر تحميل ملف الوسيط.') });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { void loadSummary(); }, [user?.uid, lang]);

  const handleSave = async () => {
    if (!user?.uid) return;
    if (!displayName.trim() || !phone.trim() || !companyName.trim()) {
      setNotice({ type: 'warning', text: label('Professional name, phone and brokerage company are required.', 'الاسم المهني والهاتف وشركة الوساطة مطلوبة.') });
      return;
    }
    const identityProvided = Boolean(tradeLicenseNumber.trim() || emiratesIdNumber.trim() || passportNumber.trim());
    if (!reraLicense.trim() || !identityProvided || !bankName.trim() || !bankAccountHolder.trim() || !bankIban.trim()) {
      setNotice({
        type: 'warning',
        text: label(
          'For a new or updated KYC submission, re-enter the full RERA, identity and bank values. Existing private values are never loaded into this browser.',
          'لإرسال ملف تحقق جديد أو محدث، أعد إدخال بيانات ريرا والهوية والبنك كاملة. لا يتم تحميل القيم الخاصة الحالية إلى هذا المتصفح.'
        ),
      });
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
      setReraLicense('');
      setTradeLicenseNumber('');
      setEmiratesIdNumber('');
      setPassportNumber('');
      setBankName('');
      setBankIban('');
      setNotice({
        type: 'success',
        text: response.data.idempotent
          ? label('The Broker KYC submission was already current.', 'ملف تحقق الوسيط محدث بالفعل.')
          : label('Broker KYC was submitted securely. Public identity changes remain pending until Admin approval.', 'تم إرسال تحقق الوسيط بأمان. تبقى تغييرات الهوية العامة معلقة حتى اعتماد الإدارة.'),
      });
      await loadSummary(true);
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || label('Failed to submit Broker KYC.', 'فشل إرسال تحقق الوسيط.') });
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
    try {
      auth.languageCode = isRTL ? 'ar' : 'en';
      await sendPasswordResetEmail(auth, user.email, {
        url: `${window.location.origin}/login?email=${encodeURIComponent(user.email)}&intendedRole=broker`,
        handleCodeInApp: false,
      });
      setNotice({ type: 'success', text: label('Password reset email sent.', 'تم إرسال بريد إعادة تعيين كلمة المرور.') });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || label('Could not send password reset email.', 'تعذر إرسال بريد إعادة تعيين كلمة المرور.') });
    } finally {
      setResetting(false);
    }
  };

  const localizedStatus = (value: string) => {
    const normalized = String(value || '').toUpperCase();
    if (lang !== 'ar') return normalized.replaceAll('_', ' ');
    const map: Record<string, string> = {
      NOT_SUBMITTED: 'غير مقدم', INCOMPLETE: 'غير مكتمل', PENDING: 'قيد المراجعة', PENDING_REVIEW: 'بانتظار المراجعة',
      APPROVED: 'معتمد', VERIFIED: 'موثّق', REJECTED: 'مرفوض', SUSPENDED: 'موقوف', EXPIRED: 'منتهي',
    };
    return map[normalized] || value;
  };
  const payoutReason = (value: string) => {
    const map: Record<string, [string, string]> = {
      RERA_NOT_VERIFIED: ['RERA licence not verified', 'رخصة ريرا غير موثقة'],
      IBAN_NOT_VERIFIED: ['IBAN not verified', 'الآيبان غير موثّق'],
      COMMISSION_TERMS_NOT_ACCEPTED: ['Commission terms not accepted', 'شروط العمولة غير مقبولة'],
      KYC_APPROVAL_NOT_BOUND_TO_CURRENT_SUBMISSION: ['Current KYC submission is not approved', 'ملف التحقق الحالي غير معتمد'],
      KYC_NOT_APPROVED: ['KYC review not approved', 'مراجعة التحقق غير معتمدة'],
      PAYOUT_HOLD: ['Payout hold applied', 'يوجد حجز على الدفع'],
    };
    return label(...(map[value] || [value, value]));
  };

  const readinessItems = useMemo(() => summary ? [
    { label: label('RERA licence', 'رخصة ريرا'), complete: summary.kyc.reraVerified, value: summary.kyc.reraLicenseMasked || localizedStatus(summary.kyc.reraStatus) },
    { label: label('Identity evidence', 'إثبات الهوية'), complete: Boolean(summary.kyc.tradeLicenseMasked || summary.kyc.emiratesIdMasked || summary.kyc.passportMasked), value: summary.kyc.tradeLicenseMasked || summary.kyc.emiratesIdMasked || summary.kyc.passportMasked || '—' },
    { label: label('Verified IBAN', 'الآيبان الموثّق'), complete: summary.kyc.ibanVerified, value: summary.kyc.bankIbanMasked || '—' },
    { label: label('Commission agreement', 'اتفاقية العمولة'), complete: summary.kyc.commissionAgreementAccepted, value: summary.kyc.commissionTermsVersion || '—' },
    { label: label('Approval hash', 'ربط الاعتماد'), complete: summary.kyc.approvalBound, value: summary.kyc.approvalBound ? label('Bound', 'مرتبط') : label('Pending', 'معلق') },
  ] : [], [summary, lang]);

  return (
    <BrokerPageFrame
      title={label('Broker Profile', 'ملف الوسيط')}
      subtitle={label('Masked KYC summary, server-authoritative payout readiness and secure resubmission', 'ملخص تحقق مقنّع وجاهزية دفع معتمدة من الخادم وإعادة إرسال آمنة')}
      loading={loading}
      actions={<Button onClick={() => void loadSummary()} startIcon={<RefreshCcw size={18} />}>{label('Refresh', 'تحديث')}</Button>}
    >
      <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
        {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}
        <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ mb: 3, borderRadius: 3 }}>
          {label(
            'The browser receives masked KYC values only. Full identity, licence and bank data remain in the private server vault.',
            'يتلقى المتصفح قيماً مقنّعة فقط. تبقى بيانات الهوية والترخيص والبنك الكاملة داخل خزنة الخادم الخاصة.'
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
              <Box sx={{ mt: 3, p: 2, borderRadius: 3, bgcolor: alpha(summary?.payout.eligible ? '#10b981' : '#f59e0b', 0.1) }}>
                <Typography variant="caption" fontWeight="950">{label('PAYOUT READINESS', 'جاهزية الدفع')}</Typography>
                <Typography fontWeight="950" color={summary?.payout.eligible ? '#047857' : '#b45309'}>
                  {summary?.payout.eligible ? label('ELIGIBLE', 'مؤهل') : label('BLOCKED', 'غير مؤهل')}
                </Typography>
              </Box>
              {!summary?.payout.eligible && <Stack spacing={1} sx={{ mt: 2 }}>{(summary?.payout.blockReasons || []).map((reason) => <Chip key={reason} label={payoutReason(reason)} size="small" color="warning" />)}</Stack>}
            </Paper>

            <Paper sx={{ mt: 3, p: 4, borderRadius: 7, border: '1px solid #E5E7EB' }}>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center">
                <Typography fontWeight="950">{label('Profile readiness', 'جاهزية الملف')}</Typography>
                <Typography fontWeight="950" color={binThemeTokens.gold}>{summary?.kyc.profileCompletionScore || 0}%</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={summary?.kyc.profileCompletionScore || 0} sx={{ mt: 2, height: 8, borderRadius: 99 }} />
              <Stack spacing={1.5} sx={{ mt: 3 }}>{readinessItems.map((item) => <Box key={item.label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="body2" fontWeight="800">{item.label}</Typography><Chip size="small" icon={item.complete ? <ShieldCheck size={14} /> : <ShieldX size={14} />} label={item.value} color={item.complete ? 'success' : 'warning'} /></Box>)}</Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={8}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 7, border: '1px solid #E5E7EB' }}>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" mb={3}><Briefcase color={binThemeTokens.gold} /><Typography variant="h5" fontWeight="950">{label('Professional profile', 'الملف المهني')}</Typography></Stack>
              <Grid container spacing={2.5}>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Professional legal name', 'الاسم القانوني المهني')} value={displayName} onChange={(event) => setDisplayName(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Phone', 'الهاتف')} value={phone} onChange={(event) => setPhone(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Brokerage company', 'شركة الوساطة')} value={companyName} onChange={(event) => setCompanyName(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Primary region', 'المنطقة الرئيسية')} value={primaryRegion} onChange={(event) => setPrimaryRegion(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12}><TextField fullWidth variant="filled" label={label('Broker territory', 'نطاق الوسيط')} value={brokerTerritory} onChange={(event) => setBrokerTerritory(event.target.value)} sx={inputSx} /></Grid>
              </Grid>

              <Divider sx={{ my: 4 }} />
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" mb={1}><Award color={binThemeTokens.gold} /><Typography variant="h5" fontWeight="950">{label('Submit new or corrected private KYC', 'إرسال تحقق خاص جديد أو مصحح')}</Typography></Stack>
              <Typography variant="body2" color="text.secondary" mb={3}>{label('Masked existing values are shown above. Re-enter all full sensitive fields only when submitting a correction or renewal.', 'تظهر القيم الحالية مقنّعة أعلاه. أعد إدخال الحقول الحساسة كاملة فقط عند إرسال تصحيح أو تجديد.')}</Typography>
              <Grid container spacing={2.5}>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Full RERA licence number', 'رقم رخصة ريرا الكامل')} value={reraLicense} onChange={(event) => setReraLicense(event.target.value)} placeholder={summary?.kyc.reraLicenseMasked || ''} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Trade licence number', 'رقم الرخصة التجارية')} value={tradeLicenseNumber} onChange={(event) => setTradeLicenseNumber(event.target.value)} placeholder={summary?.kyc.tradeLicenseMasked || ''} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Emirates ID number', 'رقم الهوية الإماراتية')} value={emiratesIdNumber} onChange={(event) => setEmiratesIdNumber(event.target.value)} placeholder={summary?.kyc.emiratesIdMasked || ''} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth variant="filled" label={label('Passport number', 'رقم جواز السفر')} value={passportNumber} onChange={(event) => setPassportNumber(event.target.value)} placeholder={summary?.kyc.passportMasked || ''} sx={inputSx} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth variant="filled" label={label('Bank name', 'اسم البنك')} value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder={summary?.kyc.bankNameMasked || ''} sx={inputSx} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth variant="filled" label={label('Account holder', 'صاحب الحساب')} value={bankAccountHolder} onChange={(event) => setBankAccountHolder(event.target.value)} sx={inputSx} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth variant="filled" label={label('Full UAE IBAN', 'الآيبان الإماراتي الكامل')} value={bankIban} onChange={(event) => setBankIban(event.target.value)} placeholder={summary?.kyc.bankIbanMasked || ''} sx={inputSx} /></Grid>
              </Grid>
              <FormControlLabel sx={{ mt: 3 }} control={<Checkbox checked={commissionAgreementAccepted} onChange={(event) => setCommissionAgreementAccepted(event.target.checked)} />} label={label(`I accept Broker commission terms ${CURRENT_TERMS_VERSION}.`, `أوافق على شروط عمولة الوسيط ${CURRENT_TERMS_VERSION}.`)} />
              {summary?.kyc.reviewReason && <Alert severity={String(summary.kyc.brokerKycStatus).toUpperCase() === 'REJECTED' ? 'error' : 'info'} sx={{ mt: 2 }}>{summary.kyc.reviewReason}</Alert>}
              <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ mt: 3 }}>
                <Button variant="contained" startIcon={updating ? <CircularProgress size={18} /> : <Save size={18} />} disabled={updating} onClick={() => void handleSave()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{label('SUBMIT KYC FOR REVIEW', 'إرسال التحقق للمراجعة')}</Button>
                <Button variant="outlined" startIcon={<KeyRound size={18} />} disabled={resetting} onClick={() => void handlePasswordReset()}>{label('Password reset', 'إعادة تعيين كلمة المرور')}</Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </BrokerPageFrame>
  );
}
