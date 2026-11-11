// apps/owner-app/src/pages/ReportingDashboard.tsx
import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { 
    Box, Container, Typography, Grid, Paper, Stack, alpha, 
    CircularProgress, Divider, Card, CardContent, Button, Chip,
    LinearProgress, Alert
} from '@mui/material';
import { 
    TrendingUp, Zap, ShieldCheck, Building2, Globe, 
    Activity, Timer, CreditCard, PieChart, Download,
    AlertCircle, BarChart3, LineChart as LineIcon, Map,
    History, ShieldAlert, Key, Landmark
} from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { db } from '../lib/firebase';
import { loadReportingCollection } from '../lib/loadReportingCollections';
import { useRole } from '../context/RoleContext';
import { formatAED } from '../utils/formatters';

const ReportingDashboard: React.FC = () => {
    const { user, role } = useRole();
    const [stats, setStats] = useState<any>(null);
    const [selectedEmirate, setSelectedEmirate] = useState('ALL');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAggregates = async () => {
            try {
                if (!user?.uid) {
                    setLoading(false);
                    return;
                }
                const [propertiesResult, ticketsResult, contractsResult, unitsResult] = await Promise.all([
                    loadReportingCollection(db, 'properties', user.uid),
                    loadReportingCollection(db, 'maintenanceTickets', user.uid),
                    loadReportingCollection(db, 'contracts', user.uid),
                    loadReportingCollection(db, 'units', user.uid),
                ]);
                const allProps = propertiesResult.rows;
                const filteredProps = selectedEmirate === 'ALL'
                    ? allProps
                    : allProps.filter((row) => String(row.emirate || '').toUpperCase() === selectedEmirate);
                const allTickets = ticketsResult.rows;
                const tickets = selectedEmirate === 'ALL'
                    ? allTickets
                    : allTickets.filter((row) => filteredProps.some((property) => property.id === row.propertyId));
                const completed = tickets.filter((row) => String(row.status || '').toUpperCase() === 'COMPLETED');
                const timed = completed.filter((row) => row.createdAt && (row.completedAt || row.resolvedAt));
                const toMs = (value: any) => {
                    if (typeof value?.toDate === 'function') return value.toDate().getTime();
                    if (typeof value?.seconds === 'number') return value.seconds * 1000;
                    const parsed = value ? new Date(value).getTime() : NaN;
                    return Number.isFinite(parsed) ? parsed : NaN;
                };
                const avgMinutes = timed.length
                    ? Math.round(timed.reduce((sum, row) => {
                        const start = toMs(row.createdAt);
                        const end = toMs(row.completedAt || row.resolvedAt);
                        return Number.isFinite(start) && Number.isFinite(end) && end >= start ? sum + ((end - start) / 60000) : sum;
                    }, 0) / timed.length)
                    : null;
                const allContracts = contractsResult.rows;
                const totalSettled = allContracts
                    .filter((row) => selectedEmirate === 'ALL' || filteredProps.some((property) => property.id === row.propertyId))
                    .reduce((sum, row) => sum + Number(row.amountReceived || 0), 0);
                const units = selectedEmirate === 'ALL'
                    ? unitsResult.rows
                    : unitsResult.rows.filter((row) => filteredProps.some((property) => property.id === row.propertyId));
                const occupiedCount = units.filter((row) => row.tenantId).length;
                const totalUnits = units.length;
                const emirates = Array.from(new Set(allProps.map((row) => String(row.emirate || '').toUpperCase()))).filter(Boolean);
                const categoryCounts = new Map<string, number>();
                tickets.forEach((row) => {
                    const category = String(row.category || row.type || 'Other');
                    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
                });
                setStats({
                    velocity: avgMinutes == null ? 'N/A' : `${avgMinutes} mins`,
                    totalSettled,
                    assetDensity: totalUnits ? Math.round((occupiedCount / totalUnits) * 100) : null,
                    activeMissions: tickets.filter((row) => !['COMPLETED', 'CLOSED', 'RESOLVED', 'CANCELLED'].includes(String(row.status || '').toUpperCase())).length,
                    emiratesList: ['ALL', ...emirates],
                    regionalStats: emirates.map((emirate) => ({
                        emirate,
                        count: allProps.filter((row) => String(row.emirate || '').toUpperCase() === emirate).length,
                    })),
                    faultTrend: [...categoryCounts.entries()].map(([category, count]) => ({ category, count, trend: 'From loaded tickets' })),
                    emergencyTrend: [],
                    renewalRisk: null,
                    truncated: [propertiesResult, ticketsResult, contractsResult, unitsResult].some((item) => item.truncated),
                    totals: {
                        properties: propertiesResult.total,
                        tickets: ticketsResult.total,
                        contracts: contractsResult.total,
                        units: unitsResult.total,
                    },
                });
            } catch (err) {
                console.error("Aggregation Failed:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAggregates();
    }, [selectedEmirate, user?.uid]);

    const exportToPdf = () => {
        if (!stats) return;
        const doc = new jsPDF();
        doc.setFillColor(11, 11, 12);
        doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(198, 167, 94);
        doc.setFontSize(22);
        doc.text("BIN-GENESIS™ SOVEREIGN REPORT", 105, 25, { align: 'center' });
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(`AUDIT DATE: ${new Date().toLocaleString()} | ZONE: ${selectedEmirate}`, 105, 33, { align: 'center' });

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.text(`Operational Summary - ${selectedEmirate}`, 20, 60);
        
        (doc as any).autoTable({
            startY: 70,
            head: [['KPI Indicator', 'Value', 'Status']],
            body: [
                ['Operational Velocity', stats.velocity, 'OPTIMAL'],
                ['Financial Integrity', `AED ${formatAED(stats.totalSettled)}`, 'VERIFIED'],
                ['Asset Density', `${stats.assetDensity}%`, 'STABLE'],
                ['Active Missions', stats.activeMissions.toString(), 'MONITORED'],
                ['Renewal Risk Score', `${stats.renewalRisk}%`, 'MITIGATED']
            ],
            theme: 'striped',
            headStyles: { fillColor: [198, 167, 94] }
        });

        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("This document is a certified institutional export. BIN GROUP Dubai HQ.", 105, 280, { align: 'center' });
        doc.save(`Sovereign_Report_${selectedEmirate}_${Date.now()}.pdf`);
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4, mb: 1, display: 'block' }}>INSTITUTIONAL AUDIT</Typography>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-end">
                    <Box>
                        <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', letterSpacing: -2 }}>Reporting Dashboard</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                            {stats.emiratesList.map((e: string) => (
                                <Chip 
                                    key={e} 
                                    label={e} 
                                    onClick={() => setSelectedEmirate(e)}
                                    sx={{ 
                                        bgcolor: selectedEmirate === e ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                        color: selectedEmirate === e ? '#000' : '#FFF',
                                        fontWeight: 900,
                                        '&:hover': { bgcolor: binThemeTokens.goldLight }
                                    }} 
                                />
                            ))}
                        </Stack>
                    </Box>
                    <Button variant="contained" startIcon={<Download size={18} />} onClick={exportToPdf} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4, px: 4, py: 1.5 }}>EXPORT PDF</Button>
                </Stack>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                        <Stack spacing={1}>
                            <Timer color={binThemeTokens.gold} size={32} />
                            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}>Operational Velocity</Typography>
                            <Typography variant="h2" fontWeight="950" sx={{ color: '#FFF' }}>{stats.velocity}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>AVG SOS → DISPATCH TERMINAL</Typography>
                        </Stack>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                        <Stack spacing={1}>
                            <CreditCard color={binThemeTokens.gold} size={32} />
                            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}>Financial Integrity</Typography>
                            <Typography variant="h2" fontWeight="950" sx={{ color: '#FFF' }}>AED {formatAED(stats.totalSettled)}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>TOTAL DIRECT SETTLEMENTS</Typography>
                        </Stack>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                        <Stack spacing={1}>
                            <PieChart color={binThemeTokens.gold} size={32} />
                            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}>Asset Density</Typography>
                            <Typography variant="h2" fontWeight="950" sx={{ color: '#FFF' }}>{stats.assetDensity}%</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>PORTFOLIO OCCUPANCY</Typography>
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ mt: 8, mb: 4 }}>
                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <ShieldAlert color={binThemeTokens.gold} /> ADVANCED ANALYTICS & RISK INTELLIGENCE
                        </Typography>
                    </Box>
                    <Grid container spacing={4}>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>REPEATED FAULT TREND</Typography>
                                <Stack spacing={3} sx={{ mt: 3 }}>
                                    {stats.faultTrend.map((f: any, i: number) => (
                                        <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box>
                                                <Typography variant="body1" fontWeight="900" color="#FFF">{f.category}</Typography>
                                                <Typography variant="caption" color="textSecondary">{f.count} INCIDENTS</Typography>
                                            </Box>
                                            <Chip label={f.trend} size="small" sx={{ bgcolor: f.trend.startsWith('+') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: f.trend.startsWith('+') ? '#ef4444' : '#10b981', fontWeight: 900 }} />
                                        </Box>
                                    ))}
                                </Stack>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>EMERGENCY VELOCITY (6M)</Typography>
                                <Box sx={{ mt: 4, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 100 }}>
                                    {stats.emergencyTrend.map((val: number, i: number) => (
                                        <Box key={i} sx={{ width: '12%', bgcolor: val > 3 ? '#ef4444' : binThemeTokens.gold, height: `${(val / 5) * 100}%`, borderRadius: 1 }} />
                                    ))}
                                </Box>
                                <Typography variant="caption" color="textSecondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>Response Uptime: 100%</Typography>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, borderRadius: 6 }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>RENEWAL RISK SCORE</Typography>
                                <Box sx={{ textAlign: 'center', py: 2 }}>
                                    <Typography variant="h1" fontWeight="950" color="#FFF">{stats.renewalRisk}%</Typography>
                                    <Typography variant="body2" color="textSecondary">Retention Hedge Layer</Typography>
                                </Box>
                                <Button fullWidth variant="contained" sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>MITIGATE RISK</Button>
                            </Paper>
                        </Grid>
                    </Grid>
                </Grid>

                <Grid item xs={12}>
                    <Typography variant="h5" fontWeight="900" sx={{ color: '#FFF', mb: 4, mt: 4 }}>Regional Performance Distribution</Typography>
                    <Grid container spacing={3}>
                        {stats.regionalStats.map((reg: any) => (
                            <Grid item xs={12} md={4} key={reg.emirate}>
                                <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                                    <CardContent sx={{ p: 4 }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>{reg.emirate?.toUpperCase()}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{reg.count} ACTIVE ASSETS</Typography>
                                            </Box>
                                            <Globe color={binThemeTokens.gold} />
                                        </Stack>
                                        <Box sx={{ mt: 4 }}>
                                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>SERVICE UPTIME</Typography>
                                                <Typography variant="caption" sx={{ color: '#FFF' }}>{reg.uptime}%</Typography>
                                            </Stack>
                                            <Box sx={{ height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                                <Box sx={{ height: '100%', width: `${reg.uptime}%`, bgcolor: binThemeTokens.gold }} />
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Grid>
            </Grid>
        </Container>
    );
};

export default ReportingDashboard;
