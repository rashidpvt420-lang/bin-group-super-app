/**
 * DigitalTwinTab — Admin Panel / Owner Portal
 * Displays the complete physical asset inventory for a property,
 * using the Digital Twin schema (category, model, serialNumber, installDate, warrantyExpiry).
 */
import React, { useEffect, useState } from 'react';
import {
    Box, Button, Chip, CircularProgress, Dialog, DialogContent,
    DialogTitle, Divider, Grid, IconButton, Paper, TextField,
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

const STATUS_CHIP: Record<string, { color: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
    healthy: { color: 'success', label: 'Healthy' },
    degraded: { color: 'warning', label: 'Degraded' },
    critical: { color: 'error', label: 'Critical' },
    under_maintenance: { color: 'default', label: 'In Service' },
};

const CATEGORIES = ['AC', 'Pump', 'Elevator', 'Electrical', 'Plumbing', 'Other'];

function isWarrantyExpired(warrantyExpiry: string) {
    return warrantyExpiry && new Date(warrantyExpiry) < new Date();
}

function AddAssetDialog({ propertyId, open, onClose }: { propertyId: string; open: boolean; onClose: () => void }) {
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

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight="bold">Register New Asset</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth>
                            <InputLabel>Category</InputLabel>
                            <Select value={form.category || 'AC'} label="Category" onChange={handleChange('category')}>
                                {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth>
                            <InputLabel>Status</InputLabel>
                            <Select value={form.status || 'healthy'} label="Status" onChange={handleChange('status')}>
                                {Object.entries(STATUS_CHIP).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    {([
                        ['name', 'Asset Name'],
                        ['model', 'Model / Make'],
                        ['serialNumber', 'Serial Number'],
                        ['assetTag', 'Asset Tag'],
                        ['floor', 'Floor / Location'],
                        ['installDate', 'Install Date'],
                        ['warrantyExpiry', 'Warranty Expiry'],
                        ['notes', 'Notes'],
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
                    <Button variant="outlined" onClick={onClose}>Cancel</Button>
                    <Button variant="contained" sx={{ bgcolor: '#0f172a' }} onClick={handleSave} disabled={saving}>
                        {saving ? <CircularProgress size={20} /> : 'Register Asset'}
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

    return (
        <Box>
            {/* Summary bar */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                <Typography variant="h6" fontWeight="bold" sx={{ flex: 1 }}>
                    🔩 Digital Twin — Asset Registry
                </Typography>
                {[
                    { label: `${stats.total} Total`, color: '#64748b' },
                    { label: `${stats.healthy} Healthy`, color: '#10b981' },
                    { label: `${stats.critical} Critical`, color: '#ef4444' },
                    { label: `${stats.expired} Warranty Expired`, color: '#f59e0b' },
                ].map(s => (
                    <Chip key={s.label} label={s.label} size="small"
                        sx={{ bgcolor: `${s.color}20`, color: s.color, fontWeight: 700, fontSize: 11 }} />
                ))}
                {!readOnly && (
                    <Button startIcon={<AddIcon />} variant="contained"
                        sx={{ bgcolor: '#0f172a', borderRadius: 2, fontWeight: 'bold', ml: 'auto' }}
                        onClick={() => setDialog(true)}
                    >
                        Add Asset
                    </Button>
                )}
            </Box>

            {/* Category filter */}
            <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                {['all', ...CATEGORIES].map(cat => (
                    <Chip key={cat} label={cat === 'all' ? 'All' : cat}
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
                    <Typography color="text.secondary">No assets registered yet.</Typography>
                    {!readOnly && (
                        <Button sx={{ mt: 2 }} variant="outlined" startIcon={<AddIcon />} onClick={() => setDialog(true)}>
                            Register First Asset
                        </Button>
                    )}
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 3, border: '1px solid #f1f5f9' }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                {['Category', 'Name / Tag', 'Model', 'Serial #', 'Install Date', 'Warranty', 'Status', 'Floor'].map(h => (
                                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, letterSpacing: 0.5, color: '#64748b' }}>
                                        {h.toUpperCase()}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.map(asset => {
                                const expired = isWarrantyExpired(asset.warrantyExpiry);
                                return (
                                    <TableRow key={asset.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                {CATEGORY_ICONS[asset.category]}
                                                <Typography fontSize={12} fontWeight={600}>{asset.category}</Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Typography fontSize={12} fontWeight={700}>{asset.name}</Typography>
                                            {asset.assetTag && <Typography fontSize={10} color="text.secondary">{asset.assetTag}</Typography>}
                                        </TableCell>
                                        <TableCell><Typography fontSize={12}>{asset.model}</Typography></TableCell>
                                        <TableCell><Typography fontSize={11} fontFamily="monospace">{asset.serialNumber}</Typography></TableCell>
                                        <TableCell><Typography fontSize={12}>{asset.installDate?.slice(0, 10)}</Typography></TableCell>
                                        <TableCell>
                                            <Tooltip title={expired ? 'Warranty Expired' : 'Under Warranty'}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
                                        <TableCell>
                                            <Chip
                                                label={STATUS_CHIP[asset.status]?.label || asset.status}
                                                color={STATUS_CHIP[asset.status]?.color || 'default'}
                                                size="small" sx={{ fontWeight: 700, fontSize: 10 }}
                                            />
                                        </TableCell>
                                        <TableCell><Typography fontSize={12}>{asset.floor || '—'}</Typography></TableCell>
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
