import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { 
    Alert, Box, Typography, Paper, Grid, Stack, CircularProgress,
    Chip, Table, TableBody, TableCell, TableContainer, TableHead, 
    TableRow, alpha, IconButton, Tooltip, Button 
} from '@mui/material';
import { 
    Wallet, Landmark, ArrowUpRight, TrendingUp, 
    ShieldCheck, Calendar, Info, FileText, 
    Download, ExternalLink, Filter, Clock, Send
} from 'lucide-react';
import { db, collection, query, where, getDocs, orderBy, functions, httpsCallable, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

export default function BrokerCommissionsPage() {
    const { user } = useRole();
    const { isRTL } = useLanguage();

    const exportReport = () => {
        const pdf = new jsPDF();
        pdf.setFillColor(5, 5, 5); pdf.rect(0, 0, 210, 297, 'F');
        pdf.setTextColor(198, 167, 94); pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
        pdf.text('BROKER COMMISSION STATEMENT', 14, 20);
        pdf.setFontSize(9); pdf.setTextColor(255, 255, 255);
        pdf.text(`Broker: ${user?.displayName || user?.email || 'N/A'}`, 14, 30);
        pdf.text(`Generated: ${new Date().toLocaleDateString()} | BIN GROUP Platform`, 14, 37);
        pdf.setDrawColor(198, 167, 94); pdf.line(14, 42, 196, 42);
        let y = 52;
        pdf.setTextColor(198, 167, 94); pdf.setFontSize(10); pdf.text('COMMISSION LEDGER', 14, y); y += 8;
        commissions.forEach((c: any) => {
            if (y > 265) { pdf.addPage(); pdf.setFillColor(5,5,5); pdf.rect(0,0,210,297,'F'); y = 20; }
            pdf.setTextColor(255, 255, 255); pdf.setFontSize(8);
            const date = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : 'N/A';
            const name = c.linkedLeadName || c.linkedReferralName || 'Direct Mission';
            const prop = c.linkedProperty || c.propertyName || '';
            pdf.text(`${date}  |  ${name}${prop ? ` — ${prop}` : ''}`, 14, y); y += 5;
            pdf.setTextColor(198, 167, 94);
            pdf.text(`AED ${(c.amount || 0).toLocaleString()}  |  ${String(c.status || '').toUpperCase()}`, 14, y); y += 8;
        });
        pdf.setTextColor(100, 100, 100); pdf.setFontSize(8);
        pdf.text('BIN GROUP Sovereign Platform | Confidential Commission Record', 14, 285);
        pdf.save(`commission-statement-${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const viewStatement = (c: any) => {
        const pdf = new jsPDF();
        pdf.setFillColor(5, 5, 5); pdf.rect(0, 0, 210, 297, 'F');
        pdf.setTextColor(198, 167, 94); pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
        pdf.text('COMMISSION STATEMENT', 14, 20);
        pdf.setFontSize(9); pdf.setTextColor(255, 255, 255);
        pdf.text(`Ref: #${c.id.substring(0,8).toUpperCase()}`, 14, 30);
        pdf.text(`Date: ${c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : 'N/A'}`, 14, 37);
        pdf.setDrawColor(198, 167, 94); pdf.line(14, 42, 196, 42);
        let y = 52;
        const fields = [
            ['Client / Lead', c.linkedLeadName || c.linkedReferralName || 'Direct Mission'],
            ['Property', c.linkedProperty || c.propertyName || 'Portfolio Wide'],
            ['Amount', `AED ${(c.amount || 0).toLocaleString()}`],
            ['Commission %', c.percentage ? `${c.percentage}%` : 'N/A'],
            ['Status', String(c.status || '').toUpperCase()],
            ['Payout Date', c.paidDate?.toDate ? c.paidDate.toDate().toLocaleDateString() : c.expectedPayoutDate?.toDate ? c.expectedPayoutDate.toDate().toLocaleDateString() : 'Cycle End'],
        ];
        fields.forEach(([label, val]) => {
            pdf.setTextColor(198, 167, 94); pdf.text(`${label}:`, 14, y);
            pdf.setTextColor(255, 255, 255); pdf.text(val, 70, y); y += 10;
        });
        pdf.setTextColor(100, 100, 100); pdf.setFontSize(8);
        pdf.text('BIN GROUP Sovereign Platform | Confidential Commission Record', 14, 285);
        pdf.save(`commission-${c.id.substring(0,8)}.pdf`);
    };
    const [commissions, setCommissions] = useState<any[]>([]);
    const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [payoutBusy, setPayoutBusy] = useState(false);
    const [payoutNotice, setPayoutNotice] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; text: string } | null>(null);

    const fetchCommissions = async () => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }
        try {
            const q = query(
                collection(db, 'broker_commissions'),
                where('brokerId', '==', user.uid),
                orderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);
            setCommissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            console.error("Failed to fetch commissions:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCommissions();
        if (!user?.uid) return () => undefined;
        const payoutQuery = query(collection(db, 'broker_payout_requests'), where('brokerId', '==', user.uid));
        const unsubscribe = onSnapshot(payoutQuery, (snapshot) => {
            const rows = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            rows.sort((a: any, b: any) => {
                const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
                const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
                return bTime - aTime;
            });
            setPayoutRequests(rows);
        }, (err) => console.warn('[BrokerCommissions] payout request listener failed:', err));
        return () => unsubscribe();
    }, [user?.uid]);

    const getStatusColor = (status: string) => {
        const s = String(status || '').toLowerCase();
        switch (s) {
            case 'paid': return '#10b981';
            case 'approved': return '#3b82f6';
            case 'rejected': return '#ef4444';
            case 'pending': return binThemeTokens.gold;
            default: return binThemeTokens.textSecondary;
        }
    };

    const stats = {
        pending: commissions.filter(c => String(c.status || '').toLowerCase() === 'pending').reduce((acc, curr) => acc + (curr.amount || 0), 0),
        approved: commissions.filter(c => String(c.status || '').toLowerCase() === 'approved').reduce((acc, curr) => acc + (curr.amount || 0), 0),
        totalPaid: commissions.filter(c => String(c.status || '').toLowerCase() === 'paid').reduce((acc, curr) => acc + (curr.amount || 0), 0)
    };
    const payableCommissions = commissions.filter((c) => {
        const status = String(c.status || '').toLowerCase();
        const payoutStatus = String(c.payoutStatus || '').toLowerCase();
        return status === 'approved' && !['requested', 'approved', 'paid'].includes(payoutStatus);
    });
    const latestPayout = payoutRequests[0];

    const requestPayout = async () => {
        if (!payableCommissions.length) {
            setPayoutNotice({ type: 'warning', text: 'No approved unpaid commissions are available for payout.' });
            return;
        }
        setPayoutBusy(true);
        setPayoutNotice(null);
        try {
            const callable = httpsCallable(functions, 'submitBrokerPayoutRequest');
            const result = await callable({ commissionIds: payableCommissions.map((commission) => commission.id) });
            const data = result.data as any;
            setPayoutNotice({ type: 'success', text: `Payout request submitted for AED ${Number(data?.amount || 0).toLocaleString()} across ${data?.commissionCount || payableCommissions.length} commission(s).` });
            await fetchCommissions();
        } catch (err: any) {
            setPayoutNotice({ type: 'error', text: err?.message || 'Payout request failed. Complete KYC, bank details, and commission terms before requesting.' });
        } finally {
            setPayoutBusy(false);
        }
    };

    return (
        <BrokerPageFrame
            title="Finance & Payouts"
            subtitle="Institutional tracking of earned brokerage commissions"
            loading={loading}
            actions={
                <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5}>
                    <Button
                        variant="contained"
                        startIcon={<Send size={18} />}
                        disabled={payoutBusy || payableCommissions.length === 0}
                        onClick={requestPayout}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3, borderRadius: 3 }}
                    >
                        {payoutBusy ? 'REQUESTING...' : `REQUEST PAYOUT (${payableCommissions.length})`}
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<Download size={18} />}
                        onClick={exportReport}
                        sx={{ color: binThemeTokens.textPrimary, borderColor: '#E5E7EB', fontWeight: 900, px: 3, borderRadius: 3 }}
                    >
                        EXPORT REPORT
                    </Button>
                </Stack>
            }
        >
            {payoutNotice && <Alert severity={payoutNotice.type} sx={{ mb: 3 }} onClose={() => setPayoutNotice(null)}>{payoutNotice.text}</Alert>}

            <Grid container spacing={3} sx={{ mb: 6 }}>
                {[
                    { label: 'PENDING SETTLEMENT', value: stats.pending, color: binThemeTokens.gold, icon: <Clock size={24} /> },
                    { label: 'APPROVED FOR PAYOUT', value: stats.approved, color: '#3b82f6', icon: <ShieldCheck size={24} /> },
                    { label: 'LIFETIME EARNED', value: stats.totalPaid, color: '#10b981', icon: <TrendingUp size={24} /> },
                ].map((stat, idx) => (
                    <Grid item xs={12} md={4} key={idx}>
                        <Paper sx={{ 
                            p: 4, 
                            bgcolor: alpha(stat.color, 0.05), 
                            border: `1px solid ${alpha(stat.color, 0.15)}`, 
                            borderRadius: 6,
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <Box sx={{ position: 'absolute', top: -10, right: -10, opacity: 0.1, color: stat.color }}>
                                {stat.icon}
                            </Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 1.5 }}>{stat.label}</Typography>
                            <Typography variant="h3" fontWeight="950" sx={{ color: stat.color, mt: 1, letterSpacing: -1 }}>
                                <Typography component="span" variant="h5" sx={{ color: stat.color, mr: 1, fontWeight: 950 }}>AED</Typography>
                                {stat.value.toLocaleString()}
                            </Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Paper sx={{ mb: 4, p: 3, bgcolor: binThemeTokens.softCanvas, borderRadius: 5, border: '1px solid #E5E7EB' }}>
                <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2}>
                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>PAYOUT WORKFLOW</Typography>
                        <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>
                            {payableCommissions.length ? `${payableCommissions.length} approved commission(s) ready to request` : 'No approved commission is currently payable'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                            Requests stay pending until Admin Finance approves or marks the bank transfer paid.
                        </Typography>
                    </Box>
                    <Stack spacing={0.7} sx={{ minWidth: { md: 260 }, textAlign: isRTL ? 'right' : 'left' }}>
                        <Chip
                            label={latestPayout ? String(latestPayout.status || 'PENDING_ADMIN_REVIEW').replaceAll('_', ' ').toUpperCase() : 'NO REQUEST YET'}
                            sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', bgcolor: alpha(latestPayout?.status === 'PAID' ? '#10b981' : binThemeTokens.gold, 0.1), color: latestPayout?.status === 'PAID' ? '#10b981' : binThemeTokens.gold, fontWeight: 950 }}
                        />
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>
                            Latest payout: {latestPayout ? `AED ${Number(latestPayout.amount || 0).toLocaleString()} · ${latestPayout.commissionCount || latestPayout.commissionIds?.length || 0} commission(s)` : 'Submit once commissions are approved.'}
                        </Typography>
                    </Stack>
                </Stack>
                {payoutRequests.length > 0 && (
                    <Stack spacing={1} sx={{ mt: 2 }}>
                        {payoutRequests.slice(0, 3).map((request) => (
                            <Box key={request.id} sx={{ p: 1.5, borderRadius: 3, bgcolor: '#fff', border: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>AED {Number(request.amount || 0).toLocaleString()}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{request.id.substring(0, 8).toUpperCase()} · {request.commissionCount || request.commissionIds?.length || 0} commission(s)</Typography>
                                </Box>
                                <Chip size="small" label={String(request.status || 'PENDING').replaceAll('_', ' ').toUpperCase()} sx={{ fontWeight: 950, bgcolor: alpha(request.status === 'PAID' ? '#10b981' : request.status === 'REJECTED' ? '#ef4444' : binThemeTokens.gold, 0.1), color: request.status === 'PAID' ? '#10b981' : request.status === 'REJECTED' ? '#ef4444' : binThemeTokens.gold }} />
                            </Box>
                        ))}
                    </Stack>
                )}
            </Paper>

            {/* ─── COMMISSIONS TABLE ─────────────────────────────────────────── */}
            <TableContainer component={Paper} sx={{ bgcolor: binThemeTokens.softCanvas, borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                <Table>
                    <TableHead sx={{ bgcolor: '#F3F4F6' }}>
                        <TableRow>
                            <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, borderBottom: '1px solid #E5E7EB' }}>MISSION REF</TableCell>
                            <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, borderBottom: '1px solid #E5E7EB' }}>SOURCE / PROPERTY</TableCell>
                            <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, borderBottom: '1px solid #E5E7EB' }}>ALLOCATION</TableCell>
                            <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, borderBottom: '1px solid #E5E7EB' }}>STATUS</TableCell>
                            <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, borderBottom: '1px solid #E5E7EB' }}>SETTLEMENT</TableCell>
                            <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, borderBottom: '1px solid #E5E7EB' }} align="right">ACTIONS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {commissions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 10, border: 'none' }}>
                                    <Box sx={{ color: '#9CA3AF' }}>
                                        <Wallet size={48} />
                                        <Typography variant="body2" sx={{ mt: 2, fontWeight: 900 }}>NO FINANCIAL RECORDS DETECTED</Typography>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ) : (
                            commissions.map((c) => (
                                <TableRow key={c.id} sx={{ '&:hover': { bgcolor: '#F3F4F6' } }}>
                                    <TableCell sx={{ borderBottom: '1px solid #F1F2F4' }}>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950, fontFamily: 'monospace' }}>#{c.id.substring(0,8).toUpperCase()}</Typography>
                                        <Typography variant="caption" sx={{ color: '#9CA3AF', fontWeight: 800 }}>{c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : 'N/A'}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid #F1F2F4' }}>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>{c.linkedLeadName || c.linkedReferralName || c.brokerName || 'Direct Mission'}</Typography>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{c.linkedProperty || c.propertyName || 'Portfolio Wide'}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid #F1F2F4' }}>
                                        <Typography variant="body1" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>AED {c.amount?.toLocaleString()}</Typography>
                                        {c.percentage && <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>{c.percentage}% Yield</Typography>}
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid #F1F2F4' }}>
                                        <Chip
                                            label={String(c.status || '').toUpperCase()}
                                            size="small"
                                            sx={{ bgcolor: alpha(getStatusColor(c.status), 0.1), color: getStatusColor(c.status), fontWeight: 950, fontSize: '0.65rem' }}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid #F1F2F4' }}>
                                        {String(c.status || '').toLowerCase() === 'paid' ? (
                                            <Box>
                                                <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 900 }}>SETTLED</Typography>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{c.paidDate?.toDate ? c.paidDate.toDate().toLocaleDateString() : 'N/A'}</Typography>
                                            </Box>
                                        ) : c.payoutStatus ? (
                                            <Box>
                                                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{String(c.payoutStatus).replaceAll('_', ' ').toUpperCase()}</Typography>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{c.payoutRequestId ? `Request ${String(c.payoutRequestId).substring(0, 8).toUpperCase()}` : 'Admin finance review'}</Typography>
                                            </Box>
                                        ) : (
                                            <Box>
                                                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ESTIMATED</Typography>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{c.expectedPayoutDate?.toDate ? c.expectedPayoutDate.toDate().toLocaleDateString() : 'Cycle End'}</Typography>
                                            </Box>
                                        )}
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid #F1F2F4' }} align="right">
                                        <Tooltip title="View Statement">
                                            <IconButton onClick={() => viewStatement(c)} sx={{ color: binThemeTokens.textSecondary, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 2 }}>
                                                <ExternalLink size={18} />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* ─── FINANCE NOTICE ────────────────────────────────────────────── */}
            <Paper sx={{ mt: 4, p: 3, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`, borderRadius: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <Info size={20} color={binThemeTokens.gold} />
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>
                        All commissions are subject to local tax laws and RERA brokerage fee regulations. Payments are processed within 14 business days of institutional approval.
                    </Typography>
                </Stack>
            </Paper>
        </BrokerPageFrame>
    );
}
