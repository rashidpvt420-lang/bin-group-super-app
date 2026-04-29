import React from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Button, Divider, Collapse
} from '@mui/material';
import { Wrench, UserCheck, ShieldCheck, ArrowRight, ArrowLeft, Info, CheckCircle2, XCircle } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const ContractTypeStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { setSelectedPlan, selectedPlan } = useOnboardingStore();
    const { tx, isRTL } = useLanguage();

    const plans = [
        {
            id: 'maintenance_only',
            title: 'PROTOCOL A',
            name: 'MAINTENANCE ONLY',
            icon: <Wrench size={32} />,
            features: [
                'Tenant maintenance request handling',
                'Institutional technician dispatch',
                'Minor repair coordination',
                'SLA tracking & Completion proof',
                'Maintenance history & Owner reports',
                'AED 1,000 Auto-Approval rule'
            ],
            excludes: [
                'Major equipment replacement',
                'Structural / Renovation works',
                'Authority / Municipality fees',
                'Landscaping & Pool unless add-on'
            ],
            desc: 'Focus on technical integrity and rapid asset restoration.'
        },
        {
            id: 'pm_only',
            title: 'PROTOCOL B',
            name: 'PROPERTY MANAGEMENT',
            icon: <UserCheck size={32} />,
            features: [
                'Tenant onboarding & Document vault',
                'Rent ledger & payment tracking',
                'Complaint mediation',
                'Move-in / Move-out digital inspection',
                'Occupancy tracking & Lease reminders',
                'Owner financial reporting'
            ],
            excludes: [
                'Technical maintenance dispatch',
                'Court / Legal representation',
                'Broker commissions',
                'Major repairs / furnishing'
            ],
            desc: 'Maximizing ROI through rigorous operational management.'
        },
        {
            id: 'hybrid',
            title: 'PROTOCOL C',
            name: 'TOTAL CARE HYBRID',
            icon: <ShieldCheck size={32} />,
            premium: true,
            features: [
                'All features of Maintenance & PM',
                'Priority SLA & Executive Escalation',
                'Preventive maintenance calendar',
                'Property health & Risk audits',
                'AI Design Studio access',
                'Detailed monthly yield reports'
            ],
            excludes: [
                'Capital expenditure items',
                'Structural major renovation',
                'Authority fines from prior state'
            ],
            desc: 'The ultimate Sovereign-grade property operations layer.'
        }
    ];

    const handleSelect = (plan: any) => {
        setSelectedPlan(plan);
        onNext();
    };

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>SOVEREIGN SERVICE MODELS</Typography>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.select_contract', 'SELECT SERVICE PROTOCOL')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.contract_desc', 'Align the operational model with your portfolio objectives.')}
                </Typography>
            </Box>

            <Grid container spacing={3}>
                {plans.map((plan) => (
                    <Grid item xs={12} md={4} key={plan.id}>
                        <Paper 
                            onClick={() => handleSelect(plan)}
                            sx={{ 
                                p: 4, 
                                height: '100%',
                                cursor: 'pointer',
                                bgcolor: selectedPlan?.id === plan.id ? alpha(binThemeTokens.gold, 0.1) : 'rgba(22, 22, 24, 0.6)',
                                border: `1px solid ${selectedPlan?.id === plan.id ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`,
                                borderRadius: 4,
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                position: 'relative',
                                overflow: 'hidden',
                                '&:hover': {
                                    borderColor: binThemeTokens.gold,
                                    transform: 'translateY(-10px)',
                                    bgcolor: 'rgba(198, 167, 94, 0.05)'
                                }
                            }}
                        >
                            {plan.premium && (
                                <Box sx={{ 
                                    position: 'absolute', top: 12, right: -25, 
                                    bgcolor: binThemeTokens.gold, color: '#000',
                                    px: 4, py: 0.5, transform: 'rotate(45deg)',
                                    fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1
                                }}>
                                    RECOMMENDED
                                </Box>
                            )}
                            
                            <Box sx={{ color: binThemeTokens.gold, mb: 3 }}>{plan.icon}</Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>{plan.title}</Typography>
                            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{plan.name}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 3 }}>{plan.desc}</Typography>
                            
                            <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.05)' }} />
                            
                            <Box sx={{ mb: 4, flexGrow: 1 }}>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>COVERED MISSIONS</Typography>
                                <Stack spacing={1.5} sx={{ mb: 4 }}>
                                    {plan.features.map((feat, i) => (
                                        <Stack direction="row" spacing={1} key={i} alignItems="center">
                                            <CheckCircle2 size={14} color="#10b981" />
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{feat}</Typography>
                                        </Stack>
                                    ))}
                                </Stack>

                                <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 900, mb: 2, display: 'block' }}>EXCLUSIONS</Typography>
                                <Stack spacing={1.5}>
                                    {plan.excludes.map((ex, i) => (
                                        <Stack direction="row" spacing={1} key={i} alignItems="center">
                                            <XCircle size={14} color="#ef4444" style={{ opacity: 0.6 }} />
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{ex}</Typography>
                                        </Stack>
                                    ))}
                                </Stack>
                            </Box>

                            <Box sx={{ mt: 'auto', p: 2, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.02)' }}>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Info size={12} /> SYSTEMIC PROTOCOL ACTIVE
                                </Typography>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Box sx={{ mt: 8, textAlign: 'center' }}>
                <Button 
                    variant="outlined" 
                    size="large" 
                    onClick={onBack}
                    startIcon={<ArrowLeft />}
                    sx={{ borderRadius: 100, px: 6, color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)', fontWeight: 900 }}
                >
                    BACK
                </Button>
            </Box>
        </Box>
    );
};

export default ContractTypeStep;
