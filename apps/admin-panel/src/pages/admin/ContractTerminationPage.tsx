// apps/admin-panel/src/pages/admin/ContractTerminationPage.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
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
import { AlertTriangle, CheckCircle2, FileText, Shield, XCircle } from 'lucide-react';
import AdminPageFrame from '../../components/AdminPageFrame';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, updateDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

type ContractRecord = {
  id: string;
  contractNumber?: string;
  contractType?: string;
  type?: string;
  ownerEmail?: string;
  ownerName?: string;
  propertyId?: string;
  propertyName?: string;
  status?: string;
  contractStatus?: string;
  paymentStatus?: string;
  totalValue?: number;
  contractValue?: number;
  annualValue?: number;
  startDate?: any;
  endDate?: any;
  createdAt?: any;
  updatedAt?: any;
};

type TerminationReason = 'OWNER_REQUEST' | 'NON_PAYMENT' | 'BREACH_OF_TERMS' | 'DUPLICATE_OR_ERROR' | 'ADMIN_CORRECTION' | 'OTHER';

const TERMINATION_REASONS: Array<{ value: TerminationReason; label: string }> = [
  { value: 'OWNER_REQUEST', label: 'Owner request' },
  { value: 'NON_PAYMENT', label: 'Non-payment' },
  { value: 'BREACH_OF_TERMS', label: 'Breach of terms' },
  { value: 'DUPLICATE_OR_ERROR', label: 'Duplicate or data error' },
  { value: 'ADMIN_CORRECTION', label: 'Admin correction' },
  { value: 'OTHER', label: 'Other' },
];

const normalizeStatus = (value: any) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();

const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const displayDate = (value: any) => {
  const millis = getMillis(value);
  return millis ? new Date(millis).toLocaleDateString('en-AE') : 'Not recorded';
};

const money = (value: any) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

const statusTone = (value: any) => {
  const status = normalizeStatus(value);
  if (status.includes('ACTIVE') || status.includes('SIGNED') || status.includes('APPROVED')) return '#10b981';
  if (status.includes('TERMINATED') || status.includes('CANCELLED') || status.includes('EXPIRED')) return '#ef4444';
  return '#f59e0b';
};

