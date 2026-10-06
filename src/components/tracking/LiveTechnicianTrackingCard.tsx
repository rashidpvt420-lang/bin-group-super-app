/**
 * BIN GROUP - LiveTechnicianTrackingCard
 * Shared Owner/Tenant live tracking surface. It renders an embedded Google
 * map for verified job and technician coordinates, preserves GPS freshness
 * truth, and keeps an external Google Maps route fallback.
 */
import React, { useEffect, useRef } from 'react';
import {
    Avatar,
    Box,
    Button,
    Chip,
    Divider,
    IconButton,
    LinearProgress,
    Paper,
    Stack,
    Tooltip,
    Typography,
    alpha,
} from '@mui/material';
import {
    AlertCircle,
    CheckCircle,
    Clock,
    ExternalLink,
    Flag,
    MapPin,
    MessageSquare,
    Navigation,
    Phone,
    Play,
    Wifi,
    WifiOff,
} from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useGoogleMaps } from '../../lib/maps';
import {
    buildGoogleMapsDirectionsUrl,
    calculateDistanceKm,
    calculateEtaMinutes,
    getStaleLabel,
    getTechnicianLocation,
    getTicketJobLocation,
    isLocationStale,
    isTrackingActive,
    normalizeTicketStatus,
} from '../../utils/liveTracking';

interface LiveTechnicianTrackingCardProps {
    ticket: any;
    onChatClick?: () => void;
    onCallClick?: () => void;
    showTimeline?: boolean;
}

const DISPLAY_STEPS = [
    { key: 'open', label: 'Complaint Created', icon: Flag },
    { key: 'accepted', label: 'Technician Assigned', icon: CheckCircle },
    { key: 'on_the_way', label: 'On The Way', icon: Navigation },
    { key: 'arrived', label: 'Arrived', icon: MapPin },
    { key: 'in_progress', label: 'Work Started', icon: Play },
    { key: 'completed', label: 'Completed', icon: CheckCircle },
];

const STEP_ORDER = DISPLAY_STEPS.map((step) => step.key);

function getProgressValue(status: string): number {
    switch (normalizeTicketStatus(status)) {
        case 'completed': return 100;
        case 'in_progress': return 80;
        case 'arrived': return 65;
        case 'on_the_way': return 45;
        case 'accepted': return 20;
        case 'open': return 5;
        default: return 5;
    }
}

function locationTimestamp(ticket: any, techLocation: any) {
    return ticket?.technicianLocationUpdatedAt ||
        techLocation?.serverUpdatedAt ||
        techLocation?.updatedAt ||
        techLocation?.timestamp ||
        null;
}

function getStatusMessage(ticket: any, etaMin: number | null, trackingFresh: boolean, locationStale: boolean): string {
    const status = normalizeTicketStatus(ticket?.status);
    switch (status) {
        case 'completed': return 'Job Completed';
        case 'in_progress': return 'Work in Progress';
        case 'arrived': return 'Technician Has Arrived';
        case 'on_the_way':
            if (trackingFresh && etaMin !== null) return `Technician en route - rough arrival estimate ${etaMin} min`;
            if (locationStale) return 'Technician en route — GPS location is stale';
            return 'Technician en route — waiting for a fresh GPS point';
        case 'accepted':
            return ticket?.assignedTechnicianName
                ? `${ticket.assignedTechnicianName} Assigned`
                : 'Technician Assigned';
        default: return 'Awaiting Technician Assignment';
    }
}


type TrackingMapProps = {
    technicianLocation: any;
    jobLocation: any;
    trackingRequested: boolean;
    trackingFresh: boolean;
    locationStale: boolean;
    mapsUrl: string;
    jobMapsUrl: string | null;
};

