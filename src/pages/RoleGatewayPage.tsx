import React, { useState } from 'react';
import { 
    Box, Typography, Container, Grid, Card, CardContent, 
    CardActionArea, alpha, Stack, Chip, Alert, CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { auth, db, doc, setDoc, serverTimestamp } from '../lib/firebase';
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
            desc: 'Dedicated Admin Command Center bridge.'
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

        const currentUser = auth.currentUser;
        if (!currentUser) {
            navigate(`/login?intendedRole=${roleId}`);
            return;
        }

        setSavingRole(roleId);
        try {
            const status = roleId === 'owner' ? 'onboarding' : 'active';
            await setDoc(doc(db, 'users', currentUser.uid), {
                uid: currentUser.uid,
                email: (currentUser.email || '').toLowerCase(),
                displayName: currentUser.displayName || currentUser.email || 'BIN GROUP User',
                photoURL: currentUser.photoURL || null,
                role: roleId,
                status,
                isAdmin: false,
                onboardingComplete: roleId !== 'owner',
                roleSelectedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }, { merge: true });

            await refreshRole();
            navigate(roleHome[roleId] || '/owner/dashboard', { replace: true });
        } catch (error) {
            console.error('[ROLE_GATEWAY] Role selection failed:', error);
            setNotice('Role selection could not be saved. Please refresh and try again, or contact BIN GROUP support.');
        } finally {
            setSavingRole(null);
        }
    };

    return (
        <Box sx={{
            minHeight: '100vh',
            bgcolor: '#000',
            display: 'flex',
            flexDirection: 'column',
            backgroundImage: 'radial-gradient(circle at 50% -20%, rgba(198, 167, 94, 0.15) 0%, transparent 50%)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <Box sx={{ p: 4, position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', zIndex: 10, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Chip 
                    icon={<ArrowLeft size={16} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />} 
                    label="BACK TO HOME" 
                    onClick={() => navigate('/')}
                    sx={{ 
                        bgcolor: 'rgba(255,255,255,0.05)', 
                        color: '#FFF', 
                        fontWeight: 900, 
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(198, 167, 94, 0.2)' }
                    }} 
                />
                <Chip 
                    label={isRTL ? 'EN' : 'AR'}
                    onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                    sx={{ 
                        bgcolor: 'rgba(255,255,255,0.05)', 
                        color: '#FFF', 
                        fontWeight: 900, 
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(198, 167, 94, 0.2)' }
                    }} 
                />
            </Box>

            <Container maxWidth="lg" sx={{ py: { xs: 10, md: 15 }, position: 'relative', zIndex: 1 }}>
                <Box sx={{ textAlign: 'center', mb: 10 }}>
                    <Typography variant="h2" fontWeight="950" sx={{ 
                        color: '#FFF', 
                        letterSpacing: -2, 
                        mb: 2,
                        fontSize: { xs: '2.5rem', md: '4rem' }
                    }}>
                        {tx('gateway.title', 'Select Your Operational Node')}
                    </Typography>
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                        {tx('gateway.subtitle', 'Enter the BIN GROUP Sovereign OS via your authorized role.')}
                    </Typography>
                </Box>

                {notice && (
                    <Alert severity="warning" sx={{ mb: 4, bgcolor: 'rgba(255,152,0,0.1)', color: '#ffb74d', border: '1px solid rgba(255,152,0,0.2)' }}>
                        {notice}
                    </Alert>
                )}

                <Grid container spacing={3} justifyContent="center">
                    {roles.map((roleOption) => (
                        <Grid item xs={12} sm={6} md={4} key={roleOption.id}>
                            <Card sx={{ 
                                bgcolor: 'rgba(22, 22, 24, 0.6)', 
                                border: '1px solid rgba(255,255,255,0.05)', 
                                borderRadius: 6,
                                transition: 'all 0.3s ease',
                                opacity: savingRole && savingRole !== roleOption.id ? 0.55 : 1,
                                '&:hover': {
                                    borderColor: binThemeTokens.gold,
                                    transform: 'translateY(-10px)',
                                    boxShadow: `0 30px 60px ${alpha(binThemeTokens.gold, 0.1)}`,
                                    bgcolor: 'rgba(198, 167, 94, 0.03)'
                                }
                            }}>
                                <CardActionArea disabled={Boolean(savingRole)} onClick={() => handleRoleSelect(roleOption.id)} sx={{ p: 4, height: '100%' }}>
                                    <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'} textAlign={isRTL ? 'right' : 'left'}>
                                        <Box sx={{ 
                                            p: 2, 
                                            borderRadius: 4, 
                                            bgcolor: alpha(binThemeTokens.gold, 0.1), 
                                            color: binThemeTokens.gold 
                                        }}>
                                            {savingRole === roleOption.id ? <CircularProgress size={40} sx={{ color: binThemeTokens.gold }} /> : roleOption.icon}
                                        </Box>
                                        <Box>
                                            <Typography variant="h5" fontWeight="900" sx={{ color: '#FFF', mb: 1 }}>
                                                {roleOption.label}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                                                {roleOption.desc}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 1, 
                                            color: binThemeTokens.gold, 
                                            fontWeight: 900,
                                            fontSize: '0.75rem',
                                            letterSpacing: 2
                                        }}>
                                            ACCESS TERMINAL <ChevronRight size={14} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                        </Box>
                                    </Stack>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    ))}
                </Grid>

                <Box sx={{ mt: 15, textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.1)', letterSpacing: 4, textTransform: 'uppercase', fontWeight: 900 }}>
                        ISO 27001 Certified Operational Sovereignty
                    </Typography>
                </Box>
            </Container>
        </Box>
    );
};

export default RoleGatewayPage;
