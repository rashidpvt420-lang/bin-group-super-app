import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Avatar, CircularProgress, Chip, Stack, TextField, Button, Alert, Divider } from '@mui/material';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { db, auth, collection, query, where, getDocs, doc, getDoc, setDoc, updateProfile, sendPasswordResetEmail, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { User, Phone, Mail, Save, KeyRound } from 'lucide-react';
import { pickProfileCover, pickProfilePhoto, profileCoverSx } from '../../utils/profileImages';

const inputSx = {
    '& .MuiOutlinedInput-root': { color: '#FFF', bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 },
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
};

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };

export default function TenantProfilePage() {
    const { user } = useRole();
    const { isRTL, lang } = useLanguage();
    const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [unitData, setUnitData] = useState<any>(null);
    const [propertyData, setPropertyData] = useState<any>(null);
    const [profileData, setProfileData] = useState<any>(null);
    const [displayName, setDisplayName] = useState('');
    const [phone, setPhone] = useState('');
    const [emergencyName, setEmergencyName] = useState('');
    const [emergencyPhone, setEmergencyPhone] = useState('');
    const [notice, setNotice] = useState<Notice | null>(null);

    useEffect(() => {
        const fetchProfileData = async () => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }
            try {
                const userSnap = await getDoc(doc(db, 'users', user.uid));
                const userData = userSnap.exists() ? userSnap.data() : {};
                setProfileData(userData);
                setDisplayName(userData.displayName || user.displayName || '');
                setPhone(userData.phoneNumber || userData.phone || user.phoneNumber || '');
                setEmergencyName(userData.emergencyContact?.name || '');
                setEmergencyPhone(userData.emergencyContact?.phone || '');

                let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid)));
                if (unitSnap.empty) unitSnap = await getDocs(query(collection(db, 'units'), where('tenantUid', '==', user.uid)));
                if (unitSnap.empty && user.email) unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', user.email.toLowerCase())));
                
                if (!unitSnap.empty) {
                    const uData: any = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() };
                    setUnitData(uData);

                    if (uData.propertyId) {
                        const propSnap = await getDocs(query(collection(db, 'properties'), where('__name__', '==', uData.propertyId)));
                        if (!propSnap.empty) setPropertyData(propSnap.docs[0].data());
                    }
                }
            } catch (err) {
                console.error('Profile fetch failed:', err);
                setNotice({ type: 'error', text: label('Tenant profile could not be loaded.', 'تعذر تحميل ملف المستأجر.') });
            } finally {
                setLoading(false);
            }
        };
        fetchProfileData();
    }, [user?.uid, user?.email, user?.displayName, user?.phoneNumber, lang]);

    const handleSave = async () => {
        if (!user?.uid) return;
        if (!displayName.trim()) {
            setNotice({ type: 'warning', text: label('Full name is required.', 'الاسم الكامل مطلوب.') });
            return;
        }
        setSaving(true);
        setNotice(null);
        try {
            if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: displayName.trim() });
            await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                email: user.email || profileData?.email || '',
                role: profileData?.role || 'tenant',
                displayName: displayName.trim(),
                phoneNumber: phone.trim(),
                phone: phone.trim(),
                language: lang,
                emergencyContact: {
                    name: emergencyName.trim(),
                    phone: emergencyPhone.trim(),
                },
                updatedAt: serverTimestamp(),
            }, { merge: true });
            setProfileData((prev: any) => ({ ...prev, displayName: displayName.trim(), phoneNumber: phone.trim(), phone: phone.trim(), emergencyContact: { name: emergencyName.trim(), phone: emergencyPhone.trim() } }));
            setNotice({ type: 'success', text: label('Tenant profile updated successfully.', 'تم تحديث ملف المستأجر بنجاح.') });
        } catch (err: any) {
            console.error('Tenant profile update failed:', err);
            setNotice({ type: 'error', text: err?.message || label('Failed to update tenant profile.', 'فشل تحديث ملف المستأجر.') });
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
            await sendPasswordResetEmail(auth, user.email, { url: `${window.location.origin}/login?email=${encodeURIComponent(user.email)}&intendedRole=tenant`, handleCodeInApp: false });
            setNotice({ type: 'success', text: label('Password reset email sent. Check inbox or spam folder.', 'تم إرسال رابط إعادة تعيين كلمة المرور. تحقق من البريد الوارد أو الرسائل غير المرغوب فيها.') });
        } catch (err: any) {
            setNotice({ type: 'error', text: err?.message || label('Could not send password reset email.', 'تعذر إرسال بريد إعادة تعيين كلمة المرور.') });
        } finally {
            setResetting(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    const profilePhoto = pickProfilePhoto(profileData, user);
    const profileCover = pickProfileCover(profileData, user);

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
                {label('Tenant Profile', 'ملف المستأجر')}
            </Typography>

            {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}

            <Paper sx={{ p: 4, mb: 4, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, ...profileCoverSx(profileCover) }}>
                <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={4} alignItems="center" sx={{ mb: 4 }}>
                    <Avatar src={profilePhoto || undefined} sx={{ width: 100, height: 100, bgcolor: binThemeTokens.gold, color: '#000', border: '4px solid rgba(255,255,255,0.18)', boxShadow: '0 18px 42px rgba(0,0,0,0.35)' }}>
                        {displayName?.charAt(0) || user?.displayName?.charAt(0) || <User size={40} />}
                    </Avatar>
                    <Box sx={{ textAlign: { xs: 'center', md: isRTL ? 'right' : 'left' }, width: '100%' }}>
                        <Typography variant="h5" fontWeight="900" color="#FFF">{displayName || label('Resident', 'المقيم')}</Typography>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'rgba(255,255,255,0.78)' }}>
                            <Mail size={16} />
                            <Typography variant="body2">{user?.email}</Typography>
                        </Stack>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'rgba(255,255,255,0.78)' }}>
                            <Phone size={16} />
                            <Typography variant="body2">{phone || label('No phone registered', 'لا يوجد رقم هاتف مسجل')}</Typography>
                        </Stack>
                    </Box>
                </Stack>

                <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)', mb: 3 }} />
                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 3, textAlign: isRTL ? 'right' : 'left' }}>{label('Editable Details', 'البيانات القابلة للتعديل')}</Typography>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Full Name', 'الاسم الكامل')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Phone Number', 'رقم الهاتف')} value={phone} onChange={(e) => setPhone(e.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Emergency Contact Name', 'اسم جهة الاتصال للطوارئ')} value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Emergency Contact Phone', 'هاتف جهة الاتصال للطوارئ')} value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} sx={inputSx} /></Grid>
                </Grid>
                <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ mt: 4 }}>
                    <Button variant="contained" startIcon={<Save size={17} />} onClick={handleSave} disabled={saving} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 } }}>{saving ? label('Saving...', 'جارٍ الحفظ...') : label('Save Profile', 'حفظ الملف')}</Button>
                    <Button variant="outlined" startIcon={<KeyRound size={17} />} onClick={handlePasswordReset} disabled={resetting} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 } }}>{resetting ? label('Sending...', 'جارٍ الإرسال...') : label('Send Password Reset', 'إرسال إعادة تعيين كلمة المرور')}</Button>
                </Stack>
            </Paper>

            <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF', mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                {label('Assigned Residency', 'السكن المخصص')}
            </Typography>
            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}>
                {unitData ? (
                    <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="caption" color="textSecondary">{label('PROPERTY NAME', 'اسم العقار')}</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF">{propertyData?.name || propertyData?.propertyName || label('Assigned Property', 'العقار المخصص')}</Typography>
                            <Typography variant="body2" color="textSecondary">{propertyData?.address}</Typography>
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <Typography variant="caption" color="textSecondary">{label('UNIT NUMBER', 'رقم الوحدة')}</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF">{unitData.unitNumber || '—'}</Typography>
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <Typography variant="caption" color="textSecondary">{label('FLOOR', 'الطابق')}</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF">{unitData.floorNumber || '—'}</Typography>
                        </Grid>
                        <Grid item xs={12}>
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mt: 2 }}>
                                <Typography variant="caption" color="textSecondary">{label('STATUS', 'الحالة')}</Typography>
                                <Chip label={unitData.status || label('ACTIVE', 'نشط')} size="small" sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 900 }} />
                            </Stack>
                        </Grid>
                    </Grid>
                ) : (
                    <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 3 }}>
                        {label('No residency assigned to this account.', 'لا يوجد سكن مخصص لهذا الحساب.')}
                    </Typography>
                )}
            </Paper>
        </Box>
    );
}
