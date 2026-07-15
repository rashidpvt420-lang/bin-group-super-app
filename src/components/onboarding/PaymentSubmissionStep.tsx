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

const formatMoney = (value: number) => value.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const ar = isRTL;
    const copy = (en: string, arText: string) => (ar ? arText : en);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [uploadedUrls, setUploadedUrls] = useState<Record<string, string>>({});
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
    }, [ar]);

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
                    `${documentType.en} file is missing from this device. Upload it again.`,
                    `ملف ${documentType.ar} غير موجود على هذا الجهاز. يرجى رفعه مرة أخرى.`,
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
        if (!isContractSigned || signatureName.trim().length < 3) throw new Error(copy('A valid signed agreement is required.', 'يلزم توقيع صحيح على الاتفاقية.'));
        if (!contractOtpVerificationId) throw new Error(copy('Verify the contract email OTP before payment.', 'تحقق من رمز توقيع العقد عبر البريد الإلكتروني قبل الدفع.'));
        if (paymentMethod !== 'STRIPE' && (paymentReference.trim().length < 4 || !paymentReceipt)) {
            throw new Error(copy(
                'Manual payments require a bank/cheque reference and an uploaded receipt.',
                'تتطلب المدفوعات اليدوية مرجع التحويل أو الشيك وإيصالاً مرفوعاً.',
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
        const urls = await uploadProofDocuments(user, effectiveIntakeId);
        setUploadedUrls(urls);
        let manualPaymentEvidence: Record<string, string> | null = null;
        if (paymentMethod !== 'STRIPE' && paymentReceipt) {
            const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']);
            if (!allowedTypes.has(paymentReceipt.type)) {
                throw new Error(copy('Payment receipt must be PDF, JPEG, PNG, WEBP, or HEIC.', 'يجب أن يكون إيصال الدفع بصيغة PDF أو JPEG أو PNG أو WEBP أو HEIC.'));
            }
            const safeName = paymentReceipt.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'payment-receipt';
            const paymentProofPath = `payment-references/owners/${user.uid}/${effectiveIntakeId}/${Date.now()}_${safeName}`;
            const paymentProofRef = ref(storage, paymentProofPath);
            await uploadBytes(paymentProofRef, paymentReceipt, { contentType: paymentReceipt.type });
            manualPaymentEvidence = {
                reference: paymentReference.trim(),
                receiptUrl: await getDownloadURL(paymentProofRef),
                receiptPath: paymentProofPath,
                receiptName: paymentReceipt.name,
            };
        }

        const submitPackage = httpsCallable(functions, 'submitOwnerOnboardingPaymentPackage');
        await submitPackage({
            ownerUid: user.uid,
            ownerEmail: user.email || ownerEmail,
            intakeId: effectiveIntakeId,
            onboardingSessionId: onboardingSessionId || effectiveIntakeId,
            paymentMethod,
            amount: amountDue,
            activationDeposit: amountDue,
            annualContractValue,
            paymentManifest: manualPaymentEvidence || paymentManifest || null,
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
            documentUrls: urls,
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
            window.location.assign(checkout.url);
            return;
        }

        await clearStagedFiles();
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
                    'Your secure session expired. Re-enter the owner password below; your form and documents remain on this device.',
                    'انتهت الجلسة الآمنة. أدخل كلمة مرور المالك أدناه؛ ستبقى البيانات والمستندات محفوظة على هذا الجهاز.',
                ));
            }
            await submitWithUser(user);
        } catch (submissionError) {
            const message = submissionError instanceof Error ? submissionError.message : String(submissionError);
            setError(message);
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
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: { xs: 4, md: 8 }, bgcolor: 'rgba(22, 22, 24, 0.8)', border: '1px solid #4ADE80', backdropFilter: 'blur(10px)' }}>
                    <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: 'rgba(74, 222, 128, 0.1)' }}>
                            <CheckCircle size={48} color="#4ADE80" />
                        </Box>
                    </Box>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                        {t('onboarding.payment.success_title') || 'Payment Submitted Successfully'}
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#4ADE80', fontWeight: 700, mb: 2 }}>
                        {t('onboarding.payment.success_body') || 'Your payment proof and documents were uploaded successfully. BIN GROUP will review and activate your owner dashboard after admin verification.'}
                    </Typography>
                    <Typography sx={{ color: '#4ADE80', fontWeight: 700, mt: 2 }}>
                        {copy(
                            'The contract, documents, property data, and payment record are saved. The dashboard remains locked until admin approval.',
                            'تم حفظ العقد والمستندات وبيانات العقار وسجل الدفع. ستبقى لوحة التحكم مقفلة حتى موافقة الإدارة.',
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
        <Box dir={ar ? 'rtl' : 'ltr'} sx={{ maxWidth: 840, mx: 'auto', width: '100%', py: { xs: 2, md: 4 }, pb: { xs: 12, md: 4 } }}>
            <Stack spacing={3}>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" fontWeight={950} color="#fff">
                        {t('onboarding.payment_submission') || copy('Payment Submission', 'إرسال الدفع')}
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.58)', mt: 1 }}>
                        {copy(
                            'The signed package is saved before any external card checkout begins.',
                            'يتم حفظ الحزمة الموقعة قبل بدء أي عملية دفع خارجية بالبطاقة.',
                        )}
                    </Typography>
                </Box>

                {error && <Alert severity="error">{error}</Alert>}

                {reauthRequired && (
                    <Paper sx={{ p: 2.5, bgcolor: 'rgba(0,0,0,0.45)' }}>
                        <Stack spacing={2}>
                            <Typography sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>
                                {copy('Reconnect Owner Session', 'إعادة ربط جلسة المالك')}
                            </Typography>
                            <TextField fullWidth label={copy('Owner Email', 'بريد المالك')} value={ownerEmail} disabled />
                            <TextField fullWidth label={copy('Owner Password', 'كلمة مرور المالك')} type="password" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} />
                            <Button onClick={reconnectAndSubmit} disabled={loading} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>
                                {loading ? <CircularProgress size={20} color="inherit" /> : copy('Sign In and Submit', 'تسجيل الدخول والإرسال')}
                            </Button>
                        </Stack>
                    </Paper>
                )}

                <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Typography variant="h6" fontWeight={950} sx={{ color: binThemeTokens.gold, mb: 2 }}>
                        {copy('Payment Summary', 'ملخص الدفع')}
                    </Typography>
                    {canonicalQuote && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            {copy(
                                `Server quote ${canonicalQuote.version} verified. Expires ${new Date(canonicalQuote.expiresAtMs).toLocaleString('en-AE')}.`,
                                `تم التحقق من عرض الخادم ${canonicalQuote.version}. تنتهي صلاحيته في ${new Date(canonicalQuote.expiresAtMs).toLocaleString('ar-AE')}.`,
                            )}
                        </Alert>
                    )}
                    <Grid container spacing={2}>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">{copy('Amount Due', 'المبلغ المستحق')}</Typography><Typography color="#fff" fontWeight={800}>AED {formatMoney(amountDue)}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">{copy('Payment Method', 'طريقة الدفع')}</Typography><Typography color="#fff" fontWeight={800}>{paymentMethod || copy('Not selected', 'غير محددة')}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">{copy('Annual Contract Value', 'قيمة العقد السنوية')}</Typography><Typography color="#fff" fontWeight={800}>AED {formatMoney(annualContractValue)}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="rgba(255,255,255,0.5)">{copy('Properties / Units', 'العقارات / الوحدات')}</Typography><Typography color="#fff" fontWeight={800}>{properties.length} / {portfolioSummary.totalUnits}</Typography></Grid>
                    </Grid>
                </Paper>

                {paymentMethod && paymentMethod !== 'STRIPE' && (
                    <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Stack spacing={2}>
                            <Typography variant="h6" fontWeight={950} color="#fff">
                                {copy('Manual Payment Evidence', 'إثبات الدفع اليدوي')}
                            </Typography>
                            <TextField
                                fullWidth
                                required
                                label={copy('Bank transfer / cheque reference', 'مرجع التحويل البنكي / الشيك')}
                                value={paymentReference}
                                onChange={(event) => setPaymentReference(event.target.value)}
                            />
                            <Button variant="outlined" component="label" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }}>
                                {paymentReceipt ? paymentReceipt.name : copy('Attach receipt (PDF or image)', 'إرفاق الإيصال (PDF أو صورة)')}
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
                    <Typography variant="h6" fontWeight={950} color="#fff" sx={{ mb: 2 }}>
                        {copy('Documents Ready for Secure Upload', 'المستندات الجاهزة للرفع الآمن')}
                    </Typography>
                    <Stack spacing={1.25}>
                        {documentTypes.map((documentType) => {
                            const file = proofDocuments[documentType.key];
                            const progress = uploadProgress[documentType.key] || 0;
                            return (
                                <Stack key={documentType.key} direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.28)' }}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <FileText size={16} color={binThemeTokens.gold} />
                                        <Box>
                                            <Typography color="#fff" fontWeight={800}>{ar ? documentType.ar : documentType.en}</Typography>
                                            {file && <Typography variant="caption" color="rgba(255,255,255,0.5)">{file.name}</Typography>}
                                        </Box>
                                    </Stack>
                                    <Typography variant="caption" sx={{ color: file ? '#4ADE80' : 'rgba(255,255,255,0.45)', fontWeight: 800 }}>
                                        {file ? (progress === 100 ? copy('Uploaded', 'تم الرفع') : copy('Ready', 'جاهز')) : copy('Not provided', 'غير مرفق')}
                                    </Typography>
                                </Stack>
                            );
                        })}
                    </Stack>
                </Paper>

                <Alert severity="info">
                    {copy(
                        'A successful card charge verifies funds only. Final dashboard activation still requires admin approval.',
                        'نجاح الدفع بالبطاقة يثبت استلام المبلغ فقط. يتطلب تفعيل لوحة التحكم موافقة الإدارة النهائية.',
                    )}
                </Alert>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button onClick={onBack} disabled={loading} fullWidth variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}>
                        {copy('Back', 'رجوع')}
                    </Button>
                    <Button
                        onClick={() => setConfirmDialog(true)}
                        disabled={
                            loading ||
                            !ownerAccount?.uid ||
                            !paymentMethod ||
                            !isContractSigned ||
                            amountDue <= 0 ||
                            (paymentMethod !== 'STRIPE' && (paymentReference.trim().length < 4 || !paymentReceipt))
                        }
                        fullWidth
                        variant="contained"
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                    >
                        {loading ? <CircularProgress size={22} color="inherit" /> : <Stack direction="row" spacing={1} alignItems="center"><Upload size={18} />{copy(paymentMethod === 'STRIPE' ? 'Save Package and Open Checkout' : 'Submit Payment Package', paymentMethod === 'STRIPE' ? 'حفظ الحزمة وفتح الدفع' : 'إرسال حزمة الدفع')}</Stack>}
                    </Button>
                </Stack>
            </Stack>

            <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
                <DialogTitle>{copy('Confirm Submission', 'تأكيد الإرسال')}</DialogTitle>
                <DialogContent>
                    <Typography sx={{ mt: 1 }}>
                        {copy(
                            'The signed agreement, property data, proof documents, and canonical payment record will be saved before payment continues.',
                            'سيتم حفظ الاتفاقية الموقعة وبيانات العقار والمستندات وسجل الدفع الأساسي قبل متابعة الدفع.',
                        )}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 2 }}>AED {formatMoney(amountDue)} · {paymentMethod}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDialog(false)}>{copy('Cancel', 'إلغاء')}</Button>
                    <Button onClick={() => { setConfirmDialog(false); void submitPayment(); }} variant="contained">
                        {copy('Confirm and Continue', 'تأكيد ومتابعة')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
