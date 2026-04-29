import React, { useState, useEffect } from 'react';
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
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import { useAuth } from '../../context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../lib/firebase';

export default function HRManagementPage() {
    const { user } = useAuth();
    const [tab, setTab] = useState(0);
    const [staff, setStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    const [payrollError, setPayrollError] = useState<string | null>(null);

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

    const getStatusColor = (status: string) => {
        switch (status?.toUpperCase()) {
            case 'ACTIVE': return '#10b981';
            case 'ON_LEAVE': return '#f59e0b';
            case 'INACTIVE': return '#ef4444';
            default: return 'rgba(255,255,255,0.4)';
        }
    };

    const getPayrollErrorMessage = (err: any) => {
        const code = err?.code || 'functions/internal';
        const message = err?.message || 'No additional detail was returned.';

        if (code === 'functions/unauthenticated') {
            return 'Your admin session expired. Sign in again and retry payslip generation.';
        }
        if (code === 'functions/permission-denied') {
            return 'Your account does not have HR or finance permission to generate payslips.';
        }
        if (code === 'functions/failed-precondition') {
            return 'Payroll email is not configured in Firebase Secrets. Configure SMTP_USER and SMTP_PASS before retrying.';
        }
        if (code === 'functions/invalid-argument') {
            return `Payslip data is incomplete. ${message}`;
        }
        return `Payslip could not be generated (${code}). ${message}`;
    };

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4 }}>
            <Container maxWidth="xl">
                <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                            SOVEREIGN HUMAN CAPITAL
                        </Typography>
                        <Typography variant="h3" fontWeight="950" color="#FFF">
                            HR <Box component="span" sx={{ color: binThemeTokens.gold }}>Command</Box>
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={2}>
                        {isHRManager && (
                            <Button variant="contained" startIcon={<UserPlus size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                REGISTER STAFF
                            </Button>
                        )}
                    </Stack>
                </Box>

                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 4, '& .MuiTab-root': { color: 'rgba(255,255,255,0.4)', fontWeight: 900 } }}>
                    <Tab label="STAFF REGISTRY" />
                    <Tab label="ATTENDANCE & LEAVE" disabled={!isHRStaff} />
                    <Tab label="PAYROLL HUB" disabled={!isHRManager} />
                    <Tab label="HR DOCUMENTS" disabled={!isHRStaff} />
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
                                placeholder="Search by name, role, ID..." 
                                size="small"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><SearchIcon size={18} color="rgba(255,255,255,0.3)" /></InputAdornment>,
                                    sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }
                                }}
                                sx={{ width: 400 }}
                            />
                            <Chip label={`${staff.length} TOTAL PERSONNEL`} sx={{ fontWeight: 900 }} />
                        </Box>

                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>PERSONNEL</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ROLE / SPECIALIZATION</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ZONE</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STATUS</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>KPI</TableCell>
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
                                                <Typography variant="body2" fontWeight="900" color="#10b981">{s.performanceScore || '98'}%</Typography>
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
                                                                        setPayrollError('Your admin session is not active. Sign in again before generating payslips.');
                                                                        return;
                                                                    }
                                                                    await auth.currentUser.getIdToken(true);
                                                                    
                                                                    // The function in index.ts is generateAndEmailPayslip
                                                                    const genFn = httpsCallable(functions, 'generateAndEmailPayslip');
                                                                    const result: any = await genFn({
                                                                        staffId: s.id,
                                                                        staffName: s.displayName,
                                                                        staffEmail: s.email,
                                                                        payPeriod: 'April 2026',
                                                                        basicSalary: s.salary || 12000,
                                                                        allowances: 3000,
                                                                        overtime: 500,
                                                                        deductions: 0
                                                                    });
                                                                    
                                                                    if (result.data.success) {
                                                                        alert("Sovereign Pay Advice secured and dispatched via email.");
                                                                    }
                                                                } catch (err: any) {
                                                                    console.error("Payroll fault:", err);
                                                                    setPayrollError(getPayrollErrorMessage(err));
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
                                                            PAYSLIP
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
                                    <Typography variant="h5" fontWeight="950" color="#FFF">NEXT DISPATCH</Typography>
                                    <Typography variant="h3" fontWeight="950" color={binThemeTokens.gold} sx={{ my: 2 }}>May 28</Typography>
                                    <Typography variant="body2" color="textSecondary">Institutional Cycle V7.1</Typography>
                                    <Button fullWidth variant="contained" sx={{ mt: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                        GENERATE LEDGER
                                    </Button>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={8}>
                                <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                                    <Typography variant="h6" fontWeight="950" sx={{ mb: 4 }}>TREASURY LOGS (STAFF)</Typography>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>MONTH</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>GROSS PAYOUT</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>STATUS</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {['April', 'March', 'February'].map(m => (
                                                <TableRow key={m}>
                                                    <TableCell sx={{ fontWeight: 900 }}>{m} 2026</TableCell>
                                                    <TableCell>AED 142,500.00</TableCell>
                                                    <TableCell><Chip label="SETTLED" size="small" color="success" sx={{ fontWeight: 900, fontSize: 10 }} /></TableCell>
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
