import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Paper, Grid, Button, alpha, CircularProgress, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { db, collection, query, getDocs, orderBy, limit, doc, updateDoc, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { useLanguage } from '@bin/shared';

export default function BrokerCommissionHubPage() {
    const { t, isRTL } = useLanguage();
    const [commissions, setCommissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [stats, setStats] = useState({
        pending: 0,
        approved: 0,
        paid: 0
    });

    useEffect(() => {
        const fetchCommissions = async () => {
            try {
                const q = query(collection(db, 'broker_commissions'), orderBy('createdAt', 'desc'), limit(100));
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setCommissions(data);

                let p = 0; let a = 0; let paid = 0;
                data.forEach((c: any) => {
                    const amount = Number(c.amount || 0);
                    if (c.status === 'PENDING') p += amount;
                    else if (c.status === 'APPROVED') a += amount;
                    else if (c.status === 'PAID') paid += amount;
                });
                setStats({ pending: p, approved: a, paid: paid });
            } catch (err) {
                console.error("Commission fetch error:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchCommissions();
    }, []);

    const recalcStats = (data: any[]) => {
        let p = 0; let a = 0; let paid = 0;
        data.forEach((c: any) => {
            const amount = Number(c.amount || 0);
            if (c.status === 'PENDING') p += amount;
            else if (c.status === 'APPROVED') a += amount;
            else if (c.status === 'PAID') paid += amount;
        });
        setStats({ pending: p, approved: a, paid });
    };

    const handleApprove = async (id: string) => {
        setBusyId(id);
        try {
            await updateDoc(doc(db, 'broker_commissions', id), {
                status: 'APPROVED',
                approvedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            setCommissions(prev => {
                const next = prev.map(c => c.id === id ? { ...c, status: 'APPROVED' } : c);
                recalcStats(next);
                return next;
            });
        } catch (e) {
            console.warn('[COMMISSION_HUB] Failed to approve commission.', e);
        } finally {
            setBusyId(null);
        }
    };


    const handleMarkPaid = async (id: string) => {
        setBusyId(id);
        try {
            const paidDate = new Date().toISOString();
            await updateDoc(doc(db, 'broker_commissions', id), {
                status: 'PAID',
                paidDate,
                paidAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            setCommissions(prev => {
                const next = prev.map(c => c.id === id ? { ...c, status: 'PAID', paidDate } : c);
                recalcStats(next);
                return next;
            });
        } catch (e) {
            console.warn('[COMMISSION_HUB] Failed to mark commission as paid.', e);
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }}/></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{t('admin.commission_hub.administry_operations')}</Typography>
                <Typography variant="h3" fontWeight="950" color="#FFF">{t('admin.commission_hub.page_title')} <Box component="span" sx={{ color: binThemeTokens.gold }}>{t('admin.commission_hub.page_title_suffix')}</Box></Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">{t('admin.commission_hub.page_subtitle')}</Typography>
            </Box>

            <Grid container spacing={4} sx={{ mb: 6 }}>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">{t('admin.commission_hub.pending_approval')}</Typography>
                        <Typography variant="h4" fontWeight="950" color={binThemeTokens.gold}>{t('admin.commission_hub.amount_aed', { amount: stats.pending.toLocaleString() })}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">{t('admin.commission_hub.approved_pipeline')}</Typography>
                        <Typography variant="h4" fontWeight="950" color="#10b981">{t('admin.commission_hub.amount_aed', { amount: stats.approved.toLocaleString() })}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">{t('admin.commission_hub.total_disbursed')}</Typography>
                        <Typography variant="h4" fontWeight="950" color="#FFF">{t('admin.commission_hub.amount_aed', { amount: stats.paid.toLocaleString() })}</Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('admin.commission_hub.col_broker')}</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('admin.commission_hub.col_ref_contract')}</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('admin.commission_hub.col_status')}</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }} align="right">{t('admin.commission_hub.col_amount_aed')}</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }} align="center">{t('admin.commission_hub.col_actions')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {commissions.map((c) => (
                                <TableRow key={c.id}>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        <Typography fontWeight="900" color="#FFF">{c.brokerName}</Typography>
                                        <Typography variant="caption" color="textSecondary">{t('admin.commission_hub.broker_code', { code: c.brokerCode })}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        <Typography variant="body2" color="#FFF">{c.contractId?.substring(0,8)}</Typography>
                                        <Typography variant="caption" color="textSecondary">{c.propertyName}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        <Chip 
                                            label={c.status} 
                                            size="small" 
                                            sx={{ 
                                                fontWeight: 900, fontSize: '0.6rem',
                                                bgcolor: c.status === 'PAID' ? alpha('#10b981', 0.1) : (c.status === 'APPROVED' ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.05)'),
                                                color: c.status === 'PAID' ? '#10b981' : (c.status === 'APPROVED' ? binThemeTokens.gold : 'rgba(255,255,255,0.5)')
                                            }} 
                                        />
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 900, color: '#FFF', borderBottom: '1px solid rgba(255,255,255,0.02)' }} align="right">
                                        {Number(c.amount || 0).toLocaleString()}
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }} align="center">
                                        {c.status === 'PENDING' && (
                                            <Button size="small" disabled={busyId === c.id} onClick={() => handleApprove(c.id)} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.commission_hub.approve')}</Button>
                                        )}
                                        {c.status === 'APPROVED' && (
                                            <Button size="small" disabled={busyId === c.id} onClick={() => handleMarkPaid(c.id)} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>{t('admin.commission_hub.mark_paid')}</Button>
                                        )}
                                        {c.status === 'PAID' && (
                                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>{t('admin.commission_hub.paid')}</Typography>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {commissions.length === 0 && (
                                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: 'rgba(255,255,255,0.2)' }}>{t('admin.commission_hub.empty_state')}</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Container>
    );
}
