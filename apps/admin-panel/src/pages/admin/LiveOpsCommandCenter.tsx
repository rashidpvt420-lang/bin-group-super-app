import React, { useEffect, useMemo, useState } from 'react';
import { Activity, MapPin, Radio, Users, Zap } from 'lucide-react';
import { Alert, Avatar, Box, Chip, Grid, Paper, Stack, Typography } from '@mui/material';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const Icon = ({ icon: IconComponent, size = 16, color = 'currentColor' }: { icon: any; size?: number; color?: string }) => (
    <IconComponent size={size} color={color} />
);

interface TechnicianLocation {
    id: string;
    technicianId: string;
    name: string | null;
    lat: number | null;
    lng: number | null;
    speed: number | null;
    accuracy: number | null;
    status: 'TRACKING' | 'STOPPED';
    lastUpdate: any;
    jobId: string | null;
    expiresAt: any;
}

interface LiveEvent {
    id: string;
    type: 'EMERGENCY' | 'TRIAGE' | 'RESOLVED' | 'INFO';
    title: string;
    location: string;
    time: string;
}

function normalizeStatus(value: unknown) {
    return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function finiteNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function eventTime(value: any) {
    if (!value) return 'Timestamp unavailable';
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Timestamp unavailable'
        : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeTechnicianLocation(docSnap: any): TechnicianLocation {
    const data = docSnap.data() || {};
    const location = data.location && typeof data.location === 'object' ? data.location : {};
    return {
        id: docSnap.id,
        technicianId: String(data.technicianUid || docSnap.id),
        name: data.technicianName ? String(data.technicianName) : null,
        lat: finiteNumber(location.lat ?? location.latitude),
        lng: finiteNumber(location.lng ?? location.longitude),
        speed: finiteNumber(location.speed),
        accuracy: finiteNumber(location.accuracy),
        status: data.isTracking === true ? 'TRACKING' : 'STOPPED',
        lastUpdate: data.serverUpdatedAt || location.serverUpdatedAt || null,
        jobId: data.activeTicketId ? String(data.activeTicketId) : null,
        expiresAt: data.expiresAt || null,
    };
}

export default function LiveOpsCommandCenter() {
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
    const [activeTechs, setActiveTechs] = useState<TechnicianLocation[]>([]);
    const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
    const [ticketTotal, setTicketTotal] = useState(0);
    const [completedTickets, setCompletedTickets] = useState(0);
    const [telemetryError, setTelemetryError] = useState<string | null>(null);
    const [ticketError, setTicketError] = useState<string | null>(null);

    useEffect(() => {
        const timer = window.setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);

        const qTechs = query(collection(db, 'technician_live_locations'), limit(50));
        const unsubTechs = onSnapshot(
            qTechs,
            (snapshot) => {
                setTelemetryError(null);
                setActiveTechs(snapshot.docs.map(normalizeTechnicianLocation));
            },
            (error) => {
                console.error('[LiveOps] canonical technician telemetry listener failed:', error);
                setActiveTechs([]);
                setTelemetryError('Technician live-location evidence is currently unavailable.');
            },
        );

        const qTickets = query(collection(db, 'maintenanceTickets'), orderBy('createdAt', 'desc'), limit(50));
        const unsubTickets = onSnapshot(
            qTickets,
            (snapshot) => {
                setTicketError(null);
                const docs = snapshot.docs;
                const events: LiveEvent[] = docs.slice(0, 15).map((docSnap) => {
                    const data = docSnap.data();
                    const status = normalizeStatus(data.status);
                    const priority = normalizeStatus(data.priority);
                    const type: LiveEvent['type'] =
                        priority === 'HIGH' || priority === 'EMERGENCY' || status === 'EMERGENCY_SUBMITTED'
                            ? 'EMERGENCY'
                            : ['COMPLETED', 'RESOLVED', 'CLOSED'].includes(status)
                                ? 'RESOLVED'
                                : 'TRIAGE';
                    return {
                        id: docSnap.id,
                        type,
                        title: String(data.issueType || data.serviceType || data.title || 'Maintenance request'),
                        location: String(data.propertyName || data.propertyAddress || data.address || data.unitId || 'Location not recorded'),
                        time: eventTime(data.createdAt),
                    };
                });

                setLiveEvents(events);
                setTicketTotal(docs.length);
                setCompletedTickets(docs.filter((docSnap) => ['COMPLETED', 'RESOLVED', 'CLOSED'].includes(normalizeStatus(docSnap.data().status))).length);
            },
            (error) => {
                console.error('[LiveOps] ticket listener failed:', error);
                setLiveEvents([]);
                setTicketTotal(0);
                setCompletedTickets(0);
                setTicketError('Live maintenance tickets are currently unavailable.');
            },
        );

        return () => {
            window.clearInterval(timer);
            unsubTechs();
            unsubTickets();
        };
    }, []);

    const queueClearance = ticketTotal > 0 ? Math.round((completedTickets / ticketTotal) * 100) : null;
    const trackingTechs = useMemo(() => activeTechs.filter((tech) => tech.status === 'TRACKING'), [activeTechs]);
    const coordinatesAvailable = useMemo(
        () => trackingTechs.filter((tech) => tech.lat !== null && tech.lng !== null).length,
        [trackingTechs],
    );

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: '#020617', minHeight: '100vh', color: '#f8fafc' }}>
            <Box sx={{ mb: 4, display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                        <Box sx={{ bgcolor: '#3b82f6', p: 1, borderRadius: 2 }}><Icon icon={Radio} size={24} color="white" /></Box>
                        <Typography variant="h4" fontWeight={900} sx={{ letterSpacing: -2, fontStyle: 'italic' }}>
                            LIVE OPS <Box component="span" sx={{ color: '#3b82f6' }}>COMMAND</Box>
                        </Typography>
                    </Stack>
                    <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 900, letterSpacing: 4 }}>
                        Canonical production telemetry · {currentTime}
                    </Typography>
                </Box>

                <Stack direction="row" spacing={4}>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="h6" fontWeight={900} sx={{ color: '#10b981' }}>
                            {queueClearance === null ? 'N/A' : `${queueClearance}%`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 900 }}>QUEUE CLEARANCE</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="h6" fontWeight={900} sx={{ color: '#3b82f6' }}>{trackingTechs.length}</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 900 }}>LIVE TRACKING SESSIONS</Typography>
                    </Box>
                </Stack>
            </Box>

            {(telemetryError || ticketError) && (
                <Stack spacing={1} sx={{ mb: 3 }}>
                    {telemetryError && <Alert severity="error">{telemetryError}</Alert>}
                    {ticketError && <Alert severity="error">{ticketError}</Alert>}
                </Stack>
            )}

            <Grid container spacing={3}>
                <Grid item xs={12} lg={7}>
                    <Paper sx={{ p: 3, bgcolor: '#0f172a', color: '#fff', borderRadius: 5, border: '1px solid rgba(255,255,255,0.05)', minHeight: 520 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                            <Typography variant="h6" fontWeight={900} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Icon icon={Users} size={20} color="#3b82f6" /> FIELD TELEMETRY
                            </Typography>
                            <Chip label={`${coordinatesAvailable}/${trackingTechs.length} GPS coordinates`} size="small" sx={{ color: '#93c5fd', bgcolor: 'rgba(59,130,246,0.1)' }} />
                        </Stack>

                        {trackingTechs.length === 0 && !telemetryError ? (
                            <Box sx={{ py: 12, textAlign: 'center', color: '#64748b' }}>
                                <Activity size={42} />
                                <Typography sx={{ mt: 2, fontWeight: 800 }}>No active technician GPS tracking session is being reported.</Typography>
                            </Box>
                        ) : (
                            <Grid container spacing={2}>
                                {trackingTechs.map((tech) => (
                                    <Grid item xs={12} md={6} key={tech.id}>
                                        <Box sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                                                <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                                                    <Avatar sx={{ bgcolor: '#334155', width: 38, height: 38 }}>
                                                        {String(tech.name || 'T').charAt(0)}
                                                    </Avatar>
                                                    <Box sx={{ minWidth: 0 }}>
                                                        <Typography variant="body2" fontWeight={900} noWrap>{tech.name || `TECH-${tech.technicianId.slice(-6)}`}</Typography>
                                                        <Typography variant="caption" sx={{ color: '#64748b' }}>{tech.jobId ? `Mission ${tech.jobId.slice(0, 8)}` : 'Mission not recorded'}</Typography>
                                                    </Box>
                                                </Stack>
                                                <Chip label={tech.status} size="small" sx={{ color: '#bfdbfe', bgcolor: 'rgba(59,130,246,0.08)', fontSize: 10 }} />
                                            </Stack>

                                            <Stack spacing={1.2} sx={{ mt: 2.5 }}>
                                                <Typography variant="caption" sx={{ color: '#94a3b8', display: 'flex', gap: 1, alignItems: 'center' }}>
                                                    <Icon icon={MapPin} size={13} />
                                                    {tech.lat === null || tech.lng === null ? 'GPS coordinates not reported' : `${tech.lat.toFixed(6)}, ${tech.lng.toFixed(6)}`}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                                    Speed: {tech.speed === null ? 'N/A' : `${tech.speed} m/s`}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                                    Accuracy: {tech.accuracy === null ? 'N/A' : `${tech.accuracy} m`}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                                    Last update: {eventTime(tech.lastUpdate)}
                                                </Typography>
                                            </Stack>
                                        </Box>
                                    </Grid>
                                ))}
                            </Grid>
                        )}
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={5}>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', color: '#fff', borderRadius: 5, border: '1px solid rgba(255,255,255,0.05)', minHeight: 520 }}>
                        <Typography variant="h6" fontWeight={900} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                            <Icon icon={Zap} size={20} color="#fbbf24" /> LIVE TICKETS
                        </Typography>

                        <Stack spacing={2}>
                            {liveEvents.length === 0 && !ticketError && (
                                <Typography variant="body2" sx={{ color: '#64748b', textAlign: 'center', py: 8 }}>
                                    No maintenance ticket records are currently available in this live window.
                                </Typography>
                            )}
                            {liveEvents.map((event) => (
                                <Box key={event.id} sx={{
                                    p: 2,
                                    borderRadius: 3,
                                    bgcolor: event.type === 'EMERGENCY' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                                    border: '1px solid',
                                    borderColor: event.type === 'EMERGENCY' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                                }}>
                                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography variant="subtitle2" fontWeight={900} noWrap>{event.title}</Typography>
                                            <Typography variant="caption" sx={{ color: '#64748b' }}>{event.location}</Typography>
                                        </Box>
                                        <Stack alignItems="flex-end" spacing={0.5}>
                                            <Chip label={event.type} size="small" sx={{ fontSize: 9, color: event.type === 'EMERGENCY' ? '#fca5a5' : '#fde68a' }} />
                                            <Typography variant="caption" sx={{ color: '#64748b', whiteSpace: 'nowrap' }}>{event.time}</Typography>
                                        </Stack>
                                    </Stack>
                                </Box>
                            ))}
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}