import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Avatar, Box, Button, Chip, CircularProgress, Divider, FormControlLabel, Grid,
    MenuItem, Paper, Stack, Switch, TextField, Typography, alpha
} from '@mui/material';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { db, auth, doc, getDoc, functions, httpsCallable, sendPasswordResetEmail } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
    User, Phone, Mail, Wrench, Star, Clock, Save, KeyRound, MapPin, ShieldCheck,
    ShieldAlert, Upload, RefreshCcw, FileCheck2, Navigation
} from 'lucide-react';
import { pickProfileCover, pickProfilePhoto, profileCoverSx } from '../../utils/profileImages';

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };
type TechnicianPreferenceResponse = { status?: string; profile?: { serviceZonePreference?: string; emergencyContact?: { name?: string; phone?: string }; language?: string } };
type CredentialRecord = { state: string; expiresAtMs?: number | null; count?: number };
type ReadinessResponse = {
    status: string;
    dispatchFrozen: boolean;
    credentialDispatchFrozen: boolean;
    credentialFailures: string[];
    readiness: {
        ready: boolean;
        failures: string[];
        medicalState: string;
        licenceState: string;
        certificationState: string;
        hasActiveShift: boolean;
        deviceReady: boolean;
        gpsFresh: boolean;
        onDuty: boolean;
        available: boolean;
        activeJobs: number;
        maxJobs: number;
    };
    credentials: { medicalCard: CredentialRecord; drivingLicence: CredentialRecord; certifications: CredentialRecord };
    renewal: { pending: boolean; status: string; requestId: string };
    checkedAtMs: number;
};
type RenewalRecord = { requestId: string; credentialType: string; credentialName: string; status: string; proposedExpiryAtMs: number; createdAtMs: number; rejectionReason?: string };

const inputSx = {
    '& .MuiOutlinedInput-root': {
        bgcolor: 'rgba(2,6,23,0.72)', color: '#FFF', borderRadius: 3,
        '& fieldset': { borderColor: 'rgba(198,167,94,0.45)' },
        '&:hover fieldset': { borderColor: 'rgba(198,167,94,0.75)' },
        '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold },
    },
    '& .MuiInputBase-input': { color: '#FFF !important', fontWeight: 850, WebkitTextFillColor: '#FFF' },
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,.72)', fontWeight: 850 },
    '& .MuiInputLabel-root.Mui-focused': { color: binThemeTokens.gold },
    '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,.58)' },
};
const statusChipSx = (tone: string) => ({
    bgcolor: `${alpha(tone, 0.18)} !important`, color: `${tone} !important`, border: `1px solid ${alpha(tone, 0.42)}`,
    fontWeight: 950, minWidth: 96, '& .MuiChip-label': { px: 1.25, color: `${tone} !important` },
});
const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsDataURL(file);
});

