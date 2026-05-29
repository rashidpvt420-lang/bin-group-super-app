import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Paper, Stack, Chip, Button, CircularProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, InputAdornment, Select, MenuItem, FormControl,
    Alert, IconButton, Tooltip
} from '@mui/material';
import {
    FileText, Search, Plus, Eye, CheckCircle2,
    XCircle, Clock, ShieldAlert
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, collection, query, orderBy, onSnapshot } from '../../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import LaunchStatusBanner from '../../components/LaunchStatusBanner';
import { filterLaunchRecords, comingSoon } from '../../utils/launchDataHygiene';
import { BIN_CONTRACT_TYPES } from '../../../utils/uaePricingMatrix2026';

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
    ACTIVE:    { color: '#4ade80', icon: <CheckCircle2 size={14} /> },
    PENDING:   { color: '#f59e0b', icon: <Clock size={14} /> },
    EXPIRED:   { color: '#ef4444', icon: <XCircle size={14} /> },
    DRAFT:     { color: '#94a3b8', icon: <FileText size={14} /> },
    SUSPENDED: { color: '#f97316', icon: <XCircle size={14} /> },
};

const CONTRACT_TYPES = ['ALL', ...Object.keys(BIN_CONTRACT_TYPES)];
const TYPE_LABELS: Record<string, string> = { ALL: 'All Types', ...BIN_CONTRACT_TYPES };
const HIDDEN_STATUSES = new Set(['ARCHIVED', 'ARCHIVED_BY_ADMIN_CLEANUP', 'DELETED', 'TEST', 'DEMO']);

