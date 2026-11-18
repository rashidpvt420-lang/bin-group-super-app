// General staff HR self-service (Rashid, 4 Nov 2026): every employee sees ONLY their own
// payslips, documents and HR requests. Queries filter on the caller's uid so the existing
// own-record Firestore rules (staffCanRead) are the boundary; there are no client writes here.
// New requests go through the createStaffHrCase callable (server-authoritative).
import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { openEmployeeDocumentPdf } from './EmployeeCredentialsPanel';

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

  // Own employee ID card and contract draft (server-rendered; 5-minute signed link, own records only).
  const [myCredentials, setMyCredentials] = useState<any[] | null>(null);
  useEffect(() => {
    if (tab !== 3 || myCredentials !== null || !uid) return;
    httpsCallable(functions, 'getMyEmployeeCredentials')({})
      .then((response: any) => setMyCredentials(Array.isArray(response?.data?.documents) ? response.data.documents : []))
      .catch((err: any) => { setMyCredentials([]); setError(err?.message || 'Your ID card could not be loaded.'); });
  }, [tab, myCredentials, uid]);
  const openMyDocument = async (documentId: string) => {
    try { await openEmployeeDocumentPdf(uid, documentId); } catch (err: any) { setError(err?.message || 'Document could not be opened.'); }
  };

  const fmtDate = (v: any) => (v?.toDate ? v.toDate().toLocaleDateString() : String(v || '—'));

  return (
    <Box sx={{ p: 3 }} data-testid="my-hr-self-service">
      <Typography variant="h4" fontWeight={900}>My HR</Typography>
      <Typography variant="body2" sx={{ opacity: .8, mb: 2 }}>Only your own payslips, documents and HR requests are shown.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="My payslips" /><Tab label="My documents" /><Tab label="My requests" /><Tab label="My ID card" data-testid="my-hr-id-card-tab" />
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
        {tab === 3 && (
          <Stack spacing={2} data-testid="my-hr-id-card">
            <Alert severity="info">Your company ID card and employment contract DRAFT, issued by HR. Contract drafts are pending legal review and MOHRE registration and are not signed. — بطاقتك ومسودة عقدك؛ المسودة بانتظار المراجعة القانونية والتسجيل وغير موقعة.</Alert>
            <Table size="small"><TableHead><TableRow><TableCell>DOCUMENT</TableCell><TableCell>STATUS</TableCell><TableCell>VALID</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{(myCredentials || []).map((d) => <TableRow key={d.documentId}><TableCell>{d.documentType === 'EMPLOYEE_ID_CARD' ? 'ID card' : 'Contract draft'}</TableCell><TableCell>{String(d.status || '—').replace(/_/g, ' ')}</TableCell><TableCell>{d.issueDate ? `${d.issueDate} → ${d.expiryDate}` : '—'}</TableCell><TableCell align="right"><Button size="small" onClick={() => void openMyDocument(d.documentId)}>View / print</Button></TableCell></TableRow>)}
                {myCredentials !== null && myCredentials.length === 0 && <TableRow><TableCell colSpan={4} align="center">HR has not issued your card yet.</TableCell></TableRow>}</TableBody></Table>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
