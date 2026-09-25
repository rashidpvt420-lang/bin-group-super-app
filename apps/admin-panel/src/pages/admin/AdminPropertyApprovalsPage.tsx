import React from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { collection, db, functions, httpsCallable, onSnapshot } from '../../lib/firebase';

const pendingStates = ['PENDING', 'PENDING REVIEW', 'ADMIN REVIEW', 'SUBMITTED'];
const normalize = (value: unknown) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
const inspectionFirst = (row: any) => {
  const status = normalize(row.status || row.approvalStatus || row.onboardingStatus);
  const activation = normalize(row.activationStatus);
  return row.workflowVersion === 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1'
    || status === 'PENDING PROPERTY INSPECTION'
    || activation.includes('PENDING INSPECTION AND PAYMENT');
};
const toMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function AdminPropertyApprovalsPage() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [note, setNote] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [busyId, setBusyId] = React.useState('');

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

  const inspectionFirstRows = rows.filter(inspectionFirst);
  const pending = rows.filter((row) =>
    !inspectionFirst(row)
    && normalize(row.status || row.approvalStatus || row.onboardingStatus) !== 'DRAFT'
    && pendingStates.some((state) => normalize(row.approvalStatus || row.status || row.onboardingStatus).includes(state)),
  );

  const requestChanges = async (row: any) => {
    if (!inspectionFirst(row)) {
      setMessage('Use the legacy review actions only for non-inspection-first properties.');
      return;
    }
    if (note.trim().length < 8) {
      setMessage('A change-request reason of at least 8 characters is required.');
      return;
    }
    setBusyId(row.id);
    setMessage('');
    try {
      const requestOwnerPropertyChanges = httpsCallable(functions, 'adminRequestOwnerPropertyChanges');
      await requestOwnerPropertyChanges({ propertyId: row.id, reason: note.trim() });
      setMessage('Owner corrections requested. Inspection, payment and activation remain locked.');
      setNote('');
    } catch (error: any) {
      setMessage(error?.message || 'Change request failed. No lifecycle state was changed.');
    } finally {
      setBusyId('');
    }
  };

  const decide = async (row: any, decision: 'APPROVE' | 'REJECT') => {
    if (inspectionFirst(row)) {
      setMessage('Inspection-first properties must be processed through Intake Vault and their linked physical site visits.');
      return;
    }
    if (decision === 'REJECT' && note.trim().length < 8) {
      setMessage('A rejection reason of at least 8 characters is required.');
      return;
    }
    setBusyId(row.id);
    setMessage('');
    try {
      const reviewOwnerProperty = httpsCallable(functions, 'adminReviewOwnerProperty');
      const response: any = await reviewOwnerProperty({
        propertyId: row.id,
        decision,
        ...(decision === 'REJECT' ? { reason: note.trim() } : {}),
      });
      const geoReady = response?.data?.geoDispatchReady === true;
      setMessage(decision === 'APPROVE'
        ? `Legacy property review completed${geoReady ? ' with Founder-verified dispatch geography' : ''}.`
        : 'Legacy property rejected and the Owner was notified.');
      setNote('');
    } catch (error: any) {
      setMessage(error?.message || 'Property review failed. No approval state was claimed.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100%', color: '#fff' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight="950">Property Review Command</Typography>
          <Typography color="rgba(255,255,255,0.6)">Inspection-first Owner properties are verified by evidence-backed physical site visits. This page remains only for controlled legacy review compatibility.</Typography>
        </Box>
        {message && <Alert severity={message.includes('failed') || message.includes('Could not') || message.includes('required') ? 'error' : 'success'}>{message}</Alert>}
        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(218,165,32,0.35)', borderRadius: 3 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>Canonical inspection-first queue</Typography>
              <Typography variant="h5" color="#fff" fontWeight="950">{inspectionFirstRows.length}</Typography>
              <Typography color="rgba(255,255,255,0.7)">Use Intake Vault to create one site visit per property, record immutable visit evidence, and complete the portfolio. This page cannot approve those properties or manufacture dispatch-ready GPS.</Typography>
            </Box>
            {inspectionFirstRows.map((row) => (
              <Stack
                key={row.id}
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                alignItems={{ xs: 'stretch', md: 'center' }}
                justifyContent="space-between"
                sx={{ p: 2, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <Box>
                  <Typography color="#fff" fontWeight={900}>{row.propertyName || row.name || row.id}</Typography>
                  <Typography variant="caption" color="rgba(255,255,255,0.6)">
                    {normalize(row.status || row.approvalStatus || row.onboardingStatus)} · {row.ownerEmail || row.ownerId || 'Owner linked'}
                  </Typography>
                </Box>
                <Button
                  data-testid={`admin-request-owner-property-changes-${row.id}`}
                  color="warning"
                  variant="outlined"
                  disabled={busyId === row.id}
                  onClick={() => void requestChanges(row)}
                >
                  Request pre-inspection changes
                </Button>
              </Stack>
            ))}
          </Stack>
        </Paper>
        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box><Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>Legacy compatibility review</Typography><Typography variant="h5" color="#fff" fontWeight="950">{pending.length}</Typography></Box>
            <TextField size="small" label="Founder review note / rejection reason" value={note} onChange={(event) => setNote(event.target.value)} sx={{ minWidth: 320 }} />
          </Stack>
        </Paper>
        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Property</TableCell><TableCell>Owner</TableCell><TableCell>Submitted location</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
            <TableBody>
              {pending.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.propertyName || row.name || row.title || row.id}</TableCell>
                  <TableCell>{row.ownerName || row.ownerEmail || 'Not linked'}</TableCell>
                  <TableCell>{row.submittedGeo?.address || row.geo?.address || row.address || row.city || row.emirate || 'Not recorded'}</TableCell>
                  <TableCell><Chip size="small" label={normalize(row.approvalStatus || row.status || row.onboardingStatus)} /></TableCell>
                  <TableCell align="right"><Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button size="small" variant="contained" disabled={busyId === row.id} onClick={() => decide(row, 'APPROVE')}>Legacy approve / verify geo</Button>
                    <Button size="small" color="error" variant="outlined" disabled={busyId === row.id} onClick={() => decide(row, 'REJECT')}>Reject</Button>
                  </Stack></TableCell>
                </TableRow>
              ))}
              {!loading && pending.length === 0 && <TableRow><TableCell colSpan={5} align="center">No legacy properties pending compatibility review.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </Box>
  );
}
