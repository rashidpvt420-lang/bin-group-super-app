import React from 'react';
import { Button, IconButton, Stack, Tooltip, alpha } from '@mui/material';
import { Globe, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useLanguage } from '../context/LanguageContext';
import { auth } from '../lib/firebase';
import SafeIcon from './SafeIcon';

type PortalRole = 'owner' | 'tenant' | 'technician' | 'broker' | 'admin';

type PortalSessionControlsProps = {
  role: PortalRole;
  dark?: boolean;
  accent?: string;
  logoutRedirect?: string;
  compact?: boolean;
};

const preserveSafePreferences = () => {
  const preferredLanguage = localStorage.getItem('bin_language');
  const activeOnboarding = localStorage.getItem('bin-group-onboarding-v3');
  localStorage.clear();
  sessionStorage.clear();
  if (preferredLanguage) localStorage.setItem('bin_language', preferredLanguage);
  if (activeOnboarding) localStorage.setItem('bin-group-onboarding-v3', activeOnboarding);
};

export default function PortalSessionControls({
  role,
  dark = false,
  accent = '#B8932F',
  logoutRedirect,
  compact = false,
}: PortalSessionControlsProps) {
  const { lang, setLang, isRTL } = useLanguage();
  const nextLang = lang === 'en' ? 'ar' : 'en';
  const languageLabel = nextLang.toUpperCase();
  const logoutLabel = lang === 'ar' ? 'تسجيل الخروج' : 'Logout';
  const textColor = dark ? '#FFFFFF' : '#111827';
  const softBackground = dark ? alpha('#FFFFFF', 0.08) : '#FFFFFF';
  const borderColor = dark ? alpha('#FFFFFF', 0.18) : alpha(accent, 0.35);

  const handleLogout = async () => {
    try {
      preserveSafePreferences();
      await signOut(auth);
    } catch (error) {
      console.warn(`[${role}] Secure logout fallback triggered.`, error);
    } finally {
      window.location.replace(logoutRedirect || `/login?intendedRole=${role}&logout=1`);
    }
  };

  return (
    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
      <Button
        type="button"
        data-testid={`${role}-language-toggle`}
        aria-label={lang === 'ar' ? 'Switch language to English' : 'Switch language to Arabic'}
        onClick={() => setLang(nextLang)}
        startIcon={<SafeIcon icon={Globe} size={16} />}
        sx={{
          minWidth: compact ? 44 : 70,
          px: compact ? 1 : 1.5,
          borderRadius: 3,
          color: accent,
          bgcolor: softBackground,
          border: `1px solid ${borderColor}`,
          fontWeight: 950,
          textTransform: 'none',
          '& .MuiButton-startIcon': {
            mr: isRTL ? 0 : 0.6,
            ml: isRTL ? 0.6 : 0,
          },
          '&:hover': {
            bgcolor: dark ? alpha('#FFFFFF', 0.12) : alpha(accent, 0.08),
          },
        }}
      >
        {languageLabel}
      </Button>

      <Button
        type="button"
        data-testid={`${role}-logout`}
        aria-label={logoutLabel}
        onClick={handleLogout}
        startIcon={<SafeIcon icon={LogOut} size={16} />}
        sx={{
          display: { xs: 'none', sm: 'inline-flex' },
          color: '#EF4444',
          border: `1px solid ${alpha('#EF4444', 0.3)}`,
          borderRadius: 3,
          fontWeight: 950,
          bgcolor: alpha('#EF4444', dark ? 0.14 : 0.08),
          textTransform: 'none',
          '& .MuiButton-startIcon': {
            mr: isRTL ? 0 : 0.6,
            ml: isRTL ? 0.6 : 0,
          },
          '&:hover': { bgcolor: alpha('#EF4444', dark ? 0.20 : 0.14) },
        }}
      >
        {compact ? '' : logoutLabel}
      </Button>

      <Tooltip title={logoutLabel}>
        <IconButton
          type="button"
          data-testid={`${role}-logout-mobile`}
          aria-label={logoutLabel}
          onClick={handleLogout}
          sx={{
            display: { xs: 'inline-flex', sm: 'none' },
            color: '#EF4444',
            bgcolor: alpha('#EF4444', dark ? 0.14 : 0.08),
            border: `1px solid ${alpha('#EF4444', 0.3)}`,
            borderRadius: 3,
            width: 42,
            height: 42,
          }}
        >
          <SafeIcon icon={LogOut} size={18} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
