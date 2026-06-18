// owner-app/src/components/ContractDigitalSignature.tsx
import React, { useState } from 'react';
import {
    Box, Typography, Button, Checkbox, FormControlLabel,
    Paper, Divider, Stack, TextField, Alert, Snackbar, CircularProgress
} from '@mui/material';
import DrawIcon from '@mui/icons-material/Draw';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ArticleIcon from '@mui/icons-material/Article';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../utils/formatters';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { registerArabicFont } from '../utils/arabicPdfFont';
import { functions, httpsCallable } from '../lib/firebase';

interface Props {
    propertyData: any;
    selectedPlan: any;
    onSign: (data: any) => void;
}

const requestContractCode = httpsCallable(functions, 'requestContractSignatureOtp');
const verifyContractCode = httpsCallable(functions, 'verifyContractSignatureOtp');

export default function ContractDigitalSignature({ propertyData, selectedPlan, onSign }: Props) {
    const { t } = useLanguage();
    const [accepted, setAccepted] = useState(false);
    const [signature, setSignature] = useState('');
    const [code, setCode] = useState('');
    const [codeSent, setCodeSent] = useState(false);
    const [codeRequestId, setCodeRequestId] = useState('');
    const [codeChannel, setCodeChannel] = useState('email');
    const [sendingCode, setSendingCode] = useState(false);
    const [verifyingCode, setVerifyingCode] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const handleSendCode = async () => {
        try {
            setSendingCode(true);
            const result = await requestContractCode({
                contractId: propertyData?.contractId || propertyData?.id || propertyData?.propertyId || 'contract-pending',
                propertyId: propertyData?.propertyId || propertyData?.id || '',
                propertyName: propertyData?.address || propertyData?.propertyName || 'BIN GROUP contract',
                address: propertyData?.address || propertyData?.propertyName || '',
                email: propertyData?.ownerEmail || propertyData?.email || propertyData?.contactEmail || '',
            });
            const data = result.data as any;
            setCodeRequestId(String(data?.requestId || ''));
            setCodeChannel(String(data?.channel || 'email'));
            setCodeSent(true);
            setSnackbar({ open: true, message: data?.message || 'Contract verification code sent to the verified owner contact.', severity: 'success' });
        } catch (error: any) {
            setSnackbar({ open: true, message: error?.message || 'Failed to send contract verification code.', severity: 'error' });
        } finally {
            setSendingCode(false);
        }
    };

    const handleFinalize = async () => {
        try {
            setVerifyingCode(true);
            if (!codeRequestId) throw new Error('Verification request is missing. Request a new code.');
            const result = await verifyContractCode({ requestId: codeRequestId, otp: code, signature });
            const verification = result.data as any;
            if (!verification?.ok) throw new Error('Code verification failed.');

            const signedArtifact = {
                signature,
                timestamp: new Date().toISOString(),
                version: 'v2.1-UAE-INSTITUTIONAL-VERIFIED',
                institutionalHash: `SIG-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
                verificationId: verification.verificationId,
                acceptanceLog: {
                    accepted,
                    otpVerified: true,
                    otpVerificationId: verification.verificationId,
                    otpChannel: verification.channel || codeChannel,
                    platform: 'BIN-GENESIS-SOVEREIGN-OS'
                }
            };

            generateContractPDF(signedArtifact);
            onSign(signedArtifact);
            setSnackbar({ open: true, message: 'Contract signed with verified backend evidence.', severity: 'success' });
        } catch (error: any) {
            setSnackbar({ open: true, message: error?.message || 'Verification failed. Contract was not signed.', severity: 'error' });
        } finally {
            setVerifyingCode(false);
        }
    };

    const generateContractPDF = (artifact: any) => {
        const doc = new jsPDF();
        registerArabicFont(doc);
        const contractInfo = getContractContent();

        doc.setFontSize(22);
        doc.text("BIN GROUP - SOVEREIGN CONTRACT", 105, 20, { align: "center" });

        doc.setFontSize(16);
        doc.text(contractInfo.title, 105, 30, { align: "center" });

        doc.setFontSize(12);
        doc.text(`Version: ${artifact.version}`, 20, 50);
        doc.text(`Hash: ${artifact.institutionalHash}`, 20, 58);
        doc.text(`Timestamp: ${new Date(artifact.timestamp).toLocaleString()}`, 20, 66);
        doc.text(`Verification ID: ${artifact.verificationId || 'N/A'}`, 20, 74);

        doc.setFontSize(14);
        doc.text("1. PARTIES", 20, 90);
        doc.setFontSize(11);
        doc.text(`Property: ${propertyData?.address || propertyData?.propertyName || 'Subject Asset'}`, 20, 100);
        doc.text(`Owner/Entity: ${propertyData?.authorityName || propertyData?.departmentName || 'Registered Legal Owner'}`, 20, 107);
        doc.text(`Provider: BIN GROUP PROPERTY MANAGEMENT LLC`, 20, 114);

        doc.setFontSize(14);
        doc.text("2. SCOPE OF SERVICES", 20, 130);
        doc.setFontSize(11);
        const splitScope = doc.splitTextToSize(contractInfo.body, 170);
        doc.text(splitScope, 20, 140);

        doc.setFontSize(14);
        doc.text("3. PRICING & DISBURSEMENT", 20, 180);
        doc.setFontSize(11);
        doc.text(`Annual Management Fee: AED ${formatAED(Math.round(selectedPlan?.annualPrice || selectedPlan?.package?.annualPrice || 0))}`, 20, 190);
        doc.text(`Payment Schedule: Institutional settlement manifest applies.`, 20, 197);

        doc.setFontSize(14);
        doc.text("4. SIGNATURES", 20, 220);
        doc.setFontSize(11);
        doc.text(`Digitally Signed By: ${artifact.signature}`, 20, 230);
        doc.text(`Backend Verification: YES`, 20, 237);
        doc.text(`Platform Origin: ${artifact.acceptanceLog.platform}`, 20, 244);

        doc.rect(15, 215, 180, 40);

        doc.save(`BIN_GROUP_Contract_${artifact.institutionalHash}.pdf`);
    };

    const getContractContent = () => {
        const pType = propertyData?.propertyType;
        const isMajlis = pType === 'GOVERNMENT_MAJLIS' || pType?.toLowerCase() === 'majlis' || propertyData?.majlis;

        if (isMajlis) {
            return {
                title: 'SOVEREIGN MAJLIS MAINTENANCE AGREEMENT',
                body: `The Provider shall furnish comprehensive maintenance and event-readiness services specifically engineered for sovereign/government Majlis operations.

Inclusions:
- Comprehensive AC & HVAC maintenance
- Specialized Electrical & Lighting systems
- Elite Plumbing & Water Features
- Civil works & Handyman services
- Specialized Cleaning add-on
- Dedicated Majlis/Event Standby Technician
- Rapid Emergency Response protocol
- Pre-event Readiness Inspection
- Post-event Clearance Inspection
- Sovereign VIP support option
- Scheduled Frequency of Visits (as per tier)
- Elite SLA Level compliance`
            };
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
    const annualPrice = Math.round(selectedPlan?.annualPrice || selectedPlan?.package?.annualPrice || 0);

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <VerifiedUserIcon color="primary" />
                <Typography variant="h6" fontWeight="black">Digital Signature & Activation</Typography>
            </Box>

            <Alert severity="info" sx={{ mb: 4, bgcolor: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0' }}>
                <Typography variant="subtitle2" fontWeight="bold">Legal Protocol Notice:</Typography>
                This contract is governed by the relevant UAE municipal and federal regulations. Signing activates the institutional asset management layer only after backend verification succeeds.
            </Alert>

            <Paper sx={{ p: 4, mb: 4, bgcolor: '#fff', border: '1px solid #e2e8f0', height: 350, overflowY: 'auto' }}>
                <Typography variant="h5" align="center" gutterBottom fontWeight="black" sx={{ textTransform: 'uppercase' }}>
                    {contract.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" align="center" sx={{ display: 'block', mb: 4 }}>
                    VERSION: v2.1-UAE-INSTITUTIONAL-VERIFIED
                </Typography>

                <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" fontWeight="bold">1. PARTIES</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Property: {propertyData?.address || propertyData?.propertyName || 'Subject Asset'} <br/>
                        Owner/Entity: {propertyData?.authorityName || propertyData?.departmentName || 'Registered Legal Owner'}<br/>
                        Provider: BIN GROUP PROPERTY MANAGEMENT LLC
                    </Typography>

                    <Typography variant="subtitle2" fontWeight="bold">2. SCOPE OF SERVICES</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {contract.body}
                    </Typography>

                    <Typography variant="subtitle2" fontWeight="bold">3. PRICING & DISBURSEMENT</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Annual Management Fee: AED {formatAED(annualPrice)}<br/>
                        Payment Schedule: Institutional settlement manifest applies.
                    </Typography>

                    <Typography variant="subtitle2" fontWeight="bold">4. DURATION</Typography>
                    <Typography variant="body2">
                        12-month institutional contract with evergreen auto-renewal under Sovereign Protocol.
                    </Typography>
                </Box>
            </Paper>

            <Divider sx={{ mb: 4 }} />

            <Stack spacing={3}>
                <Box>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>Type Digital Signature</Typography>
                    <TextField
                        fullWidth
                        placeholder="Type Full Name / Authority Authorized Person"
                        value={signature}
                        onChange={(e) => setSignature(e.target.value)}
                        helperText="Type your name to digitally sign the agreement. The signature is accepted only after backend code verification."
                    />
                </Box>

                <FormControlLabel
                    control={<Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />}
                    label={
                        <Typography variant="body2">
                            I verify that I am the legal owner or authorized representative and accept the Agreement and Data Compliance Protocol.
                        </Typography>
                    }
                />

                {!codeSent ? (
                    <Button
                        variant="outlined"
                        size="large"
                        disabled={!accepted || !signature || sendingCode}
                        onClick={handleSendCode}
                        startIcon={sendingCode ? <CircularProgress size={18} /> : <ArticleIcon />}
                    >
                        {sendingCode ? 'Sending verification code...' : 'Verify contract signature'}
                    </Button>
                ) : (
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TextField
                            label={`Enter 6-digit code sent by ${codeChannel}`}
                            size="small"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        />
                        <Button
                            variant="contained"
                            color="success"
                            size="large"
                            disabled={code.length < 6 || verifyingCode}
                            onClick={handleFinalize}
                            startIcon={verifyingCode ? <CircularProgress size={18} color="inherit" /> : <DrawIcon />}
                            sx={{ fontWeight: 'bold' }}
                        >
                            {verifyingCode ? 'Verifying...' : 'Finalize & Activate'}
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
