/**
 * BIN GROUP — OwnerTicketsPage
 * Lists all maintenance tickets filed by or for the owner's properties.
 * Shows live ETA, technician name, and Track chip for active tickets.
 */

import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Stack, Chip, CircularProgress,
    alpha, Button
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
    FileText, ChevronRight, AlertCircle, Clock, CheckCircle2,
    Navigation, Play, MapPin, Plus
} from 'lucide-react';
import { db, collection, query, where, orderBy, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
    calculateDistanceKm, calculateEtaMinutes,
    getTechnicianLocation, getTicketJobLocation
} from '../../utils/liveTracking';

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
    'OPEN':              { color: 'rgba(255,255,255,0.4)', icon: Clock },
    'open':              { color: 'rgba(255,255,255,0.4)', icon: Clock },
    'PENDING_ASSIGNMENT':{ color: 'rgba(255,255,255,0.4)', icon: Clock },
    'accepted':          { color: '#3b82f6', icon: Clock },
    'ASSIGNED':          { color: '#3b82f6', icon: Clock },
    'on_the_way':        { color: binThemeTokens.gold, icon: Navigation },
    'EN_ROUTE':          { color: binThemeTokens.gold, icon: Navigation },
    'arrived':           { color: '#8b5cf6', icon: MapPin },
    'ARRIVED':           { color: '#8b5cf6', icon: MapPin },
    'in_progress':       { color: '#10b981', icon: Play },
    'IN_PROGRESS':       { color: '#10b981', icon: Play },
    'completed':         { color: '#10b981', icon: CheckCircle2 },
    'COMPLETED':         { color: '#10b981', icon: CheckCircle2 },
    'closed':            { color: '#10b981', icon: CheckCircle2 },
    'CLOSED':            { color: '#10b981', icon: CheckCircle2 },
    'emergency':         { color: '#ef4444', icon: AlertCircle },
};

const ACTIVE_STATUSES = ['accepted', 'ASSIGNED', 'on_the_way', 'EN_ROUTE', 'arrived', 'ARRIVED', 'in_progress', 'IN_PROGRESS'];

