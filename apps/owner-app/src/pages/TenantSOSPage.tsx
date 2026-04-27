// apps/owner-app/src/pages/TenantSOSPage.tsx
import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, TextField, Button, 
    Paper, Grid, MenuItem, Select, InputLabel, FormControl, 
    Stack, Alert, CircularProgress, Chip, Divider, alpha
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
    AlertTriangle, Home, Camera, ShieldAlert, Send, ArrowLeft, ArrowRight, Key,
    CheckCircle2, MapPin, Navigation, Clock, Phone, MessageSquare, 
    Activity, ShieldCheck, Timer, Wind, Waves, Zap, Bug, Flame, Sparkles,
    X, UploadCloud, Image as ImageIcon, Search, Check, FileCheck, Crown, Shield
} from 'lucide-react';
import { db, collection, addDoc, serverTimestamp, getDoc, doc, getDocs, query, where, updateDoc, onSnapshot, orderBy, limit, storage, ref, uploadBytes, getDownloadURL } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useAI } from '@bin/shared';
import { buildGeoAnchor } from '../utils/geoAnchor';
import CeoContactButtons from '../components/CeoContactButtons';

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
    const { setPageContext } = useAI();
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [preferredTiming, setPreferredTiming] = useState('');
    const [urgency, setUrgency] = useState('NORMAL');
    const [permissionToEnter, setPermissionToEnter] = useState('CALL_FIRST');
    const [isAnyoneHome, setIsAnyoneHome] = useState('UNKNOWN');
    const [accessNotes, setAccessNotes] = useState('');
    const [occupantNotes, setOccupantNotes] = useState('');
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

    const [requestingMoveOut, setRequestingMoveOut] = useState(false);
    const [moveOutStatus, setMoveOutStatus] = useState<any>(null);

    // V7.5 Tenancy Ledger State
    const [ledger, setLedger] = useState<{
        rentAmount: number;
        paidAmount: number;
        balance: number;
        nextDueDate: any;
        lastPaymentDate: any;
        status: 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'NO_LEDGER';
    }>({
        rentAmount: 0,
        paidAmount: 0,
        balance: 0,
        nextDueDate: null,
        lastPaymentDate: null,
        status: 'NO_LEDGER'
    });

    // V5 Live Ops State
    const [activeTickets, setActiveTickets] = useState<any[]>([]);
    const [pastTickets, setPastTickets] = useState<any[]>([]);
    const [distanceInfo, setDistanceInfo] = useState<Record<string, { distance: string, eta: string }>>({});

    useEffect(() => {
        if (!user?.uid) return;
        const q = query(collection(db, 'move_out_requests'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(1));
        const unsub = onSnapshot(q, (snap) => {
            if (!snap.empty) setMoveOutStatus({ id: snap.docs[0].id, ...snap.docs[0].data() });
        });
        return unsub;
    }, [user]);

    useEffect(() => {
        const fetchLedger = async () => {
            if (!user?.uid) return;
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                const data = userSnap.data();
                setLedger({
                    rentAmount: data.rentAmount || 0,
                    paidAmount: data.paidAmount || 0,
                    balance: (data.rentAmount || 0) - (data.paidAmount || 0),
                    nextDueDate: data.nextDueDate || null,
                    lastPaymentDate: data.lastPaymentDate || null,
                    status: data.paymentStatus || 'NO_LEDGER'
                });
            }
        };
        fetchLedger();
    }, [user]);

    useEffect(() => {
        if (activeTickets.length > 0) {
            setPageContext({ activeTickets, distanceInfo });
        } else {
            setPageContext(null);
        }
        return () => setPageContext(null);
    }, [activeTickets, distanceInfo]);

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

    const handleRequestMoveOut = async () => {
        if (!unitData || unitData.id === 'UNASSOCIATED') {
            alert("Move-out unavailable until tenancy record is fully linked.");
            return;
        }
        if (!window.confirm("Initialize Move-Out Protocol? This will notify your owner and property management team.")) return;

        setRequestingMoveOut(true);
        try {
            await addDoc(collection(db, 'move_out_requests'), {
                companyId: 'BIN_GROUP',
                userId: user?.uid,
                tenantId: user?.uid,
                tenantName: user?.displayName,
                propertyId: unitData.propertyId,
                propertyName: propertyData?.name || propertyData?.propertyName,
                unitId: unitData.id,
                unitNumber: unitData.unitNumber,
                status: 'REQUESTED',
                checklistStatus: 'PENDING_INSPECTION',
                readinessStatus: 'MOVE_OUT_REVIEW_REQUIRED',
                requiredChecklist: {
                    keysReturned: false,
                    accessCardsReturned: false,
                    utilityFinalBillUploaded: false,
                    photosAfterMoveOut: false,
                    meterReadingsCaptured: false,
                    tenantSignature: false,
                    adminSignature: false
                },
                auditVersion: 1,
                createdAt: serverTimestamp(),
            });
            alert("Move-out request submitted. Our team will review your clearance certificates.");
        } catch (err) {
            console.error(err);
        } finally {
            setRequestingMoveOut(false);
        }
    };

    const isPMEnabled = propertyData?.contractType === 'pm_only' || propertyData?.contractType === 'hybrid';

    const renderFinancialCard = () => {
        if (!isPMEnabled && propertyData) {
            return (
                <Paper sx={{ p: 4, mb: 6, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                        This tenancy is not under BIN GROUP Property Management services.
                    </Typography>
                </Paper>
            );
        }

        return (
            <Paper sx={{ p: 4, mb: 6, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>
                        TENANCY LEDGER
                    </Typography>
                    <Chip 
                        label={ledger.status.replace('_', ' ')} 
                        color={ledger.status === 'PAID' ? 'success' : ledger.status === 'OVERDUE' ? 'error' : 'default'}
                        size="small" sx={{ fontWeight: 900, fontSize: '0.65rem' }} 
                    />
                </Box>
                
                {ledger.rentAmount > 0 ? (
                    <Grid container spacing={4}>
                        <Grid item xs={6} md={3}>
                            <Typography variant="caption" color="textSecondary">TOTAL RENT</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF">AED {ledger.rentAmount.toLocaleString()}</Typography>
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <Typography variant="caption" color="textSecondary">PAID TO DATE</Typography>
                            <Typography variant="h6" fontWeight="900" color="#10b981">AED {ledger.paidAmount.toLocaleString()}</Typography>
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <Typography variant="caption" color="textSecondary">OUTSTANDING</Typography>
                            <Typography variant="h6" fontWeight="900" color={ledger.balance > 0 ? '#ef4444' : '#FFF'}>AED {ledger.balance.toLocaleString()}</Typography>
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <Typography variant="caption" color="textSecondary">NEXT DUE</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF">{ledger.nextDueDate?.toDate ? ledger.nextDueDate.toDate().toLocaleDateString() : 'N/A'}</Typography>
                        </Grid>
                    </Grid>
                ) : (
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', py: 2 }}>
                        Rent ledger not managed through BIN GROUP for this tenancy.
                    </Typography>
                )}
            </Paper>
        );
    };

    const renderMoveLifecycleCard = () => {
        if (!isPMEnabled) return null;

        return (
            <Paper sx={{ p: 4, mb: 6, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2, mb: 3, display: 'block' }}>
                    TENANCY LIFECYCLE
                </Typography>
                <Grid container spacing={4} alignItems="center">
                    <Grid item xs={12} md={7}>
                        <Stack direction="row" spacing={3}>
                            <Box>
                                <Typography variant="caption" color="textSecondary">MOVE-IN STATUS</Typography>
                                <Typography variant="body1" fontWeight="900" color="#10b981">{propertyData?.moveInStatus || unitData?.tenantId ? 'COMPLETED' : 'PENDING'}</Typography>
                            </Box>
                            <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Box>
                                <Typography variant="caption" color="textSecondary">LEASE EXPIRY</Typography>
                                <Typography variant="body1" fontWeight="900" color="#FFF">{propertyData?.leaseEndDate || 'N/A'}</Typography>
                            </Box>
                        </Stack>
                    </Grid>
                    <Grid item xs={12} md={5}>
                        {moveOutStatus ? (
                            <Paper sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${binThemeTokens.gold}`, borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block' }}>MOVE-OUT IN PROGRESS</Typography>
                                <Typography variant="body2" fontWeight="700">STATUS: {moveOutStatus.status}</Typography>
                            </Paper>
                        ) : (
                            <Button 
                                fullWidth variant="outlined" 
                                disabled={requestingMoveOut || !unitData || unitData.id === 'UNASSOCIATED'}
                                onClick={handleRequestMoveOut}
                                sx={{ borderColor: '#ef4444', color: '#ef4444', fontWeight: 900, '&:hover': { bgcolor: alpha('#ef4444', 0.1), borderColor: '#ef4444' } }}
                            >
                                {requestingMoveOut ? <CircularProgress size={20} color="inherit" /> : 'REQUEST MOVE-OUT'}
                            </Button>
                        )}
                    </Grid>
                </Grid>
            </Paper>
        );
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!category || !description || !user) return;
        
        // 🚨 STRICT RELATIONAL ENFORCEMENT
        if (!unitData || !unitData.propertyId) {
            alert("Sovereign Protocol Violation: Your account is not currently linked to a verified asset node. Mission dispatch aborted.");
            return;
        }

        setSubmitting(true);
        try {
            let ticketGeo = propertyData?.geo || null;
            if (!ticketGeo) {
                ticketGeo = buildGeoAnchor({
                    lat: propertyData?.location?.lat ?? propertyData?.coordinates?.lat,
                    lng: propertyData?.location?.lng ?? propertyData?.coordinates?.lng,
                    address: physicalAddress || propertyData?.address,
                    emirate: emirate || propertyData?.emirate,
                    city: propertyData?.city || serviceZone || propertyData?.area,
                    area: propertyData?.area || serviceZone,
                    placeId: propertyData?.googlePlaceId || propertyData?.geo?.placeId,
                    source: propertyData?.geo?.source || 'property_record',
                    verified: propertyData?.geo?.verified ?? false
                });
            }

            await addDoc(collection(db, 'maintenanceTickets'), {
                companyId: 'BIN_GROUP',
                tenantId: user.uid,
                tenantName: user.displayName || 'Anonymous Tenant',
                tenantEmail: user.email || '',
                tenantPhone: user.phoneNumber || (user as any).phone || 'No Phone Number',
                trade: category.toUpperCase(),
                complaintCategory: category,
                description,
                preferredTiming: preferredTiming || 'ASAP',
                urgency,
                permissionToEnter,
                isAnyoneHome,
                accessNotes,
                occupantNotes,
                hasImage: !!image,
                status: 'OPEN',
                priority: urgency === 'EMERGENCY' || category === 'ac_failure' || category === 'plumbing' || category === 'electrical' ? 'EMERGENCY' : 'MEDIUM',
                
                // STRICT BINDING
                propertyId: unitData.propertyId,
                unitId: unitData.id,
                ownerId: propertyData?.ownerId || 'SYSTEM',
                
                unitNumber: unitData.unitNumber || '',
                floorNumber: unitData.floorNumber || '',
                emirate: emirate || propertyData?.emirate || '',
                city: propertyData?.city || serviceZone || propertyData?.area || '',
                area: propertyData?.area || serviceZone || '',
                serviceZone: serviceZone || propertyData?.serviceZone || '',
                address: physicalAddress || propertyData?.address || '',
                fullAddress: physicalAddress || propertyData?.address || '',
                propertyName: propertyData?.name || propertyData?.propertyName || 'Assigned Property',
                geo: ticketGeo,
                
                propertyLocation: {
                    address: physicalAddress || propertyData?.address || '',
                    propertyName: propertyData?.name || propertyData?.propertyName || 'Assigned Property',
                    unitNumber: unitData.unitNumber || '',
                    floorNumber: unitData.floorNumber || '',
                    location: ticketGeo ? { lat: ticketGeo.lat, lng: ticketGeo.lng } : null,
                    geo: ticketGeo
                },
                tenantSafety: {
                    technicianIdentityRequired: true,
                    otpBeforeWork: true,
                    tenantSignatureAfterCompletion: true,
                    ratingAllowedAfterCompletion: true
                },
                lifecycle: {
                    received: true,
                    assigned: false,
                    technicianAccepted: false,
                    onTheWay: false,
                    arrived: false,
                    inProgress: false,
                    tenantVerificationRequired: false
                },
                createdBy: user.uid,
                createdByRole: 'tenant',
                visibility: 'tenant_owner_admin_technician',
                auditVersion: 1,
                createdAt: serverTimestamp(),
                source: 'TENANT_APP_SOS_V6_STRICT'
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
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>Mission Control</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button 
                        variant="contained" 
                        onClick={() => navigate('/design-studio')}
                        startIcon={<Sparkles size={18} />}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
                    >
                        AI DESIGN STUDIO
                    </Button>
                    <CeoContactButtons compact />
                </Stack>
            </Box>
            {renderReportCard()}
            {renderFinancialCard()}
            {renderMoveLifecycleCard()}

            {/* [V7.2] Lease & Occupancy Context */}
            <Paper sx={{ p: 4, mb: 6, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2, mb: 3, display: 'block' }}>
                    RESIDENCY CONTEXT
                </Typography>
                <Grid container spacing={4}>
                    <Grid item xs={12} md={6}>
                        <Typography variant="caption" color="textSecondary">ASSIGNED PROPERTY</Typography>
                        <Typography variant="h6" fontWeight="900" color="#FFF">{propertyData?.name || propertyData?.propertyName || 'Loading asset node...'}</Typography>
                        <Typography variant="body2" color="textSecondary">{physicalAddress}</Typography>
                    </Grid>
                    <Grid item xs={6} md={3}>
                        <Typography variant="caption" color="textSecondary">UNIT / FLOOR</Typography>
                        <Typography variant="h6" fontWeight="900" color="#FFF">{unitData?.unitNumber || 'N/A'}</Typography>
                        <Typography variant="body2" color="textSecondary">Level {unitData?.floorNumber || '0'}</Typography>
                    </Grid>
                    <Grid item xs={6} md={3}>
                        <Typography variant="caption" color="textSecondary">LEASE STATUS</Typography>
                        <Typography variant="h6" fontWeight="900" color="#10b981">ACTIVE</Typography>
                        <Chip label="ISO SECURED" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: alpha('#10b981', 0.1), color: '#10b981' }} />
                    </Grid>
                </Grid>
            </Paper>

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
                                        ) : ticket.status === 'OPEN' ? (
                                            <Stack spacing={3} alignItems="center" textAlign="center" sx={{ opacity: 0.5 }}>
                                                <Clock size={48} color={binThemeTokens.textSecondary} />
                                                <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textSecondary }}>PENDING DISPATCH</Typography>
                                            </Stack>
                                        ) : (
                                            <Stack spacing={3} alignItems="center" textAlign="center">
                                                <Activity size={48} color={binThemeTokens.gold} />
                                                <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>{ticket.status.replace('_', ' ')}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Mission currently active.</Typography>
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
                                ⚡ 1-CLICK INSTANT DISPATCH
                            </Typography>
                            <Grid container spacing={2}>
                                {[
                                    { label: 'AC Not Cooling', cat: 'ac_failure', icon: <Wind size={20} />, color: '#3b82f6' },
                                    { label: 'Major Leak', cat: 'plumbing', icon: <Waves size={20} />, color: '#06b6d4' },
                                    { label: 'Total Blackout', cat: 'electrical', icon: <Zap size={20} />, color: '#eab308' },
                                    { label: 'Pest Incident', cat: 'pest', icon: <Bug size={20} />, color: '#10b981' },
                                    { label: 'Security Fault', cat: 'security', icon: <ShieldAlert size={20} />, color: '#ef4444' },
                                    { label: 'Water Heater', cat: 'plumbing', icon: <Flame size={20} />, color: '#f97316' },
                                    { label: 'Elevator Issue', cat: 'elevator', icon: <ArrowRight size={20} />, color: '#a78bfa' },
                                    { label: 'Door / Lock', cat: 'access', icon: <Key size={20} />, color: '#f59e0b' },
                                    { label: 'Drain Blockage', cat: 'plumbing', icon: <X size={20} />, color: '#06b6d4' },
                                ].map((shortcut, idx) => (
                                    <Grid item xs={6} sm={4} key={idx}>
                                        <Paper
                                            onClick={() => { 
                                                setCategory(shortcut.cat); 
                                                setDescription(`Emergency: ${shortcut.label}`);
                                                setPreferredTiming('ASAP');
                                                setUrgency('EMERGENCY');
                                                // Trigger submit immediately for 1-click experience
                                                setTimeout(() => {
                                                    const form = document.querySelector('form');
                                                    if (form) form.requestSubmit();
                                                }, 100);
                                            }}
                                            sx={{ 
                                                p: 3, cursor: 'pointer', textAlign: 'center',
                                                bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                                borderRadius: 4, transition: 'all 0.2s ease',
                                                '&:hover': { borderColor: shortcut.color, bgcolor: alpha(shortcut.color, 0.1), transform: 'translateY(-4px)' }
                                            }}
                                        >
                                            <Box sx={{ color: shortcut.color, mb: 1, display: 'flex', justifyContent: 'center' }}>{shortcut.icon}</Box>
                                            <Typography variant="caption" fontWeight="900" sx={{ color: '#FFF' }}>{shortcut.label.toUpperCase()}</Typography>
                                        </Paper>
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
                                <MenuItem value="elevator">Elevator</MenuItem>
                                <MenuItem value="fire_alarm">Fire Alarm</MenuItem>
                                <MenuItem value="access">Door / Lock / Access</MenuItem>
                                <MenuItem value="appliance">Appliance</MenuItem>
                                <MenuItem value="other">Other</MenuItem>
                            </Select>
                        </FormControl>

                        <Grid container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>URGENCY</InputLabel>
                                    <Select value={urgency} label="URGENCY" onChange={(e) => setUrgency(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}>
                                        <MenuItem value="NORMAL">Normal</MenuItem>
                                        <MenuItem value="URGENT">Urgent</MenuItem>
                                        <MenuItem value="EMERGENCY">Emergency</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>PERMISSION TO ENTER</InputLabel>
                                    <Select value={permissionToEnter} label="PERMISSION TO ENTER" onChange={(e) => setPermissionToEnter(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}>
                                        <MenuItem value="CALL_FIRST">Call first</MenuItem>
                                        <MenuItem value="YES_IF_AUTHORIZED">Yes, if authorized</MenuItem>
                                        <MenuItem value="NO_TENANT_PRESENT">No, tenant must be present</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>ANYONE HOME?</InputLabel>
                                    <Select value={isAnyoneHome} label="ANYONE HOME?" onChange={(e) => setIsAnyoneHome(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}>
                                        <MenuItem value="UNKNOWN">Unknown</MenuItem>
                                        <MenuItem value="YES">Yes</MenuItem>
                                        <MenuItem value="NO">No</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

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

                        <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth multiline rows={3} label="ACCESS NOTES" value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' } }} />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth multiline rows={3} label="PETS / CHILDREN / SAFETY NOTES" value={occupantNotes} onChange={(e) => setOccupantNotes(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' } }} />
                            </Grid>
                        </Grid>

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

            <Box sx={{ mt: 8, mb: 4, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 900, mb: 2, letterSpacing: 1 }}>
                    ESCALATE TO EXECUTIVE OPERATIONS
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <CeoContactButtons />
                </Box>
            </Box>
        </Container>
    );
}
