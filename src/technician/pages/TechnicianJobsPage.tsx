/**
 * BIN GROUP — TechnicianJobsPage
 * Lists assigned active jobs and open pool jobs a technician can accept.
 * Shows live tracking status badge and GPS indicator for on_the_way jobs.
 */
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Stack, Chip, CircularProgress,
    Button, Grid, alpha, Divider, Alert
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
    Clock, MapPin, Navigation, ArrowRight, CheckCircle, Zap, User
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDocs, runTransaction } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { ALL_TECHNICIAN_ACTIVE_STATUSES, onSnapshotSplitIn } from '../../shared-exports';
import type { SnapshotDoc } from '../../utils/queryUtils';
import { calculateDistanceKm, calculateEtaMinutes, getTechnicianLocation, getTicketJobLocation } from '../../utils/liveTracking';

const STATUS_COLOR: Record<string, string> = {
    accepted:    '#3b82f6',
    ASSIGNED:    '#3b82f6',
    on_the_way:  binThemeTokens.gold,
    EN_ROUTE:    binThemeTokens.gold,
    arrived:     '#8b5cf6',
    ARRIVED:     '#8b5cf6',
    in_progress: '#10b981',
    IN_PROGRESS: '#10b981',
};

export default function TechnicianJobsPage() {
    const { user } = useRole();
    const navigate = useNavigate();

    const [assignedJobs, setAssignedJobs] = useState<SnapshotDoc[]>([]);
    const [poolJobs, setPoolJobs]         = useState<any[]>([]);
    const [loading, setLoading]           = useState(true);
    const [accepting, setAccepting]       = useState<string | null>(null);
    const [techProfile, setTechProfile]   = useState<any>(null);

    // Load assigned/active jobs
    useEffect(() => {
        if (!user?.uid) return;
        const unsub = onSnapshotSplitIn(
            collection(db, 'maintenanceTickets'),
            { field: 'assignedTechnicianId', value: user.uid },
            'status',
            ALL_TECHNICIAN_ACTIVE_STATUSES,
            (jobs: SnapshotDoc[]) => {
                setAssignedJobs(jobs);
                setLoading(false);
            }
        );
        return () => unsub();
    }, [user]);

    // Load technician profile (for identity snapshot on accept)
    useEffect(() => {
        if (!user?.uid) return;
        const unsub = onSnapshot(doc(db, 'technicians', user.uid), (snap) => {
            if (snap.exists()) setTechProfile({ id: snap.id, ...snap.data() });
        });
        return () => unsub();
    }, [user]);

    // Load open pool jobs (unassigned, OPEN/PENDING)
    useEffect(() => {
        if (!user?.uid) return;
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('status', 'in', ['OPEN', 'open', 'PENDING_ASSIGNMENT', 'pending_assignment'])
        );
        const unsub = onSnapshot(q, (snap) => {
            // Filter out jobs that already have an assignee
            setPoolJobs(snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter((j: any) => !j.assignedTechnicianId && !j.technicianId)
            );
        }, (err) => {
            console.warn('[JobPool] listener error (check permissions):', err);
        });
        return () => unsub();
    }, [user]);

    // Accept a job from the open pool
    const handleAccept = async (jobId: string) => {
        if (!user?.uid) return;
        setAccepting(jobId);
        try {
            await runTransaction(db, async (transaction) => {
                const ticketRef = doc(db, 'maintenanceTickets', jobId);
                const ticketSnap = await transaction.get(ticketRef);
                if (!ticketSnap.exists()) {
                    throw new Error("Job document does not exist.");
                }
                const ticketData = ticketSnap.data();
                if (ticketData.assignedTechnicianId || ticketData.technicianId) {
                    throw new Error("This job has already been accepted by another technician.");
                }
                transaction.update(ticketRef, {
                    assignedTechnicianId:    user.uid,
                    technicianId:            user.uid,
                    assignedTechnicianName:  user.displayName || techProfile?.name || 'Technician',
                    assignedTechnicianPhone: user.phoneNumber || techProfile?.phone || '',
                    assignedTechnicianAvatar: user.photoURL || techProfile?.photoURL || '',
                    technicianSpecialty:     techProfile?.specialty || techProfile?.trade || '',
                    status:          'accepted',
                    dispatchStatus:  'ASSIGNED',
                    trackingStatus:  'TECHNICIAN_ASSIGNED',
                    acceptedAt:      serverTimestamp(),
                    updatedAt:       serverTimestamp(),
                });
            });
            navigate(`/technician/job/${jobId}`);
        } catch (err) {
            console.error('[Accept] Failed:', err);
            alert('Failed to accept job: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setAccepting(null);
        }
    };

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
        </Box>
    );

    return (
        <Box>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                My Jobs
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 5 }}>
                Active assignments and open pool jobs.
            </Typography>

            {/* ── Active Assigned Jobs ─────────────────────────────────────── */}
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4, mb: 3, display: 'block' }}>
                ACTIVE ASSIGNMENTS ({assignedJobs.length})
            </Typography>

            {assignedJobs.length === 0 ? (
                <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.1)', mb: 5 }}>
                    <Typography color="textSecondary" fontWeight="900">NO ACTIVE ASSIGNMENTS</Typography>
                </Paper>
            ) : (
                <Stack spacing={3} sx={{ mb: 6 }}>
                    {assignedJobs.map(job => {
                        const statusColor = STATUS_COLOR[String(job.status)] || 'rgba(255,255,255,0.4)';
                        const isLive = ['on_the_way', 'EN_ROUTE'].includes(String(job.status));
                        const techLoc = getTechnicianLocation(job);
                        const jobLoc  = getTicketJobLocation(job);
                        const dist    = calculateDistanceKm(techLoc, jobLoc);
                        const eta     = calculateEtaMinutes(dist);

                        return (
                            <Paper key={job.id} sx={{
                                p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6,
                                border: `1px solid ${isLive ? alpha(binThemeTokens.gold, 0.35) : 'rgba(255,255,255,0.05)'}`,
                                transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' }
                            }}>
                                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                                    <Box>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 1 }}>
                                            REF #{String(job.id).substring(0, 8)}
                                        </Typography>
                                        <Typography variant="h6" fontWeight="950" color="#FFF">
                                            {String(job.category || job.complaintCategory || 'Maintenance')}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            {String(job.propertyName || 'Property')} · Unit {String(job.unitNumber || 'N/A')}
                                        </Typography>
                                    </Box>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        {isLive && eta !== null && (
                                            <Chip
                                                size="small"
                                                icon={<Clock size={11} />}
                                                label={`~${eta} min ETA`}
                                                sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, height: 22, '& .MuiChip-icon': { color: binThemeTokens.gold } }}
                                            />
                                        )}
                                        <Chip
                                            label={String(job.status || '').replace(/_/g, ' ')}
                                            size="small"
                                            sx={{ bgcolor: alpha(statusColor, 0.12), color: statusColor, fontWeight: 950, fontSize: '0.7rem', border: `1px solid ${alpha(statusColor, 0.25)}` }}
                                        />
                                    </Stack>
                                </Stack>

                                {isLive && (
                                    <Alert severity="info" icon={<Navigation size={16} />} sx={{ mb: 2, borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, color: binThemeTokens.gold }}>
                                        GPS tracking ACTIVE — sharing location with requester
                                    </Alert>
                                )}

                                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.06)' }} />

                                <Grid container spacing={2} sx={{ mb: 3 }}>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="caption" color="textSecondary">REQUESTER</Typography>
                                        <Typography variant="body1" fontWeight="900" color="#FFF">
                                            {String(job.tenantName || job.ownerName || 'N/A')}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="caption" color="textSecondary">PRIORITY</Typography>
                                        <Typography variant="body1" fontWeight="900" sx={{ color: job.priority === 'emergency' ? '#ef4444' : '#FFF', textTransform: 'uppercase' }}>
                                            {String(job.priority || 'normal')}
                                        </Typography>
                                    </Grid>
                                </Grid>

                                <Button
                                    fullWidth variant="contained"
                                    onClick={() => navigate(`/technician/job/${job.id}`)}
                                    endIcon={<ArrowRight size={18} />}
                                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 3, '&:hover': { bgcolor: '#b4954e' } }}
                                >
                                    OPEN JOB CARD
                                </Button>
                            </Paper>
                        );
                    })}
                </Stack>
            )}

            {/* ── Open Pool ─────────────────────────────────────────────────── */}
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 4, mb: 3, display: 'block' }}>
                OPEN JOB POOL ({poolJobs.length})
            </Typography>

            {poolJobs.length === 0 ? (
                <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.08)' }}>
                    <Typography color="textSecondary" fontWeight="900">NO OPEN JOBS IN POOL</Typography>
                </Paper>
            ) : (
                <Stack spacing={2}>
                    {poolJobs.map(job => (
                        <Paper key={job.id} sx={{
                            p: 3, bgcolor: 'rgba(15, 23, 42, 0.5)', borderRadius: 5,
                            border: '1px solid rgba(255,255,255,0.06)',
                            transition: 'all 0.2s', '&:hover': { borderColor: 'rgba(255,255,255,0.12)', transform: 'translateY(-1px)' }
                        }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
                                <Box sx={{ flex: 1 }}>
                                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
                                        <Chip
                                            size="small"
                                            label={String(job.priority || 'normal').toUpperCase()}
                                            sx={{
                                                bgcolor: job.priority === 'emergency' ? alpha('#ef4444', 0.15) : alpha(binThemeTokens.gold, 0.08),
                                                color: job.priority === 'emergency' ? '#ef4444' : binThemeTokens.gold,
                                                fontWeight: 950, fontSize: '0.6rem', height: 20
                                            }}
                                        />
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>
                                            #{String(job.id).substring(0, 8)}
                                        </Typography>
                                    </Stack>
                                    <Typography variant="body1" fontWeight="900" color="#FFF" sx={{ mb: 0.5 }}>
                                        {String(job.category || job.complaintCategory || 'Maintenance')}
                                    </Typography>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'rgba(255,255,255,0.4)' }}>
                                            <MapPin size={13} />
                                            <Typography variant="caption" fontWeight="800">
                                                {String(job.propertyName || 'Property')}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'rgba(255,255,255,0.4)' }}>
                                            <User size={13} />
                                            <Typography variant="caption" fontWeight="800">
                                                {String(job.tenantName || job.ownerName || 'Requester')}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </Box>

                                <Button
                                    variant="contained"
                                    disabled={accepting === job.id}
                                    onClick={() => handleAccept(job.id)}
                                    startIcon={accepting === job.id ? <CircularProgress size={14} color="inherit" /> : <CheckCircle size={16} />}
                                    sx={{
                                        bgcolor: '#10b981', color: '#FFF', fontWeight: 950,
                                        borderRadius: 3, px: 3, py: 1.2,
                                        '&:hover': { bgcolor: '#059669' },
                                        flexShrink: 0
                                    }}
                                >
                                    {accepting === job.id ? 'ACCEPTING…' : 'ACCEPT JOB'}
                                </Button>
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Box>
    );
}
