import React, { useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    Button, Grid, TextField, Stack, FormControl, 
    InputLabel, Select, MenuItem, CircularProgress, Alert
} from '@mui/material';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { binThemeTokens } from '../../theme/adminTheme';

interface AddTenantDialogProps {
    open: boolean;
    onClose: () => void;
    properties: any[];
    units: any[];
    onSuccess: (message: string) => void;
}

export default function AddTenantDialog({ open, onClose, properties, units, onSuccess }: AddTenantDialogProps) {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [formData, setFormData] = useState({
        displayName: '',
        email: '',
        phoneNumber: '',
        propertyId: '',
        unitId: '',
    });

    const handleSubmit = async () => {
        if (!formData.displayName || !formData.email) {
            setError("Name and Email are required.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // In a real system, this might trigger a Cloud Function to create the Auth user.
            // For now, we create the Firestore profile which the user will claim upon first login/invite.
            const tenantRef = collection(db, 'users');
            
            // Generate a temporary ID or use email as key if needed, 
            // but usually we want Firebase to generate the UID.
            // For administrative "Add", we often create a 'tenantInvites' doc.
            
            const property = properties.find(p => p.id === formData.propertyId);
            const newTenant = {
                displayName: formData.displayName,
                email: formData.email.toLowerCase().trim(),
                phoneNumber: formData.phoneNumber,
                propertyId: formData.propertyId,
                ownerId: property?.ownerId || '',
                unitId: formData.unitId,
                role: 'tenant',
                status: 'pending_invite',
                createdAt: serverTimestamp(),
                inviteStatus: 'not_sent'
            };

            await addDoc(tenantRef, newTenant);
            
            onSuccess("Tenant created successfully. Send invite to activate.");
            setFormData({ displayName: '', email: '', phoneNumber: '', propertyId: '', unitId: '' });
            onClose();
        } catch (err: any) {
            console.error("Error adding tenant:", err);
            setError("Failed to create tenant node: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            maxWidth="md" 
            fullWidth
            PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
        >
            <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold, py: 3 }}>INITIALIZE NEW TENANT NODE</DialogTitle>
            <DialogContent sx={{ py: 3 }}>
                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <Stack spacing={3}>
                            <TextField 
                                label="Full Name" 
                                fullWidth 
                                value={formData.displayName} 
                                onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                                InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} 
                                InputProps={{ style: { color: '#FFF' } }} 
                            />
                            <TextField 
                                label={t('common.email_address')} 
                                type="email"
                                fullWidth 
                                value={formData.email} 
                                onChange={(e) => setFormData({...formData, email: e.target.value})}
                                InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} 
                                InputProps={{ style: { color: '#FFF' } }} 
                            />
                            <TextField 
                                label={t('common.phone_number')} 
                                fullWidth 
                                value={formData.phoneNumber} 
                                onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                                InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} 
                                InputProps={{ style: { color: '#FFF' } }} 
                            />
                        </Stack>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Stack spacing={3}>
                            <FormControl fullWidth>
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Property Assignment</InputLabel>
                                <Select 
                                    value={formData.propertyId} 
                                    label={t('common.property_assignment')} 
                                    onChange={(e) => setFormData({...formData, propertyId: e.target.value, unitId: ''})}
                                    sx={{ color: '#FFF' }}
                                >
                                    <MenuItem value=""><em>None</em></MenuItem>
                                    {properties.map(p => <MenuItem key={p.id} value={p.id}>{p.name || p.propertyName}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <FormControl fullWidth disabled={!formData.propertyId}>
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Unit Assignment</InputLabel>
                                <Select 
                                    value={formData.unitId} 
                                    label={t('common.unit_assignment')} 
                                    onChange={(e) => setFormData({...formData, unitId: e.target.value})}
                                    sx={{ color: '#FFF' }}
                                >
                                    <MenuItem value=""><em>None</em></MenuItem>
                                    {units.filter(u => u.propertyId === formData.propertyId).map(u => <MenuItem key={u.id} value={u.id}>{u.unitNumber}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Stack>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
                <Button 
                    variant="contained" 
                    onClick={handleSubmit}
                    disabled={loading}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, minWidth: 150 }}
                >
                    {loading ? <CircularProgress size={20} color="inherit" /> : 'CREATE TENANT'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
