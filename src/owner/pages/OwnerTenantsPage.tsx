import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Stack, Chip, CircularProgress, Alert, Grid, Avatar, TextField, InputAdornment, Button } from '@mui/material';
import { Search, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { type DirectoryRow, filterDirectoryRows, subscribeOwnerDirectory } from '../utils/ownerTenantDirectory';

export default function OwnerTenantsPage() {
    const { user } = useRole();
    const { isRTL } = useLanguage();
    const [state, setState] = useState<{ ownerUid?: string; rows: DirectoryRow[]; loading: boolean; failed: boolean }>({ rows: [], loading: true, failed: false });
    const [attempt, setAttempt] = useState(0);
    const [search, setSearch] = useState('');
    const label = (en: string, ar: string) => isRTL ? ar : en;

    useEffect(() => {
        setSearch('');
        setState({ ownerUid: user?.uid, rows: [], loading: Boolean(user?.uid), failed: false });
        if (!user?.uid) return;
        // Both queries remain bound to the immutable owner UID.
        const propQ = query(collection(db, 'properties'), where('ownerId', '==', user.uid));
        const tenantQ = query(collection(db, 'users'), where('role', '==', 'tenant'), where('ownerId', '==', user.uid));
        return subscribeOwnerDirectory(user.uid,
            (next, fail) => onSnapshot(propQ, snap => next(snap.docs), fail),
            (next, fail) => onSnapshot(tenantQ, snap => next(snap.docs), fail),
            (rows, loading, failed) => setState({ ownerUid: user.uid, rows, loading, failed }),
        );
    }, [user?.uid, attempt]);

    // Never render the previous owner's rows while an identity change awaits its effect.
    const current = state.ownerUid === user?.uid ? state : { rows: [], loading: Boolean(user?.uid), failed: false };
    const filtered = filterDirectoryRows(current.rows, search);
    if (!user?.uid) return <Alert severity="info">{label('Sign in to view your tenant directory.', 'سجّل الدخول لعرض دليل المستأجرين.')}</Alert>;
    if (current.loading) return <Stack alignItems="center" spacing={2} sx={{ py: 6 }}><CircularProgress /><Typography color="text.secondary">{label('Loading tenant directory…', 'جارٍ تحميل دليل المستأجرين…')}</Typography></Stack>;
    if (current.failed) return <Alert severity="error" action={<Button onClick={() => setAttempt(value => value + 1)}>{label('Retry', 'إعادة المحاولة')}</Button>}>{label('Unable to load the tenant directory. Please try again.', 'تعذّر تحميل دليل المستأجرين. يرجى المحاولة مجددًا.')}</Alert>;

    return <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ color: '#111827' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
            <Typography variant="h4" fontWeight={800}>{label('Tenant directory', 'دليل المستأجرين')}</Typography>
            <TextField size="small" label={label('Search tenants', 'البحث عن مستأجر')} value={search} onChange={event => setSearch(event.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} sx={{ width: { xs: '100%', sm: 300 } }} />
        </Stack>
        {!filtered.length ? <Paper sx={{ p: 4, bgcolor: '#FFFFFF', color: '#374151', textAlign: 'center' }}>
            <Typography>{current.rows.length ? label('No tenants match your search.', 'لا يوجد مستأجرون يطابقون البحث.') : label('No tenants are recorded in your portfolio.', 'لا يوجد مستأجرون مسجّلون في محفظتك.')}</Typography>
            {search && <Button onClick={() => setSearch('')}>{label('Clear search', 'مسح البحث')}</Button>}
        </Paper> : <Grid container spacing={3}>{filtered.map(tenant => <Grid item xs={12} md={6} lg={4} key={tenant.id}>
            <Paper sx={{ p: 3, bgcolor: '#FFFFFF', color: '#111827', border: '1px solid #E5E7EB', borderRadius: 3, height: '100%' }}>
                <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                        <Avatar>{tenant.displayName.charAt(0) || 'T'}</Avatar>
                        <Box sx={{ minWidth: 0 }}><Typography fontWeight={800}>{tenant.displayName || label('Unnamed tenant', 'مستأجر بلا اسم')}</Typography>
                            <Chip size="small" label={tenant.status || label('Status not recorded', 'الحالة غير مسجّلة')} sx={{ mt: 1 }} />
                        </Box>
                    </Stack>
                    <Typography variant="body2">{tenant.propertyName || label('Property link not recorded', 'ارتباط العقار غير مسجّل')} · {label('Unit', 'الوحدة')} {tenant.unitNumber || '—'}</Typography>
                    <Typography variant="body2" sx={{ color: '#4B5563' }}>{tenant.email || label('Email not recorded', 'البريد الإلكتروني غير مسجّل')}</Typography>
                    <Button variant="outlined" startIcon={<Mail size={16} />} href={tenant.emailHref} disabled={!tenant.emailHref}>
                        {tenant.emailHref ? label('Email tenant', 'مراسلة المستأجر بالبريد') : label('Email unavailable', 'البريد الإلكتروني غير متاح')}
                    </Button>
                </Stack>
            </Paper>
        </Grid>)}</Grid>}
        <Paper sx={{ p: 3, mt: 4, bgcolor: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}>
            <Typography variant="body2" sx={{ mb: 2 }}>{label('Email opens your mail app. Messages sent there are not recorded in this directory. Use tenant contact details for property-related matters.', 'يفتح البريد تطبيق البريد لديك. الرسائل المرسلة منه لا تُسجّل في هذا الدليل. استخدم بيانات التواصل للأمور المتعلقة بالعقار.')}</Typography>
            <Button component={Link} to="/owner/bin-connect" variant="outlined">{label('BIN Connect inbox', 'صندوق رسائل BIN Connect')}</Button>
        </Paper>
    </Box>;
}
