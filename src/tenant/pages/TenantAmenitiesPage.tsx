import React from 'react';
import { Box, Typography, Paper, Container, Grid, Button, alpha } from '@mui/material';
import { Dumbbell, CalendarRange, MapPin, Coffee, Waves } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TenantAmenitiesPage() {
    const { t } = useLanguage();

    const amenities = [
        { name: 'Fitness Center', icon: <Dumbbell size={24} />, status: 'Available', color: '#10b981' },
        { name: 'Community Pool', icon: <Waves size={24} />, status: 'Available', color: '#3b82f6' },
        { name: 'Resident Majlis', icon: <Coffee size={24} />, status: 'Requires Booking', color: binThemeTokens.gold },
    ];
    
    return (
        <Container maxWidth="lg" sx={{ py: 6 }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Dumbbell size={36} color={binThemeTokens.gold} /> Amenities
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>
                    Book community spaces and access resident amenities.
                </Typography>
            </Box>

            <Grid container spacing={4}>
                {amenities.map((item) => (
                    <Grid item xs={12} md={4} key={item.name}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                                <Box sx={{ p: 1.5, bgcolor: alpha(item.color, 0.1), color: item.color, borderRadius: 3 }}>
                                    {item.icon}
                                </Box>
                                <Typography variant="caption" sx={{ color: item.color, fontWeight: 900, px: 2, py: 0.5, bgcolor: alpha(item.color, 0.1), borderRadius: 2, height: 'fit-content' }}>
                                    {item.status.toUpperCase()}
                                </Typography>
                            </Box>
                            
                            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 1 }}>{item.name}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 0.5, mb: 3 }}>
                                <MapPin size={14} /> Ground Floor
                            </Typography>
                            
                            <Box sx={{ mt: 'auto' }}>
                                <Button fullWidth variant="outlined" startIcon={<CalendarRange size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 950, borderRadius: 3 }}>
                                    BOOK SLOT
                                </Button>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Container>
    );
}
