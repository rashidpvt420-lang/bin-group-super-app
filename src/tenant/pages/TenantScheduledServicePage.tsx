import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
import { Bug, CalendarDays, CheckCircle2, Clock3, KeyRound, Plane, Sparkles, Truck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addDoc, collection, db, doc, getDoc, getDocs, limit, query, serverTimestamp, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import TenantUnitLinkFallback from '../components/TenantUnitLinkFallback';

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
    description: 'Book inspection or treatment and tell the team about pests, pets, children and access.',
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

const normalizeService = (value: string | null): ServiceCode => {
  const key = String(value || '').trim().toLowerCase() as ServiceCode;
  return key in SERVICE_CATALOG ? key : 'deep-clean';
};

const today = new Date().toISOString().slice(0, 10);

export default function TenantScheduledServicePage() {
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
  const [unitData, setUnitData] = useState<any>(null);
  const [propertyData, setPropertyData] = useState<any>(null);
  const [residenceChecked, setResidenceChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const service = SERVICE_CATALOG[serviceCode];
  const ServiceIcon = service.icon;
  const tenantAway = occupancyStatus === 'away' || occupancyStatus === 'vacation';

  useEffect(() => {
    setServiceCode(normalizeService(searchParams.get('service')));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadResidence() {
      if (!user?.uid) {
        setResidenceChecked(true);
        return;
      }

      try {
        let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid), limit(1)));
        if (unitSnap.empty) {
          unitSnap = await getDocs(query(collection(db, 'units'), where('tenantUid', '==', user.uid), limit(1)));
        }
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

    setSubmitting(true);
    try {
      const ticketPayload = {
        requesterRole: 'tenant',
        tenantId: user.uid,
        tenantUid: user.uid,
        tenantName: user.displayName || 'Resident',
        tenantPhone: user.phoneNumber || '',
        tenantEmail: user.email || '',
        requesterId: user.uid,
        requesterEmail: user.email || '',
        reporterEmail: user.email || '',
        createdBy: user.uid,
        createdByUid: user.uid,
        propertyId: unitData.propertyId,
        propertyName: propertyData?.name || propertyData?.propertyName || '',
        unitId: unitData.id,
        unitNumber: unitData.unitNumber || '',
        floor: unitData.floorNumber || '',
        ...(unitData.ownerId ? { ownerId: unitData.ownerId } : {}),
        ...(unitData.ownerUid ? { ownerUid: unitData.ownerUid } : {}),
        requestType: 'SCHEDULED_SERVICE',
        serviceCode,
        serviceLabel: service.label,
        category: service.category,
        description: `${service.label}: ${serviceScope.trim()}`,
        specificLocation: serviceScope.trim(),
        serviceLocationDetail: serviceScope.trim(),
        preferredServiceDate: preferredDate,
        requestedServiceDate: preferredDate,
        preferredTimeWindow: timeWindow,
        occupancyStatus,
        tenantAway,
        vacationService: occupancyStatus === 'vacation' || serviceCode === 'vacation-care',
        accessMethod,
        accessAuthorized: tenantAway ? accessAuthorized : true,
        contactDuringService: contactDuringService.trim(),
        pestTarget: serviceCode === 'pest-control' ? pestTarget.trim() : '',
        sensitiveOccupants: serviceCode === 'pest-control' ? sensitiveOccupants : 'not_applicable',
        specialInstructions: specialInstructions.trim(),
        priority: 'normal',
        slaPriority: 'SCHEDULED',
        slaStartsAt: 'CONFIRMED_APPOINTMENT',
        photoEvidenceRequired: false,
        evidenceStatus: 'NOT_REQUIRED_AT_INTAKE',
        source: 'TENANT_PORTAL_SCHEDULED_SERVICE',
        status: 'OPEN',
        dispatchStatus: 'PENDING_SCHEDULING',
        trackingStatus: 'WAITING_FOR_APPOINTMENT_CONFIRMATION',
        technicianId: null,
        assignedTechnicianId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'maintenanceTickets'), ticketPayload);
      navigate('/tenant/tickets');
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
    <Box sx={{ maxWidth: 980, mx: 'auto', pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3.5}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2.5 }}>
            {tx('tenant.scheduled.overline', 'PLANNED HOME SERVICES')}
          </Typography>
          <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 0.5 }}>
            {tx('tenant.scheduled.title', 'Schedule a service')}
          </Typography>
          <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1, lineHeight: 1.7, maxWidth: 780 }}>
            {tx('tenant.scheduled.desc', 'Tell BIN GROUP what service you need, when it should happen, whether you are home or away, and how authorized access should work.')}
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
                    <Grid item xs={12} sm={6} md={3} key={code}>
                      <Button
                        fullWidth
                        type="button"
                        onClick={() => setServiceCode(code)}
                        sx={{
                          minHeight: 118,
                          p: 2,
                          flexDirection: 'column',
                          gap: 1,
                          whiteSpace: 'normal',
                          textAlign: 'center',
                          color: binThemeTokens.textPrimary,
                          bgcolor: selected ? alpha(binThemeTokens.gold, 0.11) : binThemeTokens.softCanvas,
                          border: `1px solid ${selected ? alpha(binThemeTokens.gold, 0.65) : binThemeTokens.border}`,
                          borderRadius: 4,
                        }}
                      >
                        <Icon size={24} color={binThemeTokens.goldHover} />
                        <Typography sx={{ fontWeight: 950 }}>{item.label}</Typography>
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
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.6 }}>{service.description}</Typography>
                  </Box>
                </Stack>
              </Box>

              <Grid container spacing={2.5}>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth required type="date" label={tx('tenant.scheduled.date', 'Preferred service date')} value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} inputProps={{ min: today }} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>{tx('tenant.scheduled.time', 'Preferred time window')}</InputLabel>
                    <Select value={timeWindow} label={tx('tenant.scheduled.time', 'Preferred time window')} onChange={(event) => setTimeWindow(event.target.value)}>
                      <MenuItem value="09:00-12:00">09:00 – 12:00</MenuItem>
                      <MenuItem value="12:00-15:00">12:00 – 15:00</MenuItem>
                      <MenuItem value="15:00-18:00">15:00 – 18:00</MenuItem>
                      <MenuItem value="18:00-21:00">18:00 – 21:00</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>{tx('tenant.scheduled.occupancy', 'Will anyone be in the unit?')}</InputLabel>
                    <Select value={occupancyStatus} label={tx('tenant.scheduled.occupancy', 'Will anyone be in the unit?')} onChange={(event) => setOccupancyStatus(event.target.value)}>
                      <MenuItem value="home">{tx('tenant.scheduled.home', 'Tenant will be home')}</MenuItem>
                      <MenuItem value="away">{tx('tenant.scheduled.away', 'Tenant will be away')}</MenuItem>
                      <MenuItem value="vacation">{tx('tenant.scheduled.vacation', 'Tenant is on vacation')}</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>{tx('tenant.scheduled.access', 'Access method')}</InputLabel>
                    <Select value={accessMethod} label={tx('tenant.scheduled.access', 'Access method')} onChange={(event) => setAccessMethod(event.target.value)}>
                      {accessOptions.map(([value, label]) => <MenuItem value={value} key={value}>{label}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <TextField fullWidth required label={tx('tenant.scheduled.scope', 'Rooms, areas or service scope')} value={serviceScope} onChange={(event) => setServiceScope(event.target.value)} placeholder={serviceCode === 'deep-clean' ? 'Example: Full 2-bedroom apartment, kitchen appliances and two bathrooms' : 'Describe the exact rooms, areas or items involved'} />

              {serviceCode === 'pest-control' && (
                <Grid container spacing={2.5}>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth required label={tx('tenant.scheduled.pestType', 'Pest or signs observed')} value={pestTarget} onChange={(event) => setPestTarget(event.target.value)} placeholder="Example: cockroaches in kitchen, ants near balcony, bed-bug signs" />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel>{tx('tenant.scheduled.sensitive', 'Pets, children or sensitive occupants')}</InputLabel>
                      <Select value={sensitiveOccupants} label={tx('tenant.scheduled.sensitive', 'Pets, children or sensitive occupants')} onChange={(event) => setSensitiveOccupants(event.target.value)}>
                        <MenuItem value="none">{tx('tenant.scheduled.none', 'None')}</MenuItem>
                        <MenuItem value="pets">{tx('tenant.scheduled.pets', 'Pets in the unit')}</MenuItem>
                        <MenuItem value="children">{tx('tenant.scheduled.children', 'Children in the unit')}</MenuItem>
                        <MenuItem value="pets-and-children">{tx('tenant.scheduled.petsChildren', 'Pets and children')}</MenuItem>
                        <MenuItem value="sensitive">{tx('tenant.scheduled.sensitivePerson', 'Sensitive / medical concern')}</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              )}

              <TextField fullWidth label={tx('tenant.scheduled.contact', 'Phone or WhatsApp during service')} value={contactDuringService} onChange={(event) => setContactDuringService(event.target.value)} />
              <TextField fullWidth multiline minRows={3} label={tx('tenant.scheduled.instructions', 'Special instructions')} value={specialInstructions} onChange={(event) => setSpecialInstructions(event.target.value)} placeholder="Parking, gate access, alarm, keys, restricted rooms, preferred products or anything the team must know" />

              {tenantAway && (
                <Box sx={{ p: 2.5, bgcolor: alpha('#2563EB', 0.055), border: `1px solid ${alpha('#2563EB', 0.2)}`, borderRadius: 4 }}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="flex-start">
                    <KeyRound size={22} color="#2563EB" />
                    <Box>
                      <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{tx('tenant.scheduled.awayTitle', 'Away / vacation access')}</Typography>
                      <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.4 }}>{tx('tenant.scheduled.awayDesc', 'The request will be marked as an unoccupied-unit service. Operations will confirm the appointment and access method before entry.')}</Typography>
                      <FormControlLabel control={<Checkbox checked={accessAuthorized} onChange={(event) => setAccessAuthorized(event.target.checked)} />} label={tx('tenant.scheduled.authorize', 'I authorize the selected access method for the confirmed appointment.')} />
                    </Box>
                  </Stack>
                </Box>
              )}

              <Box sx={{ p: 2.25, bgcolor: binThemeTokens.softCanvas, border: `1px solid ${binThemeTokens.border}`, borderRadius: 4 }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.25} alignItems="center">
                  <CalendarDays size={20} color={binThemeTokens.goldHover} />
                  <Clock3 size={20} color={binThemeTokens.goldHover} />
                  <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                    {tx('tenant.scheduled.confirmation', 'This creates a scheduled-service request. BIN GROUP Operations confirms the date, time, price if applicable and access instructions before dispatch.')}
                  </Typography>
                </Stack>
              </Box>

              <Button type="submit" variant="contained" size="large" disabled={submitting} sx={{ py: 1.7, borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>
                {submitting ? <CircularProgress size={24} color="inherit" /> : tx('tenant.scheduled.submit', 'SUBMIT SCHEDULED SERVICE')}
              </Button>

              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" justifyContent="center">
                <CheckCircle2 size={17} color="#10B981" />
                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{tx('tenant.scheduled.audit', 'Occupancy, access and scheduling details are saved with the request for operations and audit history.')}</Typography>
              </Stack>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Box>
  );
}
