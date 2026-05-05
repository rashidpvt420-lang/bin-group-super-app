import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Chip, IconButton, Stack, 
    alpha, CircularProgress, Tooltip, Button, Grid, Avatar,
    Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem, InputLabel, FormControl
} from '@mui/material';
import { 
    Activity, Clock, MapPin, Power, Play, 
    ShieldAlert, RefreshCcw, UserCheck, ExternalLink,
    AlertTriangle, CheckCircle2, ChevronRight, UserPlus,
    Briefcase, Zap
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { 
    collection, onSnapshot, query, where, doc, 
    updateDoc, serverTimestamp, orderBy, getDocs 
} from 'firebase/firestore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import AdminCrudActions from '../../components/AdminCrudActions';

export default function TechnicianDutyMonitorPage() {
    const { t } = useLanguage();
    const [techs, setTechs] = useState<any[]>([]);
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [openAssign, setOpenAssign] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<any>(null);
    const [assignTechId, setAssignTechId] = useState('');

    useEffect(() => {
        const qTechs = query(collection(db, 'users'), where('role', '==', 'technician'));
        const unsubTechs = onSnapshot(qTechs, (snap) => {
            setTechs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const qTickets = query(collection(db, 'maintenanceTickets'), where('status', 'in', ['OPEN', 'ASSIGNED', 'IN_PROGRESS']));
        const unsubTickets = onSnapshot(qTickets, (snap) => {
            setTickets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        return () => {
            unsubTechs();
            unsubTickets();
        };
    }, []);

    const handleAssign = async () => {
        if (!selectedTicket || !assignTechId) return;
        try {
            await updateDoc(doc(db, 'maintenanceTickets', selectedTicket.id), {
                status: 'ASSIGNED',
                technicianId: assignTechId,
                assignedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            await updateDoc(doc(db, 'users', assignTechId), {
                dutyStatus: 'ON_JOB',
                currentTicketId: selectedTicket.id,
                activeJobs: (techs.find(t => t.id === assignTechId)?.activeJobs || 0) + 1
            });
            setOpenAssign(false);
            setSelectedTicket(null);
            setAssignTechId('');
        } catch (err) {
            console.error(err);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ON_DUTY': return '#4ade80';
            case 'ON_JOB': return binThemeTokens.gold;
            case 'BREAK': return '#60a5fa';
            case 'OFF_DUTY': return 'rgba(255,255,255,0.2)';
            case 'OPEN': return '#EF4444';
            case 'ASSIGNED': return binThemeTokens.gold;
            case 'IN_PROGRESS': return '#10b981';
            default: return 'rgba(255,255,255,0.2)';
        }
    };

    return (
        <AdminPageFrame
            title="Duty Command Center"
            subtitle="Mission-critical dispatch terminal and real-time field force synchronization"
            loading={loading}
            breadcrumbs={[{ label: 'Operations' }, { label: 'Duty Command' }]}
            actions={
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<RefreshCcw size={18} />} onClick={() => window.location.reload()} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900 }}>FORCE SYNC</Button>
                    <Button variant="contained" startIcon={<Play size={18} />} sx={{ bgcolor: '#EF4444', color: '#FFF', fontWeight: 950 }}>SOS MISSION</Button>
                </Stack>
            }
        >
            <Grid container spacing={4}>
                {/* LIVE METRICS */}
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>ACTIVE FLEET</Typography>
                        <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', my: 1 }}>{techs.filter(t => t.onDuty).length}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>UNITS READY FOR DISPATCH</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: '#EF4444', fontWeight: 950 }}>UNASSIGNED JOBS</Typography>
                        <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', my: 1 }}>{tickets.filter(t => t.status === 'OPEN').length}</Typography>
                        <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 800 }}>CRITICAL SLA DELTA</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: '#10b981', fontWeight: 950 }}>ACTIVE MISSIONS</Typography>
                        <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', my: 1 }}>{tickets.filter(t => t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED').length}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>IN-FIELD PROCESSING</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: '#6366f1', fontWeight: 950 }}>SLA COMPLIANCE</Typography>
                        <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', my: 1 }}>98.4%</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>INSTITUTIONAL TARGET</Typography>
                    </Paper>
                </Grid>

                {/* MISSION CONTROL TABLE */}
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6" fontWeight="950" color="#FFF">ACTIVE MISSIONS & TICKETS</Typography>
                            <Chip label={`${tickets.length} QUEUED`} size="small" sx={{ fontWeight: 950, bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold }} />
                        </Box>
                        <TableContainer sx={{ maxHeight: 500 }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>MISSION / ID</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>LOCATION</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ASSIGNED UNIT</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>STATUS</TableCell>
                                        <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTIONS</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {tickets.map((ticket) => (
                                        <TableRow key={ticket.id} hover>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="900" color="#FFF">{ticket.title || 'MAINTENANCE REQ'}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>#{String(ticket.id || '').slice(0, 12).toUpperCase()}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <MapPin size={12} color={binThemeTokens.gold} />
                                                    <Typography variant="caption" fontWeight="800" color="rgba(255,255,255,0.6)">{ticket.propertyName || 'Property Node'}</Typography>
                                                </Box>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>UNIT {ticket.unitNumber || 'N/A'}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                {ticket.technicianId ? (
                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                        <Avatar sx={{ width: 24, height: 24, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontSize: '0.6rem', fontWeight: 950 }}>
                                                            {techs.find(t => t.id === ticket.technicianId)?.displayName?.charAt(0) || 'T'}
                                                        </Avatar>
                                                        <Typography variant="caption" fontWeight="900" color="#FFF">
                                                            {techs.find(t => t.id === ticket.technicianId)?.displayName || 'Assigned'}
                                                        </Typography>
                                                    </Stack>
                                                ) : (
                                                    <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 950 }}>UNASSIGNED</Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={String(ticket.status || 'OPEN').toUpperCase()} 
                                                    size="small" 
                                                    sx={{ 
                                                        bgcolor: alpha(getStatusColor(ticket.status), 0.1), 
                                                        color: getStatusColor(ticket.status),
                                                        fontWeight: 950, fontSize: '0.6rem'
                                                    }} 
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                    <Button 
                                                        size="small" 
                                                        variant="contained" 
                                                        onClick={() => { setSelectedTicket(ticket); setOpenAssign(true); }}
                                                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.6rem', height: 24 }}
                                                    >
                                                        {ticket.technicianId ? 'REASSIGN' : 'ASSIGN'}
                                                    </Button>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* TECHNICIAN STATUS PANEL */}
                <Grid item xs={12} lg={4}>
                    <Paper sx={{ borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', p: 3 }}>
                        <Typography variant="h6" fontWeight="950" sx={{ mb: 3 }}>FIELD FORCE STATUS</Typography>
                        <Stack spacing={2}>
                            {techs.filter(t => t.onDuty).map((tech) => (
                                <Box key={tech.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <Avatar sx={{ bgcolor: alpha(getStatusColor(tech.dutyStatus), 0.1), color: getStatusColor(tech.dutyStatus), fontWeight: 950 }}>
                                                {tech.displayName?.charAt(0)}
                                            </Avatar>
                                            <Box>
                                                <Typography variant="body2" fontWeight="950" color="#FFF">{tech.displayName}</Typography>
                                                <Typography variant="caption" color="textSecondary">{tech.specialization || 'Generalist'}</Typography>
                                            </Box>
                                        </Stack>
                                        <Chip 
                                            label={String(tech.dutyStatus || 'ON_DUTY').toUpperCase()} 
                                            size="small" 
                                            sx={{ bgcolor: alpha(getStatusColor(tech.dutyStatus || 'ON_DUTY'), 0.1), color: getStatusColor(tech.dutyStatus || 'ON_DUTY'), fontWeight: 950, fontSize: '0.6rem' }} 
                                        />
                                    </Stack>
                                </Box>
                            ))}
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>

            {/* ASSIGNMENT DIALOG */}
            <Dialog 
                open={openAssign} 
                onClose={() => setOpenAssign(false)}
                PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
            >
                <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>MISSION DISPATCH</DialogTitle>
                <DialogContent sx={{ py: 3, minWidth: 300 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', mb: 2, display: 'block' }}>
                        ASSIGNING: {selectedTicket?.title}
                    </Typography>
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Select Technician</InputLabel>
                        <Select 
                            value={assignTechId} 
                            onChange={(e) => setAssignTechId(e.target.value)}
                            sx={{ color: '#FFF' }}
                        >
                            {techs.filter(t => t.onDuty).map(t => (
                                <MenuItem key={t.id} value={t.id}>
                                    {t.displayName} ({t.activeJobs || 0} active)
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenAssign(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
                    <Button variant="contained" onClick={handleAssign} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>EXECUTE DISPATCH</Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}
