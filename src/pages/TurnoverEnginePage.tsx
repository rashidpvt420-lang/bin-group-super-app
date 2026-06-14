// owner-app/src/pages/TurnoverEnginePage.tsx
import React, { useState, useEffect } from 'react';
import {
  Container, Card, CardContent, Typography, Box, Grid, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TableRow,
  Table, TableBody, TableCell, TableContainer, TableHead, Chip,
  Paper, Divider, useTheme, useMediaQuery, Snackbar, Alert,
  Stack, LinearProgress, CircularProgress, alpha
} from '@mui/material';
import { 
    Package, CheckCircle, TrendingUp, Clock, AlertTriangle, 
    ArrowRight, ClipboardList, Camera, ShieldCheck, Home,
    Zap, PaintBucket, Eraser, Key
} from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { db, collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '@bin/shared';
import { fetchTurnoverStats } from '../utils/turnoverEngine';
import { formatAED } from '../utils/formatters';

interface TurnoverQuote {
  quoteId: string;
  propertyId: string;
  unitId: string;
  unitType: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED';
  paintingCost: number;
  deepCleaningCost: number;
  totalQuote: number;
  discount: number;
  finalPrice: number;
  expiryDate: string;
  createdAt: string;
}

export default function TurnoverEnginePage() {
  const { user } = useRole();
  const { t } = useLanguage();
  const [quotes, setQuotes] = useState<TurnoverQuote[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [selectedQuote, setSelectedQuote] = useState<TurnoverQuote | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    if (user) fetchQuotes();
  }, [user]);

  const fetchQuotes = async () => {
    try {
      if (!user) return;
      setLoading(true);
      
      const quoteRef = collection(db, 'turnover-quotes');
      const quoteQuery = query(quoteRef, where('ownerId', '==', user.uid));
      const quoteSnap = await getDocs(quoteQuery);
      const fetchedQuotes = quoteSnap.docs.map(doc => ({ quoteId: doc.id, ...doc.data() } as TurnoverQuote));
      setQuotes(fetchedQuotes);

      const turnoverStats = await fetchTurnoverStats(user.uid);
      setStats(turnoverStats);

    } catch (error) {
      console.error('Failed to fetch turnover quotes:', error);
      setSnackbar({ open: true, message: t('turnover.msg.load_failed'), severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (quoteId: string) => {
    try {
      await updateDoc(doc(db, 'turnover-quotes', quoteId), { status: 'APPROVED' });
      setSnackbar({ open: true, message: t('turnover.msg.approved'), severity: 'success' });
      fetchQuotes();
      setDetailsOpen(false);
    } catch (error) {
      setSnackbar({ open: true, message: t('turnover.msg.approve_failed'), severity: 'error' });
    }
  };

  const handleReject = async (quoteId: string) => {
    try {
      await updateDoc(doc(db, 'turnover-quotes', quoteId), { status: 'REJECTED' });
      setSnackbar({ open: true, message: t('turnover.msg.rejected'), severity: 'info' });
      fetchQuotes();
      setDetailsOpen(false);
    } catch (error) {
      setSnackbar({ open: true, message: t('turnover.msg.reject_failed'), severity: 'error' });
    }
  };

  const handleInitiateMoveOut = async () => {
    if (!user?.uid) return;
    try {
      await addDoc(collection(db, 'moveout_requests'), {
        ownerId: user.uid,
        requestedAt: serverTimestamp(),
        status: 'PENDING',
      });
      setSnackbar({ open: true, message: 'Move-out request submitted. BIN GROUP will contact you within 24 hours.', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Request failed. Please try again.', severity: 'error' });
    }
  };

  const getStatusColor = (status: string): any => {
    switch (status) {
      case 'PENDING': return 'warning';
      case 'APPROVED': return 'success';
      case 'IN_PROGRESS': return 'info';
      case 'COMPLETED': return 'success';
      case 'REJECTED': return 'error';
      default: return 'default';
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  return (
    <Container maxWidth="xl" sx={{ py: 6 }}>
      <Box sx={{ mb: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Box>
            <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -1 }}>VACANCY COMMAND</Typography>
            <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 500 }}>Turnover Optimization & Readiness Protocol</Typography>
        </Box>
        <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
            <Button variant={tab === 0 ? "contained" : "outlined"} onClick={() => setTab(0)} sx={{ borderRadius: 100, fontWeight: 900, bgcolor: tab === 0 ? binThemeTokens.gold : 'transparent', color: tab === 0 ? '#000' : binThemeTokens.gold, borderColor: binThemeTokens.gold }}>FINANCIAL QUOTES</Button>
            <Button variant={tab === 1 ? "contained" : "outlined"} onClick={() => setTab(1)} sx={{ borderRadius: 100, fontWeight: 900, bgcolor: tab === 1 ? binThemeTokens.gold : 'transparent', color: tab === 1 ? '#000' : binThemeTokens.gold, borderColor: binThemeTokens.gold }}>READINESS AUDITS</Button>
        </Stack>
      </Box>

      {tab === 0 && (
          <Box>
            {/* Statistics */}
            <Grid container spacing={isMobile ? 2 : 4} sx={{ mb: 8 }}>
                {[
                    { label: t('turnover.pending_quotes'), val: stats?.pending || 0, icon: <Clock size={24} />, color: binThemeTokens.gold },
                    { label: t('turnover.approved_works'), val: stats?.approved || 0, icon: <CheckCircle size={24} />, color: '#4ADE80' },
                    { label: t('turnover.in_progress'), val: stats?.inProgress || 0, icon: <TrendingUp size={24} />, color: '#60A5FA' },
                    { label: t('turnover.completed_assets'), val: stats?.completed || 0, icon: <Package size={24} />, color: binThemeTokens.goldLight },
                ].map((stat, i) => (
                    <Grid item xs={12} sm={6} md={3} key={i}>
                        <Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(198, 167, 94, 0.15)', p: 1 }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Box sx={{ color: stat.color, mb: 2, display: 'flex', justifyContent: 'center' }}>{stat.icon}</Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mb: 1, letterSpacing: 1.5 }}>{stat.label}</Typography>
                                <Typography variant={isMobile ? "h4" : "h3"} fontWeight="900" sx={{ color: '#fff' }}>{stat.val}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <TableContainer component={Paper} sx={{ bgcolor: 'rgba(22, 22, 24, 0.6)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                <Table>
                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                    <TableRow>
                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>QUOTE ID</TableCell>
                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>UNIT</TableCell>
                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>TYPE</TableCell>
                    <TableCell align="right" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>AMOUNT</TableCell>
                    <TableCell align="right" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>FINAL</TableCell>
                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STATUS</TableCell>
                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ACTIONS</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {(quotes || []).map((quote) => (
                    <TableRow key={quote.quoteId} hover>
                        <TableCell sx={{ color: '#FFF', fontWeight: 700 }}>{quote.quoteId.substring(0,8)}</TableCell>
                        <TableCell sx={{ color: '#FFF' }}>{quote.unitId}</TableCell>
                        <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>{quote.unitType}</TableCell>
                        <TableCell align="right" sx={{ color: '#FFF' }}>AED {formatAED(quote.totalQuote)}</TableCell>
                        <TableCell align="right" sx={{ color: '#4ADE80', fontWeight: 900 }}>AED {formatAED(quote.finalPrice)}</TableCell>
                        <TableCell><Chip label={quote.status} color={getStatusColor(quote.status)} size="small" sx={{ fontWeight: 900, fontSize: '0.65rem' }} /></TableCell>
                        <TableCell>
                        {quote.status === 'PENDING' && (
                            <Button size="small" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} onClick={() => { setSelectedQuote(quote); setDetailsOpen(true); }}>{t('common.review')}</Button>
                        )}
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </TableContainer>
          </Box>
      )}

      {tab === 1 && (
          <Box>
              <Grid container spacing={4}>
                  <Grid item xs={12} lg={8}>
                      <Stack spacing={3}>
                          {[
                              { unit: 'A102', status: 'IN_RESTORATION', progress: 65, tasks: ['Painting', 'Deep Clean', 'AC Service'] },
                              { unit: 'B405', status: 'READY_FOR_LEASE', progress: 100, tasks: [] },
                              { unit: 'P10', status: 'INSPECTION_PENDING', progress: 10, tasks: ['Key Collection', 'Structural Audit'] }
                          ].map((node, i) => (
                              <Paper key={i} sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                                  <Grid container spacing={3} alignItems="center">
                                      <Grid item xs={12} sm={3}>
                                          <Typography variant="h4" fontWeight="950" color="#FFF">UNIT {node.unit}</Typography>
                                          <Chip label={node.status.replace(/_/g, ' ')} size="small" sx={{ mt: 1, bgcolor: node.progress === 100 ? 'rgba(16,185,129,0.1)' : 'rgba(198,167,94,0.1)', color: node.progress === 100 ? '#10b981' : binThemeTokens.gold, fontWeight: 900, fontSize: '0.6rem' }} />
                                      </Grid>
                                      <Grid item xs={12} sm={6}>
                                          <Box sx={{ mb: 2 }}>
                                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>RESTORATION PROGRESS</Typography>
                                                  <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{node.progress}%</Typography>
                                              </Box>
                                              <LinearProgress variant="determinate" value={node.progress} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                                          </Box>
                                          <Stack direction="row" spacing={1}>
                                              {node.tasks.map((t, j) => <Chip key={j} label={t} size="small" variant="outlined" sx={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)', fontSize: '0.65rem' }} />)}
                                          </Stack>
                                      </Grid>
                                      <Grid item xs={12} sm={3} sx={{ textAlign: 'right' }}>
                                          <Button variant="outlined" fullWidth sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}>VIEW AUDIT</Button>
                                      </Grid>
                                  </Grid>
                              </Paper>
                          ))}
                      </Stack>
                  </Grid>

                  <Grid item xs={12} lg={4}>
                      <Paper sx={{ p: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, borderRadius: 6 }}>
                          <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}><ShieldCheck color={binThemeTokens.gold} /> SOVEREIGN MOVE-OUT</Typography>
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 4, lineHeight: 1.6 }}>Every unit transition follows the BIN GROUP Hard-Reset™ standard. All keys, utilities, and structural layers are validated via physical audit.</Typography>
                          <Stack spacing={3}>
                              <Box sx={{ display: 'flex', gap: 2 }}>
                                  <Box sx={{ p: 1.5, bgcolor: 'rgba(198,167,94,0.1)', borderRadius: 2, color: binThemeTokens.gold }}><Key size={20} /></Box>
                                  <Box><Typography variant="subtitle2" fontWeight="900" color="#FFF">KEY PROTOCOL</Typography><Typography variant="caption" color="textSecondary">Validated handovers via Evidence-Vault™.</Typography></Box>
                              </Box>
                              <Box sx={{ display: 'flex', gap: 2 }}>
                                  <Box sx={{ p: 1.5, bgcolor: 'rgba(198,167,94,0.1)', borderRadius: 2, color: binThemeTokens.gold }}><PaintBucket size={20} /></Box>
                                  <Box><Typography variant="subtitle2" fontWeight="900" color="#FFF">DECOR AUDIT</Typography><Typography variant="caption" color="textSecondary">Jotun Premium Finish as standard.</Typography></Box>
                              </Box>
                          </Stack>
                          <Button fullWidth variant="contained" onClick={handleInitiateMoveOut} sx={{ mt: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2 }}>INITIATE NEW MOVE-OUT</Button>
                      </Paper>
                  </Grid>
              </Grid>
          </Box>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
        {selectedQuote && (
          <>
            <DialogTitle sx={{ fontWeight: 900 }}>TURNOVER QUOTE DETAILS</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                {/* ... Detail Content ... */}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsOpen(false)}>CLOSE</Button>
              {selectedQuote.status === 'PENDING' && (
                <Stack direction="row" spacing={2}>
                  <Button onClick={() => handleReject(selectedQuote.quoteId)} variant="outlined" color="error">REJECT</Button>
                  <Button onClick={() => handleApprove(selectedQuote.quoteId)} variant="contained" color="success">APPROVE</Button>
                </Stack>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity as any} sx={{ width: '100%', borderRadius: 3, fontWeight: 700 }}>{snackbar.message}</Alert>
      </Snackbar>
    </Container>
  );
}

