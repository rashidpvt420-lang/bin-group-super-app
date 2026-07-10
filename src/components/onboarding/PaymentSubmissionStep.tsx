import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    Paper,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { CheckCircle, FileText, Upload } from 'lucide-react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { auth, functions, httpsCallable, signInWithEmailAndPassword, storage } from '../../lib/firebase';
import { clearStagedFiles, getStagedFile } from '../../lib/onboardingDb';

interface PaymentSubmissionStepProps {
    onBack: () => void;
}

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.')) return fallback;
    return value;
};

const resolveMoney = (...values: unknown[]): number => {
    for (const value of values) {
        const amount = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(amount) && amount > 0) return Math.round(amount);
    }
    return 0;
};

const formatMoney = (value: number) => value.toLocaleString('en-AE');

const isAuthStorageFailure = (error: any) => {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    return code.includes('storage/unauthenticated') || code.includes('unauthenticated') || message.includes('storage/unauthenticated') || message.includes('user is not authenticated');
};

const fileToBase64Payload = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const output = String(reader.result || '');
        resolve(output.includes(',') ? output.split(',').pop() || '' : output);
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read file for fallback upload.'));
    reader.readAsDataURL(file);
});

const documentTypes = [
    { key: 'propertyProof', label: 'Property Proof' },
    { key: 'emiratesId', label: 'Emirates ID' },
    { key: 'passport', label: 'Passport' },
    { key: 'tradeLicense', label: 'Trade License' },
    { key: 'tenancySupport', label: 'Tenancy Support (Optional)' },
] as const;

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
        signatureName,
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [uploadedUrls, setUploadedUrls] = useState<Record<string, string>>({});
    const [confirmDialog, setConfirmDialog] = useState(false);
    const [reauthRequired, setReauthRequired] = useState(false);
    const [reauthPassword, setReauthPassword] = useState('');
    const [reauthLoading, setReauthLoading] = useState(false);

    const ownerEmail = ownerAccount?.email || companyProfile.email || '';
    const annualContractValue = resolveMoney(
        portfolioSummary?.estimatedACV,
        paymentManifest?.annualContractValue,
        selectedPlan?.annualPrice,
        selectedPlan?.price,
        selectedPlan?.total,
    );
    const activationDeposit = resolveMoney(
        paymentManifest?.activationDeposit,
        paymentManifest?.amount,
        annualContractValue > 0 ? Math.round(annualContractValue * 0.15) : 0,
    );
    const amountDue = activationDeposit || annualContractValue;

    useEffect(() => {
        if (!ownerAccount?.uid) {
            setError('Account not created. Please go back and complete Step 7.');
        } else if (!paymentMethod) {
            setError('Payment method not selected. Please go back and select a payment option.');
        } else if (!isContractSigned) {
            setError('Contract not signed. Please go back and sign the service agreement.');
        } else {
            setError(null);
        }
    }, [isContractSigned, ownerAccount?.uid, paymentMethod]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('payment_failed') === 'true') {
            setError('Payment checkout was cancelled or failed. Your signed onboarding package remains saved; restart checkout when ready.');
        }
        // A query parameter is never accepted as payment proof. Stripe success is
        // processed only by the signed webhook and final admin approval workflow.
    }, []);

    const uploadProofDocuments = async (activeUser: FirebaseUser): Promise<Record<string, string>> => {
        if (!activeUser.uid) throw new Error('Authenticated owner UID missing.');

        const urls: Record<string, string> = {};
        for (const { key, label } of documentTypes) {
            const documentMeta = proofDocuments[key as keyof typeof proofDocuments];
            if (!documentMeta) continue;

            let stagedFile: File | null = null;
            let safeFileName = `${key}.bin`;
            const safeSessionId = onboardingSessionId || intakeId || activeUser.uid;

            try {
                setUploadProgress((current) => ({ ...current, [key]: 0 }));
                stagedFile = await getStagedFile(key);
                if (!stagedFile) throw new Error(`File binary not found for ${label}. Upload it again.`);

                await activeUser.getIdToken(true);
                safeFileName = stagedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = `onboarding-proof/${activeUser.uid}/${safeSessionId}/${key}/${Date.now()}_${safeFileName}`;
                const fileRef = ref(storage, storagePath);
                await uploadBytes(fileRef, stagedFile, {
                    customMetadata: {
                        uploadedBy: activeUser.email || ownerEmail,
                        ownerUid: activeUser.uid,
                        uploadedAt: new Date().toISOString(),
                        docType: key,
                        sessionId: safeSessionId,
                    },
                });
                urls[key] = await getDownloadURL(fileRef);
                setUploadProgress((current) => ({ ...current, [key]: 100 }));
            } catch (uploadError: any) {
                if (!isAuthStorageFailure(uploadError)) {
                    throw new Error(`Failed to upload ${label}: ${uploadError?.message || uploadError?.code || String(uploadError)}`);
                }

                if (!stagedFile) stagedFile = await getStagedFile(key);
                if (!stagedFile) throw new Error(`File binary not found for ${label}. Upload it again.`);
                safeFileName = stagedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const uploadFallback = httpsCallable(functions, 'uploadOwnerOnboardingProofDocument');
                const fallbackResult = await uploadFallback({
                    ownerUid: activeUser.uid,
                    ownerEmail: activeUser.email || ownerEmail,
                    intakeId: safeSessionId,
                    onboardingSessionId: safeSessionId,
                    docType: key,
                    filename: safeFileName,
                    contentType: stagedFile.type || 'application/octet-stream',
                    encodedDocument: await fileToBase64Payload(stagedFile),
                });
                const fallbackData = fallbackResult.data as { downloadUrl?: string };
                if (!fallbackData.downloadUrl) throw new Error(`Fallback upload did not return a URL for ${label}.`);
                urls[key] = fallbackData.downloadUrl;
                setUploadProgress((current) => ({ ...current, [key]: 100 }));
            }
        }
        return urls;
    };

    const waitForCurrentUser = (timeoutMs = 8000): Promise<FirebaseUser | null> => new Promise((resolve) => {
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

    const submitWithUser = async (currentUser: FirebaseUser) => {
        await currentUser.getIdToken(true);
        const urls = await uploadProofDocuments(currentUser);
        setUploadedUrls(urls);

        const effectiveOwnerUid = currentUser.uid;
        const effectiveOwnerEmail = currentUser.email || ownerEmail;
        const effectiveIntakeId = intakeId || onboardingSessionId || effectiveOwnerUid;
        setIntakeId(effectiveIntakeId);

        if (!paymentMethod) throw new Error('Payment method not selected.');
        if (!isContractSigned || signatureName.trim().length < 3) throw new Error('A valid owner signature is required.');
        if (amountDue <= 0) throw new Error('Payment amount is missing. Go back and recalculate the quote.');

        const submissionPayload = {
            ownerUid: effectiveOwnerUid,
            ownerEmail: effectiveOwnerEmail,
            intakeId: effectiveIntakeId,
            onboardingSessionId: onboardingSessionId || effectiveIntakeId,
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
                phone: companyProfile.phone,
            },
            serviceDetails: {
                properties: properties.length,
                totalUnits: portfolioSummary.totalUnits,
                selectedPlan: selectedPlan?.name || selectedPlan?.packageName || 'Standard',
                selectedAddOns: selectedAddOns || [],
            },
            properties,
            signatureName: signatureName.trim(),
            documentUrls: urls,
        };

        // The contract, property package, signature, proof URLs, and canonical
        // payment transaction must exist before any external checkout redirect.
        const submitPackage = httpsCallable(functions, 'submitOwnerOnboardingPaymentPackage');
        await submitPackage(submissionPayload);

        if (paymentMethod === 'STRIPE') {
            const createCheckout = httpsCallable(functions, 'createStripeCheckoutSession');
            const sessionResult = await createCheckout({
                ownerUid: effectiveOwnerUid,
                ownerEmail: effectiveOwnerEmail,
                intakeId: effectiveIntakeId,
                onboardingSessionId: onboardingSessionId || effectiveIntakeId,
                annualContractValue,
                activationDeposit: amountDue,
                amount: amountDue,
            });
            const sessionData = sessionResult.data as { url?: string };
            if (!sessionData.url) throw new Error('Stripe redirect URL not returned by server.');
            await clearStagedFiles();
            window.location.href = sessionData.url;
            return;
        }

        await clearStagedFiles();
        setSuccess(true);
    };

    const submitPayment = async () => {
        setError(null);
        setLoading(true);
        try {
            const currentUser = await waitForCurrentUser();
            if (!currentUser) {
                setReauthRequired(true);
                setError('Your secure login session is not active. Enter the owner password below to reconnect without losing the form.');
                return;
            }
            if (!ownerAccount?.uid) throw new Error('Owner account not created.');
            await submitWithUser(currentUser);
        } catch (submissionError: any) {
            console.error('[PAYMENT] Submission failed:', submissionError);
            if (isAuthStorageFailure(submissionError)) {
                setReauthRequired(true);
                setError('Your secure login session expired. Re-enter the owner password and submit again; staged files remain on this device.');
            } else {
                setError(`Payment submission failed: ${submissionError?.message || String(submissionError)}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleInlineReauth = async () => {
        if (!ownerEmail) {
            setError('Owner email missing; return to the account step.');
            return;
        }
        if (!reauthPassword) {
            setError('Enter the owner account password.');
            return;
        }
        setReauthLoading(true);
        setError(null);
        try {
            const credential = await signInWithEmailAndPassword(auth, ownerEmail.toLowerCase(), reauthPassword);
            await credential.user.getIdToken(true);
            await submitWithUser(credential.user);
        } catch (reauthError: any) {
            setError(reauthError?.code === 'auth/wrong-password' ? 'Password is incorrect for this owner account.' : (reauthError?.message || 'Unable to reconnect owner session.'));
        } finally {
            setReauthLoading(false);
        }
    };

    if (success) {
        return (
            <Container maxWidth="md" sx={{ py: { xs: 4, md: 10 }, textAlign: 'center' }} dir={isRTL ? 'rtl' : 'ltr'}>
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: { xs: 4, md: 8 }, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid #4ADE80' }}>
                    <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}><CheckCircle size={52} color="#4ADE80" /></Box>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>Payment Package Submitted</Typography>
                    <Typography sx={{ color: '#4ADE80', fontWeight: 700, mb: 2 }}>Your signed contract, payment proof, property package, and documents are saved. The dashboard remains locked until admin approval.</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>Intake ID: <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{intakeId || ownerAccount?.uid || onboardingSessionId}</Box></Typography>
                    {Object.keys(uploadedUrls).length > 0 && (
                        <Box sx={{ mb: 3, p: 2, bgcolor: 'rgba(74,222,128,0.05)', borderRadius: 2, border: '1px solid rgba(74,222,128,0.2)' }}>
                            {Object.entries(uploadedUrls).map(([key, url]) => (
                                <Stack key={key} direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>{key}</Typography>
                                    <Box component="a" href={url} target="_blank" rel="noopener noreferrer" sx={{ color: '#4ADE80', fontSize: '0.75rem', fontWeight: 700 }}>VIEW</Box>
                                </Stack>
                            ))}
                        </Box>
                    )}
                    <Button variant="contained" onClick={() => { window.location.href = '/owner/activation'; }} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 100, px: 4, py: 1.5 }}>Open Activation Status</Button>
                </Paper>
            </Container>
        );
    }

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 800, mx: 'auto', width: '100%', py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" color="#FFF" gutterBottom>{readable(t('onboarding.payment_submission'), 'Payment Submission')}</Typography>
                <Typography color="rgba(255,255,255,0.5)">Your signed contract and document package will be persisted before payment or checkout begins.</Typography>
            </Box>

            <Paper sx={{ p: { xs: 2, md: 5 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

                {reauthRequired && (
                    <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(0,0,0,0.45)' }}>
                        <Stack spacing={1.5}>
                            <Typography sx={{ color: binThemeTokens.gold, fontWeight: 800 }}>Reconnect Owner Session</Typography>
                            <TextField fullWidth label="Owner Email" value={ownerEmail} disabled />
                            <TextField fullWidth label="Owner Password" type="password" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} />
                            <Stack direction="row" spacing={1}>
                                <Button variant="contained" onClick={handleInlineReauth} disabled={reauthLoading || loading} sx={{ bgcolor: binThemeTokens.gold, color: '#000' }}>{reauthLoading ? <CircularProgress size={18} color="inherit" /> : 'Sign in & Submit'}</Button>
                                <Button onClick={() => setReauthRequired(false)} disabled={reauthLoading || loading}>Cancel</Button>
                            </Stack>
                        </Stack>
                    </Paper>
                )}

                <Box sx={{ mb: 4, p: 3, bgcolor: 'rgba(212,175,55,0.05)', borderRadius: 2, border: '1px solid rgba(212,175,55,0.2)' }}>
                    <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 2 }}>Payment Summary</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">Amount Due</Typography><Typography color="#FFF" fontWeight="700">AED {formatMoney(amountDue)}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">Payment Method</Typography><Typography color="#FFF" fontWeight="700">{paymentMethod || 'Not Selected'}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">Annual Contract Value</Typography><Typography color="#FFF" fontWeight="700">AED {formatMoney(annualContractValue)}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">Properties / Units</Typography><Typography color="#FFF" fontWeight="700">{properties.length} / {portfolioSummary.totalUnits}</Typography></Grid>
                    </Grid>
                </Box>

                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>Documents to Upload</Typography>
                <Stack spacing={1.5} sx={{ mb: 4 }}>
                    {documentTypes.map(({ key, label }) => {
                        const file = proofDocuments[key as keyof typeof proofDocuments];
                        const progress = uploadProgress[key] || 0;
                        return (
                            <Box key={key} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Stack direction="row" spacing={1} alignItems="center"><FileText size={16} color="#C6A75E" /><Typography color="#FFF" fontWeight="700">{label}</Typography></Stack>
                                    <Typography variant="caption" sx={{ color: file ? '#4ADE80' : 'rgba(255,255,255,0.5)' }}>{file ? (progress === 100 ? 'Uploaded' : 'Ready') : 'Not provided'}</Typography>
                                </Stack>
                                {file && <Typography variant="caption" color="rgba(255,255,255,0.5)">{file.name}</Typography>}
                            </Box>
                        );
                    })}
                </Stack>

                <Alert severity="info" sx={{ mb: 3 }}>For card payments, successful checkout verifies payment but does not bypass final admin approval or unlock the dashboard directly.</Alert>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button variant="outlined" onClick={onBack} disabled={loading} fullWidth sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', py: 1.5, borderRadius: 100 }}>Back</Button>
                    <Button variant="contained" onClick={() => setConfirmDialog(true)} disabled={loading || !ownerAccount?.uid || !paymentMethod || !isContractSigned || amountDue <= 0} fullWidth sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 100 }}>
                        {loading ? <CircularProgress size={24} color="inherit" /> : <Stack direction="row" spacing={1} alignItems="center"><Upload size={18} /><span>{paymentMethod === 'STRIPE' ? 'Save Package & Open Card Checkout' : 'Submit Payment & Documents'}</span></Stack>}
                    </Button>
                </Stack>
            </Paper>

            <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
                <DialogTitle sx={{ color: '#FFF', bgcolor: '#000', fontWeight: 950 }}>Confirm Submission</DialogTitle>
                <DialogContent sx={{ bgcolor: '#000', color: '#FFF' }}>
                    <Typography sx={{ mt: 2, mb: 2 }}>The signed contract, property data, proof documents, and canonical payment record will be saved before the payment step continues.</Typography>
                    <Typography variant="caption" display="block">Amount Due: AED {formatMoney(amountDue)}</Typography>
                    <Typography variant="caption" display="block">Method: {paymentMethod}</Typography>
                    <Typography variant="caption" display="block">Intake ID: {intakeId || ownerAccount?.uid || onboardingSessionId}</Typography>
                </DialogContent>
                <DialogActions sx={{ bgcolor: '#000', p: 2 }}>
                    <Button onClick={() => setConfirmDialog(false)} sx={{ color: '#FFF' }}>Cancel</Button>
                    <Button onClick={() => { setConfirmDialog(false); void submitPayment(); }} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Confirm & Continue</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
