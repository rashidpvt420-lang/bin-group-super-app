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
import { binThemeTokens } from '../../theme/binGroupTheme';
import { notifyTicketCreated, notifyEmergency } from '../../services/notificationService';

export default function TenantRequestPage() {
    const { user } = useRole();
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
                            setPropertyData({ id: propSnap.id, ...propSnap.data() });
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
            alert("No property assigned. Cannot create request.");
            return;
        }

        setSubmitting(true);
        try {
            setUploadingPhotos(true);
            // Upload photos to Firebase Storage and get URLs
            const photoUrls = await uploadPhotosToStorage();
            setUploadingPhotos(false);

            const docRef = await addDoc(collection(db, 'maintenanceTickets'), {
                tenantId: user.uid,
                tenantUid: user.uid,
                tenantName: user.displayName || 'Resident',
                tenantPhone: user.phoneNumber || '',
                propertyId: unitData.propertyId || '',
                propertyName: propertyData?.name || propertyData?.propertyName || 'BIN TEST TOWER',
                ownerId: propertyData?.ownerId || '',
                ownerEmail: propertyData?.ownerEmail || '',
                unitId: unitData.id,
                unitNumber: unitData.unitNumber || '',
                floor: unitData.floorNumber || '',
                category,
                priority,
                description,
                specificLocation,
                photos: photoUrls,
                photoEvidenceRequired: true,
                source: 'TENANT_PORTAL',
                status: 'OPEN',
                technicianId: null,
                assignedTechnicianId: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                slaMinutes: priority === 'emergency' ? 60 : priority === 'urgent' ? 240 : 1440
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
            console.error("Submit failed", err);
            alert("Failed to submit request: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setSubmitting(false);
            setUploadingPhotos(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', pb: 10 }}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                <IconButton onClick={() => navigate(-1)} sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    <ChevronLeft />
                </IconButton>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>SOVEREIGN SERVICE</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', letterSpacing: -1 }}>New Maintenance Request</Typography>
                </Box>
            </Stack>

            <Paper sx={{ p: { xs: 3, md: 5 }, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, backdropFilter: 'blur(10px)' }}>
                <form onSubmit={handleSubmit}>
                    <Stack spacing={4}>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Category</InputLabel>
                                    <Select value={category} label="Category" onChange={(e) => setCategory(e.target.value)} required sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}>
                                        <MenuItem value="AC">AC / Cooling</MenuItem>
                                        <MenuItem value="electrical">Electrical / Power</MenuItem>
                                        <MenuItem value="plumbing">Plumbing / Water</MenuItem>
                                        <MenuItem value="civil">Handyman / Carpentry</MenuItem>
                                        <MenuItem value="cleaning">Deep Cleaning</MenuItem>
                                        <MenuItem value="pest control">Pest Control</MenuItem>
                                        <MenuItem value="elevator">Elevator Issue</MenuItem>
                                        <MenuItem value="security">Security / CCTV</MenuItem>
                                        <MenuItem value="other">Other Maintenance</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Priority</InputLabel>
                                    <Select value={priority} label="Priority" onChange={(e) => setPriority(e.target.value)} required sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}>
                                        <MenuItem value="normal">Normal (Standard 24h)</MenuItem>
                                        <MenuItem value="urgent">Urgent (Priority 4h)</MenuItem>
                                        <MenuItem value="emergency" sx={{ color: '#ef4444', fontWeight: 900 }}>EMERGENCY (Safety/SOS 1h)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        <TextField 
                            fullWidth 
                            label="Specific Location (e.g. Master Bedroom, Kitchen Sink)" 
                            value={specificLocation} 
                            onChange={(e) => setSpecificLocation(e.target.value)} 
                            placeholder="Helps our technician find the issue faster"
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' } }} 
                        />

                        <TextField 
                            fullWidth multiline rows={5} 
                            label="Issue Description" 
                            value={description} 
                            onChange={(e) => setDescription(e.target.value)} 
                            required 
                            placeholder="Please describe the issue in detail..."
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' } }} 
                        />

                        {/* Photo Upload Section */}
                        <Box>
                            <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Camera size={18} /> ATTACH PHOTOS (Firebase Storage)
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
                                                <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 900 }}>ADD</Typography>
                                            </Box>
                                            <input type="file" hidden accept="image/*" multiple onChange={handlePhotoChange} />
                                        </Button>
                                    </Grid>
                                )}
                            </Grid>
                        </Box>

                        <Box sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 3, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <AlertCircle size={20} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="caption" fontWeight="950" sx={{ color: binThemeTokens.gold, display: 'block' }}>SLA COMPLIANCE</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                        By submitting this request, you authorize BIN GROUP technicians to access your unit during standard service hours. 
                                        {priority === 'emergency' && " EMERGENCY requests trigger immediate dispatch."}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>

                        <Button 
                            type="submit" 
                            variant="contained" 
                            size="large" 
                            disabled={submitting || uploadingPhotos} 
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
                            {submitting || uploadingPhotos ? <CircularProgress size={24} color="inherit" /> : 'DISPATCH REQUEST'}
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Box>
    );
}
