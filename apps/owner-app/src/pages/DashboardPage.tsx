// apps/owner-app/src/pages/DashboardPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Container, Grid, Card, CardContent, Typography, Box, Button,
  LinearProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Stack, Chip, Divider, CircularProgress,
  alpha, Alert
} from '@mui/material';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SecurityIcon from '@mui/icons-material/Security';
import AssignmentIcon from '@mui/icons-material/Assignment';
import SpeedIcon from '@mui/icons-material/Speed';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { ArrowRight, ArrowLeft, ShieldAlert, Crown, Tent, AlertCircle, AlertCircle as AlertCircleIcon, BellRing } from 'lucide-react';
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
import RiskRadar from '../components/RiskRadar';
import PaymentStatusCard, { PaymentStatus } from '../components/onboarding/PaymentStatusCard';
import { useOnboardingStore } from '../store/onboardingStore';
import { doc, getDoc } from 'firebase/firestore';

export default function DashboardPage() {
    const { user, role, enableNotifications } = useRole();
    const { intakeId } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const [contracts, setContracts] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any>(null);
    const [intelligence, setIntelligence] = useState<Record<string, MissionGuidancePayload>>({});
    const [loading, setLoading] = useState(true);
    const [generatingAudit, setGeneratingAudit] = useState<string | null>(null);
    const [integrity, setIntegrity] = useState<ProfileHealth | null>(null);
    const [notifLoading, setNotifLoading] = useState(false);
    const [showNotifSuccess, setShowNotifSuccess] = useState(false);
    const [pendingIntake, setPendingIntake] = useState<any>(null);
    const [approvals, setPendingApprovals] = useState<any[]>([]);

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                // [V10] Step 3: Payment Status Logic
                if (intakeId) {
                    const intakeSnap = await getDoc(doc(db, 'intake_submissions', intakeId));
                    if (intakeSnap.exists()) {
                        setPendingIntake(intakeSnap.data());
                    }
                }

                const portfolio = await fetchPortfolioAggregation(user.uid);
                setContracts(portfolio.contracts);
                setProperties(portfolio.properties);
                setPendingApprovals(portfolio.tickets.filter(t => t.status === 'AWAITING_OWNER_APPROVAL'));
...
    const handleApprovalAction = async (ticketId: string, action: 'APPROVE' | 'REJECT' | 'REVISE', revisionNotes?: string) => {
        try {
            const ticketRef = doc(db, 'maintenanceTickets', ticketId);
            const updateData: any = {
                updatedAt: serverTimestamp()
            };

            if (action === 'APPROVE') {
                updateData.status = 'APPROVED';
                updateData.approvalDate = serverTimestamp();
            } else if (action === 'REJECT') {
                updateData.status = 'REJECTED';
            } else if (action === 'REVISE') {
                updateData.status = 'OPEN'; // Reset to open so admin can revise estimate
                updateData.revisionNotes = revisionNotes;
            }

            await updateDoc(ticketRef, updateData);
            setPendingApprovals(prev => prev.filter(t => t.id !== ticketId));
        } catch (err) {
            console.error("Approval action failed:", err);
            alert("Sovereign Error: Failed to process approval action.");
        }
    };

                if (portfolio.properties.length > 0) {
                    const yieldMetrics = calculateAnnualYieldMetrics(portfolio);
                    const complianceScore = calculateComplianceScore(portfolio);
                    const esgRating = calculateESGRatings(portfolio);

                    setMetrics({
                        yield: yieldMetrics,
                        compliance: complianceScore,
                        esg: esgRating
                    });

                    // Compute Predictive Intelligence
                    const intelMap: Record<string, MissionGuidancePayload> = {};
                    const getAiGuidance = httpsCallable(functions, 'getMissionGuidance');

                    for (const prop of portfolio.properties) {
                        const ctx = getHistoricalContextForProperty(portfolio, prop.id);
                        if (ctx) {
                            try {
                                const result = await getAiGuidance({ context: ctx });
                                intelMap[prop.id] = result.data as MissionGuidancePayload;
                            } catch (aiError) {
                                intelMap[prop.id] = await generatePredictiveIntelligence(ctx);
                            }
                        }
                    }
                    setIntelligence(intelMap);
                }

                const alertQuery = query(
                    collection(db, 'notifications'),
                    where('userId', '==', user.uid),
                    orderBy('createdAt', 'desc'),
                    limit(5)
                );
                const alertSnap = await getDocs(alertQuery);
                setNotifications(alertSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                if (user && role) {
                    setIntegrity(checkProfileIntegrity(user, role));
                }

            } catch (err) {
                console.error("Dashboard sync error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user, intakeId]);

    const handleEnableNotifs = async () => {
        setNotifLoading(true);
        const success = await enableNotifications();
        if (success) {
            setShowNotifSuccess(true);
            setTimeout(() => setShowNotifSuccess(false), 5000);
        }
        setNotifLoading(false);
    };

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
            <Container maxWidth="md" sx={{ py: { xs: 8, md: 15 }, textAlign: 'center' }}>
                {pendingIntake ? (
                    <Box sx={{ textAlign: 'left' }}>
                        <Typography variant="h3" fontWeight="950" sx={{ mb: 4, textAlign: 'center', color: '#FFF' }}>
                            ACTIVATION PENDING
                        </Typography>
                        <PaymentStatusCard 
                            statusData={{
                                method: pendingIntake.paymentMethod || 'BANK_TRANSFER',
                                status: pendingIntake.status || 'SUBMITTED',
                                amount: pendingIntake.mobilizationDue || 0,
                                updatedAt: pendingIntake.createdAt
                            }} 
                        />
                        <Box sx={{ mt: 6, textAlign: 'center' }}>
                             <Button 
                                variant="text" 
                                onClick={() => window.location.href='/onboarding'}
                                sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}
                            >
                                UPDATE PORTFOLIO DATA
                            </Button>
                        </Box>
                    </Box>
                ) : (
                    <Box>
                        <ShieldAlert size={80} color={binThemeTokens.gold} style={{ marginBottom: 24, opacity: 0.5 }} />
                        <Typography variant="h3" fontWeight="900" sx={{ color: '#fff', mb: 2 }}>{t('dash.empty_title')}</Typography>
                        <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, mb: 6 }}>
                            {t('dash.empty_subtitle')}
                        </Typography>
                        <Button 
                            variant="contained" size="large" 
                            onClick={() => window.location.href='/onboarding'}
                            sx={{ background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', color: '#0B0B0C', px: 8, py: 3, fontWeight: 900, borderRadius: 4, fontSize: '1.2rem' }}>
                            {t('dash.empty_cta')}
                        </Button>
                    </Box>
                )}
            </Container>
        );
    }

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
        <Button 
            variant="contained" size="large" 
            sx={{ background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', color: '#0B0B0C', px: 5, py: 2, fontWeight: 900, borderRadius: 3 }}
            onClick={() => window.location.href = '/onboarding'}>
            {t('dash.onboard_cta')}
        </Button>
      </Box>

      {/* Main Stats Grid */}
...
      {/* Pending Approvals Section */}
      {approvals.length > 0 && (
          <Box sx={{ mb: 8 }}>
              <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: '#FFF', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <SecurityIcon sx={{ color: binThemeTokens.gold }} /> PENDING MAINTENANCE APPROVALS
              </Typography>
              <Stack spacing={3}>
                  {approvals.map((ticket) => (
                      <Paper key={ticket.id} sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${binThemeTokens.gold}`, borderRadius: 4 }}>
                          <Grid container spacing={3} alignItems="center">
                              <Grid item xs={12} md={7}>
                                  <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                                      <Chip label="APPROVAL REQUIRED" size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                                      <Chip label={`ESTIMATE: AED ${ticket.estimatedCost?.toLocaleString()}`} size="small" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }} />
                                  </Box>
                                  <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF', mb: 1 }}>{ticket.description}</Typography>
                                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                      Property: {ticket.propertyName} | Unit: {ticket.unitNumber}
                                  </Typography>
                              </Grid>
                              <Grid item xs={12} md={5}>
                                  <Stack direction="row" spacing={2} justifyContent="flex-end">
                                      <Button 
                                        variant="outlined" 
                                        color="error"
                                        onClick={() => handleApprovalAction(ticket.id, 'REJECT')}
                                        sx={{ fontWeight: 900 }}
                                      >
                                          REJECT
                                      </Button>
                                      <Button 
                                        variant="outlined" 
                                        sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', fontWeight: 900 }}
                                        onClick={() => {
                                            const notes = prompt("Enter revision instructions for the Admin:");
                                            if (notes) handleApprovalAction(ticket.id, 'REVISE', notes);
                                        }}
                                      >
                                          REVISE
                                      </Button>
                                      <Button 
                                        variant="contained" 
                                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                                        onClick={() => handleApprovalAction(ticket.id, 'APPROVE')}
                                      >
                                          APPROVE QUOTE
                                      </Button>
                                  </Stack>
                              </Grid>
                          </Grid>
                      </Paper>
                  ))}
              </Stack>
          </Box>
      )}

      {/* [V10] Step 5: Risk Radar Integration */}
      <Grid container spacing={4} sx={{ mb: 8 }}>
          <Grid item xs={12} md={6}>
              <RiskRadar data={integrity} />
          </Grid>
          <Grid item xs={12} md={6}>
              <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198, 167, 94, 0.15)', height: '100%' }}>
                  <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>PORTFOLIO YIELD ANALYTICS</Typography>
                  <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mt: 1, mb: 3 }}>Institutional ROI Projection</Typography>
                  <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.05)' }} />
                  <Stack spacing={4}>
                      <Box>
                          <Typography variant="body2" color="textSecondary">Gross ROI (Projected)</Typography>
                          <Typography variant="h4" fontWeight="900" color="#4ADE80">{metrics?.yield?.grossROI?.toFixed(1) || '0.0'}%</Typography>
                      </Box>
                      <Box>
                          <Typography variant="body2" color="textSecondary">Operational Net Yield</Typography>
                          <Typography variant="h4" fontWeight="900" color={binThemeTokens.gold}>{metrics?.yield?.netROI?.toFixed(1) || '0.0'}%</Typography>
                      </Box>
                  </Stack>
              </Paper>
          </Grid>
      </Grid>

      {/* Asset Ledger */}
      <Box sx={{ mb: 8 }}>
          <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: '#FFF' }}>{t('dash.ledger')}</Typography>
          <TableContainer component={Paper} sx={{ bgcolor: 'rgba(22, 22, 24, 0.6)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
            <Table>
              <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                <TableRow>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('dash.asset_node')}</TableCell>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('dash.health_index')}</TableCell>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('dash.annual_amc')}</TableCell>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('dash.protocol_status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {properties.map((p) => (
                    <TableRow key={p.id}>
                        <TableCell>
                            <Typography variant="subtitle1" fontWeight="900" color="#FFF">{p.area}</Typography>
                            <Typography variant="caption" color="textSecondary">{p.buildingName || 'Private Asset'} · {p.emirate}</Typography>
                        </TableCell>
                        <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <LinearProgress variant="determinate" value={p.healthIndex || 90} sx={{ height: 8, borderRadius: 4, width: 100, '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                                <Typography variant="caption" color="white" fontWeight="900">{p.healthIndex || 90}%</Typography>
                            </Box>
                        </TableCell>
                        <TableCell sx={{ color: '#FFF', fontWeight: 900 }}>AED {formatAED(p.annualAMC)}</TableCell>
                        <TableCell><Chip label="ACTIVE" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 900 }} /></TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
      </Box>

      {/* Sovereign AI Intelligence */}
      <Box sx={{ mb: 8 }}>
          <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: binThemeTokens.gold }}>{t('dash.intel.deck')}</Typography>
          <Grid container spacing={4}>
              {properties.map((p) => (
                  <Grid item xs={12} md={6} key={p.id}>
                      <MissionGuidanceFeed propertyId={p.id} intel={intelligence[p.id]} />
                  </Grid>
              ))}
          </Grid>
      </Box>
    </Container>
  );
}
