/**
 * BIN GROUP — LiveTechnicianTrackingCard
 * Shared UI component for owner and tenant portals.
 * Shows live ETA, technician identity, map preview, status timeline,
 * call and chat buttons.
 *
 * Mobile-safe: handles RTL, overflow, small screens.
 */

import React from 'react';
import {
    Box, Typography, Stack, Avatar, IconButton, Paper,
    LinearProgress, Chip, alpha, Divider, Button, Tooltip
} from '@mui/material';
import {
    Phone, MessageSquare, MapPin, CheckCircle, Navigation,
    Play, Flag, Clock, AlertCircle, ExternalLink, Wifi, WifiOff
} from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
    normalizeLocation,
    calculateDistanceKm,
    calculateEtaMinutes,
    getTicketJobLocation,
    getTechnicianLocation,
    buildGoogleMapsDirectionsUrl,
    getStaleLabel,
    isLocationStale,
    isTrackingActive,
    normalizeTicketStatus,
} from '../../utils/liveTracking';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveTechnicianTrackingCardProps {
    ticket: any;
    onChatClick?: () => void;
    onCallClick?: () => void;
    showTimeline?: boolean;
}

// ─── Status Timeline Config ───────────────────────────────────────────────────

const TIMELINE_STEPS = [
    { key: 'open',          label: 'Complaint Created',  icon: Flag },
    { key: 'accepted',      label: 'Assigned',           icon: CheckCircle },
    { key: 'accepted',      label: 'Accepted',           icon: CheckCircle },
    { key: 'on_the_way',    label: 'On The Way',         icon: Navigation },
    { key: 'arrived',       label: 'Arrived',            icon: MapPin },
    { key: 'in_progress',   label: 'Work Started',       icon: Play },
    { key: 'completed',     label: 'Completed',          icon: CheckCircle },
];

const DISPLAY_STEPS = [
    { key: 'open',          label: 'Complaint Created',  icon: Flag },
    { key: 'accepted',      label: 'Technician Assigned', icon: CheckCircle },
    { key: 'on_the_way',    label: 'On The Way',         icon: Navigation },
    { key: 'arrived',       label: 'Arrived',            icon: MapPin },
    { key: 'in_progress',   label: 'Work Started',       icon: Play },
    { key: 'completed',     label: 'Completed',          icon: CheckCircle },
];

// ─── Progress Value ───────────────────────────────────────────────────────────

function getProgressValue(status: string): number {
    switch (normalizeTicketStatus(status)) {
        case 'completed':    return 100;
        case 'in_progress':  return 80;
        case 'arrived':      return 65;
        case 'on_the_way':   return 45;
        case 'accepted':     return 20;
        case 'open':         return 5;
        default:             return 5;
    }
}

// ─── Status Message ───────────────────────────────────────────────────────────

