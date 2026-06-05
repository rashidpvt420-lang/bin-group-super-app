import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { CheckCircle, Clock, FileText, UnlockKeyhole } from 'lucide-react';
import { collection, db, functions, httpsCallable, onSnapshot, query, where } from '@/lib/firebase';
import { binThemeTokens } from '../theme/adminTheme';
import AdminPageFrame from './AdminPageFrame';

type ContractActivation = {
  id: string;
  ownerEmail?: string;
  ownerId?: string;
  ownerUid?: string;
  propertyName?: string;
  contractType?: string;
  status?: string;
  paymentStatus?: string;
  paymentVerified?: boolean;
  mobilizationAmount?: number;
  amount?: number;
  annualValue?: number;
  activationRequestedAt?: any;
};

const money = (value: number) => `AED ${Math.round(Number(value || 0)).toLocaleString()}`;
const norm = (value: unknown) => String(value || '').toUpperCase();

function mergeUnique(groups: Record<string, ContractActivation[]>) {
  const map = new Map<string, ContractActivation>();
  Object.values(groups).flat().forEach((item) => map.set(item.id, item));
  return Array.from(map.values()).filter((item) => {
    if (item.paymentVerified) return false;
    const status = norm(item.status);
    const paymentStatus = norm(item.paymentStatus);
    return status === 'PENDING_ADMIN_PAYMENT_VERIFICATION' || status === 'PENDING_APPROVAL' || paymentStatus === 'PENDING_VERIFICATION';
  });
}

export default function AdminContractActivationApproval() {
  const [items, setItems] = useState<ContractActivation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContractActivation | null>(null);
  const [referenceId, setReferenceId] = useState('');
  const [amountReceived, setAmountReceived] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const groups: Record<string, ContractActivation[]> = {};
    const update = () => {
      setItems(mergeUnique(groups));
      setLoading(false);
    };

    const unsubs = [
      onSnapshot(query(collection(db, 'contracts'), where('paymentStatus', '==', 'PENDING_VERIFICATION')), (snap) => {
        groups.pendingPayment = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContractActivation));
        update();
      }, (err) => { setError(err.message); setLoading(false); }),
      onSnapshot(query(collection(db, 'contracts'), where('status', '==', 'PENDING_ADMIN_PAYMENT_VERIFICATION')), (snap) => {
        groups.pendingActivation = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContractActivation));
        update();
      }, (err) => { setError(err.message); setLoading(false); }),
      onSnapshot(query(collection(db, 'contracts'), where('status', '==', 'pending_approval')), (snap) => {
        groups.legacy = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContractActivation));
        update();
      }, (err) => { setError(err.message); setLoading(false); }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  const selectedAmount = useMemo(() => {
    return Number(selected?.mobilizationAmount || selected?.amount || selected?.annualValue || 0);
  }, [selected]);

  const openDialog = (item: ContractActivation) => {
    setSelected(item);
    setReferenceId('');
    setNotes('');
    setAmountReceived(Number(item.mobilizationAmount || item.amount || 0));
    setError(null);
    setSuccess(null);
  };

  const approve = async () => {
    if (!selected) return;
    if (!referenceId.trim()) {
      setError('Bank reference / transaction ID is required.');
      return;
    }

    setProcessingId(selected.id);
    setError(null);
    setSuccess(null);
    try {
      const fn = httpsCallable(functions, 'adminApproveContractActivation');
      await fn({
        contractId: selected.id,
        paymentReferenceId: referenceId.trim(),
        amountReceived: Number(amountReceived || selectedAmount || 0),
        notes: notes.trim(),
      });
      setSuccess(`Owner dashboard unlocked for contract ${selected.id.slice(0, 8).toUpperCase()}.`);
      setSelected(null);
    } catch (err: any) {
      setError(err.message || 'Approval failed.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <AdminPageFrame
      title="OWNER ACTIVATION PAYMENTS"
      subtitle="Verify 15% mobilization payments and unlock owner dashboards"
      loading={loading}
      isEmpty={items.length === 0}
      emptyMessage="ALL ACTIVATION PAYMENT QUEUES CLEARED"
      breadcrumbs={[{ label: 'Owner Activation Payments' }]}
    >
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>CONTRACT</TableCell>
                    <TableCell>OWNER / PROPERTY</TableCell>
                    <TableCell>AMOUNT</TableCell>
                    <TableCell>STATUS</TableCell>
                    <TableCell align="right">ACTION</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item) => {
                    const amount = Number(item.mobilizationAmount || item.amount || item.annualValue || 0);
                    return (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Stack spacing={0.5}>
                            <Typography variant="body2" fontWeight="900" sx={{ fontFamily: 'monospace' }}>{item.id.slice(0, 12)}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                              REQUESTED: {item.activationRequestedAt?.toDate ? item.activationRequestedAt.toDate().toLocaleString() : 'N/A'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.5}>
                            <Typography variant="body2" fontWeight="700">{item.propertyName || 'ASSET NODE'}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>{item.ownerEmail || item.ownerId || item.ownerUid || 'OWNER'}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body1" fontWeight="950" sx={{ color: '#10b981' }}>{money(amount)}</Typography>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>{item.mobilizationAmount ? '15% mobilization' : 'activation amount'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip icon={<Clock size={13} />} label={item.paymentStatus || item.status || 'PENDING'} size="small" sx={{ bgcolor: alpha('#f59e0b', 0.12), color: '#f59e0b', fontWeight: 900, fontSize: '0.6rem' }} />
                            <Chip icon={<FileText size={13} />} label={String(item.contractType || 'CONTRACT').toUpperCase()} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.6rem' }} />
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          <Button variant="contained" onClick={() => openDialog(item)} disabled={processingId === item.id} startIcon={processingId === item.id ? <CircularProgress size={16} color="inherit" /> : <UnlockKeyhole size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.65rem' }}>
                            VERIFY & UNLOCK
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Stack>

      <Dialog open={!!selected} onClose={() => setSelected(null)} PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' } }}>
        <DialogTitle sx={{ fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>CONFIRM PAYMENT AND UNLOCK OWNER</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Alert severity="warning" sx={{ bgcolor: alpha('#f59e0b', 0.08), color: '#f8fafc', border: `1px solid ${alpha('#f59e0b', 0.25)}` }}>
              This action unlocks the owner dashboard and activates the selected contract.
            </Alert>
            <TextField label="BANK REFERENCE / TX ID" fullWidth value={referenceId} onChange={(event) => setReferenceId(event.target.value)} />
            <TextField label={t('common.confirmed_amount_aed').toUpperCase()} type="number" fullWidth value={amountReceived || selectedAmount} onChange={(event) => setAmountReceived(Number(event.target.value))} />
            <TextField label="INTERNAL AUDIT NOTES" multiline rows={3} fullWidth value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSelected(null)} sx={{ fontWeight: 900, color: 'rgba(255,255,255,0.4)' }}>CANCEL</Button>
          <Button variant="contained" onClick={approve} startIcon={<CheckCircle size={16} />} sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950, borderRadius: 100, px: 4 }}>CONFIRM & UNLOCK</Button>
        </DialogActions>
      </Dialog>
    </AdminPageFrame>
  );
}
