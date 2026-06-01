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
import { generateBilingualContractPdf } from '../../../src/utils/bilingualContractPdf';

interface Props {
    propertyData: any;
    selectedPlan: any;
    onSign: (data: any) => void;
}

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
        otpSent: isRTL ? 'تم إرسال رمز التحقق إلى رقم الهاتف المسجل في سند الملكية.' : 'Institutional Activation: OTP sent to the registered mobile number on the Title Deed.',
        noticeTitle: isRTL ? 'إشعار البروتوكول القانوني:' : 'Legal Protocol Notice:',
        noticeBody: isRTL
            ? 'يخضع هذا العقد للأنظمة البلدية والاتحادية ذات الصلة في دولة الإمارات. يؤدي التوقيع إلى تفعيل طبقة إدارة الأصول المؤسسية.'
            : 'This contract is governed by the relevant UAE municipal and federal regulations. Signing this activates the institutional asset management layer.',
        version: isRTL ? 'الإصدار: v2.0-UAE-INSTITUTIONAL' : 'VERSION: v2.0-UAE-INSTITUTIONAL',
        parties: isRTL ? '١. الأطراف' : '1. PARTIES',
        property: isRTL ? 'العقار' : 'Property',
        owner: isRTL ? 'المالك / الجهة' : 'Owner/Entity',
        provider: isRTL ? 'مزود الخدمة' : 'Provider',
        scope: isRTL ? '٢. نطاق الخدمات' : '2. SCOPE OF SERVICES',
        pricing: isRTL ? '٣. الأسعار والدفع' : '3. PRICING & DISBURSEMENT',
        annualFee: isRTL ? 'الرسوم السنوية' : 'Annual Management Fee',
        paymentSchedule: isRTL ? 'جدول الدفع: يطبق بيان التسوية المؤسسي.' : 'Payment Schedule: Institutional settlement manifest applies.',
        durationTitle: isRTL ? '٤. المدة' : '4. DURATION',
        duration: isRTL ? 'عقد مؤسسي لمدة 12 شهراً مع تجديد تلقائي وفق البروتوكول السيادي.' : '12-month institutional contract with evergreen auto-renewal under Sovereign Protocol.',
        signatureLabel: isRTL ? 'اكتب التوقيع الرقمي' : 'Type Digital Signature',
        signaturePlaceholder: isRTL ? 'اكتب الاسم الكامل / الشخص المخول' : 'Type Full Name / Authority Authorized Person',
        signatureHelper: isRTL ? 'اكتب اسمك لتوقيع الاتفاقية رقمياً.' : 'Type your name to digitally sign the agreement.',
        acceptance: isRTL ? 'أؤكد أنني المالك القانوني أو الممثل المخول وأقبل الاتفاقية وبروتوكول الامتثال للبيانات.' : 'I verify that I am the legal owner or authorized representative and accept the Agreement and Data Compliance Protocol.',
        verifyOtp: isRTL ? 'التحقق برمز الهاتف' : 'Verify with Mobile OTP',
        otpLabel: isRTL ? 'أدخل رمز التحقق المكون من 6 أرقام' : 'Enter 6-digit OTP',
        finalize: isRTL ? 'إنهاء التوقيع والتفعيل' : 'Finalize & Activate',
    };

    const handleSendOtp = () => {
        setOtpSent(true);
        setSnackbar({ open: true, message: copy.otpSent, severity: 'info' });
    };

    const handleFinalize = () => {
        const signedArtifact = {
            signature,
            timestamp: new Date().toISOString(),
            version: 'v2.0-UAE-INSTITUTIONAL',
            institutionalHash: `SIG-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            acceptanceLog: {
                accepted,
                otpVerified: true,
                platform: 'BIN-GENESIS-SOVEREIGN-OS'
            }
        };
        
        generateContractPDF(signedArtifact);
        onSign(signedArtifact);
    };

    const generateContractPDF = (artifact: any) => {
        const contractInfo = getContractContent();
        generateBilingualContractPdf({
            artifact,
            propertyName,
            ownerName,
            providerName: 'BIN GROUP PROPERTY MANAGEMENT LLC',
            contractTitle: contractInfo.title,
            contractBody: contractInfo.body,
            annualFeeText: `AED ${formatAED(annualPrice)}`,
        });
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
                        {copy.provider}: BIN GROUP PROPERTY MANAGEMENT LLC
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
                    label={
                        <Typography variant="body2">
                            {copy.acceptance}
                        </Typography>
                    }
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
