import React, { useState } from 'react';
import { 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    Button, TextField, MenuItem, Grid, Box, Typography,
    CircularProgress, Alert, IconButton, alpha, Stack
} from '@mui/material';
import { X, UserPlus, Shield, Smartphone, Mail, Briefcase } from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';
import { db, collection, addDoc, serverTimestamp, auth } from '../lib/firebase';

interface RegisterStaffDialogProps {
    open: boolean;
    onClose: () => void;
}

const ROLES = [
    { value: 'technician', label: 'Field Technician' },
    { value: 'hr_staff', label: 'HR Administrator' },
    { value: 'manager', label: 'Operations Manager' },
    { value: 'admin', label: 'System Admin' }
];

export default function RegisterStaffDialog({ open, onClose }: RegisterStaffDialogProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        mobile: '',
        role: 'technician',
        employeeId: '',
        emiratesId: '',
        department: '',
        initialPassword: 'BinGroupPass2026!'
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const staffRef = collection(db, 'staff_registration_requests');
            await addDoc(staffRef, {
                ...formData,
                status: 'pending_provisioning',
                requestedBy: auth.currentUser?.uid,
                requestedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            });

            setSuccess(true);
            setTimeout(() => {
                onClose();
                setSuccess(false);
                setFormData({
                    fullName: '',
                    email: '',
                    mobile: '',
                    role: 'technician',
                    employeeId: '',
                    emiratesId: '',
                    department: '',
                    initialPassword: 'BinGroupPass2026!'
                });
            }, 2000);
        } catch (err: any) {
            console.error('[HR] Registration failed:', err);
            setError(err.message || 'Failed to submit registration request.');
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
            PaperProps={{
                sx: {
                    bgcolor: '#111',
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.05), rgba(255,255,255,0))',
                    border: '1px solid rgba(198,167,94,0.2)',
                    borderRadius: 3
                }
            }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <UserPlus color={binThemeTokens.gold} size={24} />
                    <Typography variant="h6" fontWeight="900" sx={{ color: '#fff', letterSpacing: 1 }}>
                        REGISTER NEW <Typography component="span" variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>STAFF</Typography>
                    </Typography>
                </Box>
                <IconButton onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    <X size={20} />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ borderColor: 'rgba(198,167,94,0.1)', p: 3 }}>
                {success ? (
                    <Alert severity="success" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid #10b981', fontWeight: 700 }}>
                        Staff registration request submitted successfully!
                    </Alert>
                ) : (
                    <Box component="form" onSubmit={handleSubmit}>
                        <Grid container spacing={2.5}>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Full Name"
                                    name="fullName"
                                    value={formData.fullName}
                                    onChange={handleChange}
                                    required
                                    variant="outlined"
                                    InputProps={{ startAdornment: <Shield size={18} style={{ marginRight: 12, opacity: 0.5 }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Email Address"
                                    name="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    InputProps={{ startAdornment: <Mail size={18} style={{ marginRight: 12, opacity: 0.5 }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Mobile Number"
                                    name="mobile"
                                    value={formData.mobile}
                                    onChange={handleChange}
                                    required
                                    InputProps={{ startAdornment: <Smartphone size={18} style={{ marginRight: 12, opacity: 0.5 }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    select
                                    label="Assigned Role"
                                    name="role"
                                    value={formData.role}
                                    onChange={handleChange}
                                    required
                                    InputProps={{ startAdornment: <Briefcase size={18} style={{ marginRight: 12, opacity: 0.5 }} /> }}
                                >
                                    {ROLES.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Employee ID"
                                    name="employeeId"
                                    value={formData.employeeId}
                                    onChange={handleChange}
                                    required
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Emirates ID"
                                    name="emiratesId"
                                    value={formData.emiratesId}
                                    onChange={handleChange}
                                    required
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Department"
                                    name="department"
                                    value={formData.department}
                                    onChange={handleChange}
                                    placeholder="e.g. Facilities Management"
                                />
                            </Grid>
                        </Grid>

                        {error && (
                            <Alert severity="error" sx={{ mt: 3, bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid #ef4444' }}>
                                {error}
                            </Alert>
                        )}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 3, bgcolor: 'rgba(0,0,0,0.2)' }}>
                <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
                    Cancel
                </Button>
                <Button 
                    variant="contained" 
                    onClick={handleSubmit}
                    disabled={loading || success}
                    sx={{ 
                        bgcolor: binThemeTokens.gold, 
                        color: '#000', 
                        fontWeight: 900,
                        minWidth: 140,
                        '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.8) }
                    }}
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> : 'REGISTER STAFF'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
