import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider, Grid, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, alpha } from '@mui/material';
import { Eye, FileText, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { collection, db, limit, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type ProofRow = { id: string; [key: string]: any };
const n = (value: unknown) => Number(value || 0);
const money = (value: unknown) => `AED ${n(value).toLocaleString()}`;
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  if (value?._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatDate = (value: any) => {
  const millis = getMillis(value);
  return millis ? new Date(millis).toLocaleString() : 'Pending timestamp';
};
const statusTone = (status: any) => {
  const value = String(status || '').toUpperCase();
  if (['VERIFIED', 'APPROVED', 'COMPLETED', 'PAID'].some((word) => value.includes(word))) return '#10b981';
  if (['REJECTED', 'FAILED', 'DISPUTED'].some((word) => value.includes(word))) return '#ef4444';
  return '#f59e0b';
};
const proofUrl = (proof: ProofRow) => proof.proofUrl || proof.receiptUrl || proof.attachmentUrl || proof.fileUrl || proof.paymentProofUrl || proof.proof?.url || proof.receipt?.url || '';

export default function OwnerPaymentProofReviewPanel() {
  const { user } = useRole();
  const [searchParams] = useSearchParams();
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [warning, setWarning] = useState('');
  const [selected, setSelected] = useState<ProofRow | null>(null);

  useEffect(() => {
    if (!user?.email && !user?.uid) return;
    const buckets: Record<string, ProofRow[]> = {};
    const publish = () => {
      const map = new Map<string, ProofRow>();
      Object.values(buckets).flat().forEach((row) => row?.id && map.set(row.id, row));
      setProofs(Array.from(map.values()).sort((a, b) => getMillis(b.submittedAt || b.createdAt || b.updatedAt) - getMillis(a.submittedAt || a.createdAt || a.updatedAt)));
    };
    const unsubs: Array<() => void> = [];
    const email = normalizeEmail(user?.email);
    if (email) {
      unsubs.push(onSnapshot(query(collection(db, 'payment_transactions'), where('ownerEmail', '==', email), limit(30)), (snap) => {
        buckets.ownerEmail = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        publish();
      }, (err) => {
        console.warn('[OwnerPaymentProofReviewPanel] ownerEmail listener failed:', err);
        setWarning('Payment proof records could not fully load. Check access rules if proof is missing.');
      }));
    }
    if (user?.uid) {
      unsubs.push(onSnapshot(query(collection(db, 'payment_transactions'), where('ownerId', '==', user.uid), limit(30)), (snap) => {
        buckets.ownerId = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        publish();
      }, (err) => {
        console.warn('[OwnerPaymentProofReviewPanel] ownerId listener failed:', err);
      }));
    }
    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.email, user?.uid]);

  const filteredProofs = useMemo(() => {
    const propertyId = searchParams.get('propertyId');
    if (!propertyId) return proofs;
    return proofs.filter((proof) => [proof.propertyId, proof.propertyRef, proof.passportId].map(String).includes(String(propertyId)));
  }, [proofs, searchParams]);

  return (
    <Paper sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden', mb: 4 }}>
      <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FileText size={18} color={binThemeTokens.gold} /> PAYMENT PROOF REVIEW
        </Typography>
        <Chip label={`${filteredProofs.length} RECORDS`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
      </Box>
      {warning && <Alert severity="warning" sx={{ m: 2 }}>{warning}</Alert>}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
              <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>SUBMITTED / ID</TableCell>
              <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>PAYER / PROPERTY</TableCell>
              <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>AMOUNT</TableCell>
              <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>STATUS</TableCell>
              <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>DETAIL</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredProofs.map((proof) => {
              const status = String(proof.status || (proof.paymentVerified ? 'VERIFIED' : 'PENDING')).replace(/_/g, ' ').toUpperCase();
              const tone = statusTone(status);
              return (
                <TableRow key={proof.id} hover>
                  <TableCell><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{formatDate(proof.submittedAt || proof.createdAt)}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>#{proof.id.slice(0, 8)}</Typography></TableCell>
                  <TableCell><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.78)', fontWeight: 800 }}>{proof.payerName || proof.tenantName || proof.ownerEmail || proof.payerEmail || 'Payer pending'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>{proof.propertyName || proof.propertyId || proof.contractId || 'Property / contract not linked'}</Typography></TableCell>
                  <TableCell><Typography variant="body2" sx={{ color: '#10b981', fontWeight: 950 }}>{money(proof.amount || proof.paidAmount || proof.total)}</Typography></TableCell>
                  <TableCell><Chip label={status} size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(tone, 0.12), color: tone }} /></TableCell>
                  <TableCell align="right"><Button size="small" startIcon={<Eye size={14} />} onClick={() => setSelected(proof)} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>View Details</Button></TableCell>
                </TableRow>
              );
            })}
            {filteredProofs.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>NO PAYMENT PROOF RECORDS FOUND</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#0f172a', color: '#fff', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`, borderRadius: 4 } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 950 }}>Payment Proof Detail<IconButton onClick={() => setSelected(null)} sx={{ color: '#fff' }}><X size={18} /></IconButton></DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {selected && <Stack spacing={2.2}>
            <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>STATUS</Typography><Chip label={String(selected.status || (selected.paymentVerified ? 'VERIFIED' : 'PENDING')).replace(/_/g, ' ').toUpperCase()} sx={{ ml: 1, bgcolor: alpha(statusTone(selected.status || (selected.paymentVerified ? 'VERIFIED' : 'PENDING')), 0.12), color: statusTone(selected.status || (selected.paymentVerified ? 'VERIFIED' : 'PENDING')), fontWeight: 950 }} /></Box>
            <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>AMOUNT</Typography><Typography variant="h5" sx={{ color: '#10b981', fontWeight: 950 }}>{money(selected.amount || selected.paidAmount || selected.total)}</Typography></Box>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>PAYER</Typography><Typography sx={{ fontWeight: 800 }}>{selected.payerName || selected.tenantName || selected.payerEmail || selected.ownerEmail || 'Payer pending'}</Typography></Grid>
              <Grid item xs={12} sm={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>PROPERTY / CONTRACT</Typography><Typography sx={{ fontWeight: 800 }}>{selected.propertyName || selected.propertyId || selected.contractId || 'Not linked'}</Typography></Grid>
              <Grid item xs={12} sm={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>METHOD</Typography><Typography sx={{ fontWeight: 800 }}>{selected.paymentMethod || selected.method || 'Manual proof'}</Typography></Grid>
              <Grid item xs={12} sm={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>SUBMITTED</Typography><Typography sx={{ fontWeight: 800 }}>{formatDate(selected.submittedAt || selected.createdAt)}</Typography></Grid>
            </Grid>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)' }}>{selected.notes || selected.description || selected.memo || 'No memo was submitted with this proof.'}</Typography>
            {proofUrl(selected) ? <Button variant="contained" onClick={() => window.open(proofUrl(selected), '_blank', 'noopener,noreferrer')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Open Uploaded Proof</Button> : <Alert severity="warning">No uploaded proof file URL is attached to this record.</Alert>}
          </Stack>}
        </DialogContent>
      </Dialog>
    </Paper>
  );
}
