/**
 * BIN GROUP — OwnerTicketDetailPage
 * Live technician GPS tracking for owner portal.
 * Renders LiveTechnicianTrackingCard with real-time Firestore updates.
 * Security: owner can only see location for their own ticket.
 */

import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Chip, CircularProgress,
    Button, Divider, IconButton, alpha, Avatar, ImageList, ImageListItem
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ChevronLeft, MapPin, Clock, CheckCircle2, AlertCircle,
    MessageSquare, Calendar, Info
} from 'lucide-react';
import { db, doc, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import LiveTechnicianTrackingCard from '../../components/tracking/LiveTechnicianTrackingCard';

const STATUS_COLORS: Record<string, string> = {
    open: 'rgba(255,255,255,0.4)',
    OPEN: 'rgba(255,255,255,0.4)',
    accepted: '#3b82f6',
    on_the_way: binThemeTokens.gold,
    EN_ROUTE: binThemeTokens.gold,
    arrived: '#8b5cf6',
    in_progress: '#10b981',
    completed: '#10b981',
    closed: '#10b981',
    emergency: '#ef4444',
};

export default function OwnerTicketDetailPage() {
    const { id } = useParams();
    const { user } = useRole();
    const navigate = useNavigate();
    const { tx, isRTL } = useLanguage();

    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [unauthorized, setUnauthorized] = useState(false);

    useEffect(() => {
        if (!id || !user?.uid) return;

        const unsub = onSnapshot(doc(db, 'maintenanceTickets', id), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                // Security: only owner of this ticket can read
                if (
                    data.ownerId === user.uid ||
                    data.ownerUid === user.uid ||
                    data.ownerEmail === user.email
                ) {
                    setTicket({ id: snap.id, ...data });
                } else {
                    setUnauthorized(true);
                }
            } else {
                setUnauthorized(true);
            }
            setLoading(false);
        }, (err) => {
            console.error('[OwnerTicketDetail] Listener error:', err);
            setLoading(false);
        });

        return () => unsub();
    }, [id, user]);

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
        </Box>
    );

    if (unauthorized) return (
        <Box sx={{ textAlign: 'center', py: 10 }}>
            <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
            <Typography variant="h6" color="#FFF" fontWeight="950">{tx('owner.ticket.unauthorized', 'Unauthorized')}</Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                {tx('owner.ticket.unauthorized_desc', 'This ticket does not belong to your account.')}
            </Typography>
            <Button onClick={() => navigate('/owner/tickets')} variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#FFF', fontWeight: 950 }}>
                {tx('owner.ticket.back_to_tickets', 'Back to Tickets')}
            </Button>
        </Box>
    );

    if (!ticket) return null;

    const statusColor = STATUS_COLORS[ticket.status] || 'rgba(255,255,255,0.4)';

    return (
        <Box sx={{ maxWidth: 1100, mx: 'auto', pb: 10, direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Header */}
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                <IconButton onClick={() => navigate('/owner/tickets')} sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    <ChevronLeft />
                </IconButton>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>
                        {tx('owner.ticket.property_ops', 'PROPERTY OPERATIONS')}
                    </Typography>
                    <Typography variant="h4" fontWeight="950" color="#FFF">
                        {tx('owner.ticket.reference', 'Ticket')} #{ticket.id.substring(0, 8).toUpperCase()}
                    </Typography>
                </Box>
                <Chip
                    label={ticket.status?.replace(/_/g, ' ')}
                    sx={{ ml: 'auto', bgcolor: alpha(statusColor, 0.1), color: statusColor, fontWeight: 950, border: `1px solid ${alpha(statusColor, 0.2)}` }}
                />
            </Stack>

            <Grid container spacing={4}>
                {/* Left: Ticket Details */}
                <Grid item xs={12} lg={8}>
                    {/* Property + Complaint info */}
                    <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'block' }}>
                            {tx('owner.ticket.complaint_details', 'COMPLAINT DETAILS')}
                        </Typography>
                        <Grid container spacing={3} sx={{ mb: 3 }}>
                            <Grid item xs={12} md={6}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}>
                                        <MapPin />
                                    </Avatar>
                                    <Box>
                                        <Typography variant="body1" fontWeight="950" color="#FFF">
                                            {ticket.propertyName || 'Property'}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            {ticket.unitNumber ? `Unit ${ticket.unitNumber}` : 'Common Area'}
                                            {ticket.floor ? ` · Floor ${ticket.floor}` : ''}
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.04)' }}>
                                        <Clock size={18} color="rgba(255,255,255,0.6)" />
                                    </Avatar>
                                    <Box>
                                        <Typography variant="body2" fontWeight="950" color="#FFF">
                                            {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : tx('owner.ticket.recently_filed', 'Recently filed')}
                                        </Typography>
                                        <Typography variant="caption" color="textSecondary">
                                            {tx('owner.ticket.priority_label', 'Priority:')} <span style={{ color: ticket.priority === 'emergency' ? '#ef4444' : '#FFF', fontWeight: 900 }}>{ticket.priority?.toUpperCase()}</span>
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Stack spacing={3}>
                            <Box>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>
                                    {tx('owner.ticket.category', 'CATEGORY')}
                                </Typography>
                                <Typography variant="body1" color="#FFF" fontWeight="950" sx={{ mt: 0.5 }}>
                                    {ticket.category}
                                </Typography>
                            </Box>
                            {ticket.specificLocation && (
                                <Box>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>
                                        {tx('owner.ticket.specific_location', 'SPECIFIC LOCATION')}
                                    </Typography>
                                    <Typography variant="body1" color="#FFF" fontWeight="700" sx={{ mt: 0.5 }}>
                                        {ticket.specificLocation}
                                    </Typography>
                                </Box>
                            )}
                            <Box>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>
                                    {tx('owner.ticket.description', 'DESCRIPTION')}
                                </Typography>
                                <Typography variant="body1" color="rgba(255,255,255,0.8)" sx={{ mt: 0.5, lineHeight: 1.7 }}>
                                    {ticket.description}
                                </Typography>
                            </Box>

                            {/* Photos */}
                            {ticket.photos && ticket.photos.length > 0 && (
                                <Box>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, mb: 2, display: 'block' }}>
                                        {tx('owner.ticket.submitted_photos', 'SUBMITTED PHOTOS')} ({ticket.photos.length})
                                    </Typography>
                                    <ImageList sx={{ width: '100%', borderRadius: 4, overflow: 'hidden' }} cols={3} gap={8}>
                                        {ticket.photos.map((url: string, i: number) => (
                                            <ImageListItem key={i} sx={{ cursor: 'pointer' }} onClick={() => window.open(url, '_blank')}>
                                                <img src={url} alt={`photo-${i}`} loading="lazy" style={{ height: 120, objectFit: 'cover' }} />
                                            </ImageListItem>
                                        ))}
                                    </ImageList>
                                </Box>
                            )}

                            {/* Tech resolution notes when completed */}
                            {ticket.technicianNotes && (
                                <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>
                                        {tx('owner.ticket.tech_notes', 'TECHNICIAN RESOLUTION NOTES')}
                                    </Typography>
                                    <Typography variant="body1" color="#FFF" sx={{ mt: 0.5 }}>
                                        {ticket.technicianNotes}
                                    </Typography>
                                    {ticket.materialsUsed?.length > 0 && (
                                        <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                                            {tx('owner.ticket.materials', 'Materials')}: {ticket.materialsUsed.join(', ')}
                                        </Typography>
                                    )}
                                </Box>
                            )}
                        </Stack>
                    </Paper>

                    {/* Timeline */}
                    <Paper sx={{ p: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'block' }}>
                            {tx('owner.ticket.timeline', 'TICKET TIMELINE')}
                        </Typography>
                        <Stack spacing={3}>
                            {[
                                { label: tx('owner.ticket.filed', 'Complaint Filed'), ts: ticket.createdAt, color: '#4ade80' },
                                { label: tx('owner.ticket.accepted', 'Technician Accepted'), ts: ticket.acceptedAt, color: binThemeTokens.gold },
                                { label: tx('owner.ticket.on_the_way', 'On The Way'), ts: ticket.onTheWayAt, color: '#f59e0b' },
                                { label: tx('owner.ticket.arrived', 'Arrived at Property'), ts: ticket.arrivedAt, color: '#6366f1' },
                                { label: tx('owner.ticket.work_started', 'Work Started'), ts: ticket.startedAt, color: '#10b981' },
                                { label: tx('owner.ticket.completed', 'Completed'), ts: ticket.completedAt, color: '#10b981' },
                            ]
                                .filter(item => item.ts)
                                .map((item, i) => (
                                    <Stack key={i} direction="row" spacing={2} alignItems="center">
                                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />
                                        <Box>
                                            <Typography variant="body2" fontWeight="950" color="#FFF">{item.label}</Typography>
                                            <Typography variant="caption" color="textSecondary">
                                                {item.ts?.toDate ? item.ts.toDate().toLocaleString() : '—'}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                ))}
                        </Stack>
                    </Paper>
                </Grid>

                {/* Right: Live Tracking Card */}
                <Grid item xs={12} lg={4}>
                    <Box sx={{ mb: 3 }}>
                        <LiveTechnicianTrackingCard
                            ticket={ticket}
                            onChatClick={ticket.assignedTechnicianId
                                ? () => navigate(`/owner/chat/${ticket.id}`)
                                : undefined
                            }
                            onCallClick={() => {
                                const phone = ticket.assignedTechnicianPhone;
                                if (phone) window.open(`tel:${phone}`);
                            }}
                            showTimeline={false}
                        />
                    </Box>

                    {/* Ticket meta */}
                    <Paper sx={{ p: 3, bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5, mb: 3 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2, display: 'block' }}>
                            {tx('owner.ticket.ticket_info', 'TICKET INFO')}
                        </Typography>
                        <Stack spacing={2}>
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{tx('owner.ticket.reference', 'REFERENCE')}</Typography>
                                <Typography variant="body2" fontWeight="900" color="#FFF">
                                    #{ticket.id.substring(0, 8).toUpperCase()}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{tx('owner.ticket.source', 'SOURCE')}</Typography>
                                <Typography variant="body2" fontWeight="900" color="#FFF">
                                    {ticket.requesterRole === 'owner' ? tx('owner.ticket.owner_complaint', 'Owner Complaint') : tx('owner.ticket.tenant_request', 'Tenant Request')}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{tx('owner.ticket.sla', 'SLA')}</Typography>
                                <Typography variant="body2" fontWeight="900" color="#FFF">
                                    {ticket.slaMinutes >= 1440
                                        ? `${ticket.slaMinutes / 60}h (${tx('owner.ticket.standard', 'Standard')})`
                                        : `${ticket.slaMinutes}min (${tx('owner.ticket.priority', 'Priority')})`}
                                </Typography>
                            </Box>
                        </Stack>
                    </Paper>

                    <Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.02), border: '1px solid rgba(255,255,255,0.03)', borderRadius: 5 }}>
                        <Typography variant="subtitle2" fontWeight="950" color={binThemeTokens.gold} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Info size={16} /> {tx('owner.ticket.need_assistance', 'NEED ASSISTANCE?')}
                        </Typography>
                        <Typography variant="caption" color="rgba(255,255,255,0.4)" sx={{ fontWeight: 700, display: 'block', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            {tx('owner.ticket.assistance_desc', 'Use the chat or call button above to reach your technician directly. For escalations, contact BIN GROUP concierge.')}
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}
