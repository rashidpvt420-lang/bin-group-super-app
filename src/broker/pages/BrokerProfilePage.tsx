import React, { useState, useEffect } from 'react';
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
import { Award, Briefcase, Calendar, KeyRound, Mail, MapPin, Save, ShieldCheck, User, Zap } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { auth, db, doc, getDoc, sendPasswordResetEmail, serverTimestamp, setDoc, updateProfile } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };

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
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
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
        setBankIban(data.bankIban || data.iban || '');
        setBrokerTerritory(data.brokerTerritory || data.primaryRegion || data.region || 'Dubai');
        setCommissionAgreementAccepted(Boolean(data.commissionAgreementAccepted));
      } catch (err) {
        console.error('Broker profile fetch failed:', err);
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
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      const isLicenseChanged = reraLicense.trim() !== (brokerData?.reraLicense || '').trim();
      const reraStatus = isLicenseChanged ? (reraLicense.trim() ? 'PENDING' : 'NOT_SUBMITTED') : (brokerData?.reraStatus || 'NOT_SUBMITTED');
      const reraVerified = isLicenseChanged ? false : Boolean(brokerData?.reraVerified);
      const agreementJustAccepted = commissionAgreementAccepted && !brokerData?.commissionAgreementAccepted;
      const profileChecks = [
        displayName.trim(),
        phone.trim(),
        companyName.trim(),
        reraLicense.trim(),
        tradeLicenseNumber.trim() || emiratesIdNumber.trim() || passportNumber.trim(),
        brokerTerritory.trim() || primaryRegion.trim(),
        bankName.trim(),
        bankAccountHolder.trim(),
        bankIban.trim(),
        commissionAgreementAccepted,
      ];
      const profileCompletionScore = Math.round((profileChecks.filter(Boolean).length / profileChecks.length) * 100);
      const brokerKycStatus = profileCompletionScore === 100 ? 'PENDING_REVIEW' : 'INCOMPLETE';
      const payload: Record<string, any> = {
        uid: user.uid,
        email: user.email || brokerData?.email || '',
        role: brokerData?.role || 'broker',
        displayName: displayName.trim(),
        phoneNumber: phone.trim(),
        phone: phone.trim(),
        companyName: companyName.trim(),
        reraLicense: reraLicense.trim(),
        reraVerified,
        reraStatus,
        primaryRegion: primaryRegion.trim(),
        brokerTerritory: brokerTerritory.trim(),
        tradeLicenseNumber: tradeLicenseNumber.trim(),
        emiratesIdNumber: emiratesIdNumber.trim(),
        passportNumber: passportNumber.trim(),
        bankName: bankName.trim(),
        bankAccountHolder: bankAccountHolder.trim(),
        bankIban: bankIban.trim(),
        iban: bankIban.trim(),
        commissionAgreementAccepted,
        commissionTermsVersion: brokerData?.commissionTermsVersion || 'BIN_BROKER_TERMS_2026_01',
        brokerKycStatus,
        brokerProfileCompletion: profileCompletionScore,
        profileCompletionScore,
        language: lang,
        updatedAt: serverTimestamp(),
      };
      if (agreementJustAccepted) payload.commissionAgreementAcceptedAt = serverTimestamp();
      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
      setBrokerData((prev: any) => ({ ...prev, ...payload }));
      setNotice({ type: 'success', text: label('Broker profile updated successfully.', 'تم تحديث ملف الوسيط بنجاح.') });
    } catch (err: any) {
      console.error('Broker profile update failed:', err);
      setNotice({ type: 'error', text: err?.message || label('Failed to update broker profile.', 'فشل تحديث ملف الوسيط.') });
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
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || label('Could not send password reset email.', 'تعذر إرسال بريد إعادة تعيين كلمة المرور.') });
    } finally {
      setResetting(false);
    }
  };

  const reraStatus = (brokerData?.reraStatus || 'NOT_SUBMITTED').toString();
  const reraStatusLabel = lang === 'ar'
    ? reraStatus === 'PENDING' ? 'قيد المراجعة' : reraStatus === 'REJECTED' ? 'مرفوض' : brokerData?.reraVerified ? 'موثق' : 'مطلوب'
    : reraStatus.replaceAll('_', ' ');
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
  const payoutEligible = Boolean(brokerData?.reraVerified && commissionAgreementAccepted && bankName.trim() && bankIban.trim());

  return (
    <BrokerPageFrame
      title={label('Broker Profile', 'ملف الوسيط')}
      subtitle={label('Professional brokerage profile, verification, and security credentials', 'الملف المهني للوساطة، التحقق، وبيانات الأمان')}
      loading={loading}
      actions={null}
    >
      <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
        {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}
        <Grid container spacing={4}>
          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 0, borderRadius: 8, bgcolor: binThemeTokens.softCanvas, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <Box sx={{ height: 120, bgcolor: binThemeTokens.gold, opacity: 0.1 }} />
              <Box sx={{ px: 4, pb: 4, mt: -6, textAlign: 'center' }}>
                <Avatar sx={{ width: 110, height: 110, mx: 'auto', bgcolor: '#020617', border: '4px solid #161618', color: binThemeTokens.gold }}>
                  <Typography variant="h3" fontWeight="950">{displayName?.charAt(0) || <User size={42} />}</Typography>
                </Avatar>
                <Typography variant="h5" fontWeight="950" color={binThemeTokens.textPrimary} sx={{ mt: 2 }}>{displayName || label('Broker', 'الوسيط')}</Typography>
                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, mt: 0.5 }}>{brokerData?.brokerType || label('Institutional Partner', 'شريك مؤسسي')}</Typography>
                <Stack spacing={2} sx={{ mt: 4 }}>
                  <Box sx={{ p: 2, bgcolor: '#F3F4F6', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Briefcase size={18} color="#9CA3AF" />
                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{label('PARTNER ID', 'رقم الشريك')}</Typography>
                      <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 800, fontFamily: 'monospace' }}>BIN-{user?.uid?.substring(0, 8).toUpperCase()}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ p: 2, bgcolor: '#F3F4F6', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Award size={18} color="#9CA3AF" />
                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{label('TIER STATUS', 'فئة الشريك')}</Typography>
                      <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{brokerData?.commissionTier || label('Elite Partner', 'شريك مميز')}</Typography>
                    </Box>
                  </Box>
                </Stack>
              </Box>
            </Paper>

            <Paper sx={{ mt: 4, p: 4, borderRadius: 8, bgcolor: alpha(brokerData?.reraVerified ? '#10b981' : '#f59e0b', 0.03), border: `1px solid ${alpha(brokerData?.reraVerified ? '#10b981' : '#f59e0b', 0.16)}` }}>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                <ShieldCheck size={24} color={brokerData?.reraVerified ? '#10b981' : '#f59e0b'} />
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Typography variant="body1" fontWeight="950" color={brokerData?.reraVerified ? '#10b981' : '#f59e0b'}>{label('RERA Verification', 'تحقق ريرا')}</Typography>
                  <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{reraLicense ? label(`License #${reraLicense} status: ${reraStatusLabel}.`, `حالة الرخصة رقم ${reraLicense}: ${reraStatusLabel}.`) : label('Provide a valid RERA license number to verify the broker profile.', 'أدخل رقم رخصة ريرا صالحًا لتوثيق ملف الوسيط.')}</Typography>
                </Box>
              </Stack>
            </Paper>

            <Paper sx={{ mt: 4, p: 4, borderRadius: 8, bgcolor: '#fff', border: '1px solid #E5E7EB' }}>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography variant="body1" fontWeight="950" color={binThemeTokens.textPrimary}>{label('Broker Readiness', 'جاهزية الوسيط')}</Typography>
                <Chip size="small" label={`${readinessScore}%`} sx={{ bgcolor: alpha(readinessScore === 100 ? '#10b981' : binThemeTokens.gold, 0.12), color: readinessScore === 100 ? '#10b981' : binThemeTokens.gold, fontWeight: 950 }} />
              </Stack>
              <LinearProgress variant="determinate" value={readinessScore} sx={{ height: 7, borderRadius: 99, bgcolor: '#F3F4F6', mb: 2, '& .MuiLinearProgress-bar': { bgcolor: readinessScore === 100 ? '#10b981' : binThemeTokens.gold } }} />
              <Stack spacing={1}>
                {readinessChecks.map((item) => (
                  <Stack key={item.label} direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 850 }}>{item.label}</Typography>
                    <Chip size="small" label={item.complete ? label('Done', 'مكتمل') : label('Missing', 'ناقص')} sx={{ height: 20, bgcolor: alpha(item.complete ? '#10b981' : '#ef4444', 0.1), color: item.complete ? '#10b981' : '#ef4444', fontWeight: 950, fontSize: '0.62rem' }} />
                  </Stack>
                ))}
              </Stack>
              <Alert severity={payoutEligible ? 'success' : 'warning'} sx={{ mt: 2.5 }}>
                {payoutEligible ? label('Payout profile is ready for admin-approved commissions.', 'ملف الدفع جاهز للعمولات المعتمدة من الإدارة.') : label('Payouts stay blocked until RERA, bank/IBAN, and commission terms are complete.', 'تبقى الدفعات معلقة حتى اكتمال ريرا والبنك/الآيبان وشروط العمولة.')}
              </Alert>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={8}>
            <Paper sx={{ p: 5, borderRadius: 8, bgcolor: binThemeTokens.softCanvas, border: '1px solid #E5E7EB' }}>
              <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary} sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Zap size={20} color={binThemeTokens.gold} /> {label('Professional Credentials', 'البيانات المهنية')}
              </Typography>

              <Grid container spacing={4}>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Full Professional Name', 'الاسم المهني الكامل')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} variant="filled" sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Official Email Address', 'البريد الإلكتروني الرسمي')} disabled value={brokerData?.email || user?.email || ''} variant="filled" sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Contact Number', 'رقم التواصل')} value={phone} onChange={(e) => setPhone(e.target.value)} variant="filled" sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Associated Brokerage Firm', 'شركة الوساطة المرتبطة')} value={companyName} onChange={(e) => setCompanyName(e.target.value)} variant="filled" sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('RERA License Number', 'رقم رخصة ريرا')} value={reraLicense} onChange={(e) => setReraLicense(e.target.value)} variant="filled" placeholder={label('e.g. 12345/2026', 'مثال: 12345/2026')} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Primary Region', 'المنطقة الرئيسية')} value={primaryRegion} onChange={(e) => setPrimaryRegion(e.target.value)} variant="filled" sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Trade License Number', 'رقم الرخصة التجارية')} value={tradeLicenseNumber} onChange={(e) => setTradeLicenseNumber(e.target.value)} variant="filled" sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Emirates ID Number', 'رقم الهوية الإماراتية')} value={emiratesIdNumber} onChange={(e) => setEmiratesIdNumber(e.target.value)} variant="filled" sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Passport Number', 'رقم جواز السفر')} value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} variant="filled" sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Broker Territory', 'نطاق عمل الوسيط')} value={brokerTerritory} onChange={(e) => setBrokerTerritory(e.target.value)} variant="filled" placeholder={label('Dubai, Abu Dhabi, Sharjah...', 'دبي، أبوظبي، الشارقة...')} sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Bank Name', 'اسم البنك')} value={bankName} onChange={(e) => setBankName(e.target.value)} variant="filled" sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Account Holder Name', 'اسم صاحب الحساب')} value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)} variant="filled" sx={inputSx} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label={label('IBAN for Commission Payouts', 'الآيبان لمدفوعات العمولة')} value={bankIban} onChange={(e) => setBankIban(e.target.value.toUpperCase())} variant="filled" placeholder="AE00 0000 0000 0000 0000 000" sx={inputSx} /></Grid>
                <Grid item xs={12}>
                  <Paper sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 4 }}>
                    <FormControlLabel
                      control={<Checkbox checked={commissionAgreementAccepted} disabled={Boolean(brokerData?.commissionAgreementAccepted)} onChange={(e) => setCommissionAgreementAccepted(e.target.checked)} sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />}
                      label={<Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 850 }}>{label('I accept BIN GROUP broker commission terms, attribution rules, and payout review requirements.', 'أوافق على شروط عمولة BIN GROUP وقواعد الإسناد ومتطلبات مراجعة الدفعات.')}</Typography>}
                    />
                    {brokerData?.commissionAgreementAcceptedAt && <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{label('Agreement already accepted and locked for audit.', 'تم قبول الاتفاقية وحفظها للتدقيق.')}</Typography>}
                  </Paper>
                </Grid>
              </Grid>

              <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ mt: 6 }}>
                <Button variant="contained" startIcon={<Save size={17} />} onClick={handleSave} disabled={updating} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 5, py: 1.7, borderRadius: 3, boxShadow: `0 10px 20px -5px ${alpha(binThemeTokens.gold, 0.4)}`, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 } }}>
                  {updating ? <CircularProgress size={20} color="inherit" /> : label('Save Credentials', 'حفظ البيانات')}
                </Button>
                <Button variant="outlined" startIcon={<KeyRound size={17} />} onClick={handlePasswordReset} disabled={resetting} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, px: 4, py: 1.7, borderRadius: 3, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 } }}>
                  {resetting ? label('Sending...', 'جارٍ الإرسال...') : label('Send Password Reset', 'إرسال إعادة تعيين كلمة المرور')}
                </Button>
              </Stack>

              <Divider sx={{ my: 6, borderColor: '#F1F2F4' }} />

              <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary} sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>{label('Metrics & History', 'المؤشرات والسجل')}</Typography>
              <Grid container spacing={3}>
                {[
                  { label: label('Joined', 'تاريخ الانضمام'), value: brokerData?.joinedLabel || label('Active Partner', 'شريك نشط'), icon: <Calendar /> },
                  { label: label('Primary Region', 'المنطقة الرئيسية'), value: primaryRegion || label('UAE', 'الإمارات'), icon: <MapPin /> },
                  { label: label('Mission Success', 'نجاح المهام'), value: brokerData?.missionSuccess || label('Not available yet', 'غير متوفر بعد'), icon: <Zap /> },
                ].map((m, i) => (
                  <Grid item xs={12} sm={4} key={i}>
                    <Box sx={{ p: 3, bgcolor: '#F3F4F6', borderRadius: 6, border: '1px solid #E5E7EB', textAlign: isRTL ? 'right' : 'left' }}>
                      <Box sx={{ color: binThemeTokens.gold, mb: 1 }}>{m.icon}</Box>
                      <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 1, display: 'block', mb: 1 }}>{m.label}</Typography>
                      <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary}>{m.value}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </BrokerPageFrame>
  );
}
