import React, { createContext, useContext, type ReactNode } from "react";
import { ThemeProvider as MuiThemeProvider, createTheme, alpha } from "@mui/material/styles";
import { binThemeTokens } from "../theme/binGroupTheme";
import { useLanguage } from "./LanguageContext";
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

const safeRtlPlugin = (rtlPlugin as any).default || rtlPlugin;
const cacheRtl = createCache({ key: 'muirtl', stylisPlugins: [prefixer, safeRtlPlugin] });
const cacheLtr = createCache({ key: 'muiltr' });

type ThemeMode = 'light' | 'dark';
interface ThemeContextType { mode: ThemeMode; toggleTheme: () => void; }

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const SOVEREIGN_LIGHT_MODE: ThemeMode = 'light';

export function CustomThemeProvider({ children }: { children: ReactNode }) {
    const { isRTL } = useLanguage();

    React.useEffect(() => {
        localStorage.setItem('app_theme', SOVEREIGN_LIGHT_MODE);
        document.documentElement.setAttribute('data-bin-theme', SOVEREIGN_LIGHT_MODE);
        document.documentElement.style.colorScheme = SOVEREIGN_LIGHT_MODE;
        document.body.style.backgroundColor = binThemeTokens.canvas;
        document.body.style.color = binThemeTokens.textPrimary;
    }, []);

    const toggleTheme = () => {
        localStorage.setItem('app_theme', SOVEREIGN_LIGHT_MODE);
        document.documentElement.setAttribute('data-bin-theme', SOVEREIGN_LIGHT_MODE);
        document.documentElement.style.colorScheme = SOVEREIGN_LIGHT_MODE;
    };

    const theme = React.useMemo(() => createTheme({
        direction: isRTL ? 'rtl' : 'ltr',
        palette: {
            mode: SOVEREIGN_LIGHT_MODE,
            primary: { main: binThemeTokens.gold, light: binThemeTokens.goldLight, dark: binThemeTokens.goldHover, contrastText: binThemeTokens.textPrimary },
            secondary: { main: binThemeTokens.platinumDark, light: binThemeTokens.platinum, dark: '#9CA3AF', contrastText: binThemeTokens.textPrimary },
            background: { default: binThemeTokens.canvas, paper: binThemeTokens.card },
            text: { primary: binThemeTokens.textPrimary, secondary: binThemeTokens.textSecondary },
            divider: binThemeTokens.border,
        },
        typography: { fontFamily: "'Cairo', 'Inter', 'Outfit', sans-serif", h1: { fontWeight: 900 }, h2: { fontWeight: 900 }, h3: { fontWeight: 900 }, h4: { fontWeight: 900 }, h5: { fontWeight: 900 }, h6: { fontWeight: 900 } },
        shape: { borderRadius: 22 },
        components: {
            MuiCssBaseline: { styleOverrides: { html: { backgroundColor: binThemeTokens.canvas, colorScheme: SOVEREIGN_LIGHT_MODE }, body: { backgroundColor: binThemeTokens.canvas, color: binThemeTokens.textPrimary }, '#root': { backgroundColor: binThemeTokens.canvas, color: binThemeTokens.textPrimary, minHeight: '100%' } } },
            MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', backgroundColor: binThemeTokens.card, border: `1px solid ${binThemeTokens.border}`, borderRadius: 22, boxShadow: binThemeTokens.cardShadow } } },
            MuiCard: { styleOverrides: { root: { backgroundImage: 'none', backgroundColor: binThemeTokens.card, border: `1px solid ${binThemeTokens.border}`, borderRadius: 22, boxShadow: binThemeTokens.cardShadow, transition: 'all 0.22s ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: binThemeTokens.cardShadowHover } } } },
            MuiAppBar: { styleOverrides: { root: { backgroundColor: alpha(binThemeTokens.canvas, 0.94), color: binThemeTokens.textPrimary, borderBottom: `1px solid ${binThemeTokens.border}`, boxShadow: '0 8px 24px rgba(17, 24, 39, 0.06)', backdropFilter: 'blur(18px)' } } },
            MuiDrawer: { styleOverrides: { paper: { backgroundColor: binThemeTokens.canvas, color: binThemeTokens.textPrimary, borderRight: `1px solid ${binThemeTokens.border}`, boxShadow: '8px 0 28px rgba(17, 24, 39, 0.06)' } } },
            MuiButton: { styleOverrides: { root: { borderRadius: 14, textTransform: 'none', fontWeight: 900, padding: '12px 24px', transition: 'all 0.22s ease' }, containedPrimary: { background: binThemeTokens.goldGradient, color: binThemeTokens.textPrimary, boxShadow: `0 10px 24px ${alpha(binThemeTokens.gold, 0.28)}` }, outlinedPrimary: { borderColor: alpha(binThemeTokens.gold, 0.55), color: binThemeTokens.goldHover } } },
            MuiTextField: { styleOverrides: { root: { '& .MuiOutlinedInput-root': { backgroundColor: binThemeTokens.card, borderRadius: 16, '& fieldset': { borderColor: binThemeTokens.border }, '&:hover fieldset': { borderColor: alpha(binThemeTokens.gold, 0.45) }, '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold, boxShadow: `0 0 0 3px ${alpha(binThemeTokens.gold, 0.12)}` } }, '& .MuiInputBase-input': { color: binThemeTokens.textPrimary }, '& .MuiInputLabel-root': { color: binThemeTokens.textSecondary } } } },
            MuiSelect: { styleOverrides: { root: { color: binThemeTokens.textPrimary, backgroundColor: binThemeTokens.card, borderRadius: 16, '& .MuiOutlinedInput-notchedOutline': { borderColor: binThemeTokens.border }, '& .MuiSvgIcon-root': { color: binThemeTokens.goldHover } } } },
        },
    }), [isRTL]);

    return <ThemeContext.Provider value={{ mode: SOVEREIGN_LIGHT_MODE, toggleTheme }}><CacheProvider value={isRTL ? cacheRtl : cacheLtr}><MuiThemeProvider theme={theme}>{children}</MuiThemeProvider></CacheProvider></ThemeContext.Provider>;
}

export function useCustomTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) throw new Error("useCustomTheme must be used within a CustomThemeProvider");
    return context;
}

