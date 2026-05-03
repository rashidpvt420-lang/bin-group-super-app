
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
    Box, Container, Paper, Typography, Button, 
    CircularProgress, Alert, Stack, Divider 
} from '@mui/material';
import { ShieldCheck, UserCheck, Home, Key } from 'lucide-react';
import { db, auth, functions } from '../lib/firebase';
import { 
    collection, query, where, getDocs, doc, 
    updateDoc, getDoc, writeBatch, serverTimestamp 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth';
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
}

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
            setError("Invalid invitation link: Token missing.");
            setLoading(false);
            return;
        }

        const verifyToken = async () => {
            try {
                const validateFn = httpsCallable(functions, 'validateTenantInvitation');
                const result = await validateFn({ token });
                setInvitation(result.data as TenantInvitation);
            } catch (err: any) {
                console.error("Token Verification Error:", err);
                setError(err.message || "This invitation is invalid or has already been used.");
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
            // 1. Ensure user is signed in
            let user = auth.currentUser;
            if (!user) {
                const provider = new GoogleAuthProvider();
                const result = await signInWithPopup(auth, provider);
                user = result.user;
            }

            if (!user) throw new Error("Authentication failed.");

            // 2. Call Secure Function
            const acceptFn = httpsCallable(functions, 'acceptTenantInvitation');
            const result = await acceptFn({ token });
            const data = result.data as any;

            if (data.status === 'success') {
                setSuccess(true);
                setTimeout(() => navigate(data.redirect || '/tenant'), 2000);
            } else {
                throw new Error("Invitation acceptance failed on server.");
            }

        } catch (err: any) {
            console.error("Acceptance Error:", err);
            setError(err.message || "Failed to accept invitation.");
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
                <Box sx={{ mb: 4 }}>
                    <ShieldCheck size={60} color={binThemeTokens.gold} />
                </Box>
                
                {success ? (
                    <Box>
                        <UserCheck size={60} color="green" />
                        <Typography variant="h4" fontWeight="900" sx={{ mt: 2, mb: 1 }}>WELCOME</Typography>
                        <Typography color="text.secondary">Identity verified. Entering Sovereign Tenant Portal...</Typography>
                    </Box>
                ) : (
                    <>
                        <Typography variant="h4" fontWeight="950" gutterBottom>TENANT INVITATION</Typography>
                        <Typography color="text.secondary" sx={{ mb: 4 }}>
                            You have been invited to the BIN GROUP Sovereign Platform.
                        </Typography>

                        {error && <Alert severity="error" sx={{ mb: 4 }}>{error}</Alert>}

                        {invitation && (
                            <Box sx={{ mb: 4, p: 3, bgcolor: '#f8fafc', borderRadius: 3, textAlign: 'left' }}>
                                <Stack spacing={2}>
                                    <Box>
                                        <Typography variant="caption" fontWeight="800" color="text.secondary">TENANT NAME</Typography>
                                        <Typography variant="h6" fontWeight="900">{invitation.tenantName}</Typography>
                                    </Box>
                                    <Divider />
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Home size={20} color={binThemeTokens.gold} />
                                        <Box>
                                            <Typography variant="caption" fontWeight="800" color="text.secondary">ASSIGNED UNIT</Typography>
                                            <Typography variant="body1" fontWeight="700">Property Node #{invitation.propertyId.substr(0,8)}</Typography>
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
                            disabled={verifying}
                            startIcon={auth.currentUser ? <UserCheck /> : <Key />}
                            sx={{ 
                                py: 2, 
                                borderRadius: 3, 
                                bgcolor: '#000', 
                                fontWeight: 900,
                                '&:hover': { bgcolor: '#333' }
                            }}
                        >
                            {verifying ? <CircularProgress size={24} color="inherit" /> : (auth.currentUser ? 'CONFIRM ACCEPTANCE' : 'SIGN IN TO ACCEPT')}
                        </Button>
                        
                        <Typography variant="caption" sx={{ mt: 2, display: 'block', opacity: 0.6 }}>
                            Secure verification via Sovereign Auth Node.
                        </Typography>
                    </>
                )}
            </Paper>
        </Container>
    );
}
