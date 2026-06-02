import React from 'react';
import { Box, Button, Container, Typography, Paper, Grid, Stack } from '@mui/material';
import { Mail, Phone, MapPin, MessageCircle } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';

const BIN_PUBLIC_CONTACT = {
    email: 'owner@bin-group.com',
    whatsapp: '+971 55 2423233',
    phone: '+971 55 7474560',
};

const SupportPage: React.FC = () => {
    const { isRTL } = useLanguage();

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000', py: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Container maxWidth="md">
                <Paper sx={{ p: { xs: 3, md: 6 }, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(198,167,94,0.1)', borderRadius: 4 }}>
                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
                        Contact BIN GROUP
                    </Typography>

                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 6, textAlign: isRTL ? 'right' : 'left' }}>
                        Secure communication channel for owners, tenants, brokers, technicians, and property partners.
                    </Typography>

                    <Grid container spacing={4} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.01)', borderRadius: 2, textAlign: 'center' }}>
                                <Mail size={32} color={binThemeTokens.gold} style={{ marginBottom: '16px' }} />
                                <Typography variant="h6" color="white" fontWeight="700">Email</Typography>
                                <Typography variant="body2" color="textSecondary">{BIN_PUBLIC_CONTACT.email}</Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.01)', borderRadius: 2, textAlign: 'center' }}>
                                <Phone size={32} color={binThemeTokens.gold} style={{ marginBottom: '16px' }} />
                                <Typography variant="h6" color="white" fontWeight="700">WhatsApp</Typography>
                                <Typography variant="body2" color="textSecondary">{BIN_PUBLIC_CONTACT.whatsapp}</Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.01)', borderRadius: 2, textAlign: 'center' }}>
                                <MapPin size={32} color={binThemeTokens.gold} style={{ marginBottom: '16px' }} />
                                <Typography variant="h6" color="white" fontWeight="700">Phone</Typography>
                                <Typography variant="body2" color="textSecondary">{BIN_PUBLIC_CONTACT.phone}</Typography>
                            </Box>
                        </Grid>
                    </Grid>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 6, justifyContent: 'center' }}>
                        <Button component="a" href="/onboarding" variant="contained" startIcon={<MessageCircle size={17} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                            Request Support
                        </Button>
                        <Button component="a" href="/request-demo" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>
                            Schedule Demo
                        </Button>
                    </Stack>
                </Paper>
            </Container>
        </Box>
    );
};

export default SupportPage;
