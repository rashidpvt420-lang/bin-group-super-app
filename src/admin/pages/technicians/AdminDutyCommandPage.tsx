import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Chip, IconButton, Stack, 
    alpha, CircularProgress, Tooltip, Button, Grid, Avatar,
    Dialog, DialogTitle, DialogContent, DialogActions, Select, 
    MenuItem, InputLabel, FormControl, TextField, Divider
} from '@mui/material';
import { 
    Activity, Clock, MapPin, Power, Play, 
    ShieldAlert, RefreshCcw, UserCheck, ExternalLink,
    AlertTriangle, CheckCircle2, ChevronRight, UserPlus,
    Briefcase, Zap, Shield, Search, Filter, MessageSquare,
    ArrowUpRight, AlertCircle, XCircle, CheckCircle, MoreHorizontal
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { 
    collection, onSnapshot, query, where, doc, 
    updateDoc, serverTimestamp, orderBy, getDocs, addDoc
} from 'firebase/firestore';
import { useLanguage } from '../../../context/LanguageContext';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import { notifyTechnicianAssigned } from '../../../services/notificationService';

export default function AdminDutyCommandPage() {
    const { t, lang } = useLanguage();
    const [techs, setTechs] = useState<any[]>([]);
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Dialog States
    const [openAssign, setOpenAssign] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<any>(null);
    const [assignTechId, setAssignTechId] = useState('');
    const [openDetail, setOpenDetail] = useState(false);

    useEffect(() => {
        // Real-time technicians
        const qTechs = query(collection(db, 'users'), where('role', '==', 'technician'));
        const unsubTechs = onSnapshot(qTechs, (snap) => {
            setTechs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Real-time maintenance tickets
        const qTickets = query(
            collection(db, 'maintenanceTickets'), 
            orderBy('createdAt', 'desc')
        );
        const unsubTickets = onSnapshot(qTickets, (snap) => {
            setTickets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        return () => {
            unsubTechs();
            unsubTickets();
        };
    }, []);

    // Derived Data
    const openTickets = useMemo(() => tickets.filter(t => t.status === 'OPEN' || t.status === 'accepted'), [tickets]);
    const unassignedTickets = useMemo(() => tickets.filter(t => !t.assignedTechnicianId && t.status !== 'CLOSED' && t.status !== 'completed'), [tickets]);
    const emergencyTickets = useMemo(() => tickets.filter(t => t.priority === 'EMERGENCY' && t.status !== 'CLOSED'), [tickets]);
    
    const availableTechs = useMemo(() => techs.filter(t => t.onDuty && (t.dutyStatus === 'ON_DUTY' || t.dutyStatus === 'WORKING')), [techs]);
    const busyTechs = useMemo(() => techs.filter(t => t.onDuty && (t.dutyStatus === 'ON_JOB' || t.dutyStatus === 'in_progress')), [techs]);

    const slaBreachRisk = useMemo(() => {
        const now = new Date();
        return tickets.filter(t => {
            if (t.status === 'CLOSED' || t.status === 'completed') return false;
            const created = t.createdAt?.toDate();
            if (!created) return false;
            const hoursElapsed = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
            return hoursElapsed > 4; // Risk if > 4 hours
        }).length;
    }, [tickets]);

    // Handlers
    const handleAssign = async () => {
        if (!selectedTicket || !assignTechId) return;
        try {
            const tech = techs.find(t => t.id === assignTechId);
            const ticketRef = doc(db, 'maintenanceTickets', selectedTicket.id);
            
            await updateDoc(ticketRef, {
                status: 'accepted',
                assignedTechnicianId: assignTechId,
                assignedTechnicianName: tech?.displayName || 'Technician',
                assignedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // Update Technician Record
            await updateDoc(doc(db, 'users', assignTechId), {
                dutyStatus: 'ON_JOB',
                currentTicketId: selectedTicket.id
            });

            // Audit Log
            await addDoc(collection(db, 'auditLogs'), {
                ticketId: selectedTicket.id,
                action: 'ASSIGNED',
                performedBy: 'ADMIN',
                technicianId: assignTechId,
                timestamp: serverTimestamp()
            });

            notifyTechnicianAssigned(
                selectedTicket.id,
                assignTechId,
                selectedTicket.propertyName || 'Property',
                selectedTicket.category || 'Maintenance'
            ).catch(console.warn);

            setOpenAssign(false);
            setSelectedTicket(null);
            setAssignTechId('');
        } catch (err) {
            console.error(err);
        }
    };

    const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
        try {
            await updateDoc(doc(db, 'maintenanceTickets', ticketId), {
                status: newStatus,
                updatedAt: serverTimestamp()
            });
            
            await addDoc(collection(db, 'auditLogs'), {
                ticketId: ticketId,
                action: `STATUS_UPDATE_${newStatus.toUpperCase()}`,
                performedBy: 'ADMIN',
                timestamp: serverTimestamp()
            });
        } catch (err) {
            console.error(err);
        }
    };

    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'EMERGENCY': return '#ef4444';
            case 'HIGH': return '#f59e0b';
            case 'MEDIUM': return binThemeTokens.gold;
            default: return '#64748b';
        }
    };

    const getStatusStyle = (status: string) => {
        const s = (status || 'OPEN').toLowerCase();
        if (s === 'open' || s === 'accepted') return { bg: alpha('#EF4444', 0.1), color: '#EF4444' };
        if (['on_the_way', 'arrived', 'in_progress'].includes(s)) return { bg: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold };
        if (s === 'completed') return { bg: alpha('#10b981', 0.1), color: '#10b981' };
        if (s === 'closed') return { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' };
        return { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' };
    };

    const filteredTickets = tickets.filter(t => 
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.propertyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.tenantName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <AdminPageFrame
            title="Duty Command Center"
            subtitle="Strategic Field Operations Control & Mission Dispatch"
            loading={loading}
            breadcrumbs={[{ label: 'Operations' }, { label: 'Duty Command' }]}
        >
            <Grid container spacing={4}>
                {/* ─── ROW 1: LIVE COMMAND METRICS ───────────────────────────────── */}
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 3, borderRadius: 6, bgcolor: alpha('#ef4444', 0.05), border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="overline" sx={{ color: '#ef4444', fontWeight: 950, letterSpacing: 2 }}>EMERGENCY</Typography>
                                <Typography variant="h3" fontWeight="950" color="#FFF">{emergencyTickets.length}</Typography>
                            </Box>
                            <ShieldAlert size={48} color="#ef4444" opacity={0.5} />
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>IMMEDIATE RESPONSE REQUIRED</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 3, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>UNASSIGNED</Typography>
                                <Typography variant="h3" fontWeight="950" color="#FFF">{unassignedTickets.length}</Typography>
                            </Box>
                            <UserPlus size={48} color={binThemeTokens.gold} opacity={0.5} />
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>PENDING DISPATCH</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 3, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="overline" sx={{ color: '#6366f1', fontWeight: 950, letterSpacing: 2 }}>FLEET STATUS</Typography>
                                <Typography variant="h3" fontWeight="950" color="#FFF">{availableTechs.length}/{techs.filter(t => t.onDuty).length}</Typography>
                            </Box>
                            <Zap size={48} color="#6366f1" opacity={0.5} />
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>AVAILABLE OPERATIVES</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 3, borderRadius: 6, bgcolor: alpha('#f59e0b', 0.05), border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="overline" sx={{ color: '#f59e0b', fontWeight: 950, letterSpacing: 2 }}>SLA RISK</Typography>
                                <Typography variant="h3" fontWeight="950" color="#FFF">{slaBreachRisk}</Typography>
                            </Box>
                            <Clock size={48} color="#f59e0b" opacity={0.5} />
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>MISSIONS NEARING BREACH</Typography>
                    </Paper>
                </Grid>

                {/* ─── ROW 2: DISPATCH COMMAND TABLE ──────────────────────────────── */}
                <Grid item xs={12} lg={9}>
                    <Paper sx={{ borderRadius: 8, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Stack direction="row" spacing={3} alignItems="center">
                                <Typography variant="h6" fontWeight="950" color="#FFF">MISSION DISPATCH QUEUE</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(255,255,255,0.05)', px: 2, py: 0.5, borderRadius: 2 }}>
                                    <Search size={14} color="rgba(255,255,255,0.4)" />
                                    <TextField 
                                        placeholder="Filter missions..." 
                                        variant="standard" 
                                        size="small"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        InputProps={{ disableUnderline: true, sx: { color: '#FFF', fontSize: '0.8rem', fontWeight: 700 } }}
                                    />
                                </Box>
                                <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                                <Stack direction="row" spacing={1}>
                                    <Button size="small" variant="text" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>LIST VIEW</Button>
                                    <Button size="small" variant="text" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>MAP VIEW</Button>
                                </Stack>
                            </Stack>
                            <Button variant="contained" startIcon={<Play size={16} />} sx={{ bgcolor: '#EF4444', color: '#FFF', fontWeight: 950, borderRadius: 2 }}>
                                CREATE MISSION
                            </Button>
                        </Box>
                        <TableContainer sx={{ maxHeight: 600 }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>MISSION / PRIORITY</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>LOCATION</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>RESIDENT</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>STATUS</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ASSIGNED UNIT</TableCell>
                                        <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>COMMAND</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredTickets.map((ticket) => {
                                        const statusStyle = getStatusStyle(ticket.status);
                                        return (
                                            <TableRow key={ticket.id} hover>
                                                <TableCell>
                                                    <Stack direction="row" spacing={2} alignItems="center">
                                                        <Box sx={{ width: 4, height: 24, bgcolor: getPriorityColor(ticket.priority), borderRadius: 1 }} />
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="950" color="#FFF">{ticket.category || 'Maintenance'}</Typography>
                                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>#{String(ticket.id).slice(0, 8).toUpperCase()}</Typography>
                                                        </Box>
                                                    </Stack>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="800" color="#FFF">{ticket.propertyName}</Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>UNIT {ticket.unitNumber}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="700" color="#FFF">{ticket.tenantName}</Typography>
                                                    <Stack direction="row" spacing={1}>
                                                        <Tooltip title="Message Resident"><IconButton size="small" sx={{ p: 0 }}><MessageSquare size={12} color={binThemeTokens.gold} /></IconButton></Tooltip>
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>{ticket.tenantPhone || 'Encrypted'}</Typography>
                                                    </Stack>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={(ticket.status || 'OPEN').replace('_', ' ').toUpperCase()} 
                                                        size="small" 
                                                        sx={{ bgcolor: statusStyle.bg, color: statusStyle.color, fontWeight: 950, fontSize: '0.6rem' }} 
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    {ticket.assignedTechnicianId ? (
                                                        <Stack direction="row" spacing={1} alignItems="center">
                                                            <Avatar sx={{ width: 24, height: 24, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontSize: '0.6rem', fontWeight: 950 }}>
                                                                {ticket.assignedTechnicianName?.charAt(0)}
                                                            </Avatar>
                                                            <Box>
                                                                <Typography variant="caption" fontWeight="900" color="#FFF">{ticket.assignedTechnicianName}</Typography>
                                                                <Tooltip title="Message Unit"><IconButton size="small" sx={{ p: 0, ml: 1 }}><MessageSquare size={10} color="rgba(255,255,255,0.3)" /></IconButton></Tooltip>
                                                            </Box>
                                                        </Stack>
                                                    ) : (
                                                        <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 950, fontStyle: 'italic' }}>PENDING DISPATCH</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                        <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.2)' }}><MoreHorizontal size={16} /></IconButton>
                                                        <Button 
                                                            size="small" 
                                                            variant="contained" 
                                                            onClick={() => { setSelectedTicket(ticket); setOpenAssign(true); }}
                                                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.6rem' }}
                                                        >
                                                            {ticket.assignedTechnicianId ? 'REASSIGN' : 'DISPATCH'}
                                                        </Button>
                                                    </Stack>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* ─── ROW 2: FIELD FORCE PANEL ──────────────────────────────────── */}
                <Grid item xs={12} lg={3}>
                    <Paper sx={{ borderRadius: 8, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', p: 3, height: '100%' }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 3 }}>FIELD FORCE</Typography>
                        
                        <Stack spacing={2}>
                            {/* ACTIVE / BUSY TECHS */}
                            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 950 }}>ON MISSION ({busyTechs.length})</Typography>
                            {busyTechs.map(tech => (
                                <Box key={tech.id} sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 4, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <Avatar sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{tech.displayName?.charAt(0)}</Avatar>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body2" fontWeight="950" color="#FFF">{tech.displayName}</Typography>
                                            <Typography variant="caption" color="textSecondary">{tech.specialization}</Typography>
                                        </Box>
                                        <Tooltip title="View Live Location"><IconButton size="small"><MapPin size={14} color={binThemeTokens.gold} /></IconButton></Tooltip>
                                    </Stack>
                                </Box>
                            ))}

                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', my: 1 }} />

                            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 950 }}>STANDBY ({availableTechs.length})</Typography>
                            {availableTechs.map(tech => (
                                <Box key={tech.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontWeight: 950 }}>{tech.displayName?.charAt(0)}</Avatar>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body2" fontWeight="950" color="#FFF">{tech.displayName}</Typography>
                                            <Typography variant="caption" color="textSecondary">READY FOR DISPATCH</Typography>
                                        </Box>
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} />
                                    </Stack>
                                </Box>
                            ))}
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>

            {/* ─── DIALOGS ─────────────────────────────────────────────────── */}
            
            {/* DISPATCH DIALOG */}
            <Dialog 
                open={openAssign} 
                onClose={() => setOpenAssign(false)}
                PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', minWidth: 400 } }}
            >
                <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>FLEET DISPATCH PROTOCOL</DialogTitle>
                <DialogContent sx={{ py: 3 }}>
                    <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, mb: 3 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950 }}>MISSION TARGET</Typography>
                        <Typography variant="body1" fontWeight="950" color="#FFF">{selectedTicket?.propertyName} - Unit {selectedTicket?.unitNumber}</Typography>
                        <Typography variant="body2" color="textSecondary">{selectedTicket?.category}</Typography>
                    </Box>

                    <FormControl fullWidth>
                        <InputLabel sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>SELECT OPERATIVE</InputLabel>
                        <Select 
                            value={assignTechId} 
                            onChange={(e) => setAssignTechId(e.target.value)}
                            sx={{ color: '#FFF', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}
                        >
                            {availableTechs.map(t => (
                                <MenuItem key={t.id} value={t.id}>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.6rem' }}>{t.displayName?.charAt(0)}</Avatar>
                                        <Typography variant="body2">{t.displayName} ({t.specialization})</Typography>
                                    </Stack>
                                </MenuItem>
                            ))}
                            {busyTechs.map(t => (
                                <MenuItem key={t.id} value={t.id} disabled>
                                    <Stack direction="row" spacing={2} alignItems="center" sx={{ opacity: 0.5 }}>
                                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.6rem' }}>{t.displayName?.charAt(0)}</Avatar>
                                        <Typography variant="body2">{t.displayName} (BUSY - ON MISSION)</Typography>
                                    </Stack>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Alert severity="info" sx={{ mt: 3, bgcolor: 'rgba(59, 130, 246, 0.05)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                        Assigning will trigger instant WhatsApp and Portal notifications to the technician.
                    </Alert>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Button onClick={() => setOpenAssign(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>ABORT</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleAssign} 
                        disabled={!assignTechId}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
                    >
                        EXECUTE DISPATCH
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}
