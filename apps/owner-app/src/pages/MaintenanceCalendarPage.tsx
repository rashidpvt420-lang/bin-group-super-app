import React, { useState, useEffect, useMemo } from 'react';
import {
    Container, Typography, Box, Paper, Grid, Stack, Chip,
    alpha, CircularProgress, LinearProgress, Alert
} from '@mui/material';
import { Wrench, Wind, Waves, Flame } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';
import { db, collection, query, where, getDocs } from '../lib/firebase';

interface ScheduledTask {
    id: string;
    propertyId: string;
    propertyName: string;
    taskName: string;
    category: string;
    dueDate: Date;
    completedAt?: Date | null;
    status: string;
    frequency: string;
}

function toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
        const date = value.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'string') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
}

function normalizeStatus(value: unknown) {
    return String(value || 'SCHEDULED').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function normalizeTicket(docSnap: any): ScheduledTask | null {
    const data = docSnap.data() || {};
    const dueDate = toDate(
        data.scheduledFor ?? data.scheduledAt ?? data.dueDate ??
        data.nextServiceDate ?? data.appointmentDate ?? data.serviceDate
    );
    if (!dueDate) return null;

    return {
        id: docSnap.id,
        propertyId: String(data.propertyId || '').trim(),
        propertyName: String(data.propertyName || data.propertyAddress || data.address || 'Property not named').trim(),
        taskName: String(data.taskName || data.issueType || data.serviceType || data.title || data.category || 'Maintenance task').trim(),
        category: String(data.category || data.issueCategory || data.serviceType || 'MAINTENANCE').trim().toUpperCase(),
        dueDate,
        completedAt: toDate(data.completedAt || data.resolvedAt || data.closedAt),
        status: normalizeStatus(data.status),
        frequency: String(data.frequency || data.recurrence || data.scheduleFrequency || 'ONCE').trim().toUpperCase(),
    };
}

function uniqueTasks(tasks: ScheduledTask[]) {
    const byId = new Map<string, ScheduledTask>();
    tasks.forEach((task) => byId.set(task.id, task));
    return Array.from(byId.values());
}

const MaintenanceCalendarPage: React.FC = () => {
    const { isRTL } = useLanguage();
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const fetchSchedule = async () => {
            const uid = String(user?.uid || '').trim();
            const email = String(user?.email || '').trim().toLowerCase();
            if (!uid && !email) {
                if (active) setLoading(false);
                return;
            }

            setLoading(true);
            setLoadError(null);

            const lookups: Array<[string, string]> = [];
            if (uid) lookups.push(['ownerUid', uid], ['ownerId', uid], ['createdBy', uid]);
            if (email) lookups.push(['ownerEmail', email]);

            const results = await Promise.allSettled(
                lookups.map(([field, value]) => getDocs(query(collection(db, 'maintenanceTickets'), where(field, '==', value))))
            );

            const docs: any[] = [];
            let successfulReads = 0;
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    successfulReads += 1;
                    docs.push(...result.value.docs);
                }
            }

            if (!active) return;
            if (successfulReads === 0 && results.length > 0) {
                setLoadError('Live maintenance schedule could not be loaded. Please retry after your connection or access is restored.');
                setTasks([]);
            } else {
                setTasks(uniqueTasks(docs.map(normalizeTicket).filter(Boolean) as ScheduledTask[]));
            }
            setLoading(false);
        };

        fetchSchedule().catch((error) => {
            console.error('[MaintenanceCalendar] Live schedule load failed:', error);
            if (active) {
                setTasks([]);
                setLoadError('Live maintenance schedule could not be loaded.');
                setLoading(false);
            }
        });

        return () => { active = false; };
    }, [user?.uid, user?.email]);

    const sortedTasks = useMemo(
        () => [...tasks].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()),
        [tasks]
    );

    const completionMetric = useMemo(() => {
        const completed = tasks.filter((task) => ['COMPLETED', 'RESOLVED', 'CLOSED'].includes(task.status) && task.completedAt);
        if (completed.length === 0) return null;
        const onTime = completed.filter((task) => (task.completedAt as Date).getTime() <= task.dueDate.getTime()).length;
        return Math.round((onTime / completed.length) * 100);
    }, [tasks]);

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
            case 'COMPLETED':
            case 'RESOLVED':
            case 'CLOSED': return '#4ADE80';
            case 'OVERDUE': return '#EF4444';
            case 'IN_PROGRESS':
            case 'ACCEPTED': return binThemeTokens.gold;
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
                    Live scheduled maintenance and service history from your property records.
                </Typography>
            </Box>

            {loadError && <Alert severity="error" sx={{ mb: 4 }}>{loadError}</Alert>}

            <Grid container spacing={4}>
                <Grid item xs={12} md={8}>
                    <Stack spacing={3}>
                        {sortedTasks.length === 0 && !loadError && (
                            <Paper sx={{ p: 5, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="h6" fontWeight={900} color="#FFF">No scheduled maintenance yet</Typography>
                                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                                    This page will populate automatically when a real maintenance ticket receives a service date.
                                </Typography>
                            </Paper>
                        )}

                        {sortedTasks.map((task) => (
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
                                            <Typography variant="h4" fontWeight="950" color="#FFF">{task.dueDate.getDate()}</Typography>
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
                                                fontWeight: 900
                                            }}
                                        />
                                    </Grid>
                                </Grid>
                            </Paper>
                        ))}
                    </Stack>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>
                            COMPLIANCE METRICS
                        </Typography>
                        <Box sx={{ mt: 4 }}>
                            <Typography variant="h3" fontWeight="950" color="#FFF">
                                {completionMetric === null ? 'N/A' : `${completionMetric}%`}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">On-Time Completion Rate</Typography>
                            {completionMetric !== null && (
                                <LinearProgress variant="determinate" value={completionMetric} sx={{ mt: 2, height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: '#4ADE80' } }} />
                            )}
                            {completionMetric === null && (
                                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 2 }}>
                                    Calculated only after completed tasks have real due and completion timestamps.
                                </Typography>
                            )}
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
};

export default MaintenanceCalendarPage;
