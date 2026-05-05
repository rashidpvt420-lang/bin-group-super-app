import React, { useState, useEffect } from 'react';
import {
    Grid, Typography, Box, Paper, Button, Chip, 
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions, Alert, 
    CircularProgress, alpha, Stack, IconButton, Avatar
} from '@mui/material';
import { 
    Wallet, Clock, FileText, Send, CheckCircle, AlertCircle,
    TrendingDown, ArrowUpRight, DollarSign, Download, Settings
} from 'lucide-react';
import { collection, onSnapshot, query, where, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

interface Technician {
    uid: string;
    displayName: string;
    email: string;
    specialization: string;
    baseSalary?: number;
}

interface PayrollRecord {
    id: string;
    techId: string;
    techName: string;
    amount: number;
    month: string;
    status: 'pending' | 'paid';
    processedAt: any;
}

export default function PayrollManagementPage() {
    const { t } = useLanguage();
    const [techs, setTechs] = useState<Technician[]>([]);
    const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [openProcess, setOpenAdd] = useState(false);

    const currentMonth = new Date().toISOString().slice(0, 7);

    useEffect(() => {
        const qTechs = query(collection(db, 'users'), where('role', '==', 'technician'));
        const unsubscribeTechs = onSnapshot(qTechs, (snap) => {
            setTechs(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Technician)));
        });

        const qPayroll = query(collection(db, 'payroll'));
        const unsubscribePayroll = onSnapshot(qPayroll, (snap) => {
            setPayroll(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRecord)));
            setLoading(false);
        });

        return () => {
            unsubscribeTechs();
            unsubscribePayroll();
        };
    }, []);

    const handleProcessPayroll = async () => {
        setProcessing(true);
        try {
            const batch = writeBatch(db);
            for (const tech of techs) {
                const existing = payroll.find(p => p.techId === tech.uid && p.month === currentMonth);
                if (existing) continue;

                const amount = tech.baseSalary || 3500;
                const payrollRef = doc(collection(db, 'payroll'));
                batch.set(payrollRef, {
                    techId: tech.uid,
                    techName: tech.displayName || tech.email,
                    amount,
                    month: currentMonth,
                    status: 'pending',
                    createdAt: serverTimestamp(),
                });
            }
            await batch.commit();
            setOpenAdd(false);
        } catch (err) {
            console.error("Payroll failure:", err);
        } finally {
            setProcessing(false);
        }
    };

    const totalPayroll = payroll
        .filter(p => p.month === currentMonth)
        .reduce((sum, p) => sum + p.amount, 0);

    const StatCard = ({ label, value, sub, icon: Icon, color }: any) => (
        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', top: -10, right: -10, opacity: 0.05 }}>
                <Icon size={120} color={color} />
            </Box>
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2 }}>{label}</Typography>
            <Typography variant="h3" fontWeight="950" sx={{ color: color || '#FFF', my: 1 }}>{value}</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{sub}</Typography>
        </Paper>
    );

    return (
        <AdminPageFrame
            title="Payroll Hub"
            subtitle="Institutional staff compensation and financial disbursement terminal"
            loading={loading}
            breadcrumbs={[{ label: 'Financials' }, { label: 'Payroll' }]}
            actions={
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Download size={18} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900 }}>EXPORT CSV</Button>
                    <Button 
                        variant="contained" 
                        startIcon={<Wallet size={18} />}
                        onClick={() => setOpenAdd(true)}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                    >
                        INITIALIZE CYCLE
                    </Button>
                </Stack>
            }
        >
            <Grid container spacing={4}>
                {/* FINANCIAL OVERVIEW */}
                <Grid item xs={12} md={4}>
                    <StatCard label="Total Liability" value={`AED ${totalPayroll.toLocaleString()}`} sub={`Month: ${currentMonth}`} icon={TrendingDown} color={binThemeTokens.gold} />
                </Grid>
                <Grid item xs={12} md={4}>
                    <StatCard label="Personnel Count" value={techs.length} sub="Active Tech Corps" icon={Users} color="#6366f1" />
                </Grid>
                <Grid item xs={12} md={4}>
                    <StatCard label="Pending Payouts" value={payroll.filter(p => p.status === 'pending').length} sub="Requiring Authorization" icon={Clock} color="#ef4444" />
                </Grid>

                {/* MAIN LEDGER */}
                <Grid item xs={12}>
                    <Paper sx={{ p: 0, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6" fontWeight="950" color="#FFF">STAFF DISBURSEMENT LEDGER</Typography>
                            <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.3)' }}><Settings size={18} /></IconButton>
                        </Box>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>PERSONNEL</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>CYCLE</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>GROSS AMOUNT</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>DISBURSEMENT STATUS</TableCell>
                                        <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>ACTIONS</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {payroll.sort((a,b) => b.month.localeCompare(a.month)).map((record) => (
                                        <TableRow key={record.id} hover>
                                            <TableCell>
                                                <Stack direction="row" spacing={2} alignItems="center">
                                                    <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(binThemeTokens.gold, 0.2), color: binThemeTokens.gold, fontWeight: 950, fontSize: '0.8rem' }}>
                                                        {record.techName?.charAt(0)}
                                                    </Avatar>
                                                    <Typography variant="body2" fontWeight="800" color="#FFF">{record.techName}</Typography>
                                                </Stack>
                                            </TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>{record.month}</TableCell>
                                            <TableCell sx={{ fontWeight: 950, color: binThemeTokens.gold }}>
                                                AED {record.amount.toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={record.status?.toUpperCase()} 
                                                    size="small"
                                                    sx={{ 
                                                        fontWeight: 950, fontSize: '0.6rem',
                                                        bgcolor: record.status === 'paid' ? alpha('#10b981', 0.1) : alpha('#f59e0b', 0.1),
                                                        color: record.status === 'paid' ? '#10b981' : '#f59e0b'
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                    <Button size="small" startIcon={<FileText size={14} />} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, fontSize: '0.65rem' }}>DOCS</Button>
                                                    {record.status === 'pending' && (
                                                        <Button 
                                                            size="small" 
                                                            variant="contained" 
                                                            startIcon={<Send size={14} />}
                                                            sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950, fontSize: '0.65rem', borderRadius: 2 }}
                                                        >
                                                            DISBURSE
                                                        </Button>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
            </Grid>

            {/* INITIALIZE DIALOG */}
            <Dialog open={openProcess} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)' } }}>
                <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold, borderBottom: '1px solid rgba(255,255,255,0.05)', py: 3 }}>
                    INITIALIZE PAYROLL CYCLE
                </DialogTitle>
                <DialogContent sx={{ py: 3 }}>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>
                        This will generate pending payroll records for all active technicians for the current cycle ({currentMonth}).
                    </Typography>
                    <Paper sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 3 }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <AlertCircle color={binThemeTokens.gold} size={24} />
                            <Typography variant="body2" fontWeight="900" color="#FFF">
                                {techs.length} Technicians detected in current roster.
                            </Typography>
                        </Stack>
                    </Paper>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
                    <Button variant="contained" onClick={handleProcessPayroll} disabled={processing} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}>
                        {processing ? <CircularProgress size={18} color="inherit" /> : 'EXECUTE GENERATION'}
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}
