import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Grid, Stack, Button, 
    CircularProgress, Chip, alpha, Avatar, Divider,
    Tooltip, IconButton
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
    Power, Coffee, Clock, Activity, Zap, CheckCircle2, 
    ShieldCheck, ArrowRight, MapPin, MessageSquare,
    AlertTriangle, Target, TrendingUp, Star
} from 'lucide-react';
import { db, doc, updateDoc, collection, query, where, onSnapshot, limit, orderBy, serverTimestamp, addDoc } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { ALL_TECHNICIAN_ACTIVE_STATUSES, TICKET_AUDIT_ACTIONS, onSnapshotSplitIn, logAuditAction } from '../../shared-exports';

export default function TechnicianDashboardPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    
    const [loading, setLoading] = useState(true);
    const [dutyStatus, setDutyStatus] = useState(user?.dutyStatus || 'OFF');
    const [updating, setUpdating] = useState(false);
    
    const [stats, setStats] = useState({
        assigned: 0,
        emergency: 0,
        inProgress: 0,
        completedToday: 0
    });

    const [missionPool, setMissionPool] = useState<any[]>([]);
    const [activeJobs, setActiveJobs] = useState<any[]>([]);

    useEffect(() => {
        if (!user?.uid) return;
        setDutyStatus(user.dutyStatus || 'OFF');
        
        const today = new Date();
        today.setHours(0,0,0,0);

        // Active Assigned Jobs
        const unsubAssigned = onSnapshotSplitIn(
            collection(db, 'maintenanceTickets'),
            { field: 'assignedTechnicianId', value: user.uid },
            'status',
            ALL_TECHNICIAN_ACTIVE_STATUSES,
            (jobs) => {
                let assigned = 0, emergency = 0, inProgress = 0;
                jobs.forEach(data => {
                    assigned++;
                    if (['on_the_way', 'arrived', 'in_progress', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(data.status)) inProgress++;
                    if (data.priority === 'emergency') emergency++;
                });
                setActiveJobs(jobs);
                setStats(prev => ({ ...prev, assigned, emergency, inProgress }));
                setLoading(false);
            }
        );

        // Mission Pool (Unassigned Jobs)
        const qPool = query(
            collection(db, 'maintenanceTickets'),
            where('assignedTechnicianId', '==', null),
            where('status', 'in', ['OPEN', 'emergency_submitted']),
            orderBy('createdAt', 'desc'),
            limit(5)
        );

        const unsubPool = onSnapshot(qPool, (snap) => {
            setMissionPool(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Completed Today
        const qCompleted = query(
            collection(db, 'maintenanceTickets'),
            where('assignedTechnicianId', '==', user.uid),
            where('status', 'in', ['completed', 'CLOSED']),
            where('completedAt', '>=', today)
        );

        const unsubCompleted = onSnapshot(qCompleted, (snap) => {
            setStats(prev => ({ ...prev, completedToday: snap.size }));
        });

        return () => {
            unsubAssigned();
            unsubPool();
            unsubCompleted();
        };
    }, [user]);

    const handleDutyToggle = async (newStatus: string) => {
        if (!user?.uid) return;
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                dutyStatus: newStatus,
                onDuty: newStatus === 'WORKING',
                updatedAt: serverTimestamp()
            });
            
            await logAuditAction({
                action: TICKET_AUDIT_ACTIONS.DUTY_CHANGE,
                actorId: user.uid,
                actorRole: 'technician',
                targetType: 'users',
                targetId: user.uid,
                metadata: { newStatus }
            });

            setDutyStatus(newStatus);
        } catch (err) {
            console.error("Failed to update duty status", err);
        } finally {
            setUpdating(false);
        }
    };

    const handleAcceptJob = async (jobId: string) => {
        if (!user?.uid) return;
        try {
            await runTransaction(db, async (transaction) => {
                const jobRef = doc(db, 'maintenanceTickets', jobId);
                transaction.update(jobRef, {
                    assignedTechnicianId: user.uid,
                    assignedTechnicianName: user.displayName || 'Technician',
                    status: 'accepted',
                    acceptedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                const auditRef = doc(collection(db, 'audit_logs'));
                transaction.set(auditRef, {
                    action: TICKET_AUDIT_ACTIONS.JOB_ACCEPTED,
                    targetType: 'maintenanceTickets',
                    targetId: jobId,
                    actorId: user.uid,
                    actorRole: 'technician',
                    createdAt: serverTimestamp()
                });
            });

            navigate(`/technician/job/${jobId}`);
        } catch (err) {
            console.error("Failed to accept job", err);
        }
    };

    if (loading) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('dash.initializing_stream') || 'Initializing Operator Stream...'}</Typography>
        </Box>
    );

    const isOnDuty = dutyStatus === 'WORKING';

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Header / Identity */}
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('dash.terminal.technician') || 'FIELD SOVEREIGN'}</Typography>
                    <Typography variant="h4" fontWeight="950" color="#FFF" sx={{ mt: 1 }}>{t('dash.hello') || 'Hello'}, {user?.displayName?.split(' ')[0] || 'Operator'}</Typography>
                </Box>
                <Avatar sx={{ width: 60, height: 60, bgcolor: alpha(binThemeTokens.gold, 0.1), border: `2px solid ${alpha(binThemeTokens.gold, 0.5)}`, color: binThemeTokens.gold, fontWeight: 950 }}>
                    {user?.displayName?.charAt(0) || 'O'}
                </Avatar>
            </Box>

            {/* Duty Control System */}
            <Paper sx={{ p: 4, mb: 6, bgcolor: 'rgba(15, 23, 42, 0.6)', border: `1px solid ${isOnDuty ? alpha(binThemeTokens.gold, 0.4) : 'rgba(255,255,255,0.05)'}`, borderRadius: 8, textAlign: isRTL ? 'right' : 'left' }}>
                <Grid container spacing={3} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={12} md={6}>
                        <Stack direction={isRTL ? "row-reverse" : "row"} spacing={3} alignItems="center">
                            <Box sx={{ p: 2, bgcolor: isOnDuty ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.05)', borderRadius: 4, color: isOnDuty ? binThemeTokens.gold : 'rgba(255,255,255,0.3)', animation: isOnDuty ? 'pulse 2s infinite' : 'none' }}>
                                {dutyStatus === 'BREAK' ? <Coffee size={32} /> : <Power size={32} />}
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, letterSpacing: 1 }}>{t('dash.duty_status') || 'PROTOCOL STATUS'}</Typography>
                                <Typography variant="h5" fontWeight="950" sx={{ color: isOnDuty ? '#FFF' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                                    {t(`status.duty.${dutyStatus.toLowerCase()}`) || dutyStatus.replace('_', ' ')}
                                </Typography>
                            </Box>
                        </Stack>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Stack direction={isRTL ? "row-reverse" : "row"} spacing={2} justifyContent={{ xs: 'flex-start', md: isRTL ? 'flex-start' : 'flex-end' }}>
                            {dutyStatus === 'OFF' ? (
                                <Button variant="contained" onClick={() => handleDutyToggle('WORKING')} disabled={updating} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 6, py: 1.5, borderRadius: 4, boxShadow: `0 10px 30px ${alpha(binThemeTokens.gold, 0.3)}` }}>
                                    {t('dash.start_duty') || 'ACTIVATE PROTOCOL'}
                                </Button>
                            ) : (
                                <>
                                    {dutyStatus === 'WORKING' ? (
                                        <Button variant="outlined" onClick={() => handleDutyToggle('BREAK')} disabled={updating} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, px: 3, borderRadius: 4 }}>
                                            {t('dash.take_break') || 'STANDBY / BREAK'}
                                        </Button>
                                    ) : (
                                        <Button variant="contained" onClick={() => handleDutyToggle('WORKING')} disabled={updating} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 3, borderRadius: 4 }}>
                                            {t('dash.resume_work') || 'RESUME OPS'}
                                        </Button>
                                    )}
                                    <Button variant="outlined" color="error" onClick={() => handleDutyToggle('OFF')} disabled={updating} sx={{ fontWeight: 950, px: 3, borderRadius: 4 }}>
                                        {t('dash.end_duty') || 'TERMINATE SHIFT'}
                                    </Button>
                                </>
                            )}
                        </Stack>
                    </Grid>
                </Grid>
            </Paper>

            {/* KPI Performance Matrix */}
            <Grid container spacing={3} sx={{ mb: 6, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={6} md={3}>
                    <Paper sx={{ p: 4, bgcolor: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 6, textAlign: 'center' }}>
                        <Activity color="#3b82f6" style={{ margin: '0 auto 12px auto' }} />
                        <Typography variant="h4" fontWeight="950" color="#FFF">{stats.assigned}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('dash.active_orders') || 'ACTIVE MISSIONS'}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                    <Paper sx={{ p: 4, bgcolor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 6, textAlign: 'center' }}>
                        <Zap color="#ef4444" style={{ margin: '0 auto 12px auto' }} />
                        <Typography variant="h4" fontWeight="950" color="#FFF">{stats.emergency}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('priority.emergency') || 'PRIORITY 1'}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                    <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6, textAlign: 'center' }}>
                        <Clock color={binThemeTokens.gold} style={{ margin: '0 auto 12px auto' }} />
                        <Typography variant="h4" fontWeight="950" color="#FFF">{stats.inProgress}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('status.in_progress') || 'CURRENTLY IN OPS'}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                    <Paper sx={{ p: 4, bgcolor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 6, textAlign: 'center' }}>
                        <CheckCircle2 color="#10b981" style={{ margin: '0 auto 12px auto' }} />
                        <Typography variant="h4" fontWeight="950" color="#FFF">{stats.completedToday}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('dash.success_rate') || 'COMPLETED TODAY'}</Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Grid container spacing={4} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                {/* Mission Pool (Unassigned) */}
                <Grid item xs={12} lg={7}>
                    <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Target size={20} color={binThemeTokens.gold} /> {t('dash.mission_pool') || 'MISSION POOL'}
                            <Chip label={missionPool.length} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
                        </Typography>
                        <Button size="small" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('common.view_all_pool') || 'REFRESH'}</Button>
                    </Box>

                    <Stack spacing={2}>
                        {missionPool.map(job => (
                            <Paper key={job.id} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, transition: 'all 0.2s', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)', borderColor: binThemeTokens.gold } }}>
                                <Stack direction={isRTL ? "row-reverse" : "row"} justifyContent="space-between" alignItems="center">
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 1 }}>{job.category?.toUpperCase()} · #{job.id.substring(0,6)}</Typography>
                                        <Typography variant="body1" fontWeight="950" color="#FFF" sx={{ mt: 0.5 }}>{job.propertyName || 'Property'}</Typography>
                                        <Typography variant="caption" color="textSecondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
                                            <MapPin size={12} /> Unit {job.unitNumber} · Level {job.floor}
                                        </Typography>
                                    </Box>
                                    <Button 
                                        variant="contained" 
                                        size="small" 
                                        onClick={() => handleAcceptJob(job.id)}
                                        disabled={!isOnDuty}
                                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
                                    >
                                        {t('common.accept') || 'ACCEPT MISSION'}
                                    </Button>
                                </Stack>
                            </Paper>
                        ))}
                        {missionPool.length === 0 && (
                            <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 4 }}>
                                <Typography variant="body2" color="textSecondary" fontWeight="900">MISSION POOL CLEAR</Typography>
                            </Paper>
                        )}
                    </Stack>
                </Grid>

                {/* Performance Analytics */}
                <Grid item xs={12} lg={5}>
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('dash.operator_analytics') || 'OPERATOR ANALYTICS'}
                    </Typography>
                    <Paper sx={{ p: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                        <Stack spacing={4}>
                            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                <Stack direction={isRTL ? "row-reverse" : "row"} justifyContent="space-between" alignItems="center">
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950 }}>SLA COMPLIANCE</Typography>
                                    <Typography variant="body1" fontWeight="950" color="#4ade80">98.2%</Typography>
                                </Stack>
                                <Box sx={{ mt: 1, height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                    <Box sx={{ width: '98.2%', height: '100%', bgcolor: '#4ade80', borderRadius: 2 }} />
                                </Box>
                            </Box>
                            
                            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                <Stack direction={isRTL ? "row-reverse" : "row"} justifyContent="space-between" alignItems="center">
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950 }}>QUALITY RATING</Typography>
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                        <Star size={14} color={binThemeTokens.gold} fill={binThemeTokens.gold} />
                                        <Typography variant="body1" fontWeight="950" color={binThemeTokens.gold}>4.9</Typography>
                                    </Stack>
                                </Stack>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>Based on 124 residency approvals</Typography>
                            </Box>

                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, mb: 2, display: 'block' }}>DAILY MISSION TREND</Typography>
                                <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ height: 60 }}>
                                    {[30, 45, 25, 60, 80, 50, 70].map((h, i) => (
                                        <Tooltip key={i} title={`Day ${i+1}: ${h}% capacity`}>
                                            <Box sx={{ flex: 1, bgcolor: i === 4 ? binThemeTokens.gold : 'rgba(255,255,255,0.05)', height: `${h}%`, borderRadius: '2px 2px 0 0' }} />
                                        </Tooltip>
                                    ))}
                                </Stack>
                            </Box>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>

            <style>
                {`
                    @keyframes pulse {
                        0% { box-shadow: 0 0 0 0 ${alpha(binThemeTokens.gold, 0.4)}; }
                        70% { box-shadow: 0 0 0 10px ${alpha(binThemeTokens.gold, 0)}; }
                        100% { box-shadow: 0 0 0 0 ${alpha(binThemeTokens.gold, 0)}; }
                    }
                `}
            </style>
        </Box>
    );
}
