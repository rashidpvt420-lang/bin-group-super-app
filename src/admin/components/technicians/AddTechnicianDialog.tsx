/**
 * src/admin/components/technicians/AddTechnicianDialog.tsx
 * Dialog for manually adding a new technician to the system.
 * Sends invite/creates user record with technician role.
 */
import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, Stack, FormControl, InputLabel,
    Select, MenuItem, Typography, Box, CircularProgress,
    Alert, alpha
} from '@mui/material';
import { db, addDoc, collection, serverTimestamp } from '../../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { Wrench, Phone, Mail, UserPlus } from 'lucide-react';

interface AddTechnicianDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (msg: string) => void;
}

const TRADES = [
    'HVAC / AC', 'Electrical', 'Plumbing', 'Civil / Handyman',
    'Cleaning', 'Security', 'Landscaping', 'Pest Control',
    'General Maintenance', 'Multi-Skilled'
];

export default function AddTechnicianDialog({ open, onClose, onSuccess }: AddTechnicianDialogProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        displayName: '',
        email: '',
        phone: '',
        specialization: 'General Maintenance',
        status: 'ACTIVE'
    });

    const handleSave = async () => {
        if (!formData.displayName || !formData.email) {
            setError('Name and email are required.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await addDoc(collection(db, 'users'), {
                ...formData,
                role: 'technician',
                onboardingComplete: true,
                onDuty: false,
                rating: 5.0,
                completedJobs: 0,
                activeJobs: 0,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            onSuccess(`Technician ${formData.displayName} added successfully.`);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to add technician');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            maxWidth="sm" 
            fullWidth
            PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` } }}
        >
            <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold, display: 'flex', alignItems: 'center', gap: 2 }}>
                <UserPlus size={24} /> ACTIVATE FIELD TECHNICIAN
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Typography sx={{ mb: 3, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                    Register a specialized field operative into the BIN GROUP service network.
                </Typography>
                
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                
                <Stack spacing={3}>
                    <TextField
                        fullWidth label="Full Name *"
                        value={formData.displayName}
                        onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                        InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }}
                        InputProps={{ style: { color: '#FFF' } }}
                        sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}
                    />
                    <TextField
                        fullWidth label="Email Address *"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }}
                        InputProps={{ style: { color: '#FFF' } }}
                        sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}
                    />
                    <TextField
                        fullWidth label="Phone / WhatsApp"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }}
                        InputProps={{ style: { color: '#FFF' } }}
                        sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}
                    />
                    <FormControl fullWidth>
                        <InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Trade Specialization</InputLabel>
                        <Select
                            value={formData.specialization}
                            label="Trade Specialization"
                            onChange={(e) => setFormData({...formData, specialization: e.target.value})}
                            sx={{ color: '#FFF', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}
                        >
                            {TRADES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>ABORT</Button>
                <Button 
                    variant="contained" 
                    onClick={handleSave}
                    disabled={loading}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
                >
                    {loading ? <CircularProgress size={20} color="inherit" /> : 'ACTIVATE TECHNICIAN'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
