import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { addDoc, collection, db, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

type IntakeRecord = {
  id: string;
  waId?: string;
  contactName?: string;
  messageText?: string;
  messageType?: string;
  category?: string;
  urgency?: string;
  status?: string;
  ticketId?: string;
  ticketDraftId?: string;
  propertyId?: string;
  unitId?: string;
  tenantId?: string;
  ownerId?: string;
  createdAt?: any;
};

type TriageForm = {
  propertyId: string;
  unitId: string;
  tenantId: string;
  ownerId: string;
  technicianId: string;
  category: string;
  urgency: string;
  title: string;
  scope: string;
};

const urgencyOptions = ['emergency', 'high', 'normal'];
const categoryOptions = ['AC', 'Plumbing', 'Electrical', 'Pest control', 'Handyman', 'General maintenance'];

const URGENCY_LABEL_KEYS: Record<string, string> = {
  emergency: 'admin.whatsapp_triage.urgency_emergency',
  high: 'admin.whatsapp_triage.urgency_high',
  normal: 'admin.whatsapp_triage.urgency_normal',
};

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  AC: 'admin.whatsapp_triage.category_ac',
  Plumbing: 'admin.whatsapp_triage.category_plumbing',
  Electrical: 'admin.whatsapp_triage.category_electrical',
  'Pest control': 'admin.whatsapp_triage.category_pest_control',
  Handyman: 'admin.whatsapp_triage.category_handyman',
  'General maintenance': 'admin.whatsapp_triage.category_general_maintenance',
};

const INTAKE_STATUS_LABEL_KEYS: Record<string, string> = {
  new: 'admin.whatsapp_triage.status_new',
  ticket_dispatched: 'admin.whatsapp_triage.status_ticket_dispatched',
  ticket_created_pending_dispatch: 'admin.whatsapp_triage.status_ticket_created_pending_dispatch',
  closed_no_action: 'admin.whatsapp_triage.status_closed_no_action',
};

function defaultForm(intake: IntakeRecord): TriageForm {
  return {
    propertyId: intake.propertyId || '',
    unitId: intake.unitId || '',
    tenantId: intake.tenantId || '',
    ownerId: intake.ownerId || '',
    technicianId: '',
    category: intake.category || 'General maintenance',
    urgency: intake.urgency || 'normal',
    title: `${intake.category || 'Maintenance'} request from WhatsApp`,
    scope: intake.messageText || '',
  };
}

