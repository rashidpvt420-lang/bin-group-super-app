import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Container, Paper, Grid, Stack, Button, Chip, 
    Divider, Table, TableBody, TableCell, TableContainer, TableHead, 
    TableRow, Tabs, Tab, TextField, alpha, CircularProgress 
} from '@mui/material';
import { 
    Building, Users, TrendingUp, Landmark, Share2, Search, 
    Briefcase, PieChart, Wallet, CreditCard, Clock, CheckCircle2, UserPlus, FileUp
} from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import Papa from 'papaparse';
import { db, collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { useAI } from '@bin/shared';
import { CeoContactButtons } from '../components/CeoContactButtons';

export default function BrokerPortalPage() {
    const { t, tx, isRTL } = useLanguage();
    const { user } = useRole();
    const { setPageContext } = useAI();
    const [uploading, setUploading] = React.useState(false);
    const [tab, setTab] = React.useState(0);
    const [leads, setLeads] = React.useState<any[]>([]);
    const [stats, setStats] = useState({
        pending: 0,
        approved: 0,
        paid: 0,
        totalLeads: 0
    });

    useEffect(() => {
        if (leads.length > 0) {
            setPageContext({ leads, stats });
        } else {
            setPageContext(null);
        }
        return () => setPageContext(null);
    }, [leads, stats]);

    // Manual Lead Form
    const [leadName, setLeadName] = useState('');
    const [leadPhone, setLeadPhone] = useState('');
    const [leadProperty, setLeadProperty] = useState('');
    const [manualSubmitting, setManualSubmitting] = useState(false);
    const brokerCode = user?.uid ? `BIN-${user.uid.slice(0, 6).toUpperCase()}` : 'BIN-PENDING';

    useEffect(() => {
        if (!user?.uid) return;

        const q = query(
            collection(db, 'intake_submissions'), 
            where('brokerId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(q, (snap) => {
            const fetchedLeads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLeads(fetchedLeads);

            let p = 0, a = 0, pd = 0;
            fetchedLeads.forEach((l: any) => {
                const commission = (l.mobilizationDue || 0) * 0.10;
                if (l.paymentStatus === 'VERIFIED') {
                    if (l.commissionStatus === 'PAID') pd += commission;
                    else a += commission;
                } else {
                    p += commission;
                }
            });
            setStats({ pending: p, approved: a, paid: pd, totalLeads: fetchedLeads.length });
        });

        return () => unsub();
    }, [user]);

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!leadName || !user) return;
        setManualSubmitting(true);
        try {
            await addDoc(collection(db, 'intake_submissions'), {
                companyId: 'BIN_GROUP',
                ownerName: leadName,
                ownerPhone: leadPhone,
                propertyName: leadProperty,
                brokerId: user.uid,
                brokerName: user.displayName,
                brokerCode,
                status: 'PENDING_REVIEW',
                paymentStatus: 'PENDING',
                commissionStatus: 'pending_lead',
                commissionRules: {
                    requiresPaymentVerification: true,
                    requiresFinanceApproval: true,
                    duplicateCommissionBlocked: true,
                    autoPayoutAllowed: false
                },
                createdBy: user.uid,
                createdByRole: 'broker',
                visibility: 'broker_admin_finance',
                auditVersion: 1,
                createdAt: serverTimestamp(),
                source: 'BROKER_MANUAL_ENTRY'
            });
            setLeadName(''); setLeadPhone(''); setLeadProperty('');
            alert("Lead registered successfully.");
        } catch (err) { console.error(err); } finally { setManualSubmitting(false); }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data as any[];
                let count = 0;
                for (const row of rows) {
                    if (row.propertyName && row.ownerName) {
                        await addDoc(collection(db, 'intake_submissions'), {
                            ...row,
                            companyId: 'BIN_GROUP',
                            brokerId: user?.uid,
                            brokerName: user?.displayName,
                            brokerCode,
                            status: 'PENDING_REVIEW',
                            paymentStatus: 'PENDING',
                            commissionStatus: 'pending_lead',
                            commissionRules: {
                                requiresPaymentVerification: true,
                                requiresFinanceApproval: true,
                                duplicateCommissionBlocked: true,
                                autoPayoutAllowed: false
                            },
                            createdBy: user?.uid,
                            createdByRole: 'broker',
                            visibility: 'broker_admin_finance',
                            auditVersion: 1,
                            createdAt: serverTimestamp(),
                            source: 'BROKER_CSV_IMPORT'
                        });
                        count++;
                    }
                }
                setUploading(false);
                alert(`${count} assets successfully added to the intake queue.`);
            },
            error: (err) => {
                console.error("CSV Parse Error:", err);
                setUploading(false);
            }
        });
    };

    const getStatusChip = (status: string) => {
        const s = status || 'PENDING';
        if (s === 'PROCESSED' || s === 'VERIFIED' || s === 'PAID') return <Chip label={s} size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 900 }} />;
        if (s === 'AWAITING_VERIFICATION' || s === 'PENDING_REVIEW') return <Chip label="REVIEWING" size="small" sx={{ bgcolor: 'rgba(59,130,246,0.1)', color: '#60A5FA', fontWeight: 900 }} />;
        return <Chip label={s} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontWeight: 900 }} />;
    };

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h3" fontWeight="900" sx={{ color: '#FFFFFF', letterSpacing: -1 }}>BROKER COMMAND</Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>SOVEREIGN REFERRAL ENGINE</Typography>
                    <Chip label={`Broker Code: ${brokerCode}`} size="small" sx={{ mt: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
                    <Box sx={{ mt: 1.5 }}>
                        <CeoContactButtons compact />
                    </Box>
                </Box>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ '& .MuiTab-root': { color: 'rgba(255,255,255,0.4)', fontWeight: 900 }, '& .Mui-selected': { color: binThemeTokens.gold } }}>
                    <Tab label="PIPELINE" />
                    <Tab label="COMMISSIONS" />
                </Tabs>
            </Box>

            {tab === 0 && (
                <Box>
                    <Grid container spacing={4} sx={{ mb: 6 }}>
                        <Grid item xs={12} lg={4}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                                <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <UserPlus color={binThemeTokens.gold} /> QUICK INTAKE
                                </Typography>
                                <form onSubmit={handleManualSubmit}>
                                    <Stack spacing={2}>
                                        <TextField fullWidth label="Client Name" size="small" value={leadName} onChange={(e) => setLeadName(e.target.value)} required />
                                        <TextField fullWidth label="Mobile Number" size="small" value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} />
                                        <TextField fullWidth label="Property Name" size="small" value={leadProperty} onChange={(e) => setLeadProperty(e.target.value)} />
                                        <Button type="submit" variant="contained" fullWidth disabled={manualSubmitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5 }}>
                                            {manualSubmitting ? <CircularProgress size={20} /> : 'REGISTER LEAD'}
                                        </Button>
                                    </Stack>
                                </form>
                                <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />
                                <Button component="label" fullWidth variant="outlined" startIcon={<FileUp />} sx={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.1)', fontWeight: 900 }}>
                                    BULK CSV IMPORT
                                    <input hidden accept=".csv" type="file" onChange={handleFileUpload} />
                                </Button>
                            </Paper>
                        </Grid>

                        <Grid item xs={12} lg={8}>
                            <TableContainer component={Paper} sx={{ bgcolor: 'rgba(22, 22, 24, 0.6)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="h6" fontWeight="950">LIVE PIPELINE</Typography>
                                </Box>
                                <Table>
                                    <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                                        <TableRow>
                                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ASSET / OWNER</TableCell>
                                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STATUS</TableCell>
                                            <TableCell align="right" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>EST. PAYOUT</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {leads.map((lead) => (
                                            <TableRow key={lead.id}>
                                                <TableCell>
                                                    <Typography variant="body1" fontWeight="900" color="#FFF">{lead.propertyName || 'Unnamed Asset'}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{lead.ownerName || 'Pending Contact'}</Typography>
                                                </TableCell>
                                                <TableCell>{getStatusChip(lead.status)}</TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body1" fontWeight="900" sx={{ color: lead.paymentStatus === 'VERIFIED' ? '#4ADE80' : '#FFF' }}>
                                                        AED {((lead.mobilizationDue || 0) * 0.10).toLocaleString()}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {leads.length === 0 && (
                                            <TableRow><TableCell colSpan={3} align="center" sx={{ py: 10, color: 'rgba(255,255,255,0.2)' }}>No leads in pipeline.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Grid>
                    </Grid>
                </Box>
            )}

            {tab === 1 && (
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                    <Grid container spacing={4}>
                        <Grid item xs={12} md={8}>
                            <Paper sx={{ p: 6, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198,167,94,0.15)', borderRadius: 8 }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>TREASURY OVERSIGHT</Typography>
                                <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 1, mb: 6 }}>Commission Lifecycle</Typography>
                                <Stack direction="row" spacing={1} sx={{ mb: 4, flexWrap: 'wrap', gap: 1 }}>
                                    {['pending_lead', 'contract_pending', 'payment_verified', 'finance_approved', 'payout_processing', 'paid', 'clawback_required'].map((status) => (
                                        <Chip key={status} label={status.replace(/_/g, ' ').toUpperCase()} size="small" variant="outlined" sx={{ color: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 800 }} />
                                    ))}
                                </Stack>
                                
                                <Stack spacing={6}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Box>
                                            <Typography variant="h6" fontWeight="900" color="#FFF">COMMISSION PENDING</Typography>
                                            <Typography variant="body2" color="textSecondary">Waiting for Owner Mobilization payment.</Typography>
                                        </Box>
                                        <Typography variant="h4" fontWeight="950" color="#FFF">AED {stats.pending.toLocaleString()}</Typography>
                                    </Box>
                                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Box>
                                            <Typography variant="h6" fontWeight="900" color="#10b981">APPROVED FOR PAYOUT</Typography>
                                            <Typography variant="body2" color="textSecondary">Mobilization verified. Payout scheduled.</Typography>
                                        </Box>
                                        <Typography variant="h4" fontWeight="950" color="#10b981">AED {stats.approved.toLocaleString()}</Typography>
                                    </Box>
                                </Stack>
                            </Paper>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, borderRadius: 6 }}>
                                <Stack spacing={4}>
                                    <Box>
                                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Wallet color={binThemeTokens.gold} /> PAYOUT
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>Configure UAE bank account for automated dispatches.</Typography>
                                    </Box>
                                    <TextField fullWidth label="BANK NAME" variant="filled" sx={{ bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }} />
                                    <TextField fullWidth label="IBAN NUMBER" variant="filled" sx={{ bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }} />
                                    <Button variant="contained" fullWidth sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2 }}>
                                        SAVE PROTOCOL
                                    </Button>
                                </Stack>
                            </Paper>
                        </Grid>
                    </Grid>
                </Box>
            )}
        </Container>
    );
}

