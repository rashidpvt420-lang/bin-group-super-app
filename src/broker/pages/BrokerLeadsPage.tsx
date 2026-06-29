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

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const clean = (value: unknown) => String(value || '').trim();
const BROKER_COMMISSION_RATE = 0.10;
const numericAmount = (value: unknown) => {
    const raw = String(value || '').replace(/[^0-9.]/g, '');
    const amount = Number(raw || 0);
    return Number.isFinite(amount) ? amount : 0;
};

type BrokerLeadsPageProps = {
    openFormByDefault?: boolean;
};

export default function BrokerLeadsPage({ openFormByDefault = false }: BrokerLeadsPageProps) {
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
        if (openFormByDefault) setOpenAdd(true);
    }, [openFormByDefault]);

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

    const buildAttributionPacket = (leadId: string) => {
        const brokerId = String(user?.uid || '').trim();
        const leadTypeValue = clean(leadType).toLowerCase() || 'owner';
        return {
            attributionId: `broker_lead_${brokerId}_${leadId}`,
            attributionSource: 'BROKER_PORTAL_LEAD',
            sourceChannel: 'broker_portal',
            brokerId,
            brokerUid: brokerId,
            brokerEmail: normalizeEmail(user?.email),
            brokerName: clean(user?.displayName || user?.email || 'Broker Partner'),
            brokerDisplayName: clean(user?.displayName || 'Broker Partner'),
            broughtByRole: 'broker',
            broughtByUid: brokerId,
            broughtByEmail: normalizeEmail(user?.email),
            leadType: leadTypeValue,
            leadCategory: leadTypeValue,
            attributionProof: {
                leadName: clean(leadName),
                phone: clean(phone),
                email: normalizeEmail(email),
                propertyInterest: clean(propertyInterest),
                location: clean(location),
                budget: clean(budget),
                capturedFrom: 'broker_leads_page',
            },
        };
    };

    const handleAddLead = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid || !leadName.trim()) return;
        setSubmitting(true);
        try {
            const tempLeadId = `pending_${Date.now()}`;
            const attribution = buildAttributionPacket(tempLeadId);
            const budgetAmount = numericAmount(budget);
            const leadPayload = {
                ...attribution,
                leadName: clean(leadName),
                phone: clean(phone),
                email: normalizeEmail(email),
                propertyInterest: clean(propertyInterest),
                location: clean(location),
                budget: clean(budget),
                budgetAmount,
                notes: clean(notes),
                status: 'new',
                lifecycleStatus: 'LEAD_CAPTURED',
                commissionEligible: false,
                commissionStatus: 'NOT_CONVERTED',
                commissionRate: BROKER_COMMISSION_RATE,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            const leadRef = await addDoc(collection(db, 'brokerLeads'), leadPayload);
            await updateDoc(doc(db, 'brokerLeads', leadRef.id), {
                attributionId: `broker_lead_${user.uid}_${leadRef.id}`,
                sourceLeadId: leadRef.id,
                updatedAt: serverTimestamp(),
            });
            const auditPayload = {
                actorId: user.uid,
                actorRole: 'broker',
                action: 'BROKER_LEAD_CREATED',
                targetType: 'BROKER_LEAD',
                targetId: leadRef.id,
                module: 'broker_leads',
                status: 'RECORDED',
                brokerId: user.uid,
                brokerEmail: normalizeEmail(user.email),
                attributionId: `broker_lead_${user.uid}_${leadRef.id}`,
                metadata: {
                    leadType: leadPayload.leadType,
                    leadName: leadPayload.leadName,
                    propertyInterest: leadPayload.propertyInterest,
                    location: leadPayload.location,
                    budgetAmount,
                },
                createdAt: serverTimestamp(),
            };
            await Promise.all([
                addDoc(collection(db, 'audit_logs'), auditPayload),
                addDoc(collection(db, 'auditLogs'), { ...auditPayload, timestamp: serverTimestamp() }),
            ]);
            setOpenAdd(false);
            // Reset form
            setLeadName(''); setPhone(''); setEmail(''); setPropertyInterest(''); setLocation(''); setBudget(''); setNotes('');
        } catch (err) {
            console.error("Failed to add lead", err);
        } finally {
            setSubmitting(false);
        }
    };

    const updateLeadStatus = async (lead: any, newStatus: string) => {
        try {
            const leadId = String(lead?.id || '');
            const statusPayload: Record<string, any> = {
                status: newStatus,
                lifecycleStatus: newStatus === 'converted' ? 'CONVERTED_TO_BIN_GROUP_OPPORTUNITY' : `LEAD_${String(newStatus).toUpperCase()}`,
                updatedAt: serverTimestamp()
            };

            if (newStatus === 'converted') {
                statusPayload.convertedAt = serverTimestamp();
                statusPayload.commissionEligible = true;
                statusPayload.commissionStatus = 'PENDING_REVIEW';
                statusPayload.commissionCreationStatus = 'PENDING_ADMIN_CONTRACT_MATCH';
                statusPayload.requiresAdminAttribution = true;
                statusPayload.adminAttributionRequiredAt = serverTimestamp();
            }

            await updateDoc(doc(db, 'brokerLeads', leadId), statusPayload);

            const attributionId = lead.attributionId || `broker_lead_${user?.uid}_${leadId}`;
            const budgetAmount = numericAmount(lead.budgetAmount || lead.budget);
            await addDoc(collection(db, 'audit_logs'), {
                actorId: user?.uid || lead.brokerId || '',
                actorRole: 'broker',
                action: newStatus === 'converted' ? 'BROKER_LEAD_CONVERTED' : 'BROKER_LEAD_STATUS_UPDATED',
                targetType: 'BROKER_LEAD',
                targetId: leadId,
                module: 'broker_leads',
                status: 'RECORDED',
                brokerId: user?.uid || lead.brokerId || '',
                attributionId,
                metadata: { previousStatus: lead.status, newStatus, commissionCandidate: newStatus === 'converted' },
                createdAt: serverTimestamp(),
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
            default: return binThemeTokens.textSecondary;
        }
    };

    const filteredLeads = leads.filter(l => 
        String(l.leadName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(l.propertyInterest || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(l.attributionId || '').toLowerCase().includes(searchTerm.toLowerCase())
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
            <Paper sx={{ p: 2, mb: 4, bgcolor: binThemeTokens.softCanvas, border: '1px solid #E5E7EB', borderRadius: 4 }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                    <TextField
                        fullWidth
                        placeholder="Search leads by name, interest, or attribution ID..."
                        variant="standard"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            disableUnderline: true,
                            startAdornment: <Search size={18} color="#9CA3AF" style={{ marginRight: 12 }} />,
                            sx: { color: binThemeTokens.textPrimary, fontWeight: 800, px: 2 }
                        }}
                    />
                    <Divider orientation="vertical" flexItem sx={{ borderColor: '#E5E7EB' }} />
                    <IconButton sx={{ color: binThemeTokens.textSecondary }}><Filter size={20} /></IconButton>
                </Stack>
            </Paper>

            {/* ─── LEADS GRID ────────────────────────────────────────────────── */}
            {filteredLeads.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: binThemeTokens.softCanvas, borderRadius: 6, border: '1px dashed #E5E7EB' }}>
                    <Users size={48} color="#9CA3AF" />
                    <Typography variant="h6" sx={{ color: '#9CA3AF', fontWeight: 900, mt: 2 }}>
                        NO ACTIVE LEADS IN PIPELINE
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#9CA3AF', mt: 1 }}>
                        Start by clicking the "Add New Lead" button above.
                    </Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {filteredLeads.map(lead => (
                        <Grid item xs={12} md={6} lg={4} key={lead.id}>
                            <Paper sx={{
                                p: 0,
                                bgcolor: binThemeTokens.softCanvas,
                                borderRadius: 6,
                                border: '1px solid #E5E7EB',
                                overflow: 'hidden',
                                transition: 'all 0.3s ease',
                                '&:hover': { transform: 'translateY(-4px)', borderColor: alpha(getStatusColor(lead.status), 0.3), boxShadow: `0 10px 30px -10px ${alpha(getStatusColor(lead.status), 0.2)}` }
                            }}>
                                {/* Status Header */}
                                <Box sx={{ p: 1, bgcolor: alpha(getStatusColor(lead.status), 0.05), borderBottom: '1px solid #F1F2F4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 3 }}>
                                    <Chip
                                        label={String(lead.status || '').toUpperCase()}
                                        size="small"
                                        sx={{ bgcolor: alpha(getStatusColor(lead.status), 0.1), color: getStatusColor(lead.status), fontWeight: 950, fontSize: '0.65rem' }}
                                    />
                                    <Typography variant="caption" sx={{ color: '#9CA3AF', fontWeight: 800 }}>
                                        {lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                    </Typography>
                                </Box>

                                <Box sx={{ p: 3 }}>
                                    <Stack spacing={2}>
                                        <Box>
                                            <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary}>{lead.leadName}</Typography>
                                            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                                                <Chip label={String(lead.leadType || 'lead').toUpperCase()} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.6rem', color: binThemeTokens.textSecondary, borderColor: '#E5E7EB' }} />
                                                <Chip label={lead.commissionEligible ? 'COMMISSION CANDIDATE' : 'ATTRIBUTED'} size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: lead.commissionEligible ? alpha('#10b981', 0.1) : alpha(binThemeTokens.gold, 0.1), color: lead.commissionEligible ? '#10b981' : binThemeTokens.gold, fontWeight: 900 }} />
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

                                        <Divider sx={{ borderColor: '#F1F2F4' }} />

                                        <Box>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1 }}>INTEREST / BUDGET</Typography>
                                            <Typography variant="body2" fontWeight="800" color={binThemeTokens.textPrimary} sx={{ mt: 0.5 }}>
                                                {lead.propertyInterest || 'General Interest'}
                                                {lead.budget && <Typography component="span" sx={{ color: '#10b981', ml: 1 }}>• AED {lead.budget}</Typography>}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mt: 1, wordBreak: 'break-all' }}>
                                                ATTRIBUTION: {lead.attributionId || `broker_lead_${user?.uid}_${lead.id}`}
                                            </Typography>
                                        </Box>

                                        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                                            <Select
                                                fullWidth
                                                size="small"
                                                value={lead.status}
                                                onChange={(e) => updateLeadStatus(lead, e.target.value)}
                                                sx={{
                                                    bgcolor: '#FFFFFF',
                                                    color: binThemeTokens.textPrimary,
                                                    fontWeight: 900,
                                                    fontSize: '0.75rem',
                                                    borderRadius: 2,
                                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E5E7EB' }
                                                }}
                                            >
                                                <MenuItem value="new">NEW</MenuItem>
                                                <MenuItem value="contacted">CONTACTED</MenuItem>
                                                <MenuItem value="viewing">VIEWING</MenuItem>
                                                <MenuItem value="negotiation">NEGOTIATION</MenuItem>
                                                <MenuItem value="converted">CONVERTED</MenuItem>
                                                <MenuItem value="rejected">REJECTED</MenuItem>
                                            </Select>
                                            <Tooltip title="View Attribution Details">
                                                <IconButton sx={{ bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 2, color: binThemeTokens.textSecondary }}>
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
                            Each lead receives a broker attribution ID. Converted leads generate a pending commission trail for admin review.
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
