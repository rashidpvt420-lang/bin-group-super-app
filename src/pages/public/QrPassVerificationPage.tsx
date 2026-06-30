import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Container, Paper, CircularProgress, Stack, Chip, Button } from '@mui/material';
import { ShieldCheck, XCircle, Clock, MapPin, User, Building } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function QrPassVerificationPage() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function verifyToken() {
            if (!token) {
                setError('No token provided');
                setLoading(false);
                return;
            }
            try {
                const verifyQrPass = httpsCallable(functions, 'verifyQrPass');
                const res = await verifyQrPass({ token });
                setResult((res.data as any).payload);
            } catch (err: any) {
                console.error('Verification failed', err);
                setError(err.message || 'Invalid or expired token');
            } finally {
                setLoading(false);
            }
        }
        verifyToken();
    }, [token]);

    if (loading) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617' }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Container maxWidth="sm" sx={{ py: 8 }}>
            <Paper sx={{ 
                p: 4, 
                bgcolor: 'rgba(15, 23, 42, 0.8)', 
                borderRadius: 6, 
                border: '1px solid',
                borderColor: error ? 'error.main' : 'success.main',
                textAlign: 'center'
            }}>
                {error ? (
                    <>
                        <XCircle size={64} color="#ef4444" style={{ margin: '0 auto 16px' }} />
                        <Typography variant="h5" color="#FFF" fontWeight={900} mb={1}>Pass Invalid or Expired</Typography>
                        <Typography variant="body1" color="error.light" mb={4}>{error}</Typography>
                        <Button variant="outlined" color="inherit" onClick={() => navigate('/')}>Return to Home</Button>
                    </>
                ) : (
                    <>
                        <ShieldCheck size={64} color="#10b981" style={{ margin: '0 auto 16px' }} />
                        <Typography variant="h5" color="#FFF" fontWeight={900} mb={1}>Access Granted</Typography>
                        <Chip label="Valid Pass" color="success" sx={{ mb: 4, fontWeight: 700 }} />
                        
                        <Stack spacing={2} textAlign="left" sx={{ 
                            p: 3, 
                            bgcolor: 'rgba(255,255,255,0.03)', 
                            borderRadius: 4,
                            border: '1px solid rgba(255,255,255,0.05)' 
                        }}>
                            <Box display="flex" alignItems="center" gap={2}>
                                <User size={20} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Visitor Name</Typography>
                                    <Typography variant="body1" color="#FFF">{result?.name || 'N/A'}</Typography>
                                </Box>
                            </Box>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Building size={20} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Property</Typography>
                                    <Typography variant="body1" color="#FFF">{result?.propertyName || 'Unknown Property'}</Typography>
                                </Box>
                            </Box>
                            <Box display="flex" alignItems="center" gap={2}>
                                <MapPin size={20} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Unit</Typography>
                                    <Typography variant="body1" color="#FFF">{result?.unitName || '***'}</Typography>
                                </Box>
                            </Box>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Clock size={20} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Valid Until</Typography>
                                    <Typography variant="body1" color="#FFF">
                                        {result?.validUntil ? new Date(result.validUntil).toLocaleString() : 'N/A'}
                                    </Typography>
                                </Box>
                            </Box>
                        </Stack>
                    </>
                )}
            </Paper>
        </Container>
    );
}
