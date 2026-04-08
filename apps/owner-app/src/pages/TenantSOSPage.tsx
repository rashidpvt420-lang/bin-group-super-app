// apps/owner-app/src/pages/TenantSOSPage.tsx
import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, TextField, Button, 
    Paper, Grid, MenuItem, Select, InputLabel, FormControl, 
    Stack, Alert, CircularProgress, Chip, Divider
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Home, Camera, ShieldAlert, Send, ArrowLeft, CheckCircle2, MapPin } from 'lucide-react';
import { db, collection, addDoc, serverTimestamp, getDoc, doc, getDocs, query, where, updateDoc } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';

interface UnitData {
    id: string;
    propertyId?: string;
    unitNumber?: string;
    floorNumber?: string;
    tenantId?: string;
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!category || !description || !user) return;

        setSubmitting(true);
        try {
            await addDoc(collection(db, 'maintenanceTickets'), {
                tenantId: user.uid,
                tenantName: user.displayName || 'Anonymous Tenant',
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
                    <CheckCircle2 color="#4CAF50" size={64} />
                    <Typography variant="h3" fontWeight="900" sx={{ color: '#4CAF50', mt: 4, mb: 2 }}>{t('sos.success_title')}</Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, mb: 6 }}>
                        {t('sos.success_subtitle')}
                    </Typography>
                    <Button variant="contained" fullWidth size="large" onClick={() => navigate('/dashboard')} sx={{ bgcolor: '#4CAF50', color: '#FFF', fontWeight: 900, py: 2 }}>{t('sos.return_dash')}</Button>
                </Paper>
            </Container>
        );
    }

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 3, md: 6 } }}>
            <Box sx={{ mb: 6, position: 'relative', zIndex: 1 }}>
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
                                    <MapPin size={14} style={{ verticalAlign: isRTL ? 'left' : 'right', marginLeft: isRTL ? 4 : 0, marginRight: isRTL ? 0 : 4 }} /> 
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
                                <input
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    id="icon-button-file"
                                    type="file"
                                    onChange={(e) => {
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
