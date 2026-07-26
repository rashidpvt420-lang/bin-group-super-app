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
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  isUnresolvedMaintenanceTicketStatus,
  normalizeMaintenanceTicketStatus,
  unresolvedMaintenanceTicketStatusQueryChunks,
} from '../../../../../functions/shared/maintenanceTicketLifecycle';
import { db, functions } from '../../lib/firebase';
import { googleMapsSearchUrl, loadAdminGoogleMaps } from '../../lib/googleMaps';
import {
  liveLocationIsFreshAt,
  mapCoordinate,
  recordedTicketCoordinate,
  verifiedPinForTicket,
  type MapCoordinate,
  type VerifiedPropertyPin,
} from '../../lib/verifiedPropertyPin';

const TICKET_STATUS_QUERY_CHUNKS = unresolvedMaintenanceTicketStatusQueryChunks();
const UAE_CENTRE = { lat: 24.4009, lng: 54.6938 };
const MAP_CLOCK_INTERVAL_MS = 15_000;

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

type TicketPinRow = {
  ticket: any;
  pin: VerifiedPropertyPin;
};

const displayStatus = (ticket: any) => {
  const status = normalizeMaintenanceTicketStatus(ticket.status);
  if (['UNASSIGNED', 'OPEN', 'PENDING', 'PENDING_ASSIGNMENT'].includes(status)) return 'Awaiting assignment';
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
  try {
    return new Date(verifiedAtMs).toLocaleString();
  } catch {
    return 'recorded verification time';
  }
};

