import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    FormControl,
    Grid,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
    alpha,
} from '@mui/material';
import { AlertCircle, Camera, ChevronLeft, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    collection,
    db,
    doc,
    functions,
    getDoc,
    getDocs,
    getDownloadURL,
    httpsCallable,
    query,
    ref,
    serverTimestamp,
    storage,
    updateDoc,
    uploadBytes,
    where,
} from '../../lib/firebase';
import { CANONICAL_SLA_POLICY, slaMinutesForPriority } from '../../config/uaeDominationBlueprint';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { notifyEmergency, notifyTicketCreated } from '../../services/notificationService';
import { binThemeTokens } from '../../theme/binGroupTheme';
import TenantUnitLinkFallback from '../components/TenantUnitLinkFallback';

const sanitizeStorageFileName = (name: string) =>
    name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'evidence.jpg';

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

const PRIORITY_TO_SLA_KEY: Record<string, keyof typeof CANONICAL_SLA_POLICY> = {
    emergency: 'EMERGENCY',
    urgent: 'HIGH',
    normal: 'STANDARD',
};

const normalizeCategoryPrefill = (value: string | null) => {
    const key = String(value || '').trim().toLowerCase();
    return CATEGORY_PREFILL[key] || '';
};

const timestampMillis = (value: any): number | null => {
    if (!value) return null;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (Number.isFinite(value.seconds)) return Number(value.seconds) * 1000;
    if (Number.isFinite(value)) return Number(value);
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
};

