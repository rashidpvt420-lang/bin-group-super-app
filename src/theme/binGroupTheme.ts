import { createTheme, alpha } from '@mui/material/styles';

/**
 * BIN-GROUP Sovereign Identity System (V1.18)
 * Theme: BLACK + GOLD
 * Usage: Ultra-Luxury, Sovereign Infrastructure, Institutional Assets.
 */

export const binThemeTokens = {
  black: '#0B0B0C',
  graphite: '#161618',
  gold: '#C6A75E',
  goldLight: '#E6C77A',
  champagne: '#F2E2B6',
  darkBlue: '#0F172A',
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textTertiary: '#71717A',
  danger: '#EF4444',
  warning: '#F59E0B',
  alert: '#F59E0B',
  active: '#C6A75E',
  border: 'rgba(198,167,94,0.15)',
  panel: 'rgba(22, 22, 24, 0.9)',
  tray: 'rgba(22, 22, 24, 0.6)',
  goldGradient: 'linear-gradient(135deg, #C6A75E, #E6C77A)'
};

export const binGroupTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: binThemeTokens.gold,
      light: binThemeTokens.goldLight,
      dark: '#b5934a',
    },
    background: {
      default: binThemeTokens.black,
      paper: binThemeTokens.graphite,
    },
    text: {
      primary: binThemeTokens.textPrimary,
      secondary: binThemeTokens.textSecondary,
    },
    divider: alpha(binThemeTokens.gold, 0.1),
  },
  typography: {
    fontFamily: "'Cairo', 'Inter', 'Outfit', sans-serif",
    h1: { fontWeight: 900, letterSpacing: '-0.02em', color: binThemeTokens.textPrimary },
    h2: { fontWeight: 900, letterSpacing: '-0.02em', color: binThemeTokens.textPrimary },
    h3: { fontWeight: 900, letterSpacing: '-0.01em', color: binThemeTokens.textPrimary },
    h4: { fontWeight: 900, color: binThemeTokens.textPrimary },
    h5: { fontWeight: 800, color: binThemeTokens.textPrimary },
    h6: { fontWeight: 700, color: binThemeTokens.textPrimary },
    subtitle1: { color: binThemeTokens.textSecondary },
    subtitle2: { color: binThemeTokens.textSecondary },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 900,
          padding: '12px 24px',
          transition: 'all 0.3s ease',
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${binThemeTokens.gold}, ${binThemeTokens.goldLight})`,
          color: binThemeTokens.black,
          '&:hover': {
            background: `linear-gradient(135deg, ${binThemeTokens.goldLight}, ${binThemeTokens.gold})`,
            boxShadow: `0 0 20px ${alpha(binThemeTokens.gold, 0.45)}`,
            transform: 'scale(1.02)'
          },
        },
        outlinedPrimary: {
          borderColor: binThemeTokens.gold,
          color: binThemeTokens.gold,
          '&:hover': {
            borderColor: binThemeTokens.goldLight,
            background: alpha(binThemeTokens.gold, 0.05),
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: binThemeTokens.graphite,
          border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: binThemeTokens.graphite,
          borderRadius: 16,
          border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`,
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: `0 10px 40px ${alpha(binThemeTokens.gold, 0.25)}`,
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-input': {
            color: '#FFFFFF',
            '&::placeholder': {
              color: 'rgba(255,255,255,0.45)',
              opacity: 1,
            },
          },
          '& .MuiInputLabel-root': {
            color: 'rgba(255,255,255,0.75)',
          },
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(255,255,255,0.04)',
            '& fieldset': {
              borderColor: 'rgba(198,167,94,0.15)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(198,167,94,0.35)',
            },
            '&.Mui-focused fieldset': {
              borderColor: binThemeTokens.gold,
            },
          },
          '& .MuiFormHelperText-root': {
            color: 'rgba(255,255,255,0.6)',
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          color: '#FFFFFF',
          backgroundColor: 'rgba(255,255,255,0.04)',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(198,167,94,0.15)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(198,167,94,0.35)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: binThemeTokens.gold,
          },
          '& .MuiSvgIcon-root': {
            color: binThemeTokens.gold,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: 'rgba(255,255,255,0.75)',
          '&.Mui-focused': {
            color: binThemeTokens.gold,
          },
        },
      },
    },
    MuiStepper: {
      styleOverrides: {
        root: {
          '& .MuiStepLabel-label': { color: 'rgba(255,255,255,0.45)', fontWeight: 700 },
          '& .MuiStepLabel-label.Mui-active': { color: binThemeTokens.gold },
          '& .MuiStepLabel-label.Mui-completed': { color: binThemeTokens.gold },
          '& .MuiStepIcon-root': { color: 'rgba(255,255,255,0.1)' },
          '& .MuiStepIcon-root.Mui-active': { color: binThemeTokens.gold },
          '& .MuiStepIcon-root.Mui-completed': { color: binThemeTokens.gold },
        }
      }
    }
  },
});
