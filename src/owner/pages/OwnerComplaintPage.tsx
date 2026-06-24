/**
 * BIN GROUP — OwnerComplaintPage
 * Owner creates a maintenance complaint against one of their owned properties/units.
 * Full GPS location block enforced, requesterRole = "owner".
 */

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
    Box, Typography, Paper, Grid, TextField, MenuItem,
    Button, Stack, CircularProgress, Alert, FormControl,
    InputLabel, Select, Divider, IconButton, alpha
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Camera, X, ChevronLeft, MapPin, AlertCircle } from 'lucide-react';
import {
    db, storage, collection, addDoc, serverTimestamp,
    query, where, getDocs, doc, getDoc,
    ref, uploadBytes, getDownloadURL
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { notifyTicketCreated, notifyAdmins } from '../../services/notificationService';

const CATEGORIES = [
    'AC / Cooling', 'Electrical / Power', 'Plumbing / Water',
    'Handyman / Carpentry', 'Deep Cleaning', 'Pest Control',
    'Elevator Issue', 'Security / CCTV', 'Other Maintenance',
];

export default function OwnerComplaintPage() {
    const { t } = useLanguage();
    const { user } = useRole();
    const navigate = useNavigate();

    const [properties, setProperties] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [selectedPropertyId, setSelectedPropertyId] = useState('');
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const [category, setCategory] = useState('');
    const [priority, setPriority] = useState('normal');
    const [description, setDescription] = useState('');
    const [specificLocation, setSpecificLocation] = useState('');
    const [photos, setPhotos] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);
    const [locationError, setLocationError] = useState('');

    // Load owner's properties
    useEffect(() => {
        if (!user?.uid && !user?.email) return;
        const fetchProperties = async () => {
            const q = query(
                collection(db, 'properties'),
                where('ownerId', '==', user.uid)
            );
            const snap = await getDocs(q);
            if (snap.empty && user.email) {
                const q2 = query(collection(db, 'properties'), where('ownerEmail', '==', user.email));
                const snap2 = await getDocs(q2);
                setProperties(snap2.docs.map(d => ({ id: d.id, ...d.data() })));
            } else {
                setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
        };
        fetchProperties();
    }, [user]);

    // Load units when property is selected
    useEffect(() => {
        if (!selectedPropertyId) { setUnits([]); return; }
        const fetchUnits = async () => {
            const q = query(collection(db, 'units'), where('propertyId', '==', selectedPropertyId));
            const snap = await getDocs(q);
            setUnits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchUnits();
    }, [selectedPropertyId]);

    const selectedProperty = properties.find(p => p.id === selectedPropertyId);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            setPhotos(prev => [...prev, ...files]);
            setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
        }
    };

    const removePhoto = (i: number) => {
        setPhotos(prev => prev.filter((_, idx) => idx !== i));
        setPreviews(prev => prev.filter((_, idx) => idx !== i));
    };

    const uploadPhotos = async (): Promise<string[]> => {
        if (!photos.length) return [];
        const urls: string[] = [];
        for (const file of photos) {
            const fileRef = ref(storage, `maintenanceTickets/${user?.uid}/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            urls.push(await getDownloadURL(fileRef));
        }
        return urls;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocationError('');

        if (!selectedPropertyId) {
            alert('Please select a property.');
            return;
        }

        // Derive job location from property
        const locSource = selectedProperty?.location || selectedProperty?.propertyLocation || selectedProperty?.geoPoint || null;
        const jobLocation = locSource ? {
            lat: Number(locSource.lat ?? locSource.latitude ?? 0),
            lng: Number(locSource.lng ?? locSource.longitude ?? 0),
            latitude: Number(locSource.lat ?? locSource.latitude ?? 0),
            longitude: Number(locSource.lng ?? locSource.longitude ?? 0),
            address: selectedProperty?.address || '',
            source: 'property',
        } : null;

        if (!jobLocation || !jobLocation.lat || !jobLocation.lng) {
            setLocationError('Please confirm exact service location before submitting. Property GPS location is missing — contact admin to add it.');
            return;
        }

        setSubmitting(true);
        try {
            setUploadingPhotos(true);
            const photoUrls = await uploadPhotos();
            setUploadingPhotos(false);

            const selectedUnit = units.find(u => u.id === selectedUnitId);

            const docRef = await addDoc(collection(db, 'maintenanceTickets'), {
                requesterRole: 'owner',
                ownerId: user!.uid,
                ownerUid: user!.uid,
                ownerName: user!.displayName || 'Owner',
                ownerPhone: user!.phoneNumber || '',
                ownerEmail: user!.email || '',
                propertyId: selectedPropertyId,
                propertyName: selectedProperty?.name || selectedProperty?.propertyName || '',
                unitId: selectedUnitId || null,
                unitNumber: selectedUnit?.unitNumber || null,
                floor: selectedUnit?.floorNumber || null,
                tenantId: selectedUnit?.tenantId || null,
                tenantName: selectedUnit?.tenantName || null,
                tenantEmail: selectedUnit?.tenantEmail || null,
                category,
                priority,
                description,
                specificLocation,
                photos: photoUrls,
                jobLocation,
                source: 'OWNER_PORTAL',
                status: 'OPEN',
                dispatchStatus: 'PENDING_ASSIGNMENT',
                trackingStatus: 'WAITING_FOR_TECHNICIAN',
                assignedTechnicianId: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                slaMinutes: priority === 'emergency' ? 60 : priority === 'urgent' ? 240 : 1440,
            });

            await notifyAdmins({
                type: 'OWNER_COMPLAINT',
                title: `Owner Complaint: ${category}`,
                body: `${user!.displayName || 'Owner'} filed a ${priority} complaint at ${selectedProperty?.name || 'a property'}. Requires assignment.`,
                ticketId: docRef.id,
                metadata: { category, priority, propertyId: selectedPropertyId },
            });

            navigate(`/owner/ticket/${docRef.id}`);
        } catch (err) {
            console.error('Owner complaint submit failed:', err);
            alert('Failed to submit: ' + (err instanceof Error ? err.message : String(err)));
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
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>
                        OWNER SERVICES
                    </Typography>
                    <Typography variant="h4" fontWeight="950" color="#FFF">
                        File a Complaint
                    </Typography>
                </Box>
            </Stack>

            {locationError && (
                <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }} onClose={() => setLocationError('')}>
                    {locationError}
                </Alert>
            )}

            <Paper sx={{ p: { xs: 3, md: 5 }, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <form onSubmit={handleSubmit}>
                    <Stack spacing={4}>

                        {/* Property + Unit */}
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth required>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Property</InputLabel>
                                    <Select
                                        value={selectedPropertyId}
                                        label="Property"
                                        onChange={(e) => { setSelectedPropertyId(e.target.value); setSelectedUnitId(''); }}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}
                                    >
                                        {properties.map(p => (
                                            <MenuItem key={p.id} value={p.id}>
                                                {p.name || p.propertyName || p.id}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth disabled={!units.length}>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>{t('common.unit_optional')}</InputLabel>
                                    <Select
                                        value={selectedUnitId}
                                        label="Unit (Optional)"
                                        onChange={(e) => setSelectedUnitId(e.target.value)}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}
                                    >
                                        <MenuItem value="">Common Area / Whole Property</MenuItem>
                                        {units.map(u => (
                                            <MenuItem key={u.id} value={u.id}>
                                                Unit {u.unitNumber} {u.tenantName ? `(${u.tenantName})` : ''}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        {/* Property location indicator */}
                        {selectedProperty && (
                            <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <MapPin size={18} color={
                                    (selectedProperty?.location || selectedProperty?.propertyLocation)
                                        ? '#10b981'
                                        : '#f87171'
                                } />
                                <Typography variant="caption" fontWeight="900" sx={{
                                    color: (selectedProperty?.location || selectedProperty?.propertyLocation)
                                        ? '#10b981'
                                        : '#f87171'
                                }}>
                                    {(selectedProperty?.location || selectedProperty?.propertyLocation)
                                        ? 'GPS location available — tracking will work'
                                        : 'GPS location missing — admin must add property coordinates'}
                                </Typography>
                            </Box>
                        )}

                        {/* Category + Priority */}
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth required>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Category</InputLabel>
                                    <Select
                                        value={category}
                                        label="Category"
                                        onChange={(e) => setCategory(e.target.value)}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}
                                    >
                                        {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth required>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Priority</InputLabel>
                                    <Select
                                        value={priority}
                                        label="Priority"
                                        onChange={(e) => setPriority(e.target.value)}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }}
                                    >
                                        <MenuItem value="normal">Normal (Standard 24h)</MenuItem>
                                        <MenuItem value="urgent">{t('common.urgent_priority')}</MenuItem>
                                        <MenuItem value="emergency" sx={{ color: '#ef4444', fontWeight: 900 }}>EMERGENCY (Safety 1h)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        <TextField
                            fullWidth
                            label="Specific Location (e.g. Lobby, Roof, Unit 301)"
                            value={specificLocation}
                            onChange={(e) => setSpecificLocation(e.target.value)}
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' } }}
                        />

                        <TextField
                            fullWidth multiline rows={5}
                            label="Issue Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                            placeholder="Describe the issue in detail..."
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' } }}
                        />

                        {/* Photo Upload */}
                        <Box>
                            <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Camera size={18} /> ATTACH PHOTOS
                            </Typography>
                            {uploadingPhotos && (
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, p: 2, bgcolor: alpha(binThemeTokens.gold, 0.08), borderRadius: 2 }}>
                                    <CircularProgress size={18} sx={{ color: binThemeTokens.gold }} />
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>Uploading photos…</Typography>
                                </Stack>
                            )}
                            <Stack direction="row" spacing={2} flexWrap="wrap">
                                {previews.map((src, i) => (
                                    <Box key={i} sx={{ position: 'relative', width: 100, height: 100, borderRadius: 2, overflow: 'hidden' }}>
                                        <img src={src} alt={`photo-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <IconButton
                                            size="small"
                                            onClick={() => removePhoto(i)}
                                            sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.6)', color: '#FFF', '&:hover': { bgcolor: '#ef4444' }, p: 0.3 }}
                                        >
                                            <X size={13} />
                                        </IconButton>
                                    </Box>
                                ))}
                                {previews.length < 5 && (
                                    <Button
                                        component="label"
                                        sx={{ width: 100, height: 100, border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 2, color: 'rgba(255,255,255,0.3)', flexDirection: 'column', '&:hover': { borderColor: binThemeTokens.gold, color: binThemeTokens.gold } }}
                                    >
                                        <Camera size={22} />
                                        <Typography variant="caption" sx={{ mt: 0.5, fontWeight: 900 }}>ADD</Typography>
                                        <input type="file" hidden accept="image/*" multiple onChange={handlePhotoChange} />
                                    </Button>
                                )}
                            </Stack>
                        </Box>

                        <Button
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={submitting || uploadingPhotos || !selectedPropertyId || !category || !description}
                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, borderRadius: 4, fontSize: '1rem', boxShadow: `0 10px 24px -6px ${alpha(binThemeTokens.gold, 0.4)}` }}
                        >
                            {submitting || uploadingPhotos ? <CircularProgress size={22} color="inherit" /> : 'SUBMIT COMPLAINT'}
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Box>
    );
}
