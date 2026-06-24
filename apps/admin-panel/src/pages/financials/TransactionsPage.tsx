// admin-panel/src/pages/financials/TransactionsPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Card,
  CardContent,
  Grid,
  Tabs,
  Tab,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import { db, collection, onSnapshot, query, orderBy, limit, doc, updateDoc, addDoc, serverTimestamp } from '../../lib/firebase';
import { ArrowUpCircle, ArrowDownCircle, Activity, Ban } from 'lucide-react';
import { useLanguage } from '@bin/shared';

interface Transaction {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  category: string;
  description: string;
  status: string;
  createdAt: any;
}

export default function TransactionsPage() {
  const { t, lang, isRTL } = useLanguage();
  const [tabIndex, setTabIndex] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);

  // Termination modal states
  const [selectedContract, setSelectedContract] = useState<any | null>(null);
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
  const [terminationReason, setTerminationReason] = useState('');
  const [settlementAmount, setSettlementAmount] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    });

    const contractsQ = query(collection(db, 'contracts'));
    const unsubContracts = onSnapshot(contractsQ, (snap) => {
      setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubscribe();
      unsubContracts();
    };
  }, []);

  const income = transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const expenses = transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const formatAED = (val?: number | null) => {
    const safeVal = typeof val === 'number' && !isNaN(val) ? val : 0;
    return safeVal.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE');
  };

  const handleTerminateContract = async () => {
    if (!selectedContract) return;
    try {
      const contractRef = doc(db, 'contracts', selectedContract.id);
      
      const updateData = {
        status: 'TERMINATED',
        terminationDate: serverTimestamp(),
        terminationReason: terminationReason,
        settlementAmount: parseFloat(settlementAmount) || 0
      };

      await updateDoc(contractRef, updateData);

      // Post-termination: archive to archived_contracts
      await addDoc(collection(db, 'archived_contracts'), {
        ...selectedContract,
        ...updateData,
        archivedAt: serverTimestamp()
      });

      // Write audit log
      await addDoc(collection(db, 'audit_logs'), {
        action: 'CONTRACT_TERMINATED',
        contractId: selectedContract.id,
        actorId: 'admin',
        actorRole: 'admin',
        timestamp: serverTimestamp(),
        reason: terminationReason,
        settlementAmount: parseFloat(settlementAmount) || 0
      });

      setTerminateDialogOpen(false);
      setSelectedContract(null);
      setTerminationReason('');
      setSettlementAmount('');
      alert('Contract terminated and archived successfully');
    } catch (error: any) {
      console.error('Failed to terminate contract:', error);
      alert('Failed to terminate contract: ' + error.message);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          {t('nav.admin')} <Box component="span" sx={{ color: '#10b981' }}>{t('fin.ledger')}</Box>
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabIndex} onChange={(e, val) => setTabIndex(val)} textColor="inherit" indicatorColor="primary">
          <Tab label="Ledger Transactions" />
          <Tab label="Lease Contracts & Terminations" />
        </Tabs>
      </Box>

      {tabIndex === 0 ? (
        <>
          <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <Grid item xs={12} md={4}>
              <Card sx={{ borderRadius: 4, borderLeft: isRTL ? 'none' : '6px solid #10b981', borderRight: isRTL ? '6px solid #10b981' : 'none' }}>
                <CardContent sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Typography variant="overline" sx={{ fontWeight: 'bold' }}>{t('fin.total_income')}</Typography>
                    <ArrowUpCircle color="#10b981" size={20} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 900, color: '#10b981' }}>{t('common.currency_aed')} {formatAED(income)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ borderRadius: 4, borderLeft: isRTL ? 'none' : '6px solid #ef4444', borderRight: isRTL ? '6px solid #ef4444' : 'none' }}>
                <CardContent sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Typography variant="overline" sx={{ fontWeight: 'bold' }}>{t('fin.total_expenses')}</Typography>
                    <ArrowDownCircle color="#ef4444" size={20} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 900, color: '#ef4444' }}>{t('common.currency_aed')} {formatAED(expenses)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ borderRadius: 4, bgcolor: '#1e293b', color: '#fff' }}>
                <CardContent sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Typography variant="overline" sx={{ fontWeight: 'bold', opacity: 0.8 }}>{t('fin.net_position')}</Typography>
                    <Activity color="#fff" size={20} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>{t('common.currency_aed')} {formatAED(income - expenses)}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4 }}>
            <Table>
              <TableHead sx={{ backgroundColor: '#f8fafc' }}>
                <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.table.date')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.table.description')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.table.category')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.table.amount')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.table.type')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id} hover sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{tx.createdAt?.toDate?.()?.toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE') || t('status.pending')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{tx.description}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}><Chip label={(tx.category || 'N/A').toUpperCase()} size="small" variant="outlined" sx={{ fontSize: 10, fontWeight: 'bold' }} /></TableCell>
                    <TableCell sx={{ fontWeight: 900, color: tx.type === 'credit' ? '#10b981' : '#ef4444', textAlign: isRTL ? 'right' : 'left' }}>
                      {tx.type === 'credit' ? '+' : '-'} {formatAED(tx.amount)}
                    </TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Chip 
                        label={tx.type === 'credit' ? t('status.settled') : t('status.pending')} 
                        color={tx.type === 'credit' ? 'success' : 'error'} 
                        size="small" 
                        sx={{ fontWeight: 'bold', fontSize: 10 }} 
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4 }}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>Property / Unit</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>Owner Email</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>Annual Value</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>Start Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>Status</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">No lease contracts found</TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => {
                  const annualVal = contract.annualContractValue || contract.quote?.annualTotal || contract.billingSummary?.annualContractValue || 0;
                  const startD = contract.effectiveFrom || contract.startDate || contract.createdAt;
                  const startDStr = startD?.toDate ? startD.toDate().toLocaleDateString() : (startD ? new Date(startD).toLocaleDateString() : '—');
                  
                  return (
                    <TableRow key={contract.id} hover>
                      <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 'bold' }}>
                        {contract.propertyName || contract.propertyId || '—'}
                      </TableCell>
                      <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{contract.ownerEmail || '—'}</TableCell>
                      <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 900 }}>
                        AED {formatAED(annualVal)}
                      </TableCell>
                      <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{startDStr}</TableCell>
                      <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Chip 
                          label={contract.status || 'ACTIVE'} 
                          color={contract.status === 'TERMINATED' ? 'error' : (contract.status === 'ACTIVE' ? 'success' : 'warning')} 
                          size="small" 
                        />
                      </TableCell>
                      <TableCell align="center">
                        {contract.status !== 'TERMINATED' && (
                          <Button
                            size="small"
                            variant="contained"
                            color="error"
                            startIcon={<Ban size={14} />}
                            onClick={() => {
                              setSelectedContract(contract);
                              setTerminateDialogOpen(true);
                            }}
                          >
                            Terminate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Termination Modal */}
      <Dialog 
        open={terminateDialogOpen} 
        onClose={() => setTerminateDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>Terminate & Settle Lease Contract</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to terminate the contract for <strong>{selectedContract?.propertyName || selectedContract?.propertyId}</strong>? 
            This action will mark the contract status as <strong>TERMINATED</strong>, archive it, and notify the owner.
          </Typography>
          
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Termination Settlement Amount (AED)"
              type="number"
              value={settlementAmount}
              onChange={(e) => setSettlementAmount(e.target.value)}
              placeholder="e.g. 5000"
            />
            <TextField
              fullWidth
              required
              label="Termination Reason"
              multiline
              rows={3}
              value={terminationReason}
              onChange={(e) => setTerminationReason(e.target.value)}
              placeholder="Please provide the detailed reason for termination..."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setTerminateDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleTerminateContract} 
            variant="contained" 
            color="error" 
            disabled={!terminationReason.trim()}
          >
            Confirm Termination
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
