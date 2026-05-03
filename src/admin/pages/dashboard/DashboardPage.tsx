import React, { useState, useEffect } from 'react';
import { 
    Grid, Paper, Typography, Box, Chip, Table, TableBody, 
    TableCell, TableHead, TableRow, TableContainer, Stack,
    Button, alpha, CircularProgress, IconButton
} from '@mui/material';
import { 
    Building2, Users, Ticket, Wallet, ShieldCheck, 
    Zap, Activity, LayoutDashboard, Search, Filter
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc, serverTimestamp } from '@/lib/firebase';
import { useLanguage, useAI } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

export default function DashboardPage() {
    const { t, lang } = useLanguage();
    const { setPageContext } = useAI();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        properties: 0,
        units: 0,
        tenants: 0,
        technicians: 0,
        openTickets: 0,
        pendingApprovals: 0,
        paymentSubmissions: 0,
        passports: 0,
        revenue: 0
    });
    const [pendingIntakes, setPendingIntakes] = useState<any[]>([]);

    useEffect(() => {
        const unsubs: (() => void)[] = [];

        // 1. Properties
        unsubs.push(onSnapshot(collection(db, "properties"), (s) => setStats(p => ({ ...p, properties: s.size }))));
        
        // 2. Units
        unsubs.push(onSnapshot(collection(db, "units"), (s) => setStats(p => ({ ...p, units: s.size }))));
        
        // 3. Tenants (users with role 'tenant')
        unsubs.push(onSnapshot(query(collection(db, "users"), where("role", "==", "tenant")), (s) => setStats(p => ({ ...p, tenants: s.size }))));
        
        // 4. Technicians (users with role 'technician')
        unsubs.push(onSnapshot(query(collection(db, "users"), where("role", "==", "technician")), (s) => setStats(p => ({ ...p, technicians: s.size }))));
        
        // 5. Open Tickets
        unsubs.push(onSnapshot(query(collection(db, "maintenanceTickets"), where("status", "in", ["OPEN", "PENDING", "IN_PROGRESS"])), (s) => setStats(p => ({ ...p, openTickets: s.size }))));
        
        // 6. Pending Approvals (intake_submissions)
        unsubs.push(onSnapshot(query(collection(db, "intake_submissions"), where("status", "==", "AWAITING_VERIFICATION")), (s) => {
            setStats(p => ({ ...p, pendingApprovals: s.size }));
            setPendingIntakes(s.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }));
        
        // 7. Payment Submissions
        unsubs.push(onSnapshot(query(collection(db, "paymentSubmissions"), where("status", "==", "PENDING")), (s) => setStats(p => ({ ...p, paymentSubmissions: s.size }))));
        
        // 8. Property Passports
        unsubs.push(onSnapshot(collection(db, "propertyPassports"), (s) => setStats(p => ({ ...p, passports: s.size }))));

        // 9. Revenue (last 50 transactions sum)
        unsubs.push(onSnapshot(query(collection(db, "transactions"), where("type", "==", "credit"), limit(50)), (s) => {
            const total = s.docs.reduce((acc, d) => acc + (d.data().amount || 0), 0);
            setStats(p => ({ ...p, revenue: total }));
        }));

        return () => unsubs.forEach(u => u());
    }, []);

    useEffect(() => {
        setPageContext({ stats, pendingIntakes });
        return () => setPageContext(null);
    }, [stats, pendingIntakes, setPageContext]);

    const KPICard = ({ label, value, icon: Icon, color }: any) => (
        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, height: '100%' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                    <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, fontSize: '0.65rem' }}>{label.toUpperCase()}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 0.5 }}>{value}</Typography>
                </Box>
                <Box sx={{ p: 1.5, bgcolor: alpha(color, 0.1), color: color, borderRadius: 2 }}>
                    <Icon size={20} />
                </Box>
            </Stack>
        </Paper>
    );

    return (
        <AdminPageFrame
            title={t('nav.dashboard') || 'Dashboard'}
            subtitle="Sovereign Control & Operational Oversight"
            loading={loading}
            breadcrumbs={[{ label: 'Dashboard' }]}
        >
            <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={3}>
                    <KPICard label="Properties" value={stats.properties} icon={Building2} color={binThemeTokens.gold} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <KPICard label="Active Tenants" value={stats.tenants} icon={Users} color="#10b981" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <KPICard label="Open Missions" value={stats.openTickets} icon={Ticket} color="#f59e0b" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <KPICard label="Tech Corps" value={stats.technicians} icon={Zap} color="#6366f1" />
                </Grid>

                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                            <Box>
                                <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold }}>PENDING APPROVALS</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Critical items requiring immediate verification</Typography>
                            </Box>
                            <Button size="small" variant="outlined" sx={{ fontWeight: 900 }}>VIEW ALL</Button>
                        </Stack>

                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 900, color: 'rgba(255,255,255,0.3)' }}>ORIGIN</TableCell>
                                        <TableCell sx={{ fontWeight: 900, color: 'rgba(255,255,255,0.3)' }}>TYPE</TableCell>
                                        <TableCell sx={{ fontWeight: 900, color: 'rgba(255,255,255,0.3)' }}>STATUS</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 900, color: 'rgba(255,255,255,0.3)' }}>ACTION</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {pendingIntakes.map((item) => (
                                        <TableRow key={item.id} hover>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 700 }}>{item.id.substring(0,8)}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.5)' }}>INTAKE SUBMISSION</TableCell>
                                            <TableCell>
                                                <Chip label="PENDING" size="small" sx={{ bgcolor: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 900, fontSize: '0.6rem' }} />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Button size="small" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.65rem' }}>
                                                    REVIEW
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {pendingIntakes.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>
                                                ALL NODES VERIFIED
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Stack spacing={3}>
                        <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>SYSTEM HEALTH</Typography>
                            <Stack spacing={2} sx={{ mt: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>PASSPORTS</Typography>
                                    <Typography variant="body2" fontWeight="900">{stats.passports}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>PAYMENT QUEUE</Typography>
                                    <Typography variant="body2" fontWeight="900" sx={{ color: binThemeTokens.danger }}>{stats.paymentSubmissions}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>ASSET NODES</Typography>
                                    <Typography variant="body2" fontWeight="900">{stats.units}</Typography>
                                </Box>
                            </Stack>
                        </Paper>

                        <Paper sx={{ p: 4, bgcolor: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6 }}>
                            <Typography variant="overline" sx={{ color: '#10b981', fontWeight: 900 }}>FINANCIAL LIQUIDITY</Typography>
                            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>
                                AED {stats.revenue.toLocaleString()}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Last 50 verified credits</Typography>
                        </Paper>
                    </Stack>
                </Grid>
            </Grid>
        </AdminPageFrame>
    );
}

