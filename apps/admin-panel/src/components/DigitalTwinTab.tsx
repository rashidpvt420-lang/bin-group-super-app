/**
 * DigitalTwinTab — Admin Panel / Owner Portal
 * Displays the complete physical asset inventory for a property,
 * using the Digital Twin schema (category, model, serialNumber, installDate, warrantyExpiry).
 */
import React, { useEffect, useState } from 'react';
import {
    Box, Button, Chip, CircularProgress, Dialog, DialogContent,
    DialogTitle, Grid, Paper, TextField,
    Typography, MenuItem, Select, FormControl, InputLabel, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import ElevatorIcon from '@mui/icons-material/Elevator';
import BuildIcon from '@mui/icons-material/Build';
import WaterIcon from '@mui/icons-material/Water';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLanguage } from '@bin/shared';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Asset {
    id?: string;
    propertyId: string;
    category: 'AC' | 'Pump' | 'Elevator' | 'Electrical' | 'Plumbing' | 'Other';
    name: string;
    model: string;
    serialNumber: string;
    installDate: string;
    warrantyExpiry: string;
    status: 'healthy' | 'degraded' | 'critical' | 'under_maintenance';
    floor?: string;
    unitId?: string;
    assetTag?: string;
    lastServiceDate?: string;
    notes?: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    AC: <AcUnitIcon fontSize="small" />,
    Elevator: <ElevatorIcon fontSize="small" />,
    Pump: <WaterIcon fontSize="small" />,
    Electrical: <ElectricBoltIcon fontSize="small" />,
    Plumbing: <WaterIcon fontSize="small" />,
    Other: <BuildIcon fontSize="small" />,
};

const CATEGORIES = ['AC', 'Pump', 'Elevator', 'Electrical', 'Plumbing', 'Other'];

function isWarrantyExpired(warrantyExpiry: string) {
    return warrantyExpiry && new Date(warrantyExpiry) < new Date();
}

