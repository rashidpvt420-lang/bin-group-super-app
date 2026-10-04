import { createTheme, alpha } from '@mui/material/styles';
import type { ThemeOptions } from '@mui/material/styles';

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
  /**
   * Gold for TEXT and icons on light surfaces. #C9A646 is 2.33:1 and #B8932F is 2.90:1 on white,
   * so they fail WCAG AA. Keep `gold` for fills, borders and accents, and use these for text.
   * goldText #7A5C12 = 6.24:1 on #FFFFFF, 5.92:1 on #F8F9FB, 5.11:1 on #F7E8B9.
   * goldTextHover #8A6D1F = 4.90:1 on #FFFFFF.
   * Do not use on dark surfaces (#7A5C12 on #020617 is 3.23:1); keep `gold` there.
   */
  goldText: '#7A5C12',
  goldTextHover: '#8A6D1F',
  champagne: '#F7E8B9',
  darkBlue: '#0F172A',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  // Status colours that pass WCAG AA as text on white (and with white text on them):
  // red 6.47:1, amber 7.09:1, green 5.48:1, blue 6.70:1. Were #EF4444 3.76:1 and #F59E0B 2.15:1.
  danger: '#B91C1C',
  warning: '#92400E',
  alert: '#92400E',
  success: '#047857',
  info: '#1D4ED8',
  active: '#C9A646',
  border: '#E5E7EB',
  panel: '#FFFFFF',
  tray: '#F8F9FB',
  watermarkOpacity: 0.04,
  cardShadow: '0 12px 32px rgba(17, 24, 39, 0.08)',
  cardShadowHover: '0 18px 45px rgba(17, 24, 39, 0.12)',
  goldGradient: 'linear-gradient(135deg, #C9A646, #E5E4E2)',
};

const themeConfig: ThemeOptions = {
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
    success: {
      main: binThemeTokens.success,
    },
    info: {
      main: binThemeTokens.info,
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
        textPrimary: {
          color: binThemeTokens.goldText,
          '&:hover': { color: binThemeTokens.goldTextHover },
        },
        outlinedPrimary: {
          borderColor: alpha(binThemeTokens.gold, 0.55),
          color: binThemeTokens.goldText,
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
          '& .MuiSvgIcon-root': { color: binThemeTokens.goldText },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: { color: binThemeTokens.goldText, '&:hover': { color: binThemeTokens.goldTextHover } },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { '&.Mui-selected': { color: binThemeTokens.goldText } },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: binThemeTokens.textSecondary,
          '&.Mui-focused': { color: binThemeTokens.goldText },
        },
      },
    },
  },
};

export const binGroupTheme = createTheme(themeConfig);
