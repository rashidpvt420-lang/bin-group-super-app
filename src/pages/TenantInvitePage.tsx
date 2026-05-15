import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Box, Container, Paper, Typography, Button,
    CircularProgress, Alert, Stack, Divider, Chip
} from '@mui/material';
import { ShieldCheck, UserCheck, Home, Key } from 'lucide-react';
import { db, auth, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { binThemeTokens } from '../theme/binGroupTheme';

interface TenantInvitation {
    id: string;
    tenantName: string;
    tenantEmail: string;
    propertyId: string;
    unitId: string;
    tenantId: string;
    inviteToken: string;
    status: string;
    unitNumber?: string;
    propertyName?: string;
}

const copy = {
    title: 'TENANT INVITATION',
    titleAr: 'دعوة المستأجر',
    subtitle: 'You have been invited to the BIN GROUP property care platform.',
    subtitleAr: 'تمت دعوتك إلى منصة بن جروب لإدارة ورعاية العقارات.',
    tenantName: 'TENANT NAME / اسم المستأجر',
    assignedUnit: 'ASSIGNED UNIT / الوحدة المخصصة',
    secure: 'Secure invitation link / رابط دعوة آمن',
    confirm: 'CONFIRM ACCEPTANCE / تأكيد القبول',
    signIn: 'SIGN IN TO ACCEPT / تسجيل الدخول للقبول',
    successTitle: 'WELCOME / أهلاً بك',
    successBody: 'Identity verified. Entering Tenant Portal... / تم التحقق من الهوية. جاري الدخول إلى بوابة المستأجر...',
    invalid: 'Invalid invitation link: Token missing. / رابط الدعوة غير صالح: الرمز غير موجود.',
};

export default function TenantInvitePage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [invitation, setInvitation] = useState<TenantInvitation | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            setError(copy.invalid);
            setLoading(false);
            return;
        }

        const verifyToken = async () => {
            try {
                const validateFn = httpsCallable(functions, 'validateTenantInvitation');
                const result = await validateFn({ token });
                setInvitation(result.data as TenantInvitation);
            } catch (err: any) {
                console.error('Token Verification Error:', err);
                setError(err.message || 'This invitation is invalid or has already been used. / هذه الدعوة غير صالحة أو تم استخدامها مسبقاً.');
            } finally {
                setLoading(false);
            }
        };

        verifyToken();
    }, [token]);

    const handleAccept = async () => {
        if (!invitation) return;
        setVerifying(true);
        setError(null);
        try {
            let user = auth.currentUser;
            if (!user) {
                const provider = new GoogleAuthProvider();
                const result = await signInWithPopup(auth, provider);
                user = result.user;
            }
            if (!user) throw new Error('Authentication failed.');
            const acceptFn = httpsCallable(functions, 'acceptTenantInvitation');
            const result = await acceptFn({ token });
            const data = result.data as any;
            if (data.status === 'success') {
                setSuccess(true);
                setTimeout(() => navigate(data.redirect || '/tenant'), 2000);
            } else {
                throw new Error('Invitation acceptance failed on server.');
            }
        } catch (err: any) {
            console.error('Acceptance Error:', err);
            setError(err.message || 'Failed to accept invitation. / تعذر قبول الدعوة.');
        } finally {
            setVerifying(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#000' }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Container maxWidth="sm" sx={{ py: 10 }}>
            <Paper sx={{ p: 4, borderRadius: 4, bgcolor: '#FFF', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
                <Stack alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
                    <ShieldCheck size={60} color={binThemeTokens.gold} />
                    <Chip label={copy.secure} sx={{ bgcolor: 'rgba(198,167,94,0.12)', color: '#000', fontWeight: 900 }} />
                </Stack>

                {success ? (
                    <Box>
                        <UserCheck size={60} color="green" />
                        <Typography variant="h4" fontWeight="900" sx={{ mt: 2, mb: 1 }}>{copy.successTitle}</Typography>
                        <Typography color="text.secondary">{copy.successBody}</Typography>
                    </Box>
                ) : (
                    <>
                        <Typography variant="h4" fontWeight="950" gutterBottom>{copy.title}</Typography>
                        <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 1 }}>{copy.titleAr}</Typography>
                        <Typography color="text.secondary" sx={{ mb: 0.5 }}>{copy.subtitle}</Typography>
                        <Typography color="text.secondary" sx={{ mb: 4, direction: 'rtl' }}>{copy.subtitleAr}</Typography>

                        {error && <Alert severity="error" sx={{ mb: 4, textAlign: 'left' }}>{error}</Alert>}

                        {invitation && (
                            <Box sx={{ mb: 4, p: 3, bgcolor: '#f8fafc', borderRadius: 3, textAlign: 'left' }}>
                                <Stack spacing={2}>
                                    <Box>
                                        <Typography variant="caption" fontWeight="800" color="text.secondary">{copy.tenantName}</Typography>
                                        <Typography variant="h6" fontWeight="900">{invitation.tenantName}</Typography>
                                        <Typography variant="caption" color="text.secondary">{invitation.tenantEmail}</Typography>
                                    </Box>
                                    <Divider />
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Home size={20} color={binThemeTokens.gold} />
                                        <Box>
                                            <Typography variant="caption" fontWeight="800" color="text.secondary">{copy.assignedUnit}</Typography>
                                            <Typography variant="body1" fontWeight="700">
                                                {invitation.propertyName || `Property Node #${invitation.propertyId?.substr(0, 8)}`} · Unit {invitation.unitNumber || invitation.unitId?.substr(0, 8)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Stack>
                            </Box>
                        )}

                        <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            onClick={handleAccept}
                            disabled={verifying || !invitation}
                            startIcon={auth.currentUser ? <UserCheck /> : <Key />}
                            sx={{ py: 2, borderRadius: 3, bgcolor: '#000', fontWeight: 900, '&:hover': { bgcolor: '#333' } }}
                        >
                            {verifying ? <CircularProgress size={24} color="inherit" /> : (auth.currentUser ? copy.confirm : copy.signIn)}
                        </Button>

                        <Typography variant="caption" sx={{ mt: 2, display: 'block', opacity: 0.6 }}>
                            Sovereign Auth Node / بوابة التحقق الآمنة
                        </Typography>
                    </>
                )}
            </Paper>
        </Container>
    );
}
