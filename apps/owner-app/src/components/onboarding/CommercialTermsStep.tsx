import React, { useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Button, Divider, Chip, Container 
} from '@mui/material';
import { Wrench, UserCheck, ShieldCheck, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const CommercialTermsStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { setSelectedPlan, selectedPlan } = useOnboardingStore();
    const { tx } = useLanguage();
    const [selectedTerm, setSelectedTerm] = useState('Annual');

    const plans = [
        {
            id: 'maintenance_only',
            name: 'Maintenance Only',
            icon: <Wrench size={24} />,
            features: ['MEP coordination', 'Tenant maintenance request handling', 'SLA tracking', 'Completion photos'],
            exclusions: ['Major replacements', 'Government fees', 'Lift/pool AMC unless selected'],
            desc: 'Technical maintenance coverage for responsive repairs and operational history.'
        },
        {
            id: 'pm_only',
            name: 'Property Management',
            icon: <UserCheck size={24} />,
            features: ['Tenant onboarding', 'Rent/payment tracking', 'Complaint management', 'Owner reporting'],
            exclusions: ['Court/RDC cases', 'Major renovation', 'Broker commission unless contracted'],
            desc: 'Tenant, rent, document and reporting operations for managed properties.'
        },
        {
            id: 'hybrid',
            name: 'Total Care Hybrid',
            icon: <ShieldCheck size={24} />,
            premium: true,
            features: ['Maintenance + PM features', 'Priority SLA', 'Preventive calendar', 'AI Design Studio access'],
            exclusions: ['Major capital expenditure', 'Authority fines/fees', 'Specialist compliance unless added'],
            desc: 'Full operating visibility for owners who want maintenance, tenant service and reporting together.'
        }
    ];

    const terms = [
        { id: 'Annual', label: 'ANNUAL', discount: '10% OFF' },
        { id: 'Semi-Annual', label: 'SEMI-ANNUAL', discount: '5% OFF' },
        { id: 'Quarterly', label: 'QUARTERLY', discount: 'STANDARD' },
    ];

    const canProceed = selectedPlan;

    return (
        <Box sx={{ py: 2 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.service_plan', 'SERVICE PLAN')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.service_plan_desc', 'Choose coverage, exclusions, add-ons, SLA impact and payment frequency before verification.')}
                </Typography>
            </Box>

            <Container maxWidth="lg">
                <Grid container spacing={4}>
                    {/* PLAN SELECTOR */}
                    <Grid item xs={12} lg={8}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                1. SERVICE PLAN
                            </Typography>
                            <Grid container spacing={2}>
                                {plans.map((plan) => (
                                    <Grid item xs={12} sm={4} key={plan.id}>
                                        <Paper 
                                            onClick={() => setSelectedPlan(plan)}
                                            sx={{ 
                                                p: 3, height: '100%', cursor: 'pointer',
                                                bgcolor: selectedPlan?.id === plan.id ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.02)',
                                                border: `2px solid ${selectedPlan?.id === plan.id ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`,
                                                borderRadius: 4, transition: 'all 0.2s ease',
                                                display: 'flex', flexDirection: 'column'
                                            }}
                                        >
                                            <Box sx={{ color: binThemeTokens.gold, mb: 2, display: 'flex', justifyContent: 'center' }}>{plan.icon}</Box>
                                            <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF', mb: 1, textAlign: 'center' }}>{plan.name}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.58)', minHeight: 44, textAlign: 'center' }}>{plan.desc}</Typography>
                                            <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.05)' }} />
                                            <Stack spacing={0.5} sx={{ mt: 1 }}>
                                                {plan.features.map((f, i) => (
                                                    <Stack key={i} direction="row" spacing={0.5} alignItems="flex-start">
                                                        <CheckCircle2 size={13} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.68)', fontSize: '0.7rem' }}>{f}</Typography>
                                                    </Stack>
                                                ))}
                                            </Stack>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, mt: 1.5, mb: 0.5, fontWeight: 900 }}>Not included unless added</Typography>
                                            <Stack spacing={0.5}>
                                                {plan.exclusions.map((item, i) => (
                                                    <Stack key={i} direction="row" spacing={0.5} alignItems="flex-start">
                                                        <XCircle size={12} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} />
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)', fontSize: '0.68rem' }}>{item}</Typography>
                                                    </Stack>
                                                ))}
                                            </Stack>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                        </Paper>
                    </Grid>

                    {/* FREQUENCY SELECTOR */}
                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                2. PAYMENT FREQUENCY
                            </Typography>
                            <Stack spacing={2}>
                                {terms.map((term) => (
                                    <Paper 
                                        key={term.id}
                                        onClick={() => setSelectedTerm(term.id)}
                                        sx={{ 
                                            p: 2, cursor: 'pointer',
                                            bgcolor: selectedTerm === term.id ? 'rgba(198, 167, 94, 0.05)' : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${selectedTerm === term.id ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`,
                                            borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}
                                    >
                                        <Typography variant="caption" fontWeight="900" sx={{ color: '#FFF' }}>{term.label}</Typography>
                                        <Chip label={term.discount} size="small" sx={{ height: 20, fontSize: '0.6rem', bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                                    </Paper>
                                ))}

                                <Box sx={{ mt: 2 }}>
                                    <Button 
                                        variant="contained" fullWidth size="large" 
                                        onClick={onNext} disabled={!canProceed}
                                        endIcon={<ArrowRight />}
                                        sx={{ borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                                    >
                                        Review Documents
                                    </Button>
                                    <Button variant="text" fullWidth onClick={onBack} sx={{ mt: 1, color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>BACK</Button>
                                </Box>
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default CommercialTermsStep;
