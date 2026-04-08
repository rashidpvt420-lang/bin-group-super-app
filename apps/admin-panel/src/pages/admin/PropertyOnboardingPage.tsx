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

const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

export default function PropertyOnboardingPage() {
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
            setError("V4 Protocol Violation: A valid tenant email address is required for identity provisioning.");
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
            setError("Failed to onboard property and invite tenant. See console.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: 6 }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 1 }}>
                    V4 ASSET & TENANT INTAKE
                </Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>
                    Instantiate a new property record and securely invite a tenant to the Sovereign Portal.
                </Typography>
            </Box>

            <Paper sx={{ p: 4, bgcolor: binThemeTokens.graphite, border: `1px solid ${binThemeTokens.gold}33`, borderRadius: 4 }}>
                {success && (
                    <Alert severity="success" sx={{ mb: 4, bgcolor: 'rgba(76, 175, 80, 0.1)', color: '#4CAF50' }}>
                        Asset provisioned successfully. Invitation email dispatched to <b>{lastSubmittedEmail}</b>.
                    </Alert>
                )}
                {error && (
                    <Alert severity="error" sx={{ mb: 4 }}>{error}</Alert>
                )}

                <form onSubmit={handleSubmit}>
                    <Stack spacing={3}>
                        <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 1 }}>
                            1. Property Details
                        </Typography>
                        
                        <TextField 
                            fullWidth label="Property Name (e.g. Marina Heights)" name="propertyName" 
                            value={formData.propertyName} onChange={handleChange} required 
                        />
                        
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <FormControl fullWidth required>
                                <InputLabel>Emirate</InputLabel>
                                <Select name="emirate" value={formData.emirate} onChange={handleChange as any} label="Emirate">
                                    {EMIRATES.map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <TextField 
                                fullWidth label="Service Zone (e.g. Dubai Marina)" name="serviceZone" 
                                value={formData.serviceZone} onChange={handleChange} required 
                            />
                        </Stack>

                        <TextField 
                            fullWidth label="Full Physical Address" name="address" 
                            value={formData.address} onChange={handleChange} required 
                        />

                        <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 1, mt: 4 }}>
                            2. Unit & Tenant Details
                        </Typography>

                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <TextField 
                                fullWidth label="Floor Number" name="floorNumber" 
                                value={formData.floorNumber} onChange={handleChange} required 
                            />
                            <TextField 
                                fullWidth label="Unit / Room Number" name="unitNumber" 
                                value={formData.unitNumber} onChange={handleChange} required 
                            />
                        </Stack>

                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <TextField 
                                fullWidth label="Tenant Full Name" name="tenantName" 
                                value={formData.tenantName} onChange={handleChange} required 
                            />
                            <TextField 
                                error={formData.tenantEmail !== '' && !validateEmail(formData.tenantEmail)}
                                fullWidth type="email" label="Tenant Email Address" name="tenantEmail" 
                                value={formData.tenantEmail} onChange={handleChange} required 
                                helperText={formData.tenantEmail !== '' && !validateEmail(formData.tenantEmail) ? "Invalid email format" : ""}
                            />
                        </Stack>

                        <Button 
                            type="submit" 
                            variant="contained" 
                            disabled={loading || !formData.tenantEmail || !validateEmail(formData.tenantEmail)}
                            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ShieldCheck />}
                            sx={{ mt: 4, py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, '&:hover': { bgcolor: '#E6C77A' } }}
                        >
                            Execute V4 Provisioning Handshake
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Container>
    );
}
