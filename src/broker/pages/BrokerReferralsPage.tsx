import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress, 
    Chip, TextField, MenuItem, Select, Dialog, DialogTitle, 
    DialogContent, DialogActions, alpha, Divider, IconButton, Tooltip 
} from '@mui/material';
import { 
    Building, Plus, MapPin, DollarSign, Calendar, 
    Info, CheckCircle2, AlertCircle, Clock, 
    Building2, User, ChevronRight, Briefcase, FileText
} from 'lucide-react';
import { db, collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

export default function BrokerReferralsPage({ openFormByDefault = false }: { openFormByDefault?: boolean }) {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const [referrals, setReferrals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [openAdd, setOpenAdd] = useState(openFormByDefault);
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [referralType, setReferralType] = useState('property');
    const [clientName, setClientName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [propertyName, setPropertyName] = useState('');
    const [propertyType, setPropertyType] = useState('');
    const [location, setLocation] = useState('');
    const [units, setUnits] = useState('');
    const [estimatedValue, setEstimatedValue] = useState('');
    const [notes, setNotes] = useState('');

    // New states for contract referral
    const [propertiesList, setPropertiesList] = useState<any[]>([]);
    const [selectedPropertyId, setSelectedPropertyId] = useState('');
    const [contractType, setContractType] = useState('annual_lease');
    const [signedDate, setSignedDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        if (openFormByDefault) {
            setOpenAdd(true);
        }
    }, [openFormByDefault]);

    useEffect(() => {
        if (!user?.uid) return;
        const q = query(
            collection(db, 'referrals'), 
            where('brokerId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, (snap) => {
            setReferrals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, [user]);

    // Listen to all properties to populate the dropdown
    useEffect(() => {
        const q = query(collection(db, 'properties'));
        const unsub = onSnapshot(q, (snap) => {
            setPropertiesList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsub();
    }, []);

    const handleAddReferral = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid || !clientName.trim()) return;
        setSubmitting(true);
        try {
            let finalPropertyName = propertyName;
            let finalLocation = location;
            if (referralType === 'contract' && selectedPropertyId) {
                const matchedProp = propertiesList.find(p => p.id === selectedPropertyId);
                if (matchedProp) {
                    finalPropertyName = matchedProp.propertyName || matchedProp.name || '';
                    finalLocation = matchedProp.location || matchedProp.emirate || '';
                }
            }

            const referralData: any = {
                brokerId: user.uid,
                brokerUid: user.uid,
                referralType,
                clientName,
                phone,
                email,
                notes,
                status: 'submitted',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            if (referralType === 'contract') {
                referralData.propertyId = selectedPropertyId;
                referralData.propertyName = finalPropertyName;
                referralData.location = finalLocation;
                referralData.contractType = contractType;
                referralData.estimatedValue = estimatedValue;
                referralData.signedDate = signedDate;
                referralData.commissionStatus = 'PENDING';
                referralData.commissionRate = 0.02;
                referralData.commissionAmount = Number(estimatedValue) * 0.02;
            } else {
                referralData.propertyName = propertyName;
                referralData.propertyType = propertyType;
                referralData.location = location;
                referralData.units = units;
                referralData.estimatedValue = estimatedValue;
            }

            const refRef = await addDoc(collection(db, 'referrals'), referralData);

            await addDoc(collection(db, 'auditLogs'), {
                action: 'BROKER_REFERRAL_SUBMITTED',
                referralId: refRef.id,
                brokerId: user.uid,
                timestamp: serverTimestamp()
            });

            // Create a pending commission record as well!
            if (referralType === 'contract') {
                await addDoc(collection(db, 'broker_commissions'), {
                    brokerId: user.uid,
                    brokerUid: user.uid,
                    brokerName: user.displayName || 'Partner',
                    amount: Number(estimatedValue) * 0.02,
                    percentage: 2,
                    status: 'PENDING',
                    linkedReferralId: refRef.id,
                    linkedReferralName: clientName,
                    linkedProperty: finalPropertyName,
                    propertyName: finalPropertyName,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }

            setOpenAdd(false);
            // Reset
            setClientName(''); setPhone(''); setEmail(''); setPropertyName(''); setPropertyType(''); setLocation(''); setUnits(''); setEstimatedValue(''); setNotes('');
            setSelectedPropertyId(''); setContractType('annual_lease'); setSignedDate(new Date().toISOString().split('T')[0]);
        } catch (err) {
            console.error("Failed to add referral", err);
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'approved': return { color: '#10b981', icon: <CheckCircle2 size={14} />, label: 'APPROVED' };
            case 'rejected': return { color: '#ef4444', icon: <AlertCircle size={14} />, label: 'REJECTED' };
            case 'under_review': return { color: binThemeTokens.gold, icon: <Clock size={14} />, label: 'UNDER REVIEW' };
            default: return { color: '#3b82f6', icon: <Clock size={14} />, label: 'SUBMITTED' };
        }
    };

    return (
        <BrokerPageFrame
            title="Referral Network"
            subtitle="Submit and monitor owner or property referrals"
            loading={loading}
            actions={
                <Button 
                    variant="contained" 
                    startIcon={<Plus size={18} />}
                    onClick={() => setOpenAdd(true)}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3, boxShadow: `0 10px 20px -5px ${alpha(binThemeTokens.gold, 0.4)}` }}
                >
                    SUBMIT REFERRAL
                </Button>
            }
        >
            {referrals.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: binThemeTokens.softCanvas, borderRadius: 6, border: '1px dashed #E5E7EB' }}>
                    <Building2 size={48} color="#9CA3AF" />
                    <Typography variant="h6" sx={{ color: '#9CA3AF', fontWeight: 900, mt: 2 }}>
                        NO REFERRALS RECORDED
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#9CA3AF', mt: 1 }}>
                        Start by clicking the "Submit Referral" button above.
                    </Typography>
                </Paper>
            ) : (
                <Stack spacing={3}>
                    {referrals.map(ref => {
                        const status = getStatusConfig(ref.status);
                        return (
                            <Paper key={ref.id} sx={{
                                p: 0,
                                bgcolor: binThemeTokens.softCanvas,
                                borderRadius: 6,
                                border: '1px solid #E5E7EB',
                                overflow: 'hidden',
                                transition: 'all 0.3s ease',
                                '&:hover': { borderColor: alpha(status.color, 0.3), bgcolor: '#FFFFFF' }
                            }}>
                                <Grid container>
                                    {/* Left Status Bar */}
                                    <Grid item xs={1} md={0.5} sx={{ bgcolor: alpha(status.color, 0.1), borderRight: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Box sx={{ transform: 'rotate(-90deg)', whiteSpace: 'nowrap', color: status.color, fontWeight: 950, fontSize: '0.6rem', letterSpacing: 2 }}>
                                            {status.label}
                                        </Box>
                                    </Grid>

                                    {/* Main Content */}
                                    <Grid item xs={11} md={11.5} sx={{ p: 4 }}>
                                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3}>
                                            <Box sx={{ flex: 1 }}>
                                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                                                    <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary}>{ref.clientName}</Typography>
                                                    <Chip
                                                        label={ref.referralType.toUpperCase()}
                                                        size="small"
                                                        sx={{ bgcolor: '#F3F4F6', color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.6rem' }}
                                                    />
                                                </Stack>
                                                <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Building size={14} /> {ref.propertyName || 'Unnamed Asset'} • {ref.location || 'Unknown Location'}
                                                </Typography>
                                            </Box>

                                            <Stack direction="row" spacing={4} sx={{ minWidth: 400 }}>
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 1 }}>EST. VALUE</Typography>
                                                    <Typography variant="body1" fontWeight="950" color={binThemeTokens.textPrimary}>
                                                        {ref.estimatedValue ? `AED ${ref.estimatedValue}` : 'N/A'}
                                                    </Typography>
                                                </Box>
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 1 }}>SUBMITTED</Typography>
                                                    <Typography variant="body1" fontWeight="950" color={binThemeTokens.textPrimary}>
                                                        {ref.createdAt?.toDate ? ref.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                                    </Typography>
                                                </Box>
                                                <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                    <Tooltip title="View Referral Audit">
                                                        <IconButton sx={{ bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 3, color: binThemeTokens.textSecondary }}>
                                                            <FileText size={20} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </Stack>
                                        </Stack>

                                        {ref.notes && (
                                            <Box sx={{ mt: 3, p: 2, bgcolor: '#F3F4F6', borderRadius: 3, border: '1px solid #E5E7EB' }}>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>NOTES</Typography>
                                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, mt: 0.5 }}>{ref.notes}</Typography>
                                            </Box>
                                        )}
                                    </Grid>
                                </Grid>
                            </Paper>
                        );
                    })}
                </Stack>
            )}

            {/* ─── ADD REFERRAL DIALOG ────────────────────────────────────────── */}
            <Dialog 
                open={openAdd} 
                onClose={() => setOpenAdd(false)} 
                PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', minWidth: 600 } }}
            >
                <form onSubmit={handleAddReferral}>
                    <DialogTitle sx={{ p: 4, pb: 0, fontWeight: 950, color: binThemeTokens.gold, textTransform: 'uppercase', letterSpacing: 2 }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Building2 size={24} /> Submit New Referral
                        </Stack>
                    </DialogTitle>
                    <DialogContent sx={{ p: 4 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 4, fontWeight: 700 }}>
                            Provide asset or owner details for institutional verification. Approved referrals trigger commission allocation.
                        </Typography>
                        
                        <Stack spacing={3}>
                            <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, mb: 1, display: 'block' }}>REFERRAL TYPE</Typography>
                                <Select 
                                    fullWidth
                                    value={referralType} 
                                    onChange={e => setReferralType(e.target.value)} 
                                    variant="filled"
                                    sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}
                                >
                                    <MenuItem value="owner">Owner / Asset Holder</MenuItem>
                                    <MenuItem value="property">Direct Property Asset</MenuItem>
                                    <MenuItem value="client">VVIP Client / Tenant</MenuItem>
                                    <MenuItem value="contract">Lease Contract Referral</MenuItem>
                                </Select>
                            </Box>

                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                            {referralType === 'contract' ? (
                                <>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, mb: 1, display: 'block' }}>PROPERTY ASSET *</Typography>
                                        <Select 
                                            fullWidth
                                            value={selectedPropertyId} 
                                            onChange={e => setSelectedPropertyId(e.target.value)} 
                                            variant="filled"
                                            required
                                            sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}
                                        >
                                            {propertiesList.length === 0 ? (
                                                <MenuItem value="" disabled>No available properties found</MenuItem>
                                            ) : (
                                                propertiesList.map(p => (
                                                    <MenuItem key={p.id} value={p.id}>{p.propertyName || p.name || 'Unnamed Property'}</MenuItem>
                                                ))
                                            )}
                                        </Select>
                                    </Box>

                                    <TextField 
                                        fullWidth label="Client Full Name *" required 
                                        value={clientName} onChange={e => setClientName(e.target.value)} 
                                        variant="filled"
                                        sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                    />

                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <TextField 
                                                fullWidth label="Client Email *" required type="email"
                                                value={email} onChange={e => setEmail(e.target.value)} 
                                                variant="filled"
                                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                            />
                                        </Grid>
                                        <Grid item xs={6}>
                                            <TextField 
                                                fullWidth label="Client Phone *" required
                                                value={phone} onChange={e => setPhone(e.target.value)} 
                                                variant="filled"
                                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                            />
                                        </Grid>
                                    </Grid>

                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, mb: 1, display: 'block' }}>CONTRACT TYPE *</Typography>
                                                <Select 
                                                    fullWidth
                                                    value={contractType} 
                                                    onChange={e => setContractType(e.target.value)} 
                                                    variant="filled"
                                                    sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}
                                                >
                                                    <MenuItem value="annual_lease">Annual Lease</MenuItem>
                                                    <MenuItem value="short_term">Short Term Lease</MenuItem>
                                                    <MenuItem value="commercial_lease">Commercial Lease</MenuItem>
                                                    <MenuItem value="property_management">Property Management</MenuItem>
                                                </Select>
                                            </Box>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                                <TextField 
                                                    fullWidth label="Est. Annual Value (AED) *" required type="number"
                                                    value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} 
                                                    variant="filled"
                                                    sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                                />
                                            </Box>
                                        </Grid>
                                    </Grid>

                                    <TextField 
                                        fullWidth label="Signed Date *" required type="date"
                                        value={signedDate} onChange={e => setSignedDate(e.target.value)} 
                                        variant="filled"
                                        InputLabelProps={{ shrink: true }}
                                        sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                    />
                                </>
                            ) : (
                                <>
                                    <TextField 
                                        fullWidth label="Client / Owner Full Name *" required 
                                        value={clientName} onChange={e => setClientName(e.target.value)} 
                                        variant="filled"
                                        sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                    />

                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <TextField 
                                                fullWidth label="Client Email" type="email"
                                                value={email} onChange={e => setEmail(e.target.value)} 
                                                variant="filled"
                                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                            />
                                        </Grid>
                                        <Grid item xs={6}>
                                            <TextField 
                                                fullWidth label="Client Phone" 
                                                value={phone} onChange={e => setPhone(e.target.value)} 
                                                variant="filled"
                                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                            />
                                        </Grid>
                                    </Grid>

                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <TextField 
                                                fullWidth label="Property Name / Asset ID" 
                                                value={propertyName} onChange={e => setPropertyName(e.target.value)} 
                                                variant="filled"
                                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                            />
                                        </Grid>
                                        <Grid item xs={6}>
                                            <TextField 
                                                fullWidth label="Asset Type (e.g. Penthouse, Commercial)" 
                                                value={propertyType} onChange={e => setPropertyType(e.target.value)} 
                                                variant="filled"
                                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                            />
                                        </Grid>
                                    </Grid>

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
                                                fullWidth label="Estimated Valuation (AED)" 
                                                value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} 
                                                variant="filled"
                                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                                            />
                                        </Grid>
                                    </Grid>
                                </>
                            )}
                            
                            <TextField 
                                fullWidth label="Supporting Details / Notes" multiline rows={3} 
                                value={notes} onChange={e => setNotes(e.target.value)} 
                                variant="filled"
                                sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} 
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ p: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
                        <Button 
                            type="submit" 
                            variant="contained" 
                            disabled={submitting} 
                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3 }}
                        >
                            {submitting ? <CircularProgress size={20} /> : 'INITIALIZE REFERRAL'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </BrokerPageFrame>
    );
}
