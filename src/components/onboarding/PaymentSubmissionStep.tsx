import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Stack, Alert, CircularProgress, Paper, Grid, Container, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { CheckCircle, AlertCircle, Upload, FileText, Download } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { storage, auth, functions, httpsCallable } from '../../lib/firebase';
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

export default function PaymentSubmissionStep({ onBack }: PaymentSubmissionStepProps) {
    const {
        companyProfile,
        ownerAccount,
        proofDocuments,
        intakeId,
        onboardingSessionId,
        setIntakeId,
        paymentMethod,
        selectedPlan,
        selectedAddOns,
        properties,
        portfolioSummary,
        reset
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [uploadedUrls, setUploadedUrls] = useState<{ [key: string]: string }>({});
    const [confirmDialog, setConfirmDialog] = useState(false);

    // ─── VALIDATION ───────────────────────────────────────────────
    useEffect(() => {
        if (!ownerAccount?.uid) {
            setError('Account not created. Please go back and complete Step 7.');
        }
        if (!paymentMethod) {
            setError('Payment method not selected. Please go back and select a payment option.');
        }
    }, [ownerAccount, paymentMethod]);

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
                
                // ✅ Storage path must use the live Firebase Auth UID because storage.rules requires request.auth.uid == userId
                const safeSessionId = onboardingSessionId || intakeId || activeUser.uid;
                const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = `onboarding-proof/${activeUser.uid}/${safeSessionId}/${key}/${Date.now()}_${safeFileName}`;
                const fileRef = ref(storage, storagePath);
                
                // Upload with progress tracking
                const snapshot = await uploadBytes(fileRef, file, {
                    customMetadata: {
                        uploadedBy: activeUser.email || ownerAccount?.email || companyProfile.email || '',
                        ownerUid: activeUser.uid,
                        uploadedAt: new Date().toISOString(),
                        docType: key,
                        sessionId: onboardingSessionId || intakeId || activeUser.uid
                    }
                });

                // Get download URL
                const downloadUrl = await getDownloadURL(fileRef);
                urls[key] = downloadUrl;
                
                setUploadProgress(prev => ({ ...prev, [key]: 100 }));
                console.log(`✅ [UPLOAD] ${label} uploaded: ${downloadUrl}`);
            } catch (uploadErr: any) {
                console.error(`❌ [UPLOAD] ${label} failed:`, uploadErr);
                throw new Error(`Failed to upload ${label}: ${uploadErr.message}`);
            }
        }

        return urls;
    };

    const waitForCurrentUser = (): Promise<FirebaseUser | null> => {
        return new Promise((resolve) => {
            if (auth.currentUser) {
                resolve(auth.currentUser);
                return;
            }
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                unsubscribe();
                resolve(user);
            });
            setTimeout(() => {
                unsubscribe();
                resolve(auth.currentUser);
            }, 4000);
        });
    };

    // ─── SUBMIT PAYMENT ───────────────────────────────────────────
    const submitPayment = async () => {
        setError(null);
        setLoading(true);

        try {
            console.log('[PAYMENT] Waiting for auth hydration...');
            const currentUser = await waitForCurrentUser();
            if (!currentUser) {
                throw new Error('Your session expired. Please sign in again.');
            }
            if (!ownerAccount?.uid) throw new Error('Owner account not created');
            await currentUser.getIdToken(true);
            const effectiveOwnerUid = currentUser.uid;
            const effectiveOwnerEmail = currentUser.email || ownerAccount.email || companyProfile.email;
            if (ownerAccount.uid !== currentUser.uid) {
                console.warn('[PAYMENT] Stored owner UID differs from authenticated UID. Using authenticated UID for Storage upload.', {
                    storedOwnerUid: ownerAccount.uid,
                    authUid: currentUser.uid
                });
            }
            const effectiveIntakeId = intakeId || onboardingSessionId || effectiveOwnerUid;
            setIntakeId(effectiveIntakeId);
            if (!effectiveIntakeId) throw new Error('Intake ID missing');
            if (!paymentMethod) throw new Error('Payment method not selected');

            // 1️⃣ Upload proof documents to Storage
            console.log('[PAYMENT] Step 1: Uploading documents to Storage...');
            const urls = await uploadProofDocuments(currentUser);
            setUploadedUrls(urls);

            // 2️⃣ Submit onboarding package through backend Callable
            if (paymentMethod === 'STRIPE') {
                console.log('[PAYMENT] Step 2: Creating Stripe checkout session...');
                const createCheckout = httpsCallable(functions, 'createStripeCheckoutSession');
                const sessionRes = await createCheckout({
                    ownerUid: effectiveOwnerUid,
                    ownerEmail: effectiveOwnerEmail,
                    intakeId: effectiveIntakeId,
                    onboardingSessionId,
                    amount: portfolioSummary.estimatedACV
                });

                const sessionData = sessionRes.data as { url?: string };
                if (sessionData?.url) {
                    console.log('[PAYMENT] Step 3: Redirecting to Stripe:', sessionData.url);
                    await clearStagedFiles();
                    window.location.href = sessionData.url;
                    return;
                } else {
                    throw new Error('Stripe redirect URL not returned by server.');
                }
            }

            console.log('[PAYMENT] Step 2: Finalizing submission via backend...');
            const submitPackage = httpsCallable(functions, 'submitOwnerOnboardingPaymentPackage');
            await submitPackage({
                ownerUid: effectiveOwnerUid,
                ownerEmail: effectiveOwnerEmail,
                intakeId: effectiveIntakeId,
                onboardingSessionId,
                paymentMethod,
                amount: portfolioSummary.estimatedACV,
                companyProfile: {
                    name: companyProfile.name,
                    licenseNumber: companyProfile.licenseNumber,
                    email: companyProfile.email
                },
                serviceDetails: {
                    properties: properties.length,
                    totalUnits: portfolioSummary.totalUnits,
                    selectedPlan: selectedPlan?.name || 'Standard',
                    selectedAddOns: selectedAddOns || []
                },
                documentUrls: urls
            });

            console.log('[PAYMENT] Step 3: Clearing staged IndexedDB files...');
            await clearStagedFiles();

            console.log('✅ [PAYMENT] All steps completed successfully');
            setSuccess(true);
        } catch (err: any) {
            console.error('[PAYMENT] Submission failed:', err);
            setError(`Payment submission failed: ${err.message}`);
        } finally {
            setLoading(false);
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
                                <Box component="a" href={url} target="_blank" rel="noopener noreferrer" sx={{ color: '#4ADE80', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700 }}>DOWNLOAD ↗</Box>
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
                    <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                        {error}
                    </Alert>
                )}

                {/* Payment Summary */}
                <Box sx={{ mb: 4, p: 3, bgcolor: 'rgba(212, 175, 55, 0.05)', borderRadius: 2, border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                    <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 2 }}>
                        {readable(t('onboarding.payment_summary'), 'Payment Summary')}
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Amount Due</Typography>
                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>AED {portfolioSummary.estimatedACV?.toLocaleString()}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Payment Method</Typography>
                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{paymentMethod || 'Not Selected'}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Properties</Typography>
                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{properties.length}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Total Units</Typography>
                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{portfolioSummary.totalUnits}</Typography>
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
                        disabled={loading || !ownerAccount?.uid || !paymentMethod}
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
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block' }}>Amount: AED {portfolioSummary.estimatedACV?.toLocaleString()}</Typography>
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

