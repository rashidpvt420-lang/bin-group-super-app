import React, { useState, useEffect } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Award, Briefcase, Building2, Calendar, CreditCard, Eye, EyeOff, KeyRound, MapPin, Save, ShieldCheck, User, Zap } from 'lucide-react';
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

function maskIban(iban: string): string {
  const clean = iban.replace(/\s/g, '');
  if (clean.length <= 6) return clean;
  return clean.substring(0, 4) + ' **** **** ' + clean.substring(clean.length - 4);
}

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
  const [bankIban, setBankIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [showIban, setShowIban] = useState(false);

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
        setBankIban(data.bankIban || '');
        setBankName(data.bankName || '');
        setBankAccountHolder(data.bankAccountHolder || '');
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
    const hasAnyBankField = bankIban.trim() || bankName.trim() || bankAccountHolder.trim();
    if (hasAnyBankField) {
      if (!bankIban.trim() || !bankName.trim() || !bankAccountHolder.trim()) {
        setNotice({ type: 'warning', text: label('All three bank account fields are required together.', 'جميع حقول الحساب المصرفي الثلاثة مطلوبة معًا.') });
        return;
      }
      if (!bankIban.trim().toUpperCase().startsWith('AE')) {
        setNotice({ type: 'warning', text: label('IBAN must start with AE for UAE bank accounts.', 'يجب أن يبدأ رقم الآيبان بـ AE للحسابات المصرفية الإماراتية.') });
        return;
      }
    }
    setUpdating(true);
    setNotice(null);
    try {
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      const isLicenseChanged = reraLicense.trim() !== (brokerData?.reraLicense || '').trim();
      const reraStatus = isLicenseChanged ? (reraLicense.trim() ? 'PENDING' : 'NOT_SUBMITTED') : (brokerData?.reraStatus || 'NOT_SUBMITTED');
      const reraVerified = isLicenseChanged ? false : Boolean(brokerData?.reraVerified);
      const isTLChanged = tradeLicenseNumber.trim() !== (brokerData?.tradeLicenseNumber || '').trim();
      const tradeLicenseStatus = isTLChanged ? (tradeLicenseNumber.trim() ? 'PENDING' : 'NOT_SUBMITTED') : (brokerData?.tradeLicenseStatus || 'NOT_SUBMITTED');
      const tradeLicenseVerified = isTLChanged ? false : Boolean(brokerData?.tradeLicenseVerified);
      const payload = {
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
        tradeLicenseNumber: tradeLicenseNumber.trim(),
        tradeLicenseStatus,
        tradeLicenseVerified,
        bankIban: bankIban.trim().toUpperCase(),
        bankName: bankName.trim(),
        bankAccountHolder: bankAccountHolder.trim(),
        primaryRegion: primaryRegion.trim(),
        language: lang,
        updatedAt: serverTimestamp(),
      };
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

  const tlStatus = (brokerData?.tradeLicenseStatus || 'NOT_SUBMITTED').toString();
  const tlStatusLabel = lang === 'ar'
    ? tlStatus === 'PENDING' ? 'قيد المراجعة' : tlStatus === 'REJECTED' ? 'مرفوض' : brokerData?.tradeLicenseVerified ? 'موثق' : 'مطلوب'
    : tlStatus.replaceAll('_', ' ');

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

            <Paper sx={{ mt: 3, p: 4, borderRadius: 8, bgcolor: alpha(brokerData?.tradeLicenseVerified ? '#10b981' : '#6366f1', 0.03), border: `1px solid ${alpha(brokerData?.tradeLicenseVerified ? '#10b981' : '#6366f1', 0.16)}` }}>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                <Building2 size={24} color={brokerData?.tradeLicenseVerified ? '#10b981' : '#6366f1'} />
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Typography variant="body1" fontWeight="950" color={brokerData?.tradeLicenseVerified ? '#10b981' : '#6366f1'}>{label('Trade License', 'الرخصة التجارية')}</Typography>
                  <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{tradeLicenseNumber ? label(`License #${tradeLicenseNumber} status: ${tlStatusLabel}.`, `حالة الرخصة رقم ${tradeLicenseNumber}: ${tlStatusLabel}.`) : label('Provide a valid trade license number to complete your business profile.', 'أدخل رقم الرخصة التجارية الصالح لاستكمال ملفك التجاري.')}</Typography>
                </Box>
              </Stack>
            </Paper>

            {brokerData?.bankIban && (
              <Paper sx={{ mt: 3, p: 4, borderRadius: 8, bgcolor: alpha('#10b981', 0.03), border: `1px solid ${alpha('#10b981', 0.16)}` }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                  <CreditCard size={24} color="#10b981" />
                  <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="body1" fontWeight="950" color="#10b981">{label('Payout Account', 'حساب الصرف')}</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700, fontFamily: 'monospace' }}>{maskIban(brokerData.bankIban)}</Typography>
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{brokerData.bankName}</Typography>
                  </Box>
                </Stack>
              </Paper>
            )}
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
                <Grid item xs={12} md={6}><TextField fullWidth label={label('Trade License Number', 'رقم الرخصة التجارية')} value={tradeLicenseNumber} onChange={(e) => setTradeLicenseNumber(e.target.value)} variant="filled" placeholder={label('e.g. CN-1234567', 'مثال: CN-1234567')} sx={inputSx} /></Grid>
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

              <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary} sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left' }}>
                <CreditCard size={20} color={binThemeTokens.gold} /> {label('Commission Payout Account', 'حساب صرف العمولات')}
              </Typography>
              <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                {label('Add your UAE bank account to receive commission disbursements. IBAN must start with AE.', 'أضف حسابك المصرفي الإماراتي لاستلام صرف العمولات. يجب أن يبدأ رقم الآيبان بـ AE.')}
              </Typography>
              <Grid container spacing={4}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label={label('IBAN (AE...)', 'رقم الآيبان (AE...)')}
                    value={showIban ? bankIban : (bankIban ? maskIban(bankIban) : '')}
                    onChange={(e) => { if (showIban) setBankIban(e.target.value.toUpperCase()); }}
                    onFocus={() => setShowIban(true)}
                    onBlur={() => setShowIban(false)}
                    variant="filled"
                    placeholder="AE07 0331 2345 6789 0123 456"
                    sx={inputSx}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowIban(!showIban)} size="small" edge="end">
                            {showIban ? <EyeOff size={16} /> : <Eye size={16} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label={label('Bank Name', 'اسم البنك')} value={bankName} onChange={(e) => setBankName(e.target.value)} variant="filled" placeholder={label('e.g. Emirates NBD', 'مثال: بنك الإمارات دبي الوطني')} sx={inputSx} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label={label('Account Holder Name', 'اسم صاحب الحساب')} value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)} variant="filled" placeholder={label('Full name as on bank records', 'الاسم الكامل كما في سجلات البنك')} sx={inputSx} />
                </Grid>
              </Grid>

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