export default function AdminContractsPage() {
    const navigate = useNavigate();
    const [contracts, setContracts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    useEffect(() => {
        const q = query(collection(db, 'contracts'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            setError(err.message);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const launchContracts = useMemo(
        () => filterLaunchRecords(contracts).filter(c => !HIDDEN_STATUSES.has(String(c.status || '').toUpperCase())),
        [contracts]
    );

    const filtered = launchContracts.filter(c => {
        const matchSearch = !search || [c.propertyName, c.ownerName, c.ownerEmail, c.id]
            .some(v => String(v || '').toLowerCase().includes(search.toLowerCase()));
        const matchType = typeFilter === 'ALL' || c.contractType === typeFilter || c.selectedPlan?.id === typeFilter;
        const matchStatus = statusFilter === 'ALL' || String(c.status || 'DRAFT').toUpperCase() === statusFilter;
        return matchSearch && matchType && matchStatus;
    });

    const stats = {
        total: launchContracts.length,
        active: launchContracts.filter(c => String(c.status || '').toUpperCase() === 'ACTIVE').length,
        pending: launchContracts.filter(c => ['PENDING', 'PENDING_SIGNATURE', 'AWAITING_SIGNATURE', 'DRAFT'].includes(String(c.status || '').toUpperCase())).length,
        expired: launchContracts.filter(c => String(c.status || '').toUpperCase() === 'EXPIRED').length,
    };

    const cellSx = { color: 'rgba(255,255,255,0.75)', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.82rem' };
    const headerSx = { color: '#C6A75E', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.75rem', letterSpacing: 1, textTransform: 'uppercase' as const };

    return (
        <AdminPageFrame
            title="Contracts Registry"
            subtitle="Production contracts only. Demo, E2E and archived records are hidden from the launch view."
            breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Contracts' }]}
        >
            <LaunchStatusBanner
                title="Contract actions are setup-protected"
                message="New contract generation, activation and e-signature sending must run through approved owner onboarding. Manual shortcuts are locked until the workflow is connected end-to-end."
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 4 }}>
                {[
                    { label: 'Total Contracts', value: stats.total, color: '#C6A75E' },
                    { label: 'Active', value: stats.active, color: '#4ade80' },
                    { label: 'Pending', value: stats.pending, color: '#f59e0b' },
                    { label: 'Expired', value: stats.expired, color: '#ef4444' },
                ].map(kpi => (
                    <Paper key={kpi.label} sx={{ flex: 1, p: 3, bgcolor: 'rgba(22,22,24,0.8)', border: `1px solid ${kpi.color}22`, borderRadius: 3 }}>
                        <Typography variant="h4" fontWeight="900" sx={{ color: kpi.color }}>{kpi.value}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{kpi.label}</Typography>
                    </Paper>
                ))}
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }} alignItems="stretch">
                <TextField
                    size="small" placeholder="Search property, owner, email..."
                    value={search} onChange={e => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} color="rgba(255,255,255,0.4)" /></InputAdornment> }}
                    sx={{ flex: 1, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }, '& .MuiInputBase-input': { color: '#FFF' } }}
                />
                <FormControl size="small" sx={{ minWidth: 180 }}>
                    <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' }, '& .MuiSvgIcon-root': { color: '#FFF' } }}>
                        {CONTRACT_TYPES.map(t => <MenuItem key={t} value={t} sx={{ color: '#FFF', bgcolor: '#111' }}>{TYPE_LABELS[t]}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                    <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' }, '& .MuiSvgIcon-root': { color: '#FFF' } }}>
                        {['ALL', 'ACTIVE', 'PENDING', 'EXPIRED', 'DRAFT'].map(s => (
                            <MenuItem key={s} value={s} sx={{ color: '#FFF', bgcolor: '#111' }}>{s === 'ALL' ? 'All Statuses' : s}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => comingSoon('Create contracts from Owner Verification after payment, documents and location are approved. Direct manual creation is locked for launch safety.')} sx={{ bgcolor: '#C6A75E', color: '#000', fontWeight: 900, borderRadius: 2, whiteSpace: 'nowrap' }}>
                    New Contract
                </Button>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress sx={{ color: '#C6A75E' }} /></Box>
            ) : filtered.length === 0 ? (
                <Paper sx={{ p: { xs: 4, md: 6 }, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
                    <FileText size={48} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 12px' }} />
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>No launch-ready contracts found</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.32)', mt: 1 }}>Approve an owner onboarding record to create a production contract. Demo and E2E records are hidden.</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <Table>
                        <TableHead><TableRow>{['Property', 'Owner', 'Contract Type', 'Annual Value', 'Start Date', 'Status', 'Actions'].map(h => <TableCell key={h} sx={headerSx}>{h}</TableCell>)}</TableRow></TableHead>
                        <TableBody>
                            {filtered.map(c => {
                                const status = String(c.status || 'DRAFT').toUpperCase();
                                const sCfg = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
                                const contractType = c.contractType || c.selectedPlan?.id || '—';
                                return (
                                    <TableRow key={c.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                        <TableCell sx={{ ...cellSx, color: '#FFF', fontWeight: 700 }}>{c.propertyName || '—'}</TableCell>
                                        <TableCell sx={cellSx}><Box><Typography variant="caption" sx={{ color: '#FFF', fontWeight: 700, display: 'block' }}>{c.ownerName || '—'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{c.ownerEmail || ''}</Typography></Box></TableCell>
                                        <TableCell sx={cellSx}><Chip label={TYPE_LABELS[contractType] || contractType} size="small" sx={{ bgcolor: 'rgba(198,167,94,0.1)', color: '#C6A75E', fontWeight: 700, fontSize: '0.7rem' }} /></TableCell>
                                        <TableCell sx={{ ...cellSx, color: '#C6A75E', fontWeight: 900 }}>{c.annualValue ? `AED ${Number(c.annualValue).toLocaleString()}` : '—'}</TableCell>
                                        <TableCell sx={cellSx}>{c.startDate ? new Date(c.startDate?.seconds * 1000).toLocaleDateString() : c.createdAt ? new Date(c.createdAt?.seconds * 1000).toLocaleDateString() : '—'}</TableCell>
                                        <TableCell sx={cellSx}><Stack direction="row" spacing={0.5} alignItems="center"><Box sx={{ color: sCfg.color }}>{sCfg.icon}</Box><Chip label={status} size="small" sx={{ bgcolor: `${sCfg.color}18`, color: sCfg.color, fontWeight: 900, fontSize: '0.7rem' }} /></Stack></TableCell>
                                        <TableCell sx={cellSx}><Stack direction="row" spacing={0.5}>{status !== 'ACTIVE' && <Tooltip title="Activation locked to approval workflow"><IconButton size="small" onClick={() => comingSoon('Activate from Owner Verification approval. Manual activation is blocked for launch safety.')} sx={{ color: '#f59e0b', '&:hover': { bgcolor: 'rgba(245,158,11,0.1)' } }}><ShieldAlert size={16} /></IconButton></Tooltip>}<Tooltip title="View Property Passport"><IconButton size="small" onClick={() => navigate('/admin/properties/passport')} sx={{ color: '#C6A75E', '&:hover': { bgcolor: 'rgba(198,167,94,0.1)' } }}><Eye size={16} /></IconButton></Tooltip></Stack></TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {!loading && filtered.length > 0 && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)', mt: 2, display: 'block', textAlign: 'right' }}>Showing {filtered.length} of {launchContracts.length} launch-ready contracts. Hidden records: {Math.max(contracts.length - launchContracts.length, 0)}</Typography>}
        </AdminPageFrame>
    );
}
