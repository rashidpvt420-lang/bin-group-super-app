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
  const { user, godMode } = useRole();
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
      const quoteQuery = godMode ? query(quoteRef) : query(quoteRef, where('ownerId', '==', user.uid));
      const quoteSnap = await getDocs(quoteQuery);
      const fetchedQuotes = quoteSnap.docs.map(doc => ({ quoteId: doc.id, ...doc.data() } as TurnoverQuote));
      setQuotes(fetchedQuotes);

      const turnoverStats = await fetchTurnoverStats(user.uid, godMode);
      setStats(turnoverStats);

    } catch (error) {
      console.error('Failed to fetch turnover quotes:', error);
      setSnackbar({ open: true, message: 'Protocol Error: Failed to load turnover quotes.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (quoteId: string) => {
    try {
      await updateDoc(doc(db, 'turnover-quotes', quoteId), { status: 'APPROVED' });
      setSnackbar({ open: true, message: 'Institutional Quote Approved. Work order initiated.', severity: 'success' });
      fetchQuotes();
      setDetailsOpen(false);
    } catch (error) {
      setSnackbar({ open: true, message: 'Protocol Error: Approval failed.', severity: 'error' });
    }
  };

  const handleReject = async (quoteId: string) => {
    try {
      await updateDoc(doc(db, 'turnover-quotes', quoteId), { status: 'REJECTED' });
      setSnackbar({ open: true, message: 'Quote rejected. Asset record updated.', severity: 'info' });
      fetchQuotes();
      setDetailsOpen(false);
    } catch (error) {
      setSnackbar({ open: true, message: 'Protocol Error: Rejection failed.', severity: 'error' });
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
    return <Typography>Loading turnover engine...</Typography>;
  }

  return (
    <Container maxWidth="xl" sx={{ py: 6 }}>
      <Box sx={{ mb: 8 }}>
        <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -1, fontSize: { xs: '2.4rem', md: '3.5rem' } }}>
            TURNOVER ENGINE
        </Typography>
        <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>
            Asset restoration and high-frequency restoration cycles.
        </Typography>
      </Box>

      {/* Statistics */}
      <Grid container spacing={isMobile ? 2 : 4} sx={{ mb: 8 }}>
        {[
            { label: 'PENDING QUOTES', val: pendingCount, icon: <Clock size={24} />, color: binThemeTokens.gold },
            { label: 'APPROVED WORKS', val: approvedCount, icon: <CheckCircle size={24} />, color: '#4ADE80' },
            { label: 'IN PROGRESS', val: inProgressCount, icon: <TrendingUp size={24} />, color: '#60A5FA' },
            { label: 'COMPLETED ASSETS', val: completedCount, icon: <Package size={24} />, color: binThemeTokens.goldLight },
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
              <TableCell>Quote ID</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell>Unit Type</TableCell>
              <TableCell align="right">Quote Amount</TableCell>
              <TableCell align="right">After Discount</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {quotes.map((quote) => (
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
                      Review
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
            <DialogTitle>Turnover Quote Details</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">
                    Quote ID
                  </Typography>
                  <Typography variant="body2">{selectedQuote.quoteId}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">
                    Unit
                  </Typography>
                  <Typography variant="body2">{selectedQuote.unitId}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="textSecondary">
                    Unit Type
                  </Typography>
                  <Typography variant="body2">{selectedQuote.unitType}</Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">
                    Painting
                  </Typography>
                  <Typography variant="body2">AED {selectedQuote.paintingCost.toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">
                    Deep Cleaning
                  </Typography>
                  <Typography variant="body2">
                    AED {selectedQuote.deepCleaningCost.toLocaleString()}
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Total Quote: AED {selectedQuote.totalQuote.toLocaleString()}
                  </Typography>
                </Grid>

                {selectedQuote.discount > 0 && (
                  <>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="textSecondary">
                        Enterprise Discount (3.3%)
                      </Typography>
                      <Typography variant="body2" color="success.main">
                        -AED {selectedQuote.discount.toLocaleString()}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sx={{ backgroundColor: '#e8f5e9', p: 1.5, borderRadius: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Final Price: AED {selectedQuote.finalPrice.toLocaleString()}
                      </Typography>
                    </Grid>
                  </>
                )}

                <Grid item xs={12}>
                  <Typography variant="caption" color="textSecondary">
                    Expires: {new Date(selectedQuote.expiryDate).toLocaleDateString()}
                  </Typography>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsOpen(false)}>Close</Button>
              {selectedQuote.status === 'PENDING' && (
                <>
                  <Button
                    onClick={() => handleReject(selectedQuote.quoteId)}
                    variant="outlined"
                    color="error"
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleApprove(selectedQuote.quoteId)}
                    variant="contained"
                    color="success"
                  >
                    Approve & Create Work Order
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
