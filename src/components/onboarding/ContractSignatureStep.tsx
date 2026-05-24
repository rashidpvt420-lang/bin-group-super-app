import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Paper, Grid, TextField, Checkbox, FormControlLabel, Stack, alpha
} from '@mui/material';
import { FileSignature, ShieldCheck, Download, Info } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../../utils/formatters';
import { binThemeTokens } from '../../theme/binGroupTheme';

interface ContractSignatureStepProps {
    onNext: () => void;
    onBack: () => void;
}

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.')) return fallback;
    return value;
};

export default function ContractSignatureStep({ onNext, onBack }: ContractSignatureStepProps) {
    const {
        companyProfile,
        ownerAccount,
        properties,
        portfolioSummary,
        isContractSigned,
        signatureName,
        setContractSignature
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const [typedName, setTypedName] = useState(signatureName || '');
    const [accepted, setAccepted] = useState(isContractSigned);

    const primaryProperty = properties[0];
    const quote = portfolioSummary.quoteResults?.[primaryProperty?.id];
    const ownerName = ownerAccount?.fullName || companyProfile.contactPerson || 'Owner';

    useEffect(() => {
        setContractSignature(accepted, typedName);
    }, [typedName, accepted, setContractSignature]);

    const isValid = typedName.trim().length >= 3 && accepted;

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', width: '100%', py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 }, dir: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" color="#FFF" gutterBottom>
                    {readable(t('onboarding.contract_title'), 'Service Agreement')}
                </Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">
                    {readable(t('onboarding.contract_desc'), 'Review the contract summary and provide your digital signature to proceed.')}
                </Typography>
            </Box>

            <Paper sx={{
                p: { xs: 3, md: 5 },
                borderRadius: 4,
                bgcolor: 'rgba(22, 22, 24, 0.6)',
                border: '1px solid rgba(255,255,255,0.05)',
                backdropFilter: 'blur(10px)',
                mb: 4
            }}>
                {/* PDF-like Visual Summary */}
                <Box sx={{ bgcolor: '#FFF', color: '#000', p: 4, borderRadius: 2, mb: 4, position: 'relative', overflow: 'hidden' }}>
                    <Box sx={{ position: 'absolute', top: -20, right: -20, opacity: 0.05, transform: 'rotate(-15deg)' }}>
                        <ShieldCheck size={200} />
                    </Box>
                    <Typography variant="h5" fontWeight="950" align="center" sx={{ color: binThemeTokens.gold, mb: 1 }}>BIN GROUP L.L.C</Typography>
                    <Typography variant="caption" align="center" display="block" fontWeight="700" sx={{ mb: 3 }}>BILINGUAL SERVICE CONTRACT SUMMARY</Typography>
                    
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="text.secondary">Owner / المالك</Typography>
                            <Typography variant="body2" fontWeight="700">{ownerName}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="text.secondary">Company / الشركة</Typography>
                            <Typography variant="body2" fontWeight="700">{companyProfile.name || 'Private / فردي'}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="text.secondary">Property / العقار</Typography>
                            <Typography variant="body2" fontWeight="700">{primaryProperty?.address || primaryProperty?.emirate || 'UAE'}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="text.secondary">Plan / الباقة</Typography>
                            <Typography variant="body2" fontWeight="700">{primaryProperty?.strategy === 'fm' ? 'Maintenance Only' : 'Maintenance + Property Management'}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="text.secondary">Annual Value / القيمة السنوية</Typography>
                            <Typography variant="body2" fontWeight="700" color="primary.main">AED {formatAED(quote?.annualTotal || 0)}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="text.secondary">Mobilization / دفعة البدء</Typography>
                            <Typography variant="body2" fontWeight="700">AED {formatAED(quote?.mobilizationFee || 0)}</Typography>
                        </Grid>
                    </Grid>

                    <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderLeft: `3px solid ${binThemeTokens.gold}` }}>
                        <Typography variant="caption" fontWeight="700" display="block" mb={1}>Legal Note / ملاحظة قانونية</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                            This summary is governed by the final signed service agreement and applicable UAE laws. In case of conflict, the signed agreement and approved service schedule prevail.
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', fontFamily: 'Arial' }}>
                            يخضع هذا الملخص للعقد النهائي الموقع وجدول الخدمات المعتمد والقوانين المعمول بها في دولة الإمارات العربية المتحدة.
                        </Typography>
                    </Box>
                </Box>

                {/* Digital Signature Block */}
                <Box sx={{ p: 3, bgcolor: 'rgba(198, 167, 94, 0.05)', borderRadius: 2, border: `1px solid rgba(198, 167, 94, 0.2)` }}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                        <FileSignature size={20} color={binThemeTokens.gold} />
                        <Typography variant="h6" fontWeight="950" color="#FFF">Digital Signature</Typography>
                    </Stack>
                    
                    <TextField 
                        fullWidth
                        label="Type your full legal name to sign"
                        variant="outlined"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        sx={{ mb: 2 }}
                        InputProps={{
                            sx: { color: '#FFF', fontFamily: 'monospace', fontSize: '1.1rem' }
                        }}
                    />

                    <FormControlLabel
                        control={
                            <Checkbox 
                                checked={accepted} 
                                onChange={(e) => setAccepted(e.target.checked)} 
                                sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }}
                            />
                        }
                        label={
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                I, <strong>{typedName || '___'}</strong>, accept the commercial terms and authorize BIN GROUP to generate the legally binding digital contract.
                            </Typography>
                        }
                    />
                </Box>
            </Paper>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                    variant="outlined"
                    onClick={onBack}
                    fullWidth
                    sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', py: 1.5, px: 4, borderRadius: 100, fontWeight: 950 }}
                >
                    {readable(t('onboarding.back'), 'Back')}
                </Button>
                <Button
                    variant="contained"
                    onClick={onNext}
                    disabled={!isValid}
                    fullWidth
                    sx={{
                        bgcolor: binThemeTokens.gold,
                        color: '#000',
                        fontWeight: 950,
                        py: 1.5,
                        px: 4,
                        borderRadius: 100,
                        '&:hover': { bgcolor: '#FFF' },
                        '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }
                    }}
                >
                    {readable(t('onboarding.sign_proceed'), 'Sign & Proceed to Payment')}
                </Button>
            </Stack>
        </Box>
    );
}