const secureRequestId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `tenant_web_${crypto.randomUUID()}`;
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return `tenant_web_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
    }
    throw new Error('Secure browser randomness is required to submit a maintenance request.');
};

const hasCanonicalDispatchGeo = (property: any) => {
    const geo = property?.geo;
    const verification = property?.geoVerification;
    if (!geo || !verification) return false;

    const lat = Number(geo.lat ?? geo.point?.latitude ?? geo.latitude);
    const lng = Number(geo.lng ?? geo.point?.longitude ?? geo.longitude);
    const geoVerifiedAt = timestampMillis(geo.verifiedAt);
    const verificationAt = timestampMillis(verification.verifiedAt);
    const verifiedBy = String(geo.verifiedBy || '').trim();

    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180 &&
        !(lat === 0 && lng === 0) &&
        geo.verified === true &&
        geo.dispatchReady === true &&
        geo.requiresGeoReview !== true &&
        geo.source === 'admin_manual' &&
        Number(geo.verificationVersion) === 1 &&
        verification.state === 'VERIFIED' &&
        verification.source === 'FOUNDER_MFA_REVIEW' &&
        Number(verification.verificationVersion) === 1 &&
        verifiedBy.length > 0 &&
        verifiedBy === String(verification.verifiedBy || '').trim() &&
        geoVerifiedAt !== null &&
        geoVerifiedAt > 0 &&
        geoVerifiedAt === verificationAt
    );
};

export default function TenantRequestPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const clientRequestIdRef = useRef('');
    const previewUrlsRef = useRef<string[]>([]);

    const tt = (key: string, fallback: string): string => {
        const value = t(key);
        return typeof value === 'string' && value.trim() && value.trim() !== key ? value : fallback;
    };

    const [category, setCategory] = useState(normalizeCategoryPrefill(searchParams.get('category')));
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

    const selectedSlaKey = PRIORITY_TO_SLA_KEY[priority] || 'STANDARD';
    const selectedSlaPolicy = CANONICAL_SLA_POLICY[selectedSlaKey];
    const selectedSlaMinutes = slaMinutesForPriority(priority);
    const propertyContextReady = residenceChecked && Boolean(unitData) && Boolean(propertyData);
    const propertyGpsReady = propertyContextReady && hasCanonicalDispatchGeo(propertyData);

    const stableClientRequestId = () => {
        if (!clientRequestIdRef.current) clientRequestIdRef.current = secureRequestId();
        return clientRequestIdRef.current;
    };

    useEffect(() => {
        const fetchResidence = async () => {
            if (!user?.uid) {
                setResidenceChecked(true);
                return;
            }
            try {
                const unitCandidates = new Map<string, any>();
                const addUnit = (id: string, data: any) => {
                    if (!id || unitCandidates.has(id)) return;
                    unitCandidates.set(id, { id, ...data });
                };
                const queryUnits = async (field: string, value: string) => {
                    if (!value) return;
                    const snapshot = await getDocs(query(collection(db, 'units'), where(field, '==', value)));
                    snapshot.docs.forEach((unitDoc) => addUnit(unitDoc.id, unitDoc.data()));
                };

                const profileSnap = await getDoc(doc(db, 'users', user.uid));
                const profile = profileSnap.exists() ? profileSnap.data() : {};
                const profileUnitId = String(profile?.unitId || profile?.assignedUnitId || '').trim();
                if (profileUnitId) {
                    const profileUnitSnap = await getDoc(doc(db, 'units', profileUnitId));
                    if (profileUnitSnap.exists()) addUnit(profileUnitSnap.id, profileUnitSnap.data());
                }

                await queryUnits('tenantId', user.uid);
                await queryUnits('tenantUid', user.uid);
                await queryUnits('currentTenantId', user.uid);
                if (user.email) await queryUnits('tenantEmail', user.email.toLowerCase());

                let selectedUnit: any = null;
                let selectedProperty: any = null;
                for (const unit of unitCandidates.values()) {
                    const propertyId = String(unit.propertyId || '').trim();
                    if (!propertyId) {
                        if (!selectedUnit) selectedUnit = unit;
                        continue;
                    }
                    const propertySnap = await getDoc(doc(db, 'properties', propertyId));
                    const property = propertySnap.exists() ? { id: propertySnap.id, ...propertySnap.data() } : null;
                    if (!selectedUnit) {
                        selectedUnit = unit;
                        selectedProperty = property;
                    }
                    if (property && hasCanonicalDispatchGeo(property)) {
                        selectedUnit = unit;
                        selectedProperty = property;
                        break;
                    }
                }
                if (!selectedUnit) return;

                setUnitData(selectedUnit);
                if (!selectedProperty) return;
                setPropertyData(selectedProperty);

                const ownerId = selectedProperty.ownerId || selectedProperty.ownerUid;
                if (ownerId) {
                    const ownerSnap = await getDoc(doc(db, 'users', ownerId));
                    const ownerStatus = ownerSnap.exists() ? String(ownerSnap.data()?.status || '').toLowerCase() : '';
                    setIsOwnerSuspended(ownerStatus === 'suspended');
                }
            } catch (error) {
                console.warn('Residence lookup failed:', error);
            } finally {
                setResidenceChecked(true);
            }
        };
        void fetchResidence();
    }, [user]);

    useEffect(() => {
        const nextCategory = normalizeCategoryPrefill(searchParams.get('category'));
        if (nextCategory) setCategory(nextCategory);
    }, [searchParams]);

    useEffect(() => {
        previewUrlsRef.current = previews;
    }, [previews]);

    useEffect(() => () => {
        previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrlsRef.current = [];
    }, []);

    const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files) return;
        const files = Array.from(event.target.files).slice(0, Math.max(5 - photos.length, 0));
        setPhotos((current) => [...current, ...files].slice(0, 5));
        setPreviews((current) => [...current, ...files.map((file) => URL.createObjectURL(file))].slice(0, 5));
        event.target.value = '';
    };

    const removePhoto = (index: number) => {
        setPreviews((current) => {
            const target = current[index];
            if (target) URL.revokeObjectURL(target);
            return current.filter((_, itemIndex) => itemIndex !== index);
        });
        setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index));
    };

    const uploadPhotosToStorage = async (ticketId: string): Promise<string[]> => {
        if (photos.length === 0) throw new Error('At least one photo is required before dispatch.');
        const urls: string[] = [];
        const timestamp = Date.now();
        for (let index = 0; index < photos.length; index += 1) {
            const file = photos[index];
            const fileName = `${timestamp}_${index + 1}_${sanitizeStorageFileName(file.name)}`;
            const fileRef = ref(storage, `maintenanceTickets/${ticketId}/tenant/${fileName}`);
            await uploadBytes(fileRef, file, {
                contentType: file.type || 'image/jpeg',
                customMetadata: {
                    ticketId,
                    uploadedBy: user?.uid || '',
                    evidenceRole: 'tenant',
                },
            });
            urls.push(await getDownloadURL(fileRef));
        }
        return urls;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const cleanLocation = specificLocation.trim();
        if (!user || !unitData?.id || !unitData?.propertyId) {
            alert('No verified property and unit are assigned. Cannot create request.');
            return;
        }
        if (!propertyGpsReady) {
            alert('This property is waiting for Founder-verified dispatch geography. Contact management before submitting.');
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

        setSubmitting(true);
        let createdTicketId = '';
        try {
            const createTenantServiceTicket = httpsCallable(functions, 'createTenantServiceTicket');
            const response: any = await createTenantServiceTicket({
                kind: priority === 'emergency' ? 'EMERGENCY' : 'AI_CONCIERGE',
                unitId: unitData.id,
                propertyId: unitData.propertyId,
                clientRequestId: stableClientRequestId(),
                details: {
                    category,
                    priority,
                    description: description.trim(),
                    specificLocation: cleanLocation,
                    photoEvidenceExpected: true,
                },
            });
            createdTicketId = String(response?.data?.ticketId || '').trim();
            if (!createdTicketId) throw new Error('The server did not return a maintenance ticket ID.');

            setUploadingPhotos(true);
            const photoUrls = await uploadPhotosToStorage(createdTicketId);
            await updateDoc(doc(db, 'maintenanceTickets', createdTicketId), {
                photos: photoUrls,
                primaryPhotoUrl: photoUrls[0] || null,
                evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
                evidenceUploadedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            if (priority === 'emergency') {
                void notifyEmergency(
                    createdTicketId,
                    user.displayName || 'Resident',
                    propertyData?.name || propertyData?.propertyName || 'Property',
                    unitData.unitNumber || '',
                ).catch(console.warn);
            } else {
                void notifyTicketCreated(
                    createdTicketId,
                    user.displayName || 'Resident',
                    category,
                    priority,
                ).catch(console.warn);
            }
            clientRequestIdRef.current = '';
            navigate('/tenant/tickets');
        } catch (error) {
            console.error('Tenant request submission failed:', error);
            if (createdTicketId) {
                void updateDoc(doc(db, 'maintenanceTickets', createdTicketId), {
                    evidenceStatus: 'TENANT_EVIDENCE_UPLOAD_FAILED',
                    evidenceUploadError: error instanceof Error ? error.message : String(error),
                    updatedAt: serverTimestamp(),
                }).catch(console.warn);
            }
            alert(`Failed to submit request: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setSubmitting(false);
            setUploadingPhotos(false);
        }
    };

    if (!residenceChecked) {
        return (
            <Paper data-testid="tenant-residence-loading" sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(22,22,24,.7)' }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
                <Typography sx={{ mt: 2, color: 'rgba(255,255,255,.7)' }}>Loading residence and property details…</Typography>
            </Paper>
        );
    }

    if (!unitData) {
        return <TenantUnitLinkFallback message="A unit must be verified before a maintenance request can be dispatched." />;
    }

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', pb: 10, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" spacing={2} sx={{ mb: 4 }}>
                <IconButton onClick={() => navigate(-1)} sx={{ color: 'rgba(255,255,255,.5)', transform: isRTL ? 'rotate(180deg)' : 'none' }}>
                    <ChevronLeft />
                </IconButton>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left', width: '100%' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>
                        {tt('dash.tenant.serviceLabel', 'SOVEREIGN SERVICE')}
                    </Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#fff' }}>
                        {tt('dash.tenant.newRequest', 'New Maintenance Request')}
                    </Typography>
                </Box>
            </Stack>

            <Paper sx={{ p: { xs: 3, md: 5 }, bgcolor: 'rgba(22,22,24,.7)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 6 }}>
                {isOwnerSuspended && (
                    <Alert severity="error" sx={{ mb: 3 }}>
                        {tt('dash.tenant.dispatchSuspendedDesc', 'Maintenance dispatch is suspended for this property. Contact the property owner or manager.')}
                    </Alert>
                )}
                {!propertyGpsReady && (
                    <Alert severity="warning" sx={{ mb: 3 }}>
                        Founder-verified property geography is required before dispatch. No browser coordinate will be accepted.
                    </Alert>
                )}

                <form onSubmit={handleSubmit}>
                    <Stack spacing={4}>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel>{tt('dash.tenant.category', 'Category')}</InputLabel>
                                    <Select
                                        data-testid="tenant-request-category"
                                        inputProps={{ 'data-testid': 'tenant-request-category-input' }}
                                        value={category}
                                        label={tt('dash.tenant.category', 'Category')}
                                        onChange={(event) => setCategory(event.target.value)}
                                        required
                                        disabled={isOwnerSuspended}
                                        sx={{ color: '#fff' }}
                                    >
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
                                    <InputLabel>{tt('dash.tenant.priority', 'Priority')}</InputLabel>
                                    <Select
                                        data-testid="tenant-request-priority"
                                        inputProps={{ 'data-testid': 'tenant-request-priority-input' }}
                                        value={priority}
                                        label={tt('dash.tenant.priority', 'Priority')}
                                        onChange={(event) => setPriority(event.target.value)}
                                        required
                                        disabled={isOwnerSuspended}
                                        sx={{ color: '#fff' }}
                                    >
                                        <MenuItem value="normal">{tt('dash.tenant.prioNormal', 'Normal (Standard 8h)')}</MenuItem>
                                        <MenuItem value="urgent">{tt('dash.tenant.prioUrgent', 'Urgent (High 2h)')}</MenuItem>
                                        <MenuItem value="emergency">{tt('dash.tenant.prioEmerg', 'EMERGENCY (Safety/SOS 30m)')}</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        <TextField
                            fullWidth
                            required
                            label={tt('dash.tenant.specificLocation', 'Exact Service Location (room / area / asset)')}
                            data-testid="tenant-request-location"
                            value={specificLocation}
                            onChange={(event) => setSpecificLocation(event.target.value)}
                            placeholder={tt('dash.tenant.specificLocationHint', 'Example: Kitchen sink, Master bedroom AC, Bathroom ceiling')}
                            disabled={isOwnerSuspended}
                        />
                        <TextField
                            fullWidth
                            multiline
                            rows={5}
                            required
                            label={tt('dash.tenant.issueDesc', 'Issue Description')}
                            data-testid="tenant-request-description"
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            disabled={isOwnerSuspended}
                        />

                        <Box>
                            <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 2 }}>
                                <Camera size={18} /> {tt('dash.tenant.attachPhotos', 'ATTACH PHOTOS')}
                            </Typography>
                            {uploadingPhotos && <CircularProgress size={22} sx={{ color: binThemeTokens.gold, mb: 2 }} />}
                            <Grid container spacing={2}>
                                {previews.map((source, index) => (
                                    <Grid item xs={4} md={3} key={source}>
                                        <Box sx={{ position: 'relative', borderRadius: 3, overflow: 'hidden', pt: '100%' }}>
                                            <img src={source} alt="issue evidence" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <IconButton size="small" onClick={() => removePhoto(index)} sx={{ position: 'absolute', top: 5, right: 5, bgcolor: 'rgba(0,0,0,.6)', color: '#fff' }}>
                                                <X size={14} />
                                            </IconButton>
                                        </Box>
                                    </Grid>
                                ))}
                                {previews.length < 5 && (
                                    <Grid item xs={4} md={3}>
                                        <Button component="label" disabled={isOwnerSuspended} sx={{ minHeight: 110, width: '100%', border: '1px dashed rgba(255,255,255,.25)', color: binThemeTokens.gold }}>
                                            <Camera size={24} />
                                            <input type="file" hidden accept="image/*" multiple onChange={handlePhotoChange} />
                                        </Button>
                                    </Grid>
                                )}
                            </Grid>
                        </Box>

                        <Box sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 3 }}>
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <AlertCircle size={20} color={binThemeTokens.gold} />
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.72)' }}>
                                    {selectedSlaPolicy.label}: {selectedSlaMinutes} minutes. {selectedSlaPolicy.tenantCopy}
                                </Typography>
                            </Stack>
                        </Box>

                        <Button
                            type="submit"
                            data-testid="tenant-request-submit"
                            variant="contained"
                            size="large"
                            disabled={
                                submitting ||
                                uploadingPhotos ||
                                isOwnerSuspended ||
                                !propertyGpsReady ||
                                photos.length === 0 ||
                                specificLocation.trim().length < 3 ||
                                description.trim().length < 8 ||
                                !category
                            }
                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, borderRadius: 4 }}
                        >
                            {submitting || uploadingPhotos ? <CircularProgress size={24} color="inherit" /> : tt('dash.tenant.dispatchRequest', 'DISPATCH REQUEST')}
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Box>
    );
}
