import React from 'react';
import { 
    Box, Typography, Grid, Paper, TextField, Button, Stack, Container, Divider
} from '@mui/material';
import { Building2, User, Phone, Mail, FileText, ArrowRight } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';

const CompanyProfileStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
    const { companyProfile, updateCompanyProfile } = useOnboardingStore();

    const canProceed = companyProfile.name && companyProfile.email && companyProfile.phone;

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    COMPANY PROFILE
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Establish your institutional identity within the BIN GROUP Sovereign OS.
                </Typography>
            </Box>

            <Container maxWidth="md">
                <Paper sx={{ p: 6, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack spacing={4}>
                        <TextField
                            fullWidth label="Company / Entity Name"
                            value={companyProfile.name}
                            onChange={(e) => updateCompanyProfile({ name: e.target.value })}
                            InputProps={{ startAdornment: <Building2 size={20} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }}
                        />
                        <TextField
                            fullWidth label="Trade License Number (Optional)"
                            value={companyProfile.licenseNumber}
                            onChange={(e) => updateCompanyProfile({ licenseNumber: e.target.value })}
                            InputProps={{ startAdornment: <FileText size={20} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }}
                        />
                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>PRIMARY CONTACT</Typography>
                        <TextField
                            fullWidth label="Contact Person Name"
                            value={companyProfile.contactPerson}
                            onChange={(e) => updateCompanyProfile({ contactPerson: e.target.value })}
                            InputProps={{ startAdornment: <User size={20} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }}
                        />
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth label="Contact Phone"
                                    value={companyProfile.phone}
                                    onChange={(e) => updateCompanyProfile({ phone: e.target.value })}
                                    InputProps={{ startAdornment: <Phone size={20} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth label="Contact Email"
                                    value={companyProfile.email}
                                    onChange={(e) => updateCompanyProfile({ email: e.target.value })}
                                    InputProps={{ startAdornment: <Mail size={20} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }}
                                />
                            </Grid>
                        </Grid>

                        <Button 
                            variant="contained" fullWidth size="large" 
                            onClick={onNext} disabled={!canProceed}
                            endIcon={<ArrowRight />}
                            sx={{ mt: 2, py: 2, borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                        >
                            ONBOARD YOUR PROPERTY
                        </Button>
                    </Stack>
                </Paper>
            </Container>
        </Box>
    );
};

export default CompanyProfileStep;
