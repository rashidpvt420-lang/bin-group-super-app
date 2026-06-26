import React from 'react';
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, updateDoc } from '../../lib/firebase';

const normalize = (value: unknown) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
const closedStates = ['CLOSED', 'CANCELLED', 'EXPIRED'];
const isOpen = (row: any) => !closedStates.some((state) => normalize(row.contractStatus || row.status).includes(state));
const money = (value: unknown) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

export default function ContractTerminationPage() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reason, setReason] = React.useState('OWNER_REQUEST');
  const [note, setNote] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [closingId, setClosingId] = React.useState('');

  React.useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'contracts'), (snapshot) => {
      setRows(snapshot.docs.map((item: any) => ({ id: item.id, ...(item.data() || {}) })));
      setLoading(false);
    }, () => {
      setMessage('Could not load contracts. Check admin Firestore access.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const openContracts = rows.filter(isOpen);

  const closeContract = async (row: any) => {
    if (!note.trim()) {
      setMessage('Admin note is required for audit evidence.');
      return;
    }

    const trimmedNote = note.trim();
    const auditPayload = {
      action: 'CONTRACT_CLOSED',
      entityType: 'contract',
      entityId: row.id,
      contractNumber: row.contractNumber || row.id,
      ownerEmail: row.ownerEmail || '',
      propertyId: row.propertyId || '',
      propertyName: row.propertyName || '',
      reason,
      note: trimmedNote,
      createdAt: serverTimestamp(),
      source: 'admin_contract_control',
    };

    setClosingId(row.id);
    try {
      await updateDoc(doc(db, 'contracts', row.id), {
        status: 'CLOSED',
        contractStatus: 'CLOSED',
        closureReason: reason,
        closureNote: trimmedNote,
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await Promise.all([
        addDoc(collection(db, 'audit_logs'), auditPayload),
        addDoc(collection(db, 'auditLogs'), auditPayload),
      ]);
      setNote('');
      setMessage('Contract closed and audit logged.');
    } catch (error: any) {
      console.error('[ContractTerminationPage] close failed:', error);
      setMessage(error?.message || 'Could not close contract. Check admin permissions and retry.');
    } finally {
      setClosingId('');
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100%', color: '#fff' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight="950">Contract Control</Typography>
          <Typography color="rgba(255,255,255,0.6)">Close active contracts with reason, note, and audit entry.</Typography>
        </Box>

        {message && <Alert severity={message.includes('Could not') || message.includes('required') ? 'error' : 'success'}>{message}</Alert>}

        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>Open contracts</Typography>
              <Typography variant="h5" color="#fff" fontWeight="950">{openContracts.length}</Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField size="small" select label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} sx={{ minWidth: 220 }}>
                <MenuItem value="OWNER_REQUEST">Owner request</MenuItem>
                <MenuItem value="NON_PAYMENT">Non-payment</MenuItem>
                <MenuItem value="BREACH_OF_TERMS">Breach of terms</MenuItem>
                <MenuItem value="ADMIN_CORRECTION">Admin correction</MenuItem>
                <MenuItem value="OTHER">Other</MenuItem>
              </TextField>
              <TextField size="small" label="Admin note" value={note} onChange={(event) => setNote(event.target.value)} sx={{ minWidth: 320 }} />
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Contract</TableCell><TableCell>Owner</TableCell><TableCell>Property</TableCell><TableCell>Value</TableCell><TableCell>Status</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
            <TableBody>
              {openContracts.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.contractNumber || row.id}</TableCell>
                  <TableCell>{row.ownerName || row.ownerEmail || 'Not linked'}</TableCell>
                  <TableCell>{row.propertyName || row.propertyId || 'Not linked'}</TableCell>
                  <TableCell>{money(row.totalValue || row.contractValue || row.annualValue)}</TableCell>
                  <TableCell><Chip size="small" label={normalize(row.contractStatus || row.status || 'ACTIVE')} /></TableCell>
                  <TableCell align="right"><Button size="small" color="warning" variant="outlined" disabled={closingId === row.id} onClick={() => closeContract(row)}>{closingId === row.id ? 'Closing...' : 'Close'}</Button></TableCell>
                </TableRow>
              ))}
              {!loading && openContracts.length === 0 && <TableRow><TableCell colSpan={6} align="center">No open contracts found.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </Box>
  );
}