export default function ContractTerminationPage() {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContractRecord | null>(null);
  const [reason, setReason] = useState<TerminationReason>('OWNER_REQUEST');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'contracts'),
      (snapshot) => {
        const rows = snapshot.docs.map((item: any) => ({ id: item.id, ...(item.data() as Record<string, any>) })) as ContractRecord[];
        rows.sort((a, b) => getMillis(b.createdAt || b.updatedAt) - getMillis(a.createdAt || a.updatedAt));
        setContracts(rows);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setMessage({ type: 'error', text: 'Could not load contracts. Check Firestore permissions.' });
      }
    );
    return () => unsubscribe();
  }, []);

  const activeRows = useMemo(() => contracts.filter((row) => {
    const status = normalizeStatus(row.contractStatus || row.status);
    return !status.includes('TERMINATED') && !status.includes('CANCELLED') && !status.includes('EXPIRED');
  }), [contracts]);

  const terminatedRows = useMemo(() => contracts.filter((row) => normalizeStatus(row.contractStatus || row.status).includes('TERMINATED')), [contracts]);
  const annualValue = useMemo(() => activeRows.reduce((sum, row) => sum + Number(row.totalValue || row.contractValue || row.annualValue || 0), 0), [activeRows]);

  const openTermination = (row: ContractRecord) => {
    setSelected(row);
    setReason('OWNER_REQUEST');
    setNote('');
  };

  const closeTermination = () => {
    if (saving) return;
    setSelected(null);
    setNote('');
  };

  const terminateContract = async () => {
    if (!selected || !note.trim()) {
      setMessage({ type: 'error', text: 'Termination note is required for audit evidence.' });
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'contracts', selected.id), {
        status: 'TERMINATED',
        contractStatus: 'TERMINATED',
        terminationReason: reason,
        terminationNote: note.trim(),
        terminatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'auditLogs'), {
        action: 'CONTRACT_TERMINATED',
        entityType: 'contract',
        entityId: selected.id,
        contractNumber: selected.contractNumber || selected.id,
        ownerEmail: selected.ownerEmail || '',
        propertyId: selected.propertyId || '',
        reason,
        note: note.trim(),
        createdAt: serverTimestamp(),
        source: 'admin_contract_termination',
      });
      setMessage({ type: 'success', text: 'Contract terminated and audit log recorded.' });
      closeTermination();
    } catch {
      setMessage({ type: 'error', text: 'Failed to terminate contract.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageFrame title="Contract Termination Control" subtitle="ADMIN CONTRACT ELIMINATION · AUDITED TERMINATION" lastUpdated={new Date()} onRefresh={() => window.location.reload()}>
      <Stack spacing={3} sx={{ pb: 8 }}>
        {message && <Alert severity={message.type}>{message.text}</Alert>}

        <Grid container spacing={2}>
          <SummaryCard label="Active Contracts" value={activeRows.length} icon={<CheckCircle2 size={20} />} tone="#10b981" />
          <SummaryCard label="Terminated" value={terminatedRows.length} icon={<XCircle size={20} />} tone="#ef4444" />
          <SummaryCard label="Open Value" value={money(annualValue)} icon={<Shield size={20} />} tone={binThemeTokens.gold} />
          <SummaryCard label="Total Contracts" value={contracts.length} icon={<FileText size={20} />} tone="#3b82f6" />
        </Grid>

        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
          <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center' }}>
              <AlertTriangle color={binThemeTokens.gold} /> Active Contract Register
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mt: 0.5 }}>
              Termination requires a reason and audit note. Records are not deleted; they are marked terminated.
            </Typography>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Contract</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Property</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeRows.map((row) => {
                  const status = row.contractStatus || row.status || 'ACTIVE';
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Typography sx={{ color: '#fff', fontWeight: 900 }}>{row.contractNumber || row.id}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)' }}>{row.contractType || row.type || 'Contract'}</Typography>
                      </TableCell>
                      <TableCell>{row.ownerName || row.ownerEmail || 'Not linked'}</TableCell>
                      <TableCell>{row.propertyName || row.propertyId || 'Not linked'}</TableCell>
                      <TableCell>{money(row.totalValue || row.contractValue || row.annualValue)}</TableCell>
                      <TableCell>{displayDate(row.startDate)} → {displayDate(row.endDate)}</TableCell>
                      <TableCell><Chip size="small" label={normalizeStatus(status)} sx={{ color: statusTone(status), bgcolor: alpha(statusTone(status), 0.12), fontWeight: 900 }} /></TableCell>
                      <TableCell align="right">
                        <Button size="small" color="error" variant="outlined" onClick={() => openTermination(row)}>Terminate</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && activeRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'rgba(255,255,255,0.42)' }}>
                      No active contracts found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>

      <Dialog open={Boolean(selected)} onClose={closeTermination} fullWidth maxWidth="sm">
        <DialogTitle>Terminate Contract</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {selected?.contractNumber || selected?.id} · {selected?.propertyName || selected?.propertyId || 'No property'}
          </Typography>
          <Stack spacing={2}>
            <TextField select fullWidth label="Termination reason" value={reason} onChange={(event) => setReason(event.target.value as TerminationReason)}>
              {TERMINATION_REASONS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
            <TextField
              fullWidth
              required
              multiline
              minRows={4}
              label="Termination audit note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Record owner request, breach details, payment issue, duplicate contract, or admin correction evidence."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTermination} disabled={saving}>Cancel</Button>
          <Button onClick={terminateContract} disabled={saving} color="error" variant="contained">Terminate Contract</Button>
        </DialogActions>
      </Dialog>
    </AdminPageFrame>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number | string; icon: React.ReactNode; tone: string }) {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Paper sx={{ p: 2.5, bgcolor: '#0f172a', border: `1px solid ${alpha(tone, 0.25)}`, borderRadius: 4 }}>
        <Box sx={{ color: tone, mb: 1 }}>{icon}</Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 900 }}>{label.toUpperCase()}</Typography>
        <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>{value}</Typography>
      </Paper>
    </Grid>
  );
}