export default function OwnerTicketsPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.uid) return;

        const q = query(
            collection(db, 'maintenanceTickets'),
            where('ownerId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(q, (snap) => {
            setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err: any) => {
            const isPermissionDenied = err?.code === 'permission-denied' || 
                                       err?.message?.includes('permission-denied') || 
                                       err?.message?.includes('insufficient permissions');
            if (isPermissionDenied) {
                console.warn('[OwnerTickets] query restricted (permission-denied). Failing silently with empty list.');
            } else {
                console.error('[OwnerTickets]', err);
            }
            setLoading(false);
        });

        return () => unsub();
    }, [user]);

    if (loading) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                Loading Tickets…
            </Typography>
        </Box>
    );

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 6 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>
                        PROPERTY OPERATIONS
                    </Typography>
                    <Typography variant="h4" fontWeight="950" color="#FFF">
                        Maintenance Tickets
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<Plus size={18} />}
                    onClick={() => navigate('/owner/complaint')}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, py: 1.5, px: 3 }}
                >
                    NEW COMPLAINT
                </Button>
            </Stack>

            <Stack spacing={2}>
                {tickets.map(ticket => {
                    const sCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG['OPEN'];
                    const Icon = sCfg.icon;
                    const isActive = ACTIVE_STATUSES.includes(ticket.status);
                    const techLoc = getTechnicianLocation(ticket);
                    const jobLoc  = getTicketJobLocation(ticket);
                    const distKm  = calculateDistanceKm(techLoc, jobLoc);
                    const etaMin  = calculateEtaMinutes(distKm);

                    return (
                        <Paper
                            key={ticket.id}
                            onClick={() => navigate(`/owner/ticket/${ticket.id}`)}
                            sx={{
                                p: 3,
                                cursor: 'pointer',
                                bgcolor: isActive ? 'rgba(15, 23, 42, 0.7)' : 'rgba(15, 23, 42, 0.4)',
                                border: `1px solid ${isActive ? alpha(sCfg.color, 0.3) : 'rgba(255,255,255,0.05)'}`,
                                borderRadius: 6,
                                transition: 'all 0.2s',
                                '&:hover': { borderColor: binThemeTokens.gold, transform: 'translateY(-2px)' }
                            }}
                        >
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
                                    <Typography variant="body1" fontWeight="950" color="#FFF" sx={{ mb: 0.5, wordBreak: 'break-word' }}>
                                        {ticket.description || 'No Description'}
                                    </Typography>
                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'rgba(255,255,255,0.3)', flexWrap: 'wrap' }}>
                                        <Typography variant="caption" fontWeight="800">
                                            #{ticket.id.substring(0, 8).toUpperCase()}
                                        </Typography>
                                        <Typography variant="caption">•</Typography>
                                        <Typography variant="caption" fontWeight="800">{ticket.category}</Typography>
                                        {ticket.propertyName && (
                                            <>
                                                <Typography variant="caption">•</Typography>
                                                <Typography variant="caption" fontWeight="800">{ticket.propertyName}</Typography>
                                            </>
                                        )}
                                        {ticket.unitNumber && (
                                            <>
                                                <Typography variant="caption">•</Typography>
                                                <Typography variant="caption" fontWeight="800">Unit {ticket.unitNumber}</Typography>
                                            </>
                                        )}
                                    </Stack>

                                    {/* Active tracking badges */}
                                    {isActive && (
                                        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" alignItems="center">
                                            {ticket.assignedTechnicianName && (
                                                <Chip
                                                    size="small"
                                                    label={ticket.assignedTechnicianName}
                                                    sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: 'rgba(255,255,255,0.05)', color: '#FFF', height: 22 }}
                                                />
                                            )}
                                            {etaMin !== null && (
                                                <Chip
                                                    size="small"
                                                    icon={<Clock size={11} />}
                                                    label={`~${etaMin} min`}
                                                    sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, height: 22, '& .MuiChip-icon': { color: binThemeTokens.gold } }}
                                                />
                                            )}
                                            <Chip
                                                size="small"
                                                icon={<Navigation size={11} />}
                                                label="Track"
                                                onClick={(e) => { e.stopPropagation(); navigate(`/owner/ticket/${ticket.id}`); }}
                                                sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: alpha(sCfg.color, 0.15), color: sCfg.color, height: 22, cursor: 'pointer', '& .MuiChip-icon': { color: sCfg.color } }}
                                            />
                                        </Stack>
                                    )}

                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 700, mt: 1, display: 'block' }}>
                                        {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : ''}
                                    </Typography>
                                </Box>

                                <Stack direction="row" spacing={1} alignItems="center" flexShrink={0}>
                                    <Chip
                                        icon={<Icon size={13} />}
                                        label={ticket.status?.replace(/_/g, ' ')}
                                        size="small"
                                        sx={{
                                            bgcolor: alpha(sCfg.color, 0.1),
                                            color: sCfg.color,
                                            fontWeight: 950,
                                            fontSize: '0.65rem',
                                            height: 24,
                                            border: `1px solid ${alpha(sCfg.color, 0.2)}`,
                                            '& .MuiChip-icon': { color: sCfg.color }
                                        }}
                                    />
                                    <ChevronRight size={18} color="rgba(255,255,255,0.15)" />
                                </Stack>
                            </Stack>
                        </Paper>
                    );
                })}

                {tickets.length === 0 && (
                    <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8 }}>
                        <FileText size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>
                            NO MAINTENANCE TICKETS
                        </Typography>
                        <Button
                            variant="outlined"
                            startIcon={<Plus size={16} />}
                            onClick={() => navigate('/owner/complaint')}
                            sx={{ mt: 3, borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderRadius: 3 }}
                        >
                            File First Complaint
                        </Button>
                    </Paper>
                )}
            </Stack>
        </Box>
    );
}