function LiveTrackingMap({
    technicianLocation,
    jobLocation,
    trackingRequested,
    trackingFresh,
    locationStale,
    mapsUrl,
    jobMapsUrl,
}: TrackingMapProps) {
    const { isLoaded, loadError } = useGoogleMaps();
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapObjRef = useRef<any>(null);
    const technicianMarkerRef = useRef<any>(null);
    const jobMarkerRef = useRef<any>(null);
    const routeLineRef = useRef<any>(null);

    useEffect(() => {
        if (!isLoaded || !mapDivRef.current || !jobLocation) return;

        const google = (window as any).google;
        if (!google?.maps) return;

        const map = mapObjRef.current || new google.maps.Map(mapDivRef.current, {
            center: { lat: jobLocation.lat, lng: jobLocation.lng },
            zoom: technicianLocation ? 14 : 16,
            mapTypeId: 'roadmap',
            disableDefaultUI: true,
            zoomControl: true,
            fullscreenControl: true,
            gestureHandling: 'cooperative',
        });
        mapObjRef.current = map;

        if (!jobMarkerRef.current) {
            jobMarkerRef.current = new google.maps.Marker({
                map,
                position: { lat: jobLocation.lat, lng: jobLocation.lng },
                title: 'Service location',
                label: { text: 'JOB', fontWeight: '700' },
            });
        } else {
            jobMarkerRef.current.setMap(map);
            jobMarkerRef.current.setPosition({ lat: jobLocation.lat, lng: jobLocation.lng });
        }

        if (technicianLocation) {
            if (!technicianMarkerRef.current) {
                technicianMarkerRef.current = new google.maps.Marker({
                    map,
                    position: { lat: technicianLocation.lat, lng: technicianLocation.lng },
                    title: trackingFresh ? 'Live technician position' : 'Last known technician position',
                    label: { text: 'TECH', fontWeight: '700' },
                });
            } else {
                technicianMarkerRef.current.setMap(map);
                technicianMarkerRef.current.setPosition({ lat: technicianLocation.lat, lng: technicianLocation.lng });
                technicianMarkerRef.current.setTitle(trackingFresh ? 'Live technician position' : 'Last known technician position');
            }
            technicianMarkerRef.current.setOpacity(trackingFresh ? 1 : 0.45);

            const path = [
                { lat: technicianLocation.lat, lng: technicianLocation.lng },
                { lat: jobLocation.lat, lng: jobLocation.lng },
            ];
            if (!routeLineRef.current) {
                routeLineRef.current = new google.maps.Polyline({
                    map,
                    path,
                    geodesic: true,
                    strokeOpacity: trackingFresh ? 0.8 : 0.3,
                    strokeWeight: 3,
                });
            } else {
                routeLineRef.current.setMap(map);
                routeLineRef.current.setPath(path);
                routeLineRef.current.setOptions({ strokeOpacity: trackingFresh ? 0.8 : 0.3 });
            }

            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: technicianLocation.lat, lng: technicianLocation.lng });
            bounds.extend({ lat: jobLocation.lat, lng: jobLocation.lng });
            map.fitBounds(bounds, 56);
        } else {
            technicianMarkerRef.current?.setMap(null);
            routeLineRef.current?.setMap(null);
            map.setCenter({ lat: jobLocation.lat, lng: jobLocation.lng });
            map.setZoom(16);
        }
    }, [
        isLoaded,
        technicianLocation?.lat,
        technicianLocation?.lng,
        jobLocation?.lat,
        jobLocation?.lng,
        trackingFresh,
    ]);

    const fallbackUrl = technicianLocation && jobLocation ? mapsUrl : jobMapsUrl;

    return (
        <Box
            data-testid="technician-live-map"
            sx={{
                minHeight: { xs: 300, md: 360 },
                bgcolor: 'rgba(0,0,0,0.7)',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {isLoaded && jobLocation ? (
                <Box ref={mapDivRef} sx={{ position: 'absolute', inset: 0 }} />
            ) : (
                <Stack
                    alignItems="center"
                    justifyContent="center"
                    spacing={1.5}
                    sx={{ minHeight: { xs: 300, md: 360 }, px: 3, textAlign: 'center' }}
                >
                    <MapPin size={34} color={binThemeTokens.gold} />
                    <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900 }}>
                        {jobLocation
                            ? 'Embedded map is unavailable right now.'
                            : 'Verified job coordinates are unavailable.'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 460 }}>
                        {jobLocation
                            ? 'The tracking status below remains authoritative. Open Google Maps to view the verified location externally.'
                            : 'Dispatch distance and route cannot be shown until the job location is verified.'}
                    </Typography>
                    {fallbackUrl && (
                        <Button
                            size="small"
                            startIcon={<ExternalLink size={13} />}
                            onClick={() => window.open(fallbackUrl, '_blank', 'noopener,noreferrer')}
                            sx={{ color: binThemeTokens.gold, fontWeight: 900, textTransform: 'none' }}
                        >
                            Open in Google Maps
                        </Button>
                    )}
                    {loadError && (
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
                            Map fallback active
                        </Typography>
                    )}
                </Stack>
            )}

            <Stack
                direction="row"
                spacing={1}
                sx={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    right: 12,
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    pointerEvents: 'none',
                }}
            >
                <Chip
                    size="small"
                    label={
                        trackingFresh
                            ? 'LIVE TECHNICIAN GPS'
                            : technicianLocation
                                ? 'LAST KNOWN TECHNICIAN LOCATION'
                                : jobLocation
                                    ? 'JOB LOCATION'
                                    : 'LOCATION UNAVAILABLE'
                    }
                    sx={{
                        bgcolor: 'rgba(5,10,18,0.82)',
                        color: trackingFresh ? '#67e8f9' : '#FFF',
                        fontWeight: 950,
                        border: '1px solid rgba(255,255,255,0.16)',
                    }}
                />
                {trackingRequested && (
                    <Chip
                        size="small"
                        data-testid="technician-gps-freshness"
                        icon={trackingFresh ? <Wifi size={12} /> : <WifiOff size={12} />}
                        label={trackingFresh ? 'GPS LIVE' : locationStale ? 'GPS STALE' : 'GPS PENDING'}
                        sx={{
                            bgcolor: trackingFresh ? 'rgba(16,185,129,0.86)' : 'rgba(185,28,28,0.86)',
                            color: '#FFF',
                            fontWeight: 950,
                            '& .MuiChip-icon': { color: 'inherit' },
                        }}
                    />
                )}
            </Stack>

            {isLoaded && jobLocation && (
                <Button
                    size="small"
                    startIcon={<ExternalLink size={13} />}
                    onClick={() => window.open(fallbackUrl || mapsUrl, '_blank', 'noopener,noreferrer')}
                    sx={{
                        position: 'absolute',
                        left: 12,
                        bottom: 12,
                        bgcolor: 'rgba(5,10,18,0.84)',
                        color: '#FFF',
                        border: '1px solid rgba(255,255,255,0.16)',
                        fontWeight: 900,
                        textTransform: 'none',
                        '&:hover': { bgcolor: 'rgba(5,10,18,0.94)' },
                    }}
                >
                    Open route in Google Maps
                </Button>
            )}
        </Box>
    );
}

