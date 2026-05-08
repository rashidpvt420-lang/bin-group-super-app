import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Stack, Chip, 
    CircularProgress, Grid, alpha, Divider,
    Avatar, Tooltip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
    CheckCircle2, AlertTriangle, Clock, 
    TrendingUp, Star, ShieldCheck, History,
    Calendar, MapPin, ChevronRight
} from 'lucide-react';
import { 
    db, collection, query, where, getDocs, 
    orderBy, limit, onSnapshot 
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TechnicianHistoryPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        total: 0,
        success: 0,
        avgRating: 4.9,
        slaCompliance: 98
    });

    useEffect(() => {
        if (!user?.uid) return;

        const q = query(
            collection(db, 'maintenanceTickets'),
            where('assignedTechnicianId', '==', user.uid),
            where('status', 'in', ['completed', 'CLOSED', 'disputed']),
            orderBy('updatedAt', 'desc'),
            limit(50)
        );

        const unsub = onSnapshot(q, (snap) => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setHistory(docs);
            
            const closed = docs.filter(d => d.status === 'CLOSED').length;
            setStats(prev => ({
                ...prev,
                total: docs.length,
                success: docs.length > 0 ? Math.round((closed / docs.length) * 100) : 100
            }));
            
            setLoading(false);
        });

        return () => unsub();
    }, [user]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>MISSION ARCHIVE</Typography>
                <Typography variant="h4" fontWeight="950" color="#FFF">Work History & KPIs</Typography>
            </Box>

            {/* KPI Performance Section */}
            <Paper sx={{ p: 4, mb: 8, bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                <Grid container spacing={4} alignItems="center">
                    <Grid item xs={12} md={3}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 4, color: binThemeTokens.gold }}>
                                <TrendingUp size={32} />
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>MISSION SUCCESS</Typography>
                                <Typography variant="h5" fontWeight="950" color="#FFF">{stats.success}%</Typography>
                            </Box>
                        </Stack>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{ p: 2, bgcolor: alpha('#4ade80', 0.1), borderRadius: 4, color: '#4ade80' }}>
                                <ShieldCheck size={32} />
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>SLA COMPLIANCE</Typography>
                                <Typography variant="h5" fontWeight="950" color="#FFF">{stats.slaCompliance}%</Typography>
                            </Box>
                        </Stack>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 4, color: binThemeTokens.gold }}>
                                <Star size={32} fill={binThemeTokens.gold} />
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>QUALITY SCORE</Typography>
                                <Typography variant="h5" fontWeight="950" color="#FFF">{stats.avgRating}/5</Typography>
                            </Box>
                        </Stack>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{ p: 2, bgcolor: alpha('#FFF', 0.05), borderRadius: 4, color: '#FFF' }}>
                                <History size={32} />
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>TOTAL MISSIONS</Typography>
                                <Typography variant="h5" fontWeight="950" color="#FFF">{stats.total}</Typography>
                            </Box>
                        </Stack>
                    </Grid>
                </Grid>
            </Paper>

            <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Calendar size={20} color={binThemeTokens.gold} /> MISSION LOG
            </Typography>

            {history.length === 0 ? (
                <Paper sx={{ p: 8, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.05)' }}>
                    <Typography color="textSecondary" variant="h6" fontWeight="900">NO COMPLETED MISSIONS ARCHIVED</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.2)', mt: 1 }}>Missions will appear here once they are completed or closed.</Typography>
                </Paper>
            ) : (
                <Stack spacing={3}>
                    {history.map(job => (
                        <Paper 
                            key={job.id} 
                            onClick={() => navigate(`/technician/job/${job.id}`)} 
                            sx={{ 
                                p: 4, cursor: 'pointer', 
                                bgcolor: 'rgba(22, 22, 24, 0.7)', 
                                borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', 
                                transition: 'all 0.2s',
                                '&:hover': { transform: 'translateX(8px)', borderColor: binThemeTokens.gold } 
                            }}
                        >
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={3}>
                                <Box sx={{ flex: 1 }}>
                                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>REF #{job.id.substring(0,8)}</Typography>
                                        <Chip 
                                            size="small"
                                            label={job.status?.toUpperCase().replace('_', ' ')} 
                                            sx={{ 
                                                bgcolor: job.status === 'CLOSED' ? alpha('#4ade80', 0.1) : alpha(binThemeTokens.gold, 0.1),
                                                color: job.status === 'CLOSED' ? '#4ade80' : binThemeTokens.gold,
                                                fontWeight: 950,
                                                fontSize: '0.65rem'
                                            }} 
                                        />
                                    </Stack>
                                    <Typography variant="h6" fontWeight="950" color="#FFF">{job.category || 'Maintenance'}</Typography>
                                    <Typography variant="body2" color="textSecondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                                        <MapPin size={14} /> {job.propertyName} · Unit {job.unitNumber}
                                    </Typography>
                                </Box>

                                <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' }, borderColor: 'rgba(255,255,255,0.05)' }} />

                                <Box sx={{ width: { xs: '100%', sm: '200px' } }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, mb: 1, display: 'block' }}>COMPLETION DATE</Typography>
                                    <Typography variant="body1" fontWeight="950" color="#FFF">
                                        {job.completedAt?.toDate ? job.completedAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                                    </Typography>
                                </Box>

                                <ChevronRight color="rgba(255,255,255,0.1)" />
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Box>
    );
}
