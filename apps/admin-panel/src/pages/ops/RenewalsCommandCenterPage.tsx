import React, { useState, useEffect, useRef } from 'react';
import {
    Alert,
    Box,
    Chip,
    CircularProgress,
    Divider,
    Grid,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
    alpha,
} from '@mui/material';
import { CalendarClock } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

type ContractRow = {
    id: string;
    propertyName?: string;
    ownerName?: string;
    tenantName?: string;
    expiresAt?: any;
    validTo?: any;
    effectiveTo?: any;
    contractCycle?: string;
    daysRemaining?: number;
    status?: string;
};

function daysUntil(value: any): number {
    if (!value) return Infinity;
    const d = typeof value?.toDate === 'function'
        ? value.toDate()
        : new Date(value.seconds ? value.seconds * 1000 : value);
    return isNaN(d.getTime()) ? Infinity : Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function urgencyColor(days: number): string {
    if (days <= 0) return '#ef4444';
    if (days <= 7) return '#ef4444';
    if (days <= 30) return '#f59e0b';
    if (days <= 60) return '#3b82f6';
    return '#10b981';
}

type UrgencyFilter = 'all' | 'critical' | 'urgent' | 'upcoming';

export default function RenewalsCommandCenterPage() {
    const { t, isRTL } = useLanguage();
    const [contracts, setContracts] = useState<ContractRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<UrgencyFilter>('all');
    const unsubRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const q = query(
            collection(db, 'contracts'),
            where('status', 'in', ['ACTIVE', 'active'])
        );
        unsubRef.current = onSnapshot(
            q,
            (snap) => {
                const rows: ContractRow[] = snap.docs
                    .map((d) => {
                        const data = d.data();
                        const days = daysUntil(data.expiresAt || data.validTo || data.effectiveTo);
                        return { id: d.id, ...data, daysRemaining: days } as ContractRow;
                    })
                    .filter((r) => (r.daysRemaining ?? Infinity) <= 120)
                    .sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
                setContracts(rows);
                setLoading(false);
            },
            (err) => {
                console.error('[Renewals] listener error:', err);
                setLoading(false);
            }
        );
        return () => { unsubRef.current?.(); };
    }, []);

    const formatDate = (value: any) => {
        if (!value) return '—';
        const d = typeof value?.toDate === 'function'
            ? value.toDate()
            : new Date(value.seconds ? value.seconds * 1000 : value);
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const urgencyLabel = (days: number): string => {
        if (days <= 0) return t('ops.renewals.expired');
        if (days <= 7) return t('ops.renewals.critical');
        if (days <= 30) return t('ops.renewals.urgent');
        if (days <= 60) return t('ops.renewals.upcoming');
        return t('ops.renewals.on_track');
    };

    const filtered = contracts.filter((c) => {
        const days = c.daysRemaining ?? Infinity;
        if (filter === 'critical') return days <= 7;
        if (filter === 'urgent') return days > 7 && days <= 30;
        if (filter === 'upcoming') return days > 30 && days <= 60;
        return true;
    });

    const critical = contracts.filter((c) => (c.daysRemaining ?? Infinity) <= 7).length;
    const urgent = contracts.filter((c) => { const d = c.daysRemaining ?? Infinity; return d > 7 && d <= 30; }).length;
    const upcoming = contracts.filter((c) => { const d = c.daysRemaining ?? Infinity; return d > 30 && d <= 60; }).length;

    const STATS = [
        { label: t('ops.renewals.stat_total'), value: contracts.length, color: '#6366f1' },
        { label: t('ops.renewals.stat_critical'), value: critical, color: '#ef4444' },
        { label: t('ops.renewals.stat_urgent'), value: urgent, color: '#f59e0b' },
        { label: t('ops.renewals.stat_upcoming'), value: upcoming, color: '#3b82f6' },
    ];

    return (
        <Box sx={{ p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="overline" sx={{ color: '#6366f1', fontWeight: 900, letterSpacing: 3 }}>
                    {t('ops.renewals.overline')}
                </Typography>
                <Typography variant="h4" fontWeight={900} sx={{ mt: 0.5 }}>
                    {t('ops.renewals.page_title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {t('ops.renewals.page_subtitle')}
                </Typography>
            </Box>

            <Grid container spacing={2} sx={{ mb: 4 }}>
                {STATS.map((s) => (
                    <Grid item xs={6} sm={3} key={s.label}>
                        <Paper sx={{ p: 3, borderRadius: 4, border: `1px solid ${alpha(s.color, 0.22)}`, bgcolor: alpha(s.color, 0.04), textAlign: 'center' }}>
                            <Typography variant="h3" fontWeight={950} color={s.color}>{s.value}</Typography>
                            <Typography variant="caption" color="text.secondary" fontWeight={700}>{s.label}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <ToggleButtonGroup
                    value={filter}
                    exclusive
                    onChange={(_, v) => { if (v) setFilter(v); }}
                    size="small"
                    sx={{ flexWrap: 'wrap', gap: 0.5 }}
                >
                    <ToggleButton value="all" sx={{ fontWeight: 800, fontSize: '0.75rem' }}>{t('ops.renewals.filter_all')}</ToggleButton>
                    <ToggleButton value="critical" sx={{ fontWeight: 800, fontSize: '0.75rem', color: '#ef4444' }}>{t('ops.renewals.critical')}</ToggleButton>
                    <ToggleButton value="urgent" sx={{ fontWeight: 800, fontSize: '0.75rem', color: '#f59e0b' }}>{t('ops.renewals.urgent')}</ToggleButton>
                    <ToggleButton value="upcoming" sx={{ fontWeight: 800, fontSize: '0.75rem', color: '#3b82f6' }}>{t('ops.renewals.upcoming')}</ToggleButton>
                </ToggleButtonGroup>
            </Stack>

            <Divider sx={{ mb: 3 }} />

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                    <CircularProgress />
                </Box>
            ) : filtered.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                    <CalendarClock size={40} color="#94a3b8" style={{ marginBottom: 12 }} />
                    <Typography color="text.secondary" fontWeight={700}>{t('ops.renewals.empty_state')}</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 4, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                    <Table>
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.renewals.col_property')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.renewals.col_owner')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.renewals.col_tenant')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.renewals.col_expiry')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.renewals.col_days')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.renewals.col_cycle')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.renewals.col_contract')}</TableCell>
                                <TableCell sx={{ fontWeight: 800 }}>{t('common.status')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.map((c) => {
                                const days = c.daysRemaining ?? Infinity;
                                const color = urgencyColor(days);
                                const expired = days <= 0;
                                return (
                                    <TableRow key={c.id} hover sx={{ borderLeft: `3px solid ${color}` }}>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="body2" fontWeight={800}>{c.propertyName || '—'}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="body2">{c.ownerName || '—'}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="body2">{c.tenantName || '—'}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="body2" color={expired ? '#ef4444' : 'text.primary'} fontWeight={expired ? 800 : 400}>
                                                {formatDate(c.expiresAt || (c as any).validTo || (c as any).effectiveTo)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="h6" fontWeight={950} color={color}>
                                                {expired ? '!' : days === Infinity ? '—' : days}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="caption" fontWeight={700} color="text.secondary">
                                                {c.contractCycle === 'RENEWAL'
                                                    ? (isRTL ? 'تجديد' : 'Renewal')
                                                    : (isRTL ? 'أولي' : 'Initial')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                                {c.id.substring(0, 10).toUpperCase()}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={urgencyLabel(days)}
                                                size="small"
                                                sx={{ bgcolor: alpha(color, 0.12), color, fontWeight: 900, border: `1px solid ${alpha(color, 0.3)}` }}
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}
