import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import {
  Ban,
  Bug,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  KeyRound,
  Plane,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react';
import { collection, db, functions, httpsCallable, limit, onSnapshot, orderBy, query } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { binThemeTokens } from '../../theme/adminTheme';

const SERVICE_OPTIONS = [
  { code: 'deep-clean', label: 'Deep Cleaning', icon: Sparkles },
  { code: 'pest-control', label: 'Pest Control', icon: Bug },
  { code: 'vacation-care', label: 'Vacation Home Care', icon: Plane },
  { code: 'moving', label: 'Moving & Packing', icon: Truck },
];
const TIME_WINDOWS = ['09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00'];
const REFUND_STATUSES = ['FULL_REFUND_APPROVED', 'PARTIAL_REFUND_50_APPROVED', 'NO_REFUND_UNDER_POLICY', 'NOT_APPLICABLE_NO_PAYMENT', 'REFUND_PENDING_FINANCE'];

const clean = (value: unknown) => String(value ?? '').trim();
const label = (value: unknown) => clean(value || 'PENDING').replaceAll('_', ' ').toUpperCase();
const readable = { whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' } as const;
const surface = { bgcolor: 'rgba(15,23,42,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } as const;

function timestampDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function localInput(value: any) {
  const date = timestampDate(value);
  if (!date) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default function ScheduledServicesOperationsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [slotServiceCode, setSlotServiceCode] = useState('deep-clean');
  const [slotDate, setSlotDate] = useState('');
  const [slotWindow, setSlotWindow] = useState('09:00-12:00');
  const [slotVendorName, setSlotVendorName] = useState('');
  const [slotVendorId, setSlotVendorId] = useState('');
  const [slotCapacity, setSlotCapacity] = useState(1);
  const [slotPriceFrom, setSlotPriceFrom] = useState('');
  const [slotNotes, setSlotNotes] = useState('');

  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteExpiry, setQuoteExpiry] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [appointmentStart, setAppointmentStart] = useState('');
  const [appointmentEnd, setAppointmentEnd] = useState('');
  const [confirmedWindow, setConfirmedWindow] = useState('09:00-12:00');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [refundStatus, setRefundStatus] = useState('REFUND_PENDING_FINANCE');
  const [decisionNote, setDecisionNote] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleWindow, setRescheduleWindow] = useState('09:00-12:00');
  const [revealedCode, setRevealedCode] = useState('');

  const selected = tickets.find((ticket) => ticket.id === selectedId) || null;
  const serviceSlots = useMemo(() => slots.filter((slot) => !selected || slot.serviceCode === selected.serviceCode), [slots, selected]);

  useEffect(() => {
    const ticketQuery = query(collection(db, 'maintenanceTickets'), orderBy('createdAt', 'desc'), limit(150));
    return onSnapshot(ticketQuery, (snapshot) => {
      const next = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item: any) => item.requestType === 'SCHEDULED_SERVICE');
      setTickets(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || '');
      setLoading(false);
    }, (err) => {
      console.error('[ScheduledServicesOperations] ticket listener failed:', err);
      setError(err?.message || 'Scheduled service records could not load.');
      setLoading(false);
    });
  }, []);

  const loadSlots = async () => {
    try {
      const manageAvailability = httpsCallable(functions, 'adminManageScheduledServiceAvailability');
      const response: any = await manageAvailability({ action: 'list' });
      setSlots(Array.isArray(response.data?.slots) ? response.data.slots : []);
    } catch (err: any) {
      console.error('[ScheduledServicesOperations] availability load failed:', err);
      setError(err?.message || 'Availability slots could not load.');
    }
  };

  useEffect(() => { void loadSlots(); }, []);

  useEffect(() => {
    if (!selected) return;
    setQuoteAmount(selected.quotedPrice ? String(selected.quotedPrice) : '');
    setVendorName(selected.vendorName || selected.availabilityVendorName || '');
    setAppointmentStart(localInput(selected.appointmentStart));
    setAppointmentEnd(localInput(selected.appointmentEnd));
    setConfirmedWindow(selected.confirmedTimeWindow || selected.preferredTimeWindow || '09:00-12:00');
    setSelectedSlotId(selected.availabilitySlotId || '');
    setRefundStatus(selected.refundStatus || 'REFUND_PENDING_FINANCE');
    setDecisionNote('');
    setRescheduleDate(selected.rescheduleRequest?.preferredDate || '');
    setRescheduleWindow(selected.rescheduleRequest?.preferredTimeWindow || selected.preferredTimeWindow || '09:00-12:00');
    setRevealedCode('');
  }, [selectedId, selected]);

  const runAvailability = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const manageAvailability = httpsCallable(functions, 'adminManageScheduledServiceAvailability');
      await manageAvailability(payload);
      await loadSlots();
      setNotice(success);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Availability action failed.');
    } finally {
      setBusy(false);
    }
  };

  const runTicketAction = async (action: string, extra: Record<string, unknown>, success: string) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const manageTicket = httpsCallable(functions, 'adminUpdateScheduledService');
      await manageTicket({ ticketId: selected.id, action, ...extra });
      setNotice(success);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Scheduled service action failed.');
    } finally {
      setBusy(false);
    }
  };

  const revealCode = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const reveal = httpsCallable(functions, 'adminRevealScheduledServiceAccessCode');
      const response: any = await reveal({ ticketId: selected.id });
      setRevealedCode(clean(response.data?.code));
      setNotice('Temporary code revealed. This action was added to the audit trail.');
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Access code could not be revealed.');
    } finally {
      setBusy(false);
    }
  };

  const createSlot = () => runAvailability({
    action: 'upsert',
    serviceCode: slotServiceCode,
    date: slotDate,
    timeWindow: slotWindow,
    vendorName: slotVendorName,
    vendorId: slotVendorId,
    capacity: slotCapacity,
    priceFrom: Number(slotPriceFrom || 0),
    publicNotes: slotNotes,
  }, 'Live provider slot published.');

  if (loading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#FFF' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>TENANT SERVICES OPERATIONS</Typography>
          <Typography variant="h3" sx={{ fontWeight: 950 }}>Scheduled Services Command Center</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.58)', mt: 1, maxWidth: 900 }}>Publish live availability, issue controlled quotes, confirm appointments, verify vacation access, process reschedules and cancellations, and maintain the payment/refund audit trail.</Typography>
        </Box>

        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}><Metric label="Open requests" value={tickets.filter((ticket) => !['CANCELLED', 'CLOSED', 'COMPLETED'].includes(label(ticket.status))).length} icon={<CalendarClock />} /></Grid>
          <Grid item xs={12} sm={4}><Metric label="Quotes awaiting tenant" value={tickets.filter((ticket) => ticket.quoteStatus === 'PENDING_TENANT_APPROVAL').length} icon={<CreditCard />} /></Grid>
          <Grid item xs={12} sm={4}><Metric label="Confirmed appointments" value={tickets.filter((ticket) => ticket.appointmentStatus === 'CONFIRMED').length} icon={<CheckCircle2 />} /></Grid>
        </Grid>

        <Paper sx={{ ...surface, p: 3 }}>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
              <Box><Typography variant="h5" sx={{ color: '#FFF', fontWeight: 950 }}>Live vendor availability</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)' }}>Published slots are visible to tenants for the selected service and date.</Typography></Box>
              <Button startIcon={<RefreshCw size={17} />} onClick={loadSlots} disabled={busy} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Refresh</Button>
            </Stack>
            <Grid container spacing={2}>
              <Grid item xs={12} md={2}><TextField fullWidth select label="Service" value={slotServiceCode} onChange={(event) => setSlotServiceCode(event.target.value)}>{SERVICE_OPTIONS.map((item) => <MenuItem key={item.code} value={item.code}>{item.label}</MenuItem>)}</TextField></Grid>
              <Grid item xs={12} md={2}><TextField fullWidth type="date" label="Date" value={slotDate} onChange={(event) => setSlotDate(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} md={2}><TextField fullWidth select label="Window" value={slotWindow} onChange={(event) => setSlotWindow(event.target.value)}>{TIME_WINDOWS.map((window) => <MenuItem key={window} value={window}>{window}</MenuItem>)}</TextField></Grid>
              <Grid item xs={12} md={2}><TextField fullWidth label="Vendor/team" value={slotVendorName} onChange={(event) => setSlotVendorName(event.target.value)} /></Grid>
              <Grid item xs={6} md={1}><TextField fullWidth type="number" label="Capacity" value={slotCapacity} onChange={(event) => setSlotCapacity(Number(event.target.value))} inputProps={{ min: 1, max: 100 }} /></Grid>
              <Grid item xs={6} md={1}><TextField fullWidth type="number" label="From AED" value={slotPriceFrom} onChange={(event) => setSlotPriceFrom(event.target.value)} inputProps={{ min: 0, step: 0.01 }} /></Grid>
              <Grid item xs={12} md={2}><Button fullWidth variant="contained" onClick={createSlot} disabled={busy || !slotDate || slotVendorName.trim().length < 2} sx={{ height: 56, bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>PUBLISH SLOT</Button></Grid>
              <Grid item xs={12} md={4}><TextField fullWidth label="Vendor ID (optional)" value={slotVendorId} onChange={(event) => setSlotVendorId(event.target.value)} /></Grid>
              <Grid item xs={12} md={8}><TextField fullWidth label="Public notes (optional)" value={slotNotes} onChange={(event) => setSlotNotes(event.target.value)} /></Grid>
            </Grid>
            <Grid container spacing={1.5}>
              {slots.slice(0, 30).map((slot) => (
                <Grid item xs={12} md={6} lg={4} key={slot.id}>
                  <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 3 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}><Typography sx={{ color: '#FFF', fontWeight: 950 }}>{slot.vendorName}</Typography><Chip size="small" label={label(slot.status)} color={label(slot.status) === 'OPEN' ? 'success' : 'default'} /></Stack>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>{SERVICE_OPTIONS.find((item) => item.code === slot.serviceCode)?.label || slot.serviceCode} · {slot.date} · {slot.timeWindow}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>Capacity {slot.bookedCount || 0}/{slot.capacity || 1} · From AED {Number(slot.priceFrom || 0).toFixed(2)}</Typography>
                      <Stack direction="row" spacing={1}><Button size="small" onClick={() => runAvailability({ action: label(slot.status) === 'OPEN' ? 'close' : 'open', slotId: slot.id }, `Slot ${label(slot.status) === 'OPEN' ? 'closed' : 'opened'}.`)} disabled={busy}>{label(slot.status) === 'OPEN' ? 'Close' : 'Open'}</Button><Button size="small" color="error" onClick={() => runAvailability({ action: 'delete', slotId: slot.id }, 'Slot deleted.')} disabled={busy}>Delete</Button></Stack>
                    </Stack>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={4}>
            <Paper sx={{ ...surface, p: 2.5, height: '100%' }}>
              <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950, mb: 2 }}>Scheduled requests</Typography>
              <Stack spacing={1.25} sx={{ maxHeight: 760, overflowY: 'auto', pr: 0.5 }}>
                {tickets.map((ticket) => {
                  const active = ticket.id === selectedId;
                  return (
                    <Button
                      key={ticket.id}
                      fullWidth
                      onClick={() => setSelectedId(ticket.id)}
                      sx={{
                        p: 2,
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        whiteSpace: 'normal',
                        bgcolor: active ? alpha(binThemeTokens.gold, 0.12) : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${active ? alpha(binThemeTokens.gold, 0.55) : 'rgba(255,255,255,0.06)'}`,
                        borderRadius: 3,
                        color: '#FFF',
                      }}
                    >
                      <Stack spacing={0.6} alignItems="flex-start" sx={{ width: '100%', minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 950, ...readable }}>{ticket.serviceLabel || ticket.category}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)', ...readable }}>{ticket.tenantName || ticket.tenantEmail || 'Tenant'} · Unit {ticket.unitNumber || 'N/A'}</Typography>
                        <Stack direction="row" spacing={0.7} flexWrap="wrap"><Chip size="small" label={label(ticket.status)} /><Chip size="small" label={label(ticket.quoteStatus)} /></Stack>
                      </Stack>
                    </Button>
                  );
                })}
                {!tickets.length && <Typography sx={{ color: 'rgba(255,255,255,0.45)' }}>No scheduled service requests.</Typography>}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={8}>
            {!selected ? (
              <Paper sx={{ ...surface, p: 6, textAlign: 'center' }}><CalendarClock size={48} color="rgba(255,255,255,0.2)" /><Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 2 }}>Select a scheduled request.</Typography></Paper>
            ) : (
              <Stack spacing={3}>
                <Paper sx={{ ...surface, p: 3 }}>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                      <Box><Typography variant="h4" sx={{ color: '#FFF', fontWeight: 950 }}>{selected.serviceLabel}</Typography><Typography sx={{ color: 'rgba(255,255,255,0.58)', mt: 0.5, ...readable }}>{selected.operationsSummary || selected.description}</Typography></Box>
                      <Stack direction="row" spacing={1} flexWrap="wrap"><Chip label={label(selected.status)} /><Chip label={label(selected.appointmentStatus)} /><Chip label={label(selected.quoteStatus)} /></Stack>
                    </Stack>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}><Data label="Tenant" value={`${selected.tenantName || 'Resident'} · ${selected.tenantPhone || selected.tenantEmail || 'No contact'}`} /></Grid>
                      <Grid item xs={12} md={6}><Data label="Property / unit" value={`${selected.propertyName || selected.propertyId || 'Property'} · Unit ${selected.unitNumber || 'N/A'}`} /></Grid>
                      <Grid item xs={12} md={6}><Data label="Requested appointment" value={`${selected.preferredServiceDate || selected.requestedServiceDate || 'Date pending'} · ${selected.preferredTimeWindow || 'Time pending'}`} /></Grid>
                      <Grid item xs={12} md={6}><Data label="Occupancy / access" value={`${label(selected.occupancyStatus)} · ${label(selected.accessMethod)} · ${label(selected.securityAccessStatus)}`} /></Grid>
                      <Grid item xs={12} md={6}><Data label="Recurrence" value={selected.recurrenceFrequency !== 'one-time' ? `${label(selected.recurrenceFrequency)} · ${selected.recurrenceOccurrences} visits` : 'ONE-TIME'} /></Grid>
                      <Grid item xs={12} md={6}><Data label="Policy / refund" value={`${selected.cancellationPolicyVersion || 'Policy missing'} · ${label(selected.refundStatus || 'NO REFUND DECISION')}`} /></Grid>
                    </Grid>
                  </Stack>
                </Paper>

                <Paper sx={{ ...surface, p: 3 }}>
                  <Stack spacing={2}>
                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>1. Publish quote</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={5}><TextField fullWidth type="number" label="Final quote AED" value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} inputProps={{ min: 0, step: 0.01 }} /></Grid>
                      <Grid item xs={12} md={5}><TextField fullWidth type="datetime-local" label="Quote expiry" value={quoteExpiry} onChange={(event) => setQuoteExpiry(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                      <Grid item xs={12} md={2}><Button fullWidth variant="contained" disabled={busy || Number(quoteAmount) <= 0 || !quoteExpiry} onClick={() => runTicketAction('publish_quote', { quotedPrice: Number(quoteAmount), quoteExpiresAt: new Date(quoteExpiry).toISOString() }, 'Quote published to the tenant for approval.')} sx={{ height: 56, bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>PUBLISH</Button></Grid>
                    </Grid>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>The tenant must approve the quote before paid dispatch. For recurring cleaning, specify in the ticket notes whether this is per visit or the total plan price.</Typography>
                  </Stack>
                </Paper>

                <Paper sx={{ ...surface, p: 3 }}>
                  <Stack spacing={2}>
                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>2. Confirm provider and appointment</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}><TextField fullWidth select label="Published slot (optional)" value={selectedSlotId} onChange={(event) => { setSelectedSlotId(event.target.value); const slot = slots.find((item) => item.id === event.target.value); if (slot) { setVendorName(slot.vendorName); setConfirmedWindow(slot.timeWindow); } }}><MenuItem value="">Manual confirmation</MenuItem>{serviceSlots.filter((slot) => label(slot.status) === 'OPEN').map((slot) => <MenuItem key={slot.id} value={slot.id}>{slot.date} · {slot.timeWindow} · {slot.vendorName} · {Number(slot.bookedCount || 0)}/{Number(slot.capacity || 1)}</MenuItem>)}</TextField></Grid>
                      <Grid item xs={12} md={6}><TextField fullWidth label="Vendor / service team" value={vendorName} onChange={(event) => setVendorName(event.target.value)} /></Grid>
                      <Grid item xs={12} md={4}><TextField fullWidth type="datetime-local" label="Appointment start" value={appointmentStart} onChange={(event) => setAppointmentStart(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                      <Grid item xs={12} md={4}><TextField fullWidth type="datetime-local" label="Appointment end" value={appointmentEnd} onChange={(event) => setAppointmentEnd(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                      <Grid item xs={12} md={4}><TextField fullWidth select label="Confirmed window" value={confirmedWindow} onChange={(event) => setConfirmedWindow(event.target.value)}>{TIME_WINDOWS.map((window) => <MenuItem key={window} value={window}>{window}</MenuItem>)}</TextField></Grid>
                    </Grid>
                    <Button variant="contained" disabled={busy || !appointmentStart || !appointmentEnd || vendorName.trim().length < 2} onClick={() => runTicketAction('confirm_appointment', { appointmentStart: new Date(appointmentStart).toISOString(), appointmentEnd: new Date(appointmentEnd).toISOString(), confirmedTimeWindow: confirmedWindow, vendorName, slotId: selectedSlotId }, 'Appointment confirmed and tenant notification queued.')} sx={{ bgcolor: '#2563EB', fontWeight: 950 }}>CONFIRM APPOINTMENT</Button>
                  </Stack>
                </Paper>

                <Paper sx={{ ...surface, p: 3 }}>
                  <Stack spacing={2}>
                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>3. Access and security</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>Method: {label(selected.accessMethod)} · Code ending: {selected.accessCodeLast4 ? `••••${selected.accessCodeLast4}` : 'none'} · Expiry: {timestampDate(selected.accessCodeExpiresAt)?.toLocaleString('en-AE') || 'not set'} · Status: {label(selected.securityAccessStatus)}</Typography>
                    {revealedCode && <Alert severity="warning" icon={<KeyRound />}>Temporary code: <strong>{revealedCode}</strong>. Do not copy it into comments or screenshots. It expires automatically.</Alert>}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      {selected.accessMethod === 'smart-lock' && <Button fullWidth variant="outlined" startIcon={<Eye />} disabled={busy} onClick={revealCode} sx={{ color: '#C4B5FD', borderColor: alpha('#7C3AED', 0.6), fontWeight: 950 }}>REVEAL ENCRYPTED CODE</Button>}
                      <Button fullWidth variant="contained" startIcon={<ShieldCheck />} disabled={busy} onClick={() => runTicketAction('confirm_access', {}, 'Security access confirmed.')} sx={{ bgcolor: '#7C3AED', fontWeight: 950 }}>CONFIRM SECURITY ACCESS</Button>
                    </Stack>
                  </Stack>
                </Paper>

                {selected.status === 'RESCHEDULE_REQUESTED' && (
                  <Paper sx={{ ...surface, p: 3, borderColor: alpha('#38BDF8', 0.45) }}>
                    <Stack spacing={2}>
                      <Typography variant="h6" sx={{ color: '#7DD3FC', fontWeight: 950 }}>Reschedule request</Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>{selected.rescheduleRequest?.reason}</Typography>
                      <Grid container spacing={2}><Grid item xs={12} md={6}><TextField fullWidth type="date" label="Approved replacement date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={12} md={6}><TextField fullWidth select label="Approved time window" value={rescheduleWindow} onChange={(event) => setRescheduleWindow(event.target.value)}>{TIME_WINDOWS.map((window) => <MenuItem key={window} value={window}>{window}</MenuItem>)}</TextField></Grid></Grid>
                      <Button variant="contained" disabled={busy || !rescheduleDate} onClick={() => runTicketAction('approve_reschedule', { date: rescheduleDate, timeWindow: rescheduleWindow }, 'Reschedule request approved. A new appointment confirmation is required.')} sx={{ bgcolor: '#0284C7', fontWeight: 950 }}>APPROVE RESCHEDULE</Button>
                    </Stack>
                  </Paper>
                )}

                {selected.status === 'CANCELLATION_REQUESTED' && (
                  <Paper sx={{ ...surface, p: 3, borderColor: alpha('#EF4444', 0.45) }}>
                    <Stack spacing={2}>
                      <Typography variant="h6" sx={{ color: '#FCA5A5', fontWeight: 950 }}>Cancellation and refund decision</Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>Reason: {selected.cancellationReason || 'No reason recorded'} · Policy window: {label(selected.cancellationPolicyWindow)} · Suggested refund: {selected.refundPercentUnderPolicy ?? 0}%</Typography>
                      <TextField fullWidth select label="Refund outcome" value={refundStatus} onChange={(event) => setRefundStatus(event.target.value)}>{REFUND_STATUSES.map((status) => <MenuItem key={status} value={status}>{label(status)}</MenuItem>)}</TextField>
                      <TextField fullWidth label="Decision note" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} />
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button fullWidth variant="contained" color="error" startIcon={<Ban />} disabled={busy} onClick={() => runTicketAction('cancellation_decision', { decision: 'approve', refundStatus, note: decisionNote }, 'Cancellation approved and refund outcome recorded.')} sx={{ fontWeight: 950 }}>APPROVE CANCELLATION</Button><Button fullWidth variant="outlined" disabled={busy} onClick={() => runTicketAction('cancellation_decision', { decision: 'reject', refundStatus: selected.refundStatus || 'NOT_APPLICABLE', note: decisionNote }, 'Cancellation rejected and service restored.')} sx={{ fontWeight: 950 }}>REJECT CANCELLATION</Button></Stack>
                    </Stack>
                  </Paper>
                )}

                <Paper sx={{ ...surface, p: 3 }}>
                  <Stack spacing={2}>
                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>4. Payment verification</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.62)' }}>Current status: {label(selected.servicePaymentStatus || (selected.paymentVerified ? 'PAID' : 'PENDING'))}</Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button fullWidth variant="contained" startIcon={<CreditCard />} disabled={busy} onClick={() => runTicketAction('mark_payment', { paid: true }, 'Service payment marked as verified.')} sx={{ bgcolor: '#10B981', fontWeight: 950 }}>MARK PAID</Button><Button fullWidth variant="outlined" disabled={busy} onClick={() => runTicketAction('mark_payment', { paid: false }, 'Service payment returned to pending.')} sx={{ fontWeight: 950 }}>MARK PENDING</Button></Stack>
                  </Stack>
                </Paper>
              </Stack>
            )}
          </Grid>
        </Grid>

        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>Signed in as {user?.email || user?.uid || 'Operations user'}. All quote, appointment, access, cancellation and payment actions are written to the audit trail.</Typography>
      </Stack>
    </Box>
  );
}

function Metric({ label: title, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <Paper sx={{ ...surface, p: 2.5 }}><Stack direction="row" spacing={2} alignItems="center"><Box sx={{ color: binThemeTokens.gold }}>{icon}</Box><Box><Typography variant="h4" sx={{ color: '#FFF', fontWeight: 950 }}>{value}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.48)' }}>{title}</Typography></Box></Stack></Paper>;
}

function Data({ label: title, value }: { label: string; value: string }) {
  return <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, height: '100%' }}><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{title.toUpperCase()}</Typography><Typography sx={{ color: '#FFF', fontWeight: 800, mt: 0.4, ...readable }}>{value}</Typography></Box>;
}
