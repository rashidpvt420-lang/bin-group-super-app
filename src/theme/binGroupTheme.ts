import { createTheme, alpha } from '@mui/material/styles';

/**
 * BIN GROUP Sovereign Identity System
 * Theme: WHITE + PLATINUM + GOLD
 * Usage: Institutional property operations, audited finance, transparent ownership.
 */
export const binThemeTokens = {
  black: '#111827',
  graphite: '#1F2937',
  canvas: '#FFFFFF',
  softCanvas: '#F8F9FB',
  card: '#FFFFFF',
  platinum: '#E5E4E2',
  platinumDark: '#BFC1C2',
  gold: '#C9A646',
  goldLight: '#E5C86B',
  goldHover: '#B8932F',
  champagne: '#F7E8B9',
  darkBlue: '#0F172A',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  danger: '#EF4444',
  warning: '#F59E0B',
  alert: '#F59E0B',
  active: '#C9A646',
  border: '#E5E7EB',
  panel: '#FFFFFF',
  tray: '#F8F9FB',
  watermarkOpacity: 0.04,
  cardShadow: '0 12px 32px rgba(17, 24, 39, 0.08)',
  cardShadowHover: '0 18px 45px rgba(17, 24, 39, 0.12)',
  goldGradient: 'linear-gradient(135deg, #C9A646, #E5E4E2)',
};

const themeConfig = {
  palette: {
    mode: 'light',
    primary: {
      main: binThemeTokens.gold,
      light: binThemeTokens.goldLight,
      dark: binThemeTokens.goldHover,
      contrastText: binThemeTokens.textPrimary,
    },
    secondary: {
      main: binThemeTokens.platinumDark,
      light: binThemeTokens.platinum,
      dark: '#9CA3AF',
      contrastText: binThemeTokens.textPrimary,
    },
    background: {
      default: binThemeTokens.canvas,
      paper: binThemeTokens.card,
    },
    text: {
      primary: binThemeTokens.textPrimary,
      secondary: binThemeTokens.textSecondary,
    },
    error: {
      main: binThemeTokens.danger,
    },
    warning: {
      main: binThemeTokens.warning,
    },
    divider: binThemeTokens.border,
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
    body1: { color: binThemeTokens.textPrimary },
    body2: { color: binThemeTokens.textSecondary },
  },
  shape: {
    borderRadius: 22,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { backgroundColor: binThemeTokens.canvas, colorScheme: 'light' },
        body: { backgroundColor: binThemeTokens.canvas, color: binThemeTokens.textPrimary },
        '#root': { backgroundColor: binThemeTokens.canvas, color: binThemeTokens.textPrimary, minHeight: '100%' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          textTransform: 'none',
          fontWeight: 900,
          padding: '12px 24px',
          transition: 'all 0.22s ease',
        },
        containedPrimary: {
          background: binThemeTokens.goldGradient,
          color: binThemeTokens.textPrimary,
          boxShadow: `0 10px 24px ${alpha(binThemeTokens.gold, 0.28)}`,
          '&:hover': {
            background: `linear-gradient(135deg, ${binThemeTokens.goldHover}, #F2F2F2)`,
            boxShadow: `0 14px 30px ${alpha(binThemeTokens.gold, 0.32)}`,
            transform: 'translateY(-1px)',
          },
        },
        outlinedPrimary: {
          borderColor: alpha(binThemeTokens.gold, 0.55),
          color: binThemeTokens.goldHover,
          '&:hover': { borderColor: binThemeTokens.gold, background: alpha(binThemeTokens.gold, 0.08) },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: binThemeTokens.card,
          border: `1px solid ${binThemeTokens.border}`,
          borderRadius: 22,
          boxShadow: binThemeTokens.cardShadow,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: binThemeTokens.card,
          borderRadius: 22,
          border: `1px solid ${binThemeTokens.border}`,
          boxShadow: binThemeTokens.cardShadow,
          transition: 'all 0.22s ease',
          '&:hover': { transform: 'translateY(-2px)', boxShadow: binThemeTokens.cardShadowHover },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(binThemeTokens.canvas, 0.92),
          color: binThemeTokens.textPrimary,
          borderBottom: `1px solid ${binThemeTokens.border}`,
          boxShadow: '0 8px 24px rgba(17, 24, 39, 0.06)',
          backdropFilter: 'blur(18px)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: binThemeTokens.canvas,
          color: binThemeTokens.textPrimary,
          borderRight: `1px solid ${binThemeTokens.border}`,
          boxShadow: '8px 0 28px rgba(17, 24, 39, 0.06)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-input': { color: binThemeTokens.textPrimary },
          '& .MuiInputLabel-root': { color: binThemeTokens.textSecondary },
          '& .MuiOutlinedInput-root': {
            backgroundColor: binThemeTokens.card,
            '& fieldset': { borderColor: binThemeTokens.border },
            '&:hover fieldset': { borderColor: alpha(binThemeTokens.gold, 0.45) },
            '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold },
          },
          '& .MuiFormHelperText-root': { color: binThemeTokens.textSecondary },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          color: binThemeTokens.textPrimary,
          backgroundColor: binThemeTokens.card,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: binThemeTokens.border },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(binThemeTokens.gold, 0.45) },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: binThemeTokens.gold },
          '& .MuiSvgIcon-root': { color: binThemeTokens.goldHover },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: binThemeTokens.textSecondary,
          '&.Mui-focused': { color: binThemeTokens.goldHover },
        },
      },
    },
  },
};

export const binGroupTheme = createTheme(themeConfig);
