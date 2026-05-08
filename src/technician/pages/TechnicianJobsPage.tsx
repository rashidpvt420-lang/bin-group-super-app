import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Stack, Chip, CircularProgress, Button, Grid } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, Navigation, ArrowRight } from 'lucide-react';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TechnicianJobsPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const [assignedJobs, setAssignedJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.uid) return;
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('assignedTechnicianId', '==', user.uid),
            where('status', 'in', ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'WAITING_PARTS'])
        );
        const unsub = onSnapshot(q, (snap) => {
            setAssignedJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, [user]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 4 }}>Assigned Jobs</Typography>
            
            {assignedJobs.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <Typography color="textSecondary" fontWeight="900">NO ACTIVE ASSIGNMENTS</Typography>
                </Paper>
            ) : (
                <Stack spacing={3}>
                    {assignedJobs.map(job => (
                        <Paper key={job.id} sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)', borderColor: binThemeTokens.gold } }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                                <Box>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 1 }}>REF #{job.id.substring(0,8)}</Typography>
                                    <Typography variant="h6" fontWeight="950" color="#FFF">{job.category || 'Maintenance'}</Typography>
                                </Box>
                                <Chip 
                                    label={job.priority === 'emergency' ? 'EMERGENCY' : job.status?.replace('_', ' ')} 
                                    color={job.priority === 'emergency' ? 'error' : 'default'}
                                    sx={{ bgcolor: job.priority !== 'emergency' ? 'rgba(255,255,255,0.1)' : undefined, color: job.priority !== 'emergency' ? '#FFF' : undefined, fontWeight: 900 }} 
                                />
                            </Stack>

                            <Grid container spacing={3} sx={{ mb: 4 }}>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="caption" color="textSecondary">LOCATION</Typography>
                                    <Typography variant="body1" fontWeight="900" color="#FFF">{job.propertyName || 'Property'}</Typography>
                                    <Typography variant="body2" color="textSecondary">Unit: {job.unitNumber} | Floor: {job.floor}</Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="caption" color="textSecondary">TENANT</Typography>
                                    <Typography variant="body1" fontWeight="900" color="#FFF">{job.tenantName}</Typography>
                                    <Typography variant="body2" color="textSecondary">{job.tenantPhone}</Typography>
                                </Grid>
                            </Grid>

                            <Stack direction="row" spacing={2}>
                                <Button 
                                    fullWidth variant="contained" 
                                    onClick={() => navigate(`/technician/job/${job.id}`)}
                                    endIcon={<ArrowRight size={18} />}
                                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 3, '&:hover': { bgcolor: '#b4954e' } }}
                                >
                                    OPEN JOB CARD
                                </Button>
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Box>
    );
}
