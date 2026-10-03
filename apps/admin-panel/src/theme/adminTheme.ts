import { createTheme, alpha } from '@mui/material/styles';

/**
 * BIN-GROUP Admin theme — White + Platinum + Gold (readable light surfaces).
 * Standalone copy so CRA/CRACO does not import the root Vite TypeScript theme tree.
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
  goldGradient: 'linear-gradient(135deg, #C9A646, #E5C86B)',
};

export const adminTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: binThemeTokens.gold,
      light: binThemeTokens.goldLight,
      dark: binThemeTokens.goldHover,
      contrastText: binThemeTokens.black,
    },
    secondary: {
      main: binThemeTokens.platinumDark,
      light: binThemeTokens.platinum,
      dark: '#9CA3AF',
      contrastText: binThemeTokens.black,
    },
    background: {
      default: binThemeTokens.softCanvas,
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
    fontFamily: "'Inter', 'Outfit', 'Cairo', sans-serif",
    h1: { fontWeight: 900, letterSpacing: '-0.02em', color: binThemeTokens.textPrimary },
    h2: { fontWeight: 900, letterSpacing: '-0.02em', color: binThemeTokens.textPrimary },
    h3: { fontWeight: 900, letterSpacing: '-0.01em', color: binThemeTokens.textPrimary },
    h4: { fontWeight: 900, color: binThemeTokens.textPrimary },
    h5: { fontWeight: 800, color: binThemeTokens.textPrimary },
    h6: { fontWeight: 700, color: binThemeTokens.textPrimary },
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
          padding: '10px 20px',
        },
        containedPrimary: {
          background: binThemeTokens.goldGradient,
          color: binThemeTokens.black,
          '&:hover': {
            background: binThemeTokens.gold,
            boxShadow: `0 0 20px ${alpha(binThemeTokens.gold, 0.3)}`,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: binThemeTokens.card,
          border: `1px solid ${binThemeTokens.border}`,
          color: binThemeTokens.textPrimary,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: binThemeTokens.card,
          borderRight: `1px solid ${binThemeTokens.border}`,
          color: binThemeTokens.textPrimary,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 900,
          color: binThemeTokens.goldHover,
          borderBottom: `2px solid ${alpha(binThemeTokens.gold, 0.25)}`,
        },
        root: {
          borderBottom: `1px solid ${binThemeTokens.border}`,
          color: binThemeTokens.textPrimary,
        },
      },
    },
  },
});
