import React, { useState, useEffect } from 'react';
import { db, functions } from '../lib/firebase';
import { 
  collection, query, where, onSnapshot 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Button, Chip, CircularProgress,
  TextField, Stack, Dialog, DialogTitle, DialogContent, DialogActions,
  alpha, Grid
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Receipt, History } from 'lucide-react';

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
      where('status', '==', 'PENDING_APPROVAL'),
      where('paymentVerified', '==', false)
    );

    return onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
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
      alert("Reference ID is mandatory for sovereign audit.");
      return;
    }

    setProcessingId(selectedContract.id);
    setVerifyDialogOpen(false);
    
    try {
      const adminVerifyFunc = httpsCallable(functions, 'adminVerifyPayment');
      const result = await adminVerifyFunc({
        contractId: selectedContract.id,
        paymentId: selectedContract.paymentId,
        method: selectedContract.provider,
        referenceId,
        amountReceived: amountReceived || selectedContract.amount,
        notes: notes || "Standard manual verification via Admin Hub.",
        receivedAt: new Date().toISOString()
      });

      console.log("Verification Success:", result);
      alert("Payment Settled. Contract activated for property onboarding.");
    } catch (error: any) {
      console.error("Verification failed:", error);
      alert(`Settlement Error: ${error.message}`);
    } finally {
      setProcessingId(null);
      setSelectedContract(null);
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100vh', color: 'white' }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
        <SecurityIcon sx={{ color: '#C6A75E', fontSize: 40 }} />
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: -1 }}>
            SOVEREIGN SETTLEMENT VAULT
          </Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 700 }}>
            BIN-GROUP Institutional Payment Verification Authority
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={4}>
        <Grid item xs={12} lg={9}>
          <TableContainer component={Paper} sx={{ bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, overflow: 'hidden' }}>
            <Table>
              <TableHead sx={{ bgcolor: alpha('#C6A75E', 0.1) }}>
                <TableRow>
                  <TableCell sx={{ color: '#C6A75E', fontWeight: 900 }}>INTENT ID</TableCell>
                  <TableCell sx={{ color: '#C6A75E', fontWeight: 900 }}>METHOD</TableCell>
                  <TableCell align="right" sx={{ color: '#C6A75E', fontWeight: 900 }}>VALUE</TableCell>
                  <TableCell sx={{ color: '#C6A75E', fontWeight: 900 }}>ENTITY</TableCell>
                  <TableCell align="right" sx={{ color: '#C6A75E', fontWeight: 900 }}>ACTION</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 10 }}>
                      <Stack alignItems="center" spacing={2}>
                        <Receipt size={48} color="#1e293b" />
                        <Typography variant="body2" sx={{ color: '#64748b', fontStyle: 'italic' }}>
                          Settlement queue is clear. All sovereign funds are matched.
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingContracts.map((contract) => (
                    <TableRow key={contract.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>
                          {contract.paymentId}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          Contract: {contract.id.slice(0, 8)}...
                        </Typography>
                      </TableCell>
                      <TableCell>
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
                      <TableCell align="right">
                        <Typography variant="body1" sx={{ color: '#10b981', fontWeight: 900 }}>
                          {contract.currency} {contract.amount.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#cbd5e1', fontWeight: 700 }}>
                          Owner: {contract.ownerId.slice(0, 8)}...
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
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
                          Verify Settlement
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
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <History size={20} color="#C6A75E" /> SETTLEMENT POLICY
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2 }}>
                1. Reference ID must match bank/cheque record.
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2 }}>
                2. Reconciliation is permanent and irreversible once submitted.
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2 }}>
                3. Activation triggers immediate property onboarding emails.
              </Typography>
              <Box sx={{ mt: 4, p: 2, bgcolor: alpha('#ef4444', 0.1), border: '1px solid #ef4444', borderRadius: 2 }}>
                <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 900 }}>
                  WARNING: AUDIT LOGS ACTIVE
                </Typography>
              </Box>
           </Paper>
        </Grid>
      </Grid>

      {/* VERIFICATION DIALOG */}
      <Dialog 
        open={verifyDialogOpen} 
        onClose={() => !processingId && setVerifyDialogOpen(false)}
        PaperProps={{
          sx: { bgcolor: '#0f172a', color: 'white', borderRadius: 4, border: '1px solid #1e293b', width: '100%', maxWidth: 500 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 900, borderBottom: '1px solid #1e293b' }}>
          CONFIRM SETTLEMENT
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900 }}>
                Verification Reference (UTN / Cheque #)
              </Typography>
              <TextField
                fullWidth
                required
                variant="outlined"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
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

            <Box>
              <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900 }}>
                Confirmed Amount Received (AED)
              </Typography>
              <TextField
                fullWidth
                type="number"
                variant="outlined"
                value={amountReceived}
                onChange={(e) => setAmountReceived(Number(e.target.value))}
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

            <Box>
              <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900 }}>
                Audit Notes
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                variant="outlined"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal reconciliation details..."
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
        <DialogActions sx={{ p: 3, borderTop: '1px solid #1e293b' }}>
          <Button onClick={() => setVerifyDialogOpen(false)} sx={{ color: '#64748b', fontWeight: 900 }}>CANCEL</Button>
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
            CONFIRM & ACTIVATE
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
