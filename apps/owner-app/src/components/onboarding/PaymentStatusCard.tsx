import React from 'react';
import InfoIcon from '@mui/icons-material/Info';
import { 
    Box, Typography, Paper, Stepper, Step, StepLabel, 
    alpha, CircularProgress, Stack, Button, Divider, Grid, Alert 
} from '@mui/material';
import { 
    FileText, ShieldCheck, Wallet 
} from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

export interface PaymentStatus {
    method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | null;
    status: 'PENDING' | 'INITIATED' | 'SUBMITTED' | 'UNDER_VERIFICATION' | 'VERIFIED' | 'APPROVED' | 'CLEARED';
    amount: number;
    updatedAt: any;
}

const PaymentStatusCard: React.FC<{ statusData: PaymentStatus }> = ({ statusData }) => {
    const { tx, isRTL } = useLanguage();

    const getSteps = () => {
        if (statusData.method === 'CHEQUE') {
            return [
                { key: 'INITIATED', label: 'Payment Initiated' },
                { key: 'SUBMITTED', label: 'Cheque Received' },
                { key: 'UNDER_VERIFICATION', label: 'Under Verification' },
                { key: 'CLEARED', label: 'Cheque Cleared' },
                { key: 'APPROVED', label: 'Activation Approved' }
            ];
        }
        return [
            { key: 'INITIATED', label: 'Payment Initiated' },
            { key: 'SUBMITTED', label: 'Payment Submitted' },
            { key: 'UNDER_VERIFICATION', label: 'Verification Phase' },
            { key: 'VERIFIED', label: 'Payment Verified' },
            { key: 'APPROVED', label: 'Active Status' }
        ];
    };

    const steps = getSteps();
    const activeStepIndex = steps.findIndex(s => s.key === statusData.status);

    return (
        <Paper sx={{ 
            p: 4, 
            borderRadius: 6, 
            bgcolor: 'rgba(22, 22, 24, 0.9)', 
            border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`,
            boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <Box sx={{ 
                position: 'absolute', top: 0, left: 0, width: '100%', height: '4px',
                background: `linear-gradient(90deg, transparent, ${binThemeTokens.gold}, transparent)`
            }} />

            <Stack spacing={4}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                            ONBOARDING STATUS
                        </Typography>
                        <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>
                            {statusData.status.replace('_', ' ')}
                        </Typography>
                    </Box>
                    <Box sx={{ p: 2, borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}>
                        <Wallet size={32} />
                    </Box>
                </Box>

                <Stepper 
                    activeStep={activeStepIndex} 
                    alternativeLabel 
                    sx={{ 
                        '& .MuiStepLabel-label': { color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: '0.7rem' },
                        '& .MuiStepLabel-label.Mui-active': { color: binThemeTokens.gold },
                        '& .MuiStepLabel-label.Mui-completed': { color: '#4ADE80' },
                        '& .MuiStepIcon-root': { color: 'rgba(255,255,255,0.1)' },
                        '& .MuiStepIcon-root.Mui-active': { color: binThemeTokens.gold },
                        '& .MuiStepIcon-root.Mui-completed': { color: '#4ADE80' }
                    }}
                >
                    {steps.map((step) => (
                        <Step key={step.key}>
                            <StepLabel>{step.label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                <Box sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900 }}>METHOD</Typography>
                            <Typography variant="body1" fontWeight="700">{statusData.method || 'Awaiting Selection'}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900 }}>DUE AMOUNT</Typography>
                            <Typography variant="body1" fontWeight="700" sx={{ color: binThemeTokens.gold }}>AED {statusData.amount.toLocaleString()}</Typography>
                        </Grid>
                    </Grid>
                </Box>

                {statusData.status === 'INITIATED' && (
                    <Alert icon={<InfoIcon sx={{ fontSize: 18 }} />} severity="info" sx={{ bgcolor: 'rgba(59,130,246,0.1)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.2)' }}>
                        Institutional mobilize payment initiated. Please submit proof of transfer or cheque to BIN GROUP HQ.
                    </Alert>
                )}

                <Stack direction="row" spacing={2}>
                    <Button 
                        fullWidth 
                        variant="outlined" 
                        startIcon={<FileText size={16} />}
                        sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900 }}
                    >
                        VIEW MANIFEST
                    </Button>
                    <Button 
                        fullWidth 
                        variant="contained" 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                    >
                        CONTACT SUPPORT
                    </Button>
                </Stack>
            </Stack>
        </Paper>
    );
};

export default PaymentStatusCard;
