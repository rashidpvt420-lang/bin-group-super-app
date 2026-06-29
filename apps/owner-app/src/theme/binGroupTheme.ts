import { alpha, createTheme } from '@mui/material/styles';

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

export const binGroupTheme = createTheme({
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
    h1: { fontWeight: 900, color: binThemeTokens.textPrimary },
    h2: { fontWeight: 900, color: binThemeTokens.textPrimary },
    h3: { fontWeight: 900, color: binThemeTokens.textPrimary },
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
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          textTransform: 'none',
          fontWeight: 900,
          padding: '12px 24px',
        },
        containedPrimary: {
          background: binThemeTokens.goldGradient,
          color: binThemeTokens.textPrimary,
          boxShadow: `0 10px 24px ${alpha(binThemeTokens.gold, 0.28)}`,
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
  },
});

export default binGroupTheme;
