/**
 * BIN GROUP — TechnicianJobDetailPage
 * Full GPS tracking integration per the Live Tracking safety spec:
 * - GPS starts ONLY on explicit "ON THE WAY" click
 * - GPS stops on ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED
 * - Writes technicianLocation + technician profile updates
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button,
    CircularProgress, Chip, TextField, Divider,
    IconButton, alpha, Avatar, Alert, Snackbar
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Navigation, Clock, MessageSquare, Camera,
    Check, AlertTriangle, Play, Pause,
    ChevronLeft, Phone, MapPin, Wrench,
    Image as ImageIcon, ShieldCheck, Wifi, WifiOff
} from 'lucide-react';
import {
    db, doc, getDoc, updateDoc, serverTimestamp,
    collection, addDoc, onSnapshot
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { notifyStatusUpdate, notifyCompletionRequest, sendNotification } from '../../services/notificationService';
import { TICKET_AUDIT_ACTIONS, logAuditAction } from '../../shared-exports';
import { resolvePropertyLocation } from '../../utils/propertyLocationResolver';
import { startLiveTracking, stopLiveTracking } from '../../utils/liveTracking';

export default function TechnicianJobDetailPage() {
    const { id } = useParams();
    const { user } = useRole();
    const navigate = useNavigate();

    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [notes, setNotes] = useState('');
    const [materials, setMaterials] = useState('');
    const [slaTime, setSlaTime] = useState<string>('00:00:00');
    const [isTracking, setIsTracking] = useState(false);
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [snackMsg, setSnackMsg] = useState<string | null>(null);

    // ── Real-time ticket listener ──────────────────────────────────────────────
    useEffect(() => {
        if (!id || !user?.uid) return;

        const unsub = onSnapshot(doc(db, 'maintenanceTickets', id), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.assignedTechnicianId === user.uid || !data.assignedTechnicianId) {
                    setTicket({ id: snap.id, ...data });
                } else {
                    alert('Mission assigned to another operator.');
                    navigate('/technician/dashboard');
                }
            }
            setLoading(false);
        });

        return () => unsub();
    }, [id, user]);

    // ── Stop tracking on unmount (safety) ─────────────────────────────────────
    useEffect(() => {
        return () => {
            if (isTracking && user?.uid) {
                stopLiveTracking(user.uid).catch(console.warn);
            }
        };
    }, [isTracking, user]);

    // ── SLA Timer ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!ticket) return;
        const activeStatuses = ['accepted', 'on_the_way', 'arrived', 'in_progress', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];
        if (!activeStatuses.includes(ticket.status)) return;

        const interval = setInterval(() => {
            const start = ticket.createdAt?.toDate?.() || new Date();
            const diff = Date.now() - start.getTime();
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setSlaTime(
                `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            );
        }, 1000);

        return () => clearInterval(interval);
    }, [ticket]);

    // ── Status Update Handler ──────────────────────────────────────────────────
    const handleStatusUpdate = useCallback(async (newStatus: string) => {
        if (!id || !user) return;
        setActionLoading(true);
        setGpsError(null);

        try {
            const updatePayload: any = {
                status: newStatus,
                updatedAt: serverTimestamp(),
            };

            // ── ACCEPT: assign technician identity fields ──────────────────────
            if (newStatus === 'accepted' && !ticket.assignedTechnicianId) {
                // Fetch technician profile for phone/specialty
                let techPhone = '';
                let techSpecialty = 'Maintenance Specialist';
                try {
                    const techSnap = await getDoc(doc(db, 'technicians', user.uid));
                    if (techSnap.exists()) {
                        const techData = techSnap.data();
                        techPhone = techData.phone || techData.mobile || '';
                        techSpecialty = techData.specialty || techData.trade || techSpecialty;
                    }
                } catch (profileError) {
                    console.warn('[TechJobDetail] Technician profile lookup failed:', profileError);
                }

                updatePayload.assignedTechnicianId = user.uid;
                updatePayload.technicianUid = user.uid;
                updatePayload.assignedTechnicianName = user.displayName || 'Technician';
                updatePayload.assignedTechnicianPhone = techPhone || user.phoneNumber || '';
                updatePayload.assignedTechnicianSpecialty = techSpecialty;
                updatePayload.assignedTechnicianEmail = user.email || '';
                updatePayload.acceptedAt = serverTimestamp();
                updatePayload.trackingStatus = 'TECHNICIAN_ASSIGNED';
                updatePayload.dispatchStatus = 'ASSIGNED';
            }

            // ── ON THE WAY: start live GPS ─────────────────────────────────────
            if (newStatus === 'on_the_way') {
                updatePayload.trackingStatus = 'LIVE_TRACKING';
                updatePayload.onTheWayAt = serverTimestamp();

                // Start GPS BEFORE writing status
                startLiveTracking(
                    id,
                    user.uid,
                    () => { /* location update callback – UI reacts via onSnapshot */ },
                    (errMsg) => {
                        setGpsError(errMsg);
                        setIsTracking(false);
                    }
                );
                setIsTracking(true);
                setSnackMsg('Live GPS tracking started.');
            }

            // ── ARRIVED: stop GPS ──────────────────────────────────────────────
            if (newStatus === 'arrived') {
                updatePayload.arrivedAt = serverTimestamp();
                updatePayload.trackingStatus = 'ARRIVED';
                if (isTracking) {
                    stopLiveTracking(user.uid);
                    setIsTracking(false);
                }
            }

            // ── IN_PROGRESS: stop GPS ──────────────────────────────────────────
            if (newStatus === 'in_progress' && !ticket.startedAt) {
                updatePayload.startedAt = serverTimestamp();
                updatePayload.trackingStatus = 'WORK_STARTED';
                if (isTracking) {
                    stopLiveTracking(user.uid);
                    setIsTracking(false);
                }
            }

            // ── WAITING_PARTS: stop GPS ────────────────────────────────────────
            if (newStatus === 'waiting_parts') {
                updatePayload.waitingPartsAt = serverTimestamp();
                if (isTracking) {
                    stopLiveTracking(user.uid);
                    setIsTracking(false);
                }
            }

            // ── COMPLETED: stop GPS + request tenant approval ─────────────────
            if (newStatus === 'completed') {
                updatePayload.technicianNotes = notes;
                updatePayload.materialsUsed = materials
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                updatePayload.completedAt = serverTimestamp();
                updatePayload.tenantApprovalRequired = true;
                updatePayload.trackingStatus = 'COMPLETED';
                if (isTracking) {
                    stopLiveTracking(user.uid);
                    setIsTracking(false);
                }
            }

            // ── ESCALATED / CANCELLED: stop GPS ───────────────────────────────
            if (['escalated', 'cancelled'].includes(newStatus)) {
                updatePayload.escalatedAt = serverTimestamp();
                if (isTracking) {
                    stopLiveTracking(user.uid);
                    setIsTracking(false);
                }
            }

            await updateDoc(doc(db, 'maintenanceTickets', id), updatePayload);

            // Audit log
            await logAuditAction({
                action: TICKET_AUDIT_ACTIONS.STATUS_UPDATE,
                targetType: 'maintenanceTickets',
                targetId: id,
                actorId: user.uid,
                actorRole: 'technician',
                before: { status: ticket.status },
                after: { status: newStatus },
                metadata: updatePayload,
            });

            // ── Notifications ──────────────────────────────────────────────────
            const recipientId = ticket?.tenantId || ticket?.tenantUid || ticket?.ownerId || ticket?.ownerUid;
            if (recipientId) {
                if (newStatus === 'completed') {
                    notifyCompletionRequest(id, recipientId, user.displayName || 'Technician').catch(console.warn);
                } else if (newStatus === 'accepted') {
                    sendNotification({
                        recipientId,
                        recipientRole: ticket.requesterRole || 'tenant',
                        type: 'TECH_ACCEPTED',
                        title: 'Technician Accepted Your Complaint',
                        body: `${user.displayName || 'A technician'} has accepted your complaint and will be on the way soon.`,
                        ticketId: id,
                    }).catch(console.warn);
                } else if (newStatus === 'on_the_way') {
                    sendNotification({
                        recipientId,
                        recipientRole: ticket.requesterRole || 'tenant',
                        type: 'TECH_ON_THE_WAY',
                        title: 'Technician Is On The Way',
                        body: `${user.displayName || 'Your technician'} is heading to your location now.`,
                        ticketId: id,
                    }).catch(console.warn);
                } else if (newStatus === 'arrived') {
                    sendNotification({
                        recipientId,
                        recipientRole: ticket.requesterRole || 'tenant',
                        type: 'TECH_ARRIVED',
                        title: 'Technician Has Arrived',
                        body: `${user.displayName || 'Your technician'} has arrived at the property.`,
                        ticketId: id,
                    }).catch(console.warn);
                } else {
                    notifyStatusUpdate(id, recipientId, newStatus).catch(console.warn);
                }
            }

            if (newStatus === 'completed') navigate('/technician/jobs');
        } catch (err: any) {
            console.error('[TechJobDetail] Status update failed:', err);
            alert('Update failed: ' + (err.message || err));
        } finally {
            setActionLoading(false);
        }
    }, [id, user, ticket, isTracking, notes, materials, navigate]);

    // ── Loading / Empty States ─────────────────────────────────────────────────
    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }
    if (!ticket) return null;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'accepted':
            case 'ASSIGNED': return '#3b82f6';
            case 'on_the_way':
            case 'EN_ROUTE': return '#f59e0b';
            case 'arrived':
            case 'ARRIVED': return '#6366f1';
            case 'in_progress':
            case 'IN_PROGRESS': return '#10b981';
            case 'waiting_parts': return '#ef4444';
            case 'escalated': return '#dc2626';
            default: return 'rgba(255,255,255,0.4)';
        }
    };

    const resolved = resolvePropertyLocation(ticket);

    return (
        <Box>
            {/* Snackbar */}
            <Snackbar
                open={!!snackMsg}
                autoHideDuration={4000}
                onClose={() => setSnackMsg(null)}
                message={snackMsg}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            />

            {/* GPS Error Alert */}
            {gpsError && (
                <Alert severity="warning" onClose={() => setGpsError(null)} sx={{ mb: 2, borderRadius: 3 }}>
                    {gpsError}
                </Alert>
            )}

            {/* Mission Header */}
            <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={2} alignItems="center">
                        <IconButton onClick={() => navigate(-1)} sx={{ color: '#FFF' }}>
                            <ChevronLeft />
                        </IconButton>
                        <Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>
                                MISSION CONTROL · REF {ticket.id.substring(0, 8).toUpperCase()}
                            </Typography>
                            <Typography variant="h5" fontWeight="950" color="#FFF">
                                {ticket.category || 'Standard Task'}
                            </Typography>
                        </Box>
                    </Stack>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, display: 'block' }}>
                            ELAPSED TIME
                        </Typography>
                        <Typography variant="h6" fontWeight="950" color={ticket.priority === 'emergency' ? '#ef4444' : binThemeTokens.gold}>
                            {slaTime}
                        </Typography>
                    </Box>
                </Stack>
            </Paper>

            {/* GPS Tracking Indicator */}
            {isTracking && (
                <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 4 }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                        <Wifi size={18} color="#22d3ee" />
                        <Box>
                            <Typography variant="body2" fontWeight="950" sx={{ color: '#22d3ee' }}>
                                Live GPS Tracking Active
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                Your location is being shared with the resident. Updates every 10 seconds.
                            </Typography>
                        </Box>
                    </Stack>
                </Paper>
            )}

            <Grid container spacing={4}>
                {/* Left Column */}
                <Grid item xs={12} lg={8}>
                    {/* Residency Details */}
                    <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'block' }}>
                            RESIDENCY METADATA
                        </Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <Stack direction="row" spacing={2}>
                                    <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}>
                                        <MapPin />
                                    </Avatar>
                                    <Box>
                                        <Typography variant="body1" fontWeight="950" color="#FFF">
                                            {ticket.propertyName || 'Property'}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            Unit {ticket.unitNumber} · Level {ticket.floor}
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Stack direction="row" spacing={2}>
                                    <Avatar sx={{ bgcolor: alpha('#FFF', 0.05), color: '#FFF' }}>
                                        <Phone />
                                    </Avatar>
                                    <Box>
                                        <Typography variant="body1" fontWeight="950" color="#FFF">
                                            {ticket.tenantName || ticket.ownerName || 'Resident'}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            {ticket.tenantPhone || ticket.ownerPhone || '—'}
                                        </Typography>
                                        <Chip
                                            label={ticket.requesterRole === 'owner' ? 'Owner' : 'Tenant'}
                                            size="small"
                                            sx={{ mt: 0.5, fontSize: '0.65rem', fontWeight: 900, bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}
                                        />
                                    </Box>
                                </Stack>
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2, display: 'block' }}>
                            COMPLAINT LOG
                        </Typography>
                        <Typography variant="body1" color="#FFF" sx={{ lineHeight: 1.8 }}>
                            {ticket.description}
                        </Typography>

                        {ticket.specificLocation && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>
                                    SPECIFIC LOCATION
                                </Typography>
                                <Typography variant="body2" color="#FFF" sx={{ mt: 0.5 }}>
                                    {ticket.specificLocation}
                                </Typography>
                            </Box>
                        )}

                        {ticket.photos && ticket.photos.length > 0 && (
                            <Box sx={{ mt: 4 }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, mb: 2, display: 'block' }}>
                                    RESIDENT EVIDENCE ({ticket.photos.length} photos)
                                </Typography>
                                <Stack direction="row" spacing={2} flexWrap="wrap">
                                    {ticket.photos.map((url: string, i: number) => (
                                        <Box
                                            key={i}
                                            component="img"
                                            src={url}
                                            sx={{ width: 100, height: 100, borderRadius: 3, objectFit: 'cover', cursor: 'pointer' }}
                                            onClick={() => window.open(url, '_blank')}
                                        />
                                    ))}
                                </Stack>
                            </Box>
                        )}
                    </Paper>

                    {/* Mission Lifecycle Controls */}
                    <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 4, display: 'block' }}>
                            MISSION LIFECYCLE
                        </Typography>

                        {!ticket.assignedTechnicianId ? (
                            <Button
                                fullWidth
                                variant="contained"
                                size="large"
                                onClick={() => handleStatusUpdate('accepted')}
                                disabled={actionLoading}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, borderRadius: 4 }}
                            >
                                {actionLoading ? <CircularProgress size={22} color="inherit" /> : 'ACCEPT ASSIGNMENT'}
                            </Button>
                        ) : (
                            <Stack direction="row" flexWrap="wrap" gap={2}>
                                {[
                                    { id: 'on_the_way',      label: 'ON THE WAY',   icon: <Navigation size={18} />,   disabled: !['accepted', 'ASSIGNED'].includes(ticket.status) },
                                    { id: 'arrived',         label: 'ARRIVED',      icon: <MapPin size={18} />,        disabled: !['on_the_way', 'EN_ROUTE'].includes(ticket.status) },
                                    { id: 'in_progress',     label: 'START WORK',   icon: <Play size={18} />,          disabled: ticket.status !== 'arrived' },
                                    { id: 'waiting_parts',   label: 'PAUSE/PARTS',  icon: <Pause size={18} />,         disabled: ticket.status !== 'in_progress' },
                                    { id: 'escalated',       label: 'ESCALATE',     icon: <AlertTriangle size={18} />, disabled: ['completed', 'closed'].includes(ticket.status) },
                                ].map((step) => (
                                    <Button
                                        key={step.id}
                                        variant={ticket.status === step.id ? 'contained' : 'outlined'}
                                        onClick={() => handleStatusUpdate(step.id)}
                                        disabled={actionLoading || step.disabled || ticket.status === 'completed'}
                                        startIcon={step.icon}
                                        sx={{
                                            flex: 1,
                                            minWidth: '140px',
                                            bgcolor: ticket.status === step.id ? getStatusColor(step.id) : 'transparent',
                                            color: ticket.status === step.id ? '#000' : getStatusColor(step.id),
                                            borderColor: getStatusColor(step.id),
                                            fontWeight: 950,
                                            borderRadius: 3,
                                        }}
                                    >
                                        {step.label}
                                    </Button>
                                ))}
                            </Stack>
                        )}

                        {/* Completion Form */}
                        {ticket.status === 'in_progress' && (
                            <Box sx={{ mt: 6, p: 4, bgcolor: alpha(binThemeTokens.gold, 0.02), border: `1px dashed ${alpha(binThemeTokens.gold, 0.3)}`, borderRadius: 6 }}>
                                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Wrench color={binThemeTokens.gold} /> POST-MISSION REPORT
                                </Typography>
                                <Stack spacing={4}>
                                    <TextField
                                        fullWidth multiline rows={3} label="RESOLUTION NOTES" variant="filled"
                                        placeholder="Describe the solution applied…"
                                        value={notes} onChange={(e) => setNotes(e.target.value)}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.02)', '& .MuiFilledInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.4)', fontWeight: 900 } }}
                                    />
                                    <TextField
                                        fullWidth label="MATERIALS CONSUMED" variant="filled"
                                        placeholder="e.g. 2x LED Bulbs, 1x Socket…"
                                        value={materials} onChange={(e) => setMaterials(e.target.value)}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.02)', '& .MuiFilledInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.4)', fontWeight: 900 } }}
                                    />
                                    <Button
                                        variant="contained" size="large" fullWidth
                                        onClick={() => handleStatusUpdate('completed')}
                                        disabled={actionLoading || !notes.trim()}
                                        startIcon={<Check />}
                                        sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950, py: 2, borderRadius: 4, '&:hover': { bgcolor: '#059669' } }}
                                    >
                                        COMPLETE MISSION & NOTIFY RESIDENT
                                    </Button>
                                </Stack>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                {/* Right Column */}
                <Grid item xs={12} lg={4}>
                    <Stack spacing={4}>
                        {/* Navigation */}
                        <Paper sx={{ p: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'block' }}>
                                LOCATION & NAVIGATION
                            </Typography>
                            {resolved.hasExactCoordinates ? (
                                <Stack spacing={2}>
                                    <Button
                                        fullWidth variant="contained"
                                        startIcon={<Navigation size={18} />}
                                        onClick={() => window.open(resolved.googleMapsUrl, '_blank', 'noopener,noreferrer')}
                                        sx={{ py: 1.5, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3 }}
                                    >
                                        Navigate to Property
                                    </Button>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', display: 'block', fontFamily: 'monospace' }}>
                                        GPS: {resolved.latitude}, {resolved.longitude}
                                    </Typography>
                                </Stack>
                            ) : (
                                <Box sx={{ p: 2, bgcolor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 2 }}>
                                    <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 900, textAlign: 'center' }}>
                                        Exact GPS pin missing. Contact Admin before dispatch.
                                    </Typography>
                                </Box>
                            )}
                        </Paper>

                        {/* Comms */}
                        <Paper sx={{ p: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'block' }}>
                                COMMS CHANNELS
                            </Typography>
                            <Stack spacing={2}>
                                <Button
                                    fullWidth variant="outlined"
                                    startIcon={<MessageSquare />}
                                    onClick={() => navigate(`/technician/chat/${id}`)}
                                    sx={{ py: 1.5, borderColor: alpha(binThemeTokens.gold, 0.3), color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3 }}
                                >
                                    CHAT WITH RESIDENT
                                </Button>
                                {(ticket.tenantPhone || ticket.ownerPhone) && (
                                    <Button
                                        fullWidth variant="outlined"
                                        startIcon={<Phone />}
                                        onClick={() => window.open(`tel:${ticket.tenantPhone || ticket.ownerPhone}`)}
                                        sx={{ py: 1.5, borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 950, borderRadius: 3 }}
                                    >
                                        CALL RESIDENT
                                    </Button>
                                )}
                                <Button
                                    fullWidth variant="outlined"
                                    startIcon={<ShieldCheck />}
                                    sx={{ py: 1.5, borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontWeight: 950, borderRadius: 3 }}
                                >
                                    CONTACT ADMIN / BASE
                                </Button>
                            </Stack>
                        </Paper>

                        {/* Mission Timeline */}
                        <Paper sx={{ p: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'block' }}>
                                MISSION TIMELINE
                            </Typography>
                            <Stack spacing={3}>
                                {[
                                    { label: 'Complaint Created', ts: ticket.createdAt, color: '#4ade80' },
                                    { label: 'Accepted', ts: ticket.acceptedAt, color: binThemeTokens.gold },
                                    { label: 'On The Way', ts: ticket.onTheWayAt, color: '#f59e0b' },
                                    { label: 'Arrived', ts: ticket.arrivedAt, color: '#6366f1' },
                                    { label: 'Work Started', ts: ticket.startedAt, color: '#10b981' },
                                    { label: 'Completed', ts: ticket.completedAt, color: '#10b981' },
                                ]
                                    .filter((item) => item.ts)
                                    .map((item, i) => (
                                        <Box key={i} sx={{ display: 'flex', gap: 2 }}>
                                            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: item.color, mt: 0.5, flexShrink: 0 }} />
                                            <Box>
                                                <Typography variant="body2" fontWeight="950" color="#FFF">{item.label}</Typography>
                                                <Typography variant="caption" color="textSecondary">
                                                    {item.ts?.toDate ? item.ts.toDate().toLocaleString() : '—'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    ))}
                            </Stack>
                        </Paper>
                    </Stack>
                </Grid>
            </Grid>
        </Box>
    );
}