export default function LiveMapPage() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);

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
      for (let chunkIndex = 0; chunkIndex < TICKET_STATUS_QUERY_CHUNKS.length; chunkIndex += 1) {
        for (const ticket of ticketSnapshots.get(chunkIndex) || []) {
          if (!isUnresolvedMaintenanceTicketStatus(ticket.status)) continue;
          byId.set(String(ticket.id), ticket);
        }
      }
      const rows = [...byId.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));
      setTickets(rows);
      setTicketsError('');
      setTicketsLoading(false);
    };

    const unsubscribeTickets = TICKET_STATUS_QUERY_CHUNKS.map((statuses, chunkIndex) => {
      const ticketQuery = query(
        collection(db, 'maintenanceTickets'),
        where('status', 'in', statuses),
        limit(100),
      );
      return onSnapshot(ticketQuery, (snapshot) => {
        if (ticketListenerFailed) return;
        ticketSnapshots.set(
          chunkIndex,
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        publishTickets();
      }, (error) => {
        ticketListenerFailed = true;
        console.error(`[AdminMap] Unresolved ticket listener ${chunkIndex + 1} failed:`, error);
        setTickets([]);
        setTicketsLoading(false);
        setTicketsError(
          `Unresolved ticket query ${chunkIndex + 1} of ${TICKET_STATUS_QUERY_CHUNKS.length} failed. ` +
          'The operational feed is hidden until App Check, permissions, network and Firestore indexes recover.',
        );
      });
    });

    const technicianQuery = query(collection(db, 'technicians'), limit(100));
    // This bounded canonical-property listener is deliberately fail-closed. A
    // ticket whose property is outside the returned set receives no verified
    // marker rather than falling back to an unreviewed ticket coordinate.
    const propertyQuery = query(collection(db, 'properties'), limit(500));
    const locationQuery = query(
      collection(db, 'technician_live_locations'),
      where('isTracking', '==', true),
      limit(200),
    );

    const unsubscribeTechnicians = onSnapshot(technicianQuery, (snapshot) => {
      const rows = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as any))
        .filter((item) => item.suspended !== true && !['SUSPENDED', 'DISABLED', 'REJECTED'].includes(String(item.status || '').toUpperCase()));
      setTechnicians(rows);
      setTechniciansError('');
    }, (error) => {
      console.error('[AdminMap] Technician listener failed:', error);
      setTechnicians([]);
      setTechniciansError('Technician readiness data could not be loaded. Dispatch is disabled until the data source recovers.');
    });

    const unsubscribeProperties = onSnapshot(propertyQuery, (snapshot) => {
      setProperties(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setPropertiesError('');
    }, (error) => {
      console.error('[AdminMap] Canonical property listener failed:', error);
      setProperties([]);
      setPropertiesError('Canonical property verification records could not be loaded. Ticket/property markers are hidden until the source recovers.');
    });

    const unsubscribeLocations = onSnapshot(locationQuery, (snapshot) => {
      setLiveLocations(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as LiveLocation)));
      setLocationsError('');
    }, (error) => {
      console.error('[AdminMap] Canonical location listener failed:', error);
      setLiveLocations([]);
      setLocationsError('Canonical live GPS data could not be loaded. The map will not simulate or infer Technician positions.');
    });

    return () => {
      unsubscribeTickets.forEach((unsubscribe) => unsubscribe());
      unsubscribeTechnicians();
      unsubscribeProperties();
      unsubscribeLocations();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAdminGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapElementRef.current) return;
        mapRef.current = new maps.Map(mapElementRef.current, {
          center: UAE_CENTRE,
          zoom: 7,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy',
        });
        setMapReady(true);
        setMapError('');
      })
      .catch((error) => {
        console.error('[AdminMap] Google Maps failed to initialise:', error);
        if (!cancelled) {
          setMapReady(false);
          setMapError(`Google Maps is unavailable: ${String(error?.message || error)}.`);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const propertiesById = useMemo(
    () => new Map(properties.map((property) => [String(property.id), property])),
    [properties],
  );

  const freshLocations = useMemo(
    () => liveLocations.filter((location) => liveLocationIsFreshAt(location, nowMs)),
    [liveLocations, nowMs],
  );

  const ticketsWithVerifiedPins = useMemo(
    () => tickets
      .map((ticket) => ({ ticket, pin: verifiedPinForTicket(ticket, propertiesById) }))
      .filter((row): row is TicketPinRow => Boolean(row.pin)),
    [propertiesById, tickets],
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const maps = (window as any).google?.maps;
    if (!maps) return;

    markerRefs.current.forEach((marker) => marker.setMap(null));
    markerRefs.current = [];
    const bounds = new maps.LatLngBounds();
    let pointCount = 0;

    for (const location of freshLocations) {
      const point = mapCoordinate(location.location);
      if (!point) continue;
      const marker = new maps.Marker({
        map: mapRef.current,
        position: point,
        title: `${location.technicianName || 'Technician'} — fresh canonical GPS`,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      markerRefs.current.push(marker);
      bounds.extend(point);
      pointCount += 1;
    }

    for (const { ticket, pin } of ticketsWithVerifiedPins) {
      const priority = String(ticket.priority || ticket.severity || '').toUpperCase();
      const marker = new maps.Marker({
        map: mapRef.current,
        position: pin.point,
        title: `${ticket.propertyName || ticket.unit || ticket.id} — verified canonical property pin — ${displayStatus(ticket)}`,
        icon: {
          path: maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: ['EMERGENCY', 'CRITICAL', 'P0'].includes(priority) ? '#ef4444' : '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
        },
      });
      markerRefs.current.push(marker);
      bounds.extend(pin.point);
      pointCount += 1;
    }

    if (pointCount > 0) {
      mapRef.current.fitBounds(bounds, 72);
      if (pointCount === 1) mapRef.current.setZoom(15);
    } else {
      mapRef.current.setCenter(UAE_CENTRE);
      mapRef.current.setZoom(7);
    }
  }, [freshLocations, mapReady, ticketsWithVerifiedPins]);

  const unassignedCount = tickets.filter((ticket) => [
    'UNASSIGNED',
    'OPEN',
    'PENDING',
    'PENDING_ASSIGNMENT',
  ].includes(normalizeMaintenanceTicketStatus(ticket.status))).length;
  const assignedCount = Math.max(0, tickets.length - unassignedCount);

  const dispatch = async (technician: any) => {
    if (!selectedTicket || dispatchBusy || techniciansError) return;
    setDispatchBusy(true);
    setDispatchError('');
    try {
      const assignTechnician = httpsCallable(functions, 'adminAssignTechnician');
      await assignTechnician({
        ticketId: selectedTicket.id,
        technicianId: technician.id,
      });
      setSelectedTicket(null);
    } catch (error: any) {
      console.error('[AdminMap] Dispatch failed:', error);
      setDispatchError(error?.message || 'Dispatch failed. No assignment state was claimed.');
    } finally {
      setDispatchBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100%', bgcolor: '#020617', color: '#fff', p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900 }}>Operational Dispatch Map</Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            Google Maps with every canonical unresolved ticket state, verified property pins and fresh Technician GPS. Legacy or unreviewed ticket coordinates are never labelled verified.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={`${tickets.length} unresolved tickets`} sx={{ color: '#fff', bgcolor: '#172033' }} />
          <Chip label={`${unassignedCount} awaiting assignment`} sx={{ color: '#fff', bgcolor: '#172033' }} />
          <Chip label={`${assignedCount} assigned / exceptional`} sx={{ color: '#fff', bgcolor: '#172033' }} />
          <Chip label={`${ticketsWithVerifiedPins.length} verified property pins`} sx={{ color: '#fff', bgcolor: '#1e3a8a' }} />
          <Chip label={`${freshLocations.length} fresh GPS sessions`} sx={{ color: '#fff', bgcolor: '#064e3b' }} />
        </Stack>
      </Stack>

      {[ticketsError, techniciansError, propertiesError, locationsError].filter(Boolean).map((message) => (
        <Alert key={message} severity="error" sx={{ mb: 1 }}>{message}</Alert>
      ))}

      <Grid container spacing={2}>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', maxHeight: { lg: '76vh' }, overflow: 'auto' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <Typography sx={{ fontWeight: 900 }}>Unresolved ticket feed</Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>All canonical unresolved lifecycle classes. Verification labels come only from canonical property metadata.</Typography>
            </Box>
            <List disablePadding>
              {tickets.map((ticket) => {
                const verifiedPin = verifiedPinForTicket(ticket, propertiesById);
                const recordedPoint = recordedTicketCoordinate(ticket);
                const normalizedStatus = normalizeMaintenanceTicketStatus(ticket.status);
                const canAssign = ['UNASSIGNED', 'OPEN', 'PENDING', 'PENDING_ASSIGNMENT'].includes(normalizedStatus);
                const avatarColour = verifiedPin ? '#1d4ed8' : recordedPoint ? '#b45309' : '#475569';
                return (
                  <ListItem key={ticket.id} alignItems="flex-start" divider secondaryAction={
                    canAssign ? (
                      <Button size="small" variant="contained" onClick={() => setSelectedTicket(ticket)} disabled={Boolean(techniciansError)}>
                        Assign
                      </Button>
                    ) : undefined
                  }>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: avatarColour }}><RoomIcon /></Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={ticket.propertyName || ticket.unit || ticket.id}
                      secondary={
                        <Box component="span" sx={{ display: 'block', color: '#94a3b8', pr: canAssign ? 8 : 0 }}>
                          {displayStatus(ticket)}<br />
                          {ticket.issueDescription || ticket.issue || 'Maintenance request'}<br />
                          {verifiedPin ? (
                            <>
                              <Typography component="span" variant="caption" sx={{ display: 'block', color: '#93c5fd', mt: 0.5 }}>
                                Canonical property pin verified by {verifiedPin.verifiedBy} on {verificationDate(verifiedPin.verifiedAtMs)}.
                              </Typography>
                              <Button
                                size="small"
                                endIcon={<OpenInNewIcon />}
                                href={googleMapsSearchUrl(verifiedPin.point.lat, verifiedPin.point.lng)}
                                target="_blank"
                                rel="noreferrer"
                                sx={{ px: 0, mt: 0.5 }}
                              >
                                Open verified property pin
                              </Button>
                            </>
                          ) : recordedPoint ? (
                            <>
                              <Typography component="span" variant="caption" sx={{ display: 'block', color: '#fbbf24', mt: 0.5 }}>
                                Recorded coordinate is unverified and is not rendered as an operational map marker.
                              </Typography>
                              <Button
                                size="small"
                                endIcon={<OpenInNewIcon />}
                                href={googleMapsSearchUrl(recordedPoint.lat, recordedPoint.lng)}
                                target="_blank"
                                rel="noreferrer"
                                sx={{ px: 0, mt: 0.5, color: '#fbbf24' }}
                              >
                                Open recorded coordinate (unverified)
                              </Button>
                            </>
                          ) : 'Exact verified property pin missing — dispatch distance cannot be verified.'}
                        </Box>
                      }
                    />
                  </ListItem>
                );
              })}
              {ticketsLoading && !ticketsError && (
                <ListItem><ListItemText primary="Loading every bounded unresolved ticket-status query…" /></ListItem>
              )}
              {!ticketsLoading && !tickets.length && !ticketsError && (
                <ListItem><ListItemText primary="No unresolved tickets returned by the complete bounded production query set." /></ListItem>
              )}
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={8}>
          <Paper sx={{ position: 'relative', minHeight: { xs: 520, lg: '76vh' }, overflow: 'hidden', bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Box ref={mapElementRef} data-testid="admin-live-google-map" sx={{ position: 'absolute', inset: 0 }} />
            {!mapReady && !mapError && (
              <Stack alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0, bgcolor: '#0f172a' }}>
                <CircularProgress />
                <Typography sx={{ mt: 2 }}>Loading Google Maps…</Typography>
              </Stack>
            )}
            {mapError && (
              <Alert data-testid="admin-live-map-error" severity="error" sx={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 5 }}>
                {mapError} Check the Maps key, billing, enabled APIs and production referrer restrictions.
              </Alert>
            )}
            {mapReady && freshLocations.length === 0 && ticketsWithVerifiedPins.length === 0 && (
              <Alert severity="warning" sx={{ position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 5 }}>
                No fresh canonical GPS session or verified canonical property pin is available. No markers have been fabricated.
              </Alert>
            )}
            {mapReady && (
              <Paper sx={{ position: 'absolute', top: 16, right: 16, zIndex: 4, p: 1.5, bgcolor: 'rgba(15,23,42,0.92)', color: '#fff' }}>
                <Stack spacing={0.5}>
                  <Typography variant="caption"><Box component="span" sx={{ color: '#10b981' }}>●</Box> Fresh Technician GPS</Typography>
                  <Typography variant="caption"><Box component="span" sx={{ color: '#3b82f6' }}>◆</Box> Canonical verified property pin</Typography>
                  <Typography variant="caption"><Box component="span" sx={{ color: '#ef4444' }}>◆</Box> Critical verified property pin</Typography>
                </Stack>
              </Paper>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={Boolean(selectedTicket)} onClose={() => !dispatchBusy && setSelectedTicket(null)} fullWidth maxWidth="sm">
        <DialogTitle>Assign Technician</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Ticket: {selectedTicket?.propertyName || selectedTicket?.unit || selectedTicket?.id}
          </Typography>
          {dispatchError && <Alert severity="error" sx={{ mb: 2 }}>{dispatchError}</Alert>}
          <List>
            {technicians.map((technician) => (
              <ListItem key={technician.id} divider secondaryAction={
                <Button onClick={() => dispatch(technician)} disabled={dispatchBusy}>Assign</Button>
              }>
                <ListItemAvatar>
                  <Avatar><PersonPinCircleIcon /></Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={technician.displayName || technician.name || technician.id}
                  secondary={`${technician.onDuty === true ? 'On duty' : 'Duty state not verified'} · ${technician.isAvailable === false ? 'Unavailable' : 'Availability requires server validation'}`}
                />
              </ListItem>
            ))}
            {!technicians.length && !techniciansError && (
              <ListItem><ListItemText primary="No eligible Technician records are available." /></ListItem>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedTicket(null)} disabled={dispatchBusy}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
