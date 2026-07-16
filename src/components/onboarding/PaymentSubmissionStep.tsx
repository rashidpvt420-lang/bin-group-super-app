import React, { useEffect, useMemo, useState } from 'react';
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

type ProofKey = 'propertyProof' | 'emiratesId' | 'passport' | 'tradeLicense' | 'tenancySupport';

type CanonicalQuote = {
    annualContractValue: number;
    activationDeposit: number;
    currency: string;
    quoteHash: string;
    quotedAtMs: number;
    expiresAtMs: number;
    version: string;
};

const documentTypes: Array<{ key: ProofKey; en: string; ar: string }> = [
    { key: 'propertyProof', en: 'Property Proof', ar: 'إثبات ملكية العقار' },
    { key: 'emiratesId', en: 'Emirates ID', ar: 'الهوية الإماراتية' },
    { key: 'passport', en: 'Passport', ar: 'جواز السفر' },
    { key: 'tradeLicense', en: 'Trade License', ar: 'الرخصة التجارية' },
    { key: 'tenancySupport', en: 'Tenancy Support (Optional)', ar: 'مستندات الإيجار (اختياري)' },
];

const resolveMoney = (...values: unknown[]): number => {
    for (const value of values) {
        const amount = Number(value);
        if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 100) / 100;
    }
    return 0;
};

const formatMoney = (value: number) => value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const isAuthStorageFailure = (error: unknown) => {
    const record = error as { code?: string; message?: string };
    const code = String(record?.code || '').toLowerCase();
    const message = String(record?.message || error || '').toLowerCase();
    return code.includes('unauthenticated') || message.includes('unauthenticated') || message.includes('user is not authenticated');
};

const fileToBase64Payload = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',').pop() || '' : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read the document.'));
    reader.readAsDataURL(file);
});

