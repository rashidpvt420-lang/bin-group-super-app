import React, { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Container,
    Grid,
    Paper,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { ArrowLeft, ArrowRight, Lock, Mail, Phone, User } from 'lucide-react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db, doc, serverTimestamp, setDoc } from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';

const AccountCreationStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { companyProfile, setOwnerAccount, updateCompanyProfile, updateSignupData } = useOnboardingStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        fullName: companyProfile.contactPerson || '',
        email: companyProfile.email || '',
        mobile: companyProfile.phone || '',
        password: '',
        confirmPassword: ''
    });

    const handleSignup = async () => {
        if (!formData.fullName.trim() || !formData.email.trim() || !formData.mobile.trim()) {
            setError('Full name, email, and mobile number are required.');
            return;
        }

        if (formData.password.length < 8 || formData.password !== formData.confirmPassword) {
            setError('Password must be at least 8 characters and match the confirmation.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const email = formData.email.trim().toLowerCase();
            let uid = '';
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, formData.password);
                uid = userCredential.user.uid;
                await updateProfile(userCredential.user, { displayName: formData.fullName.trim() });
            } catch (err: any) {
                if (err?.code !== 'auth/email-already-in-use') throw err;
                const credential = await signInWithEmailAndPassword(auth, email, formData.password);
                uid = credential.user.uid;
            }

            await setDoc(doc(db, 'users', uid), {
                uid,
                email,
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
                email,
                phone: formData.mobile.trim()
            });
            updateSignupData({
                name: formData.fullName.trim(),
                email,
                phone: formData.mobile.trim()
            });
            setOwnerAccount({
                uid,
                fullName: formData.fullName.trim(),
                email,
                mobile: formData.mobile.trim()
            });

            onNext();
        } catch (err: any) {
            console.error('Signup error:', err);
            setError(err?.message || 'Failed to create account.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    ACCOUNT CREATION
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Create the owner login after property and proof details have been completed.
                </Typography>
            </Box>

            <Container maxWidth="md">
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack spacing={3}>
                        <Alert severity="info" sx={{ bgcolor: 'rgba(198,167,94,0.08)', color: binThemeTokens.gold, border: '1px solid rgba(198,167,94,0.25)' }}>
                            Dashboard access stays locked until admin approval and mobilization payment verification.
                        </Alert>
                        {error && <Alert severity="error">{error}</Alert>}

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

                        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                            <Button variant="outlined" size="large" onClick={onBack} startIcon={<ArrowLeft />} disabled={loading} sx={{ borderRadius: 100, px: 4, color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.12)' }}>
                                BACK
                            </Button>
                            <Button
                                variant="contained"
                                size="large"
                                onClick={handleSignup}
                                disabled={loading}
                                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : undefined}
                                endIcon={!loading ? <ArrowRight /> : undefined}
                                sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                            >
                                {loading ? 'CREATING...' : 'CREATE ACCOUNT'}
                            </Button>
                        </Box>
                    </Stack>
                </Paper>
            </Container>
        </Box>
    );
};

export default AccountCreationStep;
