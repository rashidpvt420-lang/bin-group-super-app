import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Container, Stack, Button, alpha,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    MenuItem, Select, FormControl, InputLabel, Grid, Card, CardContent,
    CircularProgress, IconButton, Chip
} from '@mui/material';
import { ShieldCheck, Plus, Clock, Trash2, Phone, Calendar } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { db, collection, addDoc, onSnapshot, query, where, doc, deleteDoc, serverTimestamp, functions, httpsCallable, getDocs, limit } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TenantGatePassPage() {
    const { t, isRTL } = useLanguage();
    const { user } = useRole();
    const [passes, setPasses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [visitorName, setVisitorName] = useState('');
    const [visitorPhone, setVisitorPhone] = useState('');
    const [visitorType, setVisitorType] = useState('visitor');
    const [duration, setDuration] = useState('4');
    const [unitId, setUnitId] = useState('');
    const [propertyId, setPropertyId] = useState('');

    const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

    // 1. Resolve residence info
    useEffect(() => {
        async function resolveResidence() {
            if (!user?.uid) return;
            try {
                let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid), limit(1)));
                if (unitSnap.empty && user.email) {
                    unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', normalizeEmail(user.email)), limit(1)));
                }
                if (!unitSnap.empty) {
                    const uDoc = unitSnap.docs[0];
                    setUnitId(uDoc.id);
                    setPropertyId(uDoc.data().propertyId || '');
                }
            } catch (err) {
                console.error('Failed to resolve tenant unit:', err);
            }
        }
        resolveResidence();
    }, [user]);

    // 2. Listen to gate passes
    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }
        const q = query(collection(db, 'gatePasses'), where('tenantUid', '==', user.uid));
        const unsub = onSnapshot(q, (snap) => {
            const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => {
                const ta = a.createdAt?.toDate?.()?.getTime() || 0;
                const tb = b.createdAt?.toDate?.()?.getTime() || 0;
                return tb - ta;
            });
            setPasses(list);
            setLoading(false);
        }, (err) => {
            console.error("Gate passes listener error:", err);
            setLoading(false);
        });
        return () => unsub();
    }, [user]);

    const handleCreatePass = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid || !visitorName.trim()) return;
        setSubmitting(true);
        try {
            const validUntil = Date.now() + (parseInt(duration, 10) * 3600 * 1000);
            
            const generateSignedQrPass = httpsCallable(functions, 'generateSignedQrPass');
            const result = await generateSignedQrPass({
                propertyId: propertyId || 'default_prop',
                unitId: unitId || 'default_unit',
                type: visitorType,
                name: visitorName.trim(),
                validFrom: Date.now(),
                validUntil
            });
            const { token, passId } = result.data as any;

            await addDoc(collection(db, 'gatePasses'), {
                passId,
                qrToken: token,
                propertyId: propertyId || null,
                unitId: unitId || null,
                tenantUid: user.uid,
                tenantName: user.displayName || 'Resident',
                visitorName: visitorName.trim(),
                visitorPhone: visitorPhone.trim(),
                visitorType,
                duration: parseInt(duration, 10),
                status: 'active',
                createdAt: serverTimestamp(),
            });
            setOpenAdd(false);
            setVisitorName('');
            setVisitorPhone('');
            setVisitorType('visitor');
            setDuration('4');
        } catch (err) {
            console.error("Failed to generate gate pass", err);
            alert("Error: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevokePass = async (passId: string) => {
        if (!window.confirm("Are you sure you want to revoke this gate pass?")) return;
        try {
            await deleteDoc(doc(db, 'gatePasses', passId));
        } catch (err) {
            console.error("Failed to revoke pass", err);
            alert("Failed to revoke pass.");
        }
    };

    return (
        <Container maxWidth="lg" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
                        <ShieldCheck size={36} color={binThemeTokens.gold} /> {t('tenant.gatePasses.title') || 'Gate Passes'}
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>
                        {t('tenant.gatePasses.desc') || 'Register visitors, contractors, or deliveries to generate security access QR codes.'}
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<Plus />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, px: 3, py: 1.2, '&:hover': { bgcolor: '#b4954e' } }}>
                    {t('tenant.gatePasses.register') || 'REGISTER VISITOR'}
                </Button>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>
            ) : passes.length === 0 ? (
                <Paper sx={{ p: 8, textAlign: 'center', bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px dashed ${alpha(binThemeTokens.gold, 0.22)}`, borderRadius: 6 }}>
                    <ShieldCheck color={binThemeTokens.gold} size={48} />
                    <Typography sx={{ color: '#fff', fontWeight: 950, mt: 2 }}>{t('tenant.gatePasses.noPasses') || 'No Active Gate Passes'}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mb: 3 }}>
                        {t('tenant.gatePasses.noPassesHint') || 'Register your first visitor to generate an access pass.'}
                    </Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {passes.map(pass => (
                        <Grid item xs={12} md={6} lg={4} key={pass.id}>
                            <Card sx={{ bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3, bgcolor: '#FFF' }}>
                                    <Box sx={{ p: 1, bgcolor: '#fff', borderRadius: 2 }}>
                                        <QRCodeSVG value={pass.qrToken || JSON.stringify({ passId: pass.id, type: pass.visitorType, name: pass.visitorName })} size={140} fgColor="#0f172a" />
                                    </Box>
                                </Box>
                                <CardContent sx={{ p: 4 }}>
                                    <Stack spacing={2}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="h6" fontWeight="950" color="#FFF">{pass.visitorName}</Typography>
                                            <Chip label={pass.visitorType?.toUpperCase()} size="small" sx={{ bgcolor: pass.visitorType === 'contractor' ? alpha('#f59e0b', 0.15) : pass.visitorType === 'delivery' ? alpha('#3b82f6', 0.15) : alpha(binThemeTokens.gold, 0.15), color: pass.visitorType === 'contractor' ? '#f59e0b' : pass.visitorType === 'delivery' ? '#3b82f6' : binThemeTokens.gold, fontWeight: 950, fontSize: '0.6rem' }} />
                                        </Box>
                                        <Typography variant="body2" color="textSecondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Phone size={14} /> {pass.visitorPhone || 'No Phone Registered'}</Typography>
                                        <Typography variant="body2" color="textSecondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Clock size={14} /> {pass.duration} Hours Validity</Typography>
                                        <Typography variant="caption" color="textSecondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontFamily: 'monospace' }}><Calendar size={13} /> {pass.createdAt?.toDate ? pass.createdAt.toDate().toLocaleString() : 'Just now'}</Typography>
                                        <Box sx={{ pt: 1, display: 'flex', justifyContent: 'flex-end' }}><Button variant="outlined" color="error" size="small" onClick={() => handleRevokePass(pass.id)} startIcon={<Trash2 size={14} />} sx={{ fontWeight: 900, borderRadius: 2 }}>REVOKE</Button></Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', minWidth: { xs: '90%', sm: 480 } } }}>
                <form onSubmit={handleCreatePass}>
                    <DialogTitle sx={{ p: 4, pb: 0, fontWeight: 950, color: binThemeTokens.gold, textTransform: 'uppercase', letterSpacing: 2 }}>Generate Access Pass</DialogTitle>
                    <DialogContent sx={{ p: 4 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 3 }}>Generate a security-cleared entry pass. The QR code can be screenshotted and shared with your visitor.</Typography>
                        <Stack spacing={3}>
                            <TextField fullWidth label="Visitor Full Name *" required value={visitorName} onChange={e => setVisitorName(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} />
                            <TextField fullWidth label="Visitor Phone Number" value={visitorPhone} onChange={e => setVisitorPhone(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="filled"><InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Visitor Type</InputLabel><Select value={visitorType} onChange={e => setVisitorType(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}><MenuItem value="visitor">Guest / Family</MenuItem><MenuItem value="contractor">Contractor / Support</MenuItem><MenuItem value="delivery">Delivery Driver</MenuItem></Select></FormControl>
                                </Grid>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="filled"><InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Validity</InputLabel><Select value={duration} onChange={e => setDuration(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}><MenuItem value="1">1 Hour</MenuItem><MenuItem value="4">4 Hours</MenuItem><MenuItem value="12">12 Hours</MenuItem><MenuItem value="24">24 Hours</MenuItem></Select></FormControl>
                                </Grid>
                            </Grid>
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ p: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}><Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button><Button type="submit" variant="contained" disabled={submitting || !visitorName.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.2, borderRadius: 3 }}>{submitting ? <CircularProgress size={20} color="inherit" /> : 'GENERATE PASS'}</Button></DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}
