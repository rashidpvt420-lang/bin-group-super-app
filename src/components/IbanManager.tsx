import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, TextField, Button, CircularProgress, Chip, Stack } from '@mui/material';
import { Shield, CheckCircle2, AlertCircle } from 'lucide-react';
import { db, collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, limit } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';

export const IbanManager: React.FC = () => {
    const { user } = useRole();
    const [ibanRecord, setIbanRecord] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [newIban, setNewIban] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!user?.uid) return;
        const fetchIban = async () => {
            try {
                const q = query(
                    collection(db, 'ownerBankAccounts'),
                    where('ownerId', '==', user.uid),
                    orderBy('createdAt', 'desc'),
                    limit(1)
                );
                const snap = await getDocs(q);
                if (!snap.empty) {
                    setIbanRecord({ id: snap.docs[0].id, ...snap.docs[0].data() });
                }
            } catch (err) {
                console.error("Error fetching IBAN:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchIban();
    }, [user]);

    const handleSubmitIban = async () => {
        if (!newIban || newIban.length < 15) {
            alert('Please enter a valid IBAN');
            return;
        }
        setIsSubmitting(true);
        try {
            const last4 = newIban.slice(-4);
            const maskedIban = `**** **** **** **** ${last4}`;
            
            const newRecord = {
                ownerId: user?.uid,
                iban: newIban, // Securely stored
                maskedIban,
                last4,
                verificationStatus: 'PENDING',
                createdAt: serverTimestamp()
            };

            const docRef = await addDoc(collection(db, 'ownerBankAccounts'), newRecord);
            
            await addDoc(collection(db, 'auditLogs'), {
                action: 'UPDATE_IBAN',
                actorId: user?.uid,
                actorRole: 'owner',
                ownerId: user?.uid,
                status: 'PENDING',
                timestamp: serverTimestamp()
            });

            setIbanRecord({ id: docRef.id, ...newRecord, verificationStatus: 'PENDING' });
            setNewIban('');
        } catch (err) {
            console.error("Error saving IBAN:", err);
            alert("Failed to securely save IBAN.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <CircularProgress size={24} sx={{ color: binThemeTokens.gold }} />;

    return (
        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Shield color={binThemeTokens.gold} />
                <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: 1 }}>SOVEREIGN PAYOUT DESTINATION</Typography>
            </Box>

            {ibanRecord ? (
                <Box sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(198,167,94,0.05)', border: '1px solid rgba(198,167,94,0.2)' }}>
                    <Stack spacing={2}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>REGISTERED IBAN</Typography>
                        <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 900, fontFamily: 'monospace', letterSpacing: 2 }}>
                            {ibanRecord.maskedIban}
                        </Typography>
                        <Box>
                            <Chip 
                                icon={ibanRecord.verificationStatus === 'VERIFIED' ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
                                label={ibanRecord.verificationStatus === 'VERIFIED' ? 'SECURELY VERIFIED' : 'VERIFICATION PENDING'}
                                sx={{ 
                                    bgcolor: ibanRecord.verificationStatus === 'VERIFIED' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', 
                                    color: ibanRecord.verificationStatus === 'VERIFIED' ? '#10b981' : '#f59e0b',
                                    fontWeight: 900
                                }} 
                            />
                        </Box>
                    </Stack>
                </Box>
            ) : (
                <Box>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 3 }}>
                        Please securely register your IBAN to enable institutional rent payouts and ROI distributions.
                    </Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <TextField
                            fullWidth
                            label="International Bank Account Number (IBAN)"
                            placeholder="AE00 0000 0000 0000 0000 000"
                            value={newIban}
                            onChange={(e) => setNewIban(e.target.value)}
                            InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }}
                            InputProps={{ style: { color: '#FFF', fontFamily: 'monospace' } }}
                            sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}
                        />
                        <Button 
                            variant="contained"
                            disabled={isSubmitting}
                            onClick={handleSubmitIban}
                            sx={{ 
                                bgcolor: binThemeTokens.gold, 
                                color: '#000', 
                                fontWeight: 900, 
                                minWidth: 200,
                                '&:hover': { bgcolor: binThemeTokens.goldLight }
                            }}
                        >
                            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'SECURE VAULT'}
                        </Button>
                    </Stack>
                </Box>
            )}
        </Paper>
    );
};
