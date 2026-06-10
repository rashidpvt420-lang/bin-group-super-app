import { createTheme, alpha } from '@mui/material/styles';

/**
 * BIN-GROUP Sovereign Identity System (V1.18)
 * Standalone Admin Panel Theme
 *
 * This file intentionally does not import from ../../../../src/theme/binGroupTheme.
 * The CRA/CRACO standalone admin build cannot safely parse TypeScript-only syntax
 * from the root Vite app source tree through source-map-loader.
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
  textPrimary: '#FFFFFF',
  textSecondary: '#CBD5E1',
  textTertiary: '#94A3B8',
  danger: '#EF4444',
  warning: '#F59E0B',
  alert: '#F59E0B',
  active: '#C9A646',
  border: '#334155',
  panel: '#0F172A',
  tray: '#020617',
  watermarkOpacity: 0.04,
  cardShadow: '0 12px 32px rgba(0, 0, 0, 0.32)',
  cardShadowHover: '0 18px 45px rgba(0, 0, 0, 0.42)',
  goldGradient: 'linear-gradient(135deg, #C9A646, #E5C86B)',
};

export const adminTheme = createTheme({
  palette: {
    mode: 'dark',
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
      default: binThemeTokens.tray,
      paper: binThemeTokens.panel,
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
    divider: alpha(binThemeTokens.gold, 0.12),
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
          backgroundColor: binThemeTokens.panel,
          border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: binThemeTokens.tray,
          borderRight: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 900,
          color: binThemeTokens.gold,
          borderBottom: `2px solid ${alpha(binThemeTokens.gold, 0.2)}`,
        },
        root: {
          borderBottom: `1px solid ${alpha(binThemeTokens.gold, 0.08)}`,
        },
      },
    },
  },
});
