/**
 * BIN GROUP - LiveTechnicianTrackingCard
 * Shared Owner/Tenant tracking summary. This component does not render a
 * street map or road route; it displays verified points, freshness,
 * straight-line distance and an external Google Maps route link.
 */
import React from 'react';
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
    const straightLineEstimateMinutes = calculateEtaMinutes(straightLineDistanceKm);
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
            <Box
                data-testid="technician-tracking-summary"
                sx={{
                    minHeight: 190,
                    bgcolor: 'rgba(0,0,0,0.6)',
                    position: 'relative',
                    backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.08) 0%, transparent 70%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 1.25,
                    px: 2,
                    py: 3,
                }}
            >
                <Typography
                    variant="caption"
                    sx={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        color: 'rgba(255,255,255,0.45)',
                        fontWeight: 900,
                        letterSpacing: 1,
                    }}
                >
                    LOCATION SUMMARY - NOT A STREET MAP
                </Typography>

                {trackingRequested && (
                    <Chip
                        size="small"
                        data-testid="technician-gps-freshness"
                        icon={trackingFresh ? <Wifi size={12} /> : <WifiOff size={12} />}
                        label={trackingFresh ? 'FRESH FOREGROUND GPS' : locationStale ? 'GPS STALE' : 'GPS POINT PENDING'}
                        sx={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            bgcolor: trackingFresh ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.14)',
                            color: trackingFresh ? '#4ade80' : '#f87171',
                            fontWeight: 950,
                            fontSize: '0.62rem',
                            '& .MuiChip-icon': { color: 'inherit' },
                        }}
                    />
                )}

                {technicianLocation && jobLocation ? (
                    <>
                        <Stack direction="row" alignItems="center" spacing={2.5} sx={{ mt: 3, width: '100%', justifyContent: 'center' }}>
                            <Tooltip title="Last verified Technician coordinate">
                                <Stack alignItems="center" spacing={0.5}>
                                    <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: trackingFresh ? '#22d3ee' : '#64748b', border: '2px solid #FFF' }} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.6rem', fontWeight: 900 }}>TECH</Typography>
                                </Stack>
                            </Tooltip>
                            <Box sx={{ width: { xs: 35, sm: 70 }, borderTop: '1.5px dashed rgba(255,255,255,0.18)' }} />
                            <Typography variant="caption" sx={{ color: '#FFF', fontWeight: 900, bgcolor: 'rgba(0,0,0,0.5)', px: 1, borderRadius: 1 }}>
                                {straightLineDistanceKm === null ? 'Distance unavailable' : `${straightLineDistanceKm.toFixed(1)} km approximate straight-line distance`}
                            </Typography>
                            <Box sx={{ width: { xs: 35, sm: 70 }, borderTop: '1.5px dashed rgba(255,255,255,0.18)' }} />
                            <Tooltip title="Verified job/property coordinate">
                                <Stack alignItems="center" spacing={0.5}>
                                    <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: binThemeTokens.gold, border: '2px solid #FFF' }} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.6rem', fontWeight: 900 }}>JOB</Typography>
                                </Stack>
                            </Tooltip>
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 700, textAlign: 'center' }}>
                            In-app estimate uses approximate straight-line distance and a fixed average speed. Road routing is available only in Google Maps.
                        </Typography>
                        <Button
                            size="small"
                            startIcon={<ExternalLink size={13} />}
                            onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
                            sx={{ color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 3, fontSize: '0.68rem', fontWeight: 900, textTransform: 'none' }}
                        >
                            Open in Google Maps
                        </Button>
                    </>
                ) : jobLocation ? (
                    <>
                        <MapPin size={32} color={binThemeTokens.gold} style={{ opacity: 0.7 }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>
                            Verified job pin available; Technician GPS point pending.
                        </Typography>
                        {jobMapsUrl && (
                            <Button
                                size="small"
                                startIcon={<ExternalLink size={13} />}
                                onClick={() => window.open(jobMapsUrl, '_blank', 'noopener,noreferrer')}
                                sx={{ color: binThemeTokens.gold, fontSize: '0.68rem', fontWeight: 900, textTransform: 'none' }}
                            >
                                Open Job Pin in Google Maps
                            </Button>
                        )}
                    </>
                ) : (
                    <>
                        <AlertCircle size={28} color="rgba(255,255,255,0.25)" />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, textAlign: 'center' }}>
                            Exact job coordinates are unavailable. Dispatch distance and route cannot be verified.
                        </Typography>
                    </>
                )}
            </Box>

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
