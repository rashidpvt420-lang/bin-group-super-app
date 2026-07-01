import React, { useState, useEffect } from 'react';
import { useLanguage } from '@bin/shared';
import { useNavigate } from 'react-router-dom';
import {
    Container, Typography, Box, Paper, Grid, Stack, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, Avatar, alpha, CircularProgress, Tab, Tabs, TextField, InputAdornment,
    IconButton, Alert
} from '@mui/material';
import { 
    DollarSign, 
    FileText, UserPlus, ChevronRight, Search as SearchIcon
} from 'lucide-react';
import { db, collection, query, onSnapshot, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { useAuth } from '../../context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../lib/firebase';
import RegisterStaffDialog from '../../components/RegisterStaffDialog';

export default function HRManagementPage() {
    const { t, isRTL } = useLanguage();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState(0);
    const [staff, setStaff] = useState<any[]>([]);
    const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    const [payrollError, setPayrollError] = useState<string | null>(null);
    const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);

    const isHRManager = user?.role === 'hr_manager' || user?.role === 'admin' || user?.role === 'ceo';
    const isHRStaff = user?.role === 'hr_staff' || isHRManager;

    useEffect(() => {
        // Load staff / technician records
        const q = query(collection(db, 'users'), where('role', 'in', ['technician', 'hr_staff', 'hr_manager']));
        const unsub = onSnapshot(q, (snap) => {
            setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        // Real payroll ledger, used by the Payroll Hub tab instead of placeholder rows
        const q = query(collection(db, 'payroll'));
        const unsub = onSnapshot(q, (snap) => {
            setPayrollRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, []);

    const treasuryLogsByMonth = Object.values(
        payrollRecords.reduce((acc: Record<string, { month: string; total: number; allPaid: boolean }>, rec: any) => {
            const key = rec.month || 'UNKNOWN';
            if (!acc[key]) acc[key] = { month: key, total: 0, allPaid: true };
            acc[key].total += Number(rec.amount) || 0;
            if (rec.status !== 'paid') acc[key].allPaid = false;
            return acc;
        }, {})
    ).sort((a: any, b: any) => b.month.localeCompare(a.month)).slice(0, 6);

    const nextDispatchDate = (() => {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    })();

    const getStatusColor = (status: string) => {
        switch (status?.toUpperCase()) {
            case 'ACTIVE': return '#10b981';
            case 'ON_LEAVE': return '#f59e0b';
            case 'INACTIVE': return '#ef4444';
            default: return 'rgba(255,255,255,0.4)';
        }
    };

    const getPayrollErrorMessage = (err: any, tFn: typeof t) => {
        const code = err?.code || 'functions/internal';
        const message = err?.message || '';

        if (code === 'functions/unauthenticated') return tFn('admin.hr_management.err_unauthenticated');
        if (code === 'functions/permission-denied') return tFn('admin.hr_management.err_permission_denied');
        if (code === 'functions/failed-precondition') return tFn('admin.hr_management.err_failed_precondition');
        if (code === 'functions/invalid-argument') return tFn('admin.hr_management.err_invalid_argument').replace('{message}', message);
        return tFn('admin.hr_management.err_generic').replace('{code}', code).replace('{message}', message);
    };

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Container maxWidth="xl">
                <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                            {t('admin.hr_management.overline')}
                        </Typography>
                        <Typography variant="h3" fontWeight="950" color="#FFF">
                            {t('admin.hr_management.page_title')} <Box component="span" sx={{ color: binThemeTokens.gold }}>{t('admin.hr_management.page_title_highlight')}</Box>
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={2}>
                        {isHRManager && (
                            <Button 
                                variant="contained" 
                                startIcon={<UserPlus size={18} />} 
                                onClick={() => setIsRegisterDialogOpen(true)}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                            >
                                {t('admin.hr_management.register_staff_btn')}
                            </Button>
                        )}
                    </Stack>
                </Box>

                <RegisterStaffDialog 
                    open={isRegisterDialogOpen} 
                    onClose={() => setIsRegisterDialogOpen(false)} 
                />

                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 4, '& .MuiTab-root': { color: 'rgba(255,255,255,0.4)', fontWeight: 900 } }}>
                    <Tab label={t('admin.hr_management.tab_registry')} />
                    <Tab label={t('admin.hr_management.tab_attendance')} disabled={!isHRStaff} />
                    <Tab label={t('admin.hr_management.tab_payroll')} disabled={!isHRManager} />
                    <Tab label={t('admin.hr_management.tab_documents')} disabled={!isHRStaff} />
                </Tabs>

                {payrollError && (
                    <Alert
                        severity="error"
                        onClose={() => setPayrollError(null)}
                        sx={{ mb: 3, bgcolor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#fecaca' }}
                    >
                        {payrollError}
                    </Alert>
                )}

                {tab === 0 && (
                    <Paper sx={{ p: 0, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <TextField
                                placeholder={t('admin.hr_management.search_placeholder')} 
                                size="small"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><SearchIcon size={18} color="rgba(255,255,255,0.3)" /></InputAdornment>,
                                    sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }
                                }}
                                sx={{ width: 400 }}
                            />
                            <Chip label={t('admin.hr_management.total_personnel_chip').replace('{count}', String(staff.length))} sx={{ fontWeight: 900 }} />
                        </Box>

                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.hr_management.col_personnel')}</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.hr_management.col_role_spec')}</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.hr_management.col_zone')}</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.hr_management.col_status')}</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.hr_management.col_kpi')}</TableCell>
                                        <TableCell align="right"></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {staff.map((s) => (
                                        <TableRow key={s.id} hover>
                                            <TableCell>
                                                <Stack direction="row" spacing={2} alignItems="center">
                                                    <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.2), color: binThemeTokens.gold, fontWeight: 900 }}>
                                                        {s.displayName?.charAt(0)}
                                                    </Avatar>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight="900" color="#FFF">{s.displayName}</Typography>
                                                        <Typography variant="caption" color="textSecondary">{s.email}</Typography>
                                                    </Box>
                                                </Stack>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="700" color="#FFF">{s.role?.toUpperCase()}</Typography>
                                                <Typography variant="caption" color="textSecondary">{s.specialization || 'N/A'}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="#FFF">{s.emirate || 'Global'}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getStatusColor(s.status || 'ACTIVE') }} />
                                                    <Typography variant="caption" fontWeight="950" sx={{ color: getStatusColor(s.status || 'ACTIVE') }}>
                                                        {(s.status || 'ACTIVE').toUpperCase()}
                                                    </Typography>
                                                </Stack>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="900" color={s.performanceScore ? '#10b981' : 'rgba(255,255,255,0.3)'}>
                                                    {s.performanceScore ? `${s.performanceScore}%` : 'N/A'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                                                    {isHRManager && (
                                                        <Button 
                                                            size="small" 
                                                            variant="outlined" 
                                                            startIcon={generatingId === s.id ? <CircularProgress size={14} /> : <FileText size={14} />}
                                                            disabled={generatingId !== null}
                                                            onClick={async () => {
                                                                setGeneratingId(s.id);
                                                                setPayrollError(null);
                                                                try {
                                                                    if (!auth.currentUser) {
                                                                        setPayrollError(t('admin.hr_management.session_expired_error'));
                                                                        return;
                                                                    }
                                                                    if (!s.salary || s.salary <= 0) {
                                                                        setPayrollError(t('admin.hr_management.no_salary_error').replace('{name}', s.displayName || 'This staff member'));
                                                                        return;
                                                                    }
                                                                    await auth.currentUser.getIdToken(true);

                                                                    // The function in index.ts is generateAndEmailPayslip
                                                                    const genFn = httpsCallable(functions, 'generateAndEmailPayslip');
                                                                    const payPeriod = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                                                    const result: any = await genFn({
                                                                        staffId: s.id,
                                                                        staffName: s.displayName,
                                                                        staffEmail: s.email,
                                                                        payPeriod,
                                                                        basicSalary: s.salary,
                                                                        allowances: s.allowances || 0,
                                                                        overtime: s.overtime || 0,
                                                                        deductions: s.deductions || 0
                                                                    });

                                                                    if (result.data.success) {
                                                                        alert("Sovereign Pay Advice secured and dispatched via email.");
                                                                    }
                                                                } catch (err: any) {
                                                                    console.error("Payroll fault:", err);
                                                                    setPayrollError(getPayrollErrorMessage(err, t));
                                                                } finally {
                                                                    setGeneratingId(null);
                                                                }
                                                            }}
                                                            sx={{ 
                                                                borderColor: alpha(binThemeTokens.gold, 0.3), 
                                                                color: binThemeTokens.gold, 
                                                                fontWeight: 900,
                                                                fontSize: '0.7rem'
                                                            }}
                                                        >
                                                            {t('admin.hr_management.payslip_btn')}
                                                        </Button>
                                                    )}
                                                    <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                                                        <ChevronRight size={18} />
                                                    </IconButton>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}

                {tab === 2 && (
                    <Box sx={{ py: 4 }}>
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={4}>
                                <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${binThemeTokens.gold}`, borderRadius: 4, textAlign: 'center' }}>
                                    <DollarSign size={48} color={binThemeTokens.gold} style={{ margin: '0 auto 16px' }} />
                                    <Typography variant="h5" fontWeight="950" color="#FFF">{t('admin.hr_management.next_dispatch_title')}</Typography>
                                    <Typography variant="h3" fontWeight="950" color={binThemeTokens.gold} sx={{ my: 2 }}>{nextDispatchDate}</Typography>
                                    <Typography variant="body2" color="textSecondary">{t('admin.hr_management.next_dispatch_desc')}</Typography>
                                    <Button fullWidth variant="contained" onClick={() => navigate('/financials/payroll')} sx={{ mt: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                        {t('admin.hr_management.generate_ledger_btn')}
                                    </Button>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={8}>
                                <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                                    <Typography variant="h6" fontWeight="950" sx={{ mb: 4 }}>{t('admin.hr_management.treasury_logs_title')}</Typography>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>{t('admin.hr_management.col_month')}</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>{t('admin.hr_management.col_gross_payout')}</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>{t('admin.hr_management.col_status')}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {treasuryLogsByMonth.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={3} sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', py: 4 }}>
                                                        {t('admin.hr_management.no_payroll_empty')}
                                                    </TableCell>
                                                </TableRow>
                                            ) : treasuryLogsByMonth.map((log: any) => (
                                                <TableRow key={log.month}>
                                                    <TableCell sx={{ fontWeight: 900 }}>{log.month}</TableCell>
                                                    <TableCell>{t('admin.hr_management.aed_amount').replace('{amount}', log.total.toLocaleString('en-AE'))}</TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={log.allPaid ? t('admin.hr_management.settled_chip') : t('admin.hr_management.pending_chip')}
                                                            size="small"
                                                            color={log.allPaid ? 'success' : 'warning'}
                                                            sx={{ fontWeight: 900, fontSize: 10 }}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </Paper>
                            </Grid>
                        </Grid>
                    </Box>
                )}
            </Container>
        </Box>
    );
}
