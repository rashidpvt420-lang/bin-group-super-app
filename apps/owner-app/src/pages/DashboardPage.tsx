import React, { useState, useEffect } from 'react';
import {
  Container, Grid, Card, CardContent, Typography, Box, Button,
  LinearProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Stack, Chip, Divider, CircularProgress,
  alpha
} from '@mui/material';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SecurityIcon from '@mui/icons-material/Security';
import AssignmentIcon from '@mui/icons-material/Assignment';
import SpeedIcon from '@mui/icons-material/Speed';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { ArrowRight, ArrowLeft, ShieldAlert, Crown, AlertCircle } from 'lucide-react';
import { db, collection, query, where, orderBy, limit, getDocs } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '../context/LanguageContext';
import { fetchPortfolioAggregation } from '../utils/portfolioAggregationEngine';
import { calculateAnnualYieldMetrics } from '../utils/annualYieldEngine';
import { calculateComplianceScore } from '../utils/complianceScoreEngine';
import { calculateESGRatings } from '../utils/esgRatingEngine';
import { formatAED } from '../utils/formatters';
import { checkProfileIntegrity, ProfileHealth } from '../utils/IntegrityEngine';
import { getHistoricalContextForProperty, PortfolioData } from '../utils/portfolioAggregationEngine';
import { generatePredictiveIntelligence, MissionGuidancePayload } from '../utils/predictiveIntelligence';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import MissionGuidanceFeed from '../components/MissionGuidanceFeed';
import OwnerReportGenerator from '../components/OwnerReportGenerator';
import CeoContactButtons from '../components/CeoContactButtons';
import { SovereignSupportChat } from '@bin/shared';

