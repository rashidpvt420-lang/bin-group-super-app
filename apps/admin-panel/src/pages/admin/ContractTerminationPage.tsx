import React from 'react';
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, updateDoc } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

const normalize = (value: unknown) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
const closedStates = ['CLOSED', 'CANCELLED', 'EXPIRED'];
const isOpen = (row: any) => !closedStates.some((state) => normalize(row.contractStatus || row.status).includes(state));
const money = (value: unknown) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

export default function ContractTerminationPage() {
  const { t, isRTL } = useLanguage();
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reason, setReason] = React.useState('OWNER_REQUEST');
  const [note, setNote] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [messageSeverity, setMessageSeverity] = React.useState<'success' | 'error'>('success');
  const [closingId, setClosingId] = React.useState('');

  React.useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'contracts'), (snapshot) => {
      setRows(snapshot.docs.map((item: any) => ({ id: item.id, ...(item.data() || {}) })));
      setLoading(false);
    }, () => {
      setMessage(t('admin.contract_termination.load_failed'));
      setMessageSeverity('error');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const openContracts = rows.filter(isOpen);

  const closeContract = async (row: any) => {
    if (!note.trim()) {
      setMessage(t('admin.contract_termination.note_required'));
      setMessageSeverity('error');
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
      setMessage(t('admin.contract_termination.close_success'));
      setMessageSeverity('success');
    } catch (error: any) {
      console.error('[ContractTerminationPage] close failed:', error);
      setMessage(error?.message || t('admin.contract_termination.close_failed'));
      setMessageSeverity('error');
    } finally {
      setClosingId('');
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100%', color: '#fff', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight="950">{t('admin.contract_termination.page_title')}</Typography>
          <Typography color="rgba(255,255,255,0.6)">{t('admin.contract_termination.page_desc')}</Typography>
        </Box>

        {message && <Alert severity={messageSeverity}>{message}</Alert>}

        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>{t('admin.contract_termination.open_contracts_label')}</Typography>
              <Typography variant="h5" color="#fff" fontWeight="950">{openContracts.length}</Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField size="small" select label={t('admin.contract_termination.reason')} value={reason} onChange={(event) => setReason(event.target.value)} sx={{ minWidth: 220 }}>
                <MenuItem value="OWNER_REQUEST">{t('admin.contract_termination.reason_owner_request')}</MenuItem>
                <MenuItem value="NON_PAYMENT">{t('admin.contract_termination.reason_non_payment')}</MenuItem>
                <MenuItem value="BREACH_OF_TERMS">{t('admin.contract_termination.reason_breach_of_terms')}</MenuItem>
                <MenuItem value="ADMIN_CORRECTION">{t('admin.contract_termination.reason_admin_correction')}</MenuItem>
                <MenuItem value="OTHER">{t('admin.contract_termination.reason_other')}</MenuItem>
              </TextField>
              <TextField size="small" label={t('admin.contract_termination.admin_note')} value={note} onChange={(event) => setNote(event.target.value)} sx={{ minWidth: 320 }} />
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>{t('admin.contract_termination.col_contract')}</TableCell><TableCell>{t('admin.contract_termination.col_owner')}</TableCell><TableCell>{t('admin.contract_termination.col_property')}</TableCell><TableCell>{t('admin.contract_termination.col_value')}</TableCell><TableCell>{t('admin.contract_termination.col_status')}</TableCell><TableCell align="right">{t('admin.contract_termination.col_action')}</TableCell></TableRow></TableHead>
            <TableBody>
              {openContracts.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.contractNumber || row.id}</TableCell>
                  <TableCell>{row.ownerName || row.ownerEmail || t('admin.contract_termination.not_linked')}</TableCell>
                  <TableCell>{row.propertyName || row.propertyId || t('admin.contract_termination.not_linked')}</TableCell>
                  <TableCell>{money(row.totalValue || row.contractValue || row.annualValue)}</TableCell>
                  <TableCell><Chip size="small" label={normalize(row.contractStatus || row.status || 'ACTIVE')} /></TableCell>
                  <TableCell align="right"><Button size="small" color="warning" variant="outlined" disabled={closingId === row.id} onClick={() => closeContract(row)}>{closingId === row.id ? t('admin.contract_termination.closing_label') : t('admin.contract_termination.close_button')}</Button></TableCell>
                </TableRow>
              ))}
              {!loading && openContracts.length === 0 && <TableRow><TableCell colSpan={6} align="center">{t('admin.contract_termination.empty_state')}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </Box>
  );
}
