import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Stack, Alert, CircularProgress, Paper, Grid, Container, Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material';
import { CheckCircle, Upload, FileText } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { storage, auth, functions, httpsCallable, signInWithEmailAndPassword } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { getStagedFile, clearStagedFiles } from '../../lib/onboardingDb';

interface PaymentSubmissionStepProps {
    onBack: () => void;
}

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.')) return fallback;
    return value;
};

const resolveMoney = (...values: unknown[]): number => {
    for (const value of values) {
        const n = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    return 0;
};

const formatMoney = (value: number) => value.toLocaleString('en-AE');

const isAuthStorageFailure = (error: any) => {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    return code.includes('storage/unauthenticated') || code.includes('unauthenticated') || message.includes('storage/unauthenticated') || message.includes('user is not authenticated');
};

export default function PaymentSubmissionStep({ onBack }: PaymentSubmissionStepProps) {
    const {
        companyProfile,
        ownerAccount,
        proofDocuments,
        intakeId,
        onboardingSessionId,
        setIntakeId,
        paymentMethod,
        paymentManifest,
        selectedPlan,
        selectedAddOns,
        properties,
        portfolioSummary,
        isContractSigned,
        signatureName
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [uploadedUrls, setUploadedUrls] = useState<{ [key: string]: string }>({});
    const [confirmDialog, setConfirmDialog] = useState(false);

    // Inline reauth state
    const [reauthRequired, setReauthRequired] = useState(false);
    const [reauthPassword, setReauthPassword] = useState('');
    const [reauthLoading, setReauthLoading] = useState(false);
    const ownerEmail = ownerAccount?.email || companyProfile.email || '';

    const annualContractValue = resolveMoney(
        portfolioSummary?.estimatedACV,
        paymentManifest?.annualContractValue,
        selectedPlan?.annualPrice,
        selectedPlan?.price,
        selectedPlan?.total
    );
    const activationDeposit = resolveMoney(
        paymentManifest?.activationDeposit,
        paymentManifest?.amount,
        annualContractValue > 0 ? Math.round(annualContractValue * 0.15) : 0
    );
    const amountDue = activationDeposit || annualContractValue;

    // ─── VALIDATION ───────────────────────────────────────────────
    useEffect(() => {
        if (!ownerAccount?.uid) {
            setError('Account not created. Please go back and complete Step 7.');
        }
        if (!paymentMethod) {
            setError('Payment method not selected. Please go back and select a payment option.');
        }
        if (!isContractSigned) {
            setError('Contract not signed. Please go back and sign the service agreement.');
        }
        if (paymentMethod && isContractSigned && ownerAccount?.uid) {
            setError(null);
        }
    }, [ownerAccount, paymentMethod, isContractSigned]);

    // ─── CHECK STRIPE CALLBACK ─────────────────────────────────────
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('payment_success') === 'true' || params.get('session_id')) {
            setSuccess(true);
            clearStagedFiles().catch(console.error);
        } else if (params.get('payment_failed') === 'true') {
            setError('Payment checkout was cancelled or failed. Please try again.');
        }
    }, []);

    // ─── DOCUMENT UPLOAD TO STORAGE ───────────────────────────────
    const uploadProofDocuments = async (activeUser: FirebaseUser): Promise<{ [key: string]: string }> => {
        if (!activeUser?.uid) throw new Error('Authenticated owner UID missing');

        const urls: { [key: string]: string } = {};
        const docTypes = [
            { key: 'propertyProof', label: 'Property Proof' },
            { key: 'emiratesId', label: 'Emirates ID' },
            { key: 'passport', label: 'Passport' },
            { key: 'tradeLicense', label: 'Trade License' },
            { key: 'tenancySupport', label: 'Tenancy Support' }
        ];

        for (const { key, label } of docTypes) {
            const docMeta = proofDocuments[key as keyof typeof proofDocuments];
            if (!docMeta) {
                console.log(`[UPLOAD] Skipping ${label} (not provided)`);
                continue;
            }

            try {
                setUploadProgress(prev => ({ ...prev, [key]: 0 }));

                const file = await getStagedFile(key);
                if (!file) {
                    throw new Error(`File binary not found in local stage for ${label}. Please upload the file again.`);
                }

                await activeUser.getIdToken(true);

                // ✅ Storage path must use the live Firebase Auth UID because storage.rules requires request.auth.uid == userId
                const safeSessionId = onboardingSessionId || intakeId || activeUser.uid;
                const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = `onboarding-proof/${activeUser.uid}/${safeSessionId}/${key}/${Date.now()}_${safeFileName}`;
                const fileRef = ref(storage, storagePath);

                await uploadBytes(fileRef, file, {
                    customMetadata: {
                        uploadedBy: activeUser.email || ownerAccount?.email || companyProfile.email || '',
                        ownerUid: activeUser.uid,
                        uploadedAt: new Date().toISOString(),
                        docType: key,
                        sessionId: onboardingSessionId || intakeId || activeUser.uid
                    }
                });

                const downloadUrl = await getDownloadURL(fileRef);
                urls[key] = downloadUrl;

                setUploadProgress(prev => ({ ...prev, [key]: 100 }));
                console.log(`✅ [UPLOAD] ${label} uploaded: ${downloadUrl}`);
            } catch (uploadErr: any) {
                console.error(`❌ [UPLOAD] ${label} failed:`, uploadErr);
                throw new Error(`Failed to upload ${label}: ${uploadErr.message || uploadErr.code || String(uploadErr)}`);
            }
        }

        return urls;
    };

    const waitForCurrentUser = (timeoutMs = 8000): Promise<FirebaseUser | null> => {
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
            setTimeout(() => {
                if (resolved) return;
                resolved = true;
                unsubscribe();
                resolve(auth.currentUser);
            }, timeoutMs);
        });
    };

    const submitWithUser = async (currentUser: FirebaseUser) => {
        if (!currentUser) {
            setError('Authenticated user missing for submission.');
            return;
        }

        if (currentUser.uid !== ownerAccount?.uid) {
            console.warn('[PAYMENT] Authenticated UID differs from onboarding owner uid; using authenticated UID for storage/upload.');
        }

        try {
            await currentUser.getIdToken(true); // ensure fresh token for storage and callable
            const urls = await uploadProofDocuments(currentUser);
            setUploadedUrls(urls);

            const effectiveOwnerUid = currentUser.uid;
            const effectiveOwnerEmail = currentUser.email || ownerEmail;
            const effectiveIntakeId = intakeId || onboardingSessionId || effectiveOwnerUid;
            setIntakeId(effectiveIntakeId);

            if (!effectiveIntakeId) throw new Error('Intake ID missing');
            if (!paymentMethod) throw new Error('Payment method not selected');
            if (amountDue <= 0) throw new Error('Payment amount is missing. Go back and recalculate the quote.');

            if (paymentMethod === 'STRIPE') {
                const createCheckout = httpsCallable(functions, 'createStripeCheckoutSession');
                const sessionRes = await createCheckout({
                    ownerUid: effectiveOwnerUid,
                    ownerEmail: effectiveOwnerEmail,
                    intakeId: effectiveIntakeId,
                    onboardingSessionId,
                    annualContractValue,
                    activationDeposit: amountDue,
                    amount: amountDue
                });
                const sessionData = sessionRes.data as { url?: string };
                if (sessionData?.url) {
                    await clearStagedFiles();
                    window.location.href = sessionData.url;
                    return;
                } else {
                    throw new Error('Stripe redirect URL not returned by server.');
                }
            }

            const submitPackage = httpsCallable(functions, 'submitOwnerOnboardingPaymentPackage');
            await submitPackage({
                ownerUid: effectiveOwnerUid,
                ownerEmail: effectiveOwnerEmail,
                intakeId: effectiveIntakeId,
                onboardingSessionId,
                paymentMethod,
                amount: amountDue,
                activationDeposit: amountDue,
                annualContractValue,
                paymentManifest: paymentManifest || null,
                companyProfile: {
                    name: companyProfile.name,
                    licenseNumber: companyProfile.licenseNumber,
                    contactPerson: companyProfile.contactPerson,
                    email: companyProfile.email,
                    phone: companyProfile.phone
                },
                serviceDetails: {
                    properties: properties.length,
                    totalUnits: portfolioSummary.totalUnits,
                    selectedPlan: selectedPlan?.name || selectedPlan?.packageName || 'Standard',
                    selectedAddOns: selectedAddOns || []
                },
                properties,
                signatureName,
                documentUrls: urls
            });

            await clearStagedFiles();
            setSuccess(true);
        } catch (err: any) {
            console.error('[PAYMENT] submitWithUser failed:', err?.message || err);
            throw err;
        }
    };

    // ─── SUBMIT PAYMENT ───────────────────────────────────────────
    const submitPayment = async () => {
        setError(null);
        setLoading(true);

        try {
            console.log('[PAYMENT] Waiting for auth hydration...');
            const currentUser = await waitForCurrentUser();
            if (!currentUser) {
                setReauthRequired(true);
                setError('Your secure login session is not active. Enter the owner password below to reconnect and submit without losing this onboarding form.');
                setLoading(false);
                return;
            }
            if (!ownerAccount?.uid) throw new Error('Owner account not created');

            console.log('[PAYMENT] Auth present — continuing submission for user', currentUser.uid);
            await submitWithUser(currentUser);
        } catch (err: any) {
            console.error('[PAYMENT] Submission failed:', err);
            if (isAuthStorageFailure(err)) {
                setReauthRequired(true);
                setError('Your secure login session expired before the documents could upload. Re-enter the owner password below and press Sign in & Submit. Your uploaded files are still staged on this device.');
            } else {
                setError(`Payment submission failed: ${err?.message || String(err)}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleInlineReauth = async () => {
        if (!ownerEmail) {
            setError('Owner email missing; go back to account step and confirm owner email.');
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
            await credential.user.getIdToken(true);
            await submitWithUser(credential.user);
        } catch (err: any) {
            console.error('[PAYMENT] Inline reauth failed:', err?.code || err?.message || err);
            setError(err?.code === 'auth/wrong-password' ? 'Password is incorrect for this owner account.' : (err?.message || 'Unable to reconnect owner session.'));
        } finally {
            setReauthLoading(false);
        }
    };

    // ─── RENDER: SUCCESS STATE ────────────────────────────────────
    if (success) {
        return (
            <Container maxWidth="md" sx={{ py: { xs: 4, md: 10 }, textAlign: 'center' }} dir={isRTL ? 'rtl' : 'ltr'}>
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: { xs: 4, md: 8 }, bgcolor: 'rgba(22, 22, 24, 0.8)', border: '1px solid #4ADE80', backdropFilter: 'blur(10px)' }}>
                    <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: 'rgba(74, 222, 128, 0.1)' }}>
                            <CheckCircle size={48} color="#4ADE80" />
                        </Box>
                    </Box>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                        {readable(t('onboarding.payment_success_title'), 'Payment Submitted')}
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#4ADE80', fontWeight: 700, mb: 2 }}>
                        {readable(t('onboarding.payment_success_desc'), 'Your payment and documents have been submitted successfully.')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 4 }}>
                        Intake ID: <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{intakeId || ownerAccount?.uid || onboardingSessionId}</Box>
                    </Typography>
                    <Box sx={{ mb: 3, p: 2, bgcolor: 'rgba(74, 222, 128, 0.05)', borderRadius: 2, border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                        <Typography variant="caption" sx={{ color: '#4ADE80', fontWeight: 700, display: 'block', mb: 1 }}>DOCUMENTS UPLOADED:</Typography>
                        {Object.entries(uploadedUrls).map(([key, url]) => (
                            <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>{key}</Typography>
                                <Box component="a" href={url} target="_blank" rel="noopener noreferrer" sx={{ color: '#4ADE80', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700 }}>DOWNLOAD</Box>
                            </Box>
                        ))}
                    </Box>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 3 }}>
                        Our admin team will review your submission within 24-48 hours. You'll receive an email confirmation.
                    </Typography>
                    <Button
                        variant="contained"
                        onClick={() => window.location.href = '/'}
                        sx={{
                            bgcolor: binThemeTokens.gold,
                            color: '#000',
                            fontWeight: 950,
                            py: 1.5,
                            px: 4,
                            borderRadius: 100,
                            '&:hover': { bgcolor: '#FFF' }
                        }}
                    >
                        {readable(t('onboarding.return_home'), 'Return to Home')}
                    </Button>
                </Paper>
            </Container>
        );
    }

    // ─── RENDER: MAIN FORM ────────────────────────────────────────
    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 800, mx: 'auto', width: '100%', py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 }, overflow: 'visible' }}>
            <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 4 } }}>
                <Typography variant="h4" fontWeight="950" color="#FFF" gutterBottom sx={{ fontSize: { xs: '1.8rem', md: '2.125rem' } }}>
                    {readable(t('onboarding.payment_submission'), 'Payment Submission')}
                </Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">
                    {readable(t('onboarding.payment_submission_desc'), 'Review and confirm your payment details. Your documents are about to be uploaded securely.')}
                </Typography>
            </Box>

            <Paper sx={{
                p: { xs: 2, sm: 3, md: 5 },
                borderRadius: { xs: 4, md: 6 },
                bgcolor: 'rgba(22, 22, 24, 0.6)',
                border: '1px solid rgba(255,255,255,0.05)',
                backdropFilter: 'blur(10px)',
                overflow: 'visible'
            }}>
                {error && (
                    <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}
                        action={error?.toLowerCase().includes('session') ? (
                            <Button color="inherit" size="small" onClick={() => { setReauthRequired(true); }}>
                                Reconnect
                            </Button>
                        ) : null}
                    >
                        {error}
                    </Alert>
                )}

                {reauthRequired && (
                    <Paper sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.45)' }}>
                        <Stack spacing={1}>
                            <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, fontWeight: 800 }}>Reconnect Owner Session</Typography>
                            <TextField fullWidth label="Owner Email" value={ownerEmail} disabled />
                            <TextField fullWidth label="Owner Password" type="password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} />
                            <Stack direction="row" spacing={1}>
                                <Button variant="contained" onClick={handleInlineReauth} disabled={reauthLoading || loading} sx={{ bgcolor: binThemeTokens.gold, color: '#000' }}>
                                    {reauthLoading ? <CircularProgress size={18} color="inherit" /> : 'Sign in & Submit'}
                                </Button>
                                <Button onClick={() => setReauthRequired(false)} disabled={reauthLoading || loading}>Cancel</Button>
                            </Stack>
                        </Stack>
                    </Paper>
                )}

                {/* Payment Summary */}
                <Box sx={{ mb: 4, p: 3, bgcolor: 'rgba(212, 175, 55, 0.05)', borderRadius: 2, border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                    <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 2 }}>
                        {readable(t('onboarding.payment_summary'), 'Payment Summary')}
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Amount Due</Typography>
                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>AED {formatMoney(amountDue)}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Payment Method</Typography>
                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{paymentMethod || 'Not Selected'}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Annual Contract Value</Typography>
                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>AED {formatMoney(annualContractValue)}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Properties / Units</Typography>
                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{properties.length} / {portfolioSummary.totalUnits}</Typography>
                        </Grid>
                    </Grid>
                </Box>

                {/* Document Upload Status */}
                <Box sx={{ mb: 4 }}>
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                        {readable(t('onboarding.documents_to_upload'), 'Documents to Upload')}
                    </Typography>
                    <Stack spacing={2}>
                        {[
                            { key: 'propertyProof', label: 'Property Proof' },
                            { key: 'emiratesId', label: 'Emirates ID' },
                            { key: 'passport', label: 'Passport' },
                            { key: 'tradeLicense', label: 'Trade License' },
                            { key: 'tenancySupport', label: 'Tenancy Support (Optional)' }
                        ].map(({ key, label }) => {
                            const file = proofDocuments[key as keyof typeof proofDocuments];
                            const progress = uploadProgress[key] || 0;
                            return (
                                <Box key={key} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <FileText size={16} color="#C6A75E" />
                                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{label}</Typography>
                                        </Box>
                                        {file ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <CheckCircle size={16} color="#4ADE80" />
                                                <Typography variant="caption" sx={{ color: '#4ADE80' }}>Ready</Typography>
                                            </Box>
                                        ) : (
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Not provided</Typography>
                                        )}
                                    </Box>
                                    {file && (
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>{file.name}</Typography>
                                    )}
                                    {progress > 0 && progress < 100 && (
                                        <Box sx={{ mt: 1, bgcolor: 'rgba(0,0,0,0.5)', height: 4, borderRadius: 2, overflow: 'hidden' }}>
                                            <Box sx={{ width: `${progress}%`, height: '100%', bgcolor: binThemeTokens.gold, transition: 'width 0.3s ease' }} />
                                        </Box>
                                    )}
                                </Box>
                            );
                        })}
                    </Stack>
                </Box>

                {/* Action Buttons */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 3 }}>
                    <Button
                        variant="outlined"
                        onClick={onBack}
                        disabled={loading}
                        fullWidth
                        sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', py: 1.5, px: 4, borderRadius: 100, fontWeight: 950 }}
                    >
                        {readable(t('onboarding.back'), 'Back')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => setConfirmDialog(true)}
                        disabled={loading || !ownerAccount?.uid || !paymentMethod || amountDue <= 0}
                        fullWidth
                        sx={{
                            bgcolor: binThemeTokens.gold,
                            color: '#000',
                            fontWeight: 950,
                            py: 1.5,
                            px: 4,
                            borderRadius: 100,
                            '&:hover': { bgcolor: '#FFF' }
                        }}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Upload size={18} />
                                {readable(t('onboarding.submit_payment'), 'Submit Payment & Documents')}
                            </Box>
                        )}
                    </Button>
                </Stack>
            </Paper>

            {/* Confirmation Dialog */}
            <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
                <DialogTitle sx={{ color: '#FFF', bgcolor: '#000', fontWeight: 950 }}>Confirm Submission</DialogTitle>
                <DialogContent sx={{ bgcolor: '#000', color: '#FFF' }}>
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            You're about to submit your payment and upload all documents. This action cannot be undone.
                        </Typography>
                        <Box sx={{ p: 2, bgcolor: 'rgba(212, 175, 55, 0.05)', borderRadius: 2, border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 700, display: 'block', mb: 1 }}>SUBMISSION DETAILS:</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block' }}>Amount Due: AED {formatMoney(amountDue)}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block' }}>Annual Value: AED {formatMoney(annualContractValue)}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block' }}>Method: {paymentMethod}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block' }}>Intake ID: {intakeId || ownerAccount?.uid || onboardingSessionId}</Typography>
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ bgcolor: '#000', p: 2 }}>
                    <Button onClick={() => setConfirmDialog(false)} sx={{ color: '#FFF' }}>Cancel</Button>
                    <Button
                        onClick={() => {
                            setConfirmDialog(false);
                            submitPayment();
                        }}
                        variant="contained"
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                    >
                        Confirm & Submit
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
