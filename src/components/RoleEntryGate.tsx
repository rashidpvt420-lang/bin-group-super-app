import React from 'react';
import { Box, Typography, Stack, Container, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building, Crown, TrendingUp } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';

export type RoleEntryChoice = 'tenant' | 'landlord' | 'broker';

export const ROLE_GATE_STORAGE_KEY = 'bin_role_gate_choice';

export const ROLE_GATE_ROUTES: Record<RoleEntryChoice, string> = {
    tenant: '/tenants',
    landlord: '/owners',
    broker: '/brokers',
};

const isRoleEntryChoice = (value: string | null): value is RoleEntryChoice =>
    value === 'tenant' || value === 'landlord' || value === 'broker';

export function getStoredRoleGateChoice(): RoleEntryChoice | null {
    try {
        const stored = localStorage.getItem(ROLE_GATE_STORAGE_KEY);
        return isRoleEntryChoice(stored) ? stored : null;
    } catch {
        return null;
    }
}

export function getRoleFromQueryParam(): RoleEntryChoice | null {
    try {
        const role = new URLSearchParams(window.location.search).get('role');
        return isRoleEntryChoice(role) ? role : null;
    } catch {
        return null;
    }
}

interface RoleEntryGateProps {
    onChoose: (choice: RoleEntryChoice) => void;
}

const RoleEntryGate: React.FC<RoleEntryGateProps> = ({ onChoose }) => {
    const navigate = useNavigate();
    const { isRTL } = useLanguage();
    const copy = (en: string, ar: string) => (isRTL ? ar : en);

    const cards: Array<{ choice: RoleEntryChoice; title: string; desc: string; icon: React.ReactNode }> = [
        {
            choice: 'tenant',
            title: copy('I rent my home', 'أنا مستأجر'),
            desc: copy(
                'Report a problem, track the technician, pay rent, and view your documents.',
                'أرفع بلاغ صيانة، أتابع الفني، أدفع الإيجار، وأراجع مستنداتي.'
            ),
            icon: <Building size={36} />,
        },
        {
            choice: 'landlord',
            title: copy('I own a property', 'أنا أملك عقاراً'),
            desc: copy(
                'Track contracts, payments, maintenance proof, and your property passport.',
                'أتابع العقود والمدفوعات وإثبات الصيانة وجواز عقاري.'
            ),
            icon: <Crown size={36} />,
        },
        {
            choice: 'broker',
            title: copy("I'm a real estate broker", 'أنا وسيط عقاري'),
            desc: copy(
                'Bring in leads and contracts, and track your commission.',
                'أجلب العملاء والعقود وأتابع عمولتي.'
            ),
            icon: <TrendingUp size={36} />,
        },
    ];

    const handleChoose = (choice: RoleEntryChoice) => {
        try {
            localStorage.setItem(ROLE_GATE_STORAGE_KEY, choice);
        } catch {
            // localStorage may be unavailable (private mode); choice still navigates this session.
        }
        onChoose(choice);
        navigate(ROLE_GATE_ROUTES[choice]);
    };

    return (
        <Box
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: 1300,
                bgcolor: 'background.default',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
            }}
        >
            <Box
                sx={{
                    p: 4,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    zIndex: 10,
                }}
            >
                <Chip
                    icon={<ArrowLeft size={16} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />}
                    label={copy('ALREADY HAVE AN ACCOUNT?', 'لدي حساب بالفعل')}
                    onClick={() => navigate('/login')}
                    sx={{
                        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)'),
                        color: 'text.primary',
                        fontWeight: 900,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: `${binThemeTokens.gold}22` },
                    }}
                />
            </Box>

            <Container
                maxWidth="md"
                sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', py: 14 }}
            >
                <Stack spacing={6} alignItems="center" textAlign="center" sx={{ width: '100%' }}>
                    <Stack spacing={1.5} alignItems="center">
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
                            {copy('BIN GROUP', 'بِن قروب')}
                        </Typography>
                        <Typography
                            variant="h3"
                            fontWeight={950}
                            sx={{ color: 'text.primary', letterSpacing: -1, fontSize: { xs: '1.9rem', md: '2.6rem' } }}
                        >
                            {copy('Tell us who you are', 'من أنت؟')}
                        </Typography>
                        <Typography sx={{ color: 'text.secondary', maxWidth: 520 }}>
                            {copy(
                                'We will show you exactly what you need, nothing else.',
                                'سنعرض لك ما تحتاجه بالضبط، ولا شيء غيره.'
                            )}
                        </Typography>
                    </Stack>

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ width: '100%' }}>
                        {cards.map((card) => (
                            <Box
                                key={card.choice}
                                onClick={() => handleChoose(card.choice)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') handleChoose(card.choice);
                                }}
                                sx={{
                                    flex: 1,
                                    p: 4,
                                    borderRadius: 3,
                                    border: `1px solid ${binThemeTokens.gold}22`,
                                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(198,167,94,0.04)' : 'rgba(198,167,94,0.05)'),
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                                    '&:hover': {
                                        borderColor: binThemeTokens.gold,
                                        transform: 'translateY(-4px)',
                                    },
                                }}
                            >
                                <Stack spacing={2} alignItems="center">
                                    <Box sx={{ color: binThemeTokens.gold }}>{card.icon}</Box>
                                    <Typography variant="h6" fontWeight={950} sx={{ color: 'text.primary' }}>
                                        {card.title}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                                        {card.desc}
                                    </Typography>
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </Stack>
            </Container>
        </Box>
    );
};

export default RoleEntryGate;
