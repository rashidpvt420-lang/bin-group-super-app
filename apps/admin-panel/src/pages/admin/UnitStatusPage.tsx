// admin-panel/src/pages/admin/UnitStatusPage.tsx
import React, { useState, useEffect } from 'react';
import {
    Box,
    Container,
    Typography,
    Grid,
    Paper,
    TextField,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
    InputAdornment,
    alpha,
    CircularProgress
} from '@mui/material';
import { 
    Search, 
    Home, 
    Settings, 
    CheckCircle2, 
    MoreVertical,
    Save,
    X,
    LayoutGrid,
    History
} from 'lucide-react';
import { db, functions } from '../../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { binThemeTokens } from '../../theme/adminTheme';
import { useLanguage } from '@bin/shared';

interface Unit {
    id: string;
    unitNumber: string;
    floorNumber?: string | number;
    occupancyStatus: 'vacant' | 'occupied' | 'under_maintenance' | 'VACANT' | 'OCCUPIED' | 'UNDER_MAINTENANCE' | string;
    tenantStatus: 'none' | 'invited' | 'active' | 'moved_out' | string;
    maintenanceStatus: 'normal' | 'under_maintenance' | 'blocked' | string;
    propertyId: string;
    tenantId?: string | null;
    tenantName?: string;
    tenantEmail?: string;
    adminStatusNotes?: string;
    statusUpdatedAt?: any;
    statusUpdatedBy?: string;
}

interface Property {
    id: string;
    name: string;
}

