import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Stack, Avatar, CircularProgress, Chip, TextField, Button, Switch, FormControlLabel, Divider, Alert } from '@mui/material';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { db, auth, doc, setDoc, getDoc, updateProfile, sendPasswordResetEmail, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { User, Phone, Mail, Wrench, Star, Clock, Save, KeyRound, MapPin } from 'lucide-react';

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };

const inputSx = {
    '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF', borderRadius: 2 },
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,.5)' },
};

export default function TechnicianProfilePage() {
    const { user } = useRole();
    const { isRTL, lang } = useLanguage();
    const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [techData, setTechData] = useState<any>(null);
    const [notice, setNotice] = useState<Notice | null>(null);

    const [displayName, setDisplayName] = useState('');
    const [phone, setPhone] = useState('');
    const [trade, setTrade] = useState('');
    const [serviceZone, setServiceZone] = useState('');
    const [emergencyName, setEmergencyName] = useState('');
    const [emergencyPhone, setEmergencyPhone] = useState('');
    const [isAvailable, setIsAvailable] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }
            try {
                const snap = await getDoc(doc(db, 'users', user.uid));
                const data = snap.exists() ? snap.data() : {};
                setTechData(data);
                setDisplayName(data.displayName || user.displayName || '');
                setPhone(data.phoneNumber || data.phone || user.phoneNumber || '');
                setTrade(data.trade || data.specialty || data.primaryTrade || label('General Maintenance', 'صيانة عامة'));
                setServiceZone(data.serviceZone || data.zone || data.city || '');
                setEmergencyName(data.emergencyContact?.name || '');
                setEmergencyPhone(data.emergencyContact?.phone || '');
                setIsAvailable(data.isAvailable !== false);
            } catch (err) {
                console.error('Profile fetch failed:', err);
                setNotice({ type: 'error', text: label('Technician profile could not be loaded.', 'تعذر تحميل ملف الفني.') });
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [user?.uid, user?.displayName, user?.phoneNumber, lang]);

    const handleSave = async () => {
        if (!user?.uid) return;
        if (!displayName.trim()) {
            setNotice({ type: 'warning', text: label('Full name is required.', 'الاسم الكامل مطلوب.') });
            return;
        }
        setUpdating(true);
        setNotice(null);
        try {
            if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: displayName.trim() });
            const normalizedTrade = trade.trim() || label('General Maintenance', 'صيانة عامة');
            const payload = {
                uid: user.uid,
                email: user.email || techData?.email || '',
                role: techData?.role || 'technician',
                displayName: displayName.trim(),
                phoneNumber: phone.trim(),
                phone: phone.trim(),
                trade: normalizedTrade,
                specialty: normalizedTrade,
                serviceZone: serviceZone.trim(),
                emergencyContact: { name: emergencyName.trim(), phone: emergencyPhone.trim() },
                isAvailable,
                language: lang,
                updatedAt: serverTimestamp(),
            };
            await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
            setTechData((prev: any) => ({ ...prev, ...payload }));
            setNotice({ type: 'success', text: label('Technician profile updated successfully.', 'تم تحديث ملف الفني بنجاح.') });
        } catch (err: any) {
            console.error('Update failed', err);
            setNotice({ type: 'error', text: err?.message || label('Failed to update technician profile.', 'فشل تحديث ملف الفني.') });
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
            await sendPasswordResetEmail(auth, user.email, { url: `${window.location.origin}/login?email=${encodeURIComponent(user.email)}&intendedRole=technician`, handleCodeInApp: false });
            setNotice({ type: 'success', text: label('Password reset email sent. Check inbox or spam folder.', 'تم إرسال رابط إعادة تعيين كلمة المرور. تحقق من البريد الوارد أو الرسائل غير المرغوب فيها.') });
        } catch (err: any) {
            setNotice({ type: 'error', text: err?.message || label('Could not send password reset email.', 'تعذر إرسال بريد إعادة تعيين كلمة المرور.') });
        } finally {
            setResetting(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    const score = techData?.qualityScore || techData?.rating || label('Pending', 'قيد الانتظار');
    const sla = techData?.slaCompliance || techData?.slaScore || label('Pending', 'قيد الانتظار');
    const status = (techData?.status || 'pending').toString();
    const localizedStatus = lang === 'ar'
        ? status.toLowerCase() === 'active' ? 'نشط' : status.toLowerCase() === 'pending' ? 'قيد الانتظار' : status.toLowerCase() === 'suspended' ? 'موقوف' : status
        : status.toUpperCase();

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 4, textAlign: isRTL ? 'right' : 'left' }}>{label('Technician Profile', 'ملف الفني')}</Typography>
            {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}

            <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={4} alignItems="center" sx={{ mb: 4 }}>
                    <Avatar sx={{ width: 100, height: 100, bgcolor: binThemeTokens.gold, color: '#000' }}>
                        {displayName?.charAt(0) || <User size={40} />}
                    </Avatar>
                    <Box sx={{ textAlign: { xs: 'center', md: isRTL ? 'right' : 'left' } }}>
                        <Typography variant="h5" fontWeight="900" color="#FFF">{displayName || label('Technician', 'الفني')}</Typography>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Mail size={16} /><Typography variant="body2">{techData?.email || user?.email}</Typography>
                        </Stack>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Phone size={16} /><Typography variant="body2">{phone || label('No phone registered', 'لا يوجد رقم هاتف مسجل')}</Typography>
                        </Stack>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Wrench size={16} /><Typography variant="body2">{trade || label('General Maintenance', 'صيانة عامة')}</Typography>
                        </Stack>
                        {serviceZone && <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}><MapPin size={16} /><Typography variant="body2">{serviceZone}</Typography></Stack>}
                    </Box>
                </Stack>

                <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">{label('ACCOUNT STATUS', 'حالة الحساب')}</Typography><Box sx={{ mt: 1 }}><Chip label={localizedStatus} color={status === 'active' ? 'success' : 'warning'} size="small" sx={{ fontWeight: 900 }} /></Box></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">{label('QUALITY SCORE', 'تقييم الجودة')}</Typography><Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" spacing={1} sx={{ mt: 1, color: binThemeTokens.gold }}><Star size={18} fill={binThemeTokens.gold} /><Typography variant="body1" fontWeight="900" color="#FFF">{typeof score === 'number' ? `${score}/5` : score}</Typography></Stack></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">{label('SLA COMPLIANCE', 'الالتزام بزمن الخدمة')}</Typography><Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" spacing={1} sx={{ mt: 1, color: '#4ade80' }}><Clock size={18} /><Typography variant="body1" fontWeight="900" color="#FFF">{typeof sla === 'number' ? `${sla}%` : sla}</Typography></Stack></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">{label('DISPATCH', 'الإرسال')}</Typography><Box sx={{ mt: 1 }}><Chip label={isAvailable ? label('AVAILABLE', 'متاح') : label('OFF DUTY', 'خارج الدوام')} color={isAvailable ? 'success' : 'default'} size="small" sx={{ fontWeight: 900 }} /></Box></Grid>
                </Grid>

                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', my: 4 }} />

                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 3, textAlign: isRTL ? 'right' : 'left' }}>{label('Edit Details', 'تعديل البيانات')}</Typography>
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Full Name', 'الاسم الكامل')} value={displayName} onChange={e => setDisplayName(e.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Phone Number', 'رقم الهاتف')} value={phone} onChange={e => setPhone(e.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Primary Trade', 'التخصص الرئيسي')} value={trade} onChange={e => setTrade(e.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Service Zone', 'منطقة الخدمة')} value={serviceZone} onChange={e => setServiceZone(e.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Emergency Contact Name', 'اسم جهة الاتصال للطوارئ')} value={emergencyName} onChange={e => setEmergencyName(e.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Emergency Contact Phone', 'هاتف جهة الاتصال للطوارئ')} value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6} sx={{ display: 'flex', alignItems: 'center' }}><FormControlLabel control={<Switch checked={isAvailable} onChange={e => setIsAvailable(e.target.checked)} color="primary" />} label={<Typography color="#FFF" fontWeight="900">{label('Available for Dispatch', 'متاح لاستقبال المهام')}</Typography>} sx={{ mr: isRTL ? 0 : undefined, ml: isRTL ? 0 : undefined }} /></Grid>
                </Grid>
                
                <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2}>
                    <Button variant="contained" startIcon={<Save size={17} />} onClick={handleSave} disabled={updating} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 4, py: 1.5, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 } }}>{updating ? <CircularProgress size={24} color="inherit" /> : label('SAVE CHANGES', 'حفظ التغييرات')}</Button>
                    <Button variant="outlined" startIcon={<KeyRound size={17} />} onClick={handlePasswordReset} disabled={resetting} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, px: 4, py: 1.5, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 } }}>{resetting ? label('SENDING...', 'جارٍ الإرسال...') : label('SEND PASSWORD RESET', 'إرسال إعادة تعيين كلمة المرور')}</Button>
                </Stack>
            </Paper>
        </Box>
    );
}
