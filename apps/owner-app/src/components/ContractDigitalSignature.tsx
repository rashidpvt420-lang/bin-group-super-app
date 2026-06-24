// owner-app/src/components/ContractDigitalSignature.tsx
import React, { useState } from 'react';
import {
    Box, Typography, Button, Checkbox, FormControlLabel,
    Paper, Divider, Stack, TextField, Alert, Snackbar
} from '@mui/material';
import DrawIcon from '@mui/icons-material/Draw';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ArticleIcon from '@mui/icons-material/Article';
import { useLanguage } from '../context/LanguageContext';
import { formatAED } from '../utils/formatters';

interface Props {
    propertyData: any;
    selectedPlan: any;
    onSign: (data: any) => void;
}

const LEGAL_PROVIDER_NAME = 'BIN GROUP L.L.C - S.P.C';
const INITIAL_TERM_MONTHS = 13;
const SERVICE_MONTHS = 12;
const REVIEW_MONTHS = 1;
const RENEWAL_TERM_MONTHS = 12;

export default function ContractDigitalSignature({ propertyData, selectedPlan, onSign }: Props) {
    const { t, isRTL } = useLanguage();
    const [accepted, setAccepted] = useState(false);
    const [signature, setSignature] = useState('');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const annualPrice = Math.round(selectedPlan?.annualPrice || selectedPlan?.package?.annualPrice || 0);
    const propertyName = propertyData?.address || propertyData?.propertyName || (isRTL ? 'الأصل محل العقد' : 'Subject Asset');
    const ownerName = propertyData?.authorityName || propertyData?.departmentName || (isRTL ? 'المالك القانوني المسجل' : 'Registered Legal Owner');

    const copy = {
        title: isRTL ? 'التوقيع الرقمي والتفعيل' : 'Digital Signature & Activation',
        otpSent: isRTL ? 'تم تسجيل خطوة التحقق. يتم إصدار النسخة الرسمية من العقد عبر خادم مجموعة بن بعد اعتماد الإدارة.' : 'Verification step recorded. The official contract PDF is generated only by the BIN GROUP backend after admin approval.',
        noticeTitle: isRTL ? 'إشعار قانوني:' : 'Legal Notice:',
        noticeBody: isRTL
            ? 'العقد الأول مدته 13 شهراً: سنة خدمة واحدة مع شهر إضافي للمراجعة والتقييم التشغيلي. يمكن للمالك طلب الإلغاء أو التعديل خلال أول شهر بعد الاعتماد. التجديدات اللاحقة تكون لمدة سنة واحدة فقط ما لم يتم الاتفاق كتابةً على غير ذلك.'
            : 'The first contract term is 13 months: one service year plus one extra real-time review month. The owner may request cancellation or correction during the first month after approval. Later renewals run for one year only unless agreed otherwise in writing.',
        version: isRTL ? 'الإصدار: عقد المالك الأول 13 شهراً / التجديد سنة واحدة' : 'VERSION: Initial 13-month owner agreement / one-year renewals',
        parties: isRTL ? '١. الأطراف' : '1. PARTIES',
        property: isRTL ? 'العقار' : 'Property',
        owner: isRTL ? 'المالك / الجهة' : 'Owner/Entity',
        provider: isRTL ? 'مزود الخدمة' : 'Provider',
        scope: isRTL ? '٢. نطاق الخدمات' : '2. SCOPE OF SERVICES',
        pricing: isRTL ? '٣. الأسعار والدفع' : '3. PRICING & PAYMENT',
        annualFee: isRTL ? 'القيمة السنوية' : 'Annual Contract Value',
        paymentSchedule: isRTL ? 'جدول الدفع: حسب خطة السداد المعتمدة داخل النظام.' : 'Payment schedule: as approved in the digital onboarding and admin verification flow.',
        durationTitle: isRTL ? '٤. مدة العقد' : '4. CONTRACT TERM',
        duration: isRTL
            ? `العقد الأول: ${INITIAL_TERM_MONTHS} شهراً (${SERVICE_MONTHS} شهراً خدمة + ${REVIEW_MONTHS} شهر مراجعة). التجديد: ${RENEWAL_TERM_MONTHS} شهراً فقط.`
            : `Initial contract: ${INITIAL_TERM_MONTHS} months (${SERVICE_MONTHS} service months + ${REVIEW_MONTHS} review month). Renewal contracts: ${RENEWAL_TERM_MONTHS} months only.`,
        signatureLabel: isRTL ? 'اكتب التوقيع الرقمي' : 'Type Digital Signature',
        signaturePlaceholder: isRTL ? 'اكتب الاسم الكامل / الشخص المخول' : 'Type Full Name / Authorized Person',
        signatureHelper: isRTL ? 'هذه خطوة قبول داخل رحلة التقديم. النسخة الرسمية تُنشأ من الخادم بعد اعتماد الإدارة.' : 'This records onboarding acceptance. The official locked PDF is generated server-side after admin approval.',
        acceptance: isRTL ? 'أؤكد أنني المالك القانوني أو الممثل المخول وأقبل شروط العقد وسياسة أول شهر مراجعة.' : 'I verify that I am the legal owner or authorized representative and accept the contract terms and first-month review policy.',
        verifyOtp: isRTL ? 'تسجيل خطوة التحقق' : 'Record Verification Step',
        otpLabel: isRTL ? 'أدخل رمز التحقق المكون من 6 أرقام' : 'Enter 6-digit code',
        finalize: isRTL ? 'تسجيل القبول والمتابعة' : 'Record Acceptance & Continue',
    };

    const handleSendOtp = () => {
        setOtpSent(true);
        setSnackbar({ open: true, message: copy.otpSent, severity: 'info' });
    };

    const handleFinalize = () => {
        const signedArtifact = {
            signature,
            timestamp: new Date().toISOString(),
            version: 'INITIAL-13-MONTH-OWNER-AGREEMENT',
            institutionalHash: `SIG-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            contractTermMonths: INITIAL_TERM_MONTHS,
            serviceTermMonths: SERVICE_MONTHS,
            reviewWindowMonths: REVIEW_MONTHS,
            renewalTermMonths: RENEWAL_TERM_MONTHS,
            officialPdfSource: 'SERVER_ONLY_AFTER_ADMIN_APPROVAL',
            acceptanceLog: {
                accepted,
                otpEntered: otp.length >= 6,
                platform: 'BIN-GROUP-SUPER-APP'
            }
        };

        onSign(signedArtifact);
    };

    const getContractContent = () => {
        const pType = propertyData?.propertyType;
        if (pType === 'GOVERNMENT_MAJLIS') {
            return { title: t('contract.govt_majlis.title'), body: t('contract.govt_majlis.body') };
        }
        if (pType === 'GOVERNMENT_PROPERTY') {
            return { title: t('contract.govt_property.title'), body: t('contract.govt_property.body') };
        }
        if (pType === 'HOTEL') {
            return { title: t('contract.hotel.title'), body: t('contract.hotel.body') };
        }
        return { title: t('contract.standard.title'), body: t('contract.standard.body') };
    };

    const contract = getContractContent();

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <VerifiedUserIcon color="primary" />
                <Typography variant="h6" fontWeight="black">{copy.title}</Typography>
            </Box>

            <Alert severity="info" sx={{ mb: 4, bgcolor: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0' }}>
                <Typography variant="subtitle2" fontWeight="bold">{copy.noticeTitle}</Typography>
                {copy.noticeBody}
            </Alert>

            <Paper sx={{ p: 4, mb: 4, bgcolor: '#fff', border: '1px solid #e2e8f0', height: 350, overflowY: 'auto' }}>
                <Typography variant="h5" align="center" gutterBottom fontWeight="black" sx={{ textTransform: 'uppercase' }}>
                    {contract.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" align="center" sx={{ display: 'block', mb: 4 }}>
                    {copy.version}
                </Typography>

                <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" fontWeight="bold">{copy.parties}</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {copy.property}: {propertyName} <br/>
                        {copy.owner}: {ownerName}<br/>
                        {copy.provider}: {LEGAL_PROVIDER_NAME}
                    </Typography>

                    <Typography variant="subtitle2" fontWeight="bold">{copy.scope}</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {contract.body}
                    </Typography>

                    <Typography variant="subtitle2" fontWeight="bold">{copy.pricing}</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {copy.annualFee}: AED {formatAED(annualPrice)}<br/>
                        {copy.paymentSchedule}
                    </Typography>

                    <Typography variant="subtitle2" fontWeight="bold">{copy.durationTitle}</Typography>
                    <Typography variant="body2">
                        {copy.duration}
                    </Typography>
                </Box>
            </Paper>

            <Divider sx={{ mb: 4 }} />

            <Stack spacing={3}>
                <Box>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>{copy.signatureLabel}</Typography>
                    <TextField
                        fullWidth
                        placeholder={copy.signaturePlaceholder}
                        value={signature}
                        onChange={(e) => setSignature(e.target.value)}
                        helperText={copy.signatureHelper}
                        inputProps={{ dir: isRTL ? 'rtl' : 'ltr' }}
                    />
                </Box>

                <FormControlLabel
                    sx={{ m: 0, alignItems: 'flex-start', flexDirection: isRTL ? 'row-reverse' : 'row' }}
                    control={<Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />}
                    label={<Typography variant="body2">{copy.acceptance}</Typography>}
                />

                {!otpSent ? (
                    <Button
                        variant="outlined"
                        size="large"
                        disabled={!accepted || !signature}
                        onClick={handleSendOtp}
                        startIcon={!isRTL ? <ArticleIcon /> : undefined}
                        endIcon={isRTL ? <ArticleIcon /> : undefined}
                    >
                        {copy.verifyOtp}
                    </Button>
                ) : (
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexDirection: { xs: 'column', sm: isRTL ? 'row-reverse' : 'row' } }}>
                        <TextField
                            label={copy.otpLabel}
                            size="small"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            inputProps={{ dir: 'ltr', inputMode: 'numeric' }}
                        />
                        <Button
                            variant="contained"
                            color="success"
                            size="large"
                            disabled={otp.length < 6}
                            onClick={handleFinalize}
                            startIcon={!isRTL ? <DrawIcon /> : undefined}
                            endIcon={isRTL ? <DrawIcon /> : undefined}
                            sx={{ fontWeight: 'bold' }}
                        >
                            {copy.finalize}
                        </Button>
                    </Box>
                )}
            </Stack>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} sx={{ width: '100%', borderRadius: 3, fontWeight: 700 }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