export default function UnitStatusPage() {
    const { isRTL } = useLanguage();
    const [properties, setProperties] = useState<Property[]>([]);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
    const [units, setUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    
    // Edit Modal State
    const [openEdit, setOpenEdit] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
    const [editData, setEditData] = useState({
        occupancyStatus: 'vacant',
        tenantStatus: 'none',
        maintenanceStatus: 'normal',
        adminStatusNotes: ''
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'properties'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || doc.data().propertyName || 'Unnamed Property'
            }));
            setProperties(fetched);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!selectedPropertyId) {
            setUnits([]);
            return;
        }

        setLoading(true);
        const q = query(collection(db, 'units'), where('propertyId', '==', selectedPropertyId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Unit[];
            setUnits(fetched);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching units:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedPropertyId]);

    const handleEditOpen = (unit: Unit) => {
        setSelectedUnit(unit);
        setEditData({
            occupancyStatus: unit.occupancyStatus || 'vacant',
            tenantStatus: unit.tenantStatus || 'none',
            maintenanceStatus: unit.maintenanceStatus || 'normal',
            adminStatusNotes: unit.adminStatusNotes || ''
        });
        setOpenEdit(true);
    };

    const handleSave = async () => {
        if (!selectedUnit) return;
        setSubmitting(true);
        try {
            const updateUnitOpsState = httpsCallable(functions, 'updateUnitOpsState');
            await updateUnitOpsState({
                unitId: selectedUnit.id,
                ...editData
            });
            setOpenEdit(false);
        } catch (error: any) {
            console.error("Error updating unit:", error);
            alert(error.message || "Failed to update unit status.");
        } finally {
            setSubmitting(false);
        }
    };

    const filteredUnits = units.filter(unit => {
        const matchesSearch = 
            unit.unitNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            unit.tenantName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            unit.tenantEmail?.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesFilter = filterStatus === 'all' || unit.occupancyStatus === filterStatus;
        
        return matchesSearch && matchesFilter;
    });

    const stats = {
        total: units.length,
        occupied: units.filter(u => u.occupancyStatus === 'occupied' || u.occupancyStatus === 'OCCUPIED').length,
        vacant: units.filter(u => u.occupancyStatus === 'vacant' || u.occupancyStatus === 'VACANT').length,
        maintenance: units.filter(u => u.occupancyStatus === 'under_maintenance' || u.maintenanceStatus === 'under_maintenance').length
    };

    const getOccupancyColor = (status: string) => {
        const s = status?.toLowerCase();
        switch (s) {
            case 'occupied': return 'success';
            case 'vacant': return 'info';
            case 'under_maintenance': return 'warning';
            default: return 'default';
        }
    };

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="h3" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1 }}>
                    UNIT STATUS CONTROL
                </Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>
                    Institutional Oversight of Asset Occupancy & Lifecycle
                </Typography>
            </Box>

            {/* Selector & Stats */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <FormControl fullWidth>
                            <InputLabel id="property-select-label">Select Institutional Property</InputLabel>
                            <Select
                                labelId="property-select-label"
                                value={selectedPropertyId}
                                label="Select Institutional Property"
                                onChange={(e) => setSelectedPropertyId(e.target.value)}
                                sx={{ borderRadius: 3 }}
                            >
                                <MenuItem value=""><em>None</em></MenuItem>
                                {properties.map(p => (
                                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={8}>
                    <Grid container spacing={2}>
                        {[
                            { label: 'TOTAL UNITS', value: stats.total, icon: <LayoutGrid />, color: binThemeTokens.gold },
                            { label: 'OCCUPIED', value: stats.occupied, icon: <CheckCircle2 />, color: '#10b981' },
                            { label: 'VACANT', value: stats.vacant, icon: <Home />, color: '#3b82f6' },
                            { label: 'MAINTENANCE', value: stats.maintenance, icon: <Settings />, color: '#f59e0b' }
                        ].map((stat, i) => (
                            <Grid item xs={6} sm={3} key={i}>
                                <Paper sx={{ p: 2, textAlign: 'center', bgcolor: alpha(stat.color, 0.05), borderColor: alpha(stat.color, 0.2) }}>
                                    <Box sx={{ color: stat.color, mb: 1 }}>{stat.icon}</Box>
                                    <Typography variant="h4" sx={{ fontWeight: 900, color: stat.color }}>{stat.value}</Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 900, color: binThemeTokens.textSecondary }}>{stat.label}</Typography>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Grid>
            </Grid>

            {selectedPropertyId && (
                <>
                    {/* Filters */}
                    <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <TextField
                            placeholder="Search Unit / Tenant / Email..."
                            size="small"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            sx={{ flexGrow: 1, minWidth: 300 }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search size={18} />
                                    </InputAdornment>
                                ),
                                sx: { borderRadius: 3 }
                            }}
                        />
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <Select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                sx={{ borderRadius: 3 }}
                            >
                                <MenuItem value="all">All Statuses</MenuItem>
                                <MenuItem value="vacant">Vacant</MenuItem>
                                <MenuItem value="occupied">Occupied</MenuItem>
                                <MenuItem value="under_maintenance">Under Maintenance</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>

                    {/* Table */}
                    <TableContainer component={Paper} sx={{ borderRadius: 4 }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>UNIT</TableCell>
                                    <TableCell>OCCUPANCY</TableCell>
                                    <TableCell>TENANT STATUS</TableCell>
                                    <TableCell>MAINTENANCE</TableCell>
                                    <TableCell>LAST UPDATE</TableCell>
                                    <TableCell align="right">ACTIONS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                                            <CircularProgress color="primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredUnits.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                                                No units found matching your criteria.
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredUnits.map((unit) => (
                                    <TableRow key={unit.id} hover>
                                        <TableCell>
                                            <Typography variant="subtitle2" fontWeight={900}>{unit.unitNumber}</Typography>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>Floor {unit.floorNumber || '0'}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={unit.occupancyStatus?.toUpperCase() || 'UNKNOWN'} 
                                                size="small" 
                                                color={getOccupancyColor(unit.occupancyStatus) as any}
                                                sx={{ fontWeight: 900, fontSize: '0.65rem' }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Box>
                                                <Typography variant="body2" fontWeight={700}>{unit.tenantName || '—'}</Typography>
                                                <Chip 
                                                    label={unit.tenantStatus?.toUpperCase() || 'NONE'} 
                                                    size="small" 
                                                    variant="outlined"
                                                    sx={{ height: 20, fontSize: '0.6rem', fontWeight: 900, mt: 0.5 }}
                                                />
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={unit.maintenanceStatus?.toUpperCase() || 'NORMAL'} 
                                                size="small"
                                                variant="outlined"
                                                sx={{ 
                                                    fontWeight: 900, 
                                                    fontSize: '0.65rem',
                                                    borderColor: unit.maintenanceStatus === 'normal' ? alpha('#10b981', 0.3) : (unit.maintenanceStatus ? alpha('#ef4444', 0.3) : alpha('#10b981', 0.3)),
                                                    color: unit.maintenanceStatus === 'normal' ? '#10b981' : (unit.maintenanceStatus ? '#ef4444' : '#10b981')
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <History size={14} color={binThemeTokens.textSecondary} />
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>
                                                    {unit.statusUpdatedAt?.toDate ? unit.statusUpdatedAt.toDate().toLocaleString() : 'N/A'}
                                                </Typography>
                                            </Box>
                                            {unit.statusUpdatedBy && (
                                                <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontSize: '0.6rem' }}>
                                                    BY {unit.statusUpdatedBy.slice(0, 8)}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="right">
                                            <IconButton onClick={() => handleEditOpen(unit)} sx={{ color: binThemeTokens.gold }}>
                                                <MoreVertical size={20} />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            )}

            {/* Edit Modal */}
            <Dialog 
                open={openEdit} 
                onClose={() => setOpenEdit(false)}
                fullWidth 
                maxWidth="sm"
                PaperProps={{ sx: { borderRadius: 4, bgcolor: binThemeTokens.graphite } }}
            >
                <DialogTitle sx={{ fontWeight: 900, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: binThemeTokens.gold }}>
                    <Box>
                        UNIT {selectedUnit?.unitNumber} STATUS CONTROL
                        <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.textSecondary, fontWeight: 500 }}>
                            Update lifecycle state and maintenance block status.
                        </Typography>
                    </Box>
                    <IconButton onClick={() => setOpenEdit(false)} sx={{ color: binThemeTokens.textSecondary }}><X size={20} /></IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ borderColor: alpha(binThemeTokens.gold, 0.1) }}>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <FormControl fullWidth>
                            <InputLabel>Occupancy Status</InputLabel>
                            <Select
                                value={editData.occupancyStatus}
                                label="Occupancy Status"
                                onChange={(e) => setEditData({...editData, occupancyStatus: e.target.value as any})}
                                sx={{ borderRadius: 3 }}
                            >
                                <MenuItem value="vacant">Vacant</MenuItem>
                                <MenuItem value="occupied">Occupied</MenuItem>
                                <MenuItem value="under_maintenance">Under Maintenance</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl fullWidth>
                            <InputLabel>Tenant Lifecycle Status</InputLabel>
                            <Select
                                value={editData.tenantStatus}
                                label="Tenant Lifecycle Status"
                                onChange={(e) => setEditData({...editData, tenantStatus: e.target.value as any})}
                                sx={{ borderRadius: 3 }}
                            >
                                <MenuItem value="none">None</MenuItem>
                                <MenuItem value="invited">Invited</MenuItem>
                                <MenuItem value="active">Active</MenuItem>
                                <MenuItem value="moved_out">Moved Out</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl fullWidth>
                            <InputLabel>Maintenance Health</InputLabel>
                            <Select
                                value={editData.maintenanceStatus}
                                label="Maintenance Health"
                                onChange={(e) => setEditData({...editData, maintenanceStatus: e.target.value as any})}
                                sx={{ borderRadius: 3 }}
                            >
                                <MenuItem value="normal">Normal</MenuItem>
                                <MenuItem value="under_maintenance">Under Maintenance</MenuItem>
                                <MenuItem value="blocked">Blocked / Critical</MenuItem>
                            </Select>
                        </FormControl>

                        <TextField
                            label="Administrative Notes"
                            multiline
                            rows={4}
                            fullWidth
                            value={editData.adminStatusNotes}
                            onChange={(e) => setEditData({...editData, adminStatusNotes: e.target.value})}
                            placeholder="Reason for status change or internal operational notes..."
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenEdit(false)} sx={{ color: binThemeTokens.textSecondary }}>Cancel</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleSave} 
                        disabled={submitting}
                        startIcon={submitting ? <CircularProgress size={18} /> : <Save size={18} />}
                        sx={{ px: 4, borderRadius: 100 }}
                    >
                        Commit Status Change
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
