import React from 'react';
import { Box, Container, Typography, Paper, Grid } from '@mui/material';
import { Mail, Phone, MapPin } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';

const SupportPage: React.FC = () => {
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000', py: 8 }}>
            <Container maxWidth="md">
                <Paper sx={{ p: 6, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(198,167,94,0.1)', borderRadius: 4 }}>
                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 4 }}>BIN-GROUP Support</Typography>
                    
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 6 }}>
                        Authorized institutional users can contact our command center for technical assistance, asset registration support, or financial inquiries.
                    </Typography>

                    <Grid container spacing={4}>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.01)', borderRadius: 2, textAlign: 'center' }}>
                                <Mail size={32} color={binThemeTokens.gold} style={{ marginBottom: '16px' }} />
                                <Typography variant="h6" color="white" fontWeight="700">Email</Typography>
                                <Typography variant="body2" color="textSecondary">support@bin-group.ae</Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.01)', borderRadius: 2, textAlign: 'center' }}>
                                <Phone size={32} color={binThemeTokens.gold} style={{ marginBottom: '16px' }} />
                                <Typography variant="h6" color="white" fontWeight="700">Phone</Typography>
                                <Typography variant="body2" color="textSecondary">+971 4 000 0000</Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.01)', borderRadius: 2, textAlign: 'center' }}>
                                <MapPin size={32} color={binThemeTokens.gold} style={{ marginBottom: '16px' }} />
                                <Typography variant="h6" color="white" fontWeight="700">Office</Typography>
                                <Typography variant="body2" color="textSecondary">Business Bay, Dubai, UAE</Typography>
                            </Box>
                        </Grid>
                    </Grid>

                    <Box sx={{ mt: 8, pt: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="body2" color="textSecondary">
                            Hours: 9:00 AM - 6:00 PM (GST) | Monday - Friday
                        </Typography>
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
};

export default SupportPage;
