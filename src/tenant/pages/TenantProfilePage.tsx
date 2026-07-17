import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Divider, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { KeyRound, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { auth, collection, db, doc, getDoc, getDocs, query, sendPasswordResetEmail, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { pickProfileCover, pickProfilePhoto, profileCoverSx } from '../../utils/profileImages';
import TenantCorrectionPanel from '../components/TenantCorrectionPanel';

const readOnlyInputSx = {
    '& .MuiOutlinedInput-root': { color: '#FFF', bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 },
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
    '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: 'rgba(255,255,255,0.82)' },
};

type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string };
type ResidenceRecord = Record<string, any> & { id: string };
type PropertySummary = { name?: string; propertyName?: string; address?: string };

const normalizeStatus = (record: ResidenceRecord) => String(
    record.leaseStatus || record.tenancyStatus || record.contractStatus || record.status || 'ACTIVE',
).trim().toUpperCase();

const isHistoricalResidence = (record: ResidenceRecord) => [
    'EXPIRED', 'ENDED', 'TERMINATED', 'CANCELLED', 'CLOSED', 'MOVED_OUT', 'INACTIVE', 'HISTORICAL',
].includes(normalizeStatus(record));

const dateValue = (value: unknown) => {
    if (!value) return null;
    if (typeof value === 'object' && value && 'toDate' in value && typeof (value as any).toDate === 'function') {
        return (value as any).toDate();
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const arabicResidenceStatus = (status: string) => {
    switch (status) {
        case 'ACTIVE': return 'نشط';
        case 'OCCUPIED': return 'مشغول';
        case 'PENDING': return 'قيد الانتظار';
        case 'EXPIRED': return 'منتهي';
        case 'ENDED': return 'منتهٍ';
        case 'TERMINATED': return 'مفسوخ';
        case 'CANCELLED': return 'ملغى';
        case 'CLOSED': return 'مغلق';
        case 'MOVED_OUT': return 'تم الإخلاء';
        case 'INACTIVE': return 'غير نشط';
        case 'HISTORICAL': return 'سابق';
        default: return status;
    }
};

export default function TenantProfilePage() {
    const { user } = useRole();
    const { isRTL, lang } = useLanguage();
    const label = (en: string, ar: string) => lang === 'ar' ? ar : en;
    const [loading, setLoading] = useState(true);
    const [resetting, setResetting] = useState(false);
    const [residences, setResidences] = useState<ResidenceRecord[]>([]);
    const [propertiesById, setPropertiesById] = useState<Map<string, PropertySummary>>(new Map());
    const [profileData, setProfileData] = useState<any>(null);
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

                const lookups = [
                    getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid))),
                    getDocs(query(collection(db, 'units'), where('tenantUid', '==', user.uid))),
                    ...(user.email
                        ? [getDocs(query(collection(db, 'units'), where('tenantEmail', '==', user.email.toLowerCase())))]
                        : []),
                ];
                const snapshots = await Promise.all(lookups);
                const deduplicated = new Map<string, ResidenceRecord>();
                for (const snapshot of snapshots) {
                    for (const unitDoc of snapshot.docs) {
                        deduplicated.set(unitDoc.id, { id: unitDoc.id, ...unitDoc.data() });
                    }
                }
                const nextResidences = [...deduplicated.values()].sort((left, right) => {
                    const leftDate = dateValue(left.leaseEnd || left.endDate || left.updatedAt)?.getTime() || 0;
                    const rightDate = dateValue(right.leaseEnd || right.endDate || right.updatedAt)?.getTime() || 0;
                    return rightDate - leftDate;
                });
                setResidences(nextResidences);

                const propertyIds = [...new Set(
                    nextResidences.map((item) => String(item.propertyId || '')).filter(Boolean),
                )];
                const propertyEntries = await Promise.all(propertyIds.map(async (propertyId) => {
                    const propertySnap = await getDoc(doc(db, 'properties', propertyId));
                    return [propertyId, propertySnap.exists() ? propertySnap.data() as PropertySummary : {}] as const;
                }));
                setPropertiesById(new Map(propertyEntries));
            } catch (error) {
                console.error('Profile fetch failed:', error);
                setNotice({ type: 'error', text: label('Tenant profile could not be loaded.', 'تعذر تحميل ملف المستأجر.') });
            } finally {
                setLoading(false);
            }
        };
        void fetchProfileData();
    }, [user?.uid, user?.email, lang]);

    const activeResidences = useMemo(
        () => residences.filter((record) => !isHistoricalResidence(record)),
        [residences],
    );
    const historicalResidences = useMemo(
        () => residences.filter(isHistoricalResidence),
        [residences],
    );

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
                url: `${window.location.origin}/login?email=${encodeURIComponent(user.email)}&intendedRole=tenant`,
                handleCodeInApp: false,
            });
            setNotice({
                type: 'success',
                text: label(
                    'Password reset email sent. Check inbox or spam folder.',
                    'تم إرسال رابط إعادة تعيين كلمة المرور. تحقق من البريد الوارد أو الرسائل غير المرغوب فيها.',
                ),
            });
        } catch (error: any) {
            setNotice({ type: 'error', text: error?.message || label('Could not send password reset email.', 'تعذر إرسال بريد إعادة تعيين كلمة المرور.') });
        } finally {
            setResetting(false);
        }
    };

    const formatDate = (value: unknown) => {
        const date = dateValue(value);
        return date
            ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-AE', { dateStyle: 'medium' }).format(date)
            : '—';
    };

    const localizedStatus = (record: ResidenceRecord) => {
        const status = normalizeStatus(record);
        return lang === 'ar' ? arabicResidenceStatus(status) : status.replaceAll('_', ' ');
    };

    const ResidenceSection = ({
        titleEn,
        titleAr,
        records,
        historical = false,
    }: {
        titleEn: string;
        titleAr: string;
        records: ResidenceRecord[];
        historical?: boolean;
    }) => (
        <Box sx={{ mb: 4 }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight={950} color="#FFF">{label(titleEn, titleAr)}</Typography>
                <Chip label={records.length} size="small" sx={{ bgcolor: 'rgba(198,167,94,0.12)', color: binThemeTokens.gold, fontWeight: 950 }} />
            </Stack>
            {records.length ? (
                <Grid container spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    {records.map((record) => {
                        const property = propertiesById.get(String(record.propertyId || '')) || {};
                        return (
                            <Grid item xs={12} md={6} key={record.id}>
                                <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, textAlign: isRTL ? 'right' : 'left' }}>
                                    <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" gap={2} alignItems="flex-start">
                                        <Box>
                                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{label('Property', 'العقار')}</Typography>
                                            <Typography variant="h6" fontWeight={950} color="#FFF">{property.name || property.propertyName || record.propertyName || label('Assigned Property', 'العقار المخصص')}</Typography>
                                            <Typography variant="body2" color="text.secondary">{property.address || record.address || '—'}</Typography>
                                        </Box>
                                        <Chip label={localizedStatus(record)} size="small" color={historical ? 'default' : 'success'} />
                                    </Stack>
                                    <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
                                    <Grid container spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">{label('Unit', 'الوحدة')}</Typography><Typography fontWeight={900} color="#FFF">{record.unitNumber || record.unit || '—'}</Typography></Grid>
                                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">{label('Floor', 'الطابق')}</Typography><Typography fontWeight={900} color="#FFF">{record.floorNumber || record.floor || '—'}</Typography></Grid>
                                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">{label('Lease start', 'بداية العقد')}</Typography><Typography variant="body2" color="#FFF">{formatDate(record.leaseStart || record.startDate)}</Typography></Grid>
                                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">{label('Lease end', 'نهاية العقد')}</Typography><Typography variant="body2" color="#FFF">{formatDate(record.leaseEnd || record.endDate)}</Typography></Grid>
                                    </Grid>
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            ) : (
                <Typography variant="body2" color="text.secondary">
                    {label(
                        historical ? 'No historical residences.' : 'No active residence assigned.',
                        historical ? 'لا توجد مساكن سابقة.' : 'لا يوجد سكن نشط مخصص.',
                    )}
                </Typography>
            )}
        </Box>
    );

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    }

    const displayName = profileData?.displayName || profileData?.name || user?.displayName || '';
    const phone = profileData?.phoneNumber || profileData?.phone || user?.phoneNumber || '';
    const emergencyName = profileData?.emergencyContact?.name || '';
    const emergencyPhone = profileData?.emergencyContact?.phone || '';
    const profilePhoto = pickProfilePhoto(profileData, user);
    const profileCover = pickProfileCover(profileData, user);

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Typography variant="h4" fontWeight={950} sx={{ color: '#FFF', mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
                {label('Tenant Profile', 'ملف المستأجر')}
            </Typography>
            {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}
            <Paper sx={{ p: 4, mb: 4, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, ...profileCoverSx(profileCover) }}>
                <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={4} alignItems="center" sx={{ mb: 4 }}>
                    <Avatar src={profilePhoto || undefined} sx={{ width: 100, height: 100, bgcolor: binThemeTokens.gold, color: '#000', border: '4px solid rgba(255,255,255,0.18)', boxShadow: '0 18px 42px rgba(0,0,0,0.35)' }}>
                        {displayName.charAt(0) || user?.displayName?.charAt(0) || <User size={40} />}
                    </Avatar>
                    <Box sx={{ textAlign: { xs: 'center', md: isRTL ? 'right' : 'left' }, width: '100%' }}>
                        <Typography variant="h5" fontWeight={900} color="#FFF">{displayName || label('Resident', 'المقيم')}</Typography>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'rgba(255,255,255,0.78)' }}><Mail size={16} /><Typography variant="body2">{user?.email}</Typography></Stack>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' }} sx={{ mt: 1, color: 'rgba(255,255,255,0.78)' }}><Phone size={16} /><Typography variant="body2">{phone || label('No phone registered', 'لا يوجد رقم هاتف مسجل')}</Typography></Stack>
                    </Box>
                </Stack>
                <Alert icon={<ShieldCheck size={20} />} severity="info" sx={{ mb: 3 }}>
                    {label(
                        'Verified identity and contact records are read-only. Submit a correction request below for Admin review.',
                        'بيانات الهوية والاتصال الموثقة للقراءة فقط. أرسل طلب تصحيح أدناه لمراجعة الإدارة.',
                    )}
                </Alert>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}><TextField disabled fullWidth label={label('Full Name', 'الاسم الكامل')} value={displayName} sx={readOnlyInputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField disabled fullWidth label={label('Phone Number', 'رقم الهاتف')} value={phone} sx={readOnlyInputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField disabled fullWidth label={label('Emergency Contact Name', 'اسم جهة الاتصال للطوارئ')} value={emergencyName} sx={readOnlyInputSx} /></Grid>
                    <Grid item xs={12} md={6}><TextField disabled fullWidth label={label('Emergency Contact Phone', 'هاتف جهة الاتصال للطوارئ')} value={emergencyPhone} sx={readOnlyInputSx} /></Grid>
                </Grid>
                <Button variant="outlined" startIcon={<KeyRound size={17} />} onClick={handlePasswordReset} disabled={resetting} sx={{ mt: 4, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}>
                    {resetting ? label('Sending...', 'جارٍ الإرسال...') : label('Send Password Reset', 'إرسال إعادة تعيين كلمة المرور')}
                </Button>
            </Paper>
            <ResidenceSection titleEn="Active residences" titleAr="المساكن النشطة" records={activeResidences} />
            <ResidenceSection titleEn="Residence and lease history" titleAr="سجل السكن وعقود الإيجار" records={historicalResidences} historical />
            <TenantCorrectionPanel residences={residences} />
        </Box>
    );
}
