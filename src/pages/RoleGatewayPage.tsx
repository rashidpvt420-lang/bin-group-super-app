import React, { useState } from 'react';
import { 
    Box, Typography, Container, Grid, Card, CardContent, 
    CardActionArea, alpha, Stack, Chip, Alert, CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { auth, functions, httpsCallable } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { 
    User, Users, Wrench, Briefcase, ShieldCheck, 
    ChevronRight, ArrowLeft 
} from 'lucide-react';

const PUBLIC_SELF_ASSIGN_ROLES = new Set(['owner', 'tenant', 'technician', 'broker']);

const roleHome: Record<string, string> = {
    owner: '/owner/dashboard',
    tenant: '/tenant/dashboard',
    technician: '/technician/dashboard',
    broker: '/broker/dashboard',
};

const RoleGatewayPage: React.FC = () => {
    const navigate = useNavigate();
    const { t, tx, isRTL, lang, setLang } = useLanguage();
    const { user, role, isAdmin, refreshRole } = useRole();
    const [savingRole, setSavingRole] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const roles = [
        { 
            id: 'owner', 
            label: tx('gateway.role.owner', 'Continue as Owner'), 
            icon: <User size={40} />, 
            desc: 'Portfolio intelligence and asset control center.'
        },
        { 
            id: 'tenant', 
            label: tx('gateway.role.tenant', 'Continue as Tenant'), 
            icon: <Users size={40} />, 
            desc: 'Seamless issue reporting and residence management.'
        },
        { 
            id: 'technician', 
            label: tx('gateway.role.technician', 'Continue as Technician'), 
            icon: <Wrench size={40} />, 
            desc: 'Mission dispatch and evidence-based work logs.'
        },
        { 
            id: 'broker', 
            label: tx('gateway.role.broker', 'Continue as Broker'), 
            icon: <Briefcase size={40} />, 
            desc: 'Referral management and commission tracking.'
        },
        { 
            id: 'admin', 
            label: tx('gateway.role.admin', 'Continue as Admin'), 
            icon: <ShieldCheck size={40} />, 
            desc: 'Unified in-app Admin Command Center.'
        }
    ];

    const handleRoleSelect = async (roleId: string) => {
        setNotice(null);

        if (roleId === 'admin') {
            navigate('/admin/dashboard');
            return;
        }

        if (!auth.currentUser && !user) {
            navigate(`/login?intendedRole=${roleId}`);
            return;
        }

        if (!PUBLIC_SELF_ASSIGN_ROLES.has(roleId)) {
            setNotice('This role is not available for self-selection.');
            return;
        }

        if (role === roleId) {
            navigate(roleHome[roleId] || '/');
            return;
        }

        setSavingRole(roleId);
        try {
            const activeUser = auth.currentUser || user;
            if (!activeUser) throw new Error('No authenticated user found.');

            const assignRole = httpsCallable(functions, 'assignPublicPortalRole');
            await assignRole({ role: roleId });
            await activeUser.getIdToken(true);
            await refreshRole();
            navigate(roleId === 'owner' ? '/onboarding' : (roleHome[roleId] || '/'));
        } catch (error: any) {
            console.error('[ROLE-GATEWAY] Failed to assign role:', error);
            setNotice(error?.message || 'Unable to assign role. Please try again.');
        } finally {
            setSavingRole(null);
        }
    };

    const canShowAdminChip = isAdmin || ['admin', 'super_admin', 'ceo', 'manager'].includes(String(role || '').toLowerCase());

    return (
        <Box sx={{
            minHeight: '100vh',
            bgcolor: '#FFFFFF',
            color: binThemeTokens.graphite,
            py: { xs: 4, md: 8 },
            direction: isRTL ? 'rtl' : 'ltr'
        }}>
            <Container maxWidth="lg">
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                    <Box>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                            BIN GROUP ACCESS
                        </Typography>
                        <Typography variant="h3" sx={{ fontWeight: 950, letterSpacing: -1 }}>
                            {tx('gateway.title', 'Choose your workspace')}
                        </Typography>
                        <Typography variant="body1" sx={{ color: '#667085', mt: 1, maxWidth: 720, fontWeight: 700 }}>
                            {tx('gateway.subtitle', 'Select the role that matches your work with BIN GROUP. Public roles can be selected here; admin access still requires approved admin identity.')}
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                            label={lang === 'ar' ? 'العربية' : 'English'}
                            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
                            sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }}
                        />
                        <Chip
                            label={canShowAdminChip ? 'Admin eligible' : 'Public roles'}
                            sx={{ bgcolor: canShowAdminChip ? alpha('#16A34A', 0.12) : alpha('#2563EB', 0.10), color: canShowAdminChip ? '#15803D' : '#1D4ED8', fontWeight: 900 }}
                        />
                    </Stack>
                </Stack>

                {notice && <Alert severity="warning" sx={{ mb: 3 }}>{notice}</Alert>}

                <Grid container spacing={3}>
                    {roles.map((r) => {
                        const isAdminRole = r.id === 'admin';
                        const disabled = savingRole !== null || (isAdminRole && !canShowAdminChip && !!user);
                        return (
                            <Grid item xs={12} sm={6} md={4} key={r.id}>
                                <Card sx={{ height: '100%', borderRadius: 5, border: '1px solid #E5E7EB', boxShadow: '0 18px 48px rgba(17,24,39,0.06)' }}>
                                    <CardActionArea disabled={disabled} onClick={() => handleRoleSelect(r.id)} sx={{ height: '100%', p: 3 }}>
                                        <CardContent>
                                            <Stack spacing={2}>
                                                <Box sx={{ width: 62, height: 62, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {savingRole === r.id ? <CircularProgress size={30} sx={{ color: binThemeTokens.gold }} /> : r.icon}
                                                </Box>
                                                <Box>
                                                    <Typography variant="h5" sx={{ fontWeight: 950 }}>{r.label}</Typography>
                                                    <Typography variant="body2" sx={{ color: '#667085', mt: 1, lineHeight: 1.7, fontWeight: 700 }}>{r.desc}</Typography>
                                                </Box>
                                                <Stack direction="row" alignItems="center" spacing={1} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>
                                                    <Typography variant="button" sx={{ fontWeight: 950 }}>{t('common.continue') || 'Continue'}</Typography>
                                                    {isRTL ? <ArrowLeft size={18} /> : <ChevronRight size={18} />}
                                                </Stack>
                                            </Stack>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            </Container>
        </Box>
    );
};

export default RoleGatewayPage;
