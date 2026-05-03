import React from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Button, Divider, Chip, Container 
} from '@mui/material';
import { ShieldCheck, MapPin, Building, Wrench, ArrowRight, ArrowLeft, Info } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';

const OnboardingReviewStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, selectedPlan, portfolioSummary } = useOnboardingStore();
    const { tx, isRTL } = useLanguage();

    const activeProperty = properties[0];

    const SummarySection = ({ icon, title, children }: { icon: React.ReactNode, title: string, children: React.ReactNode }) => (
        <Box sx={{ mb: 4 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                <Box sx={{ color: binThemeTokens.gold }}>{icon}</Box>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                    {title}
                </Typography>
            </Stack>
            <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                {children}
            </Paper>
        </Box>
    );

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.final_review', 'STRATEGIC SUMMARY')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.review_desc', 'Verify the operational parameters before commitment to the Sovereign Engine.')}
                </Typography>
            </Box>

            <Container maxWidth="md">
                <SummarySection icon={<Building size={20} />} title="ASSET SPECIFICATION">
                    <Grid container spacing={3}>
                        <Grid item xs={6} md={4}>
                            <Typography variant="caption" color="text.secondary">CATEGORY</Typography>
                            <Typography variant="body1" fontWeight="900">{activeProperty?.propertyType}</Typography>
                        </Grid>
                        <Grid item xs={6} md={4}>
                            <Typography variant="caption" color="text.secondary">QUALITY GRADE</Typography>
                            <Typography variant="body1" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{activeProperty?.assetGrade}</Typography>
                        </Grid>
                        <Grid item xs={6} md={4}>
                            <Typography variant="caption" color="text.secondary">UNITS / FLOORS</Typography>
                            <Typography variant="body1" fontWeight="900">{activeProperty?.units} / {activeProperty?.floors}</Typography>
                        </Grid>
                    </Grid>
                </SummarySection>

                <SummarySection icon={<MapPin size={20} />} title="LOCATION DATA">
                    <Typography variant="body1" fontWeight="700" sx={{ mb: 1 }}>{activeProperty?.address}</Typography>
                    <Typography variant="body2" color="text.secondary">{activeProperty?.area}, {activeProperty?.emirate}</Typography>
                </SummarySection>

                <SummarySection icon={<Wrench size={20} />} title="SERVICE PROTOCOL">
                    <Typography variant="h6" fontWeight="950" sx={{ mb: 1 }}>{selectedPlan?.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{selectedPlan?.desc}</Typography>
                    <Box sx={{ mt: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {selectedPlan?.features.map((f: string, i: number) => (
                            <Chip key={i} label={f} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }} />
                        ))}
                    </Box>
                </SummarySection>

                <Box sx={{ p: 4, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${binThemeTokens.gold}`, mb: 6 }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <ShieldCheck size={32} color={binThemeTokens.gold} />
                        <Box>
                            <Typography variant="h6" fontWeight="900">INSTITUTIONAL COMMITMENT</Typography>
                            <Typography variant="body2" color="text.secondary">By proceeding, you agree to the BIN GROUP Master Service Agreement and the UAE Sovereign Data Policy.</Typography>
                        </Box>
                    </Stack>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Button 
                        variant="outlined" 
                        size="large" 
                        onClick={onBack}
                        startIcon={<ArrowLeft />}
                        sx={{ borderRadius: 100, px: 4, color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                        BACK
                    </Button>
                    <Button 
                        variant="contained" 
                        size="large" 
                        onClick={onNext}
                        endIcon={<ArrowRight />}
                        sx={{ 
                            borderRadius: 100, px: 6, 
                            bgcolor: binThemeTokens.gold, color: '#000', 
                            fontWeight: 950,
                            '&:hover': { bgcolor: '#E6C77A' }
                        }}
                    >
                        INITIALIZE SUBMISSION
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default OnboardingReviewStep;
