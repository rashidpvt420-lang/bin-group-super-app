// owner-app/src/pages/DashboardPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Container, Grid, Card, CardContent, Typography, Box, Button,
  LinearProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Stack, Chip, Divider, CircularProgress
} from '@mui/material';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SecurityIcon from '@mui/icons-material/Security';
import AssignmentIcon from '@mui/icons-material/Assignment';
import SpeedIcon from '@mui/icons-material/Speed';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { db, collection, query, where, orderBy, limit, getDocs } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useRole } from '../context/RoleContext';
import { ShieldAlert, Crown, Tent } from 'lucide-react';
import { fetchPortfolioAggregation } from '../utils/portfolioAggregationEngine';
import { calculateAnnualYieldMetrics } from '../utils/annualYieldEngine';
import { calculateComplianceScore } from '../utils/complianceScoreEngine';
import { calculateESGRatings } from '../utils/esgRatingEngine';

export default function DashboardPage() {
    const { user, godMode } = useRole();
    const [contracts, setContracts] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                // Fetch Portfolio via Aggregation Engine
                const portfolio = await fetchPortfolioAggregation(user.uid, godMode);
                setContracts(portfolio.contracts);
                setProperties(portfolio.properties);

                // Run Live Metrics Engines
                const yieldMetrics = calculateAnnualYieldMetrics(portfolio);
                const complianceScore = calculateComplianceScore(portfolio);
                const esgRating = calculateESGRatings(portfolio);

                setMetrics({
                    yield: yieldMetrics,
                    compliance: complianceScore,
                    esg: esgRating
                });

                // Fetch Notifications
                const alertRef = collection(db, 'notifications');
                const alertQuery = godMode 
                    ? query(alertRef, orderBy('createdAt', 'desc'), limit(10))
                    : query(alertRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(4));
                
                const alertSnap = await getDocs(alertQuery);
                setNotifications(alertSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            } catch (err) {
                console.error("Dashboard sync error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    if (loading) {
        return (
            <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#000' }}>
                <CircularProgress color="inherit" sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    // Dynamic KPI Calculation
    const totalContractValue = contracts.reduce((sum, c) => sum + (c.annualContractValue || 0), 0);
    const totalProperties = properties.length;
    
    // If no properties, show Empty State Onboarding CTA
    if (totalProperties === 0) {
        return (
            <Container maxWidth="md" sx={{ py: 15, textAlign: 'center' }}>
                <ShieldAlert size={80} color={binThemeTokens.gold} style={{ marginBottom: 24, opacity: 0.5 }} />
                <Typography variant="h3" fontWeight="900" sx={{ color: '#fff', mb: 2 }}>PORTFOLIO OFFLINE</Typography>
                <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, mb: 6 }}>
                    You have no active bin-group institutional service contracts.
                    Begin your sovereign asset onboarding to unlock live monitoring.
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
                    + START ASSET ONBOARDING
                </Button>
            </Container>
        );
    }

  return (
    <Container maxWidth="xl" sx={{ py: 6 }}>
      <Box sx={{ mb: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
            <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -1 }}>
                Portfolio Intelligence
            </Typography>
            <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 500 }}>
                {user?.displayName?.toUpperCase() || 'OWNER'} Terminal · {totalProperties} Locked Assets
            </Typography>
        </Box>
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
            + ONBOARD NEW ASSET
        </Button>
      </Box>

      {/* Economic Powergrid */}
      <Grid container spacing={4} sx={{ mb: 8 }}>
        {[
            { label: 'GROSS CONTRACT VALUE', val: `AED ${(metrics?.yield?.grossContractValue/1000).toFixed(1)}K`, trend: 'LIVE', icon: <AccountBalanceWalletIcon /> },
            { label: 'ANNUAL YIELD (EST)', val: `${metrics?.yield?.annualYield}%`, trend: '+0.4%', icon: <TrendingUpIcon /> },
            { label: 'PORTFOLIO RADIUS', val: properties[0]?.emirate || 'UAE', trend: 'ACTIVE', icon: <SignalCellularAltIcon /> },
            { label: 'MAJLIS READINESS', val: properties.some(p => p.propertyType === 'majlis') ? 'SOVEREIGN' : `${metrics?.compliance}%`, trend: 'OPTIMAL', icon: <InfoOutlinedIcon /> },
        ].map((kpi, i) => (
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
                            <Box sx={{ color: binThemeTokens.gold }}>{kpi.icon}</Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.goldLight, fontWeight: 900, letterSpacing: 1 }}>{kpi.trend}</Typography>
                        </Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mb: 1, letterSpacing: 2 }}>{kpi.label}</Typography>
                        <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{kpi.val}</Typography>
                    </CardContent>
                </Card>
            </Grid>
        ))}
        <Grid item xs={12} md={3}>
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
                        <Box sx={{ color: binThemeTokens.gold }}><InfoOutlinedIcon /></Box>
                        <Typography variant="caption" sx={{ color: binThemeTokens.goldLight, fontWeight: 900, letterSpacing: 1 }}>OPTIMAL</Typography>
                    </Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mb: 1, letterSpacing: 2 }}>MAJLIS READINESS</Typography>
                    <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>
                        {properties.some(p => p.propertyType === 'majlis') ? 'SOVEREIGN' : `${metrics?.compliance}%`}
                    </Typography>
                </CardContent>
            </Card>
        </Grid>
      </Grid>

      {/* Institutional Intelligence Deck — 6 KPIs */}
      <Grid container spacing={3} sx={{ mb: 8 }}>
          <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(198, 167, 94, 0.15)' }}>
                  <CardContent>
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>NET ROI</Typography>
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
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>GROSS ROI</Typography>
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
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>SOVEREIGN ESG</Typography>
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
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>COMPLIANCE SCORE</Typography>
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
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>ASSET INTEGRITY</Typography>
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
                      <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>TENANT SATISFACTION</Typography>
                      <Typography variant="h5" fontWeight="900" sx={{ mt: 2, color: binThemeTokens.textPrimary }}>{(metrics?.esg?.sScore / 20)?.toFixed(1) || '0.0'}/5.0</Typography>
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
          <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: binThemeTokens.textPrimary, letterSpacing: 1 }}>ASSET LEDGER</Typography>
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
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>ASSET NODE / UNIT</TableCell>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>HEALTH INDEX</TableCell>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>ANNUAL AMC</TableCell>
                  <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>PROTOCOL STATUS</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {properties.map((p) => {
                    const contract = contracts.find(c => c.propertyId === p.id);
                    return (
                        <TableRow key={p.id} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                            <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle1" sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>{p.area}</Typography>
                                {p.propertyType === 'majlis' && (
                                    <Chip 
                                        label={p.majlisType?.toUpperCase() || 'MAJLIS'} 
                                        size="small" 
                                        icon={p.majlisType === 'royal' ? <Crown size={12} /> : <Tent size={12} />} 
                                        sx={{ 
                                            height: 20, 
                                            fontSize: '0.6rem', 
                                            bgcolor: p.majlisType === 'royal' ? binThemeTokens.gold : 'rgba(198,167,94,0.2)', 
                                            color: p.majlisType === 'royal' ? '#000' : binThemeTokens.gold,
                                            fontWeight: 900 
                                        }} 
                                    />
                                )}
                                {p.heritageSensitivity && p.heritageSensitivity !== 'standard' && (
                                    <ShieldAlert size={14} color={binThemeTokens.gold} style={{ opacity: 0.8 }} />
                                )}
                            </Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>{p.buildingName || 'PRIVATE ASSET'} · {p.emirate}</Typography>
                            </TableCell>
                            <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={p.healthIndex || 90} 
                                    sx={{ 
                                        height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.05)', width: 100,
                                        '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #C6A75E, #E6C77A)' }
                                    }} 
                                />
                                <Typography variant="caption" sx={{ color: binThemeTokens.goldLight, fontWeight: 900 }}>{p.healthIndex || 90}%</Typography>
                            </Box>
                            </TableCell>
                            <TableCell sx={{ color: binThemeTokens.textPrimary, fontWeight: 900, fontSize: '1.1rem' }}>
                                AED {contract?.annualContractValue?.toLocaleString() || '---'}
                            </TableCell>
                            <TableCell>
                            <Chip 
                                label={contract?.status || 'PENDING'} 
                                size="small" 
                                sx={{ 
                                    fontSize: '0.7rem', height: 24, fontWeight: 900, 
                                    bgcolor: contract?.status === 'ACTIVE' ? 'rgba(198, 167, 94, 0.1)' : 'rgba(255,255,255,0.05)', 
                                    color: contract?.status === 'ACTIVE' ? binThemeTokens.gold : '#aaa',
                                    border: `1px solid ${contract?.status === 'ACTIVE' ? 'rgba(198, 167, 94, 0.3)' : 'rgba(255,255,255,0.1)'}`
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
            <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: binThemeTokens.textPrimary, letterSpacing: 1 }}>SOVEREIGN ALERTS</Typography>
            <Stack spacing={3}>
                {notifications.length > 0 ? notifications.map((n, i) => (
                    <Paper key={i} sx={{ 
                        p: 3, 
                        bgcolor: 'rgba(198, 167, 94, 0.03)', 
                        borderLeft: `4px solid ${binThemeTokens.gold}`, 
                        borderRadius: 4,
                        border: '1px solid rgba(198, 167, 94, 0.1)'
                    }}>
                        <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, mb: 0.5 }}>{n.title}</Typography>
                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2, lineHeight: 1.6 }}>{n.message}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>MISSION FEED →</Typography>
                    </Paper>
                )) : (
                    <Paper sx={{ 
                        p: 6, textAlign: 'center', bgcolor: 'transparent', 
                        border: '2px dashed rgba(198,167,94,0.15)', borderRadius: 8,
                        display: 'flex', flexDirection: 'column', alignItems: 'center'
                    }}>
                        <NotificationsActiveIcon sx={{ color: 'rgba(198,167,94,0.1)', fontSize: 60, mb: 2 }} />
                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>Listening for mission-critical protocol alerts...</Typography>
                    </Paper>
                )}
            </Stack>
        </Grid>
      </Grid>

      {/* Sovereign Command Deck */}
      <Box sx={{ 
          mt: 10, p: 6, 
          bgcolor: '#0B0B0C', 
          borderRadius: 8, 
          border: `1px solid ${binThemeTokens.gold}44`, 
          background: 'linear-gradient(135deg, #161618 0%, #0B0B0C 100%)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.8)'
      }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 6 }}>
              <Box>
                  <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: 1 }}>SOVEREIGN ASSET COMMAND</Typography>
                  <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary }}>Institutional Grade Auditing & National Zone Interface</Typography>
              </Box>
              <Chip label="v1.19-PROD" size="medium" sx={{ bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, p: 2 }} />
          </Stack>
 
          <Grid container spacing={4}>
              {[
                { label: 'SOVEREIGN HASH ANCHOR', val: contracts[0]?.id?.substring(0,16).toUpperCase() || 'STAGING_READY', icon: <SecurityIcon /> },
                { label: 'MUNICIPALITY ADAPTER', val: 'DLD / ADM SYNC ACTIVE', icon: <AssignmentIcon /> },
                { label: 'INSURER RISK GRADE', val: metrics?.esg?.weightedAverage > 80 ? 'P.1 (OPTIMAL)' : 'P.2 (STABLE)', icon: <TrendingUpIcon /> },
                { label: 'GATEWAY STATUS', val: 'SECURE_TUNNEL_ACTIVE', icon: <SpeedIcon /> },
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
                    GENERATE INSTITUTIONAL AUDIT →
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
                    SYNC WITH NATIONAL GATEWAY →
                  </Button>
              </Grid>
          </Grid>
      </Box>
    </Container>
  );
}
