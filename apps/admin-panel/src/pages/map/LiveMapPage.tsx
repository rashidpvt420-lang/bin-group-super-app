import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonPinCircleIcon from '@mui/icons-material/PersonPinCircle';
import RoomIcon from '@mui/icons-material/Room';
import { collection, documentId, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  isUnresolvedMaintenanceTicketStatus,
  normalizeMaintenanceTicketStatus,
  unresolvedMaintenanceTicketStatusQueryChunks,
} from '../../../../../functions/shared/maintenanceTicketLifecycle';
import { db, functions } from '../../lib/firebase';
import { googleMapsSearchUrl, loadAdminGoogleMaps } from '../../lib/googleMaps';
import {
  missingReferencedPropertyIds,
  propertyIdQueryChunks,
  ticketReferencedPropertyIds,
} from '../../lib/ticketReferencedPropertyQuery';
import {
  liveLocationIsFreshAt,
  mapCoordinate,
  recordedTicketCoordinate,
  verifiedPinForTicket,
  type VerifiedPropertyPin,
} from '../../lib/verifiedPropertyPin';

const TICKET_STATUS_QUERY_CHUNKS = unresolvedMaintenanceTicketStatusQueryChunks();
const UAE_CENTRE = { lat: 24.4009, lng: 54.6938 };
const MAP_CLOCK_INTERVAL_MS = 15_000;
const TECHNICIAN_MAP_LIMIT = 100;
const LIVE_LOCATION_MAP_LIMIT = 200;

type LiveLocation = {
  id: string;
  technicianUid?: string;
  technicianName?: string;
  activeTicketId?: string;
  location?: any;
  serverUpdatedAt?: any;
  expiresAt?: any;
  isTracking?: boolean;
  accuracy?: number;
};

type TicketPinRow = { ticket: any; pin: VerifiedPropertyPin };

const displayStatus = (ticket: any) => {
  const status = normalizeMaintenanceTicketStatus(ticket.status);
  if (['UNASSIGNED', 'OPEN', 'PENDING', 'PENDING_ASSIGNMENT'].includes(status)) return 'Awaiting assignment';
  if (status === 'PENDING_SCHEDULING') return 'Pending scheduling';
  if (status === 'SCHEDULED') return 'Scheduled';
  if (status === 'QUOTE_REJECTED') return 'Quote rejected — revision required';
  if (status === 'RESCHEDULE_REQUESTED') return 'Reschedule requested';
  if (status === 'CANCELLATION_REQUESTED') return 'Cancellation requested — unresolved';
  if (status === 'EN_ROUTE' || status === 'ON_THE_WAY') return 'Technician en route';
  if (status === 'ARRIVED') return 'Technician arrived';
  if (status === 'IN_PROGRESS' || status === 'WORK_STARTED') return 'Work in progress';
  if (status === 'WAITING_PARTS') return 'Waiting for parts';
  if (status === 'ESCALATED') return 'Escalated — action required';
  if (status === 'REOPENED') return 'Reopened — action required';
  if (status === 'ON_HOLD') return 'On hold — unresolved';
  if (status === 'DISPUTED') return 'Disputed — resolution required';
  return ticket.assignedTechnicianName || ticket.assignedTechnicianId
    ? `Assigned to ${ticket.assignedTechnicianName || ticket.assignedTechnicianId}`
    : status || 'Unresolved';
};

const verificationDate = (verifiedAtMs: number) => {
  try { return new Date(verifiedAtMs).toLocaleString(); } catch { return 'recorded verification time'; }
};