export default function TechnicianProfilePage() {
    const { user } = useRole();
    const { isRTL, lang } = useLanguage();
    const label = (en: string, ar: string) => lang === 'ar' ? ar : en;
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [readinessLoading, setReadinessLoading] = useState(false);
    const [renewalBusy, setRenewalBusy] = useState(false);
    const [techData, setTechData] = useState<any>(null);
    const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
    const [renewals, setRenewals] = useState<RenewalRecord[]>([]);
    const [notice, setNotice] = useState<Notice | null>(null);

    const [displayName, setDisplayName] = useState('');
    const [phone, setPhone] = useState('');
    const [trade, setTrade] = useState('');
    const [serviceZone, setServiceZone] = useState('');
    const [emergencyName, setEmergencyName] = useState('');
    const [emergencyPhone, setEmergencyPhone] = useState('');
    const [isAvailable, setIsAvailable] = useState(false);
    const [credentialType, setCredentialType] = useState('medical_card');
    const [credentialName, setCredentialName] = useState('');
    const [proposedExpiryDate, setProposedExpiryDate] = useState('');
    const [credentialFile, setCredentialFile] = useState<File | null>(null);

    const loadReadiness = async (silent = false) => {
        if (!user?.uid) return;
        if (!silent) setReadinessLoading(true);
        try {
            const [readinessResult, renewalResult] = await Promise.all([
                httpsCallable(functions, 'getTechnicianOperationalReadiness')({}),
                httpsCallable(functions, 'listTechnicianCredentialRenewals')({}),
            ]);
            setReadiness(readinessResult.data as ReadinessResponse);
            setRenewals((((renewalResult.data as any)?.requests || []) as RenewalRecord[]));
        } catch (error: any) {
            setNotice({ type: 'warning', text: error?.message || label('Operational readiness could not be refreshed.', 'تعذر تحديث الجاهزية التشغيلية.') });
        } finally {
            if (!silent) setReadinessLoading(false);
        }
    };

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user?.uid) { setLoading(false); return; }
            try {
                const snap = await getDoc(doc(db, 'users', user.uid));
                const data = snap.exists() ? snap.data() : {};
                setTechData(data);
                setDisplayName(data.displayName || user.displayName || '');
                setPhone(data.phoneNumber || data.phone || user.phoneNumber || '');
                setTrade(data.requestedTrade || data.trade || data.specialty || data.primaryTrade || label('General Maintenance', 'صيانة عامة'));
                setServiceZone(data.serviceZonePreference || '');
                setEmergencyName(data.emergencyContact?.name || '');
                setEmergencyPhone(data.emergencyContact?.phone || '');
                setIsAvailable(data.isAvailable !== false);
                await loadReadiness(true);
            } catch (error) {
                console.error('Profile fetch failed:', error);
                setNotice({ type: 'error', text: label('Technician profile could not be loaded.', 'تعذر تحميل ملف الفني.') });
            } finally {
                setLoading(false);
            }
        };
        void fetchProfile();
    }, [user?.uid, user?.displayName, user?.phoneNumber, lang]);

    const handleSave = async () => {
        if (!user?.uid) return;
        setUpdating(true); setNotice(null);
        try {
            const result = await httpsCallable(functions, 'updateTechnicianProfilePreferences')({
                serviceZonePreference: serviceZone.trim(),
                emergencyContact: { name: emergencyName.trim(), phone: emergencyPhone.trim() },
                language: lang,
            });
            const data = result.data as TechnicianPreferenceResponse;
            const profile = data?.profile || {};
            const resolvedZone = profile.serviceZonePreference ?? serviceZone.trim();
            const resolvedEmergency = profile.emergencyContact || { name: emergencyName.trim(), phone: emergencyPhone.trim() };
            setServiceZone(resolvedZone);
            setEmergencyName(resolvedEmergency.name || '');
            setEmergencyPhone(resolvedEmergency.phone || '');
            setTechData((previous: any) => ({ ...previous, serviceZonePreference: resolvedZone, emergencyContact: resolvedEmergency, language: profile.language || lang }));
            setNotice({ type: 'success', text: label('Technician preferences updated securely.', 'تم تحديث تفضيلات الفني بشكل آمن.') });
        } catch (error: any) {
            setNotice({ type: 'error', text: error?.message || label('Failed to update technician preferences.', 'فشل تحديث تفضيلات الفني.') });
        } finally { setUpdating(false); }
    };

    const handlePasswordReset = async () => {
        if (!user?.email) { setNotice({ type: 'warning', text: label('No email is attached to this account.', 'لا يوجد بريد إلكتروني مرتبط بهذا الحساب.') }); return; }
        setResetting(true); setNotice(null);
        try {
            auth.languageCode = isRTL ? 'ar' : 'en';
            await sendPasswordResetEmail(auth, user.email, { url: `${window.location.origin}/login?email=${encodeURIComponent(user.email)}&intendedRole=technician`, handleCodeInApp: false });
            setNotice({ type: 'success', text: label('Password reset email sent. Check inbox or spam folder.', 'تم إرسال رابط إعادة تعيين كلمة المرور. تحقق من البريد الوارد أو الرسائل غير المرغوب فيها.') });
        } catch (error: any) {
            setNotice({ type: 'error', text: error?.message || label('Could not send password reset email.', 'تعذر إرسال بريد إعادة تعيين كلمة المرور.') });
        } finally { setResetting(false); }
    };

    const submitCredentialRenewal = async () => {
        if (!credentialName.trim() || !proposedExpiryDate || !credentialFile) {
            setNotice({ type: 'warning', text: label('Select the credential, future expiry date and evidence document.', 'اختر المؤهل وتاريخ انتهاء مستقبلي ومستند الإثبات.') });
            return;
        }
        if (credentialFile.size > 5 * 1024 * 1024) {
            setNotice({ type: 'warning', text: label('Credential evidence must be 5 MB or smaller.', 'يجب ألا يتجاوز مستند المؤهل 5 ميجابايت.') });
            return;
        }
        setRenewalBusy(true); setNotice(null);
        try {
            const encodedDocument = await fileToBase64(credentialFile);
            const result = await httpsCallable(functions, 'submitTechnicianCredentialRenewal')({
                credentialType,
                credentialName: credentialName.trim(),
                proposedExpiryDate,
                fileName: credentialFile.name,
                contentType: credentialFile.type,
                encodedDocument,
            });
            const requestId = String((result.data as any)?.requestId || '');
            setCredentialName(''); setProposedExpiryDate(''); setCredentialFile(null);
            setNotice({ type: 'success', text: label(`Credential renewal ${requestId} was submitted for Admin review.`, `تم إرسال طلب تجديد المؤهل ${requestId} لمراجعة الإدارة.`) });
            await loadReadiness(true);
        } catch (error: any) {
            setNotice({ type: 'error', text: error?.message || label('Credential renewal submission failed.', 'فشل إرسال طلب تجديد المؤهل.') });
        } finally { setRenewalBusy(false); }
    };

    const localizedState = (value: string) => {
        const normalized = String(value || '').toLowerCase();
        if (lang !== 'ar') return normalized.replaceAll('_', ' ').toUpperCase();
        const map: Record<string, string> = {
            valid: 'ساري', approved: 'معتمد', active: 'نشط', pending: 'قيد المراجعة', invalid: 'غير صالح', expired: 'منتهي',
            pending_admin_review: 'بانتظار مراجعة الإدارة', rejected: 'مرفوض', not_submitted: 'غير مقدم', suspended: 'موقوف', inactive: 'غير نشط',
        };
        return map[normalized] || value;
    };
    const failureLabel = (value: string) => {
        if (lang !== 'ar') return value;
        const map: Record<string, string> = {
            'medical card': 'البطاقة الطبية', 'driving licence': 'رخصة القيادة', 'required certifications': 'الشهادات المطلوبة',
            'active shift': 'وردية نشطة', 'registered device': 'جهاز مسجل', 'fresh GPS location': 'موقع GPS حديث',
            'on-duty status': 'حالة على رأس العمل', 'dispatch availability': 'التوفر للإرسال', 'workload capacity': 'سعة عبء العمل',
        };
        return map[value] || value;
    };
    const formatDate = (value?: number | null) => value ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-AE', { dateStyle: 'medium' }).format(new Date(value)) : '—';
    const readinessChecks = useMemo(() => readiness ? [
        { key: 'medical', label: label('Medical card', 'البطاقة الطبية'), ok: readiness.readiness.medicalState === 'valid', value: localizedState(readiness.readiness.medicalState), date: readiness.credentials.medicalCard.expiresAtMs },
        { key: 'licence', label: label('Driving licence', 'رخصة القيادة'), ok: readiness.readiness.licenceState === 'valid', value: localizedState(readiness.readiness.licenceState), date: readiness.credentials.drivingLicence.expiresAtMs },
        { key: 'certs', label: label('Required certificates', 'الشهادات المطلوبة'), ok: readiness.readiness.certificationState === 'valid', value: localizedState(readiness.readiness.certificationState) },
        { key: 'shift', label: label('Active shift', 'الوردية النشطة'), ok: readiness.readiness.hasActiveShift, value: readiness.readiness.hasActiveShift ? label('Ready', 'جاهز') : label('Missing', 'غير متوفر') },
        { key: 'device', label: label('Registered device', 'الجهاز المسجل'), ok: readiness.readiness.deviceReady, value: readiness.readiness.deviceReady ? label('Ready', 'جاهز') : label('Missing', 'غير متوفر') },
        { key: 'gps', label: label('Fresh GPS', 'موقع GPS حديث'), ok: readiness.readiness.gpsFresh, value: readiness.readiness.gpsFresh ? label('Ready', 'جاهز') : label('Refresh required', 'يلزم التحديث') },
    ] : [], [readiness, lang]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    const score = techData?.qualityScore || techData?.rating || label('Pending', 'قيد الانتظار');
    const sla = techData?.slaCompliance || techData?.slaScore || label('Pending', 'قيد الانتظار');
    const status = String(techData?.status || 'active');
    const statusLower = status.toLowerCase();
    const localizedStatus = localizedState(statusLower);
    const profilePhoto = pickProfilePhoto(techData, user);
    const profileCover = pickProfileCover(techData, user);
    const statusTone = statusLower === 'active' ? '#10b981' : statusLower === 'suspended' ? '#ef4444' : binThemeTokens.gold;
    const dispatchReady = readiness ? !readiness.dispatchFrozen : isAvailable;
    const dispatchTone = dispatchReady ? '#10b981' : '#ef4444';

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pr: { xs: isRTL ? 0 : 8, sm: isRTL ? 0 : 10, md: 0 }, pl: { xs: isRTL ? 8 : 0, sm: isRTL ? 10 : 0, md: 0 }, pb: { xs: 14, md: 4 } }}>
            <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={2} sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', textAlign: isRTL ? 'right' : 'left', fontSize: { xs: '2.2rem', sm: '2.6rem' } }}>{label('Technician Profile', 'ملف الفني')}</Typography>
                <Button onClick={() => void loadReadiness()} disabled={readinessLoading} startIcon={readinessLoading ? <CircularProgress size={16} /> : <RefreshCcw size={17} />} variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>{label('Refresh readiness', 'تحديث الجاهزية')}</Button>
            </Stack>
            {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}

            {readiness && <Alert severity={readiness.dispatchFrozen ? 'error' : 'success'} icon={readiness.dispatchFrozen ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />} sx={{ mb: 3 }}>
                {readiness.dispatchFrozen
                    ? label(`Dispatch is frozen: ${readiness.readiness.failures.map(failureLabel).join(', ')}.`, `الإرسال موقوف: ${readiness.readiness.failures.map(failureLabel).join('، ')}.`)
                    : label('All server-authoritative readiness checks passed. Dispatch is available.', 'اجتازت جميع فحوصات الجاهزية المعتمدة من الخادم. الإرسال متاح.')}
            </Alert>}

            <Paper sx={{ p: { xs: 3, sm: 4 }, mb: 4, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, position: 'relative', overflow: 'hidden', ...profileCoverSx(profileCover), '&:before': { content: '""', position: 'absolute', inset: 0, bgcolor: 'rgba(2,6,23,0.58)', backdropFilter: 'blur(1px)' }, '& > *': { position: 'relative', zIndex: 1 } }}>
                <Stack direction="column" spacing={3} alignItems="center" sx={{ mb: 4 }}>
                    <Avatar src={profilePhoto || undefined} sx={{ width: 108, height: 108, bgcolor: binThemeTokens.gold, color: '#000', border: `4px solid ${binThemeTokens.gold}`, boxShadow: '0 18px 42px rgba(0,0,0,0.45)' }}>{displayName?.charAt(0) || <User size={40} />}</Avatar>
                    <Box sx={{ textAlign: 'center', maxWidth: '100%' }}>
                        <Typography variant="h5" fontWeight="950" color="#FFF">{displayName || label('Technician', 'الفني')}</Typography>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" justifyContent="center" sx={{ mt: 1, color: 'rgba(255,255,255,0.82)' }}><Mail size={16} /><Typography variant="body2">{techData?.email || user?.email}</Typography></Stack>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" justifyContent="center" sx={{ mt: 1, color: 'rgba(255,255,255,0.82)' }}><Phone size={16} /><Typography variant="body2">{phone || label('No phone registered', 'لا يوجد رقم هاتف مسجل')}</Typography></Stack>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" justifyContent="center" sx={{ mt: 1, color: 'rgba(255,255,255,0.82)' }}><Wrench size={16} /><Typography variant="body2">{trade || label('General Maintenance', 'صيانة عامة')}</Typography></Stack>
                        {serviceZone && <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" justifyContent="center" sx={{ mt: 1, color: 'rgba(255,255,255,0.82)' }}><MapPin size={16} /><Typography variant="body2">{serviceZone}</Typography></Stack>}
                    </Box>
                </Stack>
                <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={6} md={3}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 850 }}>{label('ACCOUNT STATUS', 'حالة الحساب')}</Typography><Box sx={{ mt: 1 }}><Chip label={localizedStatus} size="small" sx={statusChipSx(statusTone)} /></Box></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 850 }}>{label('QUALITY SCORE', 'تقييم الجودة')}</Typography><Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" spacing={1} sx={{ mt: 1, color: binThemeTokens.gold }}><Star size={18} fill={binThemeTokens.gold} /><Typography fontWeight="950" color="#FFF">{typeof score === 'number' ? `${score}/5` : score}</Typography></Stack></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 850 }}>{label('SLA COMPLIANCE', 'الالتزام بزمن الخدمة')}</Typography><Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" spacing={1} sx={{ mt: 1, color: '#4ade80' }}><Clock size={18} /><Typography fontWeight="950" color="#FFF">{typeof sla === 'number' ? `${sla}%` : sla}</Typography></Stack></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 850 }}>{label('DISPATCH', 'الإرسال')}</Typography><Box sx={{ mt: 1 }}><Chip label={dispatchReady ? label('READY', 'جاهز') : label('FROZEN', 'موقوف')} size="small" sx={statusChipSx(dispatchTone)} /></Box></Grid>
                </Grid>
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.14)', my: 4 }} />
                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>{label('Verified Identity & Preferences', 'الهوية الموثقة والتفضيلات')}</Typography>
                <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ mb: 3 }}>{label('Identity, trade and dispatch authority are read-only. Only preferences and renewal evidence can be submitted here.', 'الهوية والتخصص وصلاحية الإرسال بيانات للقراءة فقط. يمكن هنا تحديث التفضيلات وإرسال إثباتات التجديد فقط.')}</Alert>
                <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Verified Full Name', 'الاسم الكامل الموثق')} value={displayName} InputProps={{ readOnly: true }} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Verified Phone Number', 'رقم الهاتف الموثق')} value={phone} InputProps={{ readOnly: true }} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Approved Primary Trade', 'التخصص الرئيسي المعتمد')} value={trade} InputProps={{ readOnly: true }} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Preferred Service Zone', 'منطقة الخدمة المفضلة')} value={serviceZone} onChange={(event) => setServiceZone(event.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Emergency Contact Name', 'اسم جهة الاتصال للطوارئ')} value={emergencyName} onChange={(event) => setEmergencyName(event.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label={label('Emergency Contact Phone', 'هاتف جهة الاتصال للطوارئ')} value={emergencyPhone} onChange={(event) => setEmergencyPhone(event.target.value)} helperText={label('Use international format, for example +9715XXXXXXXX.', 'استخدم الصيغة الدولية، مثل +9715XXXXXXXX.')} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={6}><FormControlLabel disabled control={<Switch checked={isAvailable} />} label={<Typography color="#FFF" fontWeight="900">{label('Availability is controlled by duty status', 'يتم التحكم في التوفر من خلال حالة الدوام')}</Typography>} /></Grid>
                </Grid>
                <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2}>
                    <Button variant="contained" startIcon={<Save size={17} />} onClick={handleSave} disabled={updating} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 4, py: 1.5 }}>{updating ? <CircularProgress size={24} color="inherit" /> : label('SAVE PREFERENCES', 'حفظ التفضيلات')}</Button>
                    <Button variant="outlined" startIcon={<KeyRound size={17} />} onClick={handlePasswordReset} disabled={resetting} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, px: 4, py: 1.5 }}>{resetting ? label('SENDING...', 'جارٍ الإرسال...') : label('SEND PASSWORD RESET', 'إرسال إعادة تعيين كلمة المرور')}</Button>
                </Stack>
            </Paper>

            <Paper sx={{ p: { xs: 3, md: 4 }, mb: 4, borderRadius: 6, bgcolor: 'rgba(2,6,23,0.86)', border: `1px solid ${alpha(binThemeTokens.gold, 0.32)}` }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" mb={3}><Navigation color={binThemeTokens.gold} /><Typography variant="h5" fontWeight="950" color="#FFF">{label('Server-Authoritative Dispatch Readiness', 'جاهزية الإرسال المعتمدة من الخادم')}</Typography></Stack>
                <Grid container spacing={2}>{readinessChecks.map((item) => <Grid item xs={12} sm={6} md={4} key={item.key}><Paper sx={{ p: 2.5, height: '100%', bgcolor: alpha(item.ok ? '#10b981' : '#ef4444', 0.08), border: `1px solid ${alpha(item.ok ? '#10b981' : '#ef4444', 0.32)}`, borderRadius: 4 }}><Typography fontWeight="950" color="#FFF">{item.label}</Typography><Chip size="small" label={item.value} color={item.ok ? 'success' : 'error'} sx={{ mt: 1 }} />{item.date ? <Typography variant="caption" display="block" color="text.secondary" mt={1}>{label('Expiry', 'الانتهاء')}: {formatDate(item.date)}</Typography> : null}</Paper></Grid>)}</Grid>
                {readiness && <Typography variant="body2" color="text.secondary" mt={3}>{label('Workload', 'عبء العمل')}: {readiness.readiness.activeJobs}/{readiness.readiness.maxJobs} · {label('Checked', 'تم الفحص')}: {formatDate(readiness.checkedAtMs)}</Typography>}
            </Paper>

            <Paper sx={{ p: { xs: 3, md: 4 }, mb: 4, borderRadius: 6, bgcolor: 'rgba(2,6,23,0.86)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" mb={1}><FileCheck2 color={binThemeTokens.gold} /><Typography variant="h5" fontWeight="950" color="#FFF">{label('Credential Renewal Evidence', 'إثبات تجديد المؤهلات')}</Typography></Stack>
                <Typography variant="body2" color="text.secondary" mb={3}>{label('Upload a replacement credential for Admin review. Expired mandatory credentials keep dispatch frozen until approval.', 'ارفع مؤهلاً بديلاً لمراجعة الإدارة. تبقي المؤهلات الإلزامية المنتهية الإرسال موقوفاً حتى الاعتماد.')}</Typography>
                <Grid container spacing={2.5}>
                    <Grid item xs={12} md={4}><TextField select fullWidth label={label('Credential type', 'نوع المؤهل')} value={credentialType} onChange={(event) => setCredentialType(event.target.value)} sx={inputSx}><MenuItem value="medical_card">{label('Medical card', 'البطاقة الطبية')}</MenuItem><MenuItem value="driving_licence">{label('Driving licence', 'رخصة القيادة')}</MenuItem><MenuItem value="trade_certificate">{label('Trade certificate', 'شهادة التخصص')}</MenuItem><MenuItem value="safety_certificate">{label('Safety certificate', 'شهادة السلامة')}</MenuItem><MenuItem value="other">{label('Other', 'أخرى')}</MenuItem></TextField></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label={label('Credential name / number', 'اسم / رقم المؤهل')} value={credentialName} onChange={(event) => setCredentialName(event.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth type="date" label={label('New expiry date', 'تاريخ الانتهاء الجديد')} InputLabelProps={{ shrink: true }} value={proposedExpiryDate} onChange={(event) => setProposedExpiryDate(event.target.value)} sx={inputSx} /></Grid>
                    <Grid item xs={12}><Button component="label" variant="outlined" startIcon={<Upload size={18} />} sx={{ color: '#FFF', borderColor: binThemeTokens.gold }}>{credentialFile ? credentialFile.name : label('Select PDF or image evidence — max 5 MB', 'اختر ملف PDF أو صورة — بحد أقصى 5 ميجابايت')}<input hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setCredentialFile(event.target.files?.[0] || null)} /></Button></Grid>
                </Grid>
                <Button onClick={() => void submitCredentialRenewal()} disabled={renewalBusy} variant="contained" startIcon={renewalBusy ? <CircularProgress size={18} /> : <Upload size={18} />} sx={{ mt: 3, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{label('SUBMIT FOR ADMIN REVIEW', 'إرسال لمراجعة الإدارة')}</Button>

                <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.12)' }} />
                <Typography variant="h6" fontWeight="950" color="#FFF" mb={2}>{label('Renewal history', 'سجل التجديد')}</Typography>
                <Stack spacing={1.5}>{renewals.length ? renewals.map((item) => <Box key={item.requestId} sx={{ p: 2, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 3 }}><Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" gap={1}><Box><Typography color="#FFF" fontWeight="900">{item.credentialName}</Typography><Typography variant="caption" color="text.secondary">{formatDate(item.createdAtMs)} · {label('Proposed expiry', 'الانتهاء المقترح')}: {formatDate(item.proposedExpiryAtMs)}</Typography></Box><Chip label={localizedState(item.status)} color={String(item.status).includes('REJECT') ? 'error' : String(item.status).includes('APPROV') ? 'success' : 'warning'} /></Stack>{item.rejectionReason && <Alert severity="error" sx={{ mt: 1 }}>{item.rejectionReason}</Alert>}</Box>) : <Typography color="text.secondary">{label('No renewal requests submitted.', 'لم يتم إرسال طلبات تجديد.')}</Typography>}</Stack>
            </Paper>
        </Box>
    );
}
