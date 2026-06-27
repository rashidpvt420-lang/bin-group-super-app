import React from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, updateDoc } from '../../lib/firebase';

const reviewStates = ['PENDING', 'PENDING REVIEW', 'ADMIN REVIEW', 'SUBMITTED', 'DRAFT', 'UNKNOWN', 'REQUESTED MORE DOCUMENTS'];
const normalize = (value: unknown) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
const toMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: any) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
const readAnnual = (row: any) => Number(row.annualContractValue || row.contractValue || row.quoteAmount || row.systemCalculatedValue || row.pricing?.annualContractValue || row.pricing?.totalValue || 0);
const readDeposit = (row: any) => Number(row.depositAmount || row.mobilizationAmount || (readAnnual(row) ? Math.round(readAnnual(row) * 0.15) : 0));

export default function AdminPropertyApprovalsResolvedPage() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [note, setNote] = React.useState('');
  const [manualAnnual, setManualAnnual] = React.useState('');
  const [manualReason, setManualReason] = React.useState('');
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const nextRows = snapshot.docs.map((item: any) => ({ id: item.id, ...(item.data() || {}) }));
      nextRows.sort((a, b) => toMillis(b.createdAt || b.updatedAt) - toMillis(a.createdAt || a.updatedAt));
      setRows(nextRows);
      setLoading(false);
    }, () => {
      setMessage('Could not load properties. Check admin Firestore access.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const pending = rows.filter((row) => reviewStates.some((state) => normalize(row.approvalStatus || row.status || row.onboardingStatus).includes(state)));

  const writeAudit = async (row: any, action: string, status: string, extra: Record<string, any>) => {
    const payload = {
      actorRole: 'admin',
      action,
      entityType: 'property',
      entityId: row.id,
      targetType: 'property',
      targetId: row.id,
      propertyName: row.propertyName || row.name || row.title || row.id,
      ownerEmail: row.ownerEmail || '',
      note: note.trim(),
      status,
      source: 'admin_property_approvals_resolved',
      metadata: {
        ownerId: row.ownerId || row.ownerUid || '',
        previousStatus: row.status || row.approvalStatus || row.onboardingStatus || '',
        annualContractValue: readAnnual(row),
        depositAmount: readDeposit(row),
        ...extra,
      },
      createdAt: serverTimestamp(),
    };
    await Promise.all([
      addDoc(collection(db, 'audit_logs'), payload),
      addDoc(collection(db, 'auditLogs'), { ...payload, timestamp: serverTimestamp() }),
    ]);
  };

  const decide = async (row: any, decision: 'APPROVED' | 'REQUEST_MORE_DOCUMENTS' | 'REJECTED') => {
    if (decision !== 'APPROVED' && note.trim().length < 8) {
      setMessage('Write a clear admin note before requesting documents or closing review.');
      return;
    }
    const manualValue = Number(String(manualAnnual || '').replace(/[^0-9.]/g, '') || 0);
    if (manualValue > 0 && manualReason.trim().length < 8) {
      setMessage('Write a clear reason before changing contract value.');
      return;
    }

    const patch: Record<string, any> = {
      adminReviewNote: note.trim(),
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (manualValue > 0) {
      patch.annualContractValue = manualValue;
      patch.systemCalculatedValue = readAnnual(row);
      patch.contractValueManualReview = true;
      patch.contractValueManualReason = manualReason.trim();
      patch.mobilizationAmount = Math.round(manualValue * 0.15);
      patch.depositAmount = Math.round(manualValue * 0.15);
    }
    if (decision === 'APPROVED') {
      patch.approvalStatus = 'APPROVED';
      patch.status = 'ACTIVE';
    }
    if (decision === 'REQUEST_MORE_DOCUMENTS') {
      patch.approvalStatus = 'REQUESTED_MORE_DOCUMENTS';
      patch.status = 'PENDING_DOCUMENTS';
      patch.documentRequestNote = note.trim();
    }
    if (decision === 'REJECTED') {
      patch.approvalStatus = 'REJECTED';
      patch.status = 'REJECTED';
    }

    await updateDoc(doc(db, 'properties', row.id), patch);
    await writeAudit(row, `PROPERTY_${decision}`, patch.status, { decision, manualValue: manualValue || null, manualReason: manualReason.trim() });
    setNote('');
    setManualAnnual('');
    setManualReason('');
    setMessage(decision === 'APPROVED' ? 'Property approved and audit logged.' : decision === 'REQUEST_MORE_DOCUMENTS' ? 'Document request saved and audit logged.' : 'Property review closed and audit logged.');
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100%', color: '#fff' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight="950">Property Review Command</Typography>
          <Typography color="rgba(255,255,255,0.6)">Approve properties, request missing documents, and review contract value before activation.</Typography>
        </Box>
        {message && <Alert severity={message.includes('Could not') || message.includes('Write') ? 'warning' : 'success'}>{message}</Alert>}
        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>Pending review</Typography>
              <Typography variant="h5" color="#fff" fontWeight="950">{pending.length}</Typography>
            </Box>
            <TextField size="small" label="Admin note / document request" value={note} onChange={(event) => setNote(event.target.value)} sx={{ minWidth: 320 }} />
            <TextField size="small" label="Manual annual value" value={manualAnnual} onChange={(event) => setManualAnnual(event.target.value)} sx={{ minWidth: 210 }} />
            <TextField size="small" label="Manual value reason" value={manualReason} onChange={(event) => setManualReason(event.target.value)} sx={{ minWidth: 260 }} />
          </Stack>
        </Paper>
        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Property</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Annual Value</TableCell>
                <TableCell>15% Deposit</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pending.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.propertyName || row.name || row.title || row.id}</TableCell>
                  <TableCell>{row.ownerName || row.ownerEmail || 'Not linked'}</TableCell>
                  <TableCell>{row.address || row.city || row.emirate || 'Not recorded'}</TableCell>
                  <TableCell>{money(readAnnual(row))}</TableCell>
                  <TableCell>{money(readDeposit(row))}</TableCell>
                  <TableCell><Chip size="small" label={normalize(row.approvalStatus || row.status || row.onboardingStatus)} /></TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" spacing={1} flexWrap="wrap" useFlexGap>
                      <Button size="small" variant="contained" onClick={() => decide(row, 'APPROVED')}>Approve</Button>
                      <Button size="small" color="warning" variant="outlined" onClick={() => decide(row, 'REQUEST_MORE_DOCUMENTS')}>Request Docs</Button>
                      <Button size="small" color="error" variant="outlined" onClick={() => decide(row, 'REJECTED')}>Close Review</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && pending.length === 0 && <TableRow><TableCell colSpan={7} align="center">No properties pending review.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </Box>
  );
}
