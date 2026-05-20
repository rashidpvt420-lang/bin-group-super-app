import React, { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Divider,
    Grid,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { ArrowLeft, CheckCircle2, CreditCard, ShieldCheck, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    auth,
    functions,
    getDownloadURL,
    httpsCallable,
    onAuthStateChanged,
    ref,
    storage,
    uploadBytes,
    signInWithEmailAndPassword
} from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../../utils/formatters';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor } from '../../utils/geoAnchor';

const cleanFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.')) return fallback;
    return value;
};

const waitForCurrentUser = (timeoutMs = 8000): Promise<any | null> => {
    return new Promise((resolve) => {
        if (auth.currentUser) {
            resolve(auth.currentUser);
            return;
        }

        let resolved = false;
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (resolved) return;
            resolved = true;
            unsubscribe();
            resolve(user);
        });

        window.setTimeout(() => {
            if (resolved) return;
            resolved = true;
            unsubscribe();
            resolve(auth.currentUser);
        }, timeoutMs);
    });
};

const PaymentSubmissionStep: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const navigate = useNavigate();
    const {
        properties,
        selectedPlan,
        selectedAddOns,
        portfolioSummary,
        companyProfile,
        ownerAccount,
        onboardingSessionId,
        proofDocuments,
        paymentMethod,
        setPaymentMethod,
        setIntakeId,
        updateKycUrls,
        reset
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const [submitting, setSubmitting] = useState(false);
    const [uploadingProofs, setUploadingProofs] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submissionResult, setSubmissionResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const [reauthRequired, setReauthRequired] = useState(false);
    const [reauthPassword, setReauthPassword] = useState('');
    const [reauthLoading, setReauthLoading] = useState(false);

    const ownerEmail = ownerAccount?.email || companyProfile.email || '';

    const estimatedAnnualValue = portfolioSummary?.estimatedACV || (portfolioSummary?.totalUnits || 1) * 2500;
    const mobilizationAmount = Math.round(estimatedAnnualValue * 0.15);

    const uploadProofDocuments = async (uid: string) => {
        const required: Array<[string, File | null]> = [
            ['titleDeed', proofDocuments.propertyProof],
            ['emiratesId', proofDocuments.emiratesId],
            ['passport', proofDocuments.passport],
        ];
        const missing = required.filter(([, file]) => !file).map(([key]) => key);
        if (missing.length) throw new Error(`Missing required documents: ${missing.join(', ')}`);

        const optional: Array<[string, File | null]> = [
            ['tradeLicense', proofDocuments.tradeLicense],
            ['tenancySupport', proofDocuments.tenancySupport],
        ];

        const allDocs = [...required, ...optional].filter(([, file]) => !!file) as Array<[string, File]>;
        const uploaded: Record<string, any> = {};
        const urls: Record<string, string> = {};
        const basePath = `ownerOnboarding/${uid}/${onboardingSessionId}`;

        setUploadingProofs(true);
        for (const [key, file] of allDocs) {
            const path = `${basePath}/${key}_${Date.now()}_${cleanFileName(file.name)}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, file, {
                contentType: file.type || 'application/octet-stream',
                customMetadata: {
                    ownerUid: uid,
                    onboardingSessionId,
                    documentType: key,
                    originalName: file.name,
                }
            });
            const url = await getDownloadURL(storageRef);
            urls[key] = url;
            uploaded[key] = {
                name: file.name,
                size: file.size,
                type: file.type,
                storagePath: path,
                downloadUrl: url,
                uploadedAt: new Date().toISOString(),
            };
        }
        setUploadingProofs(false);
        updateKycUrls({
            titleDeed: urls.titleDeed,
            emiratesId: urls.emiratesId,
            passport: urls.passport,
            tradeLicense: urls.tradeLicense,
        });
        return uploaded;
    };

    const submitWithUser = async (currentUser: any) => {
        if (currentUser.uid !== ownerAccount?.uid) {
            setError(readable(t('onboarding.error.session_mismatch'), 'The active login does not match this owner onboarding session.'));
            return;
        }

        if (!paymentMethod) {
            setError(readable(t('onboarding.payment_method_required'), 'Select a payment method before submission.'));
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await currentUser.getIdToken(true);
            const uploadedProofDocuments = await uploadProofDocuments(currentUser.uid);
            const submissionId = `${currentUser.uid}_${onboardingSessionId}`;
            const submitOwnerOnboarding = httpsCallable(functions, 'submitOwnerOnboarding');
            
            const submissionPayload = JSON.parse(JSON.stringify({
                idempotencyKey: submissionId,
                onboardingSessionId,
                ownerAccount,
                companyProfile,
                properties,
                selectedPlan,
                selectedAddOns,
                portfolioSummary,
                proofDocuments: uploadedProofDocuments,
                kycUrls: {
                    titleDeed: uploadedProofDocuments.titleDeed?.downloadUrl,
                    emiratesId: uploadedProofDocuments.emiratesId?.downloadUrl,
                    passport: uploadedProofDocuments.passport?.downloadUrl,
                    tradeLicense: uploadedProofDocuments.tradeLicense?.downloadUrl,
                },
                pricing: {
                    annualContractValue: estimatedAnnualValue,
                    mobilizationAmount,
                    currency: 'AED'
                },
                payment: {
                    method: paymentMethod,
                    amount: mobilizationAmount,
                    currency: 'AED'
                }
            }));

            const result = await submitOwnerOnboarding(submissionPayload);
            const response = result.data as any;
            setSubmissionResult(response);
            setIntakeId(response?.intakeId || submissionId);
            setReauthRequired(false);
            setReauthPassword('');
            setSubmitted(true);
        } catch (err: any) {
            setError(err?.message || 'Onboarding submission failed.');
        } finally {
            setSubmitting(false);
            setUploadingProofs(false);
        }
    };
    
    const handleSubmit = async () => {
        if (!ownerAccount?.uid) {
            setError(readable(t('onboarding.error.acc_required'), 'Account creation is required before payment submission.'));
            return;
        }

        const currentUser = await waitForCurrentUser();
        if (!currentUser) {
            setReauthRequired(true);
            setError('Your secure login session is not active. Enter the owner password below to reconnect and submit without losing this onboarding form.');
            return;
        }

        await submitWithUser(currentUser);
    };

    const handleInlineReauth = async () => {
        if (!ownerEmail) {
            setError('Owner email is missing. Go back to Account step and confirm the owner email.');
            return;
        }

        if (!reauthPassword) {
            setError('Enter the owner account password to reconnect this onboarding session.');
            return;
        }

        setReauthLoading(true);
        setError(null);

        try {
            const credential = await signInWithEmailAndPassword(auth, ownerEmail.toLowerCase(), reauthPassword);
            await submitWithUser(credential.user);
        } catch (err: any) {
            setError(
                err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential'
                    ? 'Password is incorrect for this owner account.'
                    : err?.message || 'Unable to reconnect owner session.'
            );
        } finally {
            setReauthLoading(false);
        }
    };

    if (submitted) {
        return (
            <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
                <CheckCircle2 size={88} color="#10b981" style={{ marginBottom: 24 }} />
                <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                    {readable(t('onboarding.submission_secured'), 'Submission Secured')}
                </Typography>
                <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.62)', mb: 4 }}>
                    {readable(t('onboarding.dashboard_locked_info'), 'Your dashboard will activate upon admin verification.')}
                </Typography>
                <Button
                    variant="contained"
                    onClick={() => {
                        reset();
                        navigate('/owner/dashboard');
                    }}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 5, py: 1.5 }}
                >
                    {readable(t('onboarding.go_dashboard'), 'Go to Dashboard')}
                </Button>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 5 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {readable(t('onboarding.payment_submission'), 'Payment Submission')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {readable(t('onboarding.payment_confirm_desc'), 'Submit your selected payment method for admin verification and contract activation.')}
                </Typography>
            </Box>

            <Grid container spacing={4} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.62)', border: '1px solid rgba(255,255,255,0.06)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Stack spacing={3}>
                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{readable(t('onboarding.selected_contract'), 'Selected Contract')}</Typography>
                                <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{selectedPlan?.name || 'Institutional Package'}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{readable(t('onboarding.portfolio_addons'), 'Portfolio Add-ons')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF' }}>{readable(t('onboarding.total_assets'), 'Total Assets')}: {properties.length}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                            <Grid container spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">{readable(t('onboarding.annual_val'), 'Annual Value')}</Typography>
                                    <Typography variant="h6" fontWeight="950" color="#FFF">{formatAED(estimatedAnnualValue)}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">{readable(t('onboarding.mobilization_due'), 'Mobilization Due')}</Typography>
                                    <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{formatAED(mobilizationAmount)}</Typography>
                                </Grid>
                            </Grid>
                            <TextField select fullWidth label={readable(t('onboarding.payment_method'), 'Payment Method')} value={paymentMethod || ''} onChange={(e) => setPaymentMethod(e.target.value as any)} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                <MenuItem value="BANK_TRANSFER">{readable(t('onboarding.bank_transfer'), 'Bank Transfer')}</MenuItem>
                                <MenuItem value="CHEQUE">{readable(t('onboarding.corp_cheque'), 'Corporate Cheque')}</MenuItem>
                                <MenuItem value="CASH">{readable(t('onboarding.cash_payment'), 'Cash Payment')}</MenuItem>
                            </TextField>
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(198,167,94,0.06)', border: `1px solid ${binThemeTokens.gold}`, textAlign: isRTL ? 'right' : 'left' }}>
                        <Stack spacing={2}>
                            <ShieldCheck color={binThemeTokens.gold} size={32} />
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{readable(t('onboarding.admin_lock_title'), 'Admin Verification Required')}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                                {readable(t('onboarding.admin_lock_desc'), 'Your contract and dashboard will remain locked until BIN GROUP admin verifies the payment and documents.')}
                            </Typography>
                            {uploadingProofs && <Alert severity="info">Uploading owner proof documents to Firebase Storage...</Alert>}
                            {error && (
                                <Alert 
                                    severity="error" 
                                    action={
                                        error.includes('login session') || error.includes('secure login') || error.includes('session') ? (
                                            <Button color="inherit" size="small" onClick={() => setReauthRequired(true)}>
                                                Reconnect
                                            </Button>
                                        ) : null
                                    }
                                >
                                    {error}
                                </Alert>
                            )}

                            {reauthRequired && (
                                <Paper sx={{ p: 3, mt: 1, borderRadius: 4, bgcolor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <Stack spacing={2}>
                                        <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold, display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <LogIn size={16} /> Reconnect Owner Session
                                        </Typography>
                                        <TextField
                                            fullWidth
                                            label="Owner Email"
                                            value={ownerEmail}
                                            disabled
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: 'rgba(255,255,255,0.7)' } }}
                                        />
                                        <TextField
                                            fullWidth
                                            type="password"
                                            label="Owner Password"
                                            placeholder="Enter password to reconnect"
                                            value={reauthPassword}
                                            onChange={(e) => setReauthPassword(e.target.value)}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                        <Button
                                            variant="contained"
                                            fullWidth
                                            disabled={reauthLoading || submitting || uploadingProofs}
                                            onClick={handleInlineReauth}
                                            sx={{ py: 1.5, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                                        >
                                            {reauthLoading || submitting || uploadingProofs ? <CircularProgress size={20} color="inherit" /> : 'Sign in and submit'}
                                        </Button>
                                    </Stack>
                                </Paper>
                            )}

                            {!reauthRequired && (
                                <Button
                                    variant="contained"
                                    fullWidth
                                    disabled={submitting || uploadingProofs}
                                    onClick={handleSubmit}
                                    sx={{ mt: 2, py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                                >
                                    {submitting || uploadingProofs ? <CircularProgress size={22} color="inherit" /> : readable(t('onboarding.submit_btn'), 'Submit for Admin Verification')}
                                </Button>
                            )}
                            <Button onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : null} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null} sx={{ color: 'rgba(255,255,255,0.52)', fontWeight: 800 }}>
                                {readable(t('onboarding.back'), 'Back')}
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
};

export default PaymentSubmissionStep;
