/**
 * BIN GROUP — TechnicianJobsPage
 * Lists assigned active jobs. Unassigned ticket details stay private until an
 * authorized dispatcher binds the mission to an approved technician.
 */
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Stack, Chip, CircularProgress,
    Button, Grid, alpha, Divider, Alert
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
    Clock, Navigation, ArrowRight, BellRing
} from 'lucide-react';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { ALL_TECHNICIAN_ACTIVE_STATUSES } from '../../shared-exports';
import type { SnapshotDoc } from '../../utils/queryUtils';
import { calculateDistanceKm, calculateEtaMinutes, getTechnicianLocation, getTicketJobLocation } from '../../utils/liveTracking';

// Text colours readable on the white technician shell (all >= 4.5:1 on white and on their 12% tint).
// The previous palette (#3b82f6, gold #C9A646, #10b981, #f59e0b) measured 2.1-3.7:1.
const JOBS_READABLE = {
    ink: '#111827',
    muted: '#475467',
    gold: '#7A5C12',
    amber: '#92400E',
    blue: '#1D4ED8',
    violet: '#6D28D9',
    green: '#047857',
    red: '#B91C1C',
} as const;

const STATUS_COLOR: Record<string, string> = {
    accepted: JOBS_READABLE.blue,
    auto_assigned: JOBS_READABLE.blue,
    ASSIGNED: JOBS_READABLE.blue,
    AUTO_ASSIGNED: JOBS_READABLE.blue,
    ACCEPTED: JOBS_READABLE.blue,
    on_the_way: JOBS_READABLE.gold,
    EN_ROUTE: JOBS_READABLE.gold,
    ON_THE_WAY: JOBS_READABLE.gold,
    arrived: JOBS_READABLE.violet,
    ARRIVED: JOBS_READABLE.violet,
    in_progress: JOBS_READABLE.green,
    IN_PROGRESS: JOBS_READABLE.green,
    waiting_parts: JOBS_READABLE.red,
    WAITING_PARTS: JOBS_READABLE.red,
};

const ACTIVE_STATUS_SET = new Set(ALL_TECHNICIAN_ACTIVE_STATUSES.map((status) => String(status)));

type AssignmentReceipt = {
    id: string;
    ticketId: string;
    pushDeliveryState: string;
    pushSuccessCount: number;
    pushFailureCount: number;
    createdAtMs: number;
};

