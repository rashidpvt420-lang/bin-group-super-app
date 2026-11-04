// General staff HR self-service (Rashid, 4 Nov 2026): every employee sees ONLY their own
// payslips, documents and HR requests. Queries filter on the caller's uid so the existing
// own-record Firestore rules (staffCanRead) are the boundary; there are no client writes here.
// New requests go through the createStaffHrCase callable (server-authoritative).
import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

export const MY_HR_COLLECTIONS = ['staffPayslips', 'staffDocuments', 'staffRequests'] as const;
type MyHrCollection = typeof MY_HR_COLLECTIONS[number];

export default function MyHrSelfServicePage() {
  const { user } = useAuth();
  const uid = String(user?.uid || '');
  const [tab, setTab] = useState(0);
  const [rows, setRows] = useState<Record<MyHrCollection, any[]>>({ staffPayslips: [], staffDocuments: [], staffRequests: [] });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!uid) return undefined;
    const unsubs = MY_HR_COLLECTIONS.map((name) => onSnapshot(
      query(collection(db, name), where('uid', '==', uid)),
      (snap) => setRows((prev) => ({ ...prev, [name]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })),
      (err) => setError(err.message || `Your ${name} could not be loaded.`),
    ));
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  const submitRequest = async () => {
    setBusy(true); setNotice(''); setError('');
    try {
      const createStaffHrCase = httpsCallable(functions, 'createStaffHrCase');
      await createStaffHrCase({ message: message.trim(), idempotencyKey: `${uid}:${message.trim()}` });
      setMessage(''); setNotice('Your HR request was submitted.');
    } catch (err: any) {
      setError(err?.message || 'HR request could not be submitted.');
    } finally { setBusy(false); }
  };

  const fmtDate = (v: any) => (v?.toDate ? v.toDate().toLocaleDateString() : String(v || '—'));

  return (
    <Box sx={{ p: 3 }} data-testid="my-hr-self-service">
      <Typography variant="h4" fontWeight={900}>My HR</Typography>
      <Typography variant="body2" sx={{ opacity: .8, mb: 2 }}>Only your own payslips, documents and HR requests are shown.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="My payslips" /><Tab label="My documents" /><Tab label="My requests" />
      </Tabs>
      <Paper sx={{ p: 2 }}>
        {tab === 0 && (
          <Table size="small"><TableHead><TableRow><TableCell>MONTH</TableCell><TableCell>NET PAY</TableCell><TableCell>STATUS</TableCell></TableRow></TableHead>
            <TableBody>{rows.staffPayslips.map((r) => <TableRow key={r.id}><TableCell>{r.month || r.period || '—'}</TableCell><TableCell>{r.netPay ?? r.amount ?? '—'}</TableCell><TableCell>{r.status || '—'}</TableCell></TableRow>)}
              {rows.staffPayslips.length === 0 && <TableRow><TableCell colSpan={3} align="center">No payslips yet.</TableCell></TableRow>}</TableBody></Table>
        )}
        {tab === 1 && (
          <Table size="small"><TableHead><TableRow><TableCell>TYPE</TableCell><TableCell>FILE</TableCell><TableCell>EXPIRY</TableCell><TableCell>STATUS</TableCell></TableRow></TableHead>
            <TableBody>{rows.staffDocuments.map((r) => <TableRow key={r.id}><TableCell>{r.documentLabel || r.documentType || '—'}</TableCell><TableCell>{r.fileName || 'Protected file'}</TableCell><TableCell>{r.expiryDate || '—'}</TableCell><TableCell>{String(r.status || '—').replace(/_/g, ' ')}</TableCell></TableRow>)}
              {rows.staffDocuments.length === 0 && <TableRow><TableCell colSpan={4} align="center">No documents on file.</TableCell></TableRow>}</TableBody></Table>
        )}
        {tab === 2 && (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField fullWidth size="small" label="New HR request" value={message} onChange={(e) => setMessage(e.target.value)} inputProps={{ maxLength: 2000 }} />
              <Button variant="contained" disabled={busy || message.trim().length < 3} onClick={() => void submitRequest()}>Submit</Button>
            </Stack>
            <Table size="small"><TableHead><TableRow><TableCell>TYPE</TableCell><TableCell>STATUS</TableCell><TableCell>CREATED</TableCell></TableRow></TableHead>
              <TableBody>{rows.staffRequests.map((r) => <TableRow key={r.id}><TableCell>{r.requestType || r.category || '—'}</TableCell><TableCell>{String(r.status || '—').replace(/_/g, ' ')}</TableCell><TableCell>{fmtDate(r.createdAt)}</TableCell></TableRow>)}
                {rows.staffRequests.length === 0 && <TableRow><TableCell colSpan={3} align="center">No HR requests yet.</TableCell></TableRow>}</TableBody></Table>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
