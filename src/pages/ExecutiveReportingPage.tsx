import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, Paper, Grid, Stack, Button, 
    Chip, Divider, alpha, CircularProgress, LinearProgress, Alert 
} from '@mui/material';
import { 
    BarChart3, TrendingUp, ShieldAlert, History, 
    Download, PieChart, AlertCircle, Building, 
    Activity, ArrowRight, Zap, Target
} from 'lucide-react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, 
    Tooltip, ResponsiveContainer, Bar, BarChart 
} from 'recharts';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { useRole } from '../context/RoleContext';
import { db, collection, query, where, getDocs, orderBy, limit } from '../lib/firebase';
import { formatAED } from '../utils/formatters';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { registerArabicFont } from '../utils/arabicPdfFont';

const ExecutiveReportingPage: React.FC = () => {
    const { t, tx, isRTL } = useLanguage();
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        let cancelled = false;
        const fetchExecutiveData = async () => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }
            setLoading(true);
            setLoadError('');
            try {
                const [propertySnap, ticketSnap] = await Promise.all([
                    getDocs(query(collection(db, 'properties'), where('ownerId', '==', user.uid), limit(100))),
                    getDocs(query(collection(db, 'maintenanceTickets'), where('ownerId', '==', user.uid), limit(250))),
                ]);
                if (cancelled) return;

                const properties = propertySnap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
                const tickets = ticketSnap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
                const healthValues = properties
                    .map((item: any) => Number(item.healthScore ?? item.bpi ?? item.propertyHealthScore ?? 0))
                    .filter((value: number) => Number.isFinite(value) && value > 0);
                const portfolioBPI = healthValues.length
                    ? Math.round(healthValues.reduce((sum: number, value: number) => sum + value, 0) / healthValues.length)
                    : 0;
                const totalSpend = tickets.reduce((sum: number, ticket: any) => sum + Number(ticket.actualCost ?? ticket.approvedCost ?? ticket.estimatedCost ?? 0), 0);

                const monthly = new Map<string, number>();
                tickets.forEach((ticket: any) => {
                    const raw = ticket.createdAt;
                    const date = typeof raw?.toDate === 'function' ? raw.toDate() : raw ? new Date(raw) : null;
                    if (!date || Number.isNaN(date.getTime())) return;
                    const key = date.toLocaleString('en-AE', { month: 'short', year: '2-digit' });
                    monthly.set(key, (monthly.get(key) || 0) + Number(ticket.actualCost ?? ticket.approvedCost ?? ticket.estimatedCost ?? 0));
                });
                const spendTrend = [...monthly.entries()].slice(-6).map(([month, spend]) => ({ month, spend }));

                const topRiskAssets = properties
                    .map((property: any) => ({
                        id: property.id,
                        name: property.name || property.propertyName || property.id,
                        bpi: Number(property.healthScore ?? property.bpi ?? property.propertyHealthScore ?? 0),
                        reason: property.riskReason || property.healthSummary || 'Health score requires review',
                    }))
                    .filter((property: any) => property.bpi > 0)
                    .sort((a: any, b: any) => a.bpi - b.bpi)
                    .slice(0, 5)
                    .map((property: any) => ({ ...property, risk: property.bpi < 60 ? 'HIGH' : property.bpi < 80 ? 'MEDIUM' : 'LOW' }));

                const categoryCounts = new Map<string, number>();
                tickets.forEach((ticket: any) => {
                    const category = String(ticket.category || ticket.trade || ticket.issueType || 'Other');
                    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
                });
                const ticketTotal = tickets.length || 1;
                const incidentClusters = [...categoryCounts.entries()]
                    .map(([category, count]) => ({ category, intensity: Math.round((count / ticketTotal) * 100), trend: 'CURRENT' }))
                    .sort((a, b) => b.intensity - a.intensity)
                    .slice(0, 6);

                const now = Date.now();
                const ninetyDays = 90 * 24 * 60 * 60 * 1000;
                const renewalExposure = properties.reduce((sum: number, property: any) => {
                    const raw = property.contractEndDate || property.renewalDate;
                    const date = typeof raw?.toDate === 'function' ? raw.toDate() : raw ? new Date(raw) : null;
                    if (!date || Number.isNaN(date.getTime())) return sum;
                    const delta = date.getTime() - now;
                    return delta >= 0 && delta <= ninetyDays ? sum + Number(property.contractValue ?? property.annualContractValue ?? 0) : sum;
                }, 0);

                setStats({ portfolioBPI, totalSpend, spendTrend, topRiskAssets, incidentClusters, renewalExposure });
            } catch (error: any) {
                console.error('[ExecutiveReporting] load failed:', error);
                if (!cancelled) setLoadError(error?.message || 'Unable to load executive reporting data.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void fetchExecutiveData();
        return () => { cancelled = true; };
    }, [user?.uid]);

    const exportExecutiveSummary = () => {
        const doc = new jsPDF();
        registerArabicFont(doc);
        doc.setFillColor(11, 11, 12);
        doc.rect(0, 0, 210, 50, 'F');
        doc.setTextColor(198, 167, 94);
        doc.setFontSize(24);
        doc.text("EXECUTIVE PORTFOLIO AUDIT", 105, 30, { align: 'center' });
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(`INSTITUTIONAL GRADE • CONFIDENTIAL • ${new Date().toLocaleDateString()}`, 105, 40, { align: 'center' });

        doc.setTextColor(0, 0, 0);
        doc.text("Portfolio Resilience Index", 20, 70);
        (doc as any).autoTable({
            startY: 80,
            head: [['KPI Indicator', 'Executive Value', 'Institutional Status']],
            body: [
                ['Portfolio BPI Average', `${stats.portfolioBPI}%`, 'STABLE'],
                ['Total Operational Spend', `AED ${formatAED(stats.totalSpend)}`, 'VERIFIED'],
                ['Renewal Exposure (90D)', `AED ${formatAED(stats.renewalExposure)}`, 'MONITORED'],
                ['Risk Cluster Intensity', `${stats.incidentClusters?.[0]?.intensity || 0}% ${stats.incidentClusters?.[0]?.category || 'No incidents'}`, stats.incidentClusters?.length ? 'CURRENT' : 'NO DATA']
            ],
            theme: 'striped',
            headStyles: { fillColor: [198, 167, 94] }
        });

        doc.save(`Executive_Summary_${Date.now()}.pdf`);
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 20 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (loadError) return <Alert severity="error">{loadError}</Alert>;

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                        BOARD LEVEL OVERSIGHT
                    </Typography>
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', letterSpacing: -2 }}>
                        Executive <Box component="span" sx={{ color: binThemeTokens.gold }}>Portfolio Terminal</Box>
                    </Typography>
                </Box>
                <Button 
                    variant="contained" 
                    startIcon={<Download />}
                    onClick={exportExecutiveSummary}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5 }}
                >
                    EXPORT AUDIT
                </Button>
            </Box>

            <Grid container spacing={4}>
                {/* Cross-Property Spend Trend */}
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <TrendingUp color={binThemeTokens.gold} /> SYSTEMIC SPEND VELOCITY
                        </Typography>
                        <Box sx={{ height: 350 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.spendTrend}>
                                    <defs>
                                        <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={binThemeTokens.gold} stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor={binThemeTokens.gold} stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" />
                                    <YAxis stroke="rgba(255,255,255,0.3)" />
                                    <Tooltip contentStyle={{ backgroundColor: '#161618', border: '1px solid rgba(198,167,94,0.2)', color: '#FFF' }} />
                                    <Area type="monotone" dataKey="spend" stroke={binThemeTokens.gold} strokeWidth={4} fillOpacity={1} fill="url(#spendGrad)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </Box>
                    </Paper>
                </Grid>

                {/* Portfolio Vitals */}
                <Grid item xs={12} lg={4}>
                    <Stack spacing={4}>
                        <Paper sx={{ p: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, borderRadius: 6 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>PORTFOLIO BPI AVG</Typography>
                            <Box sx={{ textAlign: 'center', py: 2 }}>
                                <Typography variant="h1" fontWeight="950" color="#FFF">{stats.portfolioBPI}%</Typography>
                                <Typography variant="body2" color="textSecondary">Institutional Resilience Benchmark</Typography>
                            </Box>
                            <LinearProgress variant="determinate" value={stats.portfolioBPI} sx={{ mt: 2, height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                        </Paper>

                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>RENEWAL EXPOSURE</Typography>
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="h4" fontWeight="950" color="#FFF">AED {formatAED(stats.renewalRiskExposure || stats.renewalExposure)}</Typography>
                                <Typography variant="caption" color="textSecondary">CONTRACT VALUE AT RISK (90D)</Typography>
                            </Box>
                            <Button fullWidth variant="outlined" sx={{ mt: 4, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }}>INITIATE RETENTION</Button>
                        </Paper>
                    </Stack>
                </Grid>

                {/* Risk Clusters & Top Risk Assets */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 4 }}>INCIDENT CLUSTERS</Typography>
                        <Stack spacing={3}>
                            {stats.incidentClusters.map((cluster: any, i: number) => (
                                <Box key={i}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="subtitle2" fontWeight="900" color="#FFF">{cluster.category.toUpperCase()}</Typography>
                                        <Typography variant="caption" sx={{ color: cluster.trend === 'UP' ? '#ef4444' : '#10b981', fontWeight: 900 }}>
                                            {cluster.trend} TREND
                                        </Typography>
                                    </Box>
                                    <LinearProgress variant="determinate" value={cluster.intensity} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: cluster.intensity > 70 ? '#ef4444' : binThemeTokens.gold } }} />
                                </Box>
                            ))}
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 4 }}>CRITICAL WATCHLIST</Typography>
                        <Stack spacing={2}>
                            {stats.topRiskAssets.map((asset: any, i: number) => (
                                <Box key={i} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography variant="body1" fontWeight="900" color="#FFF">{asset.name}</Typography>
                                        <Typography variant="caption" color="textSecondary">{asset.reason}</Typography>
                                    </Box>
                                    <Box sx={{ textAlign: 'right' }}>
                                        <Chip label={`BPI ${asset.bpi}%`} size="small" sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 900 }} />
                                    </Box>
                                </Box>
                            ))}
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
};

export default ExecutiveReportingPage;

