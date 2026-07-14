import React, { useEffect, useState } from 'react';
import { Alert, Box, Chip, CircularProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CalendarClock, CheckCircle2, Clock, FileText, Navigation, Play, Repeat2, ChevronRight } from 'lucide-react';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { calculateDistanceKm, calculateEtaMinutes, getTechnicianLocation, getTicketJobLocation } from '../../utils/liveTracking';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const label = (value: unknown) => String(value || 'PENDING').replace(/_/g, ' ').toUpperCase();

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
    OPEN: { color: 'rgba(255,255,255,0.48)', icon: Clock },
    open: { color: 'rgba(255,255,255,0.48)', icon: Clock },
    PENDING_ASSIGNMENT: { color: 'rgba(255,255,255,0.48)', icon: Clock },
    PENDING_SCHEDULING: { color: '#38bdf8', icon: CalendarClock },
    AWAITING_TENANT_QUOTE_APPROVAL: { color: '#f59e0b', icon: CalendarClock },
    SCHEDULED: { color: '#22c55e', icon: CalendarClock },
    RESCHEDULE_REQUESTED: { color: '#38bdf8', icon: CalendarClock },
    CANCELLATION_REQUESTED: { color: '#ef4444', icon: AlertCircle },
    accepted: { color: '#3b82f6', icon: Clock },
    ASSIGNED: { color: '#3b82f6', icon: Clock },
    on_the_way: { color: binThemeTokens.gold, icon: Navigation },
    EN_ROUTE: { color: binThemeTokens.gold, icon: Navigation },
    arrived: { color: '#8b5cf6', icon: CalendarClock },
    ARRIVED: { color: '#8b5cf6', icon: CalendarClock },
    in_progress: { color: '#10b981', icon: Play },
    IN_PROGRESS: { color: '#10b981', icon: Play },
    completed: { color: '#10b981', icon: CheckCircle2 },
    COMPLETED: { color: '#10b981', icon: CheckCircle2 },
    closed: { color: '#10b981', icon: CheckCircle2 },
    CLOSED: { color: '#10b981', icon: CheckCircle2 },
    CANCELLED: { color: '#ef4444', icon: AlertCircle },
    QUOTE_REJECTED: { color: '#ef4444', icon: AlertCircle },
    emergency: { color: '#ef4444', icon: AlertCircle },
    emergency_submitted: { color: '#ef4444', icon: AlertCircle },
};

const ACTIVE_STATUSES = ['accepted', 'ASSIGNED', 'on_the_way', 'EN_ROUTE', 'arrived', 'ARRIVED', 'in_progress', 'IN_PROGRESS'];

