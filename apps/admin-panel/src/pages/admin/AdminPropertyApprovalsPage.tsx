import React from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, updateDoc } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

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
  const { t, isRTL } = useLanguage();
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [note, setNote] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [messageSeverity, setMessageSeverity] = React.useState<'success' | 'error'>('success');

  React.useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const nextRows = snapshot.docs.map((item: any) => ({ id: item.id, ...(item.data() || {}) }));
      nextRows.sort((a, b) => toMillis(b.createdAt || b.updatedAt) - toMillis(a.createdAt || a.updatedAt));
      setRows(nextRows);
      setLoading(false);
    }, () => {
      setMessage(t('admin.property_approvals.load_failed'));
      setMessageSeverity('error');
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
    setMessage(approved ? t('admin.property_approvals.approved_success') : t('admin.property_approvals.rejected_success'));
    setMessageSeverity('success');
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100%', color: '#fff', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight="950">{t('admin.property_approvals.page_title')}</Typography>
          <Typography color="rgba(255,255,255,0.6)">{t('admin.property_approvals.page_desc')}</Typography>
        </Box>

        {message && <Alert severity={messageSeverity}>{message}</Alert>}

        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>{t('admin.property_approvals.pending_review_label')}</Typography>
              <Typography variant="h5" color="#fff" fontWeight="950">{pending.length}</Typography>
            </Box>
            <TextField size="small" label={t('admin.property_approvals.admin_note')} value={note} onChange={(event) => setNote(event.target.value)} sx={{ minWidth: 320 }} />
          </Stack>
        </Paper>

        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('admin.property_approvals.col_property')}</TableCell>
                <TableCell>{t('admin.property_approvals.col_owner')}</TableCell>
                <TableCell>{t('admin.property_approvals.col_location')}</TableCell>
                <TableCell>{t('admin.property_approvals.col_status')}</TableCell>
                <TableCell align="right">{t('admin.property_approvals.col_actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pending.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.propertyName || row.name || row.title || row.id}</TableCell>
                  <TableCell>{row.ownerName || row.ownerEmail || t('admin.property_approvals.not_linked')}</TableCell>
                  <TableCell>{row.address || row.city || row.emirate || t('admin.property_approvals.not_recorded')}</TableCell>
                  <TableCell><Chip size="small" label={normalize(row.approvalStatus || row.status || row.onboardingStatus)} /></TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                      <Button size="small" variant="contained" onClick={() => decide(row, 'APPROVED')}>{t('admin.property_approvals.approve_button')}</Button>
                      <Button size="small" color="error" variant="outlined" onClick={() => decide(row, 'REJECTED')}>{t('admin.property_approvals.reject_button')}</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && pending.length === 0 && <TableRow><TableCell colSpan={5} align="center">{t('admin.property_approvals.empty_state')}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </Box>
  );
}
