import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { 
    Box, Typography, Paper, Grid, Stack, CircularProgress, 
    Chip, Table, TableBody, TableCell, TableContainer, TableHead, 
    TableRow, alpha, IconButton, Tooltip, Button 
} from '@mui/material';
import { 
    Wallet, Landmark, ArrowUpRight, TrendingUp, 
    ShieldCheck, Calendar, Info, FileText, 
    Download, ExternalLink, Filter, Clock
} from 'lucide-react';
import { db, collection, query, where, getDocs, orderBy } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

export default function BrokerCommissionsPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();

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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCommissions = async () => {
            if (!user?.uid) return;
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
        fetchCommissions();
    }, [user]);

    const getStatusColor = (status: string) => {
        const s = String(status || '').toLowerCase();
        switch (s) {
            case 'paid': return '#10b981';
            case 'approved': return '#3b82f6';
            case 'rejected': return '#ef4444';
            case 'pending': return binThemeTokens.gold;
            default: return 'rgba(255,255,255,0.4)';
        }
    };

    const stats = {
        pending: commissions.filter(c => String(c.status || '').toLowerCase() === 'pending').reduce((acc, curr) => acc + (curr.amount || 0), 0),
        approved: commissions.filter(c => String(c.status || '').toLowerCase() === 'approved').reduce((acc, curr) => acc + (curr.amount || 0), 0),
        totalPaid: commissions.filter(c => String(c.status || '').toLowerCase() === 'paid').reduce((acc, curr) => acc + (curr.amount || 0), 0)
    };

    return (
        <BrokerPageFrame
            title="Finance & Payouts"
            subtitle="Institutional tracking of earned brokerage commissions"
            loading={loading}
            actions={
                <Button
                    variant="outlined"
                    startIcon={<Download size={18} />}
                    onClick={exportReport}
                    sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', fontWeight: 900, px: 3, borderRadius: 3 }}
                >
                    EXPORT REPORT
                </Button>
            }
        >
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
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, letterSpacing: 1.5 }}>{stat.label}</Typography>
                            <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 1, letterSpacing: -1 }}>
                                <Typography component="span" variant="h5" sx={{ color: stat.color, mr: 1, fontWeight: 950 }}>AED</Typography>
                                {stat.value.toLocaleString()}
                            </Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* ─── COMMISSIONS TABLE ─────────────────────────────────────────── */}
            <TableContainer component={Paper} sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <Table>
                    <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                        <TableRow>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>MISSION REF</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>SOURCE / PROPERTY</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>ALLOCATION</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>STATUS</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>SETTLEMENT</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)' }} align="right">ACTIONS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {commissions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 10, border: 'none' }}>
                                    <Box sx={{ opacity: 0.2 }}>
                                        <Wallet size={48} />
                                        <Typography variant="body2" sx={{ mt: 2, fontWeight: 900 }}>NO FINANCIAL RECORDS DETECTED</Typography>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ) : (
                            commissions.map((c) => (
                                <TableRow key={c.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.01)' } }}>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950, fontFamily: 'monospace' }}>#{c.id.substring(0,8).toUpperCase()}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>{c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : 'N/A'}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900 }}>{c.linkedLeadName || c.linkedReferralName || c.brokerName || 'Direct Mission'}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{c.linkedProperty || c.propertyName || 'Portfolio Wide'}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Typography variant="body1" sx={{ color: '#FFF', fontWeight: 950 }}>AED {c.amount?.toLocaleString()}</Typography>
                                        {c.percentage && <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>{c.percentage}% Yield</Typography>}
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Chip 
                                            label={String(c.status || '').toUpperCase()} 
                                            size="small"
                                            sx={{ bgcolor: alpha(getStatusColor(c.status), 0.1), color: getStatusColor(c.status), fontWeight: 950, fontSize: '0.65rem' }} 
                                        />
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        {String(c.status || '').toLowerCase() === 'paid' ? (
                                            <Box>
                                                <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 900 }}>SETTLED</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{c.paidDate?.toDate ? c.paidDate.toDate().toLocaleDateString() : 'N/A'}</Typography>
                                            </Box>
                                        ) : (
                                            <Box>
                                                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ESTIMATED</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{c.expectedPayoutDate?.toDate ? c.expectedPayoutDate.toDate().toLocaleDateString() : 'Cycle End'}</Typography>
                                            </Box>
                                        )}
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }} align="right">
                                        <Tooltip title="View Statement">
                                            <IconButton onClick={() => viewStatement(c)} sx={{ color: 'rgba(255,255,255,0.4)', bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
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
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                        All commissions are subject to local tax laws and RERA brokerage fee regulations. Payments are processed within 14 business days of institutional approval.
                    </Typography>
                </Stack>
            </Paper>
        </BrokerPageFrame>
    );
}
