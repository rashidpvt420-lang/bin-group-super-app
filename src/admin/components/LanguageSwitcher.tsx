import React from 'react';
import { Button } from '@mui/material';
import { useLanguage } from '../../context/LanguageContext';
import LanguageIcon from '@mui/icons-material/Language';

export const LanguageSwitcher: React.FC = () => {
    const { lang, setLang } = useLanguage();

    const toggleLanguage = () => {
        setLang(lang === 'en' ? 'ar' : 'en');
    };

    return (
        <Button
            onClick={toggleLanguage}
            startIcon={<LanguageIcon sx={{ fontSize: 18 }} />}
            sx={{
                color: '#DAA520',
                fontWeight: 900,
                border: '1px solid rgba(198,167,94,0.3)',
                borderRadius: 2,
                px: 2,
                textTransform: 'none',
                minWidth: '120px',
                '&:hover': {
                    bgcolor: 'rgba(198,167,94,0.1)',
                    borderColor: '#DAA520'
                }
            }}
        >
            {lang === 'en' ? 'العربية' : 'English'}
        </Button>
    );
};
