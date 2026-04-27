import React from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Container,
    Divider,
    Grid,
    Paper,
    Stack,
    Typography
} from '@mui/material';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { formatAED } from '../../utils/formatters';
import { binThemeTokens } from '../../theme/binGroupTheme';

const documentLabels: Record<string, string> = {
    propertyProof: 'Title Deed / Property Authority Proof',
    emiratesId: 'Emirates ID',
    passport: 'Passport',
    tradeLicense: 'Trade License',
    tenancySupport: 'Tenancy Supporting File'
};

const ReviewBeforeSubmitStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const {
        companyProfile,
        properties,
        selectedPlan,
        selectedAddOns,
        portfolioSummary,
        ownerAccount,
        proofDocuments
    } = useOnboardingStore();

    const primaryProperty = properties[0];
    const estimatedAnnualValue = portfolioSummary?.estimatedACV || (portfolioSummary?.totalUnits || 1) * 2500;
    const mobilizationAmount = Math.round(estimatedAnnualValue * 0.15);
    const documentEntries = Object.entries(documentLabels).map(([key, label]) => ({
        key,
        label,
        fileName: proofDocuments.labels[key] || (proofDocuments as any)[key]?.name || '',
        required: ['propertyProof', 'emiratesId', 'passport'].includes(key)
    }));

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 5 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    REVIEW BEFORE SUBMIT
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.56)' }}>
                    Confirm the onboarding package before the 15% mobilization step.
                </Typography>
            </Box>

            <Alert icon={<ShieldCheck size={18} />} severity="info" sx={{ mb: 3, bgcolor: 'rgba(198,167,94,0.08)', color: binThemeTokens.gold, border: '1px solid rgba(198,167,94,0.24)' }}>
                Live owner, property, unit, contract, and dashboard access remain locked until BIN GROUP admin verifies documents and payment.
            </Alert>

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>OWNER & COMPANY</Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{companyProfile.name || 'Private Owner / Company'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{ownerAccount?.fullName || companyProfile.contactPerson || 'Owner contact pending'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{ownerAccount?.email || companyProfile.email || 'Email pending'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{ownerAccount?.mobile || companyProfile.phone || 'Mobile pending'}</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>PROPERTY SUMMARY</Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{primaryProperty?.propertyType || 'Property'} in {primaryProperty?.emirate || 'UAE'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{primaryProperty?.address || primaryProperty?.area || 'Location pending admin verification'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>
                            {portfolioSummary.totalProperties || properties.length || 1} properties | {portfolioSummary.totalUnits || primaryProperty?.units || 0} units | {portfolioSummary.totalSqFt || primaryProperty?.sqft || 0} sqft
                        </Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>SERVICE PLAN</Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{selectedPlan?.name || 'Service Plan Pending'}</Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
                            {(selectedPlan?.features || ['Admin reviewed coverage']).map((feature: string) => (
                                <Chip key={feature} icon={<CheckCircle2 size={14} />} label={feature} size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#86efac', fontWeight: 800 }} />
                            ))}
                        </Stack>
                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 2 }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.44)', fontWeight: 900 }}>ADD-ONS</Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mt: 1 }}>
                            {(selectedAddOns.length ? selectedAddOns : ['No add-ons selected']).map((addOn) => (
                                <Chip key={addOn} label={addOn} size="small" variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.18)' }} />
                            ))}
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(198,167,94,0.07)', border: '1px solid rgba(198,167,94,0.28)' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>PAYMENT PREVIEW</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>Annual estimate</Typography>
                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>{formatAED(estimatedAnnualValue)}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>15% mobilization due</Typography>
                        <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{formatAED(mobilizationAmount)}</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>DOCUMENTS</Typography>
                        <Grid container spacing={2} sx={{ mt: 0.5 }}>
                            {documentEntries.map((doc) => (
                                <Grid item xs={12} md={6} key={doc.key}>
                                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.03)' }}>
                                        <FileText size={18} color={doc.fileName ? '#10b981' : 'rgba(255,255,255,0.3)'} />
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>{doc.label}{doc.required ? ' *' : ''}</Typography>
                                            <Typography variant="caption" sx={{ color: doc.fileName ? 'rgba(255,255,255,0.62)' : '#fbbf24', wordBreak: 'break-all' }}>
                                                {doc.fileName || (doc.required ? 'Required before payment' : 'Optional')}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Button variant="outlined" size="large" onClick={onBack} startIcon={<ArrowLeft />} sx={{ borderRadius: 100, px: 4, color: 'rgba(255,255,255,0.64)', borderColor: 'rgba(255,255,255,0.16)' }}>
                    BACK
                </Button>
                <Button variant="contained" size="large" onClick={onNext} endIcon={<ArrowRight />} sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                    CONTINUE TO PAYMENT
                </Button>
            </Box>
        </Container>
    );
};

export default ReviewBeforeSubmitStep;
