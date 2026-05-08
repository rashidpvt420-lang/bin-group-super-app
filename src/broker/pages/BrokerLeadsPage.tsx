import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress, 
    Chip, TextField, MenuItem, Select, Dialog, DialogTitle, 
    DialogContent, DialogActions, alpha, InputAdornment, 
    IconButton, Tooltip, Divider
} from '@mui/material';
import { 
    Search, Filter, Plus, Users, MapPin, 
    DollarSign, Calendar, MoreVertical, ExternalLink,
    Mail, Phone, MessageSquare, Briefcase, ChevronRight
} from 'lucide-react';
import { db, collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc, orderBy } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

export default function BrokerLeadsPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [leadName, setLeadName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [leadType, setLeadType] = useState('owner');
    const [propertyInterest, setPropertyInterest] = useState('');
    const [location, setLocation] = useState('');
    const [budget, setBudget] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (!user?.uid) return;
        const q = query(
            collection(db, 'brokerLeads'), 
            where('brokerId', '==', user.uid), 
            where('status', '!=', 'archived'),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, (snap) => {
            setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, [user]);

    const handleAddLead = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid || !leadName.trim()) return;
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'brokerLeads'), {
                brokerId: user.uid,
                brokerUid: user.uid,
                leadName, phone, email, leadType, propertyInterest, location, budget, notes,
                status: 'new',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            setOpenAdd(false);
            // Reset form
            setLeadName(''); setPhone(''); setEmail(''); setPropertyInterest(''); setLocation(''); setBudget(''); setNotes('');
        } catch (err) {
            console.error("Failed to add lead", err);
        } finally {
            setSubmitting(false);
        }
    };

    const updateLeadStatus = async (id: string, newStatus: string) => {
        try {
            await updateDoc(doc(db, 'brokerLeads', id), {
                status: newStatus,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error(err);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'new': return '#3b82f6';
            case 'contacted': return binThemeTokens.gold;
            case 'viewing': return '#a855f7';
            case 'negotiation': return '#f59e0b';
            case 'converted': return '#10b981';
            case 'rejected': return '#ef4444';
            default: return 'rgba(255,255,255,0.4)';
        }
    };

    const filteredLeads = leads.filter(l => 
        l.leadName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.propertyInterest?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <BrokerPageFrame
            title="Leads Pipeline"
            subtitle="Track and manage your potential brokerage missions"
            loading={loading}
            actions={
                <Button 
                    variant="contained" 
                    startIcon={<Plus size={18} />}
                    onClick={() => setOpenAdd(true)}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3, boxShadow: `0 10px 20px -5px ${alpha(binThemeTokens.gold, 0.4)}` }}
                >
                    ADD NEW LEAD
                </Button>
            }
        >
            {/* ─── FILTERS & SEARCH ───────────────────────────────────────────── */}
            <Paper sx={{ p: 2, mb: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                    <TextField 
                        fullWidth 
                        placeholder="Search leads by name or interest..." 
                        variant="standard" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{ 
                            disableUnderline: true, 
                            startAdornment: <Search size={18} color="rgba(255,255,255,0.3)" style={{ marginRight: 12 }} />,
                            sx: { color: '#FFF', fontWeight: 800, px: 2 }
                        }}
                    />
                    <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                    <IconButton sx={{ color: 'rgba(255,255,255,0.4)' }}><Filter size={20} /></IconButton>
                </Stack>
            </Paper>

            {/* ─── LEADS GRID ────────────────────────────────────────────────── */}
            {filteredLeads.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <Users size={48} color="rgba(255,255,255,0.1)" />
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 900, mt: 2 }}>
                        NO ACTIVE LEADS IN PIPELINE
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.1)', mt: 1 }}>
                        Start by clicking the "Add New Lead" button above.
                    </Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {filteredLeads.map(lead => (
                        <Grid item xs={12} md={6} lg={4} key={lead.id}>
                            <Paper sx={{ 
                                p: 0, 
                                bgcolor: 'rgba(22, 22, 24, 0.7)', 
                                borderRadius: 6, 
                                border: '1px solid rgba(255,255,255,0.05)',
                                overflow: 'hidden',
                                transition: 'all 0.3s ease',
                                '&:hover': { transform: 'translateY(-4px)', borderColor: alpha(getStatusColor(lead.status), 0.3), boxShadow: `0 10px 30px -10px ${alpha(getStatusColor(lead.status), 0.2)}` }
                            }}>
                                {/* Status Header */}
                                <Box sx={{ p: 1, bgcolor: alpha(getStatusColor(lead.status), 0.05), borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 3 }}>
                                    <Chip 
                                        label={lead.status.toUpperCase()} 
                                        size="small" 
                                        sx={{ bgcolor: alpha(getStatusColor(lead.status), 0.1), color: getStatusColor(lead.status), fontWeight: 950, fontSize: '0.65rem' }} 
                                    />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>
                                        {lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                    </Typography>
                                </Box>

                                <Box sx={{ p: 3 }}>
                                    <Stack spacing={2}>
                                        <Box>
                                            <Typography variant="h6" fontWeight="950" color="#FFF">{lead.leadName}</Typography>
                                            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                                                <Chip label={lead.leadType.toUpperCase()} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)' }} />
                                            </Stack>
                                        </Box>

                                        <Stack spacing={1}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <Phone size={14} color={binThemeTokens.gold} />
                                                <Typography variant="body2" color="textSecondary" fontWeight={700}>{lead.phone || 'No phone'}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <Mail size={14} color={binThemeTokens.gold} />
                                                <Typography variant="body2" color="textSecondary" fontWeight={700}>{lead.email || 'No email'}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <MapPin size={14} color={binThemeTokens.gold} />
                                                <Typography variant="body2" color="textSecondary" fontWeight={700}>{lead.location || 'N/A'}</Typography>
                                            </Box>
                                        </Stack>

                                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.03)' }} />

                                        <Box>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, letterSpacing: 1 }}>INTEREST / BUDGET</Typography>
                                            <Typography variant="body2" fontWeight="800" color="#FFF" sx={{ mt: 0.5 }}>
                                                {lead.propertyInterest || 'General Interest'} 
                                                {lead.budget && <Typography component="span" sx={{ color: '#10b981', ml: 1 }}>• AED {lead.budget}</Typography>}
                                            </Typography>
                                        </Box>

                                        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                                            <Select 
                                                fullWidth
                                                size="small" 
                                                value={lead.status} 
                                                onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                                                sx={{ 
                                                    bgcolor: 'rgba(255,255,255,0.03)', 
                                                    color: '#FFF', 
                                                    fontWeight: 900, 
                                                    fontSize: '0.75rem',
                                                    borderRadius: 2,
                                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.05)' } 
                                                }}
                                            >
                                                <MenuItem value="new">NEW</MenuItem>
                                                <MenuItem value="contacted">CONTACTED</MenuItem>
                                                <MenuItem value="viewing">VIEWING</MenuItem>
                                                <MenuItem value="negotiation">NEGOTIATION</MenuItem>
                                                <MenuItem value="converted">CONVERTED</MenuItem>
                                                <MenuItem value="rejected">REJECTED</MenuItem>
                                            </Select>
                                            <Tooltip title="View Details">
                                                <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: 'rgba(255,255,255,0.4)' }}>
                                                    <ExternalLink size={18} />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </Stack>
                                </Box>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* ─── ADD LEAD DIALOG ────────────────────────────────────────────── */}
            <Dialog 
                open={openAdd} 
                onClose={() => setOpenAdd(false)} 
                PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', minWidth: 500 } }}
            >
                <form onSubmit={handleAddLead}>
                    <DialogTitle sx={{ p: 4, pb: 0, fontWeight: 950, color: binThemeTokens.gold, textTransform: 'uppercase', letterSpacing: 2 }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Plus size={24} /> Register New Lead
                        </Stack>
                    </DialogTitle>
                    <DialogContent sx={{ p: 4 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 4, fontWeight: 700 }}>
                            Populate the fields below to initiate a new brokerage mission. Sovereign AI will assist in tracking attribution.
                        </Typography>
                        <Stack spacing={3}>
                            <TextField 
                                fullWidth label="Client Full Name *" required 
                                value={leadName} onChange={e => setLeadName(e.target.value)} 
                                variant="filled"
                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                            />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <TextField 
                                        fullWidth label="Phone Number" 
                                        value={phone} onChange={e => setPhone(e.target.value)} 
                                        variant="filled"
                                        sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField 
                                        fullWidth label="Email Address" 
                                        value={email} onChange={e => setEmail(e.target.value)} 
                                        variant="filled"
                                        sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                    />
                                </Grid>
                            </Grid>
                            
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, mb: 1, display: 'block' }}>LEAD CATEGORY</Typography>
                                <Select 
                                    fullWidth
                                    value={leadType} 
                                    onChange={e => setLeadType(e.target.value)} 
                                    variant="filled"
                                    sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}
                                >
                                    <MenuItem value="owner">Property Owner</MenuItem>
                                    <MenuItem value="tenant">Tenant</MenuItem>
                                    <MenuItem value="property">Property Asset</MenuItem>
                                    <MenuItem value="company">Corporate / Holding</MenuItem>
                                </Select>
                            </Box>

                            <TextField 
                                fullWidth label="Property Interest / Requirement" 
                                value={propertyInterest} onChange={e => setPropertyInterest(e.target.value)} 
                                variant="filled"
                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                            />
                            
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <TextField 
                                        fullWidth label="Location / Emirate" 
                                        value={location} onChange={e => setLocation(e.target.value)} 
                                        variant="filled"
                                        sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField 
                                        fullWidth label="Budget Range (AED)" 
                                        value={budget} onChange={e => setBudget(e.target.value)} 
                                        variant="filled"
                                        sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                    />
                                </Grid>
                            </Grid>
                            
                            <TextField 
                                fullWidth label="Mission Notes" multiline rows={3} 
                                value={notes} onChange={e => setNotes(e.target.value)} 
                                variant="filled"
                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ p: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>ABORT</Button>
                        <Button 
                            type="submit" 
                            variant="contained" 
                            disabled={submitting} 
                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3 }}
                        >
                            {submitting ? <CircularProgress size={20} /> : 'INITIALIZE MISSION'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </BrokerPageFrame>
    );
}
