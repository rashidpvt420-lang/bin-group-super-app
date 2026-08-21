import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
    Container, Grid, Paper, Stack, Typography, alpha
} from '@mui/material';
import { Clock, Coffee, LogOut, MapPin, Play, Power, Wrench, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, collection, query, where, onSnapshot, functions, httpsCallable } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';

const ACTIVE_STATUSES = new Set(['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'WAITING_PARTS', 'ESCALATED']);

function normalizeStatus(value: unknown) {
    return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function toDate(value: any): Date | null {
    if (!value) return null;
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatWhen(value: any) {
    const date = toDate(value);
    if (!date) return null;
    return date.toLocaleString('en-AE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function TechnicianPortalPage() {
    const { t, isRTL } = useLanguage();
    const { user } = useRole();
    const navigate = useNavigate();
    const [assignedTickets, setAssignedTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const techUser = user as any;
    const isOnDuty = techUser?.onDuty === true;
    const dutyStatus = normalizeStatus(techUser?.dutyStatus || (isOnDuty ? 'ON_DUTY' : 'OFF_DUTY'));
    const isOnBreak = dutyStatus === 'BREAK' || dutyStatus === 'ON_BREAK';
    const technicianEmirate = String(techUser?.emirate || '').trim();

    useEffect(() => {
        if (!user?.uid) {
            setAssignedTickets([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        const assignedQuery = query(
            collection(db, 'maintenanceTickets'),
            where('assignedTechnicianId', '==', user.uid)
        );

        const unsubscribe = onSnapshot(
            assignedQuery,
            (snap: any) => {
                setAssignedTickets(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
                setLoading(false);
            },
            (listenerError: any) => {
                console.error('[TechnicianPortal] assigned ticket listener failed:', listenerError);
                setAssignedTickets([]);
                setError('Assigned missions could not be loaded from the live backend.');
                setLoading(false);
            }
        );

        return unsubscribe;
    }, [user?.uid]);

    const activeMissions = useMemo(
        () => assignedTickets.filter((ticket) => ACTIVE_STATUSES.has(normalizeStatus(ticket.status))),
        [assignedTickets]
    );
    const pendingAcceptance = useMemo(
        () => activeMissions.filter((ticket) => normalizeStatus(ticket.status) === 'ASSIGNED').length,
        [activeMissions]
    );

    const handleDutyAction = async (action: 'START' | 'END' | 'BREAK' | 'RESUME') => {
        setUpdating(true);
        setError(null);
        try {
            const callableName = action === 'START'
                ? 'startTechnicianDuty'
                : action === 'END'
                    ? 'endTechnicianDuty'
                    : action === 'BREAK'
                        ? 'takeTechnicianBreak'
                        : 'resumeTechnicianDuty';
            await httpsCallable(functions, callableName)({});
        } catch (actionError: any) {
            console.error('[TechnicianPortal] duty transition failed:', actionError);
            setError(actionError?.message || 'Duty transition failed.');
        } finally {
            setUpdating(false);
        }
    };

    const handleAcceptAssignedJob = async (ticketId: string) => {
        setUpdating(true);
        setError(null);
        try {
            const acceptTicket = httpsCallable(functions, 'acceptTechnicianTicket');
            await acceptTicket({ ticketId });
        } catch (acceptError: any) {
            console.error('[TechnicianPortal] assigned mission acceptance failed:', acceptError);
            setError(acceptError?.message || 'Assigned mission could not be accepted.');
        } finally {
            setUpdating(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#000' }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000', pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ pt: 4, pb: 5, px: 2, borderBottom: '1px solid rgba(212,175,55,0.1)' }}>
                <Container maxWidth="md">
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={3}>
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>
                                {t('tech.service_node') || 'TECHNICIAN SERVICE NODE'}
                            </Typography>
                            <Typography variant="h4" sx={{ fontWeight: 950, color: '#FFF' }}>
                                {user?.displayName || user?.email || 'Technician'}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mt: 0.5 }}>
                                {technicianEmirate || 'Operational territory not assigned'}
                            </Typography>
                        </Box>
                        <Chip
                            label={isOnDuty ? dutyStatus : 'OFF_DUTY'}
                            sx={{ bgcolor: isOnDuty ? alpha('#10b981', 0.12) : 'rgba(255,255,255,0.06)', color: isOnDuty ? '#4ade80' : 'rgba(255,255,255,0.5)', fontWeight: 950 }}
                        />
                    </Stack>

                    {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}

                    <Paper sx={{ mt: 4, p: 3, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={6}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box sx={{ width: 56, height: 56, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(binThemeTokens.gold, 0.08), color: binThemeTokens.gold }}>
                                        {isOnBreak ? <Coffee size={28} /> : <Power size={28} />}
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>LIVE DUTY STATE</Typography>
                                        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{isOnDuty ? dutyStatus : 'OFF_DUTY'}</Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', sm: 'flex-end' }} flexWrap="wrap" useFlexGap>
                                    {!isOnDuty ? (
                                        <Button variant="contained" startIcon={<Play size={18} />} disabled={updating} onClick={() => handleDutyAction('START')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                            START DUTY
                                        </Button>
                                    ) : (
                                        <>
                                            {isOnBreak ? (
                                                <Button variant="contained" startIcon={<Play size={18} />} disabled={updating} onClick={() => handleDutyAction('RESUME')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                                    RESUME DUTY
                                                </Button>
                                            ) : (
                                                <Button variant="outlined" startIcon={<Coffee size={18} />} disabled={updating} onClick={() => handleDutyAction('BREAK')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
                                                    TAKE BREAK
                                                </Button>
                                            )}
                                            <Button variant="outlined" color="error" startIcon={<LogOut size={18} />} disabled={updating} onClick={() => handleDutyAction('END')} sx={{ fontWeight: 950 }}>
                                                END DUTY
                                            </Button>
                                        </>
                                    )}
                                </Stack>
                            </Grid>
                        </Grid>
                    </Paper>
                </Container>
            </Box>

            <Container maxWidth="md" sx={{ py: 4 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 4 }}>
                    <Metric label="ACTIVE MISSIONS" value={activeMissions.length} />
                    <Metric label="PENDING ACCEPTANCE" value={pendingAcceptance} />
                    <Metric label="ASSIGNED RECORDS" value={assignedTickets.length} />
                </Stack>

                <Box sx={{ mb: 5 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                        <Zap size={18} color={binThemeTokens.gold} />
                        <Typography variant="h6" sx={{ fontWeight: 950, color: '#FFF' }}>ASSIGNED MISSIONS</Typography>
                    </Stack>
                    {activeMissions.length === 0 ? (
                        <EmptyState text="No active assigned mission is present in the live ticket feed. Dispatch must assign a mission before it can be accepted." />
                    ) : (
                        <Stack spacing={2}>
                            {activeMissions.map((mission) => {
                                const assigned = normalizeStatus(mission.status) === 'ASSIGNED';
                                return (
                                    <MissionCard
                                        key={mission.id}
                                        mission={mission}
                                        actionLabel={assigned ? 'ACCEPT ASSIGNED MISSION' : 'OPEN LIVE JOB'}
                                        disabled={updating || (assigned && !isOnDuty)}
                                        onAction={() => assigned
                                            ? handleAcceptAssignedJob(mission.id)
                                            : navigate(`/technician/ticket/${mission.id}`)}
                                    />
                                );
                            })}
                        </Stack>
                    )}
                </Box>

                <Alert severity="info" sx={{ bgcolor: 'rgba(59,130,246,0.08)', color: 'rgba(255,255,255,0.7)' }}>
                    New work is assigned by Dispatch. Technicians can only view and accept missions already assigned to their authenticated account.
                </Alert>
            </Container>
        </Box>
    );
}

function Metric({ label, value }: { label: string; value: number }) {
    return (
        <Paper sx={{ flex: 1, p: 2.5, bgcolor: 'rgba(22,22,24,0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{label}</Typography>
            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{value}</Typography>
        </Paper>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 5, border: '1px dashed rgba(255,255,255,0.1)' }}>
            <Wrench size={32} color="rgba(255,255,255,0.2)" />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 800, mt: 1.5 }}>{text}</Typography>
        </Paper>
    );
}

function MissionCard({ mission, onAction, actionLabel, disabled }: { mission: any; onAction: () => void; actionLabel: string; disabled: boolean }) {
    const scheduled = formatWhen(mission.scheduledFor || mission.scheduledAt || mission.appointmentDate);
    const distanceKm = Number(mission.distanceKm ?? mission.routing?.distanceKm);
    return (
        <Card sx={{ bgcolor: 'rgba(22,22,24,0.7)', borderRadius: 5, border: '1px solid rgba(255,255,255,0.05)' }}>
            <CardContent sx={{ p: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>#{String(mission.id).slice(0, 8)}</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 950, color: '#FFF' }}>{mission.issueType || mission.complaintCategory || mission.serviceType || 'Maintenance mission'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>{mission.propertyName || mission.propertyAddress || 'Property not recorded'}{mission.unitNumber ? ` · ${mission.unitNumber}` : ''}</Typography>
                    </Box>
                    <Chip label={normalizeStatus(mission.status) || 'STATUS_UNKNOWN'} size="small" sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.08), fontWeight: 900 }} />
                </Stack>
                {(scheduled || Number.isFinite(distanceKm)) && (
                    <Stack direction="row" spacing={2} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                        {scheduled && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', display: 'flex', gap: 0.75, alignItems: 'center' }}><Clock size={13} />{scheduled}</Typography>}
                        {Number.isFinite(distanceKm) && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', display: 'flex', gap: 0.75, alignItems: 'center' }}><MapPin size={13} />{distanceKm.toFixed(1)} km</Typography>}
                    </Stack>
                )}
                <Button onClick={onAction} disabled={disabled} fullWidth variant="contained" sx={{ mt: 3, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                    {actionLabel}
                </Button>
            </CardContent>
        </Card>
    );
}
