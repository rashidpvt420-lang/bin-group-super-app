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
  const [items, setItems] = React.useState<IntakeRecord[]>([]);
  const [forms, setForms] = React.useState<Record<string, TriageForm>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string>('');

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
      setNotice('Property ID, owner ID, and scope are required before conversion.');
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
      setNotice(`WhatsApp intake converted to ticket ${ticketRef.id}.`);
    } catch (error: any) {
      setNotice(error?.message || 'Failed to convert WhatsApp intake.');
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
    <Box sx={{ p: 4, color: '#fff' }}>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>NO-CALL OPERATIONS</Typography>
        <Typography variant="h4" sx={{ fontWeight: 950 }}>WhatsApp Triage Queue</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.65)', maxWidth: 920 }}>
          Review WhatsApp Cloud API intakes, attach property/unit/tenant, approve AI classification, and convert each message into a dispatch-ready maintenance ticket.
        </Typography>
      </Stack>

      {notice && <Alert severity={notice.includes('Failed') || notice.includes('required') ? 'warning' : 'success'} sx={{ mb: 3 }}>{notice}</Alert>}

      <Grid container spacing={2}>
        {items.map((intake) => {
          const form = forms[intake.id] || defaultForm(intake);
          return (
            <Grid item xs={12} key={intake.id}>
              <Card sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(218,165,32,0.22)', borderRadius: 3 }}>
                <CardContent>
                  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 950 }}>{intake.contactName || intake.waId || 'WhatsApp contact'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{intake.id}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Chip label={intake.status || 'new'} color={String(intake.status || '').includes('ticket') ? 'success' : 'warning'} />
                      <Chip label={form.urgency} variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }} />
                      <Chip label={form.category} variant="outlined" sx={{ color: '#DAA520', borderColor: 'rgba(218,165,32,0.45)' }} />
                    </Stack>
                  </Stack>

                  <Typography sx={{ color: 'rgba(255,255,255,0.78)', mb: 2, whiteSpace: 'pre-wrap' }}>{intake.messageText || '[No message text]'}</Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />

                  <Grid container spacing={2}>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Property ID" value={form.propertyId} onChange={(e) => updateForm(intake.id, { propertyId: e.target.value })} /></Grid>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Unit ID" value={form.unitId} onChange={(e) => updateForm(intake.id, { unitId: e.target.value })} /></Grid>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Tenant ID" value={form.tenantId} onChange={(e) => updateForm(intake.id, { tenantId: e.target.value })} /></Grid>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Owner ID" value={form.ownerId} onChange={(e) => updateForm(intake.id, { ownerId: e.target.value })} /></Grid>
                    <Grid item xs={12} md={3}><TextField select fullWidth size="small" label="Category" value={form.category} onChange={(e) => updateForm(intake.id, { category: e.target.value })}>{categoryOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField></Grid>
                    <Grid item xs={12} md={3}><TextField select fullWidth size="small" label="Urgency" value={form.urgency} onChange={(e) => updateForm(intake.id, { urgency: e.target.value })}>{urgencyOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField></Grid>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Technician ID optional" value={form.technicianId} onChange={(e) => updateForm(intake.id, { technicianId: e.target.value })} /></Grid>
                    <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Ticket title" value={form.title} onChange={(e) => updateForm(intake.id, { title: e.target.value })} /></Grid>
                    <Grid item xs={12}><TextField fullWidth multiline minRows={3} size="small" label="Standard scope" value={form.scope} onChange={(e) => updateForm(intake.id, { scope: e.target.value })} /></Grid>
                  </Grid>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
                    <Button variant="contained" disabled={busyId === intake.id || Boolean(intake.ticketId)} onClick={() => convertToTicket(intake)} sx={{ bgcolor: '#DAA520', color: '#020617', fontWeight: 950 }}>
                      Convert to Ticket / Dispatch
                    </Button>
                    <Button variant="outlined" disabled={busyId === intake.id || Boolean(intake.ticketId)} onClick={() => markNoAction(intake)} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.24)' }}>
                      Close No Action
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
