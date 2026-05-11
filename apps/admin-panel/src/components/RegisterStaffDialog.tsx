import React, { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    MenuItem,
    Stack,
    TextField,
    Typography,
    CircularProgress,
} from '@mui/material';
import { UserPlus } from 'lucide-react';
import { addDoc, collection, db, serverTimestamp } from '../lib/firebase';
import { binThemeTokens } from '../theme/adminTheme';

type RegisterStaffDialogProps = {
    open: boolean;
    onClose: () => void;
};

type StaffDraft = {
    displayName: string;
    email: string;
    mobile: string;
    role: string;
    specialization: string;
    emirate: string;
    salary: string;
};

const initialDraft: StaffDraft = {
    displayName: '',
    email: '',
    mobile: '',
    role: 'technician',
    specialization: 'general_maintenance',
    emirate: 'Abu Dhabi',
    salary: '',
};

export default function RegisterStaffDialog({ open, onClose }: RegisterStaffDialogProps) {
    const [draft, setDraft] = useState<StaffDraft>(initialDraft);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const updateField = (field: keyof StaffDraft) => (event: React.ChangeEvent<HTMLInputElement>) => {
        setDraft((current) => ({ ...current, [field]: event.target.value }));
    };

    const resetAndClose = () => {
        if (submitting) return;
        setDraft(initialDraft);
        setError(null);
        onClose();
    };

    const handleSubmit = async () => {
        const displayName = draft.displayName.trim();
        const email = draft.email.trim().toLowerCase();

        if (!displayName || !email) {
            setError('Full name and email are required before registering staff.');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await addDoc(collection(db, 'users'), {
                displayName,
                email,
                mobile: draft.mobile.trim(),
                role: draft.role,
                specialization: draft.specialization,
                emirate: draft.emirate,
                salary: Number(draft.salary || 0),
                status: 'ACTIVE',
                onboardingStatus: 'PENDING_CREDENTIAL_SETUP',
                source: 'ADMIN_HR_REGISTER_STAFF_DIALOG',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            resetAndClose();
        } catch (err) {
            console.error('[HR] Staff registration failed:', err);
            setError('Staff record could not be created. Check Firestore rules or admin permissions.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={resetAndClose}
            fullWidth
            maxWidth="md"
            PaperProps={{
                sx: {
                    bgcolor: '#020617',
                    color: '#fff',
                    border: '1px solid rgba(212, 175, 55, 0.35)',
                    borderRadius: 4,
                },
            }}
        >
            <DialogTitle>
                <Stack direction="row" spacing={2} alignItems="center">
                    <Box
                        sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 2,
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: 'rgba(212, 175, 55, 0.12)',
                            color: binThemeTokens.gold,
                        }}
                    >
                        <UserPlus size={22} />
                    </Box>
                    <Box>
                        <Typography variant="h6" fontWeight={950}>Register Staff</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Create a controlled staff profile for HR, payroll, and technician dispatch workflows.
                        </Typography>
                    </Box>
                </Stack>
            </DialogTitle>

            <DialogContent>
                {error && (
                    <Alert severity="error" sx={{ mb: 3, bgcolor: 'rgba(239,68,68,0.1)', color: '#fecaca' }}>
                        {error}
                    </Alert>
                )}

                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    <Grid item xs={12} md={6}>
                        <TextField label="Full name" fullWidth value={draft.displayName} onChange={updateField('displayName')} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField label="Email" fullWidth value={draft.email} onChange={updateField('email')} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField label="Mobile" fullWidth value={draft.mobile} onChange={updateField('mobile')} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField select label="Role" fullWidth value={draft.role} onChange={updateField('role')}>
                            <MenuItem value="technician">Technician</MenuItem>
                            <MenuItem value="hr_staff">HR Staff</MenuItem>
                            <MenuItem value="hr_manager">HR Manager</MenuItem>
                            <MenuItem value="manager">Operations Manager</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField select label="Specialization" fullWidth value={draft.specialization} onChange={updateField('specialization')}>
                            <MenuItem value="general_maintenance">General Maintenance</MenuItem>
                            <MenuItem value="hvac">HVAC</MenuItem>
                            <MenuItem value="plumbing">Plumbing</MenuItem>
                            <MenuItem value="electrical">Electrical</MenuItem>
                            <MenuItem value="cleaning">Cleaning</MenuItem>
                            <MenuItem value="security">Security</MenuItem>
                            <MenuItem value="hr_operations">HR Operations</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField select label="Emirate" fullWidth value={draft.emirate} onChange={updateField('emirate')}>
                            <MenuItem value="Abu Dhabi">Abu Dhabi</MenuItem>
                            <MenuItem value="Dubai">Dubai</MenuItem>
                            <MenuItem value="Sharjah">Sharjah</MenuItem>
                            <MenuItem value="Ajman">Ajman</MenuItem>
                            <MenuItem value="Ras Al Khaimah">Ras Al Khaimah</MenuItem>
                            <MenuItem value="Fujairah">Fujairah</MenuItem>
                            <MenuItem value="Umm Al Quwain">Umm Al Quwain</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField label="Salary / Month (AED)" type="number" fullWidth value={draft.salary} onChange={updateField('salary')} />
                    </Grid>
                </Grid>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={resetAndClose} disabled={submitting} sx={{ color: 'rgba(255,255,255,0.7)' }}>
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    variant="contained"
                    startIcon={submitting ? <CircularProgress size={16} /> : <UserPlus size={16} />}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                >
                    Create Staff Profile
                </Button>
            </DialogActions>
        </Dialog>
    );
}
