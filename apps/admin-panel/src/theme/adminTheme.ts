import { createTheme, alpha } from '@mui/material/styles';

/**
 * BIN-GROUP Sovereign Identity System (V1.18)
 * Admin Panel Optimized - Dark Mode + Institutional Gold
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
  active: '#C6A75E',
  border: 'rgba(198,167,94,0.15)',
  panel: 'rgba(22, 22, 24, 0.9)',
  tray: 'rgba(22, 22, 24, 0.6)',
  goldGradient: 'linear-gradient(135deg, #C6A75E, #E6C77A)'
};

export const adminTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: binThemeTokens.gold,
      light: binThemeTokens.goldLight,
      dark: '#b5934a',
    },
    background: {
      default: '#020617', // Darker navy for admin hierarchy
      paper: binThemeTokens.graphite,
    },
    text: {
      primary: binThemeTokens.textPrimary,
      secondary: binThemeTokens.textSecondary,
    },
    divider: alpha(binThemeTokens.gold, 0.1),
  },
  typography: {
    fontFamily: "'Inter', 'Outfit', sans-serif",
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
          backgroundColor: binThemeTokens.graphite,
          border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#020617',
          borderRight: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
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
          borderBottom: `1px solid ${alpha(binThemeTokens.gold, 0.05)}`,
        },
      },
    },
  },
});