const sha256File = async (file: File) => {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
        signatureName,
        contractOtpVerificationId,
        reset,
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const copy = (en: string, ar: string) => (isRTL ? ar : en);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [confirmDialog, setConfirmDialog] = useState(false);
    const [reauthRequired, setReauthRequired] = useState(false);
    const [reauthPassword, setReauthPassword] = useState('');
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentReceipt, setPaymentReceipt] = useState<File | null>(null);
    const [canonicalQuote, setCanonicalQuote] = useState<CanonicalQuote | null>(null);

    const ownerEmail = ownerAccount?.email || companyProfile.email || '';
    const annualContractValue = useMemo(() => resolveMoney(
        canonicalQuote?.annualContractValue,
        portfolioSummary?.estimatedACV,
        paymentManifest?.annualContractValue,
        selectedPlan?.annualPrice,
        selectedPlan?.price,
        selectedPlan?.total,
    ), [canonicalQuote?.annualContractValue, paymentManifest, portfolioSummary?.estimatedACV, selectedPlan]);
    const amountDue = useMemo(() => resolveMoney(
        canonicalQuote?.activationDeposit,
        paymentManifest?.activationDeposit,
        paymentManifest?.amount,
        annualContractValue > 0 ? annualContractValue * 0.15 : 0,
    ), [annualContractValue, canonicalQuote?.activationDeposit, paymentManifest]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('payment_failed') === 'true') {
            setError(copy(
                'Card checkout was cancelled. Your signed onboarding package remains protected and can be submitted again.',
                'تم إلغاء الدفع بالبطاقة. ما زالت حزمة التسجيل والعقد محفوظة ويمكن إعادة المحاولة.',
            ));
        }
    }, [isRTL]);

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
        window.setTimeout(() => {
            if (resolved) return;
            resolved = true;
            unsubscribe();
            resolve(auth.currentUser);
        }, timeoutMs);
    });

    const uploadProofDocuments = async (user: FirebaseUser, effectiveIntakeId: string) => {
        const urls: Record<string, string> = {};

        for (const documentType of documentTypes) {
            const meta = proofDocuments[documentType.key];
            if (!meta) continue;

            const stagedFile = await getStagedFile(documentType.key);
            if (!stagedFile) {
                throw new Error(copy(
                    `${documentType.en} file is missing from this browser session. Upload it again.`,
                    `ملف ${documentType.ar} غير موجود في جلسة المتصفح. يرجى رفعه مرة أخرى.`,
                ));
            }

            const safeFileName = stagedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            setUploadProgress((current) => ({ ...current, [documentType.key]: 10 }));

            try {
                await user.getIdToken(true);
                const storagePath = `onboarding-proof/${user.uid}/${effectiveIntakeId}/${documentType.key}/${Date.now()}_${safeFileName}`;
                const fileRef = ref(storage, storagePath);
                await uploadBytes(fileRef, stagedFile, {
                    customMetadata: {
                        ownerUid: user.uid,
                        uploadedBy: user.email || ownerEmail,
                        docType: documentType.key,
                        intakeId: effectiveIntakeId,
                        uploadedAt: new Date().toISOString(),
                    },
                });
                urls[documentType.key] = await getDownloadURL(fileRef);
            } catch (uploadError) {
                if (!isAuthStorageFailure(uploadError)) throw uploadError;

                const uploadFallback = httpsCallable(functions, 'uploadOwnerOnboardingProofDocument');
                const result = await uploadFallback({
                    ownerUid: user.uid,
                    ownerEmail: user.email || ownerEmail,
                    intakeId: effectiveIntakeId,
                    onboardingSessionId: onboardingSessionId || effectiveIntakeId,
                    docType: documentType.key,
                    filename: safeFileName,
                    contentType: stagedFile.type || 'application/octet-stream',
                    encodedDocument: await fileToBase64Payload(stagedFile),
                });
                const data = result.data as { downloadUrl?: string };
                if (!data.downloadUrl) throw new Error(`Fallback upload failed for ${documentType.en}.`);
                urls[documentType.key] = data.downloadUrl;
            }

            setUploadProgress((current) => ({ ...current, [documentType.key]: 100 }));
        }

        return urls;
    };

    const validateSubmission = () => {
        if (!ownerAccount?.uid) throw new Error(copy('Owner account is missing. Return to the account step.', 'حساب المالك غير موجود. ارجع إلى خطوة إنشاء الحساب.'));
        if (!paymentMethod) throw new Error(copy('Select a payment method first.', 'اختر طريقة الدفع أولاً.'));
        if (!paymentManifest?.configVersion || !paymentManifest?.configHash) {
            throw new Error(copy(
                'The verified corporate payment configuration is missing. Return to payment options and generate new instructions.',
                'إعداد الدفع المؤسسي الموثق غير موجود. ارجع إلى خيارات الدفع وأنشئ تعليمات جديدة.',
            ));
        }
        if (!isContractSigned || signatureName.trim().length < 3) throw new Error(copy('A valid signed agreement is required.', 'يلزم توقيع صحيح على الاتفاقية.'));
        if (!contractOtpVerificationId) throw new Error(copy('Verify the contract email OTP before payment.', 'تحقق من رمز توقيع العقد عبر البريد الإلكتروني قبل الدفع.'));
        if (paymentMethod !== 'STRIPE' && (paymentReference.trim().length < 4 || !paymentReceipt)) {
            throw new Error(copy(
                'Manual payments require a bank, cheque or cash reference and an uploaded receipt.',
                'تتطلب المدفوعات اليدوية مرجع التحويل أو الشيك أو النقد وإيصالاً مرفوعاً.',
            ));
        }
        const hasIndividualIdentity = Boolean(proofDocuments.emiratesId && proofDocuments.passport);
        if (!proofDocuments.propertyProof || (!hasIndividualIdentity && !proofDocuments.tradeLicense)) {
            throw new Error(copy(
                'Property proof and either Emirates ID plus passport or a trade license are required.',
                'يلزم إثبات ملكية العقار وإما الهوية الإماراتية مع جواز السفر أو الرخصة التجارية.',
            ));
        }
        if (amountDue <= 0) throw new Error(copy('The payable amount is missing. Recalculate the quotation.', 'مبلغ الدفع غير موجود. أعد احتساب عرض السعر.'));
    };

    const submitWithUser = async (user: FirebaseUser) => {
        validateSubmission();
        await user.getIdToken(true);

        const previewQuote = httpsCallable(functions, 'previewOwnerOnboardingQuote');
        const previewResult = await previewQuote({
            properties,
            selectedAddOns: selectedAddOns || [],
        });
        const serverQuote = previewResult.data as CanonicalQuote;
        if (
            !serverQuote ||
            serverQuote.currency !== 'AED' ||
            serverQuote.annualContractValue <= 0 ||
            serverQuote.activationDeposit <= 0
        ) {
            throw new Error(copy(
                'The server did not return a valid AED onboarding quote.',
                'لم يُرجع الخادم عرض تسجيل صالحًا بالدرهم الإماراتي.',
            ));
        }

        const quoteChanged =
            Math.abs(serverQuote.annualContractValue - annualContractValue) > 0.01 ||
            Math.abs(serverQuote.activationDeposit - amountDue) > 0.01;
        setCanonicalQuote(serverQuote);
        if (quoteChanged) {
            throw new Error(copy(
                'The server-authoritative quote was refreshed. Review the updated annual value and 15% deposit, then submit again.',
                'تم تحديث عرض السعر المعتمد من الخادم. راجع القيمة السنوية ودفعة 15٪ المحدّثة ثم أرسل مرة أخرى.',
            ));
        }

        const effectiveIntakeId = intakeId || onboardingSessionId || user.uid;
        setIntakeId(effectiveIntakeId);
        const documentUrls = await uploadProofDocuments(user, effectiveIntakeId);

        let manualPaymentEvidence: Record<string, string> = {};
        if (paymentMethod !== 'STRIPE' && paymentReceipt) {
            const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']);
            if (!allowedTypes.has(paymentReceipt.type)) {
                throw new Error(copy(
                    'Payment receipt must be PDF, JPEG, PNG, WEBP, or HEIC.',
                    'يجب أن يكون إيصال الدفع بصيغة PDF أو JPEG أو PNG أو WEBP أو HEIC.',
                ));
            }
            const safeName = paymentReceipt.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'payment-receipt';
            const paymentProofPath = `payment-references/owners/${user.uid}/${effectiveIntakeId}/${Date.now()}_${safeName}`;
            const paymentProofRef = ref(storage, paymentProofPath);
            const receiptHash = await sha256File(paymentReceipt);
            const uploadResult = await uploadBytes(paymentProofRef, paymentReceipt, {
                contentType: paymentReceipt.type,
                customMetadata: {
                    ownerUid: user.uid,
                    paymentId: effectiveIntakeId,
                    evidenceType: 'owner_payment_receipt',
                    receiptHash,
                },
            });
            manualPaymentEvidence = {
                reference: paymentReference.trim(),
                receiptUrl: await getDownloadURL(paymentProofRef),
                receiptPath: paymentProofPath,
                receiptName: paymentReceipt.name,
                receiptHash,
                receiptGeneration: uploadResult.metadata.generation,
            };
        }

        const verifiedPaymentManifest = {
            ...(paymentManifest || {}),
            ...manualPaymentEvidence,
            amount: serverQuote.activationDeposit,
            activationDeposit: serverQuote.activationDeposit,
            annualContractValue: serverQuote.annualContractValue,
            currency: 'AED',
            method: paymentMethod,
            configVersion: paymentManifest.configVersion,
            configHash: paymentManifest.configHash,
            configEffectiveAtMs: paymentManifest.configEffectiveAtMs,
        };

        const submitPackage = httpsCallable(functions, 'submitOwnerOnboardingPaymentPackage');
        await submitPackage({
            ownerUid: user.uid,
            ownerEmail: user.email || ownerEmail,
            intakeId: effectiveIntakeId,
            onboardingSessionId: onboardingSessionId || effectiveIntakeId,
            paymentMethod,
            amount: serverQuote.activationDeposit,
            activationDeposit: serverQuote.activationDeposit,
            annualContractValue: serverQuote.annualContractValue,
            quoteHash: serverQuote.quoteHash,
            quoteQuotedAtMs: serverQuote.quotedAtMs,
            paymentConfigVersion: paymentManifest.configVersion,
            paymentConfigHash: paymentManifest.configHash,
            paymentManifest: verifiedPaymentManifest,
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
            otpVerificationId: contractOtpVerificationId,
            documentUrls,
        });

        if (paymentMethod === 'STRIPE') {
            const createCheckout = httpsCallable(functions, 'createStripeCheckoutSession');
            const result = await createCheckout({
                ownerUid: user.uid,
                ownerEmail: user.email || ownerEmail,
                intakeId: effectiveIntakeId,
                onboardingSessionId: onboardingSessionId || effectiveIntakeId,
            });
            const checkout = result.data as { url?: string };
            if (!checkout.url) throw new Error(copy('Stripe did not return a secure checkout URL.', 'لم يتم إنشاء رابط دفع آمن من Stripe.'));
            await clearStagedFiles();
            reset();
            window.location.assign(checkout.url);
            return;
        }

        await clearStagedFiles();
        reset();
        setSuccess(true);
    };

    const submitPayment = async () => {
        setLoading(true);
        setError(null);
        try {
            const user = await waitForCurrentUser();
            if (!user) {
                setReauthRequired(true);
                throw new Error(copy(
                    'Your secure session expired. Re-enter the owner password below. Encrypted documents remain available only in this browser-tab session.',
                    'انتهت الجلسة الآمنة. أدخل كلمة مرور المالك أدناه. تبقى المستندات المشفرة متاحة فقط في جلسة علامة تبويب المتصفح الحالية.',
                ));
            }
            await submitWithUser(user);
        } catch (submissionError) {
            setError(submissionError instanceof Error ? submissionError.message : String(submissionError));
        } finally {
            setLoading(false);
        }
    };

    const reconnectAndSubmit = async () => {
        if (!ownerEmail || !reauthPassword) {
            setError(copy('Enter the owner email and password.', 'أدخل بريد المالك وكلمة المرور.'));
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const credential = await signInWithEmailAndPassword(auth, ownerEmail.trim().toLowerCase(), reauthPassword);
            setReauthRequired(false);
            await submitWithUser(credential.user);
        } catch (reauthError) {
            setError(reauthError instanceof Error ? reauthError.message : String(reauthError));
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <Container maxWidth="md" sx={{ py: { xs: 4, md: 10 }, textAlign: 'center' }} dir={isRTL ? 'rtl' : 'ltr'}>
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: { xs: 4, md: 8 }, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid #4ADE80' }}>
                    <CheckCircle size={56} color="#4ADE80" />
                    <Typography variant="h4" fontWeight={950} color="#FFF" sx={{ mt: 3 }}>
                        {t('onboarding.payment.success_title') || copy('Payment Submitted Successfully', 'تم إرسال الدفع بنجاح')}
                    </Typography>
                    <Typography color="#4ADE80" fontWeight={700} sx={{ mt: 2 }}>
                        {copy(
                            'The contract, documents, property data and payment evidence are saved. Local onboarding data and the browser-session encryption key have been cleared.',
                            'تم حفظ العقد والمستندات وبيانات العقار وإثبات الدفع. وتم مسح بيانات التسجيل المحلية ومفتاح تشفير جلسة المتصفح.',
                        )}
                    </Typography>
                    <Button onClick={() => window.location.assign('/owner/activation')} variant="contained" sx={{ mt: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                        {copy('Open Activation Status', 'فتح حالة التفعيل')}
                    </Button>
                </Paper>
            </Container>
        );
    }

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 840, mx: 'auto', width: '100%', py: { xs: 2, md: 4 }, pb: { xs: 12, md: 4 } }}>
            <Stack spacing={3}>
                <Box textAlign="center">
                    <Typography variant="h4" fontWeight={950} color="#fff">
                        {t('onboarding.payment_submission') || copy('Payment Submission', 'إرسال الدفع')}
                    </Typography>
                    <Typography color="rgba(255,255,255,0.58)" sx={{ mt: 1 }}>
                        {copy(
                            'Your package uses the active server payment configuration and a locked server quotation.',
                            'تستخدم الحزمة إعداد الدفع النشط من الخادم وعرض سعر مقفلاً من الخادم.',
                        )}
                    </Typography>
                </Box>

                {error && <Alert severity="error">{error}</Alert>}
                {canonicalQuote && (
                    <Alert severity="info">
                        {copy(
                            `Server quote ${canonicalQuote.version} verified.`,
                            `تم التحقق من عرض الخادم ${canonicalQuote.version}.`,
                        )}
                    </Alert>
                )}

                {reauthRequired && (
                    <Paper sx={{ p: 2.5, bgcolor: 'rgba(0,0,0,0.45)' }}>
                        <Stack spacing={2}>
                            <Typography color={binThemeTokens.gold} fontWeight={900}>{copy('Reconnect Owner Session', 'إعادة ربط جلسة المالك')}</Typography>
                            <TextField fullWidth label={copy('Owner Email', 'بريد المالك')} value={ownerEmail} disabled />
                            <TextField fullWidth label={copy('Owner Password', 'كلمة مرور المالك')} type="password" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} />
                            <Button onClick={() => void reconnectAndSubmit()} disabled={loading} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>
                                {loading ? <CircularProgress size={20} color="inherit" /> : copy('Sign In and Submit', 'تسجيل الدخول والإرسال')}
                            </Button>
                        </Stack>
                    </Paper>
                )}

                <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Typography variant="h6" fontWeight={950} color={binThemeTokens.gold} sx={{ mb: 2 }}>{copy('Payment Summary', 'ملخص الدفع')}</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">{copy('Amount Due', 'المبلغ المستحق')}</Typography><Typography color="#fff" fontWeight={800}>AED {formatMoney(amountDue)}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">{copy('Payment Method', 'طريقة الدفع')}</Typography><Typography color="#fff" fontWeight={800}>{paymentMethod || copy('Not selected', 'غير محددة')}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">{copy('Annual Contract Value', 'قيمة العقد السنوية')}</Typography><Typography color="#fff" fontWeight={800}>AED {formatMoney(annualContractValue)}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">{copy('Payment Configuration', 'إعداد الدفع')}</Typography><Typography color="#fff" fontWeight={800}>{paymentManifest?.configVersion || '—'}</Typography></Grid>
                    </Grid>
                </Paper>

                {paymentMethod && paymentMethod !== 'STRIPE' && (
                    <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Stack spacing={2}>
                            <Typography variant="h6" fontWeight={950} color="#fff">{copy('Manual Payment Evidence', 'إثبات الدفع اليدوي')}</Typography>
                            <TextField
                                fullWidth
                                required
                                label={copy('Bank transfer / cheque / cash reference', 'مرجع التحويل البنكي / الشيك / النقد')}
                                value={paymentReference}
                                onChange={(event) => setPaymentReference(event.target.value)}
                            />
                            <Button component="label" variant="outlined" startIcon={<Upload size={18} />} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}>
                                {paymentReceipt ? paymentReceipt.name : copy('Upload payment receipt', 'رفع إيصال الدفع')}
                                <input
                                    hidden
                                    type="file"
                                    accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                                    onChange={(event) => setPaymentReceipt(event.target.files?.[0] || null)}
                                />
                            </Button>
                        </Stack>
                    </Paper>
                )}

                <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Typography variant="h6" fontWeight={950} color="#fff" sx={{ mb: 2 }}>{copy('Protected Documents', 'المستندات المحمية')}</Typography>
                    <Stack spacing={1.5}>
                        {documentTypes.map((documentType) => {
                            const meta = proofDocuments[documentType.key];
                            if (!meta) return null;
                            return (
                                <Box key={documentType.key} display="flex" alignItems="center" justifyContent="space-between" gap={2}>
                                    <Box display="flex" alignItems="center" gap={1.5}>
                                        <FileText size={18} color={binThemeTokens.gold} />
                                        <Typography color="#fff" fontWeight={700}>{isRTL ? documentType.ar : documentType.en}</Typography>
                                    </Box>
                                    <Typography variant="caption" color={uploadProgress[documentType.key] === 100 ? '#4ADE80' : 'rgba(255,255,255,0.55)'}>
                                        {uploadProgress[documentType.key] === 100 ? copy('Uploaded', 'تم الرفع') : copy('Encrypted locally', 'مشفر محلياً')}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Stack>
                </Paper>

                <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={2} justifyContent="space-between">
                    <Button onClick={onBack} disabled={loading} variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}>{copy('Back', 'رجوع')}</Button>
                    <Button onClick={() => setConfirmDialog(true)} disabled={loading || reauthRequired} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4 }}>
                        {loading ? <CircularProgress size={20} color="inherit" /> : copy('Submit Secure Package', 'إرسال الحزمة الآمنة')}
                    </Button>
                </Stack>
            </Stack>

            <Dialog open={confirmDialog} onClose={() => !loading && setConfirmDialog(false)} dir={isRTL ? 'rtl' : 'ltr'}>
                <DialogTitle>{copy('Confirm Submission', 'تأكيد الإرسال')}</DialogTitle>
                <DialogContent>
                    <Typography>
                        {copy(
                            `Submit the signed package and the mandatory 15% mobilisation deposit evidence of AED ${formatMoney(amountDue)}?`,
                            `هل تريد إرسال الحزمة الموقعة وإثبات دفعة التجهيز الإلزامية بنسبة 15٪ وبقيمة ${formatMoney(amountDue)} درهم؟`,
                        )}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDialog(false)} disabled={loading}>{copy('Cancel', 'إلغاء')}</Button>
                    <Button
                        onClick={() => {
                            setConfirmDialog(false);
                            void submitPayment();
                        }}
                        disabled={loading}
                        variant="contained"
                    >
                        {copy('Confirm and Submit', 'تأكيد وإرسال')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