export default function LiveTechnicianTrackingCard({
    ticket,
    onChatClick,
    onCallClick,
    showTimeline = true,
}: LiveTechnicianTrackingCardProps) {
    if (!ticket) return null;

    const technicianLocation = getTechnicianLocation(ticket);
    const jobLocation = getTicketJobLocation(ticket);
    const locationUpdatedAt = locationTimestamp(ticket, technicianLocation);
    const locationStale = isLocationStale(locationUpdatedAt, 2);
    const trackingRequested = isTrackingActive(ticket.status, ticket.trackingStatus);
    const trackingFresh = Boolean(trackingRequested && technicianLocation && !locationStale);
    const straightLineDistanceKm = calculateDistanceKm(technicianLocation, jobLocation);
    const straightLineEstimateMinutes = trackingFresh ? calculateEtaMinutes(straightLineDistanceKm) : null;
    const staleLabel = getStaleLabel(locationUpdatedAt);
    const normalisedStatus = normalizeTicketStatus(ticket.status);
    const isCompleted = normalisedStatus === 'completed';
    const isAssigned = Boolean(ticket.assignedTechnicianId);
    const progressValue = getProgressValue(ticket.status);
    const statusMessage = getStatusMessage(ticket, straightLineEstimateMinutes, trackingFresh, locationStale);
    const mapsUrl = buildGoogleMapsDirectionsUrl(technicianLocation, jobLocation);
    const jobMapsUrl = jobLocation
        ? `https://www.google.com/maps/search/?api=1&query=${jobLocation.lat},${jobLocation.lng}`
        : null;

    const progressColor = isCompleted
        ? '#10b981'
        : trackingFresh
            ? '#22d3ee'
            : binThemeTokens.gold;

    return (
        <Paper
            sx={{
                bgcolor: 'rgba(11, 11, 16, 0.9)',
                border: `1px solid ${isCompleted
                    ? 'rgba(16,185,129,0.3)'
                    : trackingFresh
                        ? 'rgba(34,211,238,0.3)'
                        : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 5,
                overflow: 'hidden',
            }}
        >
            <LiveTrackingMap
                technicianLocation={technicianLocation}
                jobLocation={jobLocation}
                trackingRequested={trackingRequested}
                trackingFresh={trackingFresh}
                locationStale={locationStale}
                mapsUrl={mapsUrl}
                jobMapsUrl={jobMapsUrl}
            />

            <Box sx={{ p: { xs: 2.5, md: 3 }, pr: { xs: 9, md: 3 }, pb: { xs: 12, md: 3 } }}>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                    <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ overflowWrap: 'anywhere', lineHeight: 1.3 }}>
                        {statusMessage}
                    </Typography>
                    {trackingRequested && (
                        trackingFresh
                            ? <Tooltip title="Foreground GPS point is fresh"><Wifi size={18} color="#22d3ee" /></Tooltip>
                            : <Tooltip title="GPS point is missing or stale"><WifiOff size={18} color="#f87171" /></Tooltip>
                    )}
                </Stack>

                {technicianLocation && (
                    <Typography variant="caption" sx={{ color: locationStale ? '#f87171' : 'rgba(255,255,255,0.45)', display: 'block', mb: 2, fontWeight: 700 }}>
                        {staleLabel} · Foreground-browser tracking only
                    </Typography>
                )}

                {(straightLineEstimateMinutes !== null || straightLineDistanceKm !== null) && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2.5 }}>
                        {straightLineEstimateMinutes !== null && (
                            <Chip
                                icon={<Clock size={13} />}
                                label={`~${straightLineEstimateMinutes} min rough arrival estimate`}
                                size="small"
                                sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900, border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`, '& .MuiChip-icon': { color: binThemeTokens.gold } }}
                            />
                        )}
                        {straightLineDistanceKm !== null && (
                            <Chip
                                icon={<Navigation size={13} />}
                                label={`${straightLineDistanceKm.toFixed(1)} km approximate straight-line distance`}
                                size="small"
                                sx={{ bgcolor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.65)', fontWeight: 900, border: '1px solid rgba(255,255,255,0.08)', '& .MuiChip-icon': { color: 'rgba(255,255,255,0.45)' } }}
                            />
                        )}
                    </Stack>
                )}

                <LinearProgress
                    variant="determinate"
                    value={progressValue}
                    sx={{
                        height: 5,
                        borderRadius: 3,
                        mb: 3,
                        bgcolor: 'rgba(255,255,255,0.06)',
                        '& .MuiLinearProgress-bar': { bgcolor: progressColor, borderRadius: 3, transition: 'width 0.8s ease' },
                    }}
                />

                {isAssigned && (
                    <Box sx={{ mb: 3 }}>
                        <Divider sx={{ mb: 2.5, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                            <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                                <Avatar
                                    src={ticket.assignedTechnicianAvatar || ticket.technicianPhotoURL}
                                    sx={{ width: 48, height: 48, bgcolor: alpha(binThemeTokens.gold, 0.15), color: binThemeTokens.gold, fontWeight: 900, flexShrink: 0 }}
                                >
                                    {(ticket.assignedTechnicianName || 'T').charAt(0)}
                                </Avatar>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" fontWeight="950" color="#FFF" sx={{ overflowWrap: 'anywhere' }}>
                                        {ticket.assignedTechnicianName || 'Technician'}
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 700 }}>
                                        {ticket.assignedTechnicianSpecialty || ticket.technicianSpecialty || 'Maintenance Specialist'}
                                    </Typography>
                                    {(ticket.assignedTechnicianPhone || ticket.technicianPhone) && (
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, display: 'block', fontWeight: 900 }}>
                                            {ticket.assignedTechnicianPhone || ticket.technicianPhone}
                                        </Typography>
                                    )}
                                </Box>
                            </Stack>
                            <Stack direction="row" spacing={1} flexShrink={0}>
                                {onChatClick && (
                                    <Tooltip title="Chat with Technician">
                                        <IconButton size="small" onClick={onChatClick} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#FFF' }}>
                                            <MessageSquare size={18} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                                <Tooltip title="Call Technician">
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            if (onCallClick) onCallClick();
                                            else {
                                                const phone = ticket.assignedTechnicianPhone || ticket.technicianPhone;
                                                if (phone) window.open(`tel:${phone}`);
                                            }
                                        }}
                                        sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}
                                    >
                                        <Phone size={18} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        </Stack>
                    </Box>
                )}

                {showTimeline && (
                    <>
                        <Divider sx={{ mb: 2.5, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900, letterSpacing: 2, mb: 2, display: 'block' }}>
                            STATUS TIMELINE
                        </Typography>
                        <Stack spacing={2}>
                            {DISPLAY_STEPS.map((step) => {
                                const currentIndex = STEP_ORDER.indexOf(normalisedStatus);
                                const stepIndex = STEP_ORDER.indexOf(step.key);
                                const done = stepIndex <= currentIndex;
                                const current = stepIndex === currentIndex;
                                const StepIcon = step.icon;
                                return (
                                    <Stack key={step.key} direction="row" spacing={2} alignItems="center">
                                        <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: done ? (current ? progressColor : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.04)', border: `2px solid ${done ? progressColor : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <StepIcon size={13} color={done ? (current ? '#000' : '#FFF') : 'rgba(255,255,255,0.2)'} />
                                        </Box>
                                        <Typography variant="caption" fontWeight={current ? 950 : 700} sx={{ color: current ? '#FFF' : done ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)', overflowWrap: 'anywhere' }}>
                                            {step.label}
                                        </Typography>
                                    </Stack>
                                );
                            })}
                        </Stack>
                    </>
                )}
            </Box>
        </Paper>
    );
}
