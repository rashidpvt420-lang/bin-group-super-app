import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Container, Grid, Paper, Stack, Button, IconButton, 
    Chip, alpha, Badge, Card, CardContent, CircularProgress
} from '@mui/material';
import { 
    Navigation, Clock, MapPin, 
    Bell, Power, Coffee, Play, LogOut, Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Production Imports
import { db, collection, query, where, onSnapshot, functions, httpsCallable } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { useRole } from '../context/RoleContext';

/**
 * TechnicianPortalPage
 * The command center for field operations.
 * Handles duty state, mission acceptance, and real-time dispatch tracking.
 */
export default function TechnicianPortalPage() {
    const { t, isRTL } = useLanguage();
    const { user } = useRole();
    const navigate = useNavigate();
    const [activeMissions, setActiveMissions] = useState<any[]>([]);
    const [missionPool, setMissionPool] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [notifications] = useState<any[]>([{ id: 'notif-1' }, { id: 'notif-2' }]);
    const [stats] = useState({ mttr: '142m', sla: '98%', uptime: '99.9%' });

    // Bypass strict SovereignUser typing for technician-specific fields
    const techUser = user as any;

    // Duty State from User Context
    const isOnDuty = techUser?.onDuty === true;
    const dutyStatus = techUser?.dutyStatus || 'OFF'; // 'WORKING', 'BREAK', 'OFF'

    useEffect(() => {
        if (!user?.uid) return;

        // Active Assignments: Mission cards for the technician
        const qActive = query(
            collection(db, 'maintenanceTickets'),
            where('assignedTechnicianId', '==', user.uid),
            where('status', 'in', ['assigned', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'])
        );

        // Mission Pool: Unassigned tickets in the technician's emirate
        const qPool = query(
            collection(db, 'maintenanceTickets'),
            where('status', 'in', ['OPEN', 'pending_assignment']),
            where('emirate', '==', techUser?.emirate || 'Dubai')
        );

        const unsubActive = onSnapshot(qActive, (snap: any) => {
            setActiveMissions(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        const unsubPool = onSnapshot(qPool, (snap: any) => {
            const poolData = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
            setMissionPool(poolData);
        });

        return () => {
            unsubActive();
            unsubPool();
        };
    }, [user?.uid, techUser?.emirate]);

    const handleDutyAction = async (action: 'START' | 'END' | 'BREAK' | 'RESUME') => {
        setUpdating(true);
        try {
            let callable;
            if (action === 'START') callable = httpsCallable(functions, 'startTechnicianDuty');
            else if (action === 'END') callable = httpsCallable(functions, 'endTechnicianDuty');
            // BREAK and RESUME can be added as separate functions if needed, 
            // for now we'll map them to start/end or keep as placeholders
            else if (action === 'BREAK') callable = httpsCallable(functions, 'pauseTechnicianWork'); 
            
            if (callable) await callable();
        } catch (err: any) {
            console.error("Duty Action Failed:", err);
            alert(err.message || "Duty transition failed.");
        }
        setUpdating(false);
    };

    const handleAcceptJob = async (ticketId: string) => {
        setUpdating(true);
        try {
            const acceptJob = httpsCallable(functions, 'acceptTechnicianJob');
            await acceptJob({ ticketId });
        } catch (err: any) {
            console.error("Accept Job Failed:", err);
            alert(err.message || "Failed to accept mission.");
        }
        setUpdating(false);
    };

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#000' }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }}/>
        </Box>
    );

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000', pb: 10 }}>
            {/* Header / Duty Command */}
            <Box sx={{ 
                pt: 4, pb: 6, px: 2, 
                background: 'linear-gradient(180deg, rgba(212,175,55,0.1) 0%, rgba(0,0,0,0) 100%)',
                borderBottom: '1px solid rgba(212,175,55,0.1)'
            }}>
                <Container maxWidth="md">
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>{t('tech.service_node')}</Typography>
                            <Typography variant="h4" sx={{ fontWeight: 950, color: '#FFF' }}>{user?.displayName || 'OPERATOR'}</Typography>
                        </Box>
                        <Badge badgeContent={notifications.length} color="error" overlap="circular">
                            <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold }}>
                                <Bell size={24}/>
                            </IconButton>
                        </Badge>
                    </Stack>

                    {/* Duty Matrix */}
                    <Paper sx={{ 
                        p: 3, borderRadius: 6, 
                        bgcolor: 'rgba(22, 22, 24, 0.8)', 
                        border: `1px solid ${isOnDuty ? alpha(binThemeTokens.gold, 0.3) : 'rgba(255,255,255,0.05)'}`,
                        backdropFilter: 'blur(10px)'
                    }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={6}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box sx={{ 
                                        width: 64, height: 64, borderRadius: 4, 
                                        bgcolor: isOnDuty ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.05)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: isOnDuty ? binThemeTokens.gold : 'rgba(255,255,255,0.3)',
                                        border: `1px solid ${isOnDuty ? binThemeTokens.gold : 'transparent'}`
                                    }}>
                                        {dutyStatus === 'BREAK' ? <Coffee size={32}/> : <Power size={32}/>}
                                    </Box>
                                    <Box>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>{t('tech.status_tracking')}</Typography>
                                        <Typography variant="h5" sx={{ fontWeight: 950, color: isOnDuty ? '#FFF' : 'rgba(255,255,255,0.3)' }}>
                                            {isOnDuty ? t(`tech.status.${dutyStatus.toLowerCase()}`) : t('tech.status.off')}
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Stack direction="row" spacing={1} justifyContent={isRTL ? 'flex-start' : 'flex-end'}>
                                    {!isOnDuty ? (
                                        <Button 
                                            variant="contained" startIcon={<Play size={18}/>}
                                            onClick={() => handleDutyAction('START')}
                                            disabled={updating}
                                            sx={{ 
                                                bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3,
                                                '&:hover': { bgcolor: '#FFF' }
                                            }}
                                        >
                                            {t('tech.action.start_duty')}
                                        </Button>
                                    ) : (
                                        <>
                                            {dutyStatus === 'WORKING' ? (
                                                <Button 
                                                    variant="outlined" startIcon={<Coffee size={18}/>}
                                                    onClick={() => handleDutyAction('BREAK')}
                                                    disabled={updating}
                                                    sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3 }}
                                                >
                                                    {t('tech.action.take_break')}
                                                </Button>
                                            ) : (
                                                <Button 
                                                    variant="contained" startIcon={<Play size={18}/>}
                                                    onClick={() => handleDutyAction('RESUME')}
                                                    disabled={updating}
                                                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3 }}
                                                >
                                                    {t('tech.action.resume_duty')}
                                                </Button>
                                            )}
                                            <Button 
                                                variant="outlined" color="error" startIcon={<LogOut size={18}/>}
                                                onClick={() => handleDutyAction('END')}
                                                disabled={updating}
                                                sx={{ fontWeight: 950, borderRadius: 3 }}
                                            >
                                                {t('tech.action.end_duty')}
                                            </Button>
                                        </>
                                    )}
                                </Stack>
                            </Grid>
                        </Grid>
                    </Paper>
                </Container>
            </Box>

            <Container maxWidth="md" sx={{ mt: -3 }}>
                {/* Active Assignments */}
                <Box sx={{ mb: 4 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, px: 1 }}>
                        <Zap size={18} color={binThemeTokens.gold}/>
                        <Typography variant="h6" sx={{ fontWeight: 950, color: '#FFF' }}>{t('tech.live_ops')}</Typography>
                        <Chip label={activeMissions.length} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
                    </Stack>

                    {activeMissions.length === 0 ? (
                        <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <Typography color="rgba(255,255,255,0.3)" fontWeight="900">{t('tech.empty')}</Typography>
                        </Paper>
                    ) : (
                        <Stack spacing={2}>
                            {activeMissions.map((mission) => (
                                <MissionCard key={mission.id} mission={mission} onAction={() => navigate(`/technician/ticket/${mission.id}`)} />
                            ))}
                        </Stack>
                    )}
                </Box>

                {/* Mission Pool */}
                <Box>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, px: 1 }}>
                        <MapPin size={18} color="rgba(255,255,255,0.5)"/>
                        <Typography variant="h6" sx={{ fontWeight: 950, color: 'rgba(255,255,255,0.5)' }}>{t('tech.mission_pool')}</Typography>
                    </Stack>

                    <Stack spacing={2}>
                        {missionPool.filter(m => !activeMissions.find(am => am.id === m.id)).map((mission) => (
                            <PoolCard key={mission.id} mission={mission} onAccept={() => handleAcceptJob(mission.id)} disabled={!isOnDuty || updating} />
                        ))}
                    </Stack>
                </Box>
            </Container>

            {/* Bottom Nav / Stats */}
            <Paper sx={{ 
                position: 'fixed', bottom: 0, left: 0, right: 0, 
                bgcolor: 'rgba(10, 10, 12, 0.95)', backdropFilter: 'blur(20px)',
                borderTop: '1px solid rgba(255,255,255,0.05)', p: 2, zIndex: 1000
            }}>
                <Container maxWidth="md">
                    <Grid container spacing={2}>
                        <Grid item xs={4}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, display: 'block' }}>MTTR</Typography>
                                <Typography variant="body1" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{stats.mttr}</Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={4}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, display: 'block' }}>SLA</Typography>
                                <Typography variant="body1" sx={{ color: '#4ade80', fontWeight: 950 }}>{stats.sla}</Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={4}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, display: 'block' }}>UPTIME</Typography>
                                <Typography variant="body1" sx={{ color: '#60a5fa', fontWeight: 950 }}>{stats.uptime}</Typography>
                            </Box>
                        </Grid>
                    </Grid>
                </Container>
            </Paper>
        </Box>
    );
}

