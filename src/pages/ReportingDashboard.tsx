// apps/owner-app/src/pages/ReportingDashboard.tsx
import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { registerArabicFont } from '../utils/arabicPdfFont';
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
import { db, collection, getDocs, query, where, orderBy, limit } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { formatAED } from '../utils/formatters';
import { computeReportingStats, formatOccupancy, formatResolutionTime, NOT_AVAILABLE, type ReportingStats } from './reportingDashboardStats';

const ReportingDashboard: React.FC = () => {
    const { user, role } = useRole();
    const [stats, setStats] = useState<ReportingStats | null>(null);
    const [selectedEmirate, setSelectedEmirate] = useState('ALL');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        const fetchAggregates = async () => {
            if (!user?.uid) {
                setLoadError('Owner identity is unavailable. Please refresh your secure session.');
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setLoadError('');

                const isOwnerView = String(role || '').toLowerCase() === 'owner';
                const readCollection = async (collectionName: string) => {
                    if (!isOwnerView) {
                        const snapshot = await getDocs(collection(db, collectionName));
                        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    }

                    // Owner analytics must be query-bound to immutable UID fields so
                    // Firestore can prove ownership before returning any row. Never
                    // widen rules or read an entire production collection in-browser.
                    const [byOwnerId, byOwnerUid] = await Promise.all([
                        getDocs(query(collection(db, collectionName), where('ownerId', '==', user.uid), limit(250))),
                        getDocs(query(collection(db, collectionName), where('ownerUid', '==', user.uid), limit(250))),
                    ]);
                    const merged = new globalThis.Map<string, any>();
                    for (const snapshot of [byOwnerId, byOwnerUid]) {
                        for (const item of snapshot.docs) merged.set(item.id, { id: item.id, ...item.data() });
                    }
                    return [...merged.values()];
                };

                const [properties, tickets, contracts, units] = await Promise.all([
                    readCollection('properties'),
                    readCollection('maintenanceTickets'),
                    readCollection('contracts'),
                    readCollection('units'),
                ]);
                // N-10: every KPI is computed from these records; missing data yields null → "Not available".
                setStats(computeReportingStats({ properties, tickets, contracts, units, selectedEmirate }));
            } catch (err: any) {
                console.error("Aggregation Failed:", err);
                setLoadError(err?.message || "Reporting data could not be loaded.");
            } finally {
                setLoading(false);
            }
        };

        fetchAggregates();
    }, [selectedEmirate, user?.uid, role]);

    const exportToPdf = () => {
        if (!stats) return;
        const doc = new jsPDF();
        registerArabicFont(doc);
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
            head: [['KPI Indicator', 'Value', 'Basis']],
            body: [
                ['Average Ticket Resolution', formatResolutionTime(stats.avgResolutionMinutes), stats.avgResolutionMinutes === null ? 'No completed tickets with timestamps' : `${stats.resolutionSampleSize} completed ticket(s)`],
                ['Total Direct Settlements', `AED ${formatAED(stats.totalSettled)}`, 'Sum of amountReceived on visible contracts'],
                ['Portfolio Occupancy', formatOccupancy(stats.occupancyPercent), stats.occupancyPercent === null ? 'No unit records' : `${stats.occupiedUnits} of ${stats.totalUnits} unit(s) occupied`],
                ['Open Tickets', stats.activeTickets.toString(), 'Tickets not COMPLETED'],
                ['Renewal Risk Score', NOT_AVAILABLE, 'No renewal risk model is connected']
            ],
            theme: 'striped',
            headStyles: { fillColor: [198, 167, 94] }
        });

        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("Generated from the records visible to this account at the time of export. Metrics without source data are marked Not available.", 105, 280, { align: 'center' });
        doc.save(`Sovereign_Report_${selectedEmirate}_${Date.now()}.pdf`);
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: '#7A5C12' }} /></Box>;
    if (loadError) return <Container maxWidth="xl" sx={{ py: 6 }}><Alert severity="error">{loadError}</Alert></Container>;
    if (!stats) return null;
    const emergencyMax = Math.max(1, ...stats.emergencyByMonth.map((m) => m.count));

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: '#7A5C12', fontWeight: 900, letterSpacing: 4, mb: 1, display: 'block' }}>INSTITUTIONAL AUDIT</Typography>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-end">
                    <Box>
                        <Typography variant="h3" fontWeight="950" sx={{ color: '#111827', letterSpacing: -2 }}>Reporting Dashboard</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                            {stats.emiratesList.map((e: string) => (
                                <Chip 
                                    key={e} 
                                    label={e} 
                                    onClick={() => setSelectedEmirate(e)}
                                    sx={{ 
                                        bgcolor: selectedEmirate === e ? binThemeTokens.gold : '#F8F9FB',
                                        color: '#111827',
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
                            <Typography variant="overline" sx={{ color: '#475467', fontWeight: 800 }}>Average Ticket Resolution</Typography>
                            <Typography variant="h2" fontWeight="950" sx={{ color: '#111827' }} data-testid="reporting-resolution-time">{formatResolutionTime(stats.avgResolutionMinutes)}</Typography>
                            <Typography variant="caption" sx={{ color: '#7A5C12' }}>{stats.avgResolutionMinutes === null ? 'NO COMPLETED TICKETS WITH TIMESTAMPS' : `CREATED → COMPLETED · ${stats.resolutionSampleSize} TICKET(S)`}</Typography>
                        </Stack>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                        <Stack spacing={1}>
                            <CreditCard color={binThemeTokens.gold} size={32} />
                            <Typography variant="overline" sx={{ color: '#475467', fontWeight: 800 }}>Financial Integrity</Typography>
                            <Typography variant="h2" fontWeight="950" sx={{ color: '#111827' }}>AED {formatAED(stats.totalSettled)}</Typography>
                            <Typography variant="caption" sx={{ color: '#7A5C12' }}>TOTAL DIRECT SETTLEMENTS</Typography>
                        </Stack>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                        <Stack spacing={1}>
                            <PieChart color={binThemeTokens.gold} size={32} />
                            <Typography variant="overline" sx={{ color: '#475467', fontWeight: 800 }}>Portfolio Occupancy</Typography>
                            <Typography variant="h2" fontWeight="950" sx={{ color: '#111827' }} data-testid="reporting-occupancy">{formatOccupancy(stats.occupancyPercent)}</Typography>
                            <Typography variant="caption" sx={{ color: '#7A5C12' }}>{stats.occupancyPercent === null ? 'NO UNIT RECORDS' : `${stats.occupiedUnits} OF ${stats.totalUnits} UNITS OCCUPIED`}</Typography>
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ mt: 8, mb: 4 }}>
                        <Typography variant="h5" fontWeight="950" sx={{ color: '#111827', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <ShieldAlert color={binThemeTokens.gold} /> ADVANCED ANALYTICS & RISK INTELLIGENCE
                        </Typography>
                    </Box>
                    <Grid container spacing={4}>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 4, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6 }}>
                                <Typography variant="overline" sx={{ color: '#7A5C12', fontWeight: 900 }}>TOP FAULT CATEGORIES</Typography>
                                <Stack spacing={3} sx={{ mt: 3 }}>
                                    {stats.faultCategories.length === 0 && (
                                        <Typography variant="body2" color="textSecondary">{NOT_AVAILABLE}: no categorised tickets yet.</Typography>
                                    )}
                                    {stats.faultCategories.map((f) => (
                                        <Box key={f.category} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="body1" fontWeight="900" color="#111827">{f.category}</Typography>
                                            <Typography variant="caption" color="textSecondary">{f.count} TICKET(S)</Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 4, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6 }}>
                                <Typography variant="overline" sx={{ color: '#7A5C12', fontWeight: 900 }}>EMERGENCY TICKETS (6M)</Typography>
                                <Box sx={{ mt: 4, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 100 }}>
                                    {stats.emergencyByMonth.map((m) => (
                                        <Box key={m.month} title={`${m.month}: ${m.count}`} sx={{ width: '12%', bgcolor: binThemeTokens.gold, height: `${(m.count / emergencyMax) * 100}%`, minHeight: 2, borderRadius: 1 }} />
                                    ))}
                                </Box>
                                <Typography variant="caption" color="textSecondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>{stats.emergencyByMonth.reduce((sum, m) => sum + m.count, 0)} emergency ticket(s) in the last 6 months</Typography>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 4, bgcolor: '#FFFFFF', border: `2px solid ${binThemeTokens.gold}`, borderRadius: 6 }}>
                                <Typography variant="overline" sx={{ color: '#7A5C12', fontWeight: 950 }}>RENEWAL RISK SCORE</Typography>
                                <Box sx={{ textAlign: 'center', py: 2 }}>
                                    <Typography variant="h4" fontWeight="950" color="#111827" data-testid="reporting-renewal-risk">{NOT_AVAILABLE}</Typography>
                                    <Typography variant="body2" color="textSecondary">No renewal risk model is connected to your records yet.</Typography>
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                </Grid>

                <Grid item xs={12}>
                    <Typography variant="h5" fontWeight="900" sx={{ color: '#111827', mb: 4, mt: 4 }}>Regional Performance Distribution</Typography>
                    <Grid container spacing={3}>
                        {stats.regionalStats.map((reg) => (
                            <Grid item xs={12} md={4} key={reg.emirate}>
                                <Card sx={{ bgcolor: '#F8F9FB', border: '1px solid #E5E7EB', borderRadius: 6 }}>
                                    <CardContent sx={{ p: 4 }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="h6" fontWeight="900" sx={{ color: '#111827' }}>{reg.emirate?.toUpperCase()}</Typography>
                                                <Typography variant="caption" sx={{ color: '#475467' }}>{reg.count} ACTIVE ASSETS</Typography>
                                            </Box>
                                            <Globe color={binThemeTokens.gold} />
                                        </Stack>
                                        <Typography variant="caption" sx={{ mt: 4, display: 'block', color: '#475467' }}>SERVICE UPTIME: {NOT_AVAILABLE.toUpperCase()} (NOT TRACKED)</Typography>
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
