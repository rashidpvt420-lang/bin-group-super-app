import React, { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Container,
    Grid,
    Paper,
    Snackbar,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { ArrowLeft, ArrowRight, Lock, Mail, Phone, User } from 'lucide-react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db, doc, serverTimestamp, setDoc } from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';

const AccountActivationStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { setOwnerAccount, companyProfile, updateCompanyProfile } = useOnboardingStore();
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        fullName: companyProfile.contactPerson || '',
        email: companyProfile.email || '',
        password: '',
        confirmPassword: '',
        mobile: companyProfile.phone || ''
    });
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const handleCreateAccount = async () => {
        if (!formData.fullName.trim() || !formData.email.trim() || !formData.mobile.trim()) {
            setSnackbar({ open: true, message: 'Full name, email, and mobile number are required.', severity: 'error' });
            return;
        }

        if (formData.password.length < 8 || formData.password !== formData.confirmPassword) {
            setSnackbar({ open: true, message: 'Password must be at least 8 characters and match the confirmation.', severity: 'error' });
            return;
        }

        setSaving(true);
        try {
            let uid = '';
            try {
                const credential = await createUserWithEmailAndPassword(auth, formData.email.trim().toLowerCase(), formData.password);
                uid = credential.user.uid;
                await updateProfile(credential.user, { displayName: formData.fullName.trim() });
            } catch (error: any) {
                if (error?.code !== 'auth/email-already-in-use') throw error;
                const credential = await signInWithEmailAndPassword(auth, formData.email.trim().toLowerCase(), formData.password);
                uid = credential.user.uid;
            }

            await setDoc(doc(db, 'users', uid), {
                uid,
                email: formData.email.trim().toLowerCase(),
                displayName: formData.fullName.trim(),
                phoneNumber: formData.mobile.trim(),
                role: 'owner',
                status: 'PAYMENT_PENDING',
                dashboardUnlocked: false,
                onboardingStage: 'ACCOUNT_CREATED_PENDING_PAYMENT',
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            }, { merge: true });

            updateCompanyProfile({
                contactPerson: formData.fullName.trim(),
                email: formData.email.trim().toLowerCase(),
                phone: formData.mobile.trim()
            });
            setOwnerAccount({
                uid,
                fullName: formData.fullName.trim(),
                email: formData.email.trim().toLowerCase(),
                mobile: formData.mobile.trim()
            });
            setSnackbar({ open: true, message: 'Owner account secured. Continue to mobilization payment.', severity: 'success' });
            onNext();
        } catch (error: any) {
            setSnackbar({ open: true, message: error?.message || 'Account creation failed.', severity: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(198, 167, 94, 0.2)' }}>
                <Box sx={{ textAlign: 'center', mb: 5 }}>
                    <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1 }}>
                        ACCOUNT CREATION
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                        Create the owner login after property and proof details have been collected.
                    </Typography>
                </Box>

                <Alert severity="info" sx={{ mb: 4, bgcolor: 'rgba(198,167,94,0.08)', color: binThemeTokens.gold, border: '1px solid rgba(198,167,94,0.25)' }}>
                    Dashboard access remains locked until admin approval and payment verification.
                </Alert>

                <Stack spacing={3}>
                    <TextField fullWidth label="Full Name" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} InputProps={{ startAdornment: <User size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }} />
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={7}>
                            <TextField fullWidth label="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} InputProps={{ startAdornment: <Mail size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }} />
                        </Grid>
                        <Grid item xs={12} md={5}>
                            <TextField fullWidth label="Mobile Number" value={formData.mobile} onChange={(e) => setFormData({ ...formData, mobile: e.target.value })} InputProps={{ startAdornment: <Phone size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }} />
                        </Grid>
                    </Grid>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <TextField fullWidth type="password" label="Password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} InputProps={{ startAdornment: <Lock size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField fullWidth type="password" label="Confirm Password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} />
                        </Grid>
                    </Grid>
                </Stack>

                <Box sx={{ mt: 5, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Button variant="outlined" size="large" onClick={onBack} startIcon={<ArrowLeft />} sx={{ borderRadius: 100, px: 4, color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.12)' }}>
                        BACK
                    </Button>
                    <Button variant="contained" size="large" onClick={handleCreateAccount} disabled={saving} endIcon={<ArrowRight />} sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                        {saving ? 'CREATING...' : 'CREATE ACCOUNT'}
                    </Button>
                </Box>
            </Paper>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} sx={{ width: '100%', borderRadius: 3, fontWeight: 700 }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Container>
    );
};

export default AccountActivationStep;
