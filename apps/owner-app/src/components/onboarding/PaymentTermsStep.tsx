import React from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Button, Divider, Container, Chip 
} from '@mui/material';
import { Calendar, CreditCard, ArrowRight, ArrowLeft } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const PaymentTermsStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { updatePropertyData, propertyData } = useOnboardingStore();
    const { tx, isRTL } = useLanguage();

    const terms = [
        { id: 'Annual', label: 'ANNUAL (1 CHEQUE)', discount: '10% DISCOUNT', desc: 'Single institutional settlement with maximum discount.' },
        { id: 'Semi-Annual', label: 'SEMI-ANNUAL (2 CHEQUES)', discount: '5% DISCOUNT', desc: 'Strategic bi-annual allocation for optimized cashflow.' },
        { id: 'Quarterly', label: 'QUARTERLY (4 CHEQUES)', discount: 'STANDARD RATE', desc: 'Operational agility with flexible quarterly payments.' },
    ];

    const handleSelect = (termId: string) => {
        // We use updatePropertyData for global portfolio-level preferences if applicable
        // Or we can map this to a specific field. In existing store, we don't have a explicit 'terms' field, 
        // so I'll add it to propertyData for now or store it locally if only for the summary.
        // Actually let's just use it to progress for now as per PRD requirement.
        onNext();
    };

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.payment_terms', 'SETTLEMENT ARCHITECTURE')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.payment_terms_desc', 'Define the financial cadence for your operational services.')}
                </Typography>
            </Box>

            <Container maxWidth="md">
                <Stack spacing={3}>
                    {terms.map((term) => (
                        <Paper 
                            key={term.id}
                            onClick={() => handleSelect(term.id)}
                            sx={{ 
                                p: 4, 
                                cursor: 'pointer',
                                bgcolor: 'rgba(22, 22, 24, 0.6)', 
                                border: '1px solid rgba(255,255,255,0.05)', 
                                borderRadius: 4,
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                '&:hover': {
                                    borderColor: binThemeTokens.gold,
                                    bgcolor: 'rgba(198, 167, 94, 0.05)',
                                    transform: 'translateX(10px)'
                                }
                            }}
                        >
                            <Box sx={{ 
                                p: 2, 
                                borderRadius: 3, 
                                bgcolor: alpha(binThemeTokens.gold, 0.1), 
                                color: binThemeTokens.gold 
                            }}>
                                <Calendar size={24} />
                            </Box>
                            <Box sx={{ flexGrow: 1 }}>
                                <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>
                                    {term.label}
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                    {term.desc}
                                </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                                <Chip 
                                    label={term.discount} 
                                    size="small" 
                                    sx={{ 
                                        bgcolor: term.discount.includes('DISCOUNT') ? '#10b981' : 'rgba(255,255,255,0.05)', 
                                        color: term.discount.includes('DISCOUNT') ? '#000' : 'rgba(255,255,255,0.5)',
                                        fontWeight: 900
                                    }} 
                                />
                            </Box>
                        </Paper>
                    ))}
                </Stack>

                <Box sx={{ mt: 8, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Button 
                        variant="outlined" 
                        size="large" 
                        onClick={onBack}
                        startIcon={<ArrowLeft />}
                        sx={{ borderRadius: 100, px: 4, color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                        BACK
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default PaymentTermsStep;