function getStatusMessage(ticket: any, etaMin: number | null): string {
    const s = normalizeTicketStatus(ticket?.status);
    switch (s) {
        case 'completed':   return 'Job Completed';
        case 'in_progress': return 'Work in Progress';
        case 'arrived':     return 'Technician Has Arrived';
        case 'on_the_way':
            if (etaMin !== null) return `Arrives in ~${etaMin} min`;
            return 'Technician On The Way';
        case 'accepted':    return ticket?.assignedTechnicianName ? `${ticket.assignedTechnicianName} Assigned` : 'Technician Assigned';
        default:            return 'Awaiting Technician Assignment';
    }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveTechnicianTrackingCard({
    ticket,
    onChatClick,
    onCallClick,
    showTimeline = true,
}: LiveTechnicianTrackingCardProps) {
    if (!ticket) return null;

    const techLoc = getTechnicianLocation(ticket);
    const jobLoc  = getTicketJobLocation(ticket);

    const distKm  = calculateDistanceKm(techLoc, jobLoc);
    const etaMin  = calculateEtaMinutes(distKm);
    const stale   = getStaleLabel(ticket.technicianLocationUpdatedAt);
    const isStale = isLocationStale(ticket.technicianLocationUpdatedAt, 2);
    const tracking = isTrackingActive(ticket.status, ticket.trackingStatus);
    const normStatus = normalizeTicketStatus(ticket.status);
    const progressVal = getProgressValue(ticket.status);
    const statusMsg = getStatusMessage(ticket, etaMin);
    const isAssigned = !!(ticket.assignedTechnicianId);
    const isCompleted = normStatus === 'completed';

    const mapsUrl = buildGoogleMapsDirectionsUrl(techLoc, jobLoc);
    const jobMapsUrl = jobLoc
        ? `https://www.google.com/maps/search/?api=1&query=${jobLoc.lat},${jobLoc.lng}`
        : null;

    // Progress bar color
    const progressColor = isCompleted
        ? '#10b981'
        : tracking
        ? '#22d3ee'
        : binThemeTokens.gold;

    return (
        <Paper sx={{
            bgcolor: 'rgba(11, 11, 16, 0.9)',
            border: `1px solid ${isCompleted ? 'rgba(16,185,129,0.3)' : tracking ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 5,
            overflow: 'hidden',
        }}>

            {/* ── Map Preview Area ── */}
            <Box sx={{
                height: 180,
                bgcolor: 'rgba(0,0,0,0.6)',
                position: 'relative',
                backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.08) 0%, transparent 70%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 1,
            }}>
                {/* Live ping animation when tracking */}
                {tracking && (
                    <Box sx={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        bgcolor: 'rgba(0,0,0,0.7)',
                        borderRadius: 3,
                        px: 1.5,
                        py: 0.5,
                    }}>
                        <Box sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: '#22d3ee',
                            animation: 'liveTrackPulse 1.5s ease-in-out infinite',
                            '@keyframes liveTrackPulse': {
                                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                                '50%': { opacity: 0.4, transform: 'scale(1.4)' },
                            },
                        }} />
                        <Typography variant="caption" fontWeight="900" sx={{ color: '#22d3ee', fontSize: '0.65rem', letterSpacing: 1 }}>
                            LIVE
                        </Typography>
                    </Box>
                )}

                {techLoc && jobLoc ? (
                    <>
                        {/* Technician dot + Job dot */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Tooltip title="Technician location">
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                                    <Box sx={{
                                        width: 16, height: 16, borderRadius: '50%',
                                        bgcolor: '#22d3ee',
                                        boxShadow: '0 0 12px #22d3ee',
                                        border: '2px solid #FFF',
                                    }} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', fontWeight: 900 }}>TECH</Typography>
                                </Box>
                            </Tooltip>
                            {/* Distance line */}
                            <Box sx={{ flex: 1, minWidth: 40, maxWidth: 80, borderTop: '1.5px dashed rgba(255,255,255,0.15)' }} />
                            {distKm !== null && (
                                <Typography variant="caption" sx={{ color: '#FFF', fontWeight: 900, fontSize: '0.7rem', bgcolor: 'rgba(0,0,0,0.5)', px: 1, borderRadius: 1 }}>
                                    {distKm.toFixed(1)} km
                                </Typography>
                            )}
                            <Box sx={{ flex: 1, minWidth: 40, maxWidth: 80, borderTop: '1.5px dashed rgba(255,255,255,0.15)' }} />
                            <Tooltip title="Job location">
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                                    <Box sx={{
                                        width: 16, height: 16, borderRadius: '50%',
                                        bgcolor: binThemeTokens.gold,
                                        boxShadow: `0 0 12px ${binThemeTokens.gold}`,
                                        border: '2px solid #FFF',
                                    }} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', fontWeight: 900 }}>JOB</Typography>
                                </Box>
                            </Tooltip>
                        </Box>

                        {/* Open in Maps button */}
                        <Button
                            size="small"
                            startIcon={<ExternalLink size={13} />}
                            onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
                            sx={{
                                mt: 1,
                                color: '#22d3ee',
                                borderColor: 'rgba(34,211,238,0.3)',
                                border: '1px solid',
                                borderRadius: 3,
                                fontSize: '0.65rem',
                                fontWeight: 900,
                                py: 0.5,
                                px: 1.5,
                                textTransform: 'none',
                                '&:hover': { bgcolor: 'rgba(34,211,238,0.08)' }
                            }}
                        >
                            View Route in Maps
                        </Button>
                    </>
                ) : jobLoc ? (
                    <>
                        <MapPin size={32} color={binThemeTokens.gold} style={{ opacity: 0.6 }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                            Technician location pending…
                        </Typography>
                        {jobMapsUrl && (
                            <Button
                                size="small"
                                startIcon={<ExternalLink size={13} />}
                                onClick={() => window.open(jobMapsUrl, '_blank', 'noopener,noreferrer')}
                                sx={{ color: binThemeTokens.gold, fontSize: '0.65rem', fontWeight: 900, textTransform: 'none' }}
                            >
                                View Job Location
                            </Button>
                        )}
                    </>
                ) : (
                    <>
                        <AlertCircle size={28} color="rgba(255,255,255,0.2)" />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>
                            Location not available
                        </Typography>
                    </>
                )}
            </Box>

            {/* ── Main Content ── */}
            <Box sx={{ p: { xs: 2.5, md: 3 }, pr: { xs: 9, md: 3 }, pb: { xs: 12, md: 3 } }}>

                {/* Status Headline */}
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
                    <Typography variant="h6" fontWeight="950" color="#FFF" sx={{
                        minWidth: 0,
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        lineHeight: 1.3,
                    }}>
                        {statusMsg}
                    </Typography>
                    {tracking && (
                        isStale
                            ? <Tooltip title="Location may be outdated"><WifiOff size={18} color="#f87171" /></Tooltip>
                            : <Tooltip title="Live GPS active"><Wifi size={18} color="#22d3ee" /></Tooltip>
                    )}
                </Stack>

                {/* Stale label */}
                {techLoc && (
                    <Typography variant="caption" sx={{
                        color: isStale ? '#f87171' : 'rgba(255,255,255,0.4)',
                        display: 'block',
                        mb: 2,
                        fontWeight: 700,
                        fontSize: '0.7rem',
                    }}>
                        {stale}
                    </Typography>
                )}

                {/* ETA + Distance Chips */}
                {(etaMin !== null || distKm !== null) && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2.5 }}>
                        {etaMin !== null && (
                            <Chip
                                icon={<Clock size={13} />}
                                label={`~${etaMin} min ETA`}
                                size="small"
                                sx={{
                                    bgcolor: alpha(binThemeTokens.gold, 0.12),
                                    color: binThemeTokens.gold,
                                    fontWeight: 900,
                                    border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`,
                                    '& .MuiChip-icon': { color: binThemeTokens.gold },
                                }}
                            />
                        )}
                        {distKm !== null && (
                            <Chip
                                icon={<Navigation size={13} />}
                                label={`${distKm.toFixed(1)} km away`}
                                size="small"
                                sx={{
                                    bgcolor: 'rgba(255,255,255,0.04)',
                                    color: 'rgba(255,255,255,0.6)',
                                    fontWeight: 900,
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    '& .MuiChip-icon': { color: 'rgba(255,255,255,0.4)' },
                                }}
                            />
                        )}
                    </Stack>
                )}

                {/* Progress Bar */}
                <LinearProgress
                    variant="determinate"
                    value={progressVal}
                    sx={{
                        height: 5,
                        borderRadius: 3,
                        mb: 3,
                        bgcolor: 'rgba(255,255,255,0.06)',
                        '& .MuiLinearProgress-bar': {
                            bgcolor: progressColor,
                            borderRadius: 3,
                            transition: 'width 0.8s ease',
                        },
                    }}
                />

                {/* Technician Profile */}
                {isAssigned && (
                    <Box sx={{ mb: 3 }}>
                        <Divider sx={{ mb: 2.5, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                            <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                                <Avatar
                                    src={ticket.assignedTechnicianAvatar || ticket.technicianPhotoURL}
                                    sx={{
                                        width: 48,
                                        height: 48,
                                        bgcolor: alpha(binThemeTokens.gold, 0.15),
                                        color: binThemeTokens.gold,
                                        fontWeight: 900,
                                        flexShrink: 0,
                                    }}
                                >
                                    {(ticket.assignedTechnicianName || 'T').charAt(0)}
                                </Avatar>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" fontWeight="950" color="#FFF" sx={{
                                        minWidth: 0,
                                        wordBreak: 'break-word',
                                        overflowWrap: 'anywhere',
                                    }}>
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

                            {/* Call / Chat buttons */}
                            <Stack direction="row" spacing={1} flexShrink={0}>
                                {onChatClick && (
                                    <Tooltip title="Chat with technician">
                                        <IconButton
                                            size="small"
                                            onClick={onChatClick}
                                            sx={{
                                                bgcolor: 'rgba(255,255,255,0.05)',
                                                color: '#FFF',
                                                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                                            }}
                                        >
                                            <MessageSquare size={18} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                                <Tooltip title="Call technician">
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            if (onCallClick) {
                                                onCallClick();
                                            } else {
                                                const phone = ticket.assignedTechnicianPhone || ticket.technicianPhone;
                                                if (phone) window.open(`tel:${phone}`);
                                            }
                                        }}
                                        sx={{
                                            bgcolor: alpha(binThemeTokens.gold, 0.1),
                                            color: binThemeTokens.gold,
                                            '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.2) }
                                        }}
                                    >
                                        <Phone size={18} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        </Stack>
                    </Box>
                )}

                {/* ── Status Timeline ── */}
                {showTimeline && (
                    <>
                        <Divider sx={{ mb: 2.5, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, letterSpacing: 2, mb: 2, display: 'block' }}>
                            STATUS TIMELINE
                        </Typography>
                        <Stack spacing={2}>
                            {DISPLAY_STEPS.map((step, index) => {
                                const norm = normalizeTicketStatus(ticket.status);
                                const stepOrder = ['open', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed'];
                                const currentIdx = stepOrder.indexOf(norm);
                                const stepIdx = stepOrder.indexOf(step.key);
                                const isDone = stepIdx <= currentIdx;
                                const isCurrent = stepIdx === currentIdx;
                                const Icon = step.icon;

                                return (
                                    <Stack key={index} direction="row" spacing={2} alignItems="center">
                                        <Box sx={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: '50%',
                                            bgcolor: isDone
                                                ? (isCurrent ? progressColor : 'rgba(255,255,255,0.12)')
                                                : 'rgba(255,255,255,0.04)',
                                            border: `2px solid ${isDone ? progressColor : 'rgba(255,255,255,0.08)'}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            transition: 'all 0.4s ease',
                                        }}>
                                            <Icon
                                                size={13}
                                                color={isDone ? (isCurrent ? '#000' : '#FFF') : 'rgba(255,255,255,0.2)'}
                                            />
                                        </Box>
                                        <Typography
                                            variant="caption"
                                            fontWeight={isCurrent ? 950 : 700}
                                            sx={{
                                                color: isCurrent
                                                    ? '#FFF'
                                                    : isDone
                                                    ? 'rgba(255,255,255,0.6)'
                                                    : 'rgba(255,255,255,0.2)',
                                                minWidth: 0,
                                                wordBreak: 'break-word',
                                                overflowWrap: 'anywhere',
                                            }}
                                        >
                                            {step.label}
                                        </Typography>
                                        {isCurrent && (
                                            <Box sx={{
                                                width: 6,
                                                height: 6,
                                                borderRadius: '50%',
                                                bgcolor: progressColor,
                                                animation: 'currentStepPulse 1.5s infinite',
                                                '@keyframes currentStepPulse': {
                                                    '0%,100%': { opacity: 1 },
                                                    '50%': { opacity: 0.3 },
                                                },
                                            }} />
                                        )}
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
