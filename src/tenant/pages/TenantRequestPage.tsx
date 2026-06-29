import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, TextField,
    Select, MenuItem, FormControl, InputLabel, CircularProgress,
    IconButton, alpha
} from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, X, AlertCircle, ChevronLeft } from 'lucide-react';
import { db, storage, collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs, doc, getDoc, ref, uploadBytes, getDownloadURL } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { notifyTicketCreated, notifyEmergency } from '../../services/notificationService';
import TenantUnitLinkFallback from '../components/TenantUnitLinkFallback';

const sanitizeStorageFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'evidence.jpg';
const CATEGORY_PREFILL: Record<string, string> = {
    ac: 'AC',
    cooling: 'AC',
    electrical: 'electrical',
    plumbing: 'plumbing',
    civil: 'civil',
    handyman: 'civil',
    cleaning: 'cleaning',
    moving: 'moving',
    management: 'management',
    pest: 'pest control',
    'pest-control': 'pest control',
    elevator: 'elevator',
    security: 'security',
    other: 'other',
};

const normalizeCategoryPrefill = (value: string | null) => {
    const key = String(value || '').trim().toLowerCase();
    return CATEGORY_PREFILL[key] || '';
};

export default function TenantRequestPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();

    const tt = (key: string, fallback: string): string => {
        const value = t(key);
        return typeof value === 'string' && value.trim() ? value : fallback;
    };
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const initialCategory = normalizeCategoryPrefill(searchParams.get('category'));
    const [category, setCategory] = useState(initialCategory);
    const [priority, setPriority] = useState('normal');
    const [description, setDescription] = useState('');
    const [specificLocation, setSpecificLocation] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);

    const [propertyData, setPropertyData] = useState<any>(null);
    const [unitData, setUnitData] = useState<any>(null);
    const [residenceChecked, setResidenceChecked] = useState(false);
    const [photos, setPhotos] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [isOwnerSuspended, setIsOwnerSuspended] = useState(false);

    useEffect(() => {
        const fetchResidence = async () => {
            if (!user?.uid) {
                setResidenceChecked(true);
                return;
            }
            try {
                let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid)));
                if (unitSnap.empty && user.email) {
                    unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', user.email.toLowerCase())));
                }

                if (!unitSnap.empty) {
                    const uData: any = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() };
                    setUnitData(uData);

                    if (uData.propertyId) {
                        const propSnap = await getDoc(doc(db, 'properties', uData.propertyId));
                        if (propSnap.exists()) {
                            const pData: any = { id: propSnap.id, ...propSnap.data() };
                            setPropertyData(pData);

                            if (pData.ownerId) {
                                const ownerSnap = await getDoc(doc(db, 'users', pData.ownerId));
                                if (ownerSnap.exists()) {
                                    const ownerStatus = String(ownerSnap.data()?.status || '').toLowerCase();
                                    if (ownerStatus === 'suspended') setIsOwnerSuspended(true);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Fetch failed:', err);
            } finally {
                setResidenceChecked(true);
            }
        };
        fetchResidence();
    }, [user]);

    useEffect(() => {
        const nextCategory = normalizeCategoryPrefill(searchParams.get('category'));
        if (nextCategory) setCategory(nextCategory);
    }, [searchParams]);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files).slice(0, Math.max(5 - photos.length, 0));
            setPhotos(prev => [...prev, ...filesArray].slice(0, 5));
            const newPreviews = filesArray.map(file => URL.createObjectURL(file));
            setPreviews(prev => [...prev, ...newPreviews].slice(0, 5));
        }
    };

    const removePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const uploadPhotosToStorage = async (ticketId: string): Promise<string[]> => {
        if (photos.length === 0) throw new Error('At least one photo is required before dispatch.');
        const photoUrls: string[] = [];
        const timestamp = Date.now();

        try {
            for (let i = 0; i < photos.length; i++) {
                const file = photos[i];
                const fileName = `${timestamp}_${i + 1}_${sanitizeStorageFileName(file.name)}`;
                const storagePath = `maintenanceTickets/${ticketId}/tenant/${fileName}`;
                const fileRef = ref(storage, storagePath);

                await uploadBytes(fileRef, file, {
                    contentType: file.type || 'image/jpeg',
                    customMetadata: {
                        ticketId,
                        uploadedBy: user?.uid || '',
                        evidenceRole: 'tenant',
                    },
                });

                photoUrls.push(await getDownloadURL(fileRef));
            }
        } catch (err) {
            console.error('Photo upload failed:', err);
            throw new Error('Failed to upload evidence photos to secure ticket storage.');
        }

        return photoUrls;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanLocation = specificLocation.trim();
        if (!user || !unitData) {
            alert('No property assigned. Cannot create request.');
            return;
        }
        if (cleanLocation.length < 3) {
            alert('Please enter the exact service location, for example: Kitchen sink, Master bedroom AC, Bathroom ceiling.');
            return;
        }
        if (photos.length === 0) {
            alert('Please attach at least one photo before submitting. Photo evidence is required for dispatch.');
            return;
        }

        const locationSource = propertyData?.location || propertyData?.propertyLocation || propertyData?.geoPoint || null;
        const jobLocation = locationSource ? {
            lat: Number(locationSource.lat ?? locationSource.latitude ?? 0),
            lng: Number(locationSource.lng ?? locationSource.longitude ?? 0),
            latitude: Number(locationSource.lat ?? locationSource.latitude ?? 0),
            longitude: Number(locationSource.lng ?? locationSource.longitude ?? 0),
            address: propertyData?.address || propertyData?.locationAddress || '',
            source: 'property',
        } : null;

        if (!jobLocation || !jobLocation.lat || !jobLocation.lng) {
            alert('Please confirm exact service location before submitting. Property GPS location is missing — contact management.');
            return;
        }

        if (!unitData.propertyId) {
            alert('Property ID is missing. Cannot create request.');
            return;
        }

        setSubmitting(true);
        let createdTicketId = '';
        try {
            const docRef = await addDoc(collection(db, 'maintenanceTickets'), {
                requesterRole: 'tenant',
                tenantId: user.uid,
                tenantUid: user.uid,
                tenantName: user.displayName || 'Resident',
                tenantPhone: user.phoneNumber || '',
                tenantEmail: user.email || '',
                requesterId: user.uid,
                requesterEmail: user.email || '',
                reporterEmail: user.email || '',
                createdBy: user.uid,
                createdByUid: user.uid,
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
                description: description.trim(),
                specificLocation: cleanLocation,
                serviceLocationDetail: cleanLocation,
                serviceLocationRequired: true,
                serviceLocationVerified: true,
                photos: [],
                primaryPhotoUrl: null,
                jobLocation,
                photoEvidenceRequired: true,
                evidenceStatus: 'PENDING_TENANT_UPLOAD',
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
            createdTicketId = docRef.id;

            setUploadingPhotos(true);
            const photoUrls = await uploadPhotosToStorage(docRef.id);
            setUploadingPhotos(false);

            await updateDoc(doc(db, 'maintenanceTickets', docRef.id), {
                photos: photoUrls,
                primaryPhotoUrl: photoUrls[0] || null,
                evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
                evidenceUploadedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            if (priority === 'emergency') {
                notifyEmergency(docRef.id, user.displayName || 'Resident', propertyData?.name || 'Property', unitData.unitNumber || '').catch(console.warn);
            } else {
                notifyTicketCreated(docRef.id, user.displayName || 'Resident', category, priority).catch(console.warn);
            }
            navigate('/tenant/tickets');
        } catch (err) {
            console.error('Submit failed', err);
            if (createdTicketId) {
                updateDoc(doc(db, 'maintenanceTickets', createdTicketId), {
                    evidenceStatus: 'TENANT_EVIDENCE_UPLOAD_FAILED',
                    evidenceUploadError: err instanceof Error ? err.message : String(err),
                    updatedAt: serverTimestamp(),
                }).catch(console.warn);
            }
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
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{tt('dash.tenant.serviceLabel', 'SOVEREIGN SERVICE')}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', letterSpacing: -1 }}>{tt('dash.tenant.newRequest', 'New Maintenance Request')}</Typography>
                </Box>
            </Stack>

            {residenceChecked && !unitData ? (
                <TenantUnitLinkFallback
                    message="A unit must be verified before maintenance, moving, cleaning, or management requests can be dispatched."
                />
            ) : (
            <Paper sx={{ p: { xs: 3, md: 5 }, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, backdropFilter: 'blur(10px)' }}>
                {isOwnerSuspended && (
                    <Box sx={{ p: 3, mb: 4, bgcolor: alpha('#ef4444', 0.1), border: '1px solid #ef4444', borderRadius: 4 }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <AlertCircle color="#ef4444" size={24} />
                            <Box>
                                <Typography variant="body1" fontWeight="950" color="#ef4444">{tt('dash.tenant.dispatchSuspended', 'MAINTENANCE DISPATCH SUSPENDED')}</Typography>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>{tt('dash.tenant.dispatchSuspendedDesc', 'Service requests are temporarily disabled for this property due to account status. Please contact your property owner/manager.')}</Typography>
                            </Box>
                        </Stack>
                    </Box>
                )}
                <form onSubmit={handleSubmit}>
                    <Stack spacing={4}>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)', transformOrigin: isRTL ? 'top right' : 'top left', right: isRTL ? 28 : 'auto' }}>{tt('dash.tenant.category', 'Category')}</InputLabel>
                                    <Select data-testid="tenant-request-category" inputProps={{ 'data-testid': 'tenant-request-category-input' }} value={category} label={tt('dash.tenant.category', 'Category')} onChange={(e) => setCategory(e.target.value)} required disabled={isOwnerSuspended} sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF', textAlign: isRTL ? 'right' : 'left' }}>
                                        <MenuItem value="AC">{tt('dash.tenant.catAc', 'AC / Cooling')}</MenuItem>
                                        <MenuItem value="electrical">{tt('dash.tenant.catElec', 'Electrical / Power')}</MenuItem>
                                        <MenuItem value="plumbing">{tt('dash.tenant.catPlumb', 'Plumbing / Water')}</MenuItem>
                                        <MenuItem value="civil">{tt('dash.tenant.catHandy', 'Handyman / Carpentry')}</MenuItem>
                                        <MenuItem value="cleaning">{tt('dash.tenant.catClean', 'Deep Cleaning')}</MenuItem>
                                        <MenuItem value="moving">{tt('dash.tenant.catMoving', 'Moving / Packing')}</MenuItem>
                                        <MenuItem value="management">{tt('dash.tenant.catManagement', 'Management Request')}</MenuItem>
                                        <MenuItem value="pest control">{tt('dash.tenant.catPest', 'Pest Control')}</MenuItem>
                                        <MenuItem value="elevator">{tt('dash.tenant.catElev', 'Elevator Issue')}</MenuItem>
                                        <MenuItem value="security">{tt('dash.tenant.catSec', 'Security / CCTV')}</MenuItem>
                                        <MenuItem value="other">{tt('dash.tenant.catOther', 'Other Maintenance')}</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)', transformOrigin: isRTL ? 'top right' : 'top left', right: isRTL ? 28 : 'auto' }}>{tt('dash.tenant.priority', 'Priority')}</InputLabel>
                                    <Select data-testid="tenant-request-priority" inputProps={{ 'data-testid': 'tenant-request-priority-input' }} value={priority} label={tt('dash.tenant.priority', 'Priority')} onChange={(e) => setPriority(e.target.value)} required disabled={isOwnerSuspended} sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF', textAlign: isRTL ? 'right' : 'left' }}>
                                        <MenuItem value="normal">{tt('dash.tenant.prioNormal', 'Normal (Standard 24h)')}</MenuItem>
                                        <MenuItem value="urgent">{tt('dash.tenant.prioUrgent', 'Urgent (Priority 4h)')}</MenuItem>
                                        <MenuItem value="emergency" sx={{ color: '#ef4444', fontWeight: 900 }}>{tt('dash.tenant.prioEmerg', 'EMERGENCY (Safety/SOS 1h)')}</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        <TextField fullWidth required label={tt('dash.tenant.specificLocation', 'Exact Service Location (room / area / asset)')} data-testid="tenant-request-location" value={specificLocation} onChange={(e) => setSpecificLocation(e.target.value)} placeholder={tt('dash.tenant.specificLocationHint', 'Example: Kitchen sink, Master bedroom AC, Bathroom ceiling')} disabled={isOwnerSuspended} helperText={tt('dash.tenant.specificLocationRequired', 'Required for dispatch accuracy. This tells the technician exactly where to go.')} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.45)' }, '& label': { transformOrigin: isRTL ? 'top right' : 'top left', left: 'auto', right: isRTL ? 28 : 'auto' } }} />

                        <TextField fullWidth multiline rows={5} label={tt('dash.tenant.issueDesc', 'Issue Description')} data-testid="tenant-request-description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder={tt('dash.tenant.issueDescHint', 'Please describe the issue in detail...')} disabled={isOwnerSuspended} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& label': { transformOrigin: isRTL ? 'top right' : 'top left', left: 'auto', right: isRTL ? 28 : 'auto' } }} />

                        <Box>
                            <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}><Camera size={18} /> {tt('dash.tenant.attachPhotos', 'ATTACH PHOTOS')}</Typography>
                            {uploadingPhotos && <Box sx={{ mb: 2, p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}><CircularProgress size={20} sx={{ color: binThemeTokens.gold }} /><Typography variant="caption" sx={{ color: binThemeTokens.gold }}>Uploading photos to secure ticket evidence storage...</Typography></Box>}
                            <Grid container spacing={2}>
                                {previews.map((src, i) => <Grid item xs={4} md={3} key={i}><Box sx={{ position: 'relative', borderRadius: 3, overflow: 'hidden', pt: '100%', border: '1px solid rgba(255,255,255,0.1)' }}><img src={src} alt="issue" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} /><IconButton size="small" onClick={() => removePhoto(i)} sx={{ position: 'absolute', top: 5, right: 5, bgcolor: 'rgba(0,0,0,0.5)', color: '#FFF', '&:hover': { bgcolor: '#ef4444' } }}><X size={14} /></IconButton></Box></Grid>)}
                                {previews.length < 5 && !uploadingPhotos && <Grid item xs={4} md={3}><Button component="label" disabled={isOwnerSuspended} sx={{ width: '100%', pt: '100%', position: 'relative', bgcolor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 3, color: 'rgba(255,255,255,0.3)', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: binThemeTokens.gold, color: binThemeTokens.gold } }}><Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}><Camera size={24} /><Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 900 }}>{tt('dash.tenant.addPhoto', 'ADD')}</Typography></Box><input type="file" hidden accept="image/*" multiple onChange={handlePhotoChange} /></Button></Grid>}
                            </Grid>
                        </Box>

                        <Box sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 3, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="flex-start" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                <AlertCircle size={20} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="caption" fontWeight="950" sx={{ color: binThemeTokens.gold, display: 'block' }}>{tt('dash.tenant.slaCompliance', 'SLA COMPLIANCE')}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{tt('dash.tenant.slaDesc', 'By submitting this request, you authorize BIN GROUP technicians to access your unit during standard service hours.')} {priority === 'emergency' && tt('dash.tenant.slaDescEmerg', ' EMERGENCY requests trigger immediate dispatch.')}</Typography>
                                </Box>
                            </Stack>
                        </Box>

                        <Button type="submit" data-testid="tenant-request-submit" variant="contained" size="large" disabled={submitting || uploadingPhotos || isOwnerSuspended || photos.length === 0 || specificLocation.trim().length < 3} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, borderRadius: 4, fontSize: '1.1rem', boxShadow: `0 12px 24px -8px ${alpha(binThemeTokens.gold, 0.4)}`, '&:hover': { bgcolor: '#b4954e' } }}>
                            {submitting || uploadingPhotos ? <CircularProgress size={24} color="inherit" /> : tt('dash.tenant.dispatchRequest', 'DISPATCH REQUEST')}
                        </Button>
                    </Stack>
                </form>
            </Paper>
            )}
        </Box>
    );
}
