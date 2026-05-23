import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Grid, Stack, Button, 
    CircularProgress, Chip, TextField, Divider, 
    IconButton, alpha, Avatar, Card, CardMedia
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Navigation, Clock, MessageSquare, Camera, 
    Check, AlertTriangle, Play, Pause, XCircle, 
    ChevronLeft, Phone, MapPin, Wrench, ClipboardList,
    Image as ImageIcon, ShieldCheck
} from 'lucide-react';
import { 
    db, doc, getDoc, updateDoc, serverTimestamp, 
    collection, addDoc, onSnapshot 
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { notifyStatusUpdate, notifyCompletionRequest } from '../../services/notificationService';
import { ALL_TECHNICIAN_ACTIVE_STATUSES, TICKET_AUDIT_ACTIONS, logAuditAction } from '../../shared-exports';
import { resolvePropertyLocation } from '../../utils/propertyLocationResolver';

export default function TechnicianJobDetailPage() {
    const { id } = useParams();
    const { user } = useRole();
    const navigate = useNavigate();
    
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [notes, setNotes] = useState('');
    const [materials, setMaterials] = useState('');
    const [slaTime, setSlaTime] = useState<string>('00:00:00');
    
    useEffect(() => {
        if (!id || !user?.uid) return;

        const unsub = onSnapshot(doc(db, 'maintenanceTickets', id), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                // Allow view if assigned OR if it's in mission pool (unassigned)
                if (data.assignedTechnicianId === user.uid || !data.assignedTechnicianId) {
                    setTicket({ id: snap.id, ...data });
                } else {
                    alert("Mission assigned to another operator.");
                    navigate('/technician/dashboard');
                }
            }
            setLoading(false);
        });

        return () => unsub();
    }, [id, user]);

    // SLA Timer Logic
    useEffect(() => {
        if (!ticket || !['accepted', 'on_the_way', 'arrived', 'in_progress', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(ticket.status)) return;

        const interval = setInterval(() => {
            const start = ticket.createdAt?.toDate() || new Date();
            const now = new Date();
            const diff = now.getTime() - start.getTime();
            
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            
            setSlaTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }, 1000);

        return () => clearInterval(interval);
    }, [ticket]);

    const handleStatusUpdate = async (newStatus: string) => {
        if (!id || !user) return;
        setActionLoading(true);
        try {
            const updatePayload: any = {
                status: newStatus,
                updatedAt: serverTimestamp()
            };

            // Status Specific Transitions
            if (newStatus === 'accepted' && !ticket.assignedTechnicianId) {
                updatePayload.assignedTechnicianId = user.uid;
                updatePayload.assignedTechnicianName = user.displayName;
                updatePayload.acceptedAt = serverTimestamp();
            }
            
            if (newStatus === 'arrived') updatePayload.arrivedAt = serverTimestamp();
            if (newStatus === 'in_progress' && !ticket.startedAt) updatePayload.startedAt = serverTimestamp();
            
            if (newStatus === 'completed') {
                updatePayload.technicianNotes = notes;
                updatePayload.materialsUsed = materials.split(',').map(s => s.trim()).filter(Boolean);
                updatePayload.completedAt = serverTimestamp();
                updatePayload.tenantApprovalRequired = true;
            }

            await updateDoc(doc(db, 'maintenanceTickets', id), updatePayload);
            
            await logAuditAction({
                action: TICKET_AUDIT_ACTIONS.STATUS_UPDATE,
                targetType: 'maintenanceTickets',
                targetId: id,
                actorId: user.uid,
                actorRole: 'technician',
                before: { status: ticket.status },
                after: { status: newStatus },
                metadata: { ...updatePayload }
            });

            // Notification Engine
            if (ticket?.tenantId) {
                if (newStatus === 'completed') {
                    notifyCompletionRequest(id, ticket.tenantId, user.displayName || 'Technician').catch(console.warn);
                } else {
                    notifyStatusUpdate(id, ticket.tenantId, newStatus).catch(console.warn);
                }
            }

            if (newStatus === 'completed') navigate('/technician/jobs');
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (!ticket) return null;

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'accepted':
            case 'ASSIGNED': return '#3b82f6';
            case 'on_the_way':
            case 'EN_ROUTE': return '#f59e0b';
            case 'arrived':
            case 'ARRIVED': return '#6366f1';
            case 'in_progress':
            case 'IN_PROGRESS': return '#10b981';
            case 'waiting_parts':
            case 'WAITING_PARTS': return '#ef4444';
            case 'escalated': return '#dc2626';
            default: return 'rgba(255,255,255,0.4)';
        }
    };

    return (
        <Box>
            {/* Mission Header */}
            <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={2} alignItems="center">
                        <IconButton onClick={() => navigate(-1)} sx={{ color: '#FFF' }}><ChevronLeft /></IconButton>
                        <Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>MISSION CONTROL · REF {ticket.id.substring(0,8)}</Typography>
                            <Typography variant="h5" fontWeight="950" color="#FFF">{ticket.category || 'Standard Task'}</Typography>
                        </Box>
                    </Stack>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, display: 'block' }}>ELAPSED TIME</Typography>
                        <Typography variant="h6" fontWeight="950" color={ticket.priority === 'emergency' ? '#ef4444' : binThemeTokens.gold}>{slaTime}</Typography>
                    </Box>
                </Stack>
            </Paper>

            <Grid container spacing={4}>
                {/* Left Column: Job Info */}
                <Grid item xs={12} lg={8}>
                    {/* Residency Details */}
                    <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'block' }}>RESIDENCY METADATA</Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <Stack direction="row" spacing={2}>
                                    <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}><MapPin /></Avatar>
                                    <Box>
                                        <Typography variant="body1" fontWeight="950" color="#FFF">{ticket.propertyName}</Typography>
                                        <Typography variant="body2" color="textSecondary">Unit {ticket.unitNumber} · Level {ticket.floor}</Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Stack direction="row" spacing={2}>
                                    <Avatar sx={{ bgcolor: alpha('#FFF', 0.05), color: '#FFF' }}><Phone /></Avatar>
                                    <Box>
                                        <Typography variant="body1" fontWeight="950" color="#FFF">{ticket.tenantName}</Typography>
                                        <Typography variant="body2" color="textSecondary">{ticket.tenantPhone}</Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                        </Grid>
                        
                        <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />
                        
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2, display: 'block' }}>COMPLAINT LOG</Typography>
                        <Typography variant="body1" color="#FFF" sx={{ lineHeight: 1.8 }}>{ticket.description}</Typography>
                        
                        {/* Evidence Photos */}
                        <Box sx={{ mt: 4 }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, mb: 2, display: 'block' }}>RESIDENT EVIDENCE</Typography>
                            <Stack direction="row" spacing={2}>
                                {[1,2].map(i => (
                                    <Box key={i} sx={{ width: 120, height: 120, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <ImageIcon color="rgba(255,255,255,0.2)" />
                                    </Box>
                                ))}
                            </Stack>
                        </Box>
                    </Paper>

                    {/* Mission Execution Controls */}
                    <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 4, display: 'block' }}>MISSION LIFECYCLE</Typography>
                        
                        {!ticket.assignedTechnicianId ? (
                            <Button 
                                fullWidth variant="contained" 
                                size="large" onClick={() => handleStatusUpdate('accepted')}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, borderRadius: 4 }}
                            >
                                ACCEPT ASSIGNMENT
                            </Button>
                        ) : (
                            <Stack direction="row" flexWrap="wrap" gap={2}>
                                {[
                                    { id: 'on_the_way', label: 'ON THE WAY', icon: <Navigation size={18} /> },
                                    { id: 'arrived', label: 'ARRIVED', icon: <MapPin size={18} /> },
                                    { id: 'in_progress', label: 'START WORK', icon: <Play size={18} /> },
                                    { id: 'waiting_parts', label: 'PAUSE / PARTS', icon: <Pause size={18} /> },
                                    { id: 'escalated', label: 'ESCALATE', icon: <AlertTriangle size={18} /> }
                                ].map((step) => (
                                    <Button 
                                        key={step.id}
                                        variant={ticket.status === step.id ? 'contained' : 'outlined'}
                                        onClick={() => handleStatusUpdate(step.id)}
                                        disabled={actionLoading || ticket.status === 'completed' || (step.id === 'on_the_way' && !['accepted', 'ASSIGNED'].includes(ticket.status))}
                                        startIcon={step.icon}
                                        sx={{ 
                                            flex: 1, minWidth: '140px',
                                            bgcolor: ticket.status === step.id ? getStatusColor(step.id) : 'transparent',
                                            color: ticket.status === step.id ? '#000' : getStatusColor(step.id),
                                            borderColor: getStatusColor(step.id),
                                            fontWeight: 950, borderRadius: 3
                                        }}
                                    >
                                        {step.label}
                                    </Button>
                                ))}
                            </Stack>
                        )}

                        {ticket.status === 'in_progress' && (
                            <Box sx={{ mt: 6, p: 4, bgcolor: alpha(binThemeTokens.gold, 0.02), border: `1px dashed ${alpha(binThemeTokens.gold, 0.3)}`, borderRadius: 6 }}>
                                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Wrench color={binThemeTokens.gold} /> POST-MISSION REPORT
                                </Typography>
                                <Stack spacing={4}>
                                    <Grid container spacing={3}>
                                        <Grid item xs={6}>
                                            <Button fullWidth variant="outlined" startIcon={<Camera />} sx={{ height: 100, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>
                                                BEFORE PHOTO
                                            </Button>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Button fullWidth variant="outlined" startIcon={<Camera />} sx={{ height: 100, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>
                                                AFTER PHOTO
                                            </Button>
                                        </Grid>
                                    </Grid>
                                    
                                    <TextField 
                                        fullWidth multiline rows={3} label="RESOLUTION NOTES" variant="filled"
                                        placeholder="Describe the solution applied..."
                                        value={notes} onChange={e => setNotes(e.target.value)}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.02)', '& .MuiFilledInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.4)', fontWeight: 900 } }}
                                    />
                                    
                                    <TextField 
                                        fullWidth label="MATERIALS CONSUMED" variant="filled"
                                        placeholder="e.g. 2x LED Bulbs, 1x Socket..."
                                        value={materials} onChange={e => setMaterials(e.target.value)}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.02)', '& .MuiFilledInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.4)', fontWeight: 900 } }}
                                    />
                                    
                                    <Button 
                                        variant="contained" size="large" fullWidth
                                        onClick={() => handleStatusUpdate('completed')}
                                        disabled={actionLoading || !notes.trim()}
                                        startIcon={<Check />}
                                        sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950, py: 2, borderRadius: 4, '&:hover': { bgcolor: '#059669' } }}
                                    >
                                        COMPLETE MISSION & NOTIFY RESIDENT
                                    </Button>
                                </Stack>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                {/* Right Column: Communications & History */}
                <Grid item xs={12} lg={4}>
                    <Stack spacing={4}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'block' }}>LOCATION & NAVIGATION</Typography>
                            {(() => {
                                const resolved = resolvePropertyLocation(ticket);
                                if (resolved.hasExactCoordinates) {
                                    return (
                                        <Stack spacing={2}>
                                            <Button 
                                                fullWidth 
                                                variant="contained" 
                                                startIcon={<Navigation size={18} />} 
                                                onClick={() => window.open(resolved.googleMapsUrl, '_blank', 'noopener,noreferrer')} 
                                                sx={{ py: 1.5, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3 }}
                                            >
                                                Navigate to Property
                                            </Button>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', display: 'block', fontFamily: 'monospace' }}>
                                                GPS: {resolved.latitude}, {resolved.longitude}
                                            </Typography>
                                        </Stack>
                                    );
                                } else {
                                    return (
                                        <Stack spacing={2}>
                                            <Box sx={{ p: 2, bgcolor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 2 }}>
                                                <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 900, textAlign: 'center' }}>
                                                    Exact GPS pin missing. Contact Admin before dispatch.
                                                </Typography>
                                            </Box>
                                            {resolved.locationQuality !== "MISSING" && (
                                                <Button 
                                                    fullWidth 
                                                    variant="outlined" 
                                                    startIcon={<Navigation size={18} />} 
                                                    onClick={() => window.open(resolved.googleMapsUrl, '_blank', 'noopener,noreferrer')} 
                                                    sx={{ py: 1.5, borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 950, borderRadius: 3 }}
                                                >
                                                    Navigate to Fallback Area
                                                </Button>
                                            )}
                                        </Stack>
                                    );
                                }
                            })()}
                        </Paper>

                        <Paper sx={{ p: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'block' }}>COMMS CHANNELS</Typography>
                            <Stack spacing={2}>
                                <Button fullWidth variant="outlined" startIcon={<MessageSquare />} onClick={() => navigate(`/technician/chat/${id}`)} sx={{ py: 1.5, borderColor: alpha(binThemeTokens.gold, 0.3), color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3 }}>
                                    CHAT WITH RESIDENT
                                </Button>
                                <Button fullWidth variant="outlined" startIcon={<ShieldCheck />} sx={{ py: 1.5, borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 950, borderRadius: 3 }}>
                                    CONTACT ADMIN / BASE
                                </Button>
                            </Stack>
                        </Paper>

                        <Paper sx={{ p: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'block' }}>MISSION TIMELINE</Typography>
                            <Stack spacing={3}>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#4ade80', mt: 1 }} />
                                    <Box>
                                        <Typography variant="body2" fontWeight="950" color="#FFF">Mission Created</Typography>
                                        <Typography variant="caption" color="textSecondary">Yesterday · 14:22</Typography>
                                    </Box>
                                </Box>
                                {ticket.acceptedAt && (
                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: binThemeTokens.gold, mt: 1 }} />
                                        <Box>
                                            <Typography variant="body2" fontWeight="950" color="#FFF">Accepted by Operator</Typography>
                                            <Typography variant="caption" color="textSecondary">{ticket.acceptedAt.toDate().toLocaleTimeString()}</Typography>
                                        </Box>
                                    </Box>
                                )}
                            </Stack>
                        </Paper>
                    </Stack>
                </Grid>
            </Grid>
        </Box>
    );
}
