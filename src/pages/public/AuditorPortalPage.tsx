import React from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Container,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import { RefreshCcw, ShieldCheck } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { db, collection, getDocs, query, limit } from '../../lib/firebase';

type AuditRecord = {
    id: string;
    action?: string;
    actorRole?: string;
    actorUid?: string;
    targetType?: string;
    targetId?: string;
    createdAt?: any;
};

const formatTimestamp = (raw: any, isRTL: boolean) => {
    try {
        const date =
            typeof raw?.toDate === 'function'
                ? raw.toDate()
                : raw instanceof Date
                    ? raw
                    : typeof raw === 'string' || typeof raw === 'number'
                        ? new Date(raw)
                        : null;
        if (!date || Number.isNaN(date.getTime())) return isRTL ? 'غير مسجل' : 'Not recorded';
        return date.toLocaleString(isRTL ? 'ar-AE' : 'en-AE');
    } catch {
        return isRTL ? 'غير مسجل' : 'Not recorded';
    }
};

export default function AuditorPortalPage() {
    const { loading: roleLoading } = useRole();
    const { isRTL, tx } = useLanguage();
    const [records, setRecords] = React.useState<AuditRecord[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');

    const copy = React.useCallback(
        (key: string, en: string, ar: string) => tx(key, isRTL ? ar : en),
        [isRTL, tx],
    );

    const loadRecords = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const snap = await getDocs(query(collection(db, 'audit_logs'), limit(50)));
            const rows = snap.docs.map((docSnap) => ({
                id: docSnap.id,
                ...(docSnap.data() as Omit<AuditRecord, 'id'>),
            }));
            rows.sort((a, b) => {
                const toMillis = (value: any) => {
                    if (typeof value?.toMillis === 'function') return value.toMillis();
                    if (typeof value?.toDate === 'function') return value.toDate().getTime();
                    const parsed = new Date(value || 0).getTime();
                    return Number.isNaN(parsed) ? 0 : parsed;
                };
                return toMillis(b.createdAt) - toMillis(a.createdAt);
            });
            setRecords(rows);
        } catch (err: any) {
            console.error('[AUDITOR] Failed to read audit logs:', err);
            setRecords([]);
            setError(
                copy(
                    'auditor.load_error',
                    'Audit records could not be loaded. Access remains read-only and no fallback data is shown.',
                    'تعذر تحميل سجلات التدقيق. يظل الوصول للقراءة فقط ولا يتم عرض أي بيانات بديلة.',
                ),
            );
        } finally {
            setLoading(false);
        }
    }, [copy]);

    React.useEffect(() => {
        if (!roleLoading) void loadRecords();
    }, [loadRecords, roleLoading]);

    if (roleLoading) {
        return (
            <Box
                role="status"
                aria-live="polite"
                sx={{
                    minHeight: '100dvh',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: binThemeTokens.canvas,
                    direction: isRTL ? 'rtl' : 'ltr',
                }}
            >
                <Stack spacing={2} alignItems="center">
                    <CircularProgress sx={{ color: binThemeTokens.gold }} />
                    <Typography color={binThemeTokens.textSecondary}>
                        {copy('auditor.role_loading', 'Verifying auditor access…', 'جارٍ التحقق من صلاحية المدقق…')}
                    </Typography>
                </Stack>
            </Box>
        );
    }

    return (
        <Container
            maxWidth="xl"
            sx={{
                py: { xs: 4, md: 8 },
                direction: isRTL ? 'rtl' : 'ltr',
            }}
        >
            <Stack
                direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', md: 'center' }}
                spacing={2}
                sx={{ mb: 3 }}
            >
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                    <Box
                        sx={{
                            width: 52,
                            height: 52,
                            display: 'grid',
                            placeItems: 'center',
                            borderRadius: 3,
                            bgcolor: 'rgba(201,166,70,0.12)',
                            border: '1px solid rgba(201,166,70,0.3)',
                        }}
                    >
                        <ShieldCheck size={28} color={binThemeTokens.gold} />
                    </Box>
                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="h4" fontWeight={950} color={binThemeTokens.textPrimary}>
                            {copy('auditor.title', 'Auditor Portal', 'بوابة المدقق')}
                        </Typography>
                        <Typography color={binThemeTokens.textSecondary}>
                            {copy(
                                'auditor.subtitle',
                                'Read-only view of audit records available to this authenticated auditor.',
                                'عرض للقراءة فقط لسجلات التدقيق المتاحة لهذا المدقق المصادق عليه.',
                            )}
                        </Typography>
                    </Box>
                </Stack>
                <Button
                    variant="outlined"
                    startIcon={<RefreshCcw size={18} />}
                    onClick={() => void loadRecords()}
                    disabled={loading}
                    sx={{ alignSelf: { xs: 'stretch', md: 'auto' } }}
                >
                    {copy('auditor.refresh', 'Refresh records', 'تحديث السجلات')}
                </Button>
            </Stack>

            <Alert severity="info" sx={{ mb: 3 }}>
                {copy(
                    'auditor.read_only_notice',
                    'This screen reports stored audit records only. It does not calculate trust scores, predict regulatory outcomes, or claim external-government integration.',
                    'تعرض هذه الشاشة سجلات التدقيق المخزنة فقط. ولا تحسب درجات ثقة أو تتنبأ بنتائج تنظيمية أو تدّعي وجود تكامل مع جهات حكومية خارجية.',
                )}
            </Alert>

            {loading && (
                <Paper
                    sx={{
                        minHeight: 260,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: binThemeTokens.card,
                        border: `1px solid ${binThemeTokens.border}`,
                    }}
                >
                    <Stack spacing={2} alignItems="center">
                        <CircularProgress sx={{ color: binThemeTokens.gold }} />
                        <Typography color={binThemeTokens.textSecondary}>
                            {copy('auditor.records_loading', 'Loading audit records…', 'جارٍ تحميل سجلات التدقيق…')}
                        </Typography>
                    </Stack>
                </Paper>
            )}

            {!loading && error && (
                <Alert
                    severity="error"
                    action={
                        <Button color="inherit" size="small" onClick={() => void loadRecords()}>
                            {copy('auditor.retry', 'Retry', 'إعادة المحاولة')}
                        </Button>
                    }
                >
                    {error}
                </Alert>
            )}

            {!loading && !error && records.length === 0 && (
                <Paper
                    sx={{
                        p: { xs: 3, md: 5 },
                        textAlign: 'center',
                        bgcolor: binThemeTokens.card,
                        border: `1px solid ${binThemeTokens.border}`,
                    }}
                >
                    <Typography variant="h6" fontWeight={900} color={binThemeTokens.textPrimary}>
                        {copy('auditor.empty_title', 'No audit records available', 'لا توجد سجلات تدقيق متاحة')}
                    </Typography>
                    <Typography sx={{ mt: 1 }} color={binThemeTokens.textSecondary}>
                        {copy(
                            'auditor.empty_body',
                            'No records were returned for this account. Nothing has been inferred or synthesized.',
                            'لم يتم إرجاع أي سجلات لهذا الحساب. لم يتم استنتاج أو إنشاء أي بيانات بديلة.',
                        )}
                    </Typography>
                </Paper>
            )}

            {!loading && !error && records.length > 0 && (
                <TableContainer
                    component={Paper}
                    sx={{
                        bgcolor: binThemeTokens.card,
                        border: `1px solid ${binThemeTokens.border}`,
                        overflowX: 'auto',
                    }}
                >
                    <Table sx={{ minWidth: 760 }} aria-label={copy('auditor.table_label', 'Audit records', 'سجلات التدقيق')}>
                        <TableHead>
                            <TableRow>
                                <TableCell>{copy('auditor.event', 'Event', 'الحدث')}</TableCell>
                                <TableCell>{copy('auditor.actor', 'Actor', 'المنفذ')}</TableCell>
                                <TableCell>{copy('auditor.target', 'Target', 'الهدف')}</TableCell>
                                <TableCell>{copy('auditor.record_id', 'Record ID', 'معرّف السجل')}</TableCell>
                                <TableCell>{copy('auditor.time', 'Time', 'الوقت')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {records.map((record) => (
                                <TableRow key={record.id} hover>
                                    <TableCell sx={{ fontWeight: 800 }}>
                                        {record.action || copy('auditor.unspecified_event', 'Audit event', 'حدث تدقيق')}
                                    </TableCell>
                                    <TableCell>
                                        {record.actorRole || copy('auditor.unknown_role', 'Unknown role', 'دور غير معروف')}
                                        {record.actorUid ? ` · ${record.actorUid}` : ''}
                                    </TableCell>
                                    <TableCell>
                                        {record.targetType || copy('auditor.unspecified_target', 'Unspecified', 'غير محدد')}
                                        {record.targetId ? ` · ${record.targetId}` : ''}
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{record.id}</TableCell>
                                    <TableCell>{formatTimestamp(record.createdAt, isRTL)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Container>
    );
}
