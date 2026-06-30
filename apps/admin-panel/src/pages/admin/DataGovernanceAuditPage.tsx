import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { addDoc, collection, db, limit, onSnapshot, orderBy, query, serverTimestamp } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

type GovernanceEvent = { id: string; dataCategory?: string; lawfulBasis?: string; retentionClass?: string; roleAccessPolicy?: string[]; subjectRef?: string; ticketId?: string; createdAt?: any };
const retentionClasses = ['maintenance_evidence_standard', 'chat_history_180_days', 'financial_record_7_years', 'safety_incident_7_years', 'delete_after_case_close'];

export default function DataGovernanceAuditPage() {
  const { t, isRTL } = useLanguage();
  const [events, setEvents] = React.useState<GovernanceEvent[]>([]);
  const [notice, setNotice] = React.useState('');
  const [noticeSeverity, setNoticeSeverity] = React.useState<'success' | 'warning'>('success');
  const [form, setForm] = React.useState({ dataCategory: 'property_maintenance_evidence', lawfulBasis: 'contract_operations', retentionClass: 'maintenance_evidence_standard', subjectRef: '', ticketId: '', roleAccessPolicy: 'admin,owner,assigned_technician' });

  React.useEffect(() => {
    const q = query(collection(db, 'data_governance_events'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GovernanceEvent, 'id'>) }))));
  }, []);

  const recordEvent = async () => {
    if (!form.dataCategory || !form.lawfulBasis || !form.retentionClass) {
      setNoticeSeverity('warning');
      return setNotice(t('admin.data_governance.required_fields'));
    }
    const ref = await addDoc(collection(db, 'data_governance_events'), {
      ...form,
      roleAccessPolicy: form.roleAccessPolicy.split(',').map((x) => x.trim()).filter(Boolean),
      source: 'admin_data_governance_audit',
      createdAt: serverTimestamp(),
    });
    setNoticeSeverity('success');
    setNotice(t('admin.data_governance.event_recorded', { id: ref.id }));
  };

  return (
    <Box sx={{ p: 4, color: '#fff', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>{t('admin.data_governance.eyebrow')}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 950, mb: 1 }}>{t('admin.data_governance.page_title')}</Typography>
      <Typography sx={{ color: 'rgba(255,255,255,0.65)', mb: 3 }}>{t('admin.data_governance.page_desc')}</Typography>
      {notice && <Alert sx={{ mb: 3 }} severity={noticeSeverity}>{notice}</Alert>}
      <Card sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(218,165,32,0.22)', mb: 3 }}><CardContent><Grid container spacing={2}>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.data_governance.data_category')} value={form.dataCategory} onChange={(e) => setForm({ ...form, dataCategory: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.data_governance.lawful_basis')} value={form.lawfulBasis} onChange={(e) => setForm({ ...form, lawfulBasis: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField select fullWidth size="small" label={t('admin.data_governance.retention_class')} value={form.retentionClass} onChange={(e) => setForm({ ...form, retentionClass: e.target.value })}>{retentionClasses.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.data_governance.role_access_policy')} value={form.roleAccessPolicy} onChange={(e) => setForm({ ...form, roleAccessPolicy: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.data_governance.subject_reference')} value={form.subjectRef} onChange={(e) => setForm({ ...form, subjectRef: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.data_governance.ticket_id_optional')} value={form.ticketId} onChange={(e) => setForm({ ...form, ticketId: e.target.value })} /></Grid>
        <Grid item xs={12}><Button variant="contained" onClick={recordEvent} sx={{ bgcolor: '#DAA520', color: '#020617', fontWeight: 950 }}>{t('admin.data_governance.record_event_button')}</Button></Grid>
      </Grid></CardContent></Card>
      <Grid container spacing={2}>{events.map((event) => <Grid item xs={12} md={6} key={event.id}><Card sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}><CardContent>
        <Stack direction="row" justifyContent="space-between" spacing={2}><Box><Typography variant="h6" sx={{ fontWeight: 950 }}>{event.dataCategory}</Typography><Typography sx={{ color: 'rgba(255,255,255,0.6)' }}>{event.lawfulBasis} · {event.subjectRef || event.ticketId || event.id}</Typography></Box><Chip label={event.retentionClass || t('admin.data_governance.retention_default_label')} /></Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2 }}>{(event.roleAccessPolicy || []).map((role) => <Chip key={role} label={role} variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }} />)}</Stack>
      </CardContent></Card></Grid>)}</Grid>
    </Box>
  );
}
