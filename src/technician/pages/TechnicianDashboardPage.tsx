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
import { db, doc, updateDoc, collection, query, where, onSnapshot, limit, orderBy, serverTimestamp, runTransaction } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { ALL_TECHNICIAN_ACTIVE_STATUSES, TICKET_AUDIT_ACTIONS, onSnapshotSplitIn, logAuditAction } from '../../shared-exports';
import type { SnapshotDoc } from '../../utils/queryUtils';

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
    const [activeJobs, setActiveJobs] = useState<SnapshotDoc[]>([]);

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
            (jobs: SnapshotDoc[]) => {
                let assigned = 0, emergency = 0, inProgress = 0;
                jobs.forEach((data: SnapshotDoc) => {
                    assigned++;
                    const status = String(data.status || '');
                    if (['on_the_way', 'arrived', 'in_progress', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(status)) inProgress++;
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
            await runTransaction(db, async (transaction: any) => {
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
                            <Box sx={{ p: 2, bgcolor: isOnDuty ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.05)', borderRadius: 4, color: isOnDuty ? binThemeTokens.gold : 'rgba(255,255,255,0.3)' }}>
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
                                <Button variant="contained" onClick={() => handleDutyToggle('WORKING')} disabled={updating} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, borderRadius: 4 }}>
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
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('dash.closed_today') || 'COMPLETED TODAY'}</Typography>
                    </Paper>
                </Grid>
            </Grid>

            {/* Active Mission Feed */}
            {activeJobs.length > 0 && (
                <Box sx={{ mb: 6 }}>
                    <Stack direction={isRTL ? "row-reverse" : "row"} justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF">{t('dash.active_missions') || 'ACTIVE MISSION FEED'}</Typography>
                        <Button size="small" onClick={() => navigate('/technician/jobs')} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('common.view_all') || 'VIEW ALL'}</Button>
                    </Stack>
                    <Stack spacing={2}>
                        {activeJobs.slice(0, 2).map(job => (
                            <Paper key={job.id} onClick={() => navigate(`/technician/job/${job.id}`)} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, cursor: 'pointer', transition: 'all 0.2s', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: alpha(binThemeTokens.gold, 0.3) } }}>
                                <Stack direction={isRTL ? "row-reverse" : "row"} spacing={2} alignItems="center">
                                    <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}><MapPin size={20} /></Box>
                                    <Box flex={1}>
                                        <Typography fontWeight="900" color="#FFF">{String(job.category || 'Maintenance')} - {String(job.unitNumber || '')}</Typography>
                                        <Typography variant="caption" color="rgba(255,255,255,0.4)">{String(job.propertyName || 'Property')}</Typography>
                                    </Box>
                                    <ArrowRight size={16} color="rgba(255,255,255,0.3)" style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                </Box>
            )}

            {/* Mission Pool */}
            {missionPool.length > 0 && isOnDuty && (
                <Box>
                    <Stack direction={isRTL ? "row-reverse" : "row"} spacing={1} alignItems="center" sx={{ mb: 3 }}>
                        <Target size={20} color={binThemeTokens.gold} />
                        <Typography variant="h6" fontWeight="950" color="#FFF">{t('dash.available_missions') || 'AVAILABLE MISSION POOL'}</Typography>
                    </Stack>
                    <Grid container spacing={3}>
                        {missionPool.map(job => (
                            <Grid item xs={12} md={6} key={job.id}>
                                <Paper sx={{ p: 4, bgcolor: job.priority === 'emergency' ? alpha('#ef4444', 0.08) : 'rgba(22, 22, 24, 0.7)', border: `1px solid ${job.priority === 'emergency' ? alpha('#ef4444', 0.3) : 'rgba(255,255,255,0.05)'}`, borderRadius: 6, transition: 'all 0.2s', '&:hover': { transform: 'translateY(-4px)', borderColor: alpha(binThemeTokens.gold, 0.3) } }}>
                                    <Stack direction={isRTL ? "row-reverse" : "row"} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
                                        <Box>
                                            <Typography variant="overline" sx={{ color: job.priority === 'emergency' ? '#ef4444' : binThemeTokens.gold, fontWeight: 950 }}>{String(job.priority || 'standard').toUpperCase()}</Typography>
                                            <Typography variant="h6" fontWeight="950" color="#FFF">{String(job.category || 'Issue')}</Typography>
                                        </Box>
                                        {job.priority === 'emergency' && <Zap color="#ef4444" />}
                                    </Stack>
                                    <Typography variant="body2" color="rgba(255,255,255,0.5)" sx={{ mb: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {String(job.description || 'No description')}
                                    </Typography>
                                    <Button fullWidth variant="contained" onClick={() => handleAcceptJob(String(job.id))} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, py: 1.5, '&:hover': { bgcolor: '#b4954e' } }}>
                                        {t('dash.claim_job') || 'CLAIM MISSION'}
                                    </Button>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            )}
        </Box>
    );
}
