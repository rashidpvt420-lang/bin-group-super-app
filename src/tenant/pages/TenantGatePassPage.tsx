import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Paper, Container, Stack, Button, alpha,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    MenuItem, Select, FormControl, InputLabel, Grid, CircularProgress,
    Chip, IconButton, Tooltip,
} from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, Plus, Clock, Trash2, Phone, Calendar, QrCode, X, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { db, collection, addDoc, onSnapshot, query, where, doc, deleteDoc, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

// ── Expiry helpers ─────────────────────────────────────────────────────────────
function getExpiryDate(pass: any): Date | null {
    const created = pass.createdAt?.toDate ? pass.createdAt.toDate() : (pass.createdAt ? new Date(pass.createdAt) : null);
    if (!created) return null;
    const hours = Number(pass.duration || 4);
    return new Date(created.getTime() + hours * 60 * 60 * 1000);
}

function isExpired(pass: any): boolean {
    const expiry = getExpiryDate(pass);
    return expiry ? expiry < new Date() : false;
}

function formatExpiry(pass: any): string {
    const expiry = getExpiryDate(pass);
    if (!expiry) return 'Unknown';
    const now = new Date();
    if (expiry < now) return 'EXPIRED';
    const diffMs = expiry.getTime() - now.getTime();
    const diffH = Math.floor(diffMs / 3_600_000);
    const diffM = Math.floor((diffMs % 3_600_000) / 60_000);
    if (diffH > 0) return `${diffH}h ${diffM}m remaining`;
    return `${diffM}m remaining`;
}

function getVisitorTypeColor(type: string): string {
    if (type === 'contractor') return '#f59e0b';
    if (type === 'delivery') return '#3b82f6';
    return binThemeTokens.gold;
}

// ── QR payload encoder ─────────────────────────────────────────────────────────
function buildQRPayload(pass: any): string {
    return JSON.stringify({
        passId: pass.id,
        type: pass.visitorType,
        visitor: pass.visitorName,
        tenant: pass.tenantName,
        duration: pass.duration,
        issued: pass.createdAt?.toDate ? pass.createdAt.toDate().toISOString() : new Date().toISOString(),
        unit: pass.unitNumber || '',
    });
}

export default function TenantGatePassPage() {
    const { t, isRTL } = useLanguage();
    const { user } = useRole();
    const [passes, setPasses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [visitorName, setVisitorName] = useState('');
    const [visitorPhone, setVisitorPhone] = useState('');
    const [visitorPlate, setVisitorPlate] = useState('');
    const [visitorType, setVisitorType] = useState('visitor');
    const [duration, setDuration] = useState('4');
    const [qrPass, setQrPass] = useState<any>(null);
    const [copied, setCopied] = useState(false);

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
            console.error('Gate passes listener error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, [user?.uid]);

    const activePasses = useMemo(() => passes.filter(p => !isExpired(p) && p.status !== 'revoked'), [passes]);
    const expiredPasses = useMemo(() => passes.filter(p => isExpired(p) || p.status === 'revoked'), [passes]);

    const handleCreatePass = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid || !visitorName.trim()) return;
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'gatePasses'), {
                tenantUid: user.uid,
                tenantName: user.displayName || 'Resident',
                visitorName: visitorName.trim(),
                visitorPhone: visitorPhone.trim(),
                vehiclePlate: visitorPlate.trim(),
                visitorType,
                duration: parseInt(duration, 10),
                status: 'active',
                createdAt: serverTimestamp(),
            });
            setOpenAdd(false);
            setVisitorName('');
            setVisitorPhone('');
            setVisitorPlate('');
            setVisitorType('visitor');
            setDuration('4');
        } catch (err) {
            console.error('Failed to generate gate pass', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevokePass = async (passId: string) => {
        try {
            await deleteDoc(doc(db, 'gatePasses', passId));
        } catch (err) {
            console.error('Failed to revoke pass', err);
        }
    };

    const handleCopyQR = (pass: any) => {
        navigator.clipboard.writeText(buildQRPayload(pass)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const PassCard = ({ pass }: { pass: any }) => {
        const expired = isExpired(pass);
        const typeColor = getVisitorTypeColor(pass.visitorType);
        const expiryText = formatExpiry(pass);
        const qrData = buildQRPayload(pass);

        return (
            <Paper
                sx={{
                    bgcolor: expired ? 'rgba(15,23,42,0.4)' : 'rgba(15,23,42,0.72)',
                    border: `1px solid ${expired ? 'rgba(255,255,255,0.06)' : alpha(typeColor, 0.25)}`,
                    borderRadius: 5,
                    overflow: 'hidden',
                    opacity: expired ? 0.58 : 1,
                    transition: 'all .18s ease',
                    '&:hover': !expired ? { transform: 'translateY(-2px)', borderColor: typeColor } : {},
                }}
            >
                {/* QR Code section */}
                <Box
                    onClick={() => !expired && setQrPass(pass)}
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        p: 3,
                        bgcolor: '#fff',
                        cursor: expired ? 'default' : 'pointer',
                        position: 'relative',
                        minHeight: 160,
                    }}
                >
                    {expired ? (
                        <Box sx={{ textAlign: 'center' }}>
                            <AlertTriangle size={40} color="#ef4444" />
                            <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 950, display: 'block', mt: 1 }}>
                                EXPIRED
                            </Typography>
                        </Box>
                    ) : (
                        <>
                            <QRCodeSVG value={qrData} size={140} bgColor="#ffffff" fgColor="#0f172a" level="M" />
                            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0)', opacity: 0, transition: 'opacity .18s', '&:hover': { opacity: 1, bgcolor: 'rgba(0,0,0,0.08)' } }}>
                                <Chip label="Tap to expand" size="small" icon={<QrCode size={13} />} sx={{ bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', fontWeight: 900 }} />
                            </Box>
                        </>
                    )}
                </Box>

                {/* Pass details */}
                <Box sx={{ p: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                        <Typography variant="h6" fontWeight={950} color="#fff" noWrap sx={{ maxWidth: '70%' }}>
                            {pass.visitorName}
                        </Typography>
                        <Chip
                            label={String(pass.visitorType || 'visitor').toUpperCase()}
                            size="small"
                            sx={{ bgcolor: alpha(typeColor, 0.12), color: typeColor, fontWeight: 950, fontSize: '0.6rem' }}
                        />
                    </Stack>

                    <Stack spacing={0.8}>
                        {pass.visitorPhone && (
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SafeIcon icon={Phone} size={13} /> {pass.visitorPhone}
                            </Typography>
                        )}
                        {pass.vehiclePlate && (
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', gap: 1 }}>
                                🚗 {pass.vehiclePlate}
                            </Typography>
                        )}
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SafeIcon icon={Clock} size={13} /> {pass.duration}h validity
                        </Typography>
                        <Typography variant="caption" sx={{ color: expired ? '#ef4444' : '#10b981', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <SafeIcon icon={Calendar} size={12} /> {expiryText}
                        </Typography>
                    </Stack>

                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        {!expired && (
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<SafeIcon icon={QrCode} size={14} />}
                                onClick={() => setQrPass(pass)}
                                sx={{ flex: 1, borderColor: typeColor, color: typeColor, fontWeight: 950, borderRadius: 2 }}
                            >
                                Show QR
                            </Button>
                        )}
                        <Tooltip title="Revoke pass">
                            <IconButton size="small" onClick={() => handleRevokePass(pass.id)} sx={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 2 }}>
                                <SafeIcon icon={Trash2} size={15} />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Box>
            </Paper>
        );
    };

    return (
        <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Header */}
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
                        QR ACCESS CONTROL
                    </Typography>
                    <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, mt: 0.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <SafeIcon icon={ShieldCheck} size={32} style={{ color: binThemeTokens.gold }} />
                        {t('tenant.gatePasses.title') || 'Gate Passes'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.48)', mt: 0.5 }}>
                        {t('tenant.gatePasses.desc') || 'Generate QR-coded access passes for visitors, contractors, and deliveries.'}
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<SafeIcon icon={Plus} size={18} />}
                    onClick={() => setOpenAdd(true)}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, px: 3, py: 1.3, flexShrink: 0 }}
                >
                    Generate Pass
                </Button>
            </Stack>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                    <CircularProgress sx={{ color: binThemeTokens.gold }} />
                </Box>
            ) : passes.length === 0 ? (
                <Paper sx={{ p: { xs: 6, md: 10 }, textAlign: 'center', bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px dashed ${alpha(binThemeTokens.gold, 0.22)}`, borderRadius: 6 }}>
                    <SafeIcon icon={QrCode} size={52} style={{ color: binThemeTokens.gold, marginBottom: 16 }} />
                    <Typography sx={{ color: '#fff', fontWeight: 950, mb: 1 }}>No Gate Passes Yet</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.42)', mb: 3 }}>
                        Tap "Generate Pass" to create a QR-coded visitor access pass. Security can scan the code at the gate.
                    </Typography>
                    <Button variant="contained" startIcon={<SafeIcon icon={Plus} size={18} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                        Generate First Pass
                    </Button>
                </Paper>
            ) : (
                <Stack spacing={4}>
                    {activePasses.length > 0 && (
                        <Box>
                            <Typography variant="overline" sx={{ color: '#10b981', fontWeight: 950, letterSpacing: 2, mb: 2, display: 'block' }}>
                                ACTIVE PASSES ({activePasses.length})
                            </Typography>
                            <Grid container spacing={3}>
                                {activePasses.map(pass => (
                                    <Grid item xs={12} sm={6} lg={4} key={pass.id}>
                                        <PassCard pass={pass} />
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    )}
                    {expiredPasses.length > 0 && (
                        <Box>
                            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 950, letterSpacing: 2, mb: 2, display: 'block' }}>
                                EXPIRED / REVOKED
                            </Typography>
                            <Grid container spacing={3}>
                                {expiredPasses.map(pass => (
                                    <Grid item xs={12} sm={6} lg={4} key={pass.id}>
                                        <PassCard pass={pass} />
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    )}
                </Stack>
            )}

            {/* ── Full-screen QR Modal ──────────────────────────────────────────── */}
            <Dialog
                open={!!qrPass}
                onClose={() => setQrPass(null)}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: '#020617',
                        border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`,
                        borderRadius: 6,
                        overflow: 'hidden',
                    },
                }}
            >
                {qrPass && (
                    <>
                        <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', p: { xs: 3, md: 4 }, pb: 2 }}>
                            <IconButton onClick={() => setQrPass(null)} sx={{ position: 'absolute', top: 12, right: 12, color: 'rgba(255,255,255,0.5)' }}>
                                <X size={18} />
                            </IconButton>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3, mb: 0.5 }}>
                                ACCESS PASS
                            </Typography>
                            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mb: 0.5, textAlign: 'center' }}>
                                {qrPass.visitorName}
                            </Typography>
                            <Chip
                                label={String(qrPass.visitorType || 'visitor').toUpperCase()}
                                size="small"
                                sx={{ bgcolor: alpha(getVisitorTypeColor(qrPass.visitorType), 0.12), color: getVisitorTypeColor(qrPass.visitorType), fontWeight: 950, mb: 3 }}
                            />

                            {/* Large QR */}
                            <Box sx={{ p: 3, bgcolor: '#fff', borderRadius: 4, mb: 3 }}>
                                <QRCodeSVG
                                    value={buildQRPayload(qrPass)}
                                    size={220}
                                    bgColor="#ffffff"
                                    fgColor="#0f172a"
                                    level="H"
                                    includeMargin={false}
                                />
                            </Box>

                            {/* Pass details */}
                            <Stack spacing={1} sx={{ width: '100%', mb: 2 }}>
                                {qrPass.vehiclePlate && (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1 }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>PLATE</Typography>
                                        <Typography variant="caption" sx={{ color: '#fff', fontWeight: 950 }}>{qrPass.vehiclePlate}</Typography>
                                    </Box>
                                )}
                                {qrPass.visitorPhone && (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1 }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>PHONE</Typography>
                                        <Typography variant="caption" sx={{ color: '#fff', fontWeight: 950 }}>{qrPass.visitorPhone}</Typography>
                                    </Box>
                                )}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1 }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>VALIDITY</Typography>
                                    <Typography variant="caption" sx={{ color: '#fff', fontWeight: 950 }}>{qrPass.duration}h</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1 }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>EXPIRES</Typography>
                                    <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 950 }}>{formatExpiry(qrPass)}</Typography>
                                </Box>
                            </Stack>

                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.28)', textAlign: 'center', mb: 2 }}>
                                Security staff can scan this QR to verify visitor identity and access authorization.
                            </Typography>
                        </Box>
                        <DialogActions sx={{ p: 3, pt: 0, gap: 1.5, flexDirection: 'column' }}>
                            <Button
                                fullWidth
                                variant="outlined"
                                startIcon={<SafeIcon icon={copied ? CheckCircle2 : Copy} size={16} />}
                                onClick={() => handleCopyQR(qrPass)}
                                sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3 }}
                            >
                                {copied ? 'Copied!' : 'Copy Pass Data'}
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            {/* ── Create Pass Dialog ────────────────────────────────────────────── */}
            <Dialog
                open={openAdd}
                onClose={() => setOpenAdd(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' } }}
            >
                <form onSubmit={handleCreatePass}>
                    <DialogTitle sx={{ p: 4, pb: 2, fontWeight: 950, color: binThemeTokens.gold, letterSpacing: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        Generate Access Pass
                        <IconButton onClick={() => setOpenAdd(false)} size="small" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                            <X size={18} />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent sx={{ p: 4, pt: 1 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 3 }}>
                            A QR-coded pass will be generated. Security can scan it at the building entrance.
                        </Typography>
                        <Stack spacing={2.5}>
                            <TextField
                                fullWidth
                                label="Visitor Full Name *"
                                required
                                value={visitorName}
                                onChange={e => setVisitorName(e.target.value)}
                                variant="outlined"
                                sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } }}
                            />
                            <TextField
                                fullWidth
                                label="Phone Number"
                                value={visitorPhone}
                                onChange={e => setVisitorPhone(e.target.value)}
                                variant="outlined"
                                sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } }}
                            />
                            <TextField
                                fullWidth
                                label="Vehicle Plate Number (optional)"
                                value={visitorPlate}
                                onChange={e => setVisitorPlate(e.target.value)}
                                variant="outlined"
                                placeholder="e.g. A 12345 DXB"
                                sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } }}
                            />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="outlined">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Visitor Type</InputLabel>
                                        <Select
                                            value={visitorType}
                                            label="Visitor Type"
                                            onChange={e => setVisitorType(e.target.value)}
                                            sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }}
                                        >
                                            <MenuItem value="visitor">Guest / Family</MenuItem>
                                            <MenuItem value="contractor">Contractor</MenuItem>
                                            <MenuItem value="delivery">Delivery</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="outlined">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Validity</InputLabel>
                                        <Select
                                            value={duration}
                                            label="Validity"
                                            onChange={e => setDuration(e.target.value)}
                                            sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }}
                                        >
                                            <MenuItem value="1">1 Hour</MenuItem>
                                            <MenuItem value="4">4 Hours</MenuItem>
                                            <MenuItem value="12">12 Hours</MenuItem>
                                            <MenuItem value="24">24 Hours</MenuItem>
                                            <MenuItem value="72">3 Days</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                            </Grid>
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ p: 4, pt: 0, gap: 1.5 }}>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Cancel</Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={submitting || !visitorName.trim()}
                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, borderRadius: 3 }}
                        >
                            {submitting ? <CircularProgress size={20} sx={{ color: '#000' }} /> : 'Generate QR Pass'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}
