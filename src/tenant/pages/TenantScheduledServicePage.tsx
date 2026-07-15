import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Bug, CalendarDays, CheckCircle2, Clock3, KeyRound, Plane, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, db, doc, functions, getDoc, getDocs, httpsCallable, limit, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import TenantUnitLinkFallback from '../components/TenantUnitLinkFallback';

const POLICY_VERSION = 'BIN-SCHEDULED-SERVICES-2026-07';
const POLICY_COPY = 'Cancel 24 hours or more before the confirmed appointment for full-refund review. Cancellations 6–24 hours before are eligible for 50% refund review. Cancellations within 6 hours or no-shows are normally non-refundable. Final handling follows the approved contract, payment status and vendor terms.';

const SERVICE_CATALOG = {
  'deep-clean': {
    label: 'Deep Cleaning',
    category: 'cleaning',
    icon: Sparkles,
    description: 'Schedule a full or selected-area deep clean, including service while you are away.',
  },
  'pest-control': {
    label: 'Pest Control',
    category: 'pest control',
    icon: Bug,
    description: 'Book inspection or treatment and record pests, affected areas, pets, children and access.',
  },
  'vacation-care': {
    label: 'Vacation Home Care',
    category: 'management',
    icon: Plane,
    description: 'Arrange cleaning, inspection or home checks while the unit is unoccupied.',
  },
  moving: {
    label: 'Moving & Packing',
    category: 'moving',
    icon: Truck,
    description: 'Schedule packing, moving support or move-in and move-out preparation.',
  },
} as const;

type ServiceCode = keyof typeof SERVICE_CATALOG;
type AvailabilitySlot = {
  id: string;
  serviceCode: string;
  date: string;
  timeWindow: string;
  vendorId: string;
  vendorName: string;
  capacity: number;
  remaining: number;
  priceFrom: number;
  currency: string;
  notes?: string;
};

const normalizeService = (value: string | null): ServiceCode => {
  const key = String(value || '').trim().toLowerCase() as ServiceCode;
  return key in SERVICE_CATALOG ? key : 'deep-clean';
};

