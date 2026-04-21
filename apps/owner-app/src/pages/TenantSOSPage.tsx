// apps/owner-app/src/pages/TenantSOSPage.tsx
import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, TextField, Button, 
    Paper, Grid, MenuItem, Select, InputLabel, FormControl, 
    Stack, Alert, CircularProgress, Chip, Divider, alpha
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
    AlertTriangle, Home, Camera, ShieldAlert, Send, ArrowLeft, 
    CheckCircle2, MapPin, Navigation, Clock, Phone, MessageSquare, 
    Activity, ShieldCheck, Timer, Wind, Waves, Zap, Bug, Flame 
} from 'lucide-react';
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
    const { t, tx, isRTL } = useLanguage();
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
    const [pastTickets, setPastTickets] = useState<any[]>([]);
    const [distanceInfo, setDistanceInfo] = useState<Record<string, { distance: string, eta: string }>>({});

    useEffect(() => {
        const fetchResidence = async () => {
            if (!user?.uid) return;
            
            try {
                let unitSnap = await getDocs(query(collection(db, "units"), where("tenantId", "==", user.uid)));
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
                }
            } catch (err) {
                console.error("Residence discovery failed:", err);
            } finally {
                setContextLoading(false);
            }
        };
        fetchResidence();
    }, [user]);

    useEffect(() => {
        if (!user?.uid) return;
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('tenantId', '==', user.uid),
            where('status', 'not-in', ['COMPLETED', 'RESOLVED', 'CLOSED']),
            orderBy('status'), 
            limit(5)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tickets = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
            setActiveTickets(tickets);
            tickets.forEach(ticket => {
                if (ticket.status === 'EN_ROUTE' && ticket.techLocation && ticket.propertyLocation?.location) {
                    calculateDistance(ticket.id, ticket.techLocation, ticket.propertyLocation.location);
                }
            });
        }, () => {});

        const pastQ = query(
            collection(db, 'maintenanceTickets'),
            where('tenantId', '==', user.uid),
            where('status', 'in', ['COMPLETED', 'RESOLVED', 'CLOSED']),
            orderBy('createdAt', 'desc'),
            limit(10)
        );
        const unsubPast = onSnapshot(pastQ, (snapshot) => {
            setPastTickets(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => { unsubscribe(); unsubPast(); };
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

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
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
                source: 'TENANT_APP_SOS_V5'
            });
            setSubmitted(true);
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const renderReportCard = () => (
        <Paper sx={{ p: 4, mb: 6, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3, mb: 3, display: 'block' }}>
                RESIDENCY HEALTH AUDIT
            </Typography>
            <Grid container spacing={4}>
                <Grid item xs={12} md={4}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}><ShieldCheck color={binThemeTokens.gold} /></Box>
                        <Box>
                            <Typography variant="h4" fontWeight="950" color="#FFF">100%</Typography>
                            <Typography variant="caption" color="rgba(255,255,255,0.5)">Safety Index</Typography>
                        </Box>
                    </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}><Timer color={binThemeTokens.gold} /></Box>
                        <Box>
                            <Typography variant="h4" fontWeight="950" color="#FFF">42m</Typography>
                            <Typography variant="caption" color="rgba(255,255,255,0.5)">Avg. Response</Typography>
                        </Box>
                    </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}><Activity color={binThemeTokens.gold} /></Box>
                        <Box>
                            <Typography variant="h4" fontWeight="950" color="#FFF">{activeTickets.length}</Typography>
                            <Typography variant="caption" color="rgba(255,255,255,0.5)">Active SOS</Typography>
                        </Box>
                    </Stack>
                </Grid>
            </Grid>
        </Paper>
    );

    if (submitted) {
        return (
            <Container maxWidth="sm" sx={{ py: 12, textAlign: 'center' }}>
                <Paper sx={{ p: 8, bgcolor: 'rgba(76, 175, 80, 0.05)', border: '1px solid #4CAF50', borderRadius: 10 }}>
                    <CheckCircle2 color="#4CAF50" size={64} style={{ margin: '0 auto' }} />
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#4CAF50', mt: 4, mb: 2 }}>DISPATCH TRIGGERED</Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, mb: 6 }}>
                        Mission parameters received. Sovereign Engine is routing your request.
                    </Typography>
                    <Button variant="contained" fullWidth size="large" onClick={() => setSubmitted(false)} sx={{ bgcolor: '#4CAF50', color: '#FFF', fontWeight: 900, py: 2 }}>{t('sos.return_dash')}</Button>
                </Paper>
            </Container>
        );
    }

    return (
        <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
            {renderReportCard()}

            {activeTickets.length > 0 && (
                <Box sx={{ mb: 8 }}>
                    <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 4, letterSpacing: -1 }}>
                        LIVE OPERATIONS
                    </Typography>
                    <Stack spacing={4}>
                        {activeTickets.map(ticket => (
                            <Paper key={ticket.id} sx={{ p: 0, overflow: 'hidden', borderRadius: 8, bgcolor: 'rgba(22, 22, 24, 0.8)', border: `2px solid ${ticket.status === 'EN_ROUTE' ? binThemeTokens.gold : 'rgba(255,255,255,0.1)'}`, boxShadow: '0 40px 100px rgba(0,0,0,0.5)' }}>
                                <Grid container>
                                    <Grid item xs={12} md={7} sx={{ p: 4 }}>
                                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                                            <Chip label={ticket.status} sx={{ bgcolor: ticket.status === 'EN_ROUTE' ? binThemeTokens.gold : 'rgba(255,255,255,0.1)', color: ticket.status === 'EN_ROUTE' ? '#000' : '#FFF', fontWeight: 900 }} />
                                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>REF: {ticket.id.substring(0,8)}</Typography>
                                        </Stack>
                                        <Typography variant="h4" fontWeight="950" dir="auto" sx={{ color: '#FFF', mb: 2 }}>{ticket.description}</Typography>
                                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />
                                        <Grid container spacing={2}>
                                            <Grid item xs={6}>
                                                <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary }}>SPECIALIST</Typography>
                                                <Typography variant="body1" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{ticket.assignedTechnicianName || 'PENDING'}</Typography>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary }}>TIMING</Typography>
                                                <Typography variant="body1" fontWeight="900" sx={{ color: '#FFF' }}>{ticket.preferredTiming}</Typography>
                                            </Grid>
                                        </Grid>
                                    </Grid>
                                    <Grid item xs={12} md={5} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.03), borderLeft: '1px solid rgba(198,167,94,0.1)', p: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        {ticket.status === 'EN_ROUTE' ? (
                                            <Stack spacing={3} alignItems="center" textAlign="center">
                                                <Box sx={{ position: 'relative' }}><Navigation size={48} color={binThemeTokens.gold} className="animate-pulse" /></Box>
                                                <Box>
                                                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF' }}>{distanceInfo[ticket.id]?.eta || 'Calculating...'}</Typography>
                                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>{distanceInfo[ticket.id]?.distance || '--'} AWAY</Typography>
                                                </Box>
                                            </Stack>
                                        ) : (
                                            <Stack spacing={3} alignItems="center" textAlign="center" sx={{ opacity: 0.5 }}>
                                                <Clock size={48} color={binThemeTokens.textSecondary} />
                                                <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textSecondary }}>PENDING DISPATCH</Typography>
                                            </Stack>
                                        )}
                                    </Grid>
                                </Grid>
                            </Paper>
                        ))}
                    </Stack>
                </Box>
            )}

            <Paper elevation={0} sx={{ p: { xs: 4, md: 6 }, borderRadius: 8, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198, 167, 94, 0.2)', boxShadow: '0 40px 100px rgba(0,0,0,0.5)' }}>
                <form onSubmit={handleSubmit}>
                    <Stack spacing={4}>
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 2 }}>
                                QUICK DISPATCH SHORTCUTS
                            </Typography>
                            <Grid container spacing={2}>
                                {[
                                    { label: 'AC Not Cooling', cat: 'ac_failure', icon: <Wind size={18} /> },
                                    { label: 'Plumbing Leak', cat: 'plumbing', icon: <Waves size={18} /> },
                                    { label: 'Power Outage', cat: 'electrical', icon: <Zap size={18} /> },
                                    { label: 'Pest Incident', cat: 'pest', icon: <Bug size={18} /> },
                                    { label: 'Access Fault', cat: 'security', icon: <ShieldAlert size={18} /> },
                                    { label: 'Water Heater', cat: 'plumbing', icon: <Flame size={18} /> },
                                ].map((shortcut, idx) => (
                                    <Grid item xs={6} sm={4} key={idx}>
                                        <Button
                                            fullWidth variant="outlined"
                                            onClick={() => { setCategory(shortcut.cat); setDescription(shortcut.label); }}
                                            startIcon={shortcut.icon}
                                            sx={{ py: 1.5, borderRadius: 3, borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 700, '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198, 167, 94, 0.05)' } }}
                                        >
                                            {shortcut.label}
                                        </Button>
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>

                        <FormControl fullWidth>
                            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>FAULT CATEGORY</InputLabel>
                            <Select value={category} label="FAULT CATEGORY" onChange={(e) => setCategory(e.target.value)} required sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}>
                                <MenuItem value="ac_failure">AC / HVAC</MenuItem>
                                <MenuItem value="plumbing">Plumbing</MenuItem>
                                <MenuItem value="electrical">Electrical</MenuItem>
                                <MenuItem value="pest">Pest Control</MenuItem>
                                <MenuItem value="security">Security / Access</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl fullWidth>
                            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>PREFERRED TIMING</InputLabel>
                            <Select value={preferredTiming} label="PREFERRED TIMING" onChange={(e) => setPreferredTiming(e.target.value)} required sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}>
                                <MenuItem value="ASAP">ASAP (Emergency)</MenuItem>
                                <MenuItem value="Morning">Morning (8AM - 12PM)</MenuItem>
                                <MenuItem value="Afternoon">Afternoon (12PM - 4PM)</MenuItem>
                                <MenuItem value="Evening">Evening (4PM - 8PM)</MenuItem>
                            </Select>
                        </FormControl>

                        <TextField fullWidth multiline rows={4} label="MISSION DESCRIPTION" value={description} onChange={(e) => setDescription(e.target.value)} required sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' } }} />

                        <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting} sx={{ bgcolor: '#DC2626', color: '#FFF', py: 2.5, fontWeight: 900, borderRadius: 4, '&:hover': { bgcolor: '#B91C1C' } }}>
                            {submitting ? <CircularProgress size={24} color="inherit" /> : 'TRIGGER DISPATCH'}
                        </Button>
                    </Stack>
                </form>
            </Paper>

            <Box sx={{ mt: 10 }}>
                <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mb: 4 }}>MISSION ARCHIVE</Typography>
                <Stack spacing={2}>
                    {pastTickets.map(t => (
                        <Paper key={t.id} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Box>
                                    <Typography variant="body1" fontWeight="900" sx={{ color: '#FFF' }}>{t.description}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'Historical'}</Typography>
                                </Box>
                                <Chip label={t.status} size="small" sx={{ bgcolor: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', fontWeight: 900 }} />
                            </Stack>
                        </Paper>
                    ))}
                    {pastTickets.length === 0 && (
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>No historical missions found.</Typography>
                    )}
                </Stack>
            </Box>
        </Container>
    );
}