export default function DashboardPage() {
    const { user, role } = useRole();
    const { t, isRTL } = useLanguage();
    const [contracts, setContracts] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any>(null);
    const [intelligence, setIntelligence] = useState<Record<string, MissionGuidancePayload>>({});
    const [loading, setLoading] = useState(true);
    const [generatingAudit, setGeneratingAudit] = useState<string | null>(null);
    const [integrity, setIntegrity] = useState<ProfileHealth | null>(null);
    const [passports, setPassports] = useState<any[]>([]);

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                const portfolio = await fetchPortfolioAggregation(user.uid);
                setContracts(portfolio.contracts);
                setProperties(portfolio.properties);

                const yieldMetrics = calculateAnnualYieldMetrics(portfolio);
                const complianceScore = calculateComplianceScore(portfolio);
                const esgRating = calculateESGRatings(portfolio);

                setMetrics({
                    yield: yieldMetrics,
                    compliance: complianceScore,
                    esg: esgRating
                });

                // Compute Predictive Intelligence (Vertex AI Priority)
                const intelMap: Record<string, MissionGuidancePayload> = {};
                const getAiGuidance = httpsCallable(functions, 'getMissionGuidance');

                for (const prop of portfolio.properties) {
                    const ctx = getHistoricalContextForProperty(portfolio, prop.id);
                    if (ctx) {
                        try {
                            
                            const result = await getAiGuidance({ context: ctx });
                            intelMap[prop.id] = result.data as MissionGuidancePayload;
                        } catch (aiError) {
                            console.warn(`[AI-STRATEGY] Vertex AI failed for ${prop.id}, falling back to local model:`, aiError);
                            intelMap[prop.id] = await generatePredictiveIntelligence(ctx);
                        }
                    }
                }
                setIntelligence(intelMap);

                const alertQuery = query(
                    collection(db, 'notifications'),
                    where('userId', '==', user.uid),
                    orderBy('createdAt', 'desc'),
                    limit(5)
                );
                const alertSnap = await getDocs(alertQuery);
                setNotifications(alertSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                // Context Audit: Profile Integrity
                if (user && role) {
                    setIntegrity(checkProfileIntegrity(user, role));
                }

                // Fetch Property Passports
                const passportQuery = query(
                    collection(db, 'property_passports'),
                    where('ownerId', '==', user.uid)
                );
                const passportSnap = await getDocs(passportQuery);
                setPassports(passportSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            } catch (err) {
                console.error("Dashboard sync error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user, role]);

    const handleDownloadAudit = async (propId: string, area: string) => {
        const intel = intelligence[propId];
        if (!intel) return;

        setGeneratingAudit(propId);
        try {
            const generateAudit = httpsCallable(functions, 'generateIntegrityAudit');
            const result = await generateAudit({ intel, propertyName: area });
            const { url } = result.data as { url: string };
            window.open(url, '_blank');
        } catch (error) {
            console.error("Audit generation failed:", error);
            alert("Sovereign Terminal Error: Failed to generate report.");
        } finally {
            setGeneratingAudit(null);
        }
    };

    if (loading) {
        return (
            <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#000' }}>
                <CircularProgress color="inherit" sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    const totalProperties = properties.length;
    
    if (totalProperties === 0) {
        return (
            <Container maxWidth="md" sx={{ py: 15, textAlign: 'center' }}>
                <ShieldAlert size={80} color={binThemeTokens.gold} style={{ marginBottom: 24, opacity: 0.5 }} />
                <Typography variant="h3" fontWeight="900" sx={{ color: '#fff', mb: 2 }}>{t('dash.empty_title')}</Typography>
                <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, mb: 6 }}>
                    {t('dash.empty_subtitle')}
                </Typography>
                <Button 
                    variant="contained" 
                    size="large" 
                    onClick={() => window.location.href='/onboarding'}
                    sx={{ 
                        background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                        color: '#0B0B0C', 
                        px: 8, py: 3, 
                        fontWeight: 900, 
                        borderRadius: 4,
                        fontSize: '1.2rem',
                        boxShadow: '0 20px 40px rgba(198, 167, 94, 0.3)'
                    }}>
                    {t('dash.empty_cta')}
                </Button>
            </Container>
        );
    }

    const totalCollected = passports.reduce((sum, p) => sum + (p.rentCollectedTotal || 0), 0);
    const totalOutstanding = passports.reduce((sum, p) => sum + (p.rentOutstandingTotal || 0), 0);
    const totalUnitsCount = passports.reduce((sum, p) => sum + (p.totalUnits || 0), 0);

    const kpis = [
        { label: t('dash.kpi.gross_val'), val: `AED ${formatAED(totalCollected)}`, trend: t('dash.kpi.trend.live'), icon: <AccountBalanceWalletIcon /> },
        { label: t('dash.kpi.outstanding_rent'), val: `AED ${formatAED(totalOutstanding)}`, trend: 'Alert', icon: <TrendingUpIcon />, color: totalOutstanding > 0 ? '#ef4444' : binThemeTokens.gold },
        { label: t('dash.kpi.occupancy_rate'), val: `${totalUnitsCount > 0 ? Math.round((passports.reduce((sum, p) => sum + (p.occupiedUnits || 0), 0) / totalUnitsCount) * 100) : 0}%`, trend: t('dash.kpi.trend.active'), icon: <SignalCellularAltIcon /> },
        { label: t('dash.kpi.majlis_readiness'), val: properties?.some(p => p.propertyType === 'GOVERNMENT_MAJLIS') ? t('status.sovereign') : `${metrics?.compliance || 0}%`, trend: t('dash.kpi.trend.optimal'), icon: <Crown size={20} color={binThemeTokens.gold} /> },
    ];

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 8, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3 }}>
                <Box>
                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -1 }}>
                        {t('dash.title')}
                    </Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 500 }}>
                        {user?.displayName?.toUpperCase() || t('status.owner')} {t('dash.terminal')} · {totalProperties} {t('dash.locked_assets')}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2} alignItems="center">
                    <OwnerReportGenerator 
                        user={user} 
                        properties={properties} 
                        contracts={contracts} 
                        metrics={metrics} 
                        isRTL={isRTL} 
                    />
                    <Button 
                        variant="contained" 
                        size="large" 
                        sx={{ 
                            background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                            color: '#0B0B0C', 
                            px: 5, 
                            py: 2, 
                            fontWeight: 900, 
                            borderRadius: 3,
                            boxShadow: '0 10px 20px rgba(198, 167, 94, 0.2)',
                            '&:hover': { transform: 'scale(1.02)' }
                        }}
                        onClick={() => window.location.href = '/onboarding'}>
                        {t('dash.onboard_cta')}
                    </Button>
                </Stack>
            </Box>

            {/* Profile Integrity Alert */}
            {integrity && !integrity.isComplete && (
                <Box sx={{ mb: 6 }}>
                    <Paper sx={{ 
                        p: 3, bgcolor: alpha('#DC2626', 0.05), border: '1px solid #DC2626', borderRadius: 4,
                        display: 'flex', alignItems: 'center', gap: 3
                    }}>
                        <AlertCircle color="#DC2626" size={32} />
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="h6" sx={{ color: '#F87171', fontWeight: 900 }}>{t('dash.missing_requirements')}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                Your Sovereign Protocol is incomplete. Missing: {integrity.missingFields.join(', ')}
                            </Typography>
                        </Box>
                        <Button variant="contained" sx={{ bgcolor: '#DC2626', color: '#FFF', fontWeight: 900 }} onClick={() => window.location.href='/settings'}>
                            Sync Profile
                        </Button>
                    </Paper>
                </Box>
            )}

            {/* Resident Experience & Operations Quick Actions */}
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 900, color: binThemeTokens.gold, letterSpacing: 1 }}>
                Resident Experience & Operations
            </Typography>
            <Grid container spacing={3} sx={{ mb: 6 }}>
                {[
                    { label: 'Announcements', desc: 'Broadcast notices to tenants', path: '/owner/announcements', icon: <NotificationsActiveIcon /> },
                    { label: 'Documents Vault', desc: 'Access tenancy documents & forms', path: '/owner/documents', icon: <AssignmentIcon /> },
                    { label: 'Amenities Control', desc: 'Manage slots & booking approvals', path: '/owner/amenities', icon: <SpeedIcon /> },
                    { label: 'Logistics & Parking', desc: 'Overview of parcels & visitor parking', path: '/owner/parcels-parking', icon: <SignalCellularAltIcon /> },
                    { label: 'Desk Messages', desc: 'Direct message threads with admin', path: '/owner/messages', icon: <SecurityIcon /> }
                ].map((act, i) => (
                    <Grid item xs={12} sm={6} md={2.4} key={i}>
                        <Card 
                            onClick={() => window.location.href = act.path}
                            sx={{ 
                                cursor: 'pointer',
                                bgcolor: 'rgba(198, 167, 94, 0.03)', 
                                border: '1px solid rgba(198, 167, 94, 0.15)',
                                p: 1,
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    transform: 'translateY(-4px)',
                                    borderColor: binThemeTokens.gold,
                                    bgcolor: 'rgba(198, 167, 94, 0.08)'
                                }
                            }}
                        >
                            <CardContent>
                                <Box sx={{ color: binThemeTokens.gold, mb: 1 }}>{act.icon}</Box>
                                <Typography variant="subtitle2" fontWeight="900" sx={{ color: '#FFF' }}>{act.label}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, display: 'block', mt: 0.5 }}>{act.desc}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* Economic Powergrid */}
            <Grid container spacing={4} sx={{ mb: 8 }}>
                {kpis.map((kpi, i) => (
                    <Grid item xs={12} md={3} key={i}>
                        <Card sx={{ 
                            bgcolor: 'rgba(22, 22, 24, 0.7)', 
                            backdropFilter: 'blur(20px)',
                            p: 1.5, 
                            borderRadius: 6, 
                            border: '1px solid rgba(198, 167, 94, 0.15)',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                        }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                                    <Box sx={{ color: (kpi as any).color || binThemeTokens.gold }}>{kpi.icon}</Box>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.goldLight, fontWeight: 900, letterSpacing: 1 }}>{kpi.trend}</Typography>
                                </Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mb: 1, letterSpacing: 2 }}>{kpi.label}</Typography>
                                <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{kpi.val}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

      {/* Institutional Intelligence Deck — 6 KPIs */}
      <Grid container spacing={3} sx={{ mb: 8 }}>
          <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(198, 167, 94, 0.15)' }}>
                  <CardContent>
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('dash.kpi.net_roi')}</Typography>
                      <Typography variant="h5" fontWeight="900" sx={{ mt: 2, color: binThemeTokens.textPrimary }}>
                          {metrics?.yield?.netROI?.toFixed(1) || '0.0'}%
                      </Typography>
                      <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.05)', mt: 1, borderRadius: 2, overflow: 'hidden' }}>
                          <Box sx={{ width: `${Math.min(metrics?.yield?.netROI || 0, 100)}%`, height: '100%', background: 'linear-gradient(90deg, #C6A75E, #E6C77A)' }} />
                      </Box>
                  </CardContent>
              </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(198, 167, 94, 0.15)' }}>
                  <CardContent>
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('dash.kpi.gross_roi')}</Typography>
                      <Typography variant="h5" fontWeight="900" sx={{ mt: 2, color: binThemeTokens.textPrimary }}>
                          {metrics?.yield?.grossROI?.toFixed(1) || '0.0'}%
                      </Typography>
                      <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.05)', mt: 1, borderRadius: 2, overflow: 'hidden' }}>
                          <Box sx={{ width: `${Math.min(metrics?.yield?.grossROI || 0, 100)}%`, height: '100%', background: 'linear-gradient(90deg, #4ADE80, #22C55E)' }} />
                      </Box>
                  </CardContent>
              </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(198, 167, 94, 0.15)' }}>
                  <CardContent>
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('dash.kpi.esg')}</Typography>
                      <Typography variant="h5" fontWeight="900" sx={{ mt: 2, color: binThemeTokens.gold }}>{metrics?.esg?.rating || 'N/A'}</Typography>
                      <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.05)', mt: 1, borderRadius: 2, overflow: 'hidden' }}>
                          <Box sx={{ width: `${metrics?.esg?.weightedAverage || 0}%`, height: '100%', background: 'linear-gradient(90deg, #C6A75E, #E6C77A)' }} />
                      </Box>
                  </CardContent>
              </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(198, 167, 94, 0.15)' }}>
                  <CardContent>
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('dash.kpi.compliance')}</Typography>
                      <Typography variant="h5" fontWeight="900" sx={{ mt: 2, color: binThemeTokens.textPrimary }}>{metrics?.compliance || '0'}%</Typography>
                      <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.05)', mt: 1, borderRadius: 2, overflow: 'hidden' }}>
                          <Box sx={{ width: `${metrics?.compliance || 0}%`, height: '100%', background: 'linear-gradient(90deg, #60A5FA, #3B82F6)' }} />
                      </Box>
                  </CardContent>
              </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(198, 167, 94, 0.15)' }}>
                  <CardContent>
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('dash.kpi.integrity')}</Typography>
                      <Typography variant="h5" fontWeight="900" sx={{ mt: 2, color: binThemeTokens.textPrimary }}>{metrics?.esg?.gScore || '0'}/100</Typography>
                      <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.05)', mt: 1, borderRadius: 2, overflow: 'hidden' }}>
                          <Box sx={{ width: `${metrics?.esg?.gScore || 0}%`, height: '100%', background: 'linear-gradient(90deg, #FACC15, #EAB308)' }} />
                      </Box>
                  </CardContent>
              </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(198, 167, 94, 0.15)' }}>
                  <CardContent>
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('dash.kpi.satisfaction')}</Typography>
                      <Typography variant="h5" fontWeight="900" sx={{ mt: 2, color: binThemeTokens.textPrimary }}>{((metrics?.esg?.sScore || 0) / 20)?.toFixed(1) || '0.0'}/5.0</Typography>
                      <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.05)', mt: 1, borderRadius: 2, overflow: 'hidden' }}>
                          <Box sx={{ width: `${metrics?.esg?.sScore || 0}%`, height: '100%', background: 'linear-gradient(90deg, #4ADE80, #22C55E)' }} />
                      </Box>
                  </CardContent>
              </Card>
          </Grid>
      </Grid>

      {/* Portfolio Ledger & Alerts */}
      <Grid container spacing={6}>
        <Grid item xs={12} lg={8}>
          <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: binThemeTokens.textPrimary, letterSpacing: 1 }}>{t('dash.ledger')}</Typography>
          <TableContainer component={Paper} sx={{ 
              bgcolor: 'rgba(22, 22, 24, 0.6)', 
              borderRadius: 6, 
              overflow: 'hidden', 
              border: '1px solid rgba(255,255,255,0.05)',
              boxShadow: '0 30px 60px rgba(0,0,0,0.4)'
          }}>
            <Table>
              <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                <TableRow>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>{t('dash.asset_node')}</TableCell>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>{t('dash.health_index')}</TableCell>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>{t('dash.annual_amc')}</TableCell>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>{t('dash.protocol_status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(properties || []).map((p) => {
                    const contract = (contracts || []).find(c => c.propertyId === p.id);
                    const passport = passports.find(pass => pass.propertyId === p.id);
                    const occupancyRate = passport ? Math.round((passport.occupiedUnits / passport.totalUnits) * 100) : 0;

                    return (
                        <TableRow key={p.id} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                            <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle1" sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>{p.area}</Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>{p.buildingName || t('dash.private_asset')} · {p.emirate}</Typography>
                            </TableCell>
                            <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={occupancyRate || 0} 
                                    sx={{ 
                                        height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.05)', width: 100,
                                        '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #C6A75E, #E6C77A)' }
                                    }} 
                                />
                                <Typography variant="caption" sx={{ color: binThemeTokens.goldLight, fontWeight: 900 }}>{occupancyRate}%</Typography>
                            </Box>
                            </TableCell>
                            <TableCell sx={{ color: binThemeTokens.textPrimary, fontWeight: 900, fontSize: '1.1rem' }}>
                                AED {formatAED(passport?.rentCollectedTotal || 0)}
                                <Typography variant="caption" display="block" sx={{ color: '#ef4444', mt: 0.5 }}>
                                    {formatAED(passport?.rentOutstandingTotal || 0)} O/S
                                </Typography>
                            </TableCell>
                            <TableCell>
                            <Chip 
                                label={passport?.passportStatus?.toUpperCase() || 'ACTIVE'} 
                                size="small" 
                                sx={{ 
                                    fontSize: '0.7rem', height: 24, fontWeight: 900, 
                                    bgcolor: 'rgba(198, 167, 94, 0.1)', 
                                    color: binThemeTokens.gold,
                                    border: `1px solid rgba(198, 167, 94, 0.3)`
                                }} 
                            />
                            </TableCell>
                        </TableRow>
                    );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        <Grid item xs={12} lg={4}>
            <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: binThemeTokens.textPrimary, letterSpacing: 1 }}>{t('dash.alerts')}</Typography>
            <Stack spacing={3}>
                {(notifications || []).length > 0 ? (notifications || []).map((n, i) => (
                    <Paper key={i} sx={{ 
                        p: 3, 
                        bgcolor: 'rgba(198, 167, 94, 0.03)', 
                        borderLeft: isRTL ? 'none' : `4px solid ${binThemeTokens.gold}`, 
                        borderRight: isRTL ? `4px solid ${binThemeTokens.gold}` : 'none',
                        borderRadius: 4,
                        border: '1px solid rgba(198, 167, 94, 0.1)'
                    }}>
                        <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, mb: 0.5 }}>{n.title}</Typography>
                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2, lineHeight: 1.6 }}>{n.message}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            {t('dash.mission_feed')} {isRTL ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
                        </Typography>
                    </Paper>
                )) : (
                    <Paper sx={{ 
                        p: 6, textAlign: 'center', bgcolor: 'transparent', 
                        border: '2px dashed rgba(198,167,94,0.15)', borderRadius: 8,
                        display: 'flex', flexDirection: 'column', alignItems: 'center'
                    }}>
                        <NotificationsActiveIcon sx={{ color: 'rgba(198,167,94,0.1)', fontSize: 60, mb: 2 }} />
                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>{t('dash.listening')}</Typography>
                    </Paper>
                )}
            </Stack>
        </Grid>
      </Grid>

      {/* Sovereign Intelligence Deck — AI Pointers */}
      <Box sx={{ mt: 10, mb: 10 }}>
          <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: binThemeTokens.gold, letterSpacing: 1, textAlign: isRTL ? 'right' : 'left' }}>
              {t('dash.intel.deck')}
          </Typography>
          <Grid container spacing={4} sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
              {properties.map((p) => {
                  const intel = intelligence[p.id];
                  if (!intel) return null;
                  return (
                      <Grid item xs={12} md={6} key={p.id}>
                          <Card sx={{ 
                              bgcolor: 'rgba(198, 167, 94, 0.02)', 
                              borderRadius: 8, 
                              border: '1px solid rgba(198, 167, 94, 0.15)',
                              overflow: 'hidden'
                          }}>
                              <Box sx={{ p: 4, bgcolor: 'rgba(198, 167, 94, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                  <Typography variant="h6" fontWeight="900" sx={{ color: '#fff' }}>{p.area} • {t('dash.intel.forecast')}</Typography>
                                  <Chip label="PREDICTIVE" size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                              </Box>
                              <CardContent sx={{ p: 4, position: 'relative' }}>
                                  {/* Glassmorphism Background Accent */}
                                  <Box sx={{ 
                                      position: 'absolute', top: -50, right: -50, width: 200, height: 200, 
                                      background: `radial-gradient(circle, ${alpha(binThemeTokens.gold, 0.15)} 0%, transparent 70%)`,
                                      zIndex: 1
                                  }} />

                                  <Grid container spacing={4} sx={{ position: 'relative', zIndex: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                      <Grid item xs={6} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                          <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, justifyContent: isRTL ? 'flex-end' : 'flex-start', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                              <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1 }}>{t('dash.intel.integrity_decay')}</Typography>
                                              <TrendingUpIcon sx={{ fontSize: 14, color: binThemeTokens.danger, transform: 'rotate(180deg)' }} />
                                          </Box>
                                          <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>-{intel.assetResilience.predictedDecay12Months}%</Typography>
                                          <Typography variant="caption" sx={{ color: binThemeTokens.goldLight, fontWeight: 700 }}>{t('dash.intel.horizon')}</Typography>
                                      </Grid>
                                      <Grid item xs={6} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                          <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, justifyContent: isRTL ? 'flex-end' : 'flex-start', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                              <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1 }}>{t('dash.intel.projected_yield')}</Typography>
                                              <TrendingUpIcon sx={{ fontSize: 14, color: '#4ADE80' }} />
                                          </Box>
                                          <Typography variant="h3" fontWeight="900" sx={{ color: '#4ADE80' }}>{intel.financialForecast.expectedNetROI}%</Typography>
                                          <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{t('dash.intel.annualized_net')}</Typography>
                                      </Grid>
                                  </Grid>
                                  
                                  <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />
                                  
                                  <Box sx={{ mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                                      <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>{t('dash.intel.guidance_title')}</Typography>
                                      <Typography variant="body1" sx={{ color: binThemeTokens.textPrimary, lineHeight: 1.8, fontStyle: 'italic', mt: 1 }}>
                                          "{intel.financialForecast.guidance}"
                                      </Typography>
                                  </Box>

                                  <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 3, display: 'block', mb: 1, textAlign: isRTL ? 'right' : 'left' }}>
                                      {t('dash.intel.protocol_commands')}
                                  </Typography>
                                  
                                  <MissionGuidanceFeed 
                                    propertyId={p.id} 
                                    intel={intel} 
                                    onActionSuccess={() => {/* Optional: Refresh metrics here */}} 
                                  />

                                  <Box sx={{ mt: 4 }}>
                                      <Button 
                                        fullWidth 
                                        variant="outlined"
                                        disabled={generatingAudit === p.id}
                                        startIcon={generatingAudit === p.id ? <CircularProgress size={16} color="inherit" /> : <AssignmentIcon />}
                                        onClick={() => handleDownloadAudit(p.id, p.area)}
                                        sx={{ 
                                            borderColor: binThemeTokens.gold, 
                                            color: binThemeTokens.gold,
                                            fontWeight: 900,
                                            py: 2,
                                            borderRadius: 4,
                                            '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.05), borderColor: binThemeTokens.goldLight }
                                        }}
                                      >
                                          {generatingAudit === p.id ? t('dash.intel.generating_audit') : t('dash.intel.download_audit')}
                                      </Button>
                                  </Box>
                              </CardContent>
                          </Card>
                      </Grid>
                  );
              })}
          </Grid>
      </Box>

      {/* Sovereign Command Deck */}
      <Box sx={{ 
          mt: 10, p: 6, 
          bgcolor: '#0B0B0C', 
          borderRadius: 8, 
          border: `1px solid ${binThemeTokens.gold}44`, 
          background: 'linear-gradient(135deg, #161618 0%, #0B0B0C 100%)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.8)'
      }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={3} sx={{ mb: 6 }}>
              <Box>
                  <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: 1 }}>{t('dash.command_deck')}</Typography>
                  <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary }}>{t('dash.command_subtitle')}</Typography>
              </Box>
              <Chip label="v1.21-SOVEREIGN" size="medium" sx={{ bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, p: 2 }} />
          </Stack>
 
          <Grid container spacing={4}>
              {[
                { label: t('dash.hash_anchor'), val: contracts[0]?.id?.substring(0,16).toUpperCase() || 'STAGING_READY', icon: <SecurityIcon /> },
                { label: t('dash.municipality_adapter'), val: 'DLD / ADM SYNC ACTIVE', icon: <AssignmentIcon /> },
                { label: t('dash.risk_grade'), val: metrics?.esg?.weightedAverage > 80 ? 'P.1 (OPTIMAL)' : 'P.2 (STABLE)', icon: <TrendingUpIcon /> },
                { label: t('dash.gateway_status'), val: 'SECURE_TUNNEL_ACTIVE', icon: <SpeedIcon /> },
              ].map((kpi, i) => (
                <Grid item xs={12} md={3} key={i}>
                    <Box sx={{ 
                        p: 4, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 5, 
                        border: '1px solid rgba(198, 167, 94, 0.1)',
                        textAlign: 'center'
                    }}>
                        <Box sx={{ color: binThemeTokens.gold, mb: 2 }}>{kpi.icon}</Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 2 }}>{kpi.label}</Typography>
                        <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, mt: 1, fontSize: '0.9rem', wordBreak: 'break-all' }}>{kpi.val}</Typography>
                    </Box>
                </Grid>
              ))}
          </Grid>

          <Divider sx={{ my: 6, borderColor: 'rgba(198,167,94,0.1)' }} />

          <Grid container spacing={4}>
              <Grid item xs={12} md={6}>
                  <Button 
                    fullWidth variant="contained" 
                    sx={{ 
                        bgcolor: 'transparent', 
                        color: binThemeTokens.gold, 
                        fontWeight: 900, 
                        py: 3, 
                        borderRadius: 4, 
                        border: `1px solid ${binThemeTokens.gold}`,
                        fontSize: '1.1rem',
                        '&:hover': { bgcolor: 'rgba(198,167,94,0.05)', transform: 'translateY(-2px)' }
                    }}>
                    {t('dash.audit_btn')} {isRTL ? '←' : '→'}
                  </Button>
              </Grid>
              <Grid item xs={12} md={6}>
                  <Button 
                    fullWidth variant="contained" 
                    sx={{ 
                        background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                        color: '#0B0B0C', 
                        fontWeight: 900, 
                        py: 3, 
                        borderRadius: 4,
                        fontSize: '1.2rem',
                        boxShadow: '0 20px 40px rgba(198, 167, 94, 0.3)',
                        '&:hover': { transform: 'scale(1.02)' }
                    }}>
                    {t('dash.sync_btn')} {isRTL ? '←' : '→'}
                  </Button>
              </Grid>
          </Grid>

          <Divider sx={{ my: 8, borderColor: 'rgba(198,167,94,0.1)' }} />
          
          <Box sx={{ textAlign: 'center', mb: 4, pb: 4 }}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
                  {t('dash.escalation_title')}
              </Typography>
              <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 900, mt: 1, mb: 2 }}>
                  {t('dash.executive_desk')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 4, maxWidth: 600, mx: 'auto' }}>
                  For high-priority asset protocols, sovereign majlis requirements, or direct partnership inquiries, 
                  access our executive communication channel.
              </Typography>
              <CeoContactButtons />
          </Box>
      </Box>
      <SovereignSupportChat role="owner" />
    </Container>
  );
}
