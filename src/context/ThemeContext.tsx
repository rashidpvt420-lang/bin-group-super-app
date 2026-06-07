import React, { createContext, useContext, type ReactNode } from "react";
import { ThemeProvider as MuiThemeProvider, createTheme } from "@mui/material/styles";
import { binGroupTheme, binThemeTokens } from "../theme/binGroupTheme";
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

    const toggleTheme = React.useCallback(() => {
        localStorage.setItem('app_theme', SOVEREIGN_LIGHT_MODE);
        document.documentElement.setAttribute('data-bin-theme', SOVEREIGN_LIGHT_MODE);
        document.documentElement.style.colorScheme = SOVEREIGN_LIGHT_MODE;
    }, []);

    const theme = React.useMemo(() => createTheme(binGroupTheme, {
        direction: isRTL ? 'rtl' : 'ltr',
    }), [isRTL]);

    const value = React.useMemo<ThemeContextType>(() => ({
        mode: SOVEREIGN_LIGHT_MODE,
        toggleTheme,
    }), [toggleTheme]);

    return (
        <ThemeContext.Provider value={value}>
            <CacheProvider value={isRTL ? cacheRtl : cacheLtr}>
                <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
            </CacheProvider>
        </ThemeContext.Provider>
    );
}

export function useCustomTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) throw new Error("useCustomTheme must be used within a CustomThemeProvider");
    return context;
}
