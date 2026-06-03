import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { ThemeProvider as MuiThemeProvider, createTheme, alpha } from "@mui/material/styles";
import { binThemeTokens } from "../theme/binGroupTheme";
import { useLanguage } from "./LanguageContext";
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

// Create rtl cache
const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
});

const cacheLtr = createCache({
  key: 'muiltr',
});

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
    mode: ThemeMode;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function CustomThemeProvider({ children }: { children: ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>(() => {
        const stored = localStorage.getItem('app_theme') as ThemeMode | null;
        return stored === 'dark' ? 'dark' : 'light';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-bin-theme', mode);
        document.documentElement.style.colorScheme = mode;
    }, [mode]);

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
                default: mode === 'dark' ? '#111827' : binThemeTokens.canvas,
                paper: mode === 'dark' ? '#1F2937' : binThemeTokens.card,
            },
            text: {
                primary: mode === 'dark' ? '#F9FAFB' : binThemeTokens.textPrimary,
                secondary: mode === 'dark' ? '#D1D5DB' : binThemeTokens.textSecondary,
            },
            divider: mode === 'dark' ? alpha(binThemeTokens.gold, 0.18) : binThemeTokens.border,
        },
        typography: {
            fontFamily: "'Cairo', 'Inter', 'Outfit', sans-serif",
            h1: { fontWeight: 900 },
            h2: { fontWeight: 900 },
            h3: { fontWeight: 900 },
            h4: { fontWeight: 900 },
            h5: { fontWeight: 900 },
            h6: { fontWeight: 900 },
        },
        shape: { borderRadius: 22 },
        components: {
            MuiCssBaseline: {
                styleOverrides: {
                    html: {
                        backgroundColor: mode === 'dark' ? '#111827' : binThemeTokens.canvas,
                        colorScheme: mode,
                    },
                    body: {
                        backgroundColor: mode === 'dark' ? '#111827' : binThemeTokens.canvas,
                        color: mode === 'dark' ? '#F9FAFB' : binThemeTokens.textPrimary,
                    },
                    '#root': {
                        backgroundColor: mode === 'dark' ? '#111827' : binThemeTokens.canvas,
                        color: mode === 'dark' ? '#F9FAFB' : binThemeTokens.textPrimary,
                        minHeight: '100%',
                    },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        backgroundColor: mode === 'dark' ? '#1F2937' : binThemeTokens.card,
                        border: `1px solid ${mode === 'dark' ? alpha(binThemeTokens.gold, 0.18) : binThemeTokens.border}`,
                        borderRadius: 22,
                        boxShadow: mode === 'dark' ? '0 12px 32px rgba(0,0,0,0.24)' : binThemeTokens.cardShadow,
                    },
                },
            },
            MuiCard: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        backgroundColor: mode === 'dark' ? '#1F2937' : binThemeTokens.card,
                        border: `1px solid ${mode === 'dark' ? alpha(binThemeTokens.gold, 0.2) : binThemeTokens.border}`,
                        borderRadius: 22,
                        boxShadow: mode === 'dark' ? '0 12px 32px rgba(0,0,0,0.24)' : binThemeTokens.cardShadow,
                        transition: 'all 0.22s ease',
                        '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: mode === 'dark' ? `0 18px 45px ${alpha(binThemeTokens.gold, 0.16)}` : binThemeTokens.cardShadowHover,
                        },
                    },
                },
            },
            MuiAppBar: {
                styleOverrides: {
                    root: {
                        backgroundColor: mode === 'dark' ? alpha('#111827', 0.92) : alpha(binThemeTokens.canvas, 0.92),
                        color: mode === 'dark' ? '#F9FAFB' : binThemeTokens.textPrimary,
                        borderBottom: `1px solid ${mode === 'dark' ? alpha(binThemeTokens.gold, 0.18) : binThemeTokens.border}`,
                        boxShadow: mode === 'dark' ? '0 8px 24px rgba(0,0,0,0.26)' : '0 8px 24px rgba(17, 24, 39, 0.06)',
                        backdropFilter: 'blur(18px)',
                    },
                },
            },
            MuiDrawer: {
                styleOverrides: {
                    paper: {
                        backgroundColor: mode === 'dark' ? '#111827' : binThemeTokens.canvas,
                        color: mode === 'dark' ? '#F9FAFB' : binThemeTokens.textPrimary,
                        borderRight: `1px solid ${mode === 'dark' ? alpha(binThemeTokens.gold, 0.18) : binThemeTokens.border}`,
                        boxShadow: mode === 'dark' ? '8px 0 28px rgba(0,0,0,0.26)' : '8px 0 28px rgba(17, 24, 39, 0.06)',
                    },
                },
            },
            MuiButton: {
                styleOverrides: {
                    root: {
                        borderRadius: 999,
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
                        color: mode === 'dark' ? binThemeTokens.goldLight : binThemeTokens.goldHover,
                        '&:hover': {
                            borderColor: binThemeTokens.gold,
                            background: alpha(binThemeTokens.gold, 0.08),
                        },
                    },
                },
            },
            MuiTextField: {
                styleOverrides: {
                    root: {
                        '& .MuiOutlinedInput-root': {
                            backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : binThemeTokens.card,
                            borderRadius: 16,
                            '& fieldset': {
                                borderColor: mode === 'dark' ? alpha(binThemeTokens.gold, 0.18) : binThemeTokens.border,
                            },
                            '&:hover fieldset': {
                                borderColor: alpha(binThemeTokens.gold, 0.45),
                            },
                            '&.Mui-focused fieldset': {
                                borderColor: binThemeTokens.gold,
                                boxShadow: `0 0 0 3px ${alpha(binThemeTokens.gold, 0.12)}`,
                            },
                        },
                        '& .MuiInputBase-input': {
                            color: mode === 'dark' ? '#F9FAFB' : binThemeTokens.textPrimary,
                        },
                        '& .MuiInputLabel-root': {
                            color: mode === 'dark' ? '#D1D5DB' : binThemeTokens.textSecondary,
                        },
                    },
                },
            },
            MuiSelect: {
                styleOverrides: {
                    root: {
                        color: mode === 'dark' ? '#F9FAFB' : binThemeTokens.textPrimary,
                        backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : binThemeTokens.card,
                        borderRadius: 16,
                        '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: mode === 'dark' ? alpha(binThemeTokens.gold, 0.18) : binThemeTokens.border,
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                            borderColor: alpha(binThemeTokens.gold, 0.45),
                        },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            borderColor: binThemeTokens.gold,
                        },
                        '& .MuiSvgIcon-root': {
                            color: mode === 'dark' ? binThemeTokens.goldLight : binThemeTokens.goldHover,
                        },
                    },
                },
            },
            MuiInputLabel: {
                styleOverrides: {
                    root: {
                        color: mode === 'dark' ? '#D1D5DB' : binThemeTokens.textSecondary,
                        '&.Mui-focused': {
                            color: mode === 'dark' ? binThemeTokens.goldLight : binThemeTokens.goldHover,
                        },
                    },
                },
            },
            MuiStepper: {
                styleOverrides: {
                    root: {
                        '& .MuiStepLabel-label': { color: mode === 'dark' ? '#9CA3AF' : binThemeTokens.textTertiary, fontWeight: 700 },
                        '& .MuiStepLabel-label.Mui-active': { color: mode === 'dark' ? binThemeTokens.goldLight : binThemeTokens.goldHover },
                        '& .MuiStepLabel-label.Mui-completed': { color: mode === 'dark' ? binThemeTokens.goldLight : binThemeTokens.goldHover },
                        '& .MuiStepIcon-root': { color: mode === 'dark' ? alpha('#FFFFFF', 0.18) : binThemeTokens.platinum },
                        '& .MuiStepIcon-root.Mui-active': { color: binThemeTokens.gold },
                        '& .MuiStepIcon-root.Mui-completed': { color: binThemeTokens.gold },
                    }
                }
            }
        },
    }), [mode, isRTL]);

    return (
        <ThemeContext.Provider value={{ mode, toggleTheme }}>
            <CacheProvider value={isRTL ? cacheRtl : cacheLtr}>
                <MuiThemeProvider theme={theme}>
                    {children}
                </MuiThemeProvider>
            </CacheProvider>
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
