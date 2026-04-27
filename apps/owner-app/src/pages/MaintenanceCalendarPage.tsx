import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, Paper, Grid, Stack, Chip, 
    Divider, alpha, Button, CircularProgress, LinearProgress 
} from '@mui/material';
import { Calendar, Clock, CheckCircle2, AlertCircle, ShieldCheck, Wrench, Wind, Waves, Flame } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';
import { db, collection, query, where, getDocs, orderBy } from '../lib/firebase';

interface ScheduledTask {
    id: string;
    propertyId: string;
    propertyName: string;
    taskName: string;
    category: 'HVAC' | 'LIFT' | 'FIRE' | 'POOL' | 'ELECTRICAL' | 'PLUMBING';
    dueDate: Date;
    status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
    frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'BI-ANNUAL' | 'ANNUAL';
}

const MaintenanceCalendarPage: React.FC = () => {
    const { t, tx, isRTL } = useLanguage();
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);

    useEffect(() => {
        const fetchSchedule = async () => {
            if (!user?.uid) return;
            // For production, this would fetch from a 'maintenance_schedule' collection.
            // Mocking data for the upgrade phase as requested.
            setTimeout(() => {
                const mockTasks: ScheduledTask[] = [
                    { id: '1', propertyId: 'p1', propertyName: 'Skyline Tower', taskName: 'Quarterly HVAC Sanitization', category: 'HVAC', dueDate: new Date(Date.now() + 86400000 * 5), status: 'SCHEDULED', frequency: 'QUARTERLY' },
                    { id: '2', propertyId: 'p1', propertyName: 'Skyline Tower', taskName: 'Monthly Lift Load Test', category: 'LIFT', dueDate: new Date(Date.now() + 86400000 * 2), status: 'SCHEDULED', frequency: 'MONTHLY' },
                    { id: '3', propertyId: 'p2', propertyName: 'Palm Villa 44', taskName: 'Weekly Pool Chemistry Balance', category: 'POOL', dueDate: new Date(Date.now() - 86400000 * 1), status: 'OVERDUE', frequency: 'WEEKLY' },
                    { id: '4', propertyId: 'p2', propertyName: 'Palm Villa 44', taskName: 'Bi-Annual Fire Alarm Audit', category: 'FIRE', dueDate: new Date(Date.now() + 86400000 * 15), status: 'SCHEDULED', frequency: 'BI-ANNUAL' },
                ];
                setTasks(mockTasks);
                setLoading(false);
            }, 1000);
        };
        fetchSchedule();
    }, [user]);

    const getCategoryIcon = (cat: string) => {
        switch (cat) {
            case 'HVAC': return <Wind size={20} />;
            case 'POOL': return <Waves size={20} />;
            case 'FIRE': return <Flame size={20} />;
            default: return <Wrench size={20} />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'COMPLETED': return '#4ADE80';
            case 'OVERDUE': return '#EF4444';
            case 'IN_PROGRESS': return binThemeTokens.gold;
            default: return 'rgba(255,255,255,0.4)';
        }
    };

    if (loading) return (
        <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
        </Box>
    );

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 8, textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="h3" fontWeight="950" sx={{ color: binThemeTokens.gold, letterSpacing: -1 }}>
                    PREVENTIVE MAINTENANCE CALENDAR
                </Typography>
                <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 500 }}>
                    Systemic asset protection and recurring restoration protocols.
                </Typography>
            </Box>

            <Grid container spacing={4}>
                {/* Calendar View (Simplified for V2) */}
                <Grid item xs={12} md={8}>
                    <Stack spacing={3}>
                        {tasks.sort((a,b) => a.dueDate.getTime() - b.dueDate.getTime()).map((task) => (
                            <Paper key={task.id} sx={{ 
                                p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', 
                                borderLeft: `4px solid ${getStatusColor(task.status)}`,
                                borderTop: '1px solid rgba(255,255,255,0.05)',
                                borderRight: '1px solid rgba(255,255,255,0.05)',
                                borderBottom: '1px solid rgba(255,255,255,0.05)'
                            }}>
                                <Grid container spacing={3} alignItems="center">
                                    <Grid item xs={12} sm={2}>
                                        <Box sx={{ textAlign: 'center' }}>
                                            <Typography variant="h4" fontWeight="950" color="#FFF">
                                                {task.dueDate.getDate()}
                                            </Typography>
                                            <Typography variant="overline" color="textSecondary" fontWeight="900">
                                                {task.dueDate.toLocaleString('default', { month: 'short' }).toUpperCase()}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={7}>
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                            <Box sx={{ color: binThemeTokens.gold }}>{getCategoryIcon(task.category)}</Box>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>
                                                {task.category} · {task.frequency}
                                            </Typography>
                                        </Stack>
                                        <Typography variant="h6" fontWeight="900" color="#FFF">{task.taskName}</Typography>
                                        <Typography variant="body2" color="textSecondary">{task.propertyName}</Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={3} sx={{ textAlign: 'right' }}>
                                        <Chip 
                                            label={task.status} 
                                            size="small" 
                                            sx={{ 
                                                bgcolor: alpha(getStatusColor(task.status), 0.1), 
                                                color: getStatusColor(task.status),
                                                fontWeight: 900,
                                                mb: 2
                                            }} 
                                        />
                                        <Button variant="outlined" size="small" fullWidth sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900 }}>
                                            VIEW LOGS
                                        </Button>
                                    </Grid>
                                </Grid>
                            </Paper>
                        ))}
                    </Stack>
                </Grid>

                {/* Sidebar Stats */}
                <Grid item xs={12} md={4}>
                    <Stack spacing={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>
                                COMPLIANCE METRICS
                            </Typography>
                            <Box sx={{ mt: 4 }}>
                                <Typography variant="h3" fontWeight="950" color="#FFF">92%</Typography>
                                <Typography variant="body2" color="textSecondary">On-Time Completion Rate</Typography>
                                <LinearProgress variant="determinate" value={92} sx={{ mt: 2, height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: '#4ADE80' } }} />
                            </Box>
                        </Paper>

                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mb: 3 }}>SOVEREIGN GUARANTEE</Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ mb: 4, lineHeight: 1.6 }}>
                                All scheduled tasks are performed by BIN GROUP certified specialists using the Evidence-Vault™ protocol for 100% auditable proof of service.
                            </Typography>
                            <Button variant="contained" fullWidth sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                REQUEST EXTRA AUDIT
                            </Button>
                        </Paper>
                    </Stack>
                </Grid>
            </Grid>
        </Container>
    );
};

export default MaintenanceCalendarPage;
