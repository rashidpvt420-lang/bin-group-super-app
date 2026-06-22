import React, { useEffect, useState } from 'react';
import { 
    Container, Typography, Paper, Grid, Stack, Button, Chip, 
    CircularProgress, Box, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, List, ListItem, ListItemText, ListItemAvatar, Avatar, alpha
} from '@mui/material';
import { AlertTriangle, Shield, Flame, Droplets, Zap, ShieldAlert, Radio, Compass } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { db, collection, query, where, onSnapshot, updateDoc, doc, addDoc, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

export default function EmergencyCommandCenterPage() {
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [emergencies, setEmergencies] = useState<any[]>([]);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [selectedEmergency, setSelectedEmergency] = useState<any>(null);
    const [activeFilter, setActiveFilter] = useState<'all' | 'water' | 'fire' | 'power' | 'lift' | 'security' | 'flooding'>('all');
    
    // Broadcast dialog state
    const [openBroadcast, setOpenBroadcast] = useState(false);
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [submittingBroadcast, setSubmittingBroadcast] = useState(false);

    useEffect(() => {
        // Monitor all emergency tickets
        // priority = 'emergency' or category = 'emergency' or status = 'emergency_submitted'
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('priority', 'in', ['emergency', 'EMERGENCY', 'urgent', 'URGENT', 'high', 'HIGH', 'sos', 'SOS'])
        );
        const unsubEmergencies = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setEmergencies(list);
            setLoading(false);
            
            // Auto-select first active emergency if none selected or if selected one is no longer in list
            if (list.length > 0) {
                setSelectedEmergency((prev: any) => {
                    if (!prev) return list[0];
                    const current = list.find(item => item.id === prev.id);
                    return current || list[0];
                });
            } else {
                setSelectedEmergency(null);
            }
        });

        // Monitor all technicians
        const qTechs = query(collection(db, 'users'), where('role', '==', 'technician'));
        const unsubTechs = onSnapshot(qTechs, (snap) => {
            setTechnicians(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubEmergencies();
            unsubTechs();
        };
    }, []);

    // Filter logic based on description/category keywords
    const matchesFilter = (ticket: any, filter: string) => {
        if (filter === 'all') return true;
        const text = `${ticket.description || ''} ${ticket.category || ''}`.toLowerCase();
        
        switch (filter) {
            case 'water':
                return text.includes('water') || text.includes('leak') || text.includes('pipe') || text.includes('plumbing');
            case 'fire':
                return text.includes('fire') || text.includes('smoke') || text.includes('alarm') || text.includes('flame');
            case 'power':
                return text.includes('power') || text.includes('blackout') || text.includes('electricity') || text.includes('electric') || text.includes('dark') || text.includes('outage');
            case 'lift':
                return text.includes('lift') || text.includes('elevator') || text.includes('stuck');
            case 'security':
                return text.includes('security') || text.includes('intruder') || text.includes('lock') || text.includes('threat') || text.includes('break');
            case 'flooding':
                return text.includes('flood') || text.includes('flooding') || text.includes('overflow');
            default:
                return true;
        }
    };

    const filteredEmergencies = emergencies.filter(ticket => matchesFilter(ticket, activeFilter));

    const handleDispatch = async (techId: string, techName: string) => {
        if (!selectedEmergency) return;
        if (!window.confirm(`Confirm priority dispatch for ${techName}?`)) return;

        try {
            await updateDoc(doc(db, 'maintenanceTickets', selectedEmergency.id), {
                assignedTechnicianId: techId,
                assignedTechnicianName: techName,
                status: 'ACCEPTED',
                dispatchStatus: 'EN_ROUTE',
                trackingStatus: 'LIVE_TRACKING',
                requiresImmediateDispatch: true,
                updatedAt: serverTimestamp()
            });

            // Update technician active job in users collection
            await updateDoc(doc(db, 'users', techId), {
                activeTicketId: selectedEmergency.id,
                dutyStatus: 'ON_JOB',
                updatedAt: serverTimestamp()
            });

            alert(`Technician ${techName} dispatched successfully!`);
        } catch (err) {
            console.error('Failed to dispatch:', err);
            alert('Dispatch failed.');
        }
    };

    const handleCreateBroadcast = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmittingBroadcast(true);
        try {
            await addDoc(collection(db, 'announcements'), {
                propertyId: 'all',
                title: `EMERGENCY ALERT: ${broadcastTitle}`,
                body: broadcastMessage,
                category: 'emergency',
                priority: 'urgent',
                audience: 'all',
                published: true,
                publishedAt: serverTimestamp(),
                createdBy: 'Emergency Command Center'
            });
            setOpenBroadcast(false);
            setBroadcastTitle('');
            setBroadcastMessage('');
            alert('Emergency broadcast announcement sent successfully!');
        } catch (err) {
            console.error('Failed to broadcast:', err);
            alert('Failed to send broadcast.');
        } finally {
            setSubmittingBroadcast(false);
        }
    };

    const getEmergencyIcon = (desc: string = '') => {
        const text = desc.toLowerCase();
        if (text.includes('fire') || text.includes('smoke') || text.includes('alarm')) return <Flame size={20} color="#f87171" />;
        if (text.includes('water') || text.includes('leak') || text.includes('pipe') || text.includes('flood')) return <Droplets size={20} color="#60a5fa" />;
        if (text.includes('power') || text.includes('blackout') || text.includes('electric')) return <Zap size={20} color="#fbbf24" />;
        return <AlertTriangle size={20} color="#ef4444" />;
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Header section */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: '#ef4444', fontWeight: 950, letterSpacing: 4, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ShieldAlert size={16} /> EMERGENCY RESPONSE COMMAND CENTER
                    </Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF" sx={{ letterSpacing: -1 }}>Sovereign Dispatch Hub</Typography>
                    <Typography variant="body2" color="rgba(255,255,255,0.5)" sx={{ mt: 0.5 }}>Real-time resident SOS monitoring, instant technical dispatch, and public safety announcements.</Typography>
                </Box>
                <Button 
                    variant="contained" 
                    startIcon={<Radio size={16} />} 
                    onClick={() => setOpenBroadcast(true)}
                    sx={{ bgcolor: '#ef4444', color: '#FFF', fontWeight: 950, '&:hover': { bgcolor: '#dc2626' } }}
                >
                    BROADCAST SOS ALERT
                </Button>
            </Box>

            {/* Quick Filter Chips */}
            <Stack direction="row" spacing={1} sx={{ mb: 4, flexWrap: 'wrap', gap: 1 }}>
                {(['all', 'water', 'fire', 'power', 'lift', 'security', 'flooding'] as const).map((filter) => (
                    <Chip 
                        key={filter} 
                        label={filter.toUpperCase()} 
                        onClick={() => setActiveFilter(filter)}
                        sx={{ 
                            bgcolor: activeFilter === filter ? binThemeTokens.gold : 'rgba(255,255,255,0.03)', 
                            color: activeFilter === filter ? '#000' : 'rgba(255,255,255,0.6)', 
                            fontWeight: 950,
                            border: `1px solid ${activeFilter === filter ? binThemeTokens.gold : 'rgba(255,255,255,0.06)'}`,
                            '&:hover': { bgcolor: activeFilter === filter ? binThemeTokens.gold : 'rgba(255,255,255,0.08)' }
                        }} 
                    />
                ))}
            </Stack>

            <Grid container spacing={4}>
                {/* Active SOS Feed */}
                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, minHeight: '60vh' }}>
                        <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, letterSpacing: 2, mb: 3 }}>
                            ACTIVE SOS ALERTS ({filteredEmergencies.length})
                        </Typography>

                        <List sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {filteredEmergencies.map((emerg) => {
                                const isSelected = selectedEmergency?.id === emerg.id;
                                return (
                                    <ListItem 
                                        key={emerg.id}
                                        button
                                        onClick={() => setSelectedEmergency(emerg)}
                                        sx={{ 
                                            borderRadius: 4, 
                                            bgcolor: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${isSelected ? '#ef4444' : 'rgba(255,255,255,0.05)'}`,
                                            p: 2.5,
                                            flexDirection: 'column',
                                            alignItems: 'stretch',
                                            transition: 'all 0.2s ease',
                                            '&:hover': { bgcolor: isSelected ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255,255,255,0.04)' }
                                        }}
                                    >
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: '100%', mb: 1.5 }}>
                                            <Stack direction="row" spacing={1.5} alignItems="center">
                                                {getEmergencyIcon(emerg.description)}
                                                <Typography variant="body1" fontWeight="950" color="#FFF">
                                                    #{emerg.id.substring(0, 8).toUpperCase()}
                                                </Typography>
                                            </Stack>
                                            <Chip 
                                                label={String(emerg.status || 'SOS').replace(/_/g, ' ')} 
                                                size="small" 
                                                sx={{ 
                                                    bgcolor: emerg.status === 'emergency_submitted' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)', 
                                                    color: emerg.status === 'emergency_submitted' ? '#ef4444' : 'rgba(255,255,255,0.5)',
                                                    fontWeight: 950,
                                                    fontSize: '0.6rem'
                                                }} 
                                            />
                                        </Stack>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, mb: 1 }}>
                                            {emerg.description || 'Tenant triggered SOS'}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>
                                            {emerg.propertyName || 'Property'} · Unit {emerg.unitNumber || '—'}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', mt: 1, display: 'block' }}>
                                            {emerg.createdAt?.toDate ? emerg.createdAt.toDate().toLocaleString() : 'Just now'}
                                        </Typography>
                                    </ListItem>
                                );
                            })}
                            {filteredEmergencies.length === 0 && (
                                <Box sx={{ py: 10, textAlign: 'center' }}>
                                    <Shield size={40} color="rgba(255,255,255,0.15)" style={{ margin: '0 auto', marginBottom: 16 }} />
                                    <Typography color="rgba(255,255,255,0.3)" variant="body2">No emergency alerts in this queue.</Typography>
                                </Box>
                            )}
                        </List>
                    </Paper>
                </Grid>

                {/* Dispatch Control panel */}
                <Grid item xs={12} lg={8}>
                    {selectedEmergency ? (
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, height: '100%' }}>
                                    <Typography variant="subtitle2" sx={{ color: '#ef4444', fontWeight: 950, letterSpacing: 2, mb: 3 }}>
                                        INCIDENT SIGNAL DETAIL
                                    </Typography>
                                    
                                    <Stack spacing={3}>
                                        <Box>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>INCIDENT ID</Typography>
                                            <Typography variant="h6" fontWeight="950" color="#FFF">#{selectedEmergency.id}</Typography>
                                        </Box>
                                        
                                        <Box>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>LOCATION</Typography>
                                            <Typography variant="body1" color="#FFF" fontWeight={700}>
                                                {selectedEmergency.propertyName || '—'} · Unit {selectedEmergency.unitNumber || '—'}
                                            </Typography>
                                        </Box>

                                        <Box>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>RESIDENT INFO</Typography>
                                            <Typography variant="body1" color="#FFF" fontWeight={700}>{selectedEmergency.tenantName || 'Resident'}</Typography>
                                            {selectedEmergency.tenantPhone && (
                                                <Typography variant="body2" color="rgba(255,255,255,0.5)">{selectedEmergency.tenantPhone}</Typography>
                                            )}
                                        </Box>

                                        <Box>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>DESCRIPTION & RAW FEED</Typography>
                                            <Typography variant="body1" color="rgba(255,255,255,0.8)" sx={{ mt: 1, p: 2, bgcolor: 'rgba(0,0,0,0.18)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.04)' }}>
                                                {selectedEmergency.description || 'No description provided.'}
                                            </Typography>
                                        </Box>

                                        <Box>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>CURRENT STATUS</Typography>
                                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                                <Chip label={selectedEmergency.status?.toUpperCase() || 'OPEN'} color="error" size="small" />
                                                {selectedEmergency.assignedTechnicianName && (
                                                    <Chip label={`Assigned: ${selectedEmergency.assignedTechnicianName}`} color="warning" size="small" />
                                                )}
                                            </Stack>
                                        </Box>
                                    </Stack>
                                </Paper>
                            </Grid>

                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, height: '100%' }}>
                                    <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, letterSpacing: 2, mb: 3 }}>
                                        ONE-CLICK PRIORITY DISPATCH
                                    </Typography>
                                    <Typography variant="caption" color="rgba(255,255,255,0.4)" sx={{ mb: 3, display: 'block' }}>
                                        Assign a specialist immediately. Dispatched specialist is updated en route with GPS active.
                                    </Typography>

                                    <List sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: '45vh', overflowY: 'auto', pr: 1 }}>
                                        {technicians.map((tech) => {
                                            const isBusy = tech.dutyStatus === 'ON_JOB';
                                            return (
                                                <ListItem
                                                    key={tech.id}
                                                    sx={{ 
                                                        borderRadius: 3, 
                                                        bgcolor: 'rgba(255,255,255,0.02)', 
                                                        border: '1px solid rgba(255,255,255,0.04)',
                                                        p: 1.5,
                                                        flexDirection: isRTL ? 'row-reverse' : 'row'
                                                    }}
                                                    secondaryAction={
                                                        <Button 
                                                            variant="contained" 
                                                            size="small"
                                                            onClick={() => handleDispatch(tech.id, tech.displayName || 'Technician')}
                                                            sx={{ 
                                                                bgcolor: isBusy ? 'rgba(255,255,255,0.05)' : binThemeTokens.gold, 
                                                                color: isBusy ? 'rgba(255,255,255,0.3)' : '#000', 
                                                                fontWeight: 950,
                                                                '&:hover': { bgcolor: isBusy ? 'rgba(255,255,255,0.05)' : binThemeTokens.gold }
                                                            }}
                                                        >
                                                            DISPATCH
                                                        </Button>
                                                    }
                                                >
                                                    <ListItemAvatar>
                                                        <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.15), color: binThemeTokens.gold }}>
                                                            {(tech.displayName || 'T').charAt(0).toUpperCase()}
                                                        </Avatar>
                                                    </ListItemAvatar>
                                                    <ListItemText 
                                                        primary={tech.displayName || 'Unnamed Tech'} 
                                                        secondary={tech.specialty || 'General Specialist'}
                                                        primaryTypographyProps={{ color: '#FFF', fontWeight: 950 }}
                                                        secondaryTypographyProps={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}
                                                        sx={{ textAlign: isRTL ? 'right' : 'left' }}
                                                    />
                                                    <Box sx={{ mr: 2, ml: 2 }}>
                                                        <Chip 
                                                            label={tech.dutyStatus || (tech.onDuty ? 'ONLINE' : 'STANDBY')} 
                                                            size="small" 
                                                            sx={{ 
                                                                bgcolor: isBusy ? 'rgba(239, 68, 68, 0.15)' : 'rgba(74, 222, 128, 0.15)', 
                                                                color: isBusy ? '#ef4444' : '#4ade80',
                                                                fontWeight: 950,
                                                                fontSize: '0.6rem'
                                                            }} 
                                                        />
                                                    </Box>
                                                </ListItem>
                                            );
                                        })}
                                        {technicians.length === 0 && (
                                            <Typography color="rgba(255,255,255,0.3)" sx={{ textAlign: 'center', py: 4 }}>
                                                No technicians online.
                                            </Typography>
                                        )}
                                    </List>
                                </Paper>
                            </Grid>
                        </Grid>
                    ) : (
                        <Paper sx={{ p: 6, bgcolor: 'rgba(22, 22, 24, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6, display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Compass size={50} color="rgba(255,255,255,0.15)" style={{ margin: '0 auto', marginBottom: 16 }} />
                                <Typography variant="h6" color="rgba(255,255,255,0.4)" fontWeight="950">Select active SOS incident</Typography>
                                <Typography variant="body2" color="rgba(255,255,255,0.25)">Choose an active emergency signal from the left feed to dispatch help.</Typography>
                            </Box>
                        </Paper>
                    )}
                </Grid>
            </Grid>

            {/* Broadcast SOS Alert Dialog */}
            <Dialog open={openBroadcast} onClose={() => setOpenBroadcast(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
                <form onSubmit={handleCreateBroadcast}>
                    <DialogTitle sx={{ fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)', pb: 2 }}>
                        Broadcast Building Emergency SOS
                    </DialogTitle>
                    <DialogContent sx={{ pt: 3 }}>
                        <Typography variant="body2" color="rgba(255,255,255,0.5)" sx={{ mb: 3 }}>
                            This will send an immediate, high-priority safety alert banner to all active resident screen portals.
                        </Typography>
                        <Stack spacing={3} sx={{ minWidth: 360 }}>
                            <TextField 
                                fullWidth 
                                label="Alert Title" 
                                required 
                                value={broadcastTitle} 
                                onChange={e => setBroadcastTitle(e.target.value)} 
                                variant="filled" 
                                placeholder="e.g. FIRE ALARM SYSTEM DRILL / WATER OUTAGE"
                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} 
                            />
                            <TextField 
                                fullWidth 
                                multiline 
                                rows={4} 
                                label="Alert Message / Instructions" 
                                required 
                                value={broadcastMessage} 
                                onChange={e => setBroadcastMessage(e.target.value)} 
                                variant="filled" 
                                placeholder="e.g. Please follow emergency instructions, evacuation is NOT required."
                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} 
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Button onClick={() => setOpenBroadcast(false)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CANCEL</Button>
                        <Button 
                            type="submit" 
                            variant="contained" 
                            disabled={submittingBroadcast || !broadcastTitle || !broadcastMessage} 
                            sx={{ bgcolor: '#ef4444', color: '#FFF', fontWeight: 950, '&:hover': { bgcolor: '#dc2626' } }}
                        >
                            {submittingBroadcast ? <CircularProgress size={20} color="inherit" /> : 'SEND SOS BROADCAST'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}
