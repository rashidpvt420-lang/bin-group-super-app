import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Paper, CircularProgress, 
    Stack, LinearProgress, alpha, Button, Divider,
    Tooltip, IconButton
} from '@mui/material';
import { 
    TrendingUp, DollarSign, Percent, BarChart2, 
    ArrowUpRight, Info, Shield, CheckCircle2,
    Calendar, Activity, Building2, TrendingDown
} from 'lucide-react';
import { db, collection, query, where, getDocs, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerRoiPage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [passports, setPassports] = useState<any[]>([]);

    useEffect(() => {
        if (!user?.email) return;
        
        const email = user.email.toLowerCase();
        const passportQ = query(collection(db, 'propertyPassports'), where('ownerEmail', '==', email));
        
        const unsubscribe = onSnapshot(passportQ, (snap) => {
            setPassports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.email]);

    if (loading) return (
        <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Calculating Yields...</Typography>
        </Box>
    );

    const totalCollected = passports.reduce((s, p) => s + (p.rentCollectedTotal || 0), 0);
    const totalOutstanding = passports.reduce((s, p) => s + (p.rentOutstandingTotal || 0), 0);
    const totalMaintenanceCost = passports.reduce((s, p) => s + (p.maintenanceCostTotal || 0), 0);
    const managementFee = totalCollected * 0.08;
    const netIncome = totalCollected - managementFee - totalMaintenanceCost;
    
    // Financial logic
    const grossYield = totalCollected > 0 ? ((totalCollected / (totalCollected + totalOutstanding)) * 100) : 0;
    const netROI = netIncome > 0 && totalCollected > 0 ? ((netIncome / (totalCollected + totalOutstanding)) * 100) : 0;

    const MetricCard = ({ label, value, color, progress, sub }: any) => (
        <Paper sx={{ 
            p: 3, 
            bgcolor: 'rgba(15, 23, 42, 0.4)', 
            border: `1px solid ${alpha(color, 0.2)}`, 
            borderRadius: 6,
            height: '100%'
        }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2 }}>{label}</Typography>
                <Tooltip title="Institutional Calculation">
                    <Info size={14} color="rgba(255,255,255,0.2)" />
                </Tooltip>
            </Stack>
            <Typography variant="h3" fontWeight="950" sx={{ color, mb: 1, letterSpacing: -1 }}>{value}</Typography>
            {sub && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{sub}</Typography>}
            {progress !== undefined && (
                <Box sx={{ mt: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>PERFORMANCE</Typography>
                        <Typography variant="caption" sx={{ color, fontWeight: 900 }}>{progress.toFixed(1)}%</Typography>
                    </Box>
                    <LinearProgress 
                        variant="determinate" 
                        value={Math.min(progress, 100)} 
                        sx={{ 
                            height: 6, 
                            borderRadius: 3, 
                            bgcolor: 'rgba(255,255,255,0.05)', 
                            '& .MuiLinearProgress-bar': { background: `linear-gradient(90deg, ${color}, ${alpha(color, 0.5)})` } 
                        }} 
                    />
                </Box>
            )}
        </Paper>
    );

    const fmt = (n: number) => `AED ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

    return (
        <Box sx={{ pb: 6 }}>
            {/* Header */}
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>PORTFOLIO YIELD TERMINAL</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>ROI Analytics</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Calendar size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3 }}>Last 12 Months</Button>
                    <Button variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3, borderRadius: 3 }}>Export Audit</Button>
                </Stack>
            </Box>

            {passports.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
                    <BarChart2 size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>AWAITING ASSET PERFORMANCE DATA</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {/* Primary Yields */}
                    <Grid item xs={12} md={4}>
                        <MetricCard label="Gross Yield" value={`${grossYield.toFixed(1)}%`} color={binThemeTokens.gold} progress={grossYield} sub="Before Management & Ops" />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <MetricCard label="Net Payout ROI" value={`${netROI.toFixed(1)}%`} color="#10b981" progress={netROI} sub="After Fees & Maintenance" />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <MetricCard label="Total Collected" value={fmt(totalCollected)} color="#3b82f6" sub="Aggregate Rental Revenue" />
                    </Grid>

                    {/* Secondary Metrics */}
                    <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', mb: 1 }}>NET OWNER INCOME</Typography>
                            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{fmt(netIncome)}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', mb: 1 }}>MANAGEMENT FEES (8%)</Typography>
                            <Typography variant="h5" fontWeight="950" sx={{ color: '#ef4444' }}>-{fmt(managementFee)}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', mb: 1 }}>MAINTENANCE COST</Typography>
                            <Typography variant="h5" fontWeight="950" sx={{ color: '#f59e0b' }}>-{fmt(totalMaintenanceCost)}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', mb: 1 }}>OUTSTANDING RENT</Typography>
                            <Typography variant="h5" fontWeight="950" sx={{ color: '#ef4444' }}>{fmt(totalOutstanding)}</Typography>
                        </Paper>
                    </Grid>

                    {/* Per-Property Analytics */}
                    <Grid item xs={12}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3, mt: 3 }}>ASSET-LEVEL PERFORMANCE</Typography>
                        <Stack spacing={2}>
                            {passports.map(p => {
                                const propROI = p.rentCollectedTotal > 0 ? ((p.rentCollectedTotal / (p.rentCollectedTotal + (p.rentOutstandingTotal || 0))) * 100) : 0;
                                return (
                                    <Paper key={p.id} sx={{ p: 3, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                                        <Grid container spacing={4} alignItems="center">
                                            <Grid item xs={12} md={4}>
                                                <Stack direction="row" spacing={2} alignItems="center">
                                                    <Box sx={{ width: 48, height: 48, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: binThemeTokens.gold }}>
                                                        <Building2 size={24} />
                                                    </Box>
                                                    <Box>
                                                        <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>{p.propertyName}</Typography>
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>
                                                            {p.occupiedUnits || 0} / {p.totalUnits || 0} UNITS OCCUPIED
                                                        </Typography>
                                                    </Box>
                                                </Stack>
                                            </Grid>
                                            <Grid item xs={12} md={5}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>YIELD HEALTH</Typography>
                                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{propROI.toFixed(1)}%</Typography>
                                                </Box>
                                                <LinearProgress 
                                                    variant="determinate" 
                                                    value={propROI} 
                                                    sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { background: binThemeTokens.gold } }} 
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={3} sx={{ textAlign: 'right' }}>
                                                <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#10b981' }}>{fmt(p.rentCollectedTotal || 0)}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>PERIOD REVENUE</Typography>
                                            </Grid>
                                        </Grid>
                                    </Paper>
                                );
                            })}
                        </Stack>
                    </Grid>
                </Grid>
            )}

            {/* Compliance Footer */}
            <Paper sx={{ p: 4, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6 }}>
                <Grid container spacing={4} alignItems="center">
                    <Grid item xs={12} md={9}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Shield size={16} /> SOVEREIGN AUDIT ASSURANCE
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>
                            Calculations are based on verified rental receipts and RERA-compliant maintenance invoices. 
                            Management fees are fixed at 8% as per the Sovereign Service Level Agreement.
                            For detailed ledger disputes, please request a **Governance Review**.
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={3} sx={{ textAlign: 'right' }}>
                        <Button variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 3, borderRadius: 3 }}>
                            Request Review
                        </Button>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}
