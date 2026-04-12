// apps/owner-app/src/pages/TenantSOSPage.tsx
import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, TextField, Button, 
    Paper, Grid, MenuItem, Select, InputLabel, FormControl, 
    Stack, Alert, CircularProgress, Chip, Divider, alpha
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Home, Camera, ShieldAlert, Send, ArrowLeft, CheckCircle2, MapPin, Navigation, Clock, Phone, MessageSquare } from 'lucide-react';
import { db, collection, addDoc, serverTimestamp, getDoc, doc, getDocs, query, where, updateDoc, onSnapshot, orderBy, limit } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';

interface UnitData {
    id: string;
    propertyId?: string;
    unitNumber?: string;
    floorNumber?: string;
    tenantId?: string;
    propertyName?: string;
    address?: string;
    emirate?: string;
    serviceZone?: string;
}

export default function TenantSOSPage() {
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const { user, propertyId: sessionPropertyId } = useRole();
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [preferredTiming, setPreferredTiming] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    
    // V4 Auto-Pulled Context
    const [emirate, setEmirate] = useState('');
    const [serviceZone, setServiceZone] = useState('');
    const [physicalAddress, setPhysicalAddress] = useState('');
    const [propertyData, setPropertyData] = useState<any>(null);
    const [unitData, setUnitData] = useState<UnitData | null>(null);
    const [contextLoading, setContextLoading] = useState(true);

    // V5 Live Ops State
    const [activeTickets, setActiveTickets] = useState<any[]>([]);
    const [distanceInfo, setDistanceInfo] = useState<Record<string, { distance: string, eta: string }>>({});

    useEffect(() => {
        const fetchResidence = async () => {
            if (!user?.uid) return;
            
            try {
                // First query by explicit ID if it exists
                let unitSnap = await getDocs(query(collection(db, "units"), where("tenantId", "==", user.uid)));
                
                // If not found, natively fallback to email mapped during Admin Intake
                if (unitSnap.empty && user.email) {
                    unitSnap = await getDocs(query(collection(db, "units"), where("tenantEmail", "==", user.email.toLowerCase())));
                }
                
                if (!unitSnap.empty) {
                    const docData = unitSnap.docs[0].data();
                    const uData: UnitData = { id: unitSnap.docs[0].id, ...docData };
                    setUnitData(uData);

                    if (uData.propertyId) {
                        const propRef = doc(db, "properties", uData.propertyId);
                        const propSnap = await getDoc(propRef);
                        if (propSnap.exists()) {
                            const pData = propSnap.data();
                            setPropertyData(pData);
                            setEmirate(pData.emirate || '');
                            setServiceZone(pData.serviceZone || '');
                            setPhysicalAddress(pData.address || '');
                        }
                    }
                } else {
                    // Fallback to user profile if no unit explicitly linked
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        const uProfile = userDoc.data();
                        setEmirate(uProfile.emirate || '');
                        setServiceZone(uProfile.serviceZone || '');
                    }
                }
            } catch (err) {
                console.error("📍 [SOS-BOOT] Residence discovery failed:", err);
            } finally {
                setContextLoading(false);
            }
        };
        fetchResidence();
    }, [user]);

    // [V5] Live Active Ticket Subscription
    useEffect(() => {
        if (!user?.uid) return;
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('tenantId', '==', user.uid),
            where('status', 'not-in', ['COMPLETED', 'RESOLVED', 'CLOSED']),
            orderBy('status'), // This is a bit tricky with not-in, usually requires composite index
            limit(5)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tickets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setActiveTickets(tickets);
            
            // Calculate distances for all en-route tickets
            tickets.forEach(ticket => {
                if (ticket.status === 'EN_ROUTE' && ticket.techLocation && ticket.propertyLocation?.location) {
                    calculateDistance(ticket.id, ticket.techLocation, ticket.propertyLocation.location);
                }
            });
        }, (err) => {
            console.warn("V5 SOS Subscription Fallback:", err);
            // Simple fallback if composite index is missing
            const fallbackQ = query(collection(db, 'maintenanceTickets'), where('tenantId', '==', user.uid), limit(5));
            onSnapshot(fallbackQ, (snap) => {
                const filtered = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((t: any) => !['COMPLETED', 'RESOLVED', 'CLOSED'].includes(t.status));
                setActiveTickets(filtered);
            });
        });
        return () => unsubscribe();
    }, [user]);

    const calculateDistance = (ticketId: string, techLoc: any, propLoc: any) => {
        const R = 6371;
        const dLat = (propLoc.lat - techLoc.lat) * Math.PI / 180;
        const dLon = (propLoc.lng - techLoc.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(techLoc.lat * Math.PI / 180) * Math.cos(propLoc.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c;
        const distStr = d < 1 ? `${(d * 1000).toFixed(0)}m` : `${d.toFixed(1)}km`;
        const etaMin = Math.ceil(d * 5); 
        setDistanceInfo(prev => ({ ...prev, [ticketId]: { distance: distStr, eta: `${etaMin}-${etaMin + 2} mins` } }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!category || !description || !user) return;

        setSubmitting(true);
        try {
            await addDoc(collection(db, 'maintenanceTickets'), {
                tenantId: user.uid,
                tenantName: user.displayName || 'Anonymous Tenant',
                tenantEmail: user.email || '',
                trade: category.toUpperCase(),
                description,
                preferredTiming: preferredTiming || 'ASAP',
                hasImage: !!image,
                status: 'OPEN',
                priority: (category === 'ac_failure' || category === 'plumbing' || category === 'electrical') ? 'EMERGENCY' : 'MEDIUM',
                propertyId: unitData?.propertyId || sessionPropertyId || 'UNASSOCIATED',
                unitId: unitData?.id || '',
                unitNumber: unitData?.unitNumber || '',
                floorNumber: unitData?.floorNumber || '',
                
                // V4 AUTOPULLED GEO-CONTEXT
                emirate,
                serviceZone,
                address: physicalAddress,
                propertyName: propertyData?.name || propertyData?.propertyName || 'Assigned Property',
                propertyLocation: {
                    address: physicalAddress,
                    propertyName: propertyData?.name || propertyData?.propertyName || 'Assigned Property',
                    unitNumber: unitData?.unitNumber || '',
                    location: propertyData?.location || null
                },

                createdAt: serverTimestamp(),
                source: 'TENANT_APP_SOS_V4'
            });
            setSubmitted(true);
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <Container maxWidth="sm" sx={{ py: 12, textAlign: 'center' }}>
                <Paper sx={{ p: 8, bgcolor: 'rgba(76, 175, 80, 0.05)', border: '1px solid #4CAF50', borderRadius: 10 }}>
                    <CheckCircle2 color="#4CAF50" size={64} style={{ margin: '0 auto' }} />
                    <Typography variant="h3" fontWeight="900" sx={{ color: '#4CAF50', mt: 4, mb: 2 }}>{t('sos.success_title')}</Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, mb: 6 }}>
                        {t('sos.success_subtitle')}
                    </Typography>
                    <Button variant="contained" fullWidth size="large" onClick={() => setSubmitted(false)} sx={{ bgcolor: '#4CAF50', color: '#FFF', fontWeight: 900, py: 2 }}>{t('sos.return_dash')}</Button>
                </Paper>
            </Container>
        );
    }

    return (
        <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
            {/* [V5] ACTIVE DISPATCH MONITOR */}
            {activeTickets.length > 0 && (
                <Box sx={{ mb: 8 }}>
                    <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 4, letterSpacing: -1 }}>
                        {t('tech.live_ops')} — {t('dash.terminal')}
                    </Typography>
                    <Stack spacing={4}>
                        {activeTickets.map(ticket => (
                            <Paper key={ticket.id} sx={{ p: 0, overflow: 'hidden', borderRadius: 8, bgcolor: 'rgba(22, 22, 24, 0.8)', border: `2px solid ${ticket.status === 'EN_ROUTE' ? binThemeTokens.gold : 'rgba(255,255,255,0.1)'}`, boxShadow: '0 40px 100px rgba(0,0,0,0.5)' }}>
                                <Grid container>
                                    <Grid item xs={12} md={7} sx={{ p: 4 }}>
                                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                                            <Chip 
                                                label={ticket.status.replace('_', ' ')} 
                                                sx={{ bgcolor: ticket.status === 'EN_ROUTE' ? binThemeTokens.gold : 'rgba(255,255,255,0.1)', color: ticket.status === 'EN_ROUTE' ? '#000' : '#FFF', fontWeight: 900 }} 
                                            />
                                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>REF: {ticket.id.substring(0,8)}</Typography>
                                        </Stack>
                                        <Typography variant="h4" fontWeight="900" sx={{ color: '#FFF', mb: 2 }}>{ticket.description}</Typography>
                                        
                                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />
                                        
                                        <Grid container spacing={2}>
                                            <Grid item xs={6}>
                                                <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary }}>{t('status.specialist')}</Typography>
                                                <Typography variant="body1" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{ticket.assignedTechnicianName || t('status.pending')}</Typography>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary }}>{t('sos.timing_label')}</Typography>
                                                <Typography variant="body1" fontWeight="900" sx={{ color: '#FFF' }}>{ticket.preferredTiming}</Typography>
                                            </Grid>
                                        </Grid>
                                    </Grid>

                                    <Grid item xs={12} md={5} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.03), borderLeft: '1px solid rgba(198,167,94,0.1)', p: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        {ticket.status === 'EN_ROUTE' ? (
                                            <Stack spacing={3} alignItems="center" textAlign="center">
                                                <Box sx={{ position: 'relative' }}>
                                                    <Navigation size={48} color={binThemeTokens.gold} className="animate-pulse" />
                                                </Box>
                                                <Box>
                                                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF' }}>{distanceInfo[ticket.id]?.eta || 'Calculating...'}</Typography>
                                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>{distanceInfo[ticket.id]?.distance || '--'} AWAY</Typography>
                                                </Box>
                                                <Button 
                                                    fullWidth 
                                                    variant="contained" 
                                                    startIcon={<Phone size={18} />}
                                                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, py: 2, borderRadius: 3 }}
                                                >
                                                    {t('tech.notif_link')}
                                                </Button>
                                            </Stack>
                                        ) : (
                                            <Stack spacing={3} alignItems="center" textAlign="center" sx={{ opacity: 0.5 }}>
                                                <Clock size={48} color={binThemeTokens.textSecondary} />
                                                <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textSecondary }}>{t('status.pending_dispatch')}</Typography>
                                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>Sovereign Engine is locating the nearest certified specialist.</Typography>
                                            </Stack>
                                        )}
                                    </Grid>
                                </Grid>
                            </Paper>
                        ))}
                    </Stack>
                    <Divider sx={{ my: 8, borderColor: 'rgba(255,255,255,0.1)' }} />
                </Box>
            )}

            <Box sx={{ mb: 6 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                    <ShieldAlert color="#DC2626" size={24} />
                    <Typography variant="overline" sx={{ color: '#DC2626', fontWeight: 900, letterSpacing: 3 }}>{t('sos.emergency_protocol')}</Typography>
                </Stack>
                <Typography variant="h3" fontWeight="900" sx={{ color: '#FFFFFF', letterSpacing: -1, mb: 1 }}>{t('sos.title')}</Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>{t('sos.subtitle')}</Typography>
            </Box>

            <Paper elevation={0} sx={{ p: { xs: 4, md: 6 }, borderRadius: 8, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(220, 38, 38, 0.2)', boxShadow: '0 40px 100px rgba(0,0,0,0.5)', position: 'relative', zIndex: 1 }}>
                {contextLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress sx={{ color: '#DC2626' }} />
                    </Box>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <Stack spacing={4}>
                            
                            {/* V4 AUTOPULLED CONTEXT DISPLAY */}
                            <Box sx={{ p: 3, borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(0,0,0,0.4)' }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                                    <MapPin size={14} style={{ marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }} /> 
                                    {t('sos.location_locked')}
                                </Typography>
                                <Typography variant="body1" sx={{ color: '#FFF', mt: 1, fontWeight: 700 }}>
                                    {propertyData?.name || propertyData?.propertyName || 'Linked Property'} - {t('field.units')} {unitData?.unitNumber || 'N/A'} ({t('field.floors')} {unitData?.floorNumber || 'N/A'})
                                </Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5 }}>
                                    {physicalAddress} • {serviceZone}, {emirate}
                                </Typography>
                            </Box>

                            <FormControl fullWidth variant="outlined">
                                <InputLabel sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('sos.fault_category')}</InputLabel>
                                <Select 
                                    value={category} 
                                    label={t('sos.fault_category')} 
                                    onChange={(e) => setCategory(e.target.value)}
                                    required
                                    sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', color: '#FFFFFF' }}
                                >
                                    <MenuItem value="ac_failure">{t('sos.cat.ac')}</MenuItem>
                                    <MenuItem value="plumbing">{t('sos.cat.plumbing')}</MenuItem>
                                    <MenuItem value="electrical">{t('sos.cat.electrical')}</MenuItem>
                                    <MenuItem value="security">{t('sos.cat.security')}</MenuItem>
                                </Select>
                            </FormControl>

                            <FormControl fullWidth variant="outlined">
                                <InputLabel sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('sos.timing_label')}</InputLabel>
                                <Select 
                                    value={preferredTiming} 
                                    label={t('sos.timing_label')} 
                                    onChange={(e) => setPreferredTiming(e.target.value)}
                                    required
                                    sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', color: '#FFFFFF' }}
                                >
                                    <MenuItem value="ASAP">{t('sos.asap')}</MenuItem>
                                    <MenuItem value="Morning">{t('sos.morning')}</MenuItem>
                                    <MenuItem value="Afternoon">{t('sos.afternoon')}</MenuItem>
                                    <MenuItem value="Evening">{t('sos.evening')}</MenuItem>
                                </Select>
                            </FormControl>

                            <TextField 
                                fullWidth 
                                multiline 
                                rows={4} 
                                label={t('sos.mission_description')} 
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                required
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)' } }}
                            />

                            <Box sx={{ p: 2, border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 4, textAlign: 'center' }}>
                                <Box
                                    component="input"
                                    accept="image/*"
                                    sx={{ display: 'none' }}
                                    id="icon-button-file"
                                    type="file"
                                    onChange={(e: any) => {
                                        if (e.target.files && e.target.files[0]) setImage(e.target.files[0]);
                                    }}
                                />
                                <label htmlFor="icon-button-file">
                                    <Button variant="outlined" component="span" startIcon={<Camera size={20} />} sx={{ color: binThemeTokens.gold, borderColor: 'rgba(198,167,94,0.3)', borderRadius: 100, px: 3 }}>
                                        {image ? t('sos.photo_attached') : t('sos.attach_photo')}
                                    </Button>
                                </label>
                                {image && <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#4CAF50' }}>{image.name}</Typography>}
                            </Box>

                            <Button 
                                type="submit" 
                                variant="contained" 
                                size="large" 
                                fullWidth 
                                disabled={submitting}
                                sx={{ bgcolor: '#DC2626', color: '#FFFFFF', py: 2.5, fontWeight: 900, borderRadius: 4, boxShadow: '0 10px 30px rgba(220, 38, 38, 0.3)' }}
                            >
                                {submitting ? <CircularProgress size={24} color="inherit" /> : <><Send size={20} style={{ marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }} /> {t('sos.trigger_btn')}</>}
                            </Button>
                        </Stack>
                    </form>
                )}
            </Paper>
        </Container>
    );
}
