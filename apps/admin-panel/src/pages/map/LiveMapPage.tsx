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
import { db, functions } from '../../lib/firebase';
import { googleMapsSearchUrl, loadAdminGoogleMaps } from '../../lib/googleMaps';

const ACTIVE_TICKET_STATUSES = [
  'UNASSIGNED',
  'OPEN',
  'ASSIGNED',
  'ACCEPTED',
  'EN_ROUTE',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'open',
  'assigned',
];

const UAE_CENTRE = { lat: 24.4009, lng: 54.6938 };

type Coordinate = { lat: number; lng: number };

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

const timestampMillis = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value.seconds)) return Number(value.seconds) * 1000;
  if (Number.isFinite(value)) return Number(value);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const coordinate = (value: any): Coordinate | null => {
  if (!value) return null;
  const source = value.location || value;
  const lat = Number(source.lat ?? source.latitude);
  const lng = Number(source.lng ?? source.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
};

const ticketCoordinate = (ticket: any): Coordinate | null =>
  coordinate(ticket.jobLocation) ||
  coordinate(ticket.propertyLocation) ||
  coordinate(ticket.location) ||
  null;

const liveLocationIsFresh = (location: LiveLocation) => {
  if (location.isTracking !== true) return false;
  const expiresAt = timestampMillis(location.expiresAt);
  const updatedAt = timestampMillis(location.serverUpdatedAt || location.location?.serverUpdatedAt);
  if (expiresAt !== null && expiresAt <= Date.now()) return false;
  if (updatedAt === null || Date.now() - updatedAt > 120_000) return false;
  return Boolean(coordinate(location.location));
};

const displayStatus = (ticket: any) => {
  const status = String(ticket.status || '').trim().toUpperCase();
  if (status === 'UNASSIGNED' || status === 'OPEN') return 'Awaiting assignment';
  if (status === 'EN_ROUTE' || status === 'ON_THE_WAY') return 'Technician en route';
  if (status === 'ARRIVED') return 'Technician arrived';
  if (status === 'IN_PROGRESS') return 'Work in progress';
  return ticket.assignedTechnicianName || ticket.assignedTechnicianId
    ? `Assigned to ${ticket.assignedTechnicianName || ticket.assignedTechnicianId}`
    : status || 'Active';
};

export default function LiveMapPage() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);

  const [tickets, setTickets] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([]);
  const [ticketsError, setTicketsError] = useState('');
  const [techniciansError, setTechniciansError] = useState('');
  const [locationsError, setLocationsError] = useState('');
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchError, setDispatchError] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);

  useEffect(() => {
    const ticketQuery = query(
      collection(db, 'maintenanceTickets'),
      where('status', 'in', ACTIVE_TICKET_STATUSES),
      limit(100),
    );
    const technicianQuery = query(collection(db, 'technicians'), limit(100));
    const locationQuery = query(
      collection(db, 'technician_live_locations'),
      where('isTracking', '==', true),
      limit(200),
    );

    const unsubscribeTickets = onSnapshot(ticketQuery, (snapshot) => {
      setTickets(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setTicketsError('');
    }, (error) => {
      console.error('[AdminMap] Ticket listener failed:', error);
      setTickets([]);
      setTicketsError('Active tickets could not be loaded. Check App Check, permissions, network and Firestore indexes.');
    });

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

    const unsubscribeLocations = onSnapshot(locationQuery, (snapshot) => {
      setLiveLocations(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as LiveLocation)));
      setLocationsError('');
    }, (error) => {
      console.error('[AdminMap] Canonical location listener failed:', error);
      setLiveLocations([]);
      setLocationsError('Canonical live GPS data could not be loaded. The map will not simulate or infer technician positions.');
    });

    return () => {
      unsubscribeTickets();
      unsubscribeTechnicians();
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

  const freshLocations = useMemo(
    () => liveLocations.filter(liveLocationIsFresh),
    [liveLocations],
  );

  const ticketsWithCoordinates = useMemo(
    () => tickets.map((ticket) => ({ ticket, point: ticketCoordinate(ticket) })).filter((item) => item.point),
    [tickets],
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
      const point = coordinate(location.location);
      if (!point) continue;
      const marker = new maps.Marker({
        map: mapRef.current,
        position: point,
        title: `${location.technicianName || 'Technician'} — live GPS`,
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

    for (const { ticket, point } of ticketsWithCoordinates as Array<{ ticket: any; point: Coordinate }>) {
      const priority = String(ticket.priority || ticket.severity || '').toUpperCase();
      const marker = new maps.Marker({
        map: mapRef.current,
        position: point,
        title: `${ticket.propertyName || ticket.unit || ticket.id} — ${displayStatus(ticket)}`,
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
      bounds.extend(point);
      pointCount += 1;
    }

    if (pointCount > 0) {
      mapRef.current.fitBounds(bounds, 72);
      if (pointCount === 1) mapRef.current.setZoom(15);
    } else {
      mapRef.current.setCenter(UAE_CENTRE);
      mapRef.current.setZoom(7);
    }
  }, [freshLocations, mapReady, ticketsWithCoordinates]);

  const unassignedCount = tickets.filter((ticket) => ['UNASSIGNED', 'OPEN', 'open'].includes(String(ticket.status || ''))).length;
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
            Google Maps with verified Firebase ticket pins and canonical Technician GPS. Missing coordinates are shown as missing—not simulated.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={`${tickets.length} active tickets`} sx={{ color: '#fff', bgcolor: '#172033' }} />
          <Chip label={`${unassignedCount} awaiting assignment`} sx={{ color: '#fff', bgcolor: '#172033' }} />
          <Chip label={`${assignedCount} assigned`} sx={{ color: '#fff', bgcolor: '#172033' }} />
          <Chip label={`${freshLocations.length} fresh GPS sessions`} sx={{ color: '#fff', bgcolor: '#064e3b' }} />
        </Stack>
      </Stack>

      {[ticketsError, techniciansError, locationsError].filter(Boolean).map((message) => (
        <Alert key={message} severity="error" sx={{ mb: 1 }}>{message}</Alert>
      ))}

      <Grid container spacing={2}>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', maxHeight: { lg: '76vh' }, overflow: 'auto' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <Typography sx={{ fontWeight: 900 }}>Active ticket feed</Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Server states only. No AI or notification provider claim is inferred.</Typography>
            </Box>
            <List disablePadding>
              {tickets.map((ticket) => {
                const point = ticketCoordinate(ticket);
                const canAssign = ['UNASSIGNED', 'OPEN', 'open'].includes(String(ticket.status || ''));
                return (
                  <ListItem key={ticket.id} alignItems="flex-start" divider secondaryAction={
                    canAssign ? (
                      <Button size="small" variant="contained" onClick={() => setSelectedTicket(ticket)} disabled={Boolean(techniciansError)}>
                        Assign
                      </Button>
                    ) : undefined
                  }>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: point ? '#1d4ed8' : '#475569' }}><RoomIcon /></Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={ticket.propertyName || ticket.unit || ticket.id}
                      secondary={
                        <Box component="span" sx={{ display: 'block', color: '#94a3b8', pr: canAssign ? 8 : 0 }}>
                          {displayStatus(ticket)}<br />
                          {ticket.issueDescription || ticket.issue || 'Maintenance request'}<br />
                          {point ? (
                            <Button
                              size="small"
                              endIcon={<OpenInNewIcon />}
                              href={googleMapsSearchUrl(point.lat, point.lng)}
                              target="_blank"
                              rel="noreferrer"
                              sx={{ px: 0, mt: 0.5 }}
                            >
                              Open verified pin
                            </Button>
                          ) : 'Exact property pin missing — dispatch distance cannot be verified.'}
                        </Box>
                      }
                    />
                  </ListItem>
                );
              })}
              {!tickets.length && !ticketsError && (
                <ListItem><ListItemText primary="No active tickets returned by the bounded production query." /></ListItem>
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
            {mapReady && freshLocations.length === 0 && ticketsWithCoordinates.length === 0 && (
              <Alert severity="warning" sx={{ position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 5 }}>
                No fresh canonical GPS session or verified ticket coordinate is available. No markers have been fabricated.
              </Alert>
            )}
            {mapReady && (
              <Paper sx={{ position: 'absolute', top: 16, right: 16, zIndex: 4, p: 1.5, bgcolor: 'rgba(15,23,42,0.92)', color: '#fff' }}>
                <Stack spacing={0.5}>
                  <Typography variant="caption"><Box component="span" sx={{ color: '#10b981' }}>●</Box> Fresh Technician GPS</Typography>
                  <Typography variant="caption"><Box component="span" sx={{ color: '#3b82f6' }}>◆</Box> Verified ticket/property pin</Typography>
                  <Typography variant="caption"><Box component="span" sx={{ color: '#ef4444' }}>◆</Box> Critical verified ticket pin</Typography>
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
