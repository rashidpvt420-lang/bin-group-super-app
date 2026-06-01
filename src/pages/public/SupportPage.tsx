import React from 'react';
import { Box, Container, Typography, Paper, Grid } from '@mui/material';
import { Mail, Phone, MapPin } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { CeoContactButtons } from '@bin/shared';

const BIN_PUBLIC_CONTACT = {
    email: 'owner@bin-group.com',
    whatsapp: '+971 55 2423233',
    phone: '+971 55 7474560',
};

const SupportPage: React.FC = () => {
    const { t, isRTL } = useLanguage();

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000', py: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Container maxWidth="md">
                <Paper sx={{ p: 6, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(198,167,94,0.1)', borderRadius: 4 }}>
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

                    <Box sx={{ mt: 8, pt: 4, borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 4 }}>
                            Request a quote, schedule a demo, or contact support for active property operations.
                        </Typography>
                        <CeoContactButtons />
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
};

export default SupportPage;
