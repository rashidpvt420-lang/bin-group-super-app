import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Grid, Stack, Button, TextField, 
    Select, MenuItem, FormControl, InputLabel, CircularProgress,
    IconButton, alpha, Divider, Tooltip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Camera, X, MapPin, AlertCircle, ChevronLeft, Info } from 'lucide-react';
import { db, storage, collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, ref, uploadBytes, getDownloadURL } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { notifyTicketCreated, notifyEmergency } from '../../services/notificationService';

export default function TenantRequestPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    
    const [category, setCategory] = useState('');
    const [priority, setPriority] = useState('normal');
    const [description, setDescription] = useState('');
    const [specificLocation, setSpecificLocation] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);
    
    const [propertyData, setPropertyData] = useState<any>(null);
    const [unitData, setUnitData] = useState<any>(null);
    const [photos, setPhotos] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [isOwnerSuspended, setIsOwnerSuspended] = useState(false);

    useEffect(() => {
        const fetchResidence = async () => {
            if (!user?.uid) return;
            try {
                let unitSnap = await getDocs(query(collection(db, "units"), where("tenantId", "==", user.uid)));
                if (unitSnap.empty && user.email) {
                    unitSnap = await getDocs(query(collection(db, "units"), where("tenantEmail", "==", user.email.toLowerCase())));
                }
                
                if (!unitSnap.empty) {
                    const uData: any = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() };
                    setUnitData(uData);

                    if (uData.propertyId) {
                        const propSnap = await getDoc(doc(db, "properties", uData.propertyId));
                        if (propSnap.exists()) {
                            const pData: any = { id: propSnap.id, ...propSnap.data() };
                            setPropertyData(pData);
                            
                            if (pData.ownerId) {
                                const ownerSnap = await getDoc(doc(db, "users", pData.ownerId));
                                if (ownerSnap.exists()) {
                                    const ownerStatus = String(ownerSnap.data()?.status || '').toLowerCase();
                                    if (ownerStatus === 'suspended') {
                                        setIsOwnerSuspended(true);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Fetch failed:", err);
            }
        };
        fetchResidence();
    }, [user]);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            setPhotos(prev => [...prev, ...filesArray]);
            
            const newPreviews = filesArray.map(file => URL.createObjectURL(file));
            setPreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const uploadPhotosToStorage = async (): Promise<string[]> => {
        if (photos.length === 0) return [];

        const photoUrls: string[] = [];
        const timestamp = Date.now();

        try {
            for (let i = 0; i < photos.length; i++) {
                const file = photos[i];
                const fileName = `${timestamp}_${file.name}`;
                const storagePath = `maintenanceTickets/${user?.uid}/${fileName}`;
                const fileRef = ref(storage, storagePath);

                // Upload file to Firebase Storage
                await uploadBytes(fileRef, file);

                // Get download URL
                const downloadUrl = await getDownloadURL(fileRef);
                photoUrls.push(downloadUrl);
            }
        } catch (err) {
            console.error("Photo upload failed:", err);
            throw new Error("Failed to upload photos to Storage");
        }

        return photoUrls;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !unitData) {
            alert('No property assigned. Cannot create request.');
            return;
        }

        // Derive jobLocation from property data
        const locationSource = propertyData?.location || propertyData?.propertyLocation || propertyData?.geoPoint || null;
        const jobLocation = locationSource ? {
            lat: Number(locationSource.lat ?? locationSource.latitude ?? 0),
            lng: Number(locationSource.lng ?? locationSource.longitude ?? 0),
            latitude: Number(locationSource.lat ?? locationSource.latitude ?? 0),
            longitude: Number(locationSource.lng ?? locationSource.longitude ?? 0),
            address: propertyData?.address || propertyData?.locationAddress || '',
            source: 'property',
        } : null;

        // Block submission if no location — technician cannot navigate
        if (!jobLocation || !jobLocation.lat || !jobLocation.lng) {
            alert('Please confirm exact service location before submitting. Property GPS location is missing — contact management.');
            return;
        }

        if (!unitData.propertyId) {
            alert('Property ID is missing. Cannot create request.');
            return;
        }

        setSubmitting(true);
        try {
            setUploadingPhotos(true);
            const photoUrls = await uploadPhotosToStorage();
            setUploadingPhotos(false);

            const docRef = await addDoc(collection(db, 'maintenanceTickets'), {
                requesterRole: 'tenant',
                tenantId: user.uid,
                tenantUid: user.uid,
                tenantName: user.displayName || 'Resident',
                tenantPhone: user.phoneNumber || '',
                propertyId: unitData.propertyId || '',
                propertyName: propertyData?.name || propertyData?.propertyName || '',
                ownerId: propertyData?.ownerId || '',
                ownerUid: propertyData?.ownerUid || propertyData?.ownerId || '',
                ownerEmail: propertyData?.ownerEmail || '',
                unitId: unitData.id,
                unitNumber: unitData.unitNumber || '',
                floor: unitData.floorNumber || '',
                category,
                priority,
                description,
                specificLocation,
                photos: photoUrls,
                jobLocation,
                photoEvidenceRequired: true,
                source: 'TENANT_PORTAL',
                status: 'OPEN',
                dispatchStatus: 'PENDING_ASSIGNMENT',
                trackingStatus: 'WAITING_FOR_TECHNICIAN',
                technicianId: null,
                assignedTechnicianId: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                slaMinutes: priority === 'emergency' ? 60 : priority === 'urgent' ? 240 : 1440,
            });

            if (priority === 'emergency') {
                notifyEmergency(
                    docRef.id,
                    user.displayName || 'Resident',
                    propertyData?.name || 'Property',
                    unitData.unitNumber || ''
                ).catch(console.warn);
            } else {
                notifyTicketCreated(docRef.id, user.displayName || 'Resident', category, priority).catch(console.warn);
            }
            navigate('/tenant/tickets');
        } catch (err) {
            console.error('Submit failed', err);
            alert('Failed to submit request: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setSubmitting(false);
            setUploadingPhotos(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', pb: 10, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" spacing={2} sx={{ mb: 4 }}>
                <IconButton onClick={() => navigate(-1)} sx={{ color: 'rgba(255,255,255,0.5)', transform: isRTL ? 'rotate(180deg)' : 'none' }}>
                    <ChevronLeft />
                </IconButton>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left', width: '100%' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('dash.tenant.serviceLabel') || 'SOVEREIGN SERVICE'}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', letterSpacing: -1 }}>{t('dash.tenant.newRequest') || 'New Maintenance Request'}</Typography>
                </Box>
            </Stack>

            <Paper sx={{ p: { xs: 3, md: 5 }, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, backdropFilter: 'blur(10px)' }}>
                {isOwnerSuspended && (
                    <Box sx={{ p: 3, mb: 4, bgcolor: alpha('#ef4444', 0.1), border: '1px solid #ef4444', borderRadius: 4 }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <AlertCircle color="#ef4444" size={24} />
                            <Box>
                                <Typography variant="body1" fontWeight="950" color="#ef4444">
                                    {t('dash.tenant.dispatchSuspended') || 'MAINTENANCE DISPATCH SUSPENDED'}
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
                                    {t('dash.tenant.dispatchSuspendedDesc') || 'Service requests are temporarily disabled for this property due to account status. Please contact your property owner/manager.'}
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>
                )}
                <form onSubmit={handleSubmit}>
                    <Stack spacing={4}>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)', transformOrigin: isRTL ? 'top right' : 'top left', right: isRTL ? 28 : 'auto' }}>{t('dash.tenant.category') || 'Category'}</InputLabel>
                                    <Select value={category} label={t('dash.tenant.category') || 'Category'} onChange={(e) => setCategory(e.target.value)} required disabled={isOwnerSuspended} sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF', textAlign: isRTL ? 'right' : 'left' }}>
                                        <MenuItem value="AC">{t('dash.tenant.catAc') || 'AC / Cooling'}</MenuItem>
                                        <MenuItem value="electrical">{t('dash.tenant.catElec') || 'Electrical / Power'}</MenuItem>
                                        <MenuItem value="plumbing">{t('dash.tenant.catPlumb') || 'Plumbing / Water'}</MenuItem>
                                        <MenuItem value="civil">{t('dash.tenant.catHandy') || 'Handyman / Carpentry'}</MenuItem>
                                        <MenuItem value="cleaning">{t('dash.tenant.catClean') || 'Deep Cleaning'}</MenuItem>
                                        <MenuItem value="pest control">{t('dash.tenant.catPest') || 'Pest Control'}</MenuItem>
                                        <MenuItem value="elevator">{t('dash.tenant.catElev') || 'Elevator Issue'}</MenuItem>
                                        <MenuItem value="security">{t('dash.tenant.catSec') || 'Security / CCTV'}</MenuItem>
                                        <MenuItem value="other">{t('dash.tenant.catOther') || 'Other Maintenance'}</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)', transformOrigin: isRTL ? 'top right' : 'top left', right: isRTL ? 28 : 'auto' }}>{t('dash.tenant.priority') || 'Priority'}</InputLabel>
                                    <Select value={priority} label={t('dash.tenant.priority') || 'Priority'} onChange={(e) => setPriority(e.target.value)} required disabled={isOwnerSuspended} sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF', textAlign: isRTL ? 'right' : 'left' }}>
                                        <MenuItem value="normal">{t('dash.tenant.prioNormal') || 'Normal (Standard 24h)'}</MenuItem>
                                        <MenuItem value="urgent">{t('dash.tenant.prioUrgent') || 'Urgent (Priority 4h)'}</MenuItem>
                                        <MenuItem value="emergency" sx={{ color: '#ef4444', fontWeight: 900 }}>{t('dash.tenant.prioEmerg') || 'EMERGENCY (Safety/SOS 1h)'}</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        <TextField 
                            fullWidth 
                            label={t('dash.tenant.specificLocation') || "Specific Location (e.g. Master Bedroom, Kitchen Sink)"} 
                            value={specificLocation} 
                            onChange={(e) => setSpecificLocation(e.target.value)} 
                            placeholder={t('dash.tenant.specificLocationHint') || "Helps our technician find the issue faster"}
                            disabled={isOwnerSuspended}
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& label': { transformOrigin: isRTL ? 'top right' : 'top left', left: 'auto', right: isRTL ? 28 : 'auto' } }} 
                        />

                        <TextField 
                            fullWidth multiline rows={5} 
                            label={t('dash.tenant.issueDesc') || "Issue Description"} 
                            value={description} 
                            onChange={(e) => setDescription(e.target.value)} 
                            required 
                            placeholder={t('dash.tenant.issueDescHint') || "Please describe the issue in detail..."}
                            disabled={isOwnerSuspended}
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& label': { transformOrigin: isRTL ? 'top right' : 'top left', left: 'auto', right: isRTL ? 28 : 'auto' } }} 
                        />

                        {/* Photo Upload Section */}
                        <Box>
                            <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Camera size={18} /> {t('dash.tenant.attachPhotos') || 'ATTACH PHOTOS'}
                            </Typography>
                            {uploadingPhotos && (
                                <Box sx={{ mb: 2, p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <CircularProgress size={20} sx={{ color: binThemeTokens.gold }} />
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>Uploading photos to Storage...</Typography>
                                </Box>
                            )}
                            <Grid container spacing={2}>
                                {previews.map((src, i) => (
                                    <Grid item xs={4} md={3} key={i}>
                                        <Box sx={{ position: 'relative', borderRadius: 3, overflow: 'hidden', pt: '100%', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <img src={src} alt="issue" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <IconButton 
                                                size="small" 
                                                onClick={() => removePhoto(i)}
                                                sx={{ position: 'absolute', top: 5, right: 5, bgcolor: 'rgba(0,0,0,0.5)', color: '#FFF', '&:hover': { bgcolor: '#ef4444' } }}
                                            >
                                                <X size={14} />
                                            </IconButton>
                                        </Box>
                                    </Grid>
                                ))}
                                {previews.length < 5 && !uploadingPhotos && (
                                    <Grid item xs={4} md={3}>
                                        <Button
                                            component="label"
                                            disabled={isOwnerSuspended}
                                            sx={{ 
                                                width: '100%', 
                                                pt: '100%', 
                                                position: 'relative', 
                                                bgcolor: 'rgba(255,255,255,0.02)', 
                                                border: '1px dashed rgba(255,255,255,0.1)', 
                                                borderRadius: 3,
                                                color: 'rgba(255,255,255,0.3)',
                                                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: binThemeTokens.gold, color: binThemeTokens.gold }
                                            }}
                                        >
                                            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                                                <Camera size={24} />
                                                <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 900 }}>{t('dash.tenant.addPhoto') || 'ADD'}</Typography>
                                            </Box>
                                            <input type="file" hidden accept="image/*" multiple onChange={handlePhotoChange} />
                                        </Button>
                                    </Grid>
                                )}
                            </Grid>
                        </Box>

                        <Box sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 3, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="flex-start" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                <AlertCircle size={20} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="caption" fontWeight="950" sx={{ color: binThemeTokens.gold, display: 'block' }}>{t('dash.tenant.slaCompliance') || 'SLA COMPLIANCE'}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                        {t('dash.tenant.slaDesc') || 'By submitting this request, you authorize BIN GROUP technicians to access your unit during standard service hours.'} 
                                        {priority === 'emergency' && (t('dash.tenant.slaDescEmerg') || " EMERGENCY requests trigger immediate dispatch.")}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>

                        <Button 
                            type="submit" 
                            variant="contained" 
                            size="large" 
                            disabled={submitting || uploadingPhotos || isOwnerSuspended} 
                            sx={{ 
                                bgcolor: binThemeTokens.gold, 
                                color: '#000', 
                                fontWeight: 950, 
                                py: 2, 
                                borderRadius: 4,
                                fontSize: '1.1rem',
                                boxShadow: `0 12px 24px -8px ${alpha(binThemeTokens.gold, 0.4)}`,
                                '&:hover': { bgcolor: '#b4954e' }
                            }}
                        >
                            {submitting || uploadingPhotos ? <CircularProgress size={24} color="inherit" /> : (t('dash.tenant.dispatchRequest') || 'DISPATCH REQUEST')}
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Box>
    );
}
