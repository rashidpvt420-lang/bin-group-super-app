// owner-app/src/pages/TurnoverEnginePage.tsx
import React, { useState, useEffect } from 'react';
import {
  Container,
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TableRow,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  Chip,
  Paper,
  Divider,
  useTheme,
  useMediaQuery,
  Snackbar,
  Alert
} from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';
import { Package, CheckCircle, TrendingUp, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { db, collection, query, where, getDocs, doc, updateDoc } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '../context/LanguageContext';
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

  const getStatusColor = (status: string): any => {
    switch (status) {
      case 'PENDING':
        return 'warning';
      case 'APPROVED':
        return 'success';
      case 'IN_PROGRESS':
        return 'info';
      case 'COMPLETED':
        return 'success';
      case 'REJECTED':
        return 'error';
      default:
        return 'default';
    }
  };

  // Statistics derived from real-time data
  const pendingCount = stats?.pending || 0;
  const approvedCount = stats?.approved || 0;
  const inProgressCount = stats?.inProgress || 0;
  const completedCount = stats?.completed || 0;

  if (loading) {
    return <Typography>{t('turnover.loading')}</Typography>;
  }

  return (
    <Container maxWidth="xl" sx={{ py: 6 }}>
      <Box sx={{ mb: 8 }}>
        <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -1, fontSize: { xs: '2.4rem', md: '3.5rem' } }}>
            {t('turnover.title')}
        </Typography>
        <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>
            {t('turnover.subtitle')}
        </Typography>
      </Box>

      {/* Statistics */}
      <Grid container spacing={isMobile ? 2 : 4} sx={{ mb: 8 }}>
        {[
            { label: t('turnover.pending_quotes'), val: pendingCount, icon: <Clock size={24} />, color: binThemeTokens.gold },
            { label: t('turnover.approved_works'), val: approvedCount, icon: <CheckCircle size={24} />, color: '#4ADE80' },
            { label: t('turnover.in_progress'), val: inProgressCount, icon: <TrendingUp size={24} />, color: '#60A5FA' },
            { label: t('turnover.completed_assets'), val: completedCount, icon: <Package size={24} />, color: binThemeTokens.goldLight },
        ].map((stat, i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
                <Card sx={{ 
                    bgcolor: 'rgba(22, 22, 24, 0.7)', 
                    borderRadius: 6, 
                    border: '1px solid rgba(198, 167, 94, 0.15)',
                    p: 1
                }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                        <Box sx={{ color: stat.color, mb: 2, display: 'flex', justifyContent: 'center' }}>{stat.icon}</Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mb: 1, letterSpacing: 1.5 }}>{stat.label}</Typography>
                        <Typography variant={isMobile ? "h4" : "h3"} fontWeight="900" sx={{ color: '#fff' }}>{stat.val}</Typography>
                    </CardContent>
                </Card>
            </Grid>
        ))}
      </Grid>

      {/* Quotes Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>{t('turnover.quote_id')}</TableCell>
              <TableCell>{t('turnover.unit')}</TableCell>
              <TableCell>{t('turnover.unit_type')}</TableCell>
              <TableCell align="right">{t('turnover.quote_amount')}</TableCell>
              <TableCell align="right">{t('turnover.after_discount')}</TableCell>
              <TableCell>{t('fin.log.status')}</TableCell>
              <TableCell>{t('turnover.expires')}</TableCell>
              <TableCell>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(quotes || []).map((quote) => (
              <TableRow key={quote.quoteId} hover>
                <TableCell>
                  <Button
                    variant="text"
                    onClick={() => {
                      setSelectedQuote(quote);
                      setDetailsOpen(true);
                    }}
                    sx={{ textDecoration: 'underline', color: '#2196f3', p: 0, minWidth: 0, textTransform: 'none' }}
                  >
                    {quote.quoteId}
                  </Button>
                </TableCell>
                <TableCell>{quote.unitId}</TableCell>
                <TableCell>{quote.unitType}</TableCell>
                <TableCell align="right">AED {formatAED(quote.totalQuote)}</TableCell>
                <TableCell align="right">
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    AED {formatAED(quote.finalPrice)}
                  </Typography>
                  {quote.discount > 0 && (
                    <Typography variant="caption" color="success.main">
                      -{formatAED(quote.discount)} AED
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip label={quote.status} color={getStatusColor(quote.status)} size="small" />
                </TableCell>
                <TableCell>{new Date(quote.expiryDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  {quote.status === 'PENDING' && (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={() => {
                        setSelectedQuote(quote);
                        setDetailsOpen(true);
                      }}
                    >
                      {t('common.review')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
        {selectedQuote && (
          <>
            <DialogTitle>{t('turnover.quote_details')}</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">
                    {t('turnover.painting')}
                  </Typography>
                  <Typography variant="body2">AED {formatAED(selectedQuote.paintingCost)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">
                    {t('turnover.deep_cleaning')}
                  </Typography>
                  <Typography variant="body2">
                    AED {formatAED(selectedQuote.deepCleaningCost)}
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {t('turnover.total_quote')}: AED {formatAED(selectedQuote.totalQuote)}
                  </Typography>
                </Grid>

                {selectedQuote.discount > 0 && (
                  <>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="textSecondary">
                        {t('turnover.enterprise_discount')} (3.3%)
                      </Typography>
                      <Typography variant="body2" color="success.main">
                        -AED {formatAED(selectedQuote.discount)}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sx={{ backgroundColor: '#e8f5e9', p: 1.5, borderRadius: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {t('turnover.final_price')}: AED {formatAED(selectedQuote.finalPrice)}
                      </Typography>
                    </Grid>
                  </>
                )}

                <Grid item xs={12}>
                  <Typography variant="caption" color="textSecondary">
                    {t('turnover.expires')}: {new Date(selectedQuote.expiryDate).toLocaleDateString()}
                  </Typography>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsOpen(false)}>{t('common.close')}</Button>
              {selectedQuote.status === 'PENDING' && (
                <>
                  <Button
                    onClick={() => handleReject(selectedQuote.quoteId)}
                    variant="outlined"
                    color="error"
                  >
                    {t('common.reject')}
                  </Button>
                  <Button
                    onClick={() => handleApprove(selectedQuote.quoteId)}
                    variant="contained"
                    color="success"
                  >
                    {t('turnover.approve_btn')}
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%', borderRadius: 3, fontWeight: 700 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