function timestampMs(value: any) {
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function TechnicianJobsPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const { tx, isRTL } = useLanguage();

    const [assignedJobs, setAssignedJobs] = useState<SnapshotDoc[]>([]);
    const [assignmentReceipts, setAssignmentReceipts] = useState<Record<string, AssignmentReceipt>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        if (!user?.uid) return;

        // Query only the authenticated technician's assignments. Firestore
        // authorization remains bound to assignedTechnicianId, while status
        // normalization is handled client-side so legacy/lowercase and current
        // uppercase lifecycle values cannot split or hide the same mission.
        const assignedQuery = query(
            collection(db, 'maintenanceTickets'),
            where('assignedTechnicianId', '==', user.uid),
        );
        // Keep this query constrained only by the recipient identity so the live
        // portal never depends on a new composite index during dispatch. Role
        // and event-type filtering stay client-side after the identity-bound read.
        const receiptQuery = query(
            collection(db, 'notifications'),
            where('recipientId', '==', user.uid),
        );

        const unsubAssigned = onSnapshot(
            assignedQuery,
            (snap) => {
                const jobs = snap.docs
                    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SnapshotDoc))
                    .filter((job) => ACTIVE_STATUS_SET.has(String(job.status || '')));
                setAssignedJobs(jobs);
                setLoadError('');
                setLoading(false);
            },
            () => {
                setAssignedJobs([]);
                setLoadError(tx('tech.jobs.load_error', 'Assigned jobs could not be loaded. Check your connection or contact dispatch.'));
                setLoading(false);
            },
        );

        const unsubReceipts = onSnapshot(receiptQuery, (snap) => {
            const latest: Record<string, AssignmentReceipt> = {};
            snap.docs.forEach((docSnap) => {
                const data = docSnap.data() as Record<string, any>;
                if (String(data.recipientRole || '').toLowerCase() !== 'technician') return;
                if (String(data.type || '') !== 'TECHNICIAN_JOB_ASSIGNED') return;
                const ticketId = String(data.ticketId || '');
                if (!ticketId) return;
                const receipt: AssignmentReceipt = {
                    id: docSnap.id,
                    ticketId,
                    pushDeliveryState: String(data.pushDeliveryState || 'QUEUED'),
                    pushSuccessCount: Number(data.pushSuccessCount || 0),
                    pushFailureCount: Number(data.pushFailureCount || 0),
                    createdAtMs: timestampMs(data.createdAt),
                };
                if (!latest[ticketId] || receipt.createdAtMs >= latest[ticketId].createdAtMs) latest[ticketId] = receipt;
            });
            setAssignmentReceipts(latest);
        }, () => setAssignmentReceipts({}));

        return () => {
            unsubAssigned();
            unsubReceipts();
        };
    }, [user?.uid, tx]);

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
        </Box>
    );

    const renderJobCard = (job: any) => {
        const statusColor = STATUS_COLOR[String(job.status)] || JOBS_READABLE.muted;
        const isLive = ['on_the_way', 'EN_ROUTE', 'ON_THE_WAY'].includes(String(job.status));
        const techLoc = getTechnicianLocation(job);
        const jobLoc = getTicketJobLocation(job);
        const dist = calculateDistanceKm(techLoc, jobLoc);
        const eta = calculateEtaMinutes(dist);
        const receipt = assignmentReceipts[String(job.id)];
        const deliveryState = receipt?.pushDeliveryState || 'PENDING_TRIGGER';
        const deliverySucceeded = ['SUCCESS', 'PARTIAL'].includes(deliveryState) && (receipt?.pushSuccessCount || 0) > 0;

        return (
            <Paper key={job.id} data-testid="technician-assigned-job-card" sx={{
                p: 4, bgcolor: '#FFFFFF', borderRadius: 6,
                border: `1px solid ${isLive ? alpha(binThemeTokens.gold, 0.55) : '#E5E7EB'}`,
                transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' }
            }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: JOBS_READABLE.gold, fontWeight: 950, letterSpacing: 1 }}>
                            REF #{String(job.id).substring(0, 8)}
                        </Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ color: JOBS_READABLE.ink }}>
                            {String(job.category || job.complaintCategory || 'Maintenance')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: JOBS_READABLE.muted }}>
                            {String(job.propertyName || 'Property')} · Unit {String(job.unitNumber || 'N/A')}
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Chip
                            data-testid="technician-job-notification-receipt"
                            data-ticket-id={String(job.id)}
                            data-delivery-state={deliveryState}
                            size="small"
                            icon={<BellRing size={11} />}
                            label={`DISPATCH ALERT: ${deliveryState}`}
                            sx={{
                                fontSize: '0.62rem',
                                fontWeight: 950,
                                bgcolor: alpha(deliverySucceeded ? JOBS_READABLE.green : JOBS_READABLE.amber, 0.1),
                                color: deliverySucceeded ? JOBS_READABLE.green : JOBS_READABLE.amber,
                                '& .MuiChip-icon': { color: 'inherit' },
                            }}
                        />
                        {isLive && eta !== null && (
                            <Chip
                                size="small"
                                icon={<Clock size={11} />}
                                label={`~${eta} min rough estimate`}
                                sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: alpha(JOBS_READABLE.gold, 0.1), color: JOBS_READABLE.gold, height: 22, '& .MuiChip-icon': { color: JOBS_READABLE.gold } }}
                            />
                        )}
                        <Chip
                            label={String(job.status || '').replace(/_/g, ' ')}
                            size="small"
                            sx={{ bgcolor: alpha(statusColor, 0.1), color: statusColor, fontWeight: 950, fontSize: '0.7rem', border: `1px solid ${alpha(statusColor, 0.3)}` }}
                        />
                    </Stack>
                </Stack>

                {isLive && (
                    <Alert severity="info" icon={<Navigation size={16} />} sx={{ mb: 2, borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, color: JOBS_READABLE.gold }}>
                        {tx('tech.jobs.gps_active', 'GPS tracking ACTIVE — sharing location with requester')}
                    </Alert>
                )}

                <Divider sx={{ my: 2, borderColor: '#E5E7EB' }} />

                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="caption" sx={{ color: JOBS_READABLE.muted }}>{tx('tech.jobs.requester', 'REQUESTER')}</Typography>
                        <Typography variant="body1" fontWeight="900" sx={{ color: JOBS_READABLE.ink }}>
                            {String(job.tenantName || job.ownerName || 'N/A')}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="caption" sx={{ color: JOBS_READABLE.muted }}>{tx('tech.jobs.priority', 'PRIORITY')}</Typography>
                        <Typography variant="body1" fontWeight="900" sx={{ color: String(job.priority).toLowerCase() === 'emergency' ? JOBS_READABLE.red : JOBS_READABLE.ink, textTransform: 'uppercase' }}>
                            {String(job.priority || 'normal')}
                        </Typography>
                    </Grid>
                </Grid>

                <Button
                    data-testid="technician-open-job-card"
                    data-ticket-id={String(job.id)}
                    fullWidth variant="contained"
                    onClick={() => navigate(`/technician/job/${job.id}`)}
                    endIcon={<ArrowRight size={18} />}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, py: 1.5, borderRadius: 3, '&:hover': { bgcolor: '#b4954e' } }}
                >
                    {tx('tech.jobs.open_job', 'OPEN JOB CARD')}
                </Button>
            </Paper>
        );
    };

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            {loadError && <Alert data-testid="technician-jobs-load-error" severity="error" sx={{ mb: 3 }}>{loadError}</Alert>}
            <Typography variant="h4" fontWeight="950" sx={{ color: JOBS_READABLE.ink, mb: 2 }}>
                {tx('tech.jobs.title', 'My Jobs')}
            </Typography>
            <Typography variant="body2" sx={{ color: JOBS_READABLE.muted, mb: 5 }}>
                {tx('tech.jobs.subtitle', 'Active assignments securely issued by dispatch.')} Assignment alerts include a server delivery receipt.
            </Typography>

            <Typography variant="overline" sx={{ color: JOBS_READABLE.gold, fontWeight: 900, letterSpacing: 4, mb: 3, display: 'block' }}>
                {tx('tech.jobs.active_assignments', 'ACTIVE ASSIGNMENTS')} ({assignedJobs.length})
            </Typography>

            {assignedJobs.length === 0 ? (
                <Paper data-testid="technician-no-active-assignments" sx={{ p: 5, textAlign: 'center', bgcolor: '#F8F9FB', borderRadius: 6, border: '1px dashed #D0D5DD', mb: 5 }}>
                    <Typography fontWeight="900" sx={{ color: JOBS_READABLE.muted }}>{tx('tech.jobs.no_active', 'NO ACTIVE ASSIGNMENTS')}</Typography>
                </Paper>
            ) : (
                <Stack spacing={3} sx={{ mb: 6 }}>
                    {assignedJobs.map(renderJobCard)}
                </Stack>
            )}

            <Alert data-testid="technician-dispatch-boundary" severity="info" sx={{ borderRadius: 3 }}>
                {tx(
                    'tech.jobs.dispatch_only',
                    'For resident privacy and duplicate-claim protection, full mission details appear only after dispatch assigns the ticket to you.'
                )}
            </Alert>
        </Box>
    );
}
