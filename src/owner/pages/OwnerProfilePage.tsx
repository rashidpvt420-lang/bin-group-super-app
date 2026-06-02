import React, { useEffect, useState } from 'react';
import { Alert, Avatar, Box, Button, CircularProgress, Divider, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { Building2, KeyRound, Mail, Phone, Save, Shield, User } from 'lucide-react';
import { auth, db, doc, getDoc, sendPasswordResetEmail, serverTimestamp, setDoc, updateProfile } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };

const inputSx = {
  '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
  '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.35)' },
};

export default function OwnerProfilePage() {
  const { user } = useRole();
  const { isRTL, lang } = useLanguage();
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
        setNotice({ type: 'error', text: 'Owner profile could not be loaded.' });
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [user?.uid, user?.displayName, user?.email, user?.phoneNumber]);

  const handleSave = async () => {
    if (!user?.uid) return;
    if (!displayName.trim()) {
      setNotice({ type: 'warning', text: 'Owner full name is required.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      const payload = {
        uid: user.uid,
        email: user.email || profileData?.email || '',
        role: profileData?.role || 'owner',
        displayName: displayName.trim(),
        phoneNumber: phone.trim(),
        phone: phone.trim(),
        companyName: companyName.trim(),
        ownerCompanyName: companyName.trim(),
        billingContact: {
          name: billingName.trim(),
          email: billingEmail.trim().toLowerCase(),
          phone: billingPhone.trim(),
        },
        notificationPreferences: {
          ...(profileData?.notificationPreferences || {}),
          preferredContact,
          language: lang,
        },
        language: lang,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
      setProfileData((prev: any) => ({ ...prev, ...payload }));
      setNotice({ type: 'success', text: 'Owner profile updated successfully.' });
    } catch (error: any) {
      console.error('[OwnerProfile] save failed:', error);
      setNotice({ type: 'error', text: error?.message || 'Failed to update owner profile.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
      setNotice({ type: 'warning', text: 'No email is attached to this account.' });
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
      setNotice({ type: 'success', text: 'Password reset email sent. Check inbox or spam folder.' });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Could not send password reset email.' });
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1, textAlign: isRTL ? 'right' : 'left' }}>Owner Profile</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', mb: 4, textAlign: isRTL ? 'right' : 'left' }}>Manage identity, billing contact, notification preference, and account recovery.</Typography>
      {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={4} alignItems="center" sx={{ mb: 4 }}>
          <Avatar sx={{ width: 104, height: 104, bgcolor: binThemeTokens.gold, color: '#000' }}>{displayName?.charAt(0) || <User size={42} />}</Avatar>
          <Box sx={{ width: '100%', textAlign: { xs: 'center', md: isRTL ? 'right' : 'left' } }}>
            <Typography variant="h5" fontWeight="950" color="#FFF">{displayName || 'Owner'}</Typography>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}><Mail size={16} /><Typography variant="body2">{user?.email}</Typography></Stack>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}><Phone size={16} /><Typography variant="body2">{phone || 'No phone registered'}</Typography></Stack>
            {companyName && <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}><Building2 size={16} /><Typography variant="body2">{companyName}</Typography></Stack>}
          </Box>
        </Stack>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 4 }} />
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}><TextField fullWidth label="Owner Full Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} sx={inputSx} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label="Mobile Number" value={phone} onChange={(e) => setPhone(e.target.value)} sx={inputSx} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label="Company / Portfolio Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} sx={inputSx} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label="Preferred Contact Channel" value={preferredContact} onChange={(e) => setPreferredContact(e.target.value)} helperText="email, phone, whatsapp" sx={inputSx} /></Grid>
          <Grid item xs={12}><Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mt: 2 }}>Billing Contact</Typography></Grid>
          <Grid item xs={12} md={4}><TextField fullWidth label="Billing Name" value={billingName} onChange={(e) => setBillingName(e.target.value)} sx={inputSx} /></Grid>
          <Grid item xs={12} md={4}><TextField fullWidth label="Billing Email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} sx={inputSx} /></Grid>
          <Grid item xs={12} md={4}><TextField fullWidth label="Billing Phone" value={billingPhone} onChange={(e) => setBillingPhone(e.target.value)} sx={inputSx} /></Grid>
        </Grid>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
          <Button variant="contained" startIcon={<Save size={17} />} onClick={handleSave} disabled={saving} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{saving ? 'Saving...' : 'Save Owner Profile'}</Button>
          <Button variant="outlined" startIcon={<KeyRound size={17} />} onClick={handlePasswordReset} disabled={resetting} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}>{resetting ? 'Sending...' : 'Send Password Reset'}</Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, bgcolor: 'rgba(198,167,94,0.06)', border: '1px solid rgba(198,167,94,0.2)', borderRadius: 4 }}>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center"><Shield color={binThemeTokens.gold} /><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>Your IBAN and payout details remain managed separately under Owner → IBAN / Payout Accounts.</Typography></Stack>
      </Paper>
    </Box>
  );
}
