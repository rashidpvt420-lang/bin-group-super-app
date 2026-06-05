import { createTheme, alpha } from '@mui/material/styles';

/**
 * BIN-GROUP Sovereign Identity System
 * Admin Panel Optimized - White Platinum + Institutional Gold
 */
export const binThemeTokens = {
  black: '#111827',
  graphite: '#F3F4F6',
  canvas: '#FFFFFF',
  softCanvas: '#F8F9FB',
  card: '#FFFFFF',
  gold: '#C6A75E',
  goldLight: '#E6C77A',
  champagne: '#F2E2B6',
  darkBlue: '#0F172A',
  textPrimary: '#111827',
  textSecondary: '#667085',
  textTertiary: '#98A2B3',
  danger: '#EF4444',
  warning: '#F59E0B',
  active: '#C6A75E',
  border: '#E5E7EB',
  panel: '#FFFFFF',
  tray: '#F8F9FB',
  cardShadow: '0 14px 38px rgba(17, 24, 39, 0.08)',
  goldGradient: 'linear-gradient(135deg, #C6A75E, #E6C77A)'
};

export const adminTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: binThemeTokens.gold,
      light: binThemeTokens.goldLight,
      dark: '#b5934a',
      contrastText: binThemeTokens.black,
    },
    background: {
      default: binThemeTokens.canvas,
      paper: binThemeTokens.card,
    },
    text: {
      primary: binThemeTokens.textPrimary,
      secondary: binThemeTokens.textSecondary,
    },
    divider: binThemeTokens.border,
  },
  typography: {
    fontFamily: "'Inter', 'Outfit', 'Cairo', sans-serif",
    h1: { fontWeight: 900, letterSpacing: '-0.02em' },
    h2: { fontWeight: 900, letterSpacing: '-0.02em' },
    h3: { fontWeight: 900, letterSpacing: '-0.01em' },
    h4: { fontWeight: 900 },
    h5: { fontWeight: 800 },
    h6: { fontWeight: 700 },
  },
  shape: {
    borderRadius: 18,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          textTransform: 'none',
          fontWeight: 900,
          padding: '10px 20px',
        },
        containedPrimary: {
          background: binThemeTokens.goldGradient,
          color: binThemeTokens.black,
          boxShadow: `0 12px 24px ${alpha(binThemeTokens.gold, 0.24)}`,
          '&:hover': {
            background: binThemeTokens.gold,
            boxShadow: `0 16px 32px ${alpha(binThemeTokens.gold, 0.28)}`,
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
          boxShadow: binThemeTokens.cardShadow,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: binThemeTokens.canvas,
          borderRight: `1px solid ${binThemeTokens.border}`,
          boxShadow: '8px 0 30px rgba(17, 24, 39, 0.06)',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 900,
          color: '#9A7A24',
          borderBottom: `2px solid ${alpha(binThemeTokens.gold, 0.22)}`,
        },
        root: {
          borderBottom: `1px solid ${binThemeTokens.border}`,
          color: binThemeTokens.textPrimary,
        },
      },
    },
  },
});
