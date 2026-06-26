import React from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, updateDoc } from '../../lib/firebase';

const pendingStates = ['PENDING', 'PENDING REVIEW', 'ADMIN REVIEW', 'SUBMITTED', 'DRAFT', 'UNKNOWN'];

const normalize = (value: unknown) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();

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

  const pending = rows.filter((row) => pendingStates.some((state) => normalize(row.approvalStatus || row.status || row.onboardingStatus).includes(state)));

  const decide = async (row: any, decision: 'APPROVED' | 'REJECTED') => {
    const approved = decision === 'APPROVED';
    await updateDoc(doc(db, 'properties', row.id), {
      approvalStatus: decision,
      status: approved ? 'ACTIVE' : 'REJECTED',
      adminReviewNote: note.trim(),
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'auditLogs'), {
      action: approved ? 'PROPERTY_APPROVED' : 'PROPERTY_REJECTED',
      entityType: 'property',
      entityId: row.id,
      propertyName: row.propertyName || row.name || row.title || row.id,
      ownerEmail: row.ownerEmail || '',
      note: note.trim(),
      createdAt: serverTimestamp(),
      source: 'admin_property_approvals',
    });
    setNote('');
    setMessage(`Property ${approved ? 'approved' : 'rejected'} and audit logged.`);
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100%', color: '#fff' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight="950">Property Review Command</Typography>
          <Typography color="rgba(255,255,255,0.6)">Approve or reject submitted owner properties before activation.</Typography>
        </Box>

        {message && <Alert severity={message.includes('Could not') ? 'error' : 'success'}>{message}</Alert>}

        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>Pending review</Typography>
              <Typography variant="h5" color="#fff" fontWeight="950">{pending.length}</Typography>
            </Box>
            <TextField size="small" label="Admin note" value={note} onChange={(event) => setNote(event.target.value)} sx={{ minWidth: 320 }} />
          </Stack>
        </Paper>

        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Property</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell>Location</TableCell>
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
                  <TableCell><Chip size="small" label={normalize(row.approvalStatus || row.status || row.onboardingStatus)} /></TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                      <Button size="small" variant="contained" onClick={() => decide(row, 'APPROVED')}>Approve</Button>
                      <Button size="small" color="error" variant="outlined" onClick={() => decide(row, 'REJECTED')}>Reject</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && pending.length === 0 && <TableRow><TableCell colSpan={5} align="center">No properties pending review.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </Box>
  );
}
