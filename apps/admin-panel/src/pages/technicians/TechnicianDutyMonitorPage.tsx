
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Container, Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Chip, IconButton, Stack, 
    alpha, CircularProgress, Tooltip
} from '@mui/material';
import { 
    Clock, MapPin, 
    ShieldAlert, RefreshCcw, UserCheck, ExternalLink
} from 'lucide-react';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { useLanguage } from '@bin/shared';

export default function TechnicianDutyMonitorPage() {
    const { t, isRTL } = useLanguage();
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Monitor all users with role 'technician'
        const q = query(collection(db, 'users'), where('role', '==', 'technician'));
        const unsubscribe = onSnapshot(q, (snap) => {
            setTechnicians(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ON_DUTY': return '#4ade80';
            case 'ON_JOB': return binThemeTokens.gold;
            case 'BREAK': return '#60a5fa';
            case 'OFF_DUTY': return 'rgba(255,255,255,0.2)';
            default: return 'rgba(255,255,255,0.2)';
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }}/></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h3" fontWeight="950" color="#FFF">{t('admin.duty_monitor.page_title')}</Typography>
                    <Typography variant="body1" color="rgba(255,255,255,0.5)">{t('admin.duty_monitor.page_subtitle')}</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Paper sx={{ p: 2, bgcolor: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 4 }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'block' }}>{t('admin.duty_monitor.online')}</Typography>
                        <Typography variant="h4" fontWeight="950" color="#FFF">{technicians.filter(t => t.onDuty).length}</Typography>
                    </Paper>
                    <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 950, display: 'block' }}>{t('admin.duty_monitor.on_job')}</Typography>
                        <Typography variant="h4" fontWeight="950" color="#FFF">{technicians.filter(t => t.dutyStatus === 'ON_JOB').length}</Typography>
                    </Paper>
                </Stack>
            </Stack>

            <TableContainer component={Paper} sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 950 }}>{t('admin.duty_monitor.col_technician')}</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 950 }}>{t('admin.duty_monitor.col_status')}</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 950 }}>{t('admin.duty_monitor.col_current_mission')}</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 950 }}>{t('admin.duty_monitor.col_last_seen')}</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 950 }}>{t('admin.duty_monitor.col_actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {technicians.map((tech) => (
                            <TableRow key={tech.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                <TableCell>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: alpha(getStatusColor(tech.dutyStatus), 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: getStatusColor(tech.dutyStatus) }}>
                                            <UserCheck size={20}/>
                                        </Box>
                                        <Box>
                                            <Typography variant="body1" fontWeight="950" color="#FFF">{tech.displayName || t('admin.duty_monitor.unnamed_tech')}</Typography>
                                            <Typography variant="caption" color="rgba(255,255,255,0.3)">{tech.email}</Typography>
                                        </Box>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={tech.dutyStatus || (tech.onDuty ? 'ON_DUTY' : 'OFF_DUTY')} 
                                        size="small"
                                        sx={{ 
                                            bgcolor: alpha(getStatusColor(tech.dutyStatus), 0.1), 
                                            color: getStatusColor(tech.dutyStatus),
                                            fontWeight: 950,
                                            border: `1px solid ${alpha(getStatusColor(tech.dutyStatus), 0.2)}`
                                        }} 
                                    />
                                </TableCell>
                                <TableCell>
                                    {tech.currentTicketId ? (
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography variant="body2" color={binThemeTokens.gold} fontWeight="950">#{tech.currentTicketId.substring(0,8)}</Typography>
                                            <Tooltip title={t('admin.duty_monitor.view_ticket')}>
                                                <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                                                    <ExternalLink size={14}/>
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    ) : (
                                        <Typography variant="body2" color="rgba(255,255,255,0.2)">{t('admin.duty_monitor.standby')}</Typography>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Stack spacing={0.5}>
                                        <Typography variant="body2" color="#FFF" sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Clock size={14} style={{ marginRight: 4, color: binThemeTokens.gold }}/>
                                            {tech.lastSeenAt?.toDate?.()?.toLocaleTimeString() || t('admin.duty_monitor.unknown')}
                                        </Typography>
                                        <Typography variant="caption" color="rgba(255,255,255,0.3)" sx={{ display: 'flex', alignItems: 'center' }}>
                                            <MapPin size={12} style={{ marginRight: 4 }}/>
                                            {tech.emirate || t('admin.duty_monitor.global_grid')}
                                        </Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={1}>
                                        <Tooltip title={t('admin.duty_monitor.emergency_alert')}>
                                            <IconButton size="small" sx={{ color: '#ff4444', bgcolor: 'rgba(255,68,68,0.05)' }}>
                                                <ShieldAlert size={18}/>
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('admin.duty_monitor.force_sync')}>
                                            <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                                <RefreshCcw size={18}/>
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Container>
    );
}
