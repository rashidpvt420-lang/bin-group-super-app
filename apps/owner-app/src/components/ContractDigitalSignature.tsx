// owner-app/src/components/ContractDigitalSignature.tsx
import React, { useState } from 'react';
import {
    Box, Typography, Button, Checkbox, FormControlLabel,
    Paper, Divider, Stack, TextField, Alert, Snackbar
} from '@mui/material';
import DrawIcon from '@mui/icons-material/Draw';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ArticleIcon from '@mui/icons-material/Article';

interface Props {
    propertyData: any;
    selectedPlan: any;
    onSign: () => void;
}

export default function ContractDigitalSignature({ propertyData, selectedPlan, onSign }: Props) {
    const [accepted, setAccepted] = useState(false);
    const [signature, setSignature] = useState('');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const handleSendOtp = () => {
        setOtpSent(true);
        setSnackbar({ open: true, message: "Institutional Activation: OTP sent to the registered mobile number on the Title Deed.", severity: 'info' });
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <VerifiedUserIcon color="primary" />
                <Typography variant="h6" fontWeight="black">Digital Signature & Activation</Typography>
            </Box>

            <Alert severity="info" sx={{ mb: 4, bgcolor: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0' }}>
                <Typography variant="subtitle2" fontWeight="bold">Legal Protocol Notice:</Typography>
                This contract is governed by the Dubai Land Department (DLD) regulations. 
                Signing this activates the institutional asset management layer.
            </Alert>

            <Paper sx={{ p: 4, mb: 4, bgcolor: '#fff', border: '1px solid #e2e8f0', height: 300, overflowY: 'auto' }}>
                <Typography variant="h5" align="center" gutterBottom fontWeight="black">MASTER SERVICE AGREEMENT</Typography>
                <Typography variant="caption" color="text.secondary" align="center" sx={{ display: 'block', mb: 4 }}>
                    VERSION: v1.0-UAE-INSTITUTIONAL
                </Typography>
                
                <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" fontWeight="bold">1. PARTIES</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Property: {propertyData?.propertyName} ({propertyData?.unitNumber})<br/>
                        Owner: {propertyData?.ownerName}<br/>
                        Provider: BIN GROUP PROPERTY MANAGEMENT LLC
                    </Typography>

                    <Typography variant="subtitle2" fontWeight="bold">2. SCOPE OF SERVICES</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {selectedPlan?.package?.packageName} includes 24/7 technical call-out, 
                        preventative maintenance, and 5% gross rent yield optimization.
                    </Typography>

                    <Typography variant="subtitle2" fontWeight="bold">3. PRICING & DISBURSEMENT</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Annual Management Fee: AED {Math.round(selectedPlan?.package?.annualPrice).toLocaleString()}<br/>
                        Payment Schedule: Annualized, deducted from first gross rent collection.
                    </Typography>

                    <Typography variant="subtitle2" fontWeight="bold">4. DURATION</Typography>
                    <Typography variant="body2">
                        12-month terminal contract with evergreen auto-renewal.
                    </Typography>
                </Box>
            </Paper>

            <Divider sx={{ mb: 4 }} />

            <Stack spacing={3}>
                <Box>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>Type Digital Signature</Typography>
                    <TextField 
                        fullWidth 
                        placeholder="Type Full Name as on Title Deed" 
                        value={signature} 
                        onChange={(e) => setSignature(e.target.value)}
                        helperText="Type your name to digitally sign the agreement."
                    />
                </Box>

                <FormControlLabel
                    control={<Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />}
                    label={
                        <Typography variant="body2">
                            I verify that I am the legal owner of {propertyData?.unitNumber} and accept the 
                            Master Service Agreement and Data Compliance Protocol.
                        </Typography>
                    }
                />

                {!otpSent ? (
                    <Button 
                        variant="outlined" 
                        size="large" 
                        disabled={!accepted || !signature} 
                        onClick={handleSendOtp}
                        startIcon={<ArticleIcon />}
                    >
                        Verify with Mobile OTP
                    </Button>
                ) : (
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <TextField 
                            label="Enter 6-digit OTP" 
                            size="small" 
                            value={otp} 
                            onChange={(e) => setOtp(e.target.value)}
                        />
                        <Button 
                            variant="contained" 
                            color="success"
                            size="large"
                            disabled={otp.length < 6}
                            onClick={onSign}
                            startIcon={<DrawIcon />}
                            sx={{ fontWeight: 'bold' }}
                        >
                            Finalize & Activate
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