function MissionCard({ mission, onAction }: { mission: any, onAction: () => void }) {
    const { t } = useLanguage();
    return (
        <Card sx={{ 
            bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, 
            border: '1px solid rgba(255,255,255,0.05)',
            transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)', bgcolor: 'rgba(255,255,255,0.02)' }
        }}>
            <CardContent sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>#{mission.id.substring(0,8)}</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 950, color: '#FFF' }}>{mission.complaintCategory || 'MAINTENANCE'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>{mission.propertyName} | {mission.unitNumber}</Typography>
                    </Box>
                    <Chip 
                        label={t(`status.${mission.status?.toLowerCase() || 'unknown'}`)} 
                        size="small"
                        sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} 
                    />
                </Stack>
                
                <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
                    <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, display: 'flex', alignItems: 'center' }}>
                        <Clock size={14} style={{ marginRight: 4 }}/>
                        <Typography variant="caption" fontWeight="950" color="#FFF">12:45 PM</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, display: 'flex', alignItems: 'center' }}>
                        <Navigation size={14} style={{ marginRight: 4 }}/>
                        <Typography variant="caption" fontWeight="950" color="#FFF">4.2 KM</Typography>
                    </Box>
                </Stack>

                <Button 
                    fullWidth variant="contained" 
                    onClick={onAction}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 3 }}
                >
                    {t('tech.open_node')}
                </Button>
            </CardContent>
        </Card>
    );
}

function PoolCard({ mission, onAccept, disabled }: { mission: any, onAccept: () => void, disabled: boolean }) {
    const { t } = useLanguage();
    return (
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
            <Box sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 950 }}>{mission.area || 'ZONE GRID'}</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 950, color: '#FFF' }}>{mission.complaintCategory || 'General Service'}</Typography>
                    </Box>
                    <Button 
                        size="small" variant="outlined" 
                        onClick={onAccept}
                        disabled={disabled}
                        sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, borderRadius: 2 }}
                    >
                        {t('tech.action.accept_job')}
                    </Button>
                </Stack>
            </Box>
        </Card>
    );
}