export default function WhatsAppTriageQueuePage() {
  const { t, isRTL } = useLanguage();
  const [items, setItems] = React.useState<IntakeRecord[]>([]);
  const [forms, setForms] = React.useState<Record<string, TriageForm>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string>('');
  const [noticeSeverity, setNoticeSeverity] = React.useState<'success' | 'warning'>('warning');

  React.useEffect(() => {
    const q = query(collection(db, 'communication_intake'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<IntakeRecord, 'id'>) }));
      setItems(rows);
      setForms((current) => {
        const next = { ...current };
        rows.forEach((row) => {
          if (!next[row.id]) next[row.id] = defaultForm(row);
        });
        return next;
      });
    });
  }, []);

  const updateForm = (id: string, patch: Partial<TriageForm>) => {
    setForms((current) => ({ ...current, [id]: { ...(current[id] || defaultForm({ id })), ...patch } }));
  };

  const convertToTicket = async (intake: IntakeRecord) => {
    const form = forms[intake.id] || defaultForm(intake);
    if (!form.propertyId || !form.ownerId || !form.scope) {
      setNotice(t('admin.whatsapp_triage.fields_required'));
      setNoticeSeverity('warning');
      return;
    }
    setBusyId(intake.id);
    setNotice('');
    try {
      const ticketPayload = {
        source: 'whatsapp_triage',
        sourceChannel: 'whatsapp',
        intakeId: intake.id,
        waId: intake.waId || '',
        contactName: intake.contactName || '',
        title: form.title,
        description: form.scope,
        standardScope: form.scope,
        category: form.category,
        trade: form.category,
        urgency: form.urgency,
        priority: form.urgency,
        status: form.technicianId ? 'ASSIGNED' : 'OPEN',
        propertyId: form.propertyId,
        unitId: form.unitId,
        tenantId: form.tenantId,
        ownerId: form.ownerId,
        assignedTechnicianId: form.technicianId || null,
        technicianId: form.technicianId || null,
        humanApprovedBy: 'admin_triage_queue',
        approvalState: 'triaged',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const ticketRef = await addDoc(collection(db, 'maintenanceTickets'), ticketPayload);
      await addDoc(collection(db, 'maintenance_ledger'), {
        source: 'admin_whatsapp_triage',
        ledgerEvent: 'WHATSAPP_INTAKE_CONVERTED_TO_TICKET',
        intakeId: intake.id,
        ticketId: ticketRef.id,
        ownerId: form.ownerId,
        propertyId: form.propertyId,
        category: form.category,
        urgency: form.urgency,
        status: 'ticket_created',
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'data_governance_events'), {
        source: 'admin_whatsapp_triage',
        dataCategory: 'whatsapp_chat_and_property_maintenance_evidence',
        lawfulBasis: 'service_request_and_contract_operations',
        retentionClass: 'maintenance_evidence_standard',
        roleAccessPolicy: ['admin', 'owner', 'assigned_technician'],
        subjectRef: intake.waId || intake.id,
        ticketId: ticketRef.id,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'communication_intake', intake.id), {
        status: form.technicianId ? 'ticket_dispatched' : 'ticket_created_pending_dispatch',
        ticketId: ticketRef.id,
        ticketDraftId: ticketRef.id,
        propertyId: form.propertyId,
        unitId: form.unitId,
        tenantId: form.tenantId,
        ownerId: form.ownerId,
        category: form.category,
        urgency: form.urgency,
        standardScope: form.scope,
        humanApprovedBy: 'admin_triage_queue',
        updatedAt: serverTimestamp(),
      });
      setNotice(t('admin.whatsapp_triage.converted_to_ticket', { ticketId: ticketRef.id }));
      setNoticeSeverity('success');
    } catch (error: any) {
      setNotice(error?.message || t('admin.whatsapp_triage.convert_failed'));
      setNoticeSeverity('warning');
    } finally {
      setBusyId(null);
    }
  };

  const markNoAction = async (intake: IntakeRecord) => {
    setBusyId(intake.id);
    try {
      await updateDoc(doc(db, 'communication_intake', intake.id), {
        status: 'closed_no_action',
        humanApprovedBy: 'admin_triage_queue',
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'maintenance_ledger'), {
        source: 'admin_whatsapp_triage',
        ledgerEvent: 'WHATSAPP_INTAKE_CLOSED_NO_ACTION',
        intakeId: intake.id,
        waId: intake.waId || '',
        status: 'closed_no_action',
        createdAt: serverTimestamp(),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box sx={{ p: 4, color: '#fff', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>{t('admin.whatsapp_triage.overline')}</Typography>
        <Typography variant="h4" sx={{ fontWeight: 950 }}>{t('admin.whatsapp_triage.page_title')}</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.65)', maxWidth: 920 }}>
          {t('admin.whatsapp_triage.page_subtitle')}
        </Typography>
      </Stack>

      {notice && <Alert severity={noticeSeverity} sx={{ mb: 3 }}>{notice}</Alert>}

      <Grid container spacing={2}>
        {items.map((intake) => {
          const form = forms[intake.id] || defaultForm(intake);
          return (
            <Grid item xs={12} key={intake.id}>
              <Card sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(218,165,32,0.22)', borderRadius: 3 }}>
                <CardContent>
                  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 950 }}>{intake.contactName || intake.waId || t('admin.whatsapp_triage.contact_fallback')}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{intake.id}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Chip label={t(INTAKE_STATUS_LABEL_KEYS[intake.status || 'new'] || INTAKE_STATUS_LABEL_KEYS.new)} color={String(intake.status || '').includes('ticket') ? 'success' : 'warning'} />
                      <Chip label={t(URGENCY_LABEL_KEYS[form.urgency] || URGENCY_LABEL_KEYS.normal)} variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }} />
                      <Chip label={t(CATEGORY_LABEL_KEYS[form.category] || CATEGORY_LABEL_KEYS['General maintenance'])} variant="outlined" sx={{ color: '#DAA520', borderColor: 'rgba(218,165,32,0.45)' }} />
                    </Stack>
                  </Stack>

                  <Typography sx={{ color: 'rgba(255,255,255,0.78)', mb: 2, whiteSpace: 'pre-wrap' }}>{intake.messageText || t('admin.whatsapp_triage.no_message_text')}</Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />

                  <Grid container spacing={2}>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.whatsapp_triage.property_id_label')} value={form.propertyId} onChange={(e) => updateForm(intake.id, { propertyId: e.target.value })} /></Grid>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.whatsapp_triage.unit_id_label')} value={form.unitId} onChange={(e) => updateForm(intake.id, { unitId: e.target.value })} /></Grid>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.whatsapp_triage.tenant_id_label')} value={form.tenantId} onChange={(e) => updateForm(intake.id, { tenantId: e.target.value })} /></Grid>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.whatsapp_triage.owner_id_label')} value={form.ownerId} onChange={(e) => updateForm(intake.id, { ownerId: e.target.value })} /></Grid>
                    <Grid item xs={12} md={3}><TextField select fullWidth size="small" label={t('admin.whatsapp_triage.category_label')} value={form.category} onChange={(e) => updateForm(intake.id, { category: e.target.value })}>{categoryOptions.map((item) => <MenuItem key={item} value={item}>{t(CATEGORY_LABEL_KEYS[item])}</MenuItem>)}</TextField></Grid>
                    <Grid item xs={12} md={3}><TextField select fullWidth size="small" label={t('admin.whatsapp_triage.urgency_label')} value={form.urgency} onChange={(e) => updateForm(intake.id, { urgency: e.target.value })}>{urgencyOptions.map((item) => <MenuItem key={item} value={item}>{t(URGENCY_LABEL_KEYS[item])}</MenuItem>)}</TextField></Grid>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.whatsapp_triage.technician_id_label')} value={form.technicianId} onChange={(e) => updateForm(intake.id, { technicianId: e.target.value })} /></Grid>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label={t('admin.whatsapp_triage.ticket_title_label')} value={form.title} onChange={(e) => updateForm(intake.id, { title: e.target.value })} /></Grid>
                    <Grid item xs={12}><TextField fullWidth multiline minRows={3} size="small" label={t('admin.whatsapp_triage.standard_scope_label')} value={form.scope} onChange={(e) => updateForm(intake.id, { scope: e.target.value })} /></Grid>
                  </Grid>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
                    <Button variant="contained" disabled={busyId === intake.id || Boolean(intake.ticketId)} onClick={() => convertToTicket(intake)} sx={{ bgcolor: '#DAA520', color: '#020617', fontWeight: 950 }}>
                      {t('admin.whatsapp_triage.convert_button')}
                    </Button>
                    <Button variant="outlined" disabled={busyId === intake.id || Boolean(intake.ticketId)} onClick={() => markNoAction(intake)} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.24)' }}>
                      {t('admin.whatsapp_triage.close_no_action_button')}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
