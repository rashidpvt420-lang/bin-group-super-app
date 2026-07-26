import React from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { collection, db, functions, httpsCallable, onSnapshot } from '../../lib/firebase';
import { resolveVerifiedPropertyPin } from '../../lib/verifiedPropertyPin';

const pendingStates = ['PENDING', 'PENDING REVIEW', 'PENDING APPROVAL', 'PENDING ADMIN APPROVAL', 'PENDING ADMIN REVIEW', 'ADMIN REVIEW', 'SUBMITTED', 'DRAFT', 'ONBOARDING', 'UNKNOWN'];
const approvedStates = ['APPROVED', 'ACTIVE'];
const normalize = (value: unknown) => String(value || 'UNKNOWN').replace(/[_-]/g, ' ').toUpperCase();
const toMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const reviewState = (row: any) => normalize(row.status || row.approvalStatus || row.onboardingStatus);
const isPendingReview = (row: any) => pendingStates.includes(reviewState(row));
const requiresLegacyGeoReview = (row: any) => approvedStates.includes(reviewState(row)) && !resolveVerifiedPropertyPin(row);

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
      setMessage('Could not load properties. Check Admin Firestore access.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const reviewRows = rows.filter((row) => isPendingReview(row) || requiresLegacyGeoReview(row));

  const decide = async (row: any, decision: 'APPROVE' | 'REJECT') => {
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
      const geoOnly = response?.data?.geoOnlyReview === true;
      setMessage(decision === 'APPROVE'
        ? geoOnly
          ? 'Canonical dispatch geography verified.'
          : `Property approved${geoReady ? ' with verified dispatch geography' : ''}.`
        : 'Property rejected and the Owner was notified.');
      setNote('');
    } catch (error: any) {
      setMessage(error?.message || 'Property review failed. No approval or geo-verification state was claimed.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100%', color: '#fff' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight="950">Property Review Command</Typography>
          <Typography color="rgba(255,255,255,0.6)">Founder-MFA review promotes Owner-submitted evidence into canonical dispatch geography.</Typography>
        </Box>
        {message && <Alert severity={message.includes('failed') || message.includes('Could not') || message.includes('required') || message.includes('paused') ? 'error' : 'success'}>{message}</Alert>}
        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>Pending review or geo verification</Typography>
              <Typography variant="h5" color="#fff" fontWeight="950">{reviewRows.length}</Typography>
            </Box>
            <TextField size="small" label="Founder review note / rejection reason" value={note} onChange={(event) => setNote(event.target.value)} sx={{ minWidth: 320 }} />
          </Stack>
        </Paper>
        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Property</TableCell><TableCell>Owner</TableCell><TableCell>Submitted location</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
            <TableBody>
              {reviewRows.map((row) => {
                const geoOnly = requiresLegacyGeoReview(row);
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.propertyName || row.name || row.title || row.id}</TableCell>
                    <TableCell>{row.ownerName || row.ownerEmail || 'Not linked'}</TableCell>
                    <TableCell>{row.submittedGeo?.address || row.geo?.address || row.address || row.city || row.emirate || 'Not recorded'}</TableCell>
                    <TableCell><Chip size="small" label={geoOnly ? 'APPROVED — GEO REVIEW REQUIRED' : reviewState(row)} /></TableCell>
                    <TableCell align="right"><Stack direction="row" justifyContent="flex-end" spacing={1}>
                      <Button size="small" variant="contained" disabled={busyId === row.id} onClick={() => decide(row, 'APPROVE')}>
                        {geoOnly ? 'Verify geo' : 'Approve & verify geo'}
                      </Button>
                      {!geoOnly && <Button size="small" color="error" variant="outlined" disabled={busyId === row.id} onClick={() => decide(row, 'REJECT')}>Reject</Button>}
                    </Stack></TableCell>
                  </TableRow>
                );
              })}
              {!loading && reviewRows.length === 0 && <TableRow><TableCell colSpan={5} align="center">No properties pending review or geo verification.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </Box>
  );
}
