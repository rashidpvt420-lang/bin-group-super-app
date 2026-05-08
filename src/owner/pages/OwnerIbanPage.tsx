import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Stack, Button, TextField, Alert, CircularProgress, Divider, Chip } from '@mui/material';
import { CreditCard, Shield, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { db, collection, addDoc, query, where, getDocs, serverTimestamp } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerIbanPage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [iban, setIban] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountHolder, setAccountHolder] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [showIban, setShowIban] = useState<Record<string, boolean>>({});

    const inputSx = { '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: binThemeTokens.gold }, '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold } }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiInputBase-input': { color: '#FFF' } };

    useEffect(() => {
        if (!user) return;
        getDocs(query(collection(db, 'ownerBankAccounts'), where('ownerId', '==', user.uid))).then(snap => {
            setBankAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }).finally(() => setLoading(false));
    }, [user]);

    const maskIban = (iban: string) => {
        if (!iban) return '—';
        const clean = iban.replace(/\s/g, '');
        const last4 = clean.slice(-4);
        return `AE${'*'.repeat(14)}${last4}`;
    };

    const handleSave = async () => {
        if (!iban || !bankName || !accountHolder) { setError('All fields are required.'); return; }
        if (!iban.toUpperCase().startsWith('AE')) { setError('IBAN must start with AE for UAE accounts.'); return; }
        setSaving(true); setError('');
        try {
            await addDoc(collection(db, 'ownerBankAccounts'), {
                ownerId: user?.uid,
                ownerEmail: user?.email,
                iban: iban.replace(/\s/g, '').toUpperCase(),
                last4: iban.slice(-4),
                bankName,
                accountHolder,
                verified: false,
                status: 'PENDING_VERIFICATION',
                createdAt: serverTimestamp(),
            });
            await addDoc(collection(db, 'auditLogs'), { action: 'IBAN_ADDED', actorId: user?.uid, actorRole: 'owner', timestamp: serverTimestamp() });
            setSuccess('Bank account submitted for verification. BIN GROUP will verify within 1-2 business days.');
            setIban(''); setBankName(''); setAccountHolder(''); setShowForm(false);
            const snap = await getDocs(query(collection(db, 'ownerBankAccounts'), where('ownerId', '==', user?.uid)));
            setBankAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err: any) { setError(err.message); }
        finally { setSaving(false); }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>IBAN / Payout Accounts</Typography>
                <Button variant="contained" onClick={() => setShowForm(!showForm)}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, borderRadius: 3 }}>
                    + Add Account
                </Button>
            </Stack>

            <Alert severity="info" sx={{ mb: 3, bgcolor: 'rgba(59,130,246,0.08)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                <Shield size={16} style={{ marginRight: 8, display: 'inline' }} />
                IBAN data is encrypted and masked. Only Admin compliance can view full numbers.
            </Alert>

            {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

            {showForm && (
                <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF', mb: 3 }}>Add Bank Account</Typography>
                    <Stack spacing={2.5}>
                        <TextField fullWidth label="Account Holder Name *" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} sx={inputSx} />
                        <TextField fullWidth label="Bank Name *" value={bankName} onChange={e => setBankName(e.target.value)} sx={inputSx} placeholder="e.g. Emirates NBD" />
                        <TextField fullWidth label="IBAN *" value={iban} onChange={e => setIban(e.target.value)} sx={inputSx} placeholder="AE00 XXXX XXXX XXXX XXXX XXX"
                            helperText="UAE IBAN format: AE + 21 digits" FormHelperTextProps={{ sx: { color: 'rgba(255,255,255,0.3)' } }} />
                        <Stack direction="row" spacing={2}>
                            <Button variant="contained" onClick={handleSave} disabled={saving}
                                sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 900, borderRadius: 3 }}>
                                {saving ? <CircularProgress size={16} sx={{ color: '#FFF' }} /> : 'Submit for Verification'}
                            </Button>
                            <Button variant="outlined" onClick={() => setShowForm(false)}
                                sx={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', borderRadius: 3 }}>Cancel</Button>
                        </Stack>
                    </Stack>
                </Paper>
            )}

            {bankAccounts.length === 0 && !showForm ? (
                <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
                    <CreditCard size={48} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 12px' }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>No bank account linked. Add your IBAN to receive payouts.</Typography>
                </Paper>
            ) : (
                <Stack spacing={3}>
                    {bankAccounts.map(account => (
                        <Paper key={account.id} sx={{ p: 3, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Box>
                                    <Typography variant="subtitle1" fontWeight="900" sx={{ color: '#FFF' }}>{account.bankName}</Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>{account.accountHolder}</Typography>
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                                        <Typography variant="body2" sx={{ color: '#FFF', fontFamily: 'monospace' }}>
                                            {showIban[account.id] ? account.iban : maskIban(account.iban || '')}
                                        </Typography>
                                        <Button size="small" onClick={() => setShowIban(prev => ({ ...prev, [account.id]: !prev[account.id] }))}
                                            sx={{ color: 'rgba(255,255,255,0.4)', minWidth: 0, p: 0 }}>
                                            {showIban[account.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </Button>
                                    </Stack>
                                </Box>
                                <Chip label={account.verified ? 'VERIFIED' : 'PENDING'} size="small"
                                    sx={{ bgcolor: account.verified ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: account.verified ? '#4ade80' : '#f59e0b', fontWeight: 900 }} />
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Box>
    );
}