export default function LiveMapPage() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const technicianMarkerRefs = useRef<Map<string, any>>(new Map());
  const ticketMarkerRefs = useRef<Map<string, any>>(new Map());
  const viewportInitializedRef = useRef(false);

  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ticketsError, setTicketsError] = useState('');
  const [techniciansError, setTechniciansError] = useState('');
  const [propertiesError, setPropertiesError] = useState('');
  const [locationsError, setLocationsError] = useState('');
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchError, setDispatchError] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), MAP_CLOCK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let ticketListenerFailed = false;
    const ticketSnapshots = new Map<number, any[]>();
    setTicketsLoading(true);

    const publishTickets = () => {
      if (ticketListenerFailed || ticketSnapshots.size !== TICKET_STATUS_QUERY_CHUNKS.length) return;
      const byId = new Map<string, any>();
      for (let index = 0; index < TICKET_STATUS_QUERY_CHUNKS.length; index += 1) {
        for (const ticket of ticketSnapshots.get(index) || []) {
          if (isUnresolvedMaintenanceTicketStatus(ticket.status)) byId.set(String(ticket.id), ticket);
        }
      }
      setTickets([...byId.values()].sort((left, right) => String(left.id).localeCompare(String(right.id))));
      setTicketsError('');
      setTicketsLoading(false);
    };

    const unsubscribeTickets = TICKET_STATUS_QUERY_CHUNKS.map((statuses, chunkIndex) => onSnapshot(
      query(collection(db, 'maintenanceTickets'), where('status', 'in', statuses)),
      (snapshot) => {
        if (ticketListenerFailed) return;
        ticketSnapshots.set(chunkIndex, snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        publishTickets();
      },
      (error) => {
        ticketListenerFailed = true;
        console.error(`[AdminMap] Unresolved ticket listener ${chunkIndex + 1} failed:`, error);
        setTickets([]);
        setTicketsLoading(false);
        setTicketsError(`Unresolved ticket query ${chunkIndex + 1} of ${TICKET_STATUS_QUERY_CHUNKS.length} failed. The operational feed is hidden until App Check, permissions, network and indexes recover.`);
      },
    ));

    // These operational listeners deliberately have no silent client-side caps.
    // When the portfolio grows beyond practical real-time listener size, the
    // replacement must be a server snapshot with an authoritative total count —
    // never a hidden limit that makes active people or GPS sessions disappear.
    const unsubscribeTechnicians = onSnapshot(collection(db, 'technicians'), (snapshot) => {
      setTechnicians(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as any))
        .filter((item) => item.suspended !== true && !['SUSPENDED', 'DISABLED', 'REJECTED'].includes(String(item.status || '').toUpperCase())));
      setTechniciansError('');
    }, (error) => {
      console.error('[AdminMap] Technician listener failed:', error);
      setTechnicians([]);
      setTechniciansError('Technician readiness data could not be loaded. Dispatch is disabled until the complete source recovers.');
    });

    const unsubscribeLocations = onSnapshot(
      query(collection(db, 'technician_live_locations'), where('isTracking', '==', true)),
      (snapshot) => {
        setLiveLocations(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as LiveLocation)));
        setLocationsError('');
      },
      (error) => {
        console.error('[AdminMap] Canonical location listener failed:', error);
        setLiveLocations([]);
        setLocationsError('Canonical live GPS data could not be loaded. The map will not simulate, infer or silently truncate Technician positions.');
      },
    );

    return () => {
      unsubscribeTickets.forEach((unsubscribe) => unsubscribe());
      unsubscribeTechnicians();
      unsubscribeLocations();
    };
  }, []);

  const referencedPropertyIds = useMemo(() => ticketReferencedPropertyIds(tickets), [tickets]);

  useEffect(() => {
    const chunks = propertyIdQueryChunks(referencedPropertyIds);
    if (!chunks.length) {
      setProperties([]);
      setPropertiesError('');
      return undefined;
    }
    let cancelled = false;
    let failed = false;
    const snapshots = new Map<number, any[]>();

    const publish = () => {
      if (cancelled || failed || snapshots.size !== chunks.length) return;
      const byId = new Map<string, any>();
      for (let index = 0; index < chunks.length; index += 1) {
        for (const property of snapshots.get(index) || []) byId.set(String(property.id), property);
      }
      const rows = [...byId.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));
      const missing = missingReferencedPropertyIds(referencedPropertyIds, rows.map((property) => String(property.id)));
      setProperties(rows);
      setPropertiesError(missing.length ? `${missing.length} unresolved ticket property record${missing.length === 1 ? ' is' : 's are'} missing. Those tickets remain visible but receive no verified marker.` : '');
    };

    const unsubscribers = chunks.map((propertyIds, chunkIndex) => onSnapshot(
      query(collection(db, 'properties'), where(documentId(), 'in', propertyIds)),
      (snapshot) => {
        if (cancelled || failed) return;
        snapshots.set(chunkIndex, snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        publish();
      },
      (error) => {
        if (cancelled) return;
        failed = true;
        console.error(`[AdminMap] Referenced property listener ${chunkIndex + 1} failed:`, error);
        setProperties([]);
        setPropertiesError(`Referenced property query ${chunkIndex + 1} of ${chunks.length} failed. All ticket/property markers are hidden until the exact records can be loaded.`);
      },
    ));
    return () => { cancelled = true; unsubscribers.forEach((unsubscribe) => unsubscribe()); };
  }, [referencedPropertyIds]);

  useEffect(() => {
    let cancelled = false;
    loadAdminGoogleMaps().then((maps) => {
      if (cancelled || !mapElementRef.current) return;
      mapRef.current = new maps.Map(mapElementRef.current, { center: UAE_CENTRE, zoom: 7, mapTypeControl: true, streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy' });
      setMapReady(true);
      setMapError('');
    }).catch((error) => {
      console.error('[AdminMap] Google Maps failed to initialise:', error);
      if (!cancelled) { setMapReady(false); setMapError(`Google Maps is unavailable: ${String(error?.message || error)}.`); }
    });
    return () => { cancelled = true; };
  }, []);

  const propertiesById = useMemo(() => new Map(properties.map((property) => [String(property.id), property])), [properties]);
  const freshLocations = useMemo(() => liveLocations.filter((location) => liveLocationIsFreshAt(location, nowMs)), [liveLocations, nowMs]);
  const ticketsWithVerifiedPins = useMemo(() => tickets
    .map((ticket) => ({ ticket, pin: verifiedPinForTicket(ticket, propertiesById) }))
    .filter((row): row is TicketPinRow => Boolean(row.pin)), [propertiesById, tickets]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const maps = (window as any).google?.maps;
    if (!maps) return;
    const visibleTechnicianIds = new Set<string>();
    const visibleTicketIds = new Set<string>();
    const bounds = new maps.LatLngBounds();
    let pointCount = 0;

    for (const location of freshLocations) {
      const point = mapCoordinate(location.location);
      if (!point) continue;
      visibleTechnicianIds.add(location.id);
      bounds.extend(point);
      pointCount += 1;
      const title = `${location.technicianName || 'Technician'} — fresh canonical GPS`;
      const existing = technicianMarkerRefs.current.get(location.id);
      if (existing) { existing.setPosition(point); existing.setTitle(title); }
      else technicianMarkerRefs.current.set(location.id, new maps.Marker({ map: mapRef.current, position: point, title, icon: { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#10b981', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } }));
    }
    technicianMarkerRefs.current.forEach((marker, id) => { if (!visibleTechnicianIds.has(id)) { marker.setMap(null); technicianMarkerRefs.current.delete(id); } });

    for (const { ticket, pin } of ticketsWithVerifiedPins) {
      visibleTicketIds.add(ticket.id);
      bounds.extend(pin.point);
      pointCount += 1;
      const priority = String(ticket.priority || ticket.severity || '').toUpperCase();
      const title = `${ticket.propertyName || ticket.unit || ticket.id} — verified canonical property pin — ${displayStatus(ticket)}`;
      const icon = { path: maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: ['EMERGENCY', 'CRITICAL', 'P0'].includes(priority) ? '#ef4444' : '#3b82f6', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 1.5 };
      const existing = ticketMarkerRefs.current.get(ticket.id);
      if (existing) { existing.setPosition(pin.point); existing.setTitle(title); existing.setIcon(icon); }
      else ticketMarkerRefs.current.set(ticket.id, new maps.Marker({ map: mapRef.current, position: pin.point, title, icon }));
    }
    ticketMarkerRefs.current.forEach((marker, id) => { if (!visibleTicketIds.has(id)) { marker.setMap(null); ticketMarkerRefs.current.delete(id); } });

    if (!viewportInitializedRef.current && pointCount > 0) {
      mapRef.current.fitBounds(bounds, 72);
      if (pointCount === 1) mapRef.current.setZoom(15);
      viewportInitializedRef.current = true;
    }
  }, [freshLocations, mapReady, ticketsWithVerifiedPins]);

  useEffect(() => () => {
    technicianMarkerRefs.current.forEach((marker) => marker.setMap(null));
    ticketMarkerRefs.current.forEach((marker) => marker.setMap(null));
    technicianMarkerRefs.current.clear();
    ticketMarkerRefs.current.clear();
  }, []);

  const unassignedCount = tickets.filter((ticket) => ['UNASSIGNED', 'OPEN', 'PENDING', 'PENDING_ASSIGNMENT'].includes(normalizeMaintenanceTicketStatus(ticket.status))).length;
  const dispatch = async (technician: any) => {
    if (!selectedTicket || dispatchBusy || techniciansError) return;
    setDispatchBusy(true);
    setDispatchError('');
    try {
      await httpsCallable(functions, 'adminAssignTechnician')({ ticketId: selectedTicket.id, technicianId: technician.id });
      setSelectedTicket(null);
    } catch (error: any) {
      console.error('[AdminMap] Dispatch failed:', error);
      setDispatchError(error?.message || 'Dispatch failed. No assignment state was claimed.');
    } finally { setDispatchBusy(false); }
  };

  return (
    <Box sx={{ minHeight: '100%', bgcolor: '#020617', color: '#fff', p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900 }}>Operational Dispatch Map</Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>Complete canonical unresolved tickets, exact referenced properties and every active canonical GPS session. No silent record caps are used.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`${tickets.length} unresolved tickets`} sx={{ color: '#fff', bgcolor: '#172033' }} />
          <Chip label={`${unassignedCount} awaiting assignment`} sx={{ color: '#fff', bgcolor: '#172033' }} />
          <Chip label={`${technicians.length} active technicians`} sx={{ color: '#fff', bgcolor: '#172033' }} />
          <Chip label={`${ticketsWithVerifiedPins.length} verified property pins`} sx={{ color: '#fff', bgcolor: '#1e3a8a' }} />
          <Chip label={`${freshLocations.length} fresh GPS sessions`} sx={{ color: '#fff', bgcolor: '#064e3b' }} />
        </Stack>
      </Stack>

      {[ticketsError, techniciansError, propertiesError, locationsError, mapError].filter(Boolean).map((message) => <Alert key={message} severity="error" sx={{ mb: 1 }}>{message}</Alert>)}

      <Grid container spacing={2}>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', maxHeight: { lg: '76vh' }, overflow: 'auto' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <Typography sx={{ fontWeight: 900 }}>Unresolved ticket feed</Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>All canonical unresolved lifecycle classes. Only verified property records become markers.</Typography>
            </Box>
            {ticketsLoading ? <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box> : <List disablePadding>
              {tickets.map((ticket) => {
                const verifiedPin = verifiedPinForTicket(ticket, propertiesById);
                const recordedPoint = recordedTicketCoordinate(ticket);
                const canAssign = ['UNASSIGNED', 'OPEN', 'PENDING', 'PENDING_ASSIGNMENT'].includes(normalizeMaintenanceTicketStatus(ticket.status));
                return <ListItem key={ticket.id} alignItems="flex-start" divider secondaryAction={canAssign ? <Button size="small" variant="contained" onClick={() => setSelectedTicket(ticket)} disabled={Boolean(techniciansError)}>Assign</Button> : undefined}>
                  <ListItemAvatar><Avatar sx={{ bgcolor: verifiedPin ? '#1d4ed8' : recordedPoint ? '#b45309' : '#475569' }}><RoomIcon /></Avatar></ListItemAvatar>
                  <ListItemText primary={ticket.propertyName || ticket.unit || ticket.id} secondary={<Box component="span" sx={{ display: 'block', color: '#94a3b8', pr: canAssign ? 8 : 0 }}>
                    {displayStatus(ticket)}<br />{ticket.issueDescription || ticket.issue || 'Maintenance request'}
                    {verifiedPin ? <><Typography component="span" variant="caption" sx={{ display: 'block', color: '#93c5fd', mt: 0.5 }}>Canonical property pin verified by {verifiedPin.verifiedBy} on {verificationDate(verifiedPin.verifiedAtMs)}.</Typography><Button size="small" endIcon={<OpenInNewIcon />} href={googleMapsSearchUrl(verifiedPin.point.lat, verifiedPin.point.lng)} target="_blank" rel="noreferrer" sx={{ px: 0, mt: 0.5 }}>Open verified property pin</Button></> : recordedPoint ? <Typography component="span" variant="caption" sx={{ display: 'block', color: '#fbbf24', mt: 0.5 }}>Recorded coordinate is unverified and is not rendered as an operational marker.</Typography> : <Typography component="span" variant="caption" sx={{ display: 'block', color: '#94a3b8', mt: 0.5 }}>No verified or recorded coordinate is available.</Typography>}
                  </Box>} />
                </ListItem>;
              })}
              {!tickets.length && !ticketsError && <ListItem><ListItemText primary="No unresolved tickets" secondary="The complete authenticated query returned no unresolved records. No markers have been fabricated." /></ListItem>}
            </List>}
          </Paper>
        </Grid>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ position: 'relative', minHeight: { xs: 480, lg: '76vh' }, overflow: 'hidden', bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Box ref={mapElementRef} data-testid="admin-live-google-map" sx={{ position: 'absolute', inset: 0 }} />
            {!mapReady && !mapError && <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ position: 'absolute', inset: 0 }}><CircularProgress /><Typography>Loading Google Maps…</Typography></Stack>}
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={Boolean(selectedTicket)} onClose={() => !dispatchBusy && setSelectedTicket(null)} fullWidth maxWidth="sm">
        <DialogTitle>Assign {selectedTicket?.propertyName || selectedTicket?.id}</DialogTitle>
        <DialogContent dividers>
          {dispatchError && <Alert severity="error" sx={{ mb: 2 }}>{dispatchError}</Alert>}
          {!technicians.length ? <Alert severity="warning">No active Technician records are available. Dispatch remains disabled.</Alert> : <List>
            {technicians.map((technician) => <ListItem key={technician.id} divider secondaryAction={<Button onClick={() => dispatch(technician)} disabled={dispatchBusy}>Assign</Button>}>
              <ListItemAvatar><Avatar><PersonPinCircleIcon /></Avatar></ListItemAvatar>
              <ListItemText primary={technician.displayName || technician.fullName || technician.email || technician.id} secondary={`${technician.specialization || technician.trade || 'General Maintenance'} · ${technician.available === false ? 'Not available' : 'Available'}`} />
            </ListItem>)}
          </List>}
        </DialogContent>
        <DialogActions><Button onClick={() => setSelectedTicket(null)} disabled={dispatchBusy}>Cancel</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
