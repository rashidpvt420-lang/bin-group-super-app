import React, { useState, useEffect } from 'react';
import { db, auth, functions, httpsCallable } from '../lib/firebase';
import { 
  collection, query, where, onSnapshot 
} from 'firebase/firestore';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Button, Chip, CircularProgress,
  TextField, Stack, Dialog, DialogTitle, DialogContent, DialogActions,
  alpha, Grid
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Receipt, History } from 'lucide-react';
import { useLanguage } from '@bin/shared';

interface Contract {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  ownerId: string;
  propertyId: string;
  provider: string;
  status: string;
  paymentVerified: boolean;
  paymentManifest: any;
  createdAt: any;
}

export default function AdminPaymentApproval() {
  const { t, lang, isRTL } = useLanguage();
  const [pendingContracts, setPendingContracts] = useState<Contract[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  
  // Verification Form State
  const [referenceId, setReferenceId] = useState('');
  const [notes, setNotes] = useState('');
  const [amountReceived, setAmountReceived] = useState<number | ''>('');

  useEffect(() => {
    // We listen to contracts that are awaiting verification
    const q = query(
      collection(db, 'contracts'),
      where('status', '==', 'pending_approval'),
      where('paymentVerified', '==', false)
    );

    return onSnapshot(q, (snapshot: any) => {
      const fetched = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      } as Contract));
      setPendingContracts(fetched);
    });
  }, []);

  const openVerification = (contract: Contract) => {
    setSelectedContract(contract);
    setAmountReceived(contract.amount);
    setReferenceId('');
    setNotes('');
    setVerifyDialogOpen(true);
  };

  const handleVerify = async () => {
    if (!selectedContract) return;
    if (!referenceId) {
      alert(t('admin.ref_mandatory'));
      return;
    }

    setProcessingId(selectedContract.id);
    setVerifyDialogOpen(false);
    
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("UNAUTHENTICATED: No active administrative session.");

      const approveFn = httpsCallable(functions, 'adminApprovePayment');
      const response = await approveFn({
        paymentId: selectedContract.paymentId,
        paymentReferenceId: referenceId.trim(),
        amountReceived: Number(amountReceived) || selectedContract.amount,
        notes: notes.trim() || "Standard manual verification via Admin Hub.",
        method: selectedContract.provider,
        receivedAt: new Date().toISOString()
      });

      const result = response.data as any;
      if (result?.status === 'SUCCESS') {
        alert(t('admin.payment_settled'));
      } else {
        throw new Error(result?.message || t('admin.payment_rejected'));
      }
    } catch (error: any) {
      console.error("🚨 [ADMIN-AUTH] Verification Failure:", error);
      const errorMsg = error.message || t('admin.failed_verify_settlement');
      alert(errorMsg);
    } finally {
      setProcessingId(null);
      setSelectedContract(null);
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100vh', color: 'white', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 4 }}>
        <SecurityIcon sx={{ color: '#C6A75E', fontSize: 40 }} />
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: -1 }}>
            {t('admin.settlement_vault')}
          </Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 700 }}>
            {t('admin.payment_authority')}
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={4} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Grid item xs={12} lg={9}>
          <TableContainer component={Paper} sx={{ bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, overflow: 'hidden' }}>
            <Table>
              <TableHead sx={{ bgcolor: alpha('#C6A75E', 0.1) }}>
                <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                  <TableCell sx={{ color: '#C6A75E', fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('admin.intent_id')}</TableCell>
                  <TableCell sx={{ color: '#C6A75E', fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('admin.table.month')}</TableCell>
                  <TableCell align={isRTL ? 'left' : 'right'} sx={{ color: '#C6A75E', fontWeight: 900 }}>{t('admin.value')}</TableCell>
                  <TableCell sx={{ color: '#C6A75E', fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('dt.table.status')}</TableCell>
                  <TableCell align={isRTL ? 'left' : 'right'} sx={{ color: '#C6A75E', fontWeight: 900 }}>{t('common.action')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 10 }}>
                      <Stack alignItems="center" spacing={2}>
                        <Receipt size={48} color="#1e293b" />
                        <Typography variant="body2" sx={{ color: '#64748b', fontStyle: 'italic' }}>
                          {t('admin.queue_clear')}
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingContracts.map((contract: any) => (
                    <TableRow key={contract.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                      <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="body2" sx={{ fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>
                          {contract.paymentId}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          {t('onboarding.quote')}: {contract.id.slice(0, 8)}...
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Chip 
                          label={contract.provider} 
                          size="small" 
                          sx={{ 
                            bgcolor: alpha('#C6A75E', 0.1), 
                            color: '#C6A75E', 
                            fontWeight: 900, 
                            border: '1px solid #C6A75E' 
                          }} 
                        />
                      </TableCell>
                      <TableCell align={isRTL ? 'left' : 'right'}>
                        <Typography variant="body1" sx={{ color: '#10b981', fontWeight: 900 }}>
                          {t('common.currency_aed')} {contract.amount.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="body2" sx={{ color: '#cbd5e1', fontWeight: 700 }}>
                          {t('common.asset')}: {contract.ownerId.slice(0, 8)}...
                        </Typography>
                      </TableCell>
                      <TableCell align={isRTL ? 'left' : 'right'}>
                        <Button
                          variant="contained"
                          disabled={processingId === contract.id}
                          onClick={() => openVerification(contract)}
                          startIcon={processingId === contract.id ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
                          sx={{ 
                            bgcolor: '#C6A75E', 
                            color: '#000',
                            '&:hover': { bgcolor: '#b59410' },
                            fontWeight: 900,
                            borderRadius: 2
                          }}
                        >
                          {t('admin.verify_settlement')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        <Grid item xs={12} lg={3}>
           <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <History size={20} color="#C6A75E" /> {t('admin.settlement_policy')}
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                {t('admin.policy_1')}
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                {t('admin.policy_2')}
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                {t('admin.policy_3')}
              </Typography>
              <Box sx={{ mt: 4, p: 2, bgcolor: alpha('#ef4444', 0.1), border: '1px solid #ef4444', borderRadius: 2 }}>
                <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 900, display: 'block', textAlign: 'center' }}>
                  {t('admin.warning_audit')}
                </Typography>
              </Box>
           </Paper>
        </Grid>
      </Grid>

      {/* VERIFICATION DIALOG */}
      <Dialog 
        open={verifyDialogOpen} 
        onClose={() => !processingId && setVerifyDialogOpen(false)}
        dir={isRTL ? 'rtl' : 'ltr'}
        PaperProps={{
          sx: { bgcolor: '#0f172a', color: 'white', borderRadius: 4, border: '1px solid #1e293b', width: '100%', maxWidth: 500 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 900, borderBottom: '1px solid #1e293b', textAlign: isRTL ? 'right' : 'left' }}>
          {t('admin.confirm_settlement')}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={3}>
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900 }}>
                {t('admin.verif_ref_label')}
              </Typography>
              <TextField
                fullWidth
                required
                variant="outlined"
                value={referenceId}
                onChange={(e: any) => setReferenceId(e.target.value)}
                placeholder="e.g. UTN-123456789"
                sx={{ 
                  mt: 1,
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    bgcolor: '#020617',
                    '& fieldset': { borderColor: '#1e293b' },
                    '&:hover fieldset': { borderColor: '#C6A75E' },
                    '&.Mui-focused fieldset': { borderColor: '#C6A75E' },
                  }
                }}
              />
            </Box>

            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900 }}>
                {t('admin.confirmed_amount')}
              </Typography>
              <TextField
                fullWidth
                type="number"
                variant="outlined"
                value={amountReceived}
                onChange={(e: any) => setAmountReceived(Number(e.target.value))}
                sx={{ 
                  mt: 1,
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    bgcolor: '#020617',
                    '& fieldset': { borderColor: '#1e293b' },
                  }
                }}
              />
            </Box>

            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900 }}>
                {t('admin.audit_notes')}
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                variant="outlined"
                value={notes}
                onChange={(e: any) => setNotes(e.target.value)}
                placeholder={t('admin.internal_recon')}
                sx={{ 
                  mt: 1,
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    bgcolor: '#020617',
                    '& fieldset': { borderColor: '#1e293b' },
                  }
                }}
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid #1e293b', justifyContent: isRTL ? 'flex-start' : 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button onClick={() => setVerifyDialogOpen(false)} sx={{ color: '#64748b', fontWeight: 900 }}>{t('common.cancel')}</Button>
          <Button 
            onClick={handleVerify} 
            variant="contained" 
            sx={{ 
              bgcolor: '#10b981', 
              color: '#fff', 
              fontWeight: 900,
              '&:hover': { bgcolor: '#059669' }
            }}
          >
            {t('admin.confirm_activate')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