const today = new Date().toISOString().slice(0, 10);
const readableTextSx = { whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' } as const;

export default function TenantScheduledServicePage() {
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestIdRef = useRef(`scheduled_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  const [serviceCode, setServiceCode] = useState<ServiceCode>(() => normalizeService(searchParams.get('service')));
  const [preferredDate, setPreferredDate] = useState('');
  const [timeWindow, setTimeWindow] = useState('09:00-12:00');
  const [occupancyStatus, setOccupancyStatus] = useState(searchParams.get('occupancy') === 'away' ? 'vacation' : 'home');
  const [accessMethod, setAccessMethod] = useState('tenant-present');
  const [contactDuringService, setContactDuringService] = useState(user?.phoneNumber || '');
  const [serviceScope, setServiceScope] = useState('');
  const [pestTarget, setPestTarget] = useState('');
  const [sensitiveOccupants, setSensitiveOccupants] = useState('none');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [accessAuthorized, setAccessAuthorized] = useState(false);
  const [temporaryAccessCode, setTemporaryAccessCode] = useState('');
  const [accessCodeExpiresAt, setAccessCodeExpiresAt] = useState('');
  const [recurrenceFrequency, setRecurrenceFrequency] = useState('one-time');
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState(4);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotMessage, setSlotMessage] = useState('');
  const [unitData, setUnitData] = useState<any>(null);
  const [propertyData, setPropertyData] = useState<any>(null);
  const [residenceChecked, setResidenceChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const service = SERVICE_CATALOG[serviceCode];
  const ServiceIcon = service.icon;
  const tenantAway = occupancyStatus === 'away' || occupancyStatus === 'vacation';
  const selectedSlot = availableSlots.find((slot) => slot.id === selectedSlotId) || null;
  const recurringCleaning = serviceCode === 'deep-clean' && recurrenceFrequency !== 'one-time';

  useEffect(() => setServiceCode(normalizeService(searchParams.get('service'))), [searchParams]);

  useEffect(() => {
    if (serviceCode !== 'deep-clean') {
      setRecurrenceFrequency('one-time');
      setRecurrenceOccurrences(1);
    } else if (recurrenceOccurrences < 2) {
      setRecurrenceOccurrences(4);
    }
    setSelectedSlotId('');
  }, [serviceCode, recurrenceOccurrences]);

  useEffect(() => {
    if (selectedSlot) setTimeWindow(selectedSlot.timeWindow);
  }, [selectedSlot]);

  useEffect(() => {
    let cancelled = false;
    async function loadResidence() {
      if (!user?.uid) {
        setResidenceChecked(true);
        return;
      }
      try {
        let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid), limit(1)));
        if (unitSnap.empty) unitSnap = await getDocs(query(collection(db, 'units'), where('tenantUid', '==', user.uid), limit(1)));
        if (unitSnap.empty && user.email) {
          unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', user.email.toLowerCase()), limit(1)));
        }
        if (!unitSnap.empty && !cancelled) {
          const unit: any = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() };
          setUnitData(unit);
          if (unit.propertyId) {
            const propertySnap = await getDoc(doc(db, 'properties', unit.propertyId));
            if (propertySnap.exists()) setPropertyData({ id: propertySnap.id, ...propertySnap.data() });
          }
        }
      } catch (error) {
        console.warn('[TenantScheduledService] residence lookup failed:', error);
        if (!cancelled) setNotice(tx('tenant.scheduled.residenceError', 'Residence details could not be loaded. Please refresh or contact BIN GROUP Operations.'));
      } finally {
        if (!cancelled) setResidenceChecked(true);
      }
    }
    loadResidence();
    return () => { cancelled = true; };
  }, [user?.uid, user?.email, tx]);

  useEffect(() => {
    let cancelled = false;
    async function loadAvailability() {
      setSelectedSlotId('');
      setAvailableSlots([]);
      setSlotMessage('');
      if (!preferredDate || !user?.uid) return;
      setLoadingSlots(true);
      try {
        const getAvailability = httpsCallable(functions, 'getScheduledServiceAvailability');
        const response: any = await getAvailability({ serviceCode, date: preferredDate, propertyId: unitData?.propertyId || '' });
        if (cancelled) return;
        const slots = Array.isArray(response.data?.slots) ? response.data.slots : [];
        setAvailableSlots(slots);
        setSlotMessage(slots.length
          ? tx('tenant.scheduled.liveSlotsFound', 'Live provider availability is shown below. Select a slot or submit your preferred time for Operations confirmation.')
          : tx('tenant.scheduled.noLiveSlots', 'No live provider slot is published for this date. You can still submit your preferred time and Operations will confirm availability.'));
      } catch (error) {
        console.warn('[TenantScheduledService] availability lookup failed:', error);
        if (!cancelled) setSlotMessage(tx('tenant.scheduled.slotFallback', 'Live availability could not be loaded. Your preferred date and time can still be submitted for confirmation.'));
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }
    loadAvailability();
    return () => { cancelled = true; };
  }, [preferredDate, serviceCode, unitData?.propertyId, user?.uid, tx]);

  const accessOptions = useMemo(() => [
    ['tenant-present', tx('tenant.scheduled.accessPresent', 'Tenant will be present')],
    ['security-key', tx('tenant.scheduled.accessSecurity', 'Building security / key register')],
    ['authorized-contact', tx('tenant.scheduled.accessContact', 'Authorized contact will provide access')],
    ['smart-lock', tx('tenant.scheduled.accessSmartLock', 'Smart lock / temporary access code')],
    ['call-before-entry', tx('tenant.scheduled.accessCall', 'Call before entry')],
  ], [tx]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice('');

    if (!user?.uid || !unitData?.id || !unitData?.propertyId) {
      setNotice(tx('tenant.scheduled.unitRequired', 'A verified unit is required before this service can be scheduled.'));
      return;
    }
    if (!preferredDate) {
      setNotice(tx('tenant.scheduled.dateRequired', 'Choose a preferred service date.'));
      return;
    }
    if (serviceScope.trim().length < 3) {
      setNotice(tx('tenant.scheduled.scopeRequired', 'Describe the rooms, areas or work scope.'));
      return;
    }
    if (tenantAway && !accessAuthorized) {
      setNotice(tx('tenant.scheduled.authorizationRequired', 'Confirm access authorization because the unit will be unoccupied.'));
      return;
    }
    if (serviceCode === 'pest-control' && pestTarget.trim().length < 2) {
      setNotice(tx('tenant.scheduled.pestRequired', 'Tell us which pest or signs you have seen.'));
      return;
    }
    if (accessMethod === 'smart-lock') {
      if (temporaryAccessCode.trim().length < 4) {
        setNotice(tx('tenant.scheduled.codeRequired', 'Enter a temporary access code with at least four characters.'));
        return;
      }
      if (!accessCodeExpiresAt || new Date(accessCodeExpiresAt).getTime() <= Date.now()) {
        setNotice(tx('tenant.scheduled.codeExpiryRequired', 'Choose a future expiry for the temporary access code.'));
        return;
      }
    }
    if (!policyAccepted) {
      setNotice(tx('tenant.scheduled.policyRequired', 'Review and accept the scheduled-service cancellation and refund policy.'));
      return;
    }

    const occupancyLabel = occupancyStatus === 'vacation' ? 'tenant on vacation' : occupancyStatus === 'away' ? 'tenant away' : 'tenant home';
    const recurrenceLabel = recurringCleaning ? `${recurrenceFrequency}, ${recurrenceOccurrences} visits` : 'one-time';
    const operationsSummary = [
      service.label,
      `Date: ${preferredDate}`,
      `Time: ${selectedSlot?.timeWindow || timeWindow}`,
      selectedSlot ? `Published slot: ${selectedSlot.vendorName}` : 'Provider: awaiting Operations confirmation',
      selectedSlot?.priceFrom ? `Price from: AED ${selectedSlot.priceFrom.toFixed(2)}` : 'Price: quote required',
      `Recurrence: ${recurrenceLabel}`,
      `Occupancy: ${occupancyLabel}`,
      `Access: ${accessMethod}`,
      `Scope: ${serviceScope.trim()}`,
      serviceCode === 'pest-control' ? `Pest: ${pestTarget.trim()}` : '',
      serviceCode === 'pest-control' ? `Sensitive occupants: ${sensitiveOccupants}` : '',
      specialInstructions.trim() ? `Instructions: ${specialInstructions.trim()}` : '',
    ].filter(Boolean).join(' | ');

    setSubmitting(true);
    try {
      const createTicket = httpsCallable(functions, 'createTenantServiceTicket');
      const result = await createTicket({
        kind: 'SCHEDULED_SERVICE',
        propertyId: unitData.propertyId,
        unitId: unitData.id,
        clientRequestId: requestIdRef.current,
        details: {
          serviceCode,
          serviceLabel: service.label,
          category: service.category,
          operationsSummary,
          serviceScope: serviceScope.trim(),
          preferredDate,
          preferredTimeWindow: selectedSlot?.timeWindow || timeWindow,
          availabilitySlotId: selectedSlot?.id || '',
          availabilityVendorId: selectedSlot?.vendorId || '',
          availabilityVendorName: selectedSlot?.vendorName || '',
          availabilityPriceFrom: selectedSlot?.priceFrom || null,
          occupancyStatus,
          tenantAway,
          vacationService: occupancyStatus === 'vacation' || serviceCode === 'vacation-care',
          accessMethod,
          accessAuthorized: tenantAway ? accessAuthorized : true,
          accessCodeExpiresAt: accessCodeExpiresAt || '',
          contactDuringService: contactDuringService.trim(),
          pestTarget: serviceCode === 'pest-control' ? pestTarget.trim() : '',
          sensitiveOccupants: serviceCode === 'pest-control' ? sensitiveOccupants : 'not_applicable',
          specialInstructions: specialInstructions.trim(),
          recurrenceFrequency: serviceCode === 'deep-clean' ? recurrenceFrequency : 'one-time',
          recurrenceOccurrences: serviceCode === 'deep-clean' ? (recurrenceFrequency === 'one-time' ? 1 : recurrenceOccurrences) : 1,
          cancellationPolicyVersion: POLICY_VERSION,
          policyAccepted: policyAccepted,
        },
      });
      const { ticketId } = result.data as { ticketId?: string };
      if (!ticketId) throw new Error('Scheduled service did not return a ticket ID.');

      if (accessMethod === 'smart-lock') {
        try {
          const saveAccessCode = httpsCallable(functions, 'saveScheduledServiceAccessCode');
          await saveAccessCode({ ticketId, code: temporaryAccessCode.trim(), expiresAt: new Date(accessCodeExpiresAt).toISOString() });
        } catch (accessError) {
          console.error('[TenantScheduledService] secure access code save failed:', accessError);
          setNotice(tx('tenant.scheduled.codeSaveFailed', 'The service request was created, but the temporary access code could not be secured. Open the request and add a new code before the appointment.'));
          navigate(`/tenant/ticket/${ticketId}`);
          return;
        }
      }

      navigate(`/tenant/ticket/${ticketId}`);
    } catch (error) {
      console.error('[TenantScheduledService] submit failed:', error);
      setNotice(tx('tenant.scheduled.submitError', 'The scheduled service could not be submitted. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!residenceChecked) {
    return <Box sx={{ minHeight: '55vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.goldHover }} /></Box>;
  }
  if (!unitData) {
    return <TenantUnitLinkFallback message={tx('tenant.scheduled.noUnit', 'Verify your unit before scheduling cleaning, pest control, vacation care or moving services.')} />;
  }

  return (
    <Box sx={{ maxWidth: 980, mx: 'auto', pb: 8, direction: isRTL ? 'rtl' : 'ltr', minWidth: 0, overflowX: 'hidden' }}>
      <Stack spacing={3.5} sx={{ minWidth: 0 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2.5 }}>
            {tx('tenant.scheduled.overline', 'PLANNED HOME SERVICES')}
          </Typography>
          <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 0.5, ...readableTextSx }}>
            {tx('tenant.scheduled.title', 'Schedule a service')}
          </Typography>
          <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1, lineHeight: 1.7, maxWidth: 780, ...readableTextSx }}>
            {tx('tenant.scheduled.desc', 'Choose the service, live provider slot or preferred time, recurrence, price approval path, occupancy and secure access instructions.')}
          </Typography>
        </Box>

        <Paper sx={{ p: { xs: 2.5, md: 4 }, bgcolor: binThemeTokens.card, border: `1px solid ${binThemeTokens.border}`, borderRadius: 5, boxShadow: binThemeTokens.cardShadow }}>
          <form onSubmit={handleSubmit}>
            <Stack spacing={3}>
              {notice && <Alert severity="warning" onClose={() => setNotice('')}>{notice}</Alert>}

              <Grid container spacing={2}>
                {(Object.entries(SERVICE_CATALOG) as [ServiceCode, typeof SERVICE_CATALOG[ServiceCode]][]).map(([code, item]) => {
                  const Icon = item.icon;
                  const selected = code === serviceCode;
                  return (
                    <Grid item xs={12} sm={6} md={3} key={code} sx={{ minWidth: 0 }}>
                      <Button
                        fullWidth
                        type="button"
                        onClick={() => setServiceCode(code)}
                        sx={{
                          minHeight: 118,
                          p: 2,
                          minWidth: 0,
                          flexDirection: 'column',
                          gap: 1,
                          whiteSpace: 'normal',
                          overflowWrap: 'anywhere',
                          textAlign: 'center',
                          color: binThemeTokens.textPrimary,
                          bgcolor: selected ? alpha(binThemeTokens.gold, 0.11) : binThemeTokens.softCanvas,
                          border: `1px solid ${selected ? alpha(binThemeTokens.gold, 0.65) : binThemeTokens.border}`,
                          borderRadius: 4,
                        }}
                      >
                        <Icon size={24} color={binThemeTokens.goldHover} />
                        <Typography sx={{ fontWeight: 950, ...readableTextSx }}>{item.label}</Typography>
                      </Button>
                    </Grid>
                  );
                })}
              </Grid>

              <Box sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.055), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 4 }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="flex-start">
                  <ServiceIcon size={24} color={binThemeTokens.goldHover} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{service.label}</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.6, ...readableTextSx }}>{service.description}</Typography>
                  </Box>
                </Stack>
              </Box>

              <Grid container spacing={2.5}>
                <Grid item xs={12} md={6}><TextField fullWidth required type="date" label={tx('tenant.scheduled.date', 'Preferred service date')} value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} inputProps={{ min: today }} InputLabelProps={{ shrink: true }} /></Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth><InputLabel>{tx('tenant.scheduled.time', 'Preferred time window')}</InputLabel><Select value={timeWindow} label={tx('tenant.scheduled.time', 'Preferred time window')} onChange={(event) => setTimeWindow(event.target.value)}><MenuItem value="09:00-12:00">09:00 – 12:00</MenuItem><MenuItem value="12:00-15:00">12:00 – 15:00</MenuItem><MenuItem value="15:00-18:00">15:00 – 18:00</MenuItem><MenuItem value="18:00-21:00">18:00 – 21:00</MenuItem></Select></FormControl>
                </Grid>
              </Grid>

              {preferredDate && (
                <Paper sx={{ p: 2.5, bgcolor: binThemeTokens.softCanvas, border: `1px solid ${binThemeTokens.border}`, borderRadius: 4 }}>
                  <Stack spacing={2}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.25} alignItems="center">
                      <CalendarDays size={20} color={binThemeTokens.goldHover} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{tx('tenant.scheduled.liveAvailability', 'Live provider availability')}</Typography>
                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, ...readableTextSx }}>{slotMessage}</Typography>
                      </Box>
                    </Stack>
                    {loadingSlots ? <CircularProgress size={24} sx={{ color: binThemeTokens.goldHover }} /> : (
                      <Grid container spacing={1.5}>
                        {availableSlots.map((slot) => {
                          const selected = selectedSlotId === slot.id;
                          return (
                            <Grid item xs={12} md={6} key={slot.id}>
                              <Button
                                type="button"
                                fullWidth
                                onClick={() => setSelectedSlotId(selected ? '' : slot.id)}
                                sx={{
                                  minHeight: 116,
                                  p: 2,
                                  alignItems: 'flex-start',
                                  justifyContent: 'flex-start',
                                  textAlign: isRTL ? 'right' : 'left',
                                  whiteSpace: 'normal',
                                  color: binThemeTokens.textPrimary,
                                  bgcolor: selected ? alpha(binThemeTokens.gold, 0.12) : binThemeTokens.card,
                                  border: `1px solid ${selected ? binThemeTokens.goldHover : binThemeTokens.border}`,
                                  borderRadius: 3,
                                }}
                              >
                                <Stack spacing={0.7} alignItems={isRTL ? 'flex-end' : 'flex-start'} sx={{ width: '100%', minWidth: 0 }}>
                                  <Typography sx={{ fontWeight: 950, ...readableTextSx }}>{slot.vendorName}</Typography>
                                  <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{slot.timeWindow} · {slot.remaining} {tx('tenant.scheduled.remaining', 'remaining')}</Typography>
                                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap">
                                    {slot.priceFrom > 0 && <Chip size="small" label={`From ${slot.currency} ${slot.priceFrom.toFixed(2)}`} />}
                                    {selected && <Chip size="small" color="success" label={tx('tenant.scheduled.selected', 'Selected')} />}
                                  </Stack>
                                </Stack>
                              </Button>
                            </Grid>
                          );
                        })}
                      </Grid>
                    )}
                  </Stack>
                </Paper>
              )}

              {serviceCode === 'deep-clean' && (
                <Paper sx={{ p: 2.5, bgcolor: alpha('#10B981', 0.045), border: `1px solid ${alpha('#10B981', 0.2)}`, borderRadius: 4 }}>
                  <Stack spacing={2}>
                    <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{tx('tenant.scheduled.recurringTitle', 'Recurring cleaning plan')}</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth><InputLabel>{tx('tenant.scheduled.frequency', 'Frequency')}</InputLabel><Select value={recurrenceFrequency} label={tx('tenant.scheduled.frequency', 'Frequency')} onChange={(event) => setRecurrenceFrequency(event.target.value)}><MenuItem value="one-time">{tx('tenant.scheduled.oneTime', 'One-time service')}</MenuItem><MenuItem value="weekly">{tx('tenant.scheduled.weekly', 'Weekly')}</MenuItem><MenuItem value="biweekly">{tx('tenant.scheduled.biweekly', 'Every two weeks')}</MenuItem><MenuItem value="monthly">{tx('tenant.scheduled.monthly', 'Monthly')}</MenuItem></Select></FormControl>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth disabled={recurrenceFrequency === 'one-time'}><InputLabel>{tx('tenant.scheduled.visits', 'Number of visits')}</InputLabel><Select value={recurrenceFrequency === 'one-time' ? 1 : recurrenceOccurrences} label={tx('tenant.scheduled.visits', 'Number of visits')} onChange={(event) => setRecurrenceOccurrences(Number(event.target.value))}><MenuItem value={4}>4</MenuItem><MenuItem value={8}>8</MenuItem><MenuItem value={12}>12</MenuItem><MenuItem value={24}>24</MenuItem><MenuItem value={52}>52</MenuItem></Select></FormControl>
                      </Grid>
                    </Grid>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, ...readableTextSx }}>{tx('tenant.scheduled.recurringDesc', 'The quote will clearly state whether the amount is per visit or for the recurring plan. After each completed visit, the next visit is created automatically until the approved visit count is reached.')}</Typography>
                  </Stack>
                </Paper>
              )}

              <Grid container spacing={2.5}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth><InputLabel>{tx('tenant.scheduled.occupancy', 'Will anyone be in the unit?')}</InputLabel><Select value={occupancyStatus} label={tx('tenant.scheduled.occupancy', 'Will anyone be in the unit?')} onChange={(event) => setOccupancyStatus(event.target.value)}><MenuItem value="home">{tx('tenant.scheduled.home', 'Tenant will be home')}</MenuItem><MenuItem value="away">{tx('tenant.scheduled.away', 'Tenant will be away')}</MenuItem><MenuItem value="vacation">{tx('tenant.scheduled.vacation', 'Tenant is on vacation')}</MenuItem></Select></FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth><InputLabel>{tx('tenant.scheduled.access', 'Access method')}</InputLabel><Select value={accessMethod} label={tx('tenant.scheduled.access', 'Access method')} onChange={(event) => setAccessMethod(event.target.value)}>{accessOptions.map(([value, label]) => <MenuItem value={value} key={value}>{label}</MenuItem>)}</Select></FormControl>
                </Grid>
              </Grid>

              <TextField fullWidth required label={tx('tenant.scheduled.scope', 'Rooms, areas or service scope')} value={serviceScope} onChange={(event) => setServiceScope(event.target.value)} placeholder={serviceCode === 'deep-clean' ? 'Example: Full 2-bedroom apartment, kitchen appliances and two bathrooms' : 'Describe the exact rooms, areas or items involved'} />

              {serviceCode === 'pest-control' && (
                <Grid container spacing={2.5}>
                  <Grid item xs={12} md={6}><TextField fullWidth required label={tx('tenant.scheduled.pestType', 'Pest or signs observed')} value={pestTarget} onChange={(event) => setPestTarget(event.target.value)} placeholder="Example: cockroaches in kitchen, ants near balcony, bed-bug signs" /></Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth><InputLabel>{tx('tenant.scheduled.sensitive', 'Pets, children or sensitive occupants')}</InputLabel><Select value={sensitiveOccupants} label={tx('tenant.scheduled.sensitive', 'Pets, children or sensitive occupants')} onChange={(event) => setSensitiveOccupants(event.target.value)}><MenuItem value="none">{tx('tenant.scheduled.none', 'None')}</MenuItem><MenuItem value="pets">{tx('tenant.scheduled.pets', 'Pets in the unit')}</MenuItem><MenuItem value="children">{tx('tenant.scheduled.children', 'Children in the unit')}</MenuItem><MenuItem value="pets-and-children">{tx('tenant.scheduled.petsChildren', 'Pets and children')}</MenuItem><MenuItem value="sensitive">{tx('tenant.scheduled.sensitivePerson', 'Sensitive / medical concern')}</MenuItem></Select></FormControl>
                  </Grid>
                </Grid>
              )}

              <TextField fullWidth label={tx('tenant.scheduled.contact', 'Phone or WhatsApp during service')} value={contactDuringService} onChange={(event) => setContactDuringService(event.target.value)} />
              <TextField fullWidth multiline minRows={3} label={tx('tenant.scheduled.instructions', 'Special instructions')} value={specialInstructions} onChange={(event) => setSpecialInstructions(event.target.value)} placeholder="Parking, gate access, alarm, keys, restricted rooms, preferred products or anything the team must know" />

              {accessMethod === 'smart-lock' && (
                <Paper sx={{ p: 2.5, bgcolor: alpha('#7C3AED', 0.05), border: `1px solid ${alpha('#7C3AED', 0.22)}`, borderRadius: 4 }}>
                  <Stack spacing={2}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.25} alignItems="center"><ShieldCheck size={22} color="#7C3AED" /><Box><Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{tx('tenant.scheduled.secureCode', 'Secure temporary access code')}</Typography><Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, ...readableTextSx }}>{tx('tenant.scheduled.secureCodeDesc', 'The code is encrypted by the backend, expires automatically and can only be revealed to authorized Operations personnel with an audit record.')}</Typography></Box></Stack>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}><TextField fullWidth required type="password" label={tx('tenant.scheduled.accessCode', 'Temporary access code')} value={temporaryAccessCode} onChange={(event) => setTemporaryAccessCode(event.target.value)} inputProps={{ maxLength: 32 }} /></Grid>
                      <Grid item xs={12} md={6}><TextField fullWidth required type="datetime-local" label={tx('tenant.scheduled.accessExpiry', 'Code expiry')} value={accessCodeExpiresAt} onChange={(event) => setAccessCodeExpiresAt(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                    </Grid>
                  </Stack>
                </Paper>
              )}

              {tenantAway && (
                <Box sx={{ p: 2.5, bgcolor: alpha('#2563EB', 0.055), border: `1px solid ${alpha('#2563EB', 0.2)}`, borderRadius: 4 }}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="flex-start"><KeyRound size={22} color="#2563EB" /><Box sx={{ minWidth: 0 }}><Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{tx('tenant.scheduled.awayTitle', 'Away / vacation access')}</Typography><Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.4, ...readableTextSx }}>{tx('tenant.scheduled.awayDesc', 'The request is marked as an unoccupied-unit service. Operations must confirm the appointment, access method and security readiness before entry.')}</Typography><FormControlLabel control={<Checkbox checked={accessAuthorized} onChange={(event) => setAccessAuthorized(event.target.checked)} />} label={tx('tenant.scheduled.authorize', 'I authorize the selected access method for the confirmed appointment.')} /></Box></Stack>
                </Box>
              )}

              <Paper sx={{ p: 2.5, bgcolor: alpha('#F59E0B', 0.055), border: `1px solid ${alpha('#F59E0B', 0.24)}`, borderRadius: 4 }}>
                <Stack spacing={1.5}>
                  <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{tx('tenant.scheduled.policyTitle', 'Cancellation and refund policy')}</Typography>
                  <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.65, ...readableTextSx }}>{tx('tenant.scheduled.policyCopy', POLICY_COPY)}</Typography>
                  <FormControlLabel control={<Checkbox checked={policyAccepted} onChange={(event) => setPolicyAccepted(event.target.checked)} />} label={tx('tenant.scheduled.policyAccept', 'I have reviewed and accept this operational cancellation and refund policy.')} />
                </Stack>
              </Paper>

              <Box sx={{ p: 2.25, bgcolor: binThemeTokens.softCanvas, border: `1px solid ${binThemeTokens.border}`, borderRadius: 4 }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.25} alignItems="center"><CalendarDays size={20} color={binThemeTokens.goldHover} /><Clock3 size={20} color={binThemeTokens.goldHover} /><Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, ...readableTextSx }}>{tx('tenant.scheduled.confirmation', 'This creates a pending scheduling and quotation request. No paid service is dispatched until Operations publishes the final quote and the tenant approves it.')}</Typography></Stack></Box>

              <Button type="submit" variant="contained" size="large" disabled={submitting} sx={{ py: 1.7, borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>{submitting ? <CircularProgress size={24} color="inherit" /> : tx('tenant.scheduled.submit', 'SUBMIT SCHEDULED SERVICE')}</Button>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" justifyContent="center"><CheckCircle2 size={17} color="#10B981" /><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, ...readableTextSx }}>{tx('tenant.scheduled.audit', 'Availability, quote, recurrence, occupancy, access and policy decisions are saved with the request for Operations and audit history.')}</Typography></Stack>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Box>
  );
}
