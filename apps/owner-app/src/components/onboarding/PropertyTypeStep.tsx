import React from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Divider 
} from '@mui/material';
import { 
    Home, Building2, Building, Hotel, Landmark, Gem, 
    Briefcase, Warehouse, School, ShieldCheck 
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const PropertyTypeStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
    const { properties, updateProperty, addProperty } = useOnboardingStore();
    const { tx, isRTL } = useLanguage();

    // Ensure we have at least one property to edit
    React.useEffect(() => {
        if (properties.length === 0) {
            addProperty();
        }
    }, [properties.length, addProperty]);

    const activeProperty = properties[0];

    const types = [
        { id: 'Villa', label: 'Villa', icon: <Home size={32} /> },
        { id: 'Apartment', label: 'Apartment', icon: <Building size={32} /> },
        { id: 'Residential Building', label: 'Residential Building', icon: <Building2 size={32} /> },
        { id: 'Office', label: 'Office', icon: <Briefcase size={32} /> },
        { id: 'Commercial Building', label: 'Commercial Building', icon: <Warehouse size={32} /> },
        { id: 'HOTEL', label: 'Hotel', icon: <Hotel size={32} />, premium: true },
        { id: 'GOVERNMENT_MAJLIS', label: 'Government Majlis', icon: <Landmark size={32} />, premium: true },
        { id: 'GOVERNMENT_PROPERTY', label: 'Government Property', icon: <ShieldCheck size={32} />, premium: true },
        { id: 'Mixed-Use Tower', label: 'Mixed-Use Tower', icon: <Gem size={32} />, premium: true },
    ];

    const handleSelect = (typeId: string) => {
        updateProperty(0, { 
            propertyType: typeId,
            majlis: typeId === 'GOVERNMENT_MAJLIS',
            majlisType: typeId === 'GOVERNMENT_MAJLIS' ? 'government' : 'none'
        });
        onNext();
    };

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.select_type', 'SELECT PROPERTY CATEGORY')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.select_type_desc', 'Identify the asset class to initialize specialized operational protocols.')}
                </Typography>
            </Box>

            <Grid container spacing={3}>
                {types.map((type) => (
                    <Grid item xs={12} sm={6} md={4} key={type.id}>
                        <Paper 
                            onClick={() => handleSelect(type.id)}
                            sx={{ 
                                p: 4, 
                                cursor: 'pointer',
                                bgcolor: activeProperty?.propertyType === type.id ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${activeProperty?.propertyType === type.id ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`,
                                borderRadius: 4,
                                transition: 'all 0.3s ease',
                                textAlign: 'center',
                                position: 'relative',
                                overflow: 'hidden',
                                '&:hover': {
                                    borderColor: binThemeTokens.gold,
                                    transform: 'translateY(-5px)',
                                    bgcolor: 'rgba(198, 167, 94, 0.05)'
                                }
                            }}
                        >
                            {type.premium && (
                                <Box sx={{ 
                                    position: 'absolute', top: 12, right: -25, 
                                    bgcolor: binThemeTokens.gold, color: '#000',
                                    px: 4, py: 0.5, transform: 'rotate(45deg)',
                                    fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1
                                }}>
                                    PREMIUM
                                </Box>
                            )}
                            <Box sx={{ 
                                color: activeProperty?.propertyType === type.id ? binThemeTokens.gold : 'rgba(255,255,255,0.3)',
                                mb: 2, display: 'flex', justifyContent: 'center'
                            }}>
                                {type.icon}
                            </Box>
                            <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>
                                {type.label}
                            </Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Box sx={{ mt: 8, textAlign: 'center' }}>
                <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.05)' }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', letterSpacing: 2, fontWeight: 700 }}>
                    Sovereign-Grade Asset Identification Protocol
                </Typography>
            </Box>
        </Box>
    );
};

export default PropertyTypeStep;
