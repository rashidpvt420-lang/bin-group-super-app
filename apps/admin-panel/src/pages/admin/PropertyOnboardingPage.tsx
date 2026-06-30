import React, { useState } from 'react';
import { 
    Box, 
    Typography, 
    Paper, 
    TextField, 
    Button, 
    Stack, 
    Select, 
    MenuItem, 
    FormControl, 
    InputLabel,
    Alert,
    CircularProgress,
    Container
} from '@mui/material';
import { db, collection, addDoc, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { ShieldCheck } from 'lucide-react';
import { useLanguage } from '@bin/shared';

const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

export default function PropertyOnboardingPage() {
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSubmittedEmail, setLastSubmittedEmail] = useState('');

    const [formData, setFormData] = useState({
        propertyName: '',
        emirate: '',
        serviceZone: '',
        address: '',
        floorNumber: '',
        unitNumber: '',
        tenantName: '',
        tenantEmail: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name as string]: value }));
    };

    const validateEmail = (email: string) => {
        return String(email)
            .toLowerCase()
            .match(
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // 1. Strict Validation
        if (!formData.tenantEmail || !validateEmail(formData.tenantEmail)) {
            setError(t('admin.property_onboarding.email_required'));
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(false);

        const targetEmail = formData.tenantEmail.toLowerCase().trim();

        try {
            // 1. Create Property Document
            const propertyRef = await addDoc(collection(db, 'properties'), {
                name: formData.propertyName,
                propertyName: formData.propertyName,
                emirate: formData.emirate,
                serviceZone: formData.serviceZone,
                address: formData.address,
                status: 'ONBOARDING',
                createdAt: serverTimestamp(),
                propertyType: 'Residential', // Default
            });

            // 2. Create Pending Tenant Document
            await addDoc(collection(db, 'pending_tenants'), {
                propertyId: propertyRef.id,
                propertyName: formData.propertyName,
                emirate: formData.emirate,
                serviceZone: formData.serviceZone,
                address: formData.address,
                floorNumber: formData.floorNumber,
                unitNumber: formData.unitNumber,
                tenantName: formData.tenantName,
                email: targetEmail,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            // 2.5 Create Native Unit Document for Context Fetching
            await addDoc(collection(db, 'units'), {
                propertyId: propertyRef.id,
                unitNumber: formData.unitNumber,
                floorNumber: formData.floorNumber,
                tenantEmail: targetEmail,
                status: 'occupied',
                createdAt: serverTimestamp()
            });

            // 3. Update UI State
            setLastSubmittedEmail(targetEmail);
            setSuccess(true);
            setFormData({
                propertyName: '', emirate: '', serviceZone: '', address: '', floorNumber: '', unitNumber: '', tenantName: '', tenantEmail: ''
            });
        } catch (err: any) {
            console.error("Onboarding failed:", err);
            setError(t('admin.property_onboarding.submit_failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 1 }}>
                    {t('admin.property_onboarding.page_title')}
                </Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>
                    {t('admin.property_onboarding.page_subtitle')}
                </Typography>
            </Box>

            <Paper sx={{ p: 4, bgcolor: binThemeTokens.graphite, border: `1px solid ${binThemeTokens.gold}33`, borderRadius: 4 }}>
                {success && (
                    <Alert severity="success" sx={{ mb: 4, bgcolor: 'rgba(76, 175, 80, 0.1)', color: '#4CAF50' }}>
                        {t('admin.property_onboarding.success_message', { email: lastSubmittedEmail })}
                    </Alert>
                )}
                {error && (
                    <Alert severity="error" sx={{ mb: 4 }}>{error}</Alert>
                )}

                <form onSubmit={handleSubmit}>
                    <Stack spacing={3}>
                        <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 1 }}>
                            {t('admin.property_onboarding.section_property_details')}
                        </Typography>

                        <TextField
                            fullWidth label={t('admin.property_onboarding.property_name_label')} name="propertyName"
                            value={formData.propertyName} onChange={handleChange} required
                        />

                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <FormControl fullWidth required>
                                <InputLabel>{t('admin.property_onboarding.emirate_label')}</InputLabel>
                                <Select name="emirate" value={formData.emirate} onChange={handleChange as any} label={t('admin.property_onboarding.emirate_label')}>
                                    {EMIRATES.map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <TextField
                                fullWidth label={t('admin.property_onboarding.service_zone_label')} name="serviceZone"
                                value={formData.serviceZone} onChange={handleChange} required
                            />
                        </Stack>

                        <TextField
                            fullWidth label={t('admin.property_onboarding.address_label')} name="address"
                            value={formData.address} onChange={handleChange} required
                        />

                        <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 1, mt: 4 }}>
                            {t('admin.property_onboarding.section_unit_tenant_details')}
                        </Typography>

                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <TextField
                                fullWidth label={t('admin.property_onboarding.floor_number_label')} name="floorNumber"
                                value={formData.floorNumber} onChange={handleChange} required
                            />
                            <TextField
                                fullWidth label={t('admin.property_onboarding.unit_number_label')} name="unitNumber"
                                value={formData.unitNumber} onChange={handleChange} required
                            />
                        </Stack>

                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <TextField
                                fullWidth label={t('admin.property_onboarding.tenant_name_label')} name="tenantName"
                                value={formData.tenantName} onChange={handleChange} required
                            />
                            <TextField
                                error={formData.tenantEmail !== '' && !validateEmail(formData.tenantEmail)}
                                fullWidth type="email" label={t('admin.property_onboarding.tenant_email_label')} name="tenantEmail"
                                value={formData.tenantEmail} onChange={handleChange} required
                                helperText={formData.tenantEmail !== '' && !validateEmail(formData.tenantEmail) ? t('admin.property_onboarding.invalid_email_format') : ""}
                            />
                        </Stack>

                        <Button
                            type="submit"
                            variant="contained"
                            disabled={loading || !formData.tenantEmail || !validateEmail(formData.tenantEmail)}
                            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ShieldCheck />}
                            sx={{ mt: 4, py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, '&:hover': { bgcolor: '#E6C77A' } }}
                        >
                            {t('admin.property_onboarding.submit_button')}
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Container>
    );
}