function createdMillis(ticket: any) {
    if (ticket.createdAt?.toDate) return ticket.createdAt.toDate().getTime();
    if (typeof ticket.createdAt?.seconds === 'number') return ticket.createdAt.seconds * 1000;
    const parsed = new Date(ticket.createdAt || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function appointmentText(ticket: any) {
    if (ticket.appointmentStart?.toDate) return ticket.appointmentStart.toDate().toLocaleString('en-AE');
    if (typeof ticket.appointmentStart?.seconds === 'number') return new Date(ticket.appointmentStart.seconds * 1000).toLocaleString('en-AE');
    return `${ticket.preferredServiceDate || ticket.requestedServiceDate || 'Date pending'} · ${ticket.preferredTimeWindow || 'Time pending'}`;
}

export default function TenantTicketsPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [warning, setWarning] = useState('');

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        const buckets: Record<string, any[]> = {};
        const successful = new Set<string>();
        const failed = new Set<string>();
        const emitMerged = () => {
            const merged = new Map<string, any>();
            Object.values(buckets).flat().forEach((ticket) => {
                if (ticket?.id) merged.set(ticket.id, ticket);
            });
            setTickets(Array.from(merged.values()).sort((a, b) => createdMillis(b) - createdMillis(a)));
            if (successful.size > 0) {
                setWarning('');
                setLoading(false);
            }
        };

        const sources: Array<{ key: string; value: string }> = [
            { key: 'tenantId', value: user.uid },
            { key: 'tenantUid', value: user.uid },
            { key: 'createdByUid', value: user.uid },
        ];
        const normalizedEmail = normalizeEmail(user.email);
        if (normalizedEmail) sources.push({ key: 'tenantEmail', value: normalizedEmail });

        const unsubscribers = sources.map((source) => onSnapshot(
            query(collection(db, 'maintenanceTickets'), where(source.key, '==', source.value)),
            (snapshot) => {
                successful.add(source.key);
                failed.delete(source.key);
                buckets[source.key] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
                emitMerged();
            },
            (error) => {
                console.warn(`[TenantTickets] listener (${source.key}) failed:`, error);
                failed.add(source.key);
                if (failed.size === sources.length && successful.size === 0) {
                    setWarning('Request history is temporarily unavailable. New repair and scheduled-service actions remain available.');
                    setLoading(false);
                }
            },
        ));

        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }, [user?.uid, user?.email]);

    if (loading) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('dash.initializing_stream') || 'Initializing Request Stream...'}</Typography>
        </Box>
    );

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 5, textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('dash.residency_ops') || 'RESIDENCY OPERATIONS'}</Typography>
                <Typography variant="h4" fontWeight="950" color="#FFF" sx={{ mt: 1 }}>{t('nav.tickets') || 'Requests & Service History'}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>Repairs, emergencies, cleaning, pest control, vacation care and moving services appear in one timeline.</Typography>
            </Box>

            {warning && <Alert severity="warning" sx={{ mb: 3 }}>{warning}</Alert>}

            <Stack spacing={2}>
                {tickets.map((ticket) => {
                    const status = String(ticket.status || 'OPEN');
                    const config = STATUS_CONFIG[status] || STATUS_CONFIG[ticket.priority === 'emergency' ? 'emergency' : 'ASSIGNED'];
                    const Icon = config.icon;
                    const isActive = ACTIVE_STATUSES.includes(status);
                    const isScheduledService = ticket.requestType === 'SCHEDULED_SERVICE';
                    const techLoc = getTechnicianLocation(ticket);
                    const jobLoc = getTicketJobLocation(ticket);
                    const distKm = calculateDistanceKm(techLoc, jobLoc);
                    const etaMin = calculateEtaMinutes(distKm);

                    return (
                        <Paper
                            key={ticket.id}
                            onClick={() => navigate(`/tenant/ticket/${ticket.id}`)}
                            sx={{
                                p: { xs: 2.5, md: 3 },
                                cursor: 'pointer',
                                bgcolor: isScheduledService ? 'rgba(15, 23, 42, 0.78)' : (isActive ? 'rgba(15, 23, 42, 0.6)' : 'rgba(15, 23, 42, 0.4)'),
                                border: `1px solid ${alpha(config.color, isScheduledService ? 0.28 : 0.2)}`,
                                borderRadius: 6,
                                transition: 'all 0.2s',
                                '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(15, 23, 42, 0.88)', transform: 'translateY(-2px)' },
                            }}
                        >
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="flex-start" spacing={2}>
                                <Box sx={{ textAlign: isRTL ? 'right' : 'left', flex: 1, minWidth: 0 }}>
                                    <Typography variant="body1" fontWeight="950" color="#FFF" sx={{ mb: 0.5, wordBreak: 'break-word' }}>
                                        {ticket.serviceLabel || ticket.description || ticket.category || t('ticket.no_description') || 'No Description'}
                                    </Typography>
                                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ color: 'rgba(255,255,255,0.4)', flexWrap: 'wrap' }}>
                                        <Typography variant="caption" sx={{ fontWeight: 800 }}>{t('common.ref') || 'REF'}: #{ticket.id.substring(0, 8).toUpperCase()}</Typography>
                                        <Typography variant="caption">•</Typography>
                                        <Typography variant="caption" sx={{ fontWeight: 800 }}>{ticket.category}</Typography>
                                    </Stack>

                                    {isScheduledService && (
                                        <Stack spacing={1} sx={{ mt: 1.5 }}>
                                            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap">
                                                <Chip size="small" icon={<CalendarClock size={12} />} label={appointmentText(ticket)} sx={{ bgcolor: alpha('#38bdf8', 0.12), color: '#7dd3fc', '& .MuiChip-icon': { color: '#7dd3fc' } }} />
                                                <Chip size="small" label={`Quote: ${label(ticket.quoteStatus || 'PENDING')}`} sx={{ bgcolor: alpha('#f59e0b', 0.12), color: '#fbbf24' }} />
                                                {ticket.recurrenceFrequency && ticket.recurrenceFrequency !== 'one-time' && <Chip size="small" icon={<Repeat2 size={12} />} label={`${label(ticket.recurrenceFrequency)} · ${ticket.recurrenceSequence || 1}/${ticket.recurrenceOccurrences || 1}`} sx={{ bgcolor: alpha('#8b5cf6', 0.12), color: '#c4b5fd', '& .MuiChip-icon': { color: '#c4b5fd' } }} />}
                                            </Stack>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Access: {label(ticket.accessMethod || 'TENANT PRESENT')} · Security: {label(ticket.securityAccessStatus || 'PENDING')}</Typography>
                                        </Stack>
                                    )}

                                    {isActive && (
                                        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" alignItems="center">
                                            {ticket.assignedTechnicianName && <Chip size="small" label={ticket.assignedTechnicianName} sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: 'rgba(255,255,255,0.05)', color: '#FFF', height: 22 }} />}
                                            {etaMin !== null && <Chip size="small" icon={<Clock size={11} />} label={`~${etaMin} min`} sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, height: 22, '& .MuiChip-icon': { color: binThemeTokens.gold } }} />}
                                            <Chip size="small" icon={<Navigation size={11} />} label="Track" sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: alpha(config.color, 0.15), color: config.color, height: 22, '& .MuiChip-icon': { color: config.color } }} />
                                        </Stack>
                                    )}
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)', fontWeight: 700, mt: 1, display: 'block' }}>{ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : ''}</Typography>
                                </Box>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" flexShrink={0}>
                                    <Chip icon={<Icon size={14} />} label={label(status)} sx={{ bgcolor: alpha(config.color, 0.1), color: config.color, fontWeight: 950, fontSize: '0.65rem', height: 24, borderRadius: 2, border: `1px solid ${alpha(config.color, 0.2)}`, '& .MuiChip-icon': { color: config.color } }} />
                                    <ChevronRight size={18} color="rgba(255,255,255,0.18)" style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                </Stack>
                            </Stack>
                        </Paper>
                    );
                })}

                {tickets.length === 0 && (
                    <Paper sx={{ p: 8, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8 }}>
                        <FileText size={48} color="rgba(255,255,255,0.08)" style={{ margin: '0 auto 16px' }} />
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 800 }}>NO REQUESTS YET</Typography>
                    </Paper>
                )}
            </Stack>
        </Box>
    );
}
