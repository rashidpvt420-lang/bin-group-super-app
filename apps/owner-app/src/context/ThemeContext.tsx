import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { ThemeProvider as MuiThemeProvider, createTheme, alpha } from "@mui/material/styles";
import { binThemeTokens } from "../theme/binGroupTheme";

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
    mode: ThemeMode;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

import { useLanguage } from "./LanguageContext";

export function CustomThemeProvider({ children }: { children: ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>(() => {
        return (localStorage.getItem('app_theme') as ThemeMode) || 'dark';
    });

    const toggleTheme = () => {
        const newMode = mode === 'dark' ? 'light' : 'dark';
        setMode(newMode);
        localStorage.setItem('app_theme', newMode);
    };

    const { isRTL } = useLanguage();

    const theme = React.useMemo(() => createTheme({
        direction: isRTL ? 'rtl' : 'ltr',
        palette: {
            mode,
            primary: {
                main: binThemeTokens.gold,
                light: binThemeTokens.goldLight,
            },
            background: {
                default: mode === 'dark' ? binThemeTokens.black : '#F8FAFC',
                paper: mode === 'dark' ? binThemeTokens.graphite : '#FFFFFF',
            },
            text: {
                primary: mode === 'dark' ? '#FFFFFF' : '#0F172A',
                secondary: mode === 'dark' ? '#A1A1AA' : '#64748B',
            },
            divider: alpha(binThemeTokens.gold, 0.1),
        },
        typography: {
            fontFamily: "'Cairo', 'Inter', 'Outfit', sans-serif",
            h1: { fontWeight: 900 },
            h2: { fontWeight: 900 },
            h3: { fontWeight: 900 },
            h4: { fontWeight: 900 },
        },
        shape: { borderRadius: 12 },
        components: {
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        border: `1px solid ${mode === 'dark' ? alpha(binThemeTokens.gold, 0.15) : '#E2E8F0'}`,
                        boxShadow: mode === 'light' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                    },
                },
            },
            MuiButton: {
                styleOverrides: {
                    root: {
                        borderRadius: 12,
                        textTransform: 'none',
                        fontWeight: 900,
                        padding: '12px 24px',
                    },
                    containedPrimary: {
                        background: `linear-gradient(135deg, ${binThemeTokens.gold}, ${binThemeTokens.goldLight})`,
                        color: mode === 'dark' ? binThemeTokens.black : '#000000',
                    },
                },
            },
            MuiTextField: {
                styleOverrides: {
                    root: {
                        '& .MuiOutlinedInput-root': {
                            backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                            '& fieldset': {
                                borderColor: mode === 'dark' ? 'rgba(198,167,94,0.15)' : '#CBD5E1',
                            },
                        },
                        '& .MuiInputBase-input': {
                            color: mode === 'dark' ? '#FFFFFF' : '#0F172A',
                        },
                        '& .MuiInputLabel-root': {
                            color: mode === 'dark' ? 'rgba(255,255,255,0.75)' : '#475569',
                        },
                    },
                },
            },
        },
    }), [mode]);

    return (
        <ThemeContext.Provider value={{ mode, toggleTheme }}>
            <MuiThemeProvider theme={theme}>
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
}

export function useCustomTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error("useCustomTheme must be used within a CustomThemeProvider");
    }
    return context;
}
