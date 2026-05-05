import React, { useState, useEffect } from 'react';
import { 
    Box, Grid, Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Chip, Button, Stack, alpha, Divider, Typography,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { Download, FileText, Plus, Save, Trash2, RefreshCw, AlertTriangle, Zap } from 'lucide-react';
import { UAE_PRICING_MATRIX_2026, binThemeTokens } from '@bin/shared';
import { useLanguage } from '@bin/shared';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, doc, setDoc, updateDoc, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import AdminPageFrame from '../../components/AdminPageFrame';
import AdminCrudActions from '../../components/AdminCrudActions';

export default function PricingMatrixPage() {
    const { t } = useLanguage();
    const [assetClasses, setAssetClasses] = useState<any[]>([]);
    const [zones, setZones] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const unsubClasses = onSnapshot(collection(db, 'pricing_asset_classes'), (snap) => {
            setAssetClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        const unsubZones = onSnapshot(collection(db, 'pricing_zones'), (snap) => {
            setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubClasses();
            unsubZones();
        };
    }, []);

    const seedPricing = async () => {
        setSubmitting(true);
        try {
            const batch = writeBatch(db);
            
            // Seed Asset Classes
            UAE_PRICING_MATRIX_2026.assetClasses.forEach(ac => {
                const ref = doc(db, 'pricing_asset_classes', ac.id);
                batch.set(ref, ac);
            });

            // Seed Zones
            Object.entries(UAE_PRICING_MATRIX_2026.zones).forEach(([key, zone]) => {
                const ref = doc(db, 'pricing_zones', key);
                batch.set(ref, zone);
            });

            await batch.commit();
            alert("Pricing Matrix Seeded: Institutional benchmarks established.");
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string, coll: string) => {
        try {
            await deleteDoc(doc(db, coll, id));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <AdminPageFrame
            title="Pricing Matrix 2026"
            subtitle="Sovereign valuation models and emirate-wide multipliers"
            loading={loading}
            breadcrumbs={[{ label: 'Pricing' }]}
            actions={
                <Stack direction="row" spacing={2}>
                    <Button 
                        variant="outlined" 
                        startIcon={<RefreshCw size={18} />} 
                        onClick={seedPricing}
                        disabled={submitting}
                        sx={{ borderColor: 'rgba(255,255,255,0.1)', color: binThemeTokens.gold, fontWeight: 900 }}
                    >
                        SEED SYSTEM
                    </Button>
                    <Button 
                        variant="contained" 
                        startIcon={<Plus size={18} />} 
                        onClick={() => setOpenAdd(true)}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                    >
                        ADD RULE
                    </Button>
                </Stack>
            }
        >
            <Grid container spacing={4}>
                {/* ZONE CONTROL */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Zap size={20} color={binThemeTokens.gold} /> ZONE MULTIPLIERS
                        </Typography>
                        <Stack spacing={2}>
                            {zones.map(zone => (
                                <Box key={zone.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="body2" fontWeight="950" color="#FFF">{zone.label}</Typography>
                                            <Typography variant="caption" color="textSecondary">ID: {zone.id}</Typography>
                                        </Box>
                                        <Chip label={`${zone.multiplier}x`} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} />
                                    </Stack>
                                </Box>
                            ))}
                        </Stack>
                    </Paper>
                </Grid>

                {/* ASSET CLASSES */}
                <Grid item xs={12} md={8}>
                    <Paper sx={{ borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950">ASSET CLASS BENCHMARKS</Typography>
                        </Box>
                        <TableContainer sx={{ maxHeight: 600 }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>CLASS</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>MIN ANNUAL</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>PM RATE</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>RISK</TableCell>
                                        <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTIONS</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {assetClasses.map((ac) => (
                                        <TableRow key={ac.id} hover>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="950" color="#FFF">{ac.label}</Typography>
                                                <Typography variant="caption" color="textSecondary">{ac.category}</Typography>
                                            </TableCell>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 800 }}>AED {ac.minimumAnnualContract?.toLocaleString()}</TableCell>
                                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{ac.pmRate}</TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={String(ac.riskLevel || 'STANDARD').toUpperCase()} 
                                                    size="small" 
                                                    sx={{ 
                                                        bgcolor: ac.riskLevel === 'Critical' ? alpha('#EF4444', 0.1) : 'rgba(255,255,255,0.05)',
                                                        color: ac.riskLevel === 'Critical' ? '#EF4444' : 'rgba(255,255,255,0.5)',
                                                        fontWeight: 950, fontSize: '0.6rem'
                                                    }} 
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <AdminCrudActions 
                                                    id={ac.id}
                                                    actions={[
                                                        { type: 'edit', onClick: (id) => {} },
                                                        { type: 'delete', onClick: (id) => handleDelete(id, 'pricing_asset_classes'), requiresConfirm: true }
                                                    ]}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
            </Grid>

            {/* ADD RULE DIALOG */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}>
                <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>DEFINE PRICING RULE</DialogTitle>
                <DialogContent sx={{ py: 3, minWidth: 400 }}>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField label="Rule Label" fullWidth InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
                        <FormControl fullWidth>
                            <InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Category</InputLabel>
                            <Select value="Residential" sx={{ color: '#FFF' }}>
                                <MenuItem value="Residential">Residential</MenuItem>
                                <MenuItem value="Commercial">Commercial</MenuItem>
                                <MenuItem value="Industrial">Industrial</MenuItem>
                                <MenuItem value="Specialized">Specialized</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField label="Minimum Annual Contract (AED)" type="number" fullWidth InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
                    <Button variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>PUBLISH RULE</Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}