function AddAssetDialog({ propertyId, open, onClose }: { propertyId: string; open: boolean; onClose: () => void }) {
    const { t } = useLanguage();
    const [form, setForm] = useState<Partial<Asset>>({ propertyId, category: 'AC', status: 'healthy' });
    const [saving, setSaving] = useState(false);

    const handleChange = (field: keyof Asset) => (e: any) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    const handleSave = async () => {
        if (!form.name || !form.model || !form.serialNumber || !form.installDate) return;
        setSaving(true);
        try {
            await addDoc(collection(db, 'assets'), {
                ...form,
                propertyId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            onClose();
            setForm({ propertyId, category: 'AC', status: 'healthy' });
        } finally {
            setSaving(false);
        }
    };

    const STATUS_CHIP: Record<string, { color: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
        healthy: { color: 'success', label: t('dt.healthy') },
        degraded: { color: 'warning', label: t('dt.degraded') },
        critical: { color: 'error', label: t('dt.critical') },
        under_maintenance: { color: 'default', label: t('dt.in_service') },
    };

    const CATEGORY_LABELS: Record<string, string> = {
        AC: t('cat.ac'),
        Pump: t('cat.pump'),
        Elevator: t('cat.elevator'),
        Electrical: t('cat.electrical'),
        Plumbing: t('cat.plumbing'),
        Other: t('cat.other'),
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight="bold">{t('dt.register_new')}</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth>
                            <InputLabel>{t('dt.category')}</InputLabel>
                            <Select value={form.category || 'AC'} label={t('dt.category')} onChange={handleChange('category')}>
                                {CATEGORIES.map(c => <MenuItem key={c} value={c}>{CATEGORY_LABELS[c]}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth>
                            <InputLabel>{t('dt.status')}</InputLabel>
                            <Select value={form.status || 'healthy'} label={t('dt.status')} onChange={handleChange('status')}>
                                {Object.entries(STATUS_CHIP).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    {([
                        ['name', t('dt.asset_name')],
                        ['model', t('dt.model_make')],
                        ['serialNumber', t('dt.serial_number')],
                        ['assetTag', t('dt.asset_tag')],
                        ['floor', t('dt.floor_location')],
                        ['installDate', t('dt.install_date')],
                        ['warrantyExpiry', t('dt.warranty_expiry')],
                        ['notes', t('dt.notes')],
                    ] as [keyof Asset, string][]).map(([field, label]) => (
                        <Grid item xs={12} sm={field === 'notes' ? 12 : 6} key={field}>
                            <TextField
                                fullWidth label={label}
                                type={field.includes('Date') || field.includes('Expiry') ? 'date' : 'text'}
                                InputLabelProps={{ shrink: true }}
                                value={(form as any)[field] || ''}
                                onChange={handleChange(field)}
                            />
                        </Grid>
                    ))}
                </Grid>
                <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <Button variant="outlined" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="contained" sx={{ bgcolor: '#0f172a' }} onClick={handleSave} disabled={saving}>
                        {saving ? <CircularProgress size={20} /> : t('dt.register_asset_btn')}
                    </Button>
                </Box>
            </DialogContent>
        </Dialog>
    );
}

interface Props {
    propertyId: string;
    readOnly?: boolean;
}

export default function DigitalTwinTab({ propertyId, readOnly = false }: Props) {
    const { t, isRTL } = useLanguage();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState(false);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        if (!propertyId) return;
        const q = query(collection(db, 'assets'), where('propertyId', '==', propertyId));
        return onSnapshot(q, snap => {
            setAssets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Asset)));
            setLoading(false);
        });
    }, [propertyId]);

    const filtered = filter === 'all' ? assets : assets.filter(a => a.category === filter);
    const stats = {
        total: assets.length,
        healthy: assets.filter(a => a.status === 'healthy').length,
        critical: assets.filter(a => a.status === 'critical').length,
        expired: assets.filter(a => isWarrantyExpired(a.warrantyExpiry)).length,
    };

    const STATUS_CHIP: Record<string, { color: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
        healthy: { color: 'success', label: t('dt.healthy') },
        degraded: { color: 'warning', label: t('dt.degraded') },
        critical: { color: 'error', label: t('dt.critical') },
        under_maintenance: { color: 'default', label: t('dt.in_service') },
    };

    const CATEGORY_LABELS: Record<string, string> = {
        AC: t('cat.ac'),
        Pump: t('cat.pump'),
        Elevator: t('cat.elevator'),
        Electrical: t('cat.electrical'),
        Plumbing: t('cat.plumbing'),
        Other: t('cat.other'),
    };

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Summary bar */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Typography variant="h6" fontWeight="bold" sx={{ flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
                    🔩 {t('admin.digital_twin_registry')}
                </Typography>
                {[
                    { label: t('dt.stats_total', { count: stats.total }), color: '#64748b' },
                    { label: t('dt.stats_healthy', { count: stats.healthy }), color: '#10b981' },
                    { label: t('dt.stats_critical', { count: stats.critical }), color: '#ef4444' },
                    { label: t('dt.stats_expired', { count: stats.expired }), color: '#f59e0b' },
                ].map(s => (
                    <Chip key={s.label} label={s.label} size="small"
                        sx={{ bgcolor: `${s.color}20`, color: s.color, fontWeight: 700, fontSize: 11 }} />
                ))}
                {!readOnly && (
                    <Button startIcon={<AddIcon />} variant="contained"
                        sx={{ bgcolor: '#0f172a', borderRadius: 2, fontWeight: 'bold', ml: isRTL ? 0 : 'auto', mr: isRTL ? 'auto' : 0 }}
                        onClick={() => setDialog(true)}
                    >
                        {t('dt.add_asset')}
                    </Button>
                )}
            </Box>

            {/* Category filter */}
            <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                {['all', ...CATEGORIES].map(cat => (
                    <Chip key={cat} label={cat === 'all' ? t('dt.all') : CATEGORY_LABELS[cat]}
                        onClick={() => setFilter(cat)}
                        variant={filter === cat ? 'filled' : 'outlined'}
                        sx={{ cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize' }}
                        icon={cat !== 'all' ? CATEGORY_ICONS[cat] as any : undefined}
                    />
                ))}
            </Box>

            {loading ? (
                <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>
            ) : filtered.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', border: '2px dashed #e2e8f0' }}>
                    <BuildIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 2 }} />
                    <Typography color="text.secondary">{t('dt.no_assets')}</Typography>
                    {!readOnly && (
                        <Button sx={{ mt: 2 }} variant="outlined" startIcon={<AddIcon />} onClick={() => setDialog(true)}>
                            {t('dt.register_first')}
                        </Button>
                    )}
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 3, border: '1px solid #f1f5f9' }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                {[
                                    t('dt.table.category'),
                                    t('dt.table.name_tag'),
                                    t('dt.table.model'),
                                    t('dt.table.serial'),
                                    t('dt.table.install_date'),
                                    t('dt.table.warranty'),
                                    t('dt.table.status'),
                                    t('dt.table.floor')
                                ].map(h => (
                                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, letterSpacing: 0.5, color: '#64748b', textAlign: isRTL ? 'right' : 'left' }}>
                                        {h}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.map(asset => {
                                const expired = isWarrantyExpired(asset.warrantyExpiry);
                                return (
                                    <TableRow key={asset.id} hover sx={{ '&:last-child td': { border: 0 }, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                {CATEGORY_ICONS[asset.category]}
                                                <Typography fontSize={12} fontWeight={600}>{CATEGORY_LABELS[asset.category]}</Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography fontSize={12} fontWeight={700}>{asset.name}</Typography>
                                            {asset.assetTag && <Typography fontSize={10} color="text.secondary">{asset.assetTag}</Typography>}
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography fontSize={12}>{asset.model}</Typography></TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography fontSize={11} fontFamily="monospace">{asset.serialNumber}</Typography></TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography fontSize={12}>{asset.installDate?.slice(0, 10)}</Typography></TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Tooltip title={expired ? t('dt.warranty_expired_tooltip') : t('dt.under_warranty_tooltip')}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                    {expired
                                                        ? <WarningAmberIcon sx={{ fontSize: 14, color: '#f59e0b' }} />
                                                        : <CheckCircleIcon sx={{ fontSize: 14, color: '#10b981' }} />
                                                    }
                                                    <Typography fontSize={11} color={expired ? '#f59e0b' : '#10b981'} fontWeight={700}>
                                                        {asset.warrantyExpiry?.slice(0, 10) || 'N/A'}
                                                    </Typography>
                                                </Box>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Chip
                                                label={STATUS_CHIP[asset.status]?.label || asset.status}
                                                color={STATUS_CHIP[asset.status]?.color || 'default'}
                                                size="small" sx={{ fontWeight: 700, fontSize: 10 }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography fontSize={12}>{asset.floor || '—'}</Typography></TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <AddAssetDialog propertyId={propertyId} open={dialog} onClose={() => setDialog(false)} />
        </Box>
    );
}
