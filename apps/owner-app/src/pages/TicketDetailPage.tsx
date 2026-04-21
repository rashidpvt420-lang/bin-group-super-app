import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Container, Paper, Button, Stack, Chip, TextField, Grid, alpha, Dialog, DialogTitle, DialogContent, DialogActions, Divider, CircularProgress } from '@mui/material';
import { ArrowLeft, Camera, CheckCircle2, MapPin, Clock, Navigation, ShieldCheck, PenTool, Phone, MessageSquare, User, ImageIcon } from 'lucide-react';
import { db, doc, getDoc, updateDoc, serverTimestamp, onSnapshot, storage, ref, uploadBytes, getDownloadURL } from '../lib/firebase';
import { queueMutation } from '../lib/offlineSync';
import SignaturePad from '../components/SignaturePad';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';

export default function TicketDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    const { user, role } = useRole();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState('');
    const [updating, setUpdating] = useState(false);
    const [geoWatcher, setGeoWatcher] = useState<number | null>(null);
    const [distanceInfo, setDistanceInfo] = useState<{ distance: string, eta: string } | null>(null);
    const [showCompleteModal, setShowCompleteModal] = useState(false);
    const [signature, setSignature] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const docRef = doc(db, 'maintenanceTickets', id);
        const unsubscribe = onSnapshot(docRef, async (docSnap: any) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const ticketData = { id: docSnap.id, ...data };
                
                // [V9] PRIVACY OVERRIDE: Fetch missing context for assigned technicians
                if (role === 'technician' && (data.assignedTechnicianId === user?.uid)) {
                    if (!data.tenantPhone && data.tenantId) {
                        try {
                            const tenantSnap = await getDoc(doc(db, 'users', data.tenantId));
                            if (tenantSnap.exists()) {
                                ticketData.tenantPhone = tenantSnap.data()?.phone || tenantSnap.data()?.phoneNumber;
                            }
                        } catch (e) { console.warn("Tenant fetch failed:", e); }
                    }
                    if ((!data.propertyLocation || !data.propertyLocation.address) && data.propertyId) {
                        try {
                            const propSnap = await getDoc(doc(db, 'properties', data.propertyId));
                            if (propSnap.exists()) {
                                const pData = propSnap.data();
                                ticketData.propertyLocation = {
                                    ...ticketData.propertyLocation,
                                    address: pData?.address,
                                    propertyName: pData?.name,
                                    location: pData?.location
                                };
                            }
                        } catch (e) { console.warn("Property fetch failed:", e); }
                    }
                }

                setTicket(ticketData);
                setNotes(data.notes || '');
                
                // Calculate distance if techLocation exists and user is tenant or same technician
                if (data.status === 'EN_ROUTE' && data.techLocation && (data.propertyLocation?.location || ticketData.propertyLocation?.location)) {
                    calculateDistance(data.techLocation, data.propertyLocation?.location || ticketData.propertyLocation?.location);
                } else {
                    setDistanceInfo(null);
                }
            }
        });
        setLoading(false);
        return () => unsubscribe();
    }, [id, role, user?.uid]);

    useEffect(() => {
        // Broadcaster Logic for Technicians
        if (ticket?.status === 'EN_ROUTE' && role === 'technician' && !geoWatcher) {
            startGeoBroadcasting();
        } else if (ticket?.status !== 'EN_ROUTE' && geoWatcher) {
            stopGeoBroadcasting();
        }

        return () => stopGeoBroadcasting();
    }, [ticket?.status, role]);

    const startGeoBroadcasting = () => {
        if (!navigator.geolocation) {
            console.error("Geolocation is not supported by this browser.");
            return;
        }

        const watcherId = navigator.geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude, heading } = position.coords;
                try {
                    const ticketRef = doc(db, 'maintenanceTickets', id!);
                    await updateDoc(ticketRef, {
                        techLocation: {
                            lat: latitude,
                            lng: longitude,
                            heading: heading || 0,
                            timestamp: Date.now()
                        }
                    });
                } catch (err) {
                    console.error("Failed to update tech location:", err);
                }
            },
            (error) => {
                console.warn("Geolocation permission/error:", error);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 5000
            }
        );
        setGeoWatcher(watcherId);
    };

    const stopGeoBroadcasting = () => {
        if (geoWatcher !== null) {
            navigator.geolocation.clearWatch(geoWatcher);
            setGeoWatcher(null);
        }
    };

    const calculateDistance = (techLoc: any, propLoc: any) => {
        const R = 6371; // Earth radius in km
        const dLat = (propLoc.lat - techLoc.lat) * Math.PI / 180;
        const dLon = (propLoc.lng - techLoc.lng) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(techLoc.lat * Math.PI / 180) * Math.cos(propLoc.lat * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c;
        
        const distStr = d < 1 ? `${(d * 1000).toFixed(0)}m` : `${d.toFixed(1)}km`;
        const etaMin = Math.ceil(d * 5); // Rough estimate: 5 min per km
        setDistanceInfo({
            distance: distStr,
            eta: `${etaMin}-${etaMin + 2} mins`
        });
    };

    const handleNavigate = () => {
        if (!ticket?.propertyLocation) return;
        const loc = ticket.propertyLocation;
        let query = '';
        
        if (loc.location) {
            const lat = (loc.location as any).lat ?? (loc.location as any).latitude;
            const lng = (loc.location as any).lng ?? (loc.location as any).longitude;
            if (lat !== undefined && lng !== undefined) {
                query = `${lat},${lng}`;
            }
        }
        
        if (!query) {
            query = encodeURIComponent(`${loc.address}, ${loc.propertyName}`);
        }
        
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank');
    };

    const updateStatus = async (newStatus: string) => {
        if (!id || !user?.uid) return;
        setUpdating(true);

        // [V10] GPS Check-in Protocol
        let locationData = null;
        if (newStatus === 'ARRIVED') {
            try {
                const pos: any = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject);
                });
                locationData = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    timestamp: Date.now()
                };
            } catch (e) {
                console.warn("GPS check-in failed, continuing with timestamp only.");
            }
        }

        const docRef = doc(db, 'maintenanceTickets', id);
        const updateData: any = {
            status: newStatus,
            updatedAt: serverTimestamp(),
            notes: notes
        };

        if (locationData) {
            updateData.checkInLocation = locationData;
            updateData.checkInAt = serverTimestamp();
        }

        try {

            // If technician is taking an OPEN ticket, assign them
            if ((ticket.status === 'OPEN' || ticket.status === 'assigned' || ticket.status === 'ASSIGNED') && (newStatus === 'EN_ROUTE' || newStatus === 'IN_PROGRESS' || newStatus === 'ARRIVED')) {
                updateData.assignedTechnicianId = user.uid;
                updateData.assignedTechnicianName = user.displayName || 'Maintenance Specialist';
                updateData.assignedAt = serverTimestamp();
            }

            await updateDoc(docRef, updateData);
            setTicket({ ...ticket, ...updateData, status: newStatus });
        } catch (err) {
            console.warn("Status Update Failed - Queuing for Offline Sync:", err);
            await queueMutation('maintenanceTickets', id, updateData);
            setTicket({ ...ticket, ...updateData, status: newStatus });
        }
        setUpdating(false);
    };

    const handleFinalizeCompletion = async () => {
        if (!signature || !ticket.hasBeforePhoto || !ticket.hasAfterPhoto || !notes.trim()) {
            alert("Mandatory Protocol: Before/After Photos, Completion Notes, and Signature are required for mission closure.");
            return;
        }
        setUpdating(true);
        
        // If signature is base64, try uploading to Storage too
        let signatureUrl = signature;
        if (signature.startsWith('data:image')) {
            try {
                const response = await fetch(signature);
                const blob = await response.blob();
                const sigRef = ref(storage, `evidence/${id}/signature_${Date.now()}.png`);
                await uploadBytes(sigRef, blob);
                signatureUrl = await getDownloadURL(sigRef);
            } catch (err) {
                console.warn("Signature Storage upload failed, using local base64.");
            }
        }

        const updateData = {
            status: 'COMPLETED',
            tenantSignature: signatureUrl,
            notes: notes,
            partsUsed: ticket.partsUsed || [],
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            completionTimestamp: Date.now()
        };
        
        try {
            await updateDoc(doc(db, 'maintenanceTickets', id!), updateData);
            setShowCompleteModal(false);
        } catch (err) {
            console.warn("Completion sync failed - securing signature in offline vault.");
            const secured = await queueMutation('maintenanceTickets', id!, updateData);
            if (secured) {
                setShowCompleteModal(false);
            } else {
                alert("Critical System Error: Unable to secure signature locally. Please check device storage.");
            }
        }
        setUpdating(false);
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const file = e.target.files?.[0];
        if (!file || !id) return;

        setUpdating(true);
        
        try {
            // 1. Try Real Storage Upload
            const storageRef = ref(storage, `evidence/${id}/${field}_${Date.now()}.jpg`);
            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);

            const docRef = doc(db, 'maintenanceTickets', id);
            const updateData = {
                [field]: true,
                [`${field}Url`]: downloadUrl,
                updatedAt: serverTimestamp()
            };
            
            await updateDoc(docRef, updateData);
            setTicket((prev: any) => prev ? { ...prev, [field]: true, [`${field}Url`]: downloadUrl } : null);
        } catch (err) {
            console.warn("Storage upload failed - falling back to offline vault with base64.");
            
            const reader = new FileReader();
            const filePromise = new Promise<string>((resolve) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(file);
            });
            const base64Data = await filePromise;

            const updateData = {
                [field]: true,
                [`${field}Data`]: base64Data, // Store evidence payload for later sync
                updatedAt: serverTimestamp()
            };
            
            const secured = await queueMutation('maintenanceTickets', id!, updateData);
            if (secured) {
                setTicket((prev: any) => prev ? { ...prev, [field]: true } : null);
            }
        }
        setUpdating(false);
    }

    const triggerCamera = (field: string) => {
        const input = document.getElementById(`camera-input-${field}`) as HTMLInputElement;
        if (input) input.click();
    }

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress color="inherit" sx={{ color: binThemeTokens.gold }} /></Box>;
    if (!ticket) return <Container sx={{ py: 8 }}><Typography color="white">NODE NOT FOUND.</Typography></Container>;

    const canComplete = ticket.hasBeforePhoto && ticket.hasAfterPhoto;

    return (
        <Container maxWidth="md" sx={{ py: 6 }}>
            <Button 
                startIcon={<ArrowLeft size={18} />} 
                onClick={() => navigate(role === 'technician' ? '/tech' : '/tenant')}
                sx={{ color: binThemeTokens.gold, mb: 4, fontWeight: 900 }}
            >
                {t('common.back')}
            </Button>

            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198,167,94,0.15)', borderRadius: 6 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('tech.ticket_id')}: {ticket.id.substring(0, 8)}</Typography>
                        <Typography variant="h4" fontWeight="900" sx={{ color: '#FFFFFF', mb: 1 }}>{ticket.trade || 'GENERAL'}</Typography>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <MapPin size={16} color={binThemeTokens.gold} />
                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                                {ticket.propertyLocation?.propertyName || ticket.propertyName || ticket.propertyId || 'PORTFOLIO ASSET'} ({ticket.unitNumber || ticket.propertyLocation?.unitNumber || 'N/A'})
                            </Typography>
                        </Stack>
                    </Box>
                    <Stack spacing={1} alignItems="flex-end">
                        <Chip 
                            label={t(`status.${ticket.status.toLowerCase()}`)} 
                            sx={{ bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, px: 2 }} 
                        />
                        {ticket.propertyLocation && (
                            <Button 
                                size="small"
                                startIcon={<Navigation size={14} />}
                                onClick={handleNavigate}
                                sx={{ color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.7rem', border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }}
                            >
                                Navigate
                            </Button>
                        )}
                    </Stack>
                </Stack>

                {/* Photo Evidence Preview */}
                {(ticket.hasBeforePhoto || ticket.hasAfterPhoto) && (
                    <Box sx={{ mb: 4, display: 'flex', gap: 2 }}>
                        {ticket.hasBeforePhoto && (
                            <Box sx={{ flex: 1, position: 'relative' }}>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, display: 'block', mb: 1, fontWeight: 900 }}>BEFORE</Typography>
                                <Box component="img" src={ticket.hasBeforePhotoUrl || ticket.hasBeforePhotoData} sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' }} />
                            </Box>
                        )}
                        {ticket.hasAfterPhoto && (
                            <Box sx={{ flex: 1, position: 'relative' }}>
                                <Typography variant="caption" sx={{ color: '#4ade80', display: 'block', mb: 1, fontWeight: 900 }}>AFTER</Typography>
                                <Box component="img" src={ticket.hasAfterPhotoUrl || ticket.hasAfterPhotoData} sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' }} />
                            </Box>
                        )}
                    </Box>
                )}

                {/* Technician Info for Tenant or ETA for Technician */}
                {ticket.status === 'EN_ROUTE' && (
                    <Box sx={{ mb: 4, p: 3, bgcolor: alpha(binThemeTokens.gold, 0.1), border: `2px solid ${binThemeTokens.gold}`, borderRadius: 4 }}>
                        <Stack spacing={3}>
                            <Stack direction="row" spacing={3} alignItems="center">
                                <Box sx={{ position: 'relative' }}>
                                    <Navigation size={32} color={binThemeTokens.gold} className="animate-pulse" />
                                </Box>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{role === 'technician' ? 'EN ROUTE TO TARGET' : 'SPECIALIST EN ROUTE'}</Typography>
                                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>Live tracking active via Sovereign GPS Engine.</Typography>
                                </Box>
                                {distanceInfo && (
                                    <Box sx={{ textAlign: 'right' }}>
                                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{distanceInfo.eta}</Typography>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 800 }}>{distanceInfo.distance} AWAY</Typography>
                                    </Box>
                                )}
                            </Stack>
                        </Stack>
                    </Box>
                )}

                {/* [V5] TECHNICIAN-ONLY TENANT CARD */}
                {role === 'technician' && (
                    <Box sx={{ mb: 4, p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>{t('status.tenant_contact')}</Typography>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: '50%' }}>
                                    <User size={24} color={binThemeTokens.gold} />
                                </Box>
                                <Box>
                                    <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>{ticket.tenantName || 'Anonymous Resident'}</Typography>
                                    <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 700 }}>{ticket.tenantPhone || ticket.tenantPhoneNumber || 'No Phone Registered'}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{t('field.units')} {ticket.unitNumber || ticket.propertyLocation?.unitNumber || 'N/A'} | {t('field.floors')} {ticket.floorNumber || 'N/A'}</Typography>
                                </Box>
                            </Stack>
                            <Stack direction="row" spacing={1}>
                                <Button variant="outlined" sx={{ minWidth: 0, p: 1.5, borderRadius: 2, borderColor: 'rgba(255,255,255,0.1)', color: '#FFF' }}><MessageSquare size={20} /></Button>
                                <Button 
                                    component="a"
                                    href={`tel:${ticket.tenantPhone || ticket.tenantPhoneNumber || ''}`}
                                    variant="contained" 
                                    sx={{ minWidth: 0, p: 1.5, borderRadius: 2, bgcolor: '#10b981', color: '#FFF', visibility: (ticket.status === 'EN_ROUTE' || ticket.status === 'ARRIVED' || ticket.status === 'IN_PROGRESS' || ticket.status === 'assigned' || ticket.status === 'ASSIGNED') ? 'visible' : 'hidden' }}
                                >
                                    <Phone size={20} />
                                </Button>
                            </Stack>
                        </Stack>
                        {ticket.propertyLocation?.address && (
                            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <MapPin size={12} /> {ticket.propertyLocation.address}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}

                <Typography variant="body1" sx={{ color: '#FFFFFF', mb: 4, p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                    {ticket.description}
                </Typography>

                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={6}>
                        <Box
                            component="input"
                            type="file" 
                            accept="image/*" 
                            capture="environment" 
                            sx={{ display: 'none' }} 
                            id="camera-input-hasBeforePhoto"
                            title={t('tech.photo.upload_before')}
                            aria-label={t('tech.photo.upload_before')}
                            onChange={(e: any) => handlePhotoUpload(e, 'hasBeforePhoto')}
                        />
                        <Button 
                            fullWidth 
                            variant="outlined" 
                            startIcon={updating ? <CircularProgress size={20} color="inherit" /> : <Camera />}
                            onClick={() => triggerCamera('hasBeforePhoto')}
                            disabled={updating || ticket.hasBeforePhoto || role !== 'technician'}
                            sx={{ py: 4, borderRadius: 4, borderColor: ticket.hasBeforePhoto ? '#4ade80' : 'rgba(198,167,94,0.3)', color: ticket.hasBeforePhoto ? '#4ade80' : binThemeTokens.gold }}
                        >
                            {ticket.hasBeforePhoto ? t('tech.photo.before_uploaded') : t('tech.photo.upload_before')}
                        </Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Box
                            component="input"
                            type="file" 
                            accept="image/*" 
                            capture="environment" 
                            sx={{ display: 'none' }} 
                            id="camera-input-hasAfterPhoto"
                            title={t('tech.photo.upload_after')}
                            aria-label={t('tech.photo.upload_after')}
                            onChange={(e: any) => handlePhotoUpload(e, 'hasAfterPhoto')}
                        />
                        <Button 
                            fullWidth 
                            variant="outlined" 
                            startIcon={updating ? <CircularProgress size={20} color="inherit" /> : <Camera />}
                            onClick={() => triggerCamera('hasAfterPhoto')}
                            disabled={updating || ticket.hasAfterPhoto || role !== 'technician'}
                            sx={{ py: 4, borderRadius: 4, borderColor: ticket.hasAfterPhoto ? '#4ade80' : 'rgba(198,167,94,0.3)', color: ticket.hasAfterPhoto ? '#4ade80' : binThemeTokens.gold }}
                        >
                            {ticket.hasAfterPhoto ? t('tech.photo.after_uploaded') : t('tech.photo.upload_after')}
                        </Button>
                    </Grid>
                </Grid>

                {role === 'technician' && (
                    <Box sx={{ mb: 4 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1, display: 'block' }}>PARTS & MATERIALS</Typography>
                        <Stack spacing={2}>
                            {(ticket.partsUsed || []).map((part: any, idx: number) => (
                                <Paper key={idx} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2">{part.name}</Typography>
                                    <Typography variant="body2" fontWeight="900">QTY: {part.quantity}</Typography>
                                </Paper>
                            ))}
                            <Button 
                                variant="outlined" 
                                size="small" 
                                startIcon={<PenTool size={14} />}
                                onClick={() => {
                                    const name = prompt("Enter part name:");
                                    const qty = prompt("Enter quantity:");
                                    if (name && qty) {
                                        const newParts = [...(ticket.partsUsed || []), { name, quantity: qty }];
                                        updateDoc(doc(db, 'maintenanceTickets', id!), { partsUsed: newParts });
                                    }
                                }}
                                sx={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)' }}
                            >
                                ADD PART
                            </Button>
                        </Stack>
                    </Box>
                )}

                {role === 'technician' && (
                    <TextField
                        fullWidth
                        multiline
                        rows={4}
                        label={t('tech.completion_notes')}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        sx={{ 
                            mb: 4,
                            '& .MuiOutlinedInput-root': { color: '#FFFFFF', borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)' },
                            '& .MuiInputLabel-root': { color: binThemeTokens.textSecondary }
                        }}
                    />
                )}

                {role === 'technician' && (
                    <Stack spacing={2}>
                        {(ticket.status === 'OPEN' || ticket.status === 'ASSIGNED' || ticket.status === 'assigned') && (
                            <Button 
                                fullWidth 
                                variant="contained" 
                                onClick={() => updateStatus('EN_ROUTE')}
                                disabled={updating}
                                sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, borderRadius: 3 }}
                            >
                                {t('tech.action.en_route')}
                            </Button>
                        )}
                        {ticket.status === 'EN_ROUTE' && (
                            <Button 
                                fullWidth 
                                variant="contained" 
                                onClick={() => updateStatus('ARRIVED')}
                                disabled={updating}
                                sx={{ py: 2, bgcolor: '#3b82f6', color: '#FFF', fontWeight: 900, borderRadius: 3 }}
                            >
                                {t('tech.action.arrived')}
                            </Button>
                        )}
                        {ticket.status === 'ARRIVED' && (
                            <Button 
                                fullWidth 
                                variant="contained" 
                                onClick={() => updateStatus('IN_PROGRESS')}
                                disabled={updating}
                                sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, borderRadius: 3 }}
                            >
                                {t('tech.action.start_work')}
                            </Button>
                        )}
                        {ticket.status === 'IN_PROGRESS' && (
                            <Button 
                                fullWidth 
                                variant="contained" 
                                onClick={() => setShowCompleteModal(true)}
                                disabled={updating || !canComplete}
                                startIcon={<CheckCircle2 />}
                                sx={{ py: 2, bgcolor: '#4ade80', color: '#0B0B0C', fontWeight: 900, borderRadius: 3 }}
                            >
                                {canComplete ? t('tech.action.complete_mission') : t('tech.action.evidence_required')}
                            </Button>
                        )}
                    </Stack>
                )}
            </Paper>

            {/* Proof of Work Modal */}
            <Dialog 
                open={showCompleteModal} 
                onClose={() => !updating && setShowCompleteModal(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { borderRadius: 6, bgcolor: '#FFF' } }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 4 }}>
                    <ShieldCheck color={binThemeTokens.gold} />
                    <Typography variant="h5" fontWeight="950">Mission Completion Lock</Typography>
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 2 }}>
                        <Typography variant="body2" color="textSecondary">
                            Confirm the resolution of this sovereign mission. The following attributes are required for institutional protocol compliance.
                        </Typography>

                        <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 4 }}>
                            <Stack spacing={1}>
                                <Typography variant="caption" fontWeight="950">EVIDENCE CHECKLIST</Typography>
                                <Stack direction="row" spacing={2}>
                                    <Chip label="Before Photo" color={ticket.hasBeforePhoto ? "success" : "default"} size="small" />
                                    <Chip label="After Photo" color={ticket.hasAfterPhoto ? "success" : "default"} size="small" />
                                </Stack>
                            </Stack>
                        </Box>

                        <Box>
                            <Typography variant="subtitle2" fontWeight="900" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PenTool size={16} /> TENANT SIGN-OFF (DIGITAL)
                            </Typography>
                            <SignaturePad onSave={(sig) => setSignature(sig)} />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 4 }}>
                    <Button onClick={() => setShowCompleteModal(false)} sx={{ color: 'text.secondary' }}>Cancel</Button>
                    <Button 
                        onClick={handleFinalizeCompletion}
                        disabled={!signature || !canComplete || updating}
                        variant="contained"
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, borderRadius: 100, px: 4 }}
                    >
                        FINALISE MISSION
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
