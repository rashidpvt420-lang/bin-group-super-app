import React, { useEffect, useState } from 'react';
import { Alert, Avatar, Box, Button, CircularProgress, Divider, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { Building2, KeyRound, Mail, Phone, Save, Shield, User } from 'lucide-react';
import { auth, db, doc, functions, getDoc, httpsCallable, sendPasswordResetEmail } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { pickProfileCover, pickProfilePhoto, profileCoverSx } from '../../utils/profileImages';

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };

const inputSx = {
  '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
  '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.35)' },
};

export default function OwnerProfilePage() {
  const { user } = useRole();
  const { isRTL, lang } = useLanguage();
  const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [billingName, setBillingName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingPhone, setBillingPhone] = useState('');
  const [preferredContact, setPreferredContact] = useState('email');
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
        setProfileData(data);
        setDisplayName(data.displayName || user.displayName || '');
        setPhone(data.phoneNumber || data.phone || user.phoneNumber || '');
        setCompanyName(data.companyName || data.ownerCompanyName || data.companyProfile?.name || '');
        setBillingName(data.billingContact?.name || data.billingName || data.displayName || user.displayName || '');
        setBillingEmail(data.billingContact?.email || data.billingEmail || user.email || '');
        setBillingPhone(data.billingContact?.phone || data.billingPhone || data.phoneNumber || data.phone || user.phoneNumber || '');
        setPreferredContact(data.notificationPreferences?.preferredContact || data.preferredContact || 'email');
      } catch (error) {
        console.error('[OwnerProfile] load failed:', error);
        setNotice({ type: 'error', text: label('Owner profile could not be loaded.', 'تعذر تحميل ملف المالك.') });
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [user?.uid, user?.displayName, user?.email, user?.phoneNumber, lang]);

  const handleSave = async () => {
    if (!user?.uid) return;
    if (!displayName.trim()) {
      setNotice({ type: 'warning', text: label('Owner full name is required.', 'اسم المالك الكامل مطلوب.') });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const updateOwnerProfile = httpsCallable(functions, 'updateVerifiedOwnerProfile');
      const result: any = await updateOwnerProfile({
        displayName: displayName.trim(),
        phone: phone.trim(),
        companyName: companyName.trim(),
        billingContact: {
          name: billingName.trim(),
          email: billingEmail.trim().toLowerCase(),
          phone: billingPhone.trim(),
        },
        preferredContact,
        language: lang,
      });
      const confirmed = result?.data?.profile || {};
      setProfileData((prev: any) => ({
        ...prev,
        displayName: confirmed.displayName || displayName.trim(),
        phoneNumber: confirmed.phoneNumber || phone.trim(),
        phone: confirmed.phoneNumber || phone.trim(),
        companyName: confirmed.companyName || companyName.trim(),
        ownerCompanyName: confirmed.companyName || companyName.trim(),
        billingContact: confirmed.billingContact || {
          name: billingName.trim(),
          email: billingEmail.trim().toLowerCase(),
          phone: billingPhone.trim(),
        },
        notificationPreferences: {
          ...(prev?.notificationPreferences || {}),
          preferredContact,
          language: lang,
        },
      }));
      setNotice({ type: 'success', text: label('Verified Owner profile updated successfully.', 'تم تحديث ملف المالك الموثق بنجاح.') });
    } catch (error: any) {
      console.error('[OwnerProfile] save failed:', error);
      setNotice({ type: 'error', text: error?.message || label('Failed to update verified Owner profile.', 'فشل تحديث ملف المالك الموثق.') });
    } finally {
      setSaving(false);
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
        url: `${window.location.origin}/login?email=${encodeURIComponent(user.email)}&intendedRole=owner`,
        handleCodeInApp: false,
      });
      setNotice({ type: 'success', text: label('Password reset email sent. Check inbox or spam folder.', 'تم إرسال رابط إعادة تعيين كلمة المرور. تحقق من البريد الوارد أو الرسائل غير المرغوب فيها.') });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || label('Could not send password reset email.', 'تعذر إرسال بريد إعادة تعيين كلمة المرور.') });
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  const profilePhoto = pickProfilePhoto(profileData, user);
  const profileCover = pickProfileCover(profileData, user);

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1, textAlign: isRTL ? 'right' : 'left' }}>{label('Owner Profile', 'ملف المالك')}</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', mb: 4, textAlign: isRTL ? 'right' : 'left' }}>{label('Identity and billing changes are verified against Firebase Auth and Owner KYC records before they are accepted.', 'يتم التحقق من تغييرات الهوية والفوترة مقابل مصادقة Firebase وسجلات اعرف عميلك للمالك قبل قبولها.')}</Typography>
      {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <Paper sx={{ p: 4, mb: 4, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, ...profileCoverSx(profileCover) }}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={4} alignItems="center" sx={{ mb: 4 }}>
          <Avatar src={profilePhoto || undefined} sx={{ width: 104, height: 104, bgcolor: binThemeTokens.gold, color: '#000', border: '4px solid rgba(255,255,255,0.18)', boxShadow: '0 18px 42px rgba(0,0,0,0.35)' }}>{displayName?.charAt(0) || <User size={42} />}</Avatar>
          <Box sx={{ width: '100%', textAlign: { xs: 'center', md: isRTL ? 'right' : 'left' } }}>
            <Typography variant="h5" fontWeight="950" color="#FFF">{displayName || label('Owner', 'المالك')}</Typography>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'rgba(255,255,255,0.78)' }}><Mail size={16} /><Typography variant="body2">{user?.email}</Typography></Stack>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'rgba(255,255,255,0.78)' }}><Phone size={16} /><Typography variant="body2">{phone || label('No phone registered', 'لا يوجد رقم هاتف مسجل')}</Typography></Stack>
            {companyName && <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'rgba(255,255,255,0.78)' }}><Building2 size={16} /><Typography variant="body2">{companyName}</Typography></Stack>}
          </Box>
        </Stack>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)', mb: 4 }} />
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}><TextField fullWidth label={label('Owner Full Name', 'اسم المالك الكامل')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} sx={inputSx} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label={label('Verified Mobile Number', 'رقم الهاتف المتحرك الموثق')} value={phone} onChange={(e) => setPhone(e.target.value)} helperText={label('A changed number must already be verified in Firebase Authentication.', 'يجب أن يكون الرقم الجديد موثقاً مسبقاً في مصادقة Firebase.')} sx={inputSx} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label={label('Verified Company / Portfolio Name', 'اسم الشركة / المحفظة الموثق')} value={companyName} onChange={(e) => setCompanyName(e.target.value)} helperText={label('Legal changes must match the verified Owner KYC record.', 'يجب أن تتطابق التغييرات القانونية مع سجل اعرف عميلك الموثق للمالك.')} sx={inputSx} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label={label('Preferred Contact Channel', 'قناة التواصل المفضلة')} value={preferredContact} onChange={(e) => setPreferredContact(e.target.value)} helperText={label('email, phone, whatsapp', 'البريد الإلكتروني، الهاتف، واتساب')} sx={inputSx} /></Grid>
          <Grid item xs={12}><Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mt: 2 }}>{label('Verified Billing Contact', 'جهة اتصال الفوترة الموثقة')}</Typography></Grid>
          <Grid item xs={12} md={4}><TextField fullWidth label={label('Billing Name', 'اسم جهة الفوترة')} value={billingName} onChange={(e) => setBillingName(e.target.value)} sx={inputSx} /></Grid>
          <Grid item xs={12} md={4}><TextField fullWidth label={label('Billing Email', 'بريد الفوترة الإلكتروني')} value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} sx={inputSx} /></Grid>
          <Grid item xs={12} md={4}><TextField fullWidth label={label('Billing Phone', 'هاتف الفوترة')} value={billingPhone} onChange={(e) => setBillingPhone(e.target.value)} sx={inputSx} /></Grid>
        </Grid>

        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ mt: 4 }}>
          <Button variant="contained" startIcon={<Save size={17} />} onClick={handleSave} disabled={saving} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 } }}>{saving ? label('Verifying and saving...', 'جارٍ التحقق والحفظ...') : label('Save Verified Profile', 'حفظ الملف الموثق')}</Button>
          <Button variant="outlined" startIcon={<KeyRound size={17} />} onClick={handlePasswordReset} disabled={resetting} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 } }}>{resetting ? label('Sending...', 'جارٍ الإرسال...') : label('Send Password Reset', 'إرسال إعادة تعيين كلمة المرور')}</Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, bgcolor: 'rgba(198,167,94,0.06)', border: '1px solid rgba(198,167,94,0.2)', borderRadius: 4 }}>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center"><Shield color={binThemeTokens.gold} /><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>{label('Sensitive changes are server-validated and recorded in immutable audit history. IBAN and payout details remain managed separately.', 'يتم التحقق من التغييرات الحساسة على الخادم وتسجيلها في سجل تدقيق غير قابل للتغيير. تظل تفاصيل الآيبان والتحويلات مُدارة بشكل منفصل.')}</Typography></Stack>
      </Paper>
    </Box>
  );
}
