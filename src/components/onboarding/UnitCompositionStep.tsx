import React, { useEffect } from 'react';
import {
    Box, Typography, Grid, Paper, TextField, MenuItem,
    Stack, Button, Divider, Container, IconButton, Chip, alpha
} from '@mui/material';
import { ArrowRight, ArrowLeft, Plus, Trash2, Layers, CheckCircle2 } from 'lucide-react';
import { useOnboardingStore, FloorZone } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';

const UNIT_TYPES = [
    'Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom',
    'Penthouse', 'Duplex', 'Office', 'Shop / Retail', 'Hotel Room',
    'Hotel Suite', 'Serviced Apartment', 'Labour Room', 'Storage Room', 'Villa'
];

const COMPLEX_TYPES = [
    'Mixed-Use Tower', 'Skyscraper', 'Hotel', 'Resort', 'Mall', 'Retail Center',
    'Commercial Building', 'Stadium', 'Sports Complex', 'Hospital', 'Clinic',
    'School', 'Warehouse', 'Industrial Property', 'Labour Camp', 'Staff Accommodation',
    'Event Venue', 'Residential Building'
];

const defaultUnitTypeForProperty = (propertyType: string): string => {
    if (propertyType === 'Villa' || propertyType === 'Farm / Estate') return 'Villa';
    if (propertyType === 'Hotel' || propertyType === 'Resort') return 'Hotel Room';
    if (propertyType === 'Office' || propertyType === 'Commercial Building') return 'Office';
    if (propertyType === 'Mall' || propertyType === 'Retail Center') return 'Shop / Retail';
    if (propertyType === 'Warehouse' || propertyType === 'Industrial Property') return 'Storage Room';
    if (propertyType === 'Labour Camp') return 'Labour Room';
    if (propertyType === 'Staff Accommodation') return '1 Bedroom';
    return '1 Bedroom';
};

const createZone = (overrides: Partial<FloorZone> = {}): FloorZone => ({
    id: `zone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    fromFloor: 1,
    toFloor: 1,
    unitType: '1 Bedroom',
    unitsPerFloor: 4,
    avgSqftPerUnit: 0,
    ...overrides
});

const totalUnitsFromZones = (zones: FloorZone[]): number =>
    zones.reduce((acc, z) => {
        const floorCount = Math.max(0, z.toFloor - z.fromFloor + 1);
        return acc + floorCount * Math.max(0, z.unitsPerFloor);
    }, 0);

const UnitCompositionStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const activeProperty = properties[0];
    const propertyType = activeProperty?.propertyType || '';
    const isComplex = COMPLEX_TYPES.includes(propertyType);
    const zones: FloorZone[] = activeProperty?.floorZones || [];

    // Auto-initialise a single zone for simple property types on first load
    useEffect(() => {
        if (!isComplex && zones.length === 0) {
            const singleZone = createZone({
                label: propertyType,
                fromFloor: 1,
                toFloor: activeProperty?.floors || 1,
                unitType: defaultUnitTypeForProperty(propertyType),
                unitsPerFloor: Math.max(1, activeProperty?.units || 1),
            });
            updateProperty(0, { floorZones: [singleZone] });
        }
        if (isComplex && zones.length === 0) {
            const floors = activeProperty?.floors || 1;
            const initialZone = createZone({
                label: 'Residential Floors',
                fromFloor: 1,
                toFloor: floors,
                unitType: defaultUnitTypeForProperty(propertyType),
                unitsPerFloor: 4,
            });
            updateProperty(0, { floorZones: [initialZone] });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updateZone = (id: string, patch: Partial<FloorZone>) => {
        const updated = zones.map(z => z.id === id ? { ...z, ...patch } : z);
        const total = totalUnitsFromZones(updated);
        updateProperty(0, { floorZones: updated, units: total || activeProperty?.units || 1 });
    };

    const addZone = () => {
        const lastZone = zones[zones.length - 1];
        const nextFrom = lastZone ? lastZone.toFloor + 1 : 1;
        const floors = activeProperty?.floors || 1;
        const nextTo = Math.min(nextFrom + 4, floors);
        const newZone = createZone({ fromFloor: nextFrom, toFloor: nextTo });
        const updated = [...zones, newZone];
        updateProperty(0, { floorZones: updated, units: totalUnitsFromZones(updated) });
    };

    const removeZone = (id: string) => {
        const updated = zones.filter(z => z.id !== id);
        updateProperty(0, { floorZones: updated, units: totalUnitsFromZones(updated) || activeProperty?.units || 1 });
    };

    const totalUnits = totalUnitsFromZones(zones);
    const canProceed = zones.length > 0 && zones.every(z => z.unitType && z.unitsPerFloor > 0 && z.toFloor >= z.fromFloor);

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 5 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {isComplex ? 'FLOOR PLAN & UNIT COMPOSITION' : 'UNIT TYPE CONFIRMATION'}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 640, mx: 'auto' }}>
                    {isComplex
                        ? 'Define floor zones so BIN GROUP knows exactly what is on each level — studios, shops, hotel rooms, offices — and generate the correct unit records automatically.'
                        : 'Confirm the unit type for your property. This ensures correct maintenance protocols and lease templates.'}
                </Typography>
            </Box>

            <Container maxWidth={isComplex ? 'lg' : 'md'}>
                {/* Total units summary banner */}
                <Paper sx={{
                    p: 3, mb: 4, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2,
                    bgcolor: alpha(binThemeTokens.gold, 0.08),
                    border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`
                }}>
                    <CheckCircle2 size={22} color={binThemeTokens.gold} />
                    <Box>
                        <Typography variant="body2" fontWeight={900} sx={{ color: binThemeTokens.gold }}>
                            {totalUnits} unit{totalUnits !== 1 ? 's' : ''} will be created in the system
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
                            {propertyType} · {activeProperty?.floors || 1} floor{(activeProperty?.floors || 1) !== 1 ? 's' : ''}
                        </Typography>
                    </Box>
                    {isComplex && (
                        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {[...new Set(zones.map(z => z.unitType))].map(ut => (
                                <Chip key={ut} label={ut} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900, fontSize: 11 }} />
                            ))}
                        </Box>
                    )}
                </Paper>

                {/* Zone rows */}
                <Stack spacing={3}>
                    {zones.map((zone, index) => (
                        <Paper key={zone.id} sx={{
                            p: 3, borderRadius: 4,
                            bgcolor: 'rgba(22, 22, 24, 0.65)',
                            border: `1px solid rgba(255,255,255,0.06)`
                        }}>
                            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2.5 }}>
                                <Layers size={16} color={binThemeTokens.gold} />
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                                    {isComplex ? `ZONE ${index + 1}` : 'UNIT TYPE'}
                                </Typography>
                                {isComplex && zones.length > 1 && (
                                    <IconButton
                                        size="small"
                                        onClick={() => removeZone(zone.id)}
                                        sx={{ ml: 'auto', color: 'rgba(255,100,100,0.7)', '&:hover': { color: '#ff6464' } }}
                                    >
                                        <Trash2 size={15} />
                                    </IconButton>
                                )}
                            </Stack>

                            <Grid container spacing={2.5}>
                                {isComplex && (
                                    <Grid item xs={12} md={4}>
                                        <TextField
                                            fullWidth
                                            label="Zone Label"
                                            placeholder="e.g. Retail Podium"
                                            value={zone.label}
                                            onChange={e => updateZone(zone.id, { label: e.target.value })}
                                            inputProps={{ maxLength: 50 }}
                                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                                        />
                                    </Grid>
                                )}

                                <Grid item xs={6} md={isComplex ? 2 : 3}>
                                    <TextField
                                        fullWidth
                                        label="From Floor"
                                        type="number"
                                        value={zone.fromFloor}
                                        onChange={e => updateZone(zone.id, { fromFloor: parseInt(e.target.value) || 1 })}
                                        inputProps={{ min: 1 }}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                                    />
                                </Grid>
                                <Grid item xs={6} md={isComplex ? 2 : 3}>
                                    <TextField
                                        fullWidth
                                        label="To Floor"
                                        type="number"
                                        value={zone.toFloor}
                                        onChange={e => updateZone(zone.id, { toFloor: parseInt(e.target.value) || zone.fromFloor })}
                                        inputProps={{ min: zone.fromFloor }}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                                    />
                                </Grid>
                                <Grid item xs={12} md={isComplex ? 2 : 3}>
                                    <TextField
                                        select
                                        fullWidth
                                        label="Unit Type"
                                        value={zone.unitType}
                                        onChange={e => updateZone(zone.id, { unitType: e.target.value })}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                                    >
                                        {UNIT_TYPES.map(t => (
                                            <MenuItem key={t} value={t}>{t}</MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>
                                <Grid item xs={6} md={isComplex ? 1 : 3}>
                                    <TextField
                                        fullWidth
                                        label="Units / Floor"
                                        type="number"
                                        value={zone.unitsPerFloor}
                                        onChange={e => updateZone(zone.id, { unitsPerFloor: parseInt(e.target.value) || 1 })}
                                        inputProps={{ min: 1 }}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                                    />
                                </Grid>
                                <Grid item xs={6} md={isComplex ? 1 : 12}>
                                    <TextField
                                        fullWidth
                                        label="Avg Sqft"
                                        type="number"
                                        value={zone.avgSqftPerUnit || ''}
                                        onChange={e => updateZone(zone.id, { avgSqftPerUnit: parseInt(e.target.value) || 0 })}
                                        inputProps={{ min: 0 }}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                                    />
                                </Grid>
                            </Grid>

                            {isComplex && (
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1.5, display: 'block' }}>
                                    {Math.max(0, zone.toFloor - zone.fromFloor + 1)} floor(s) × {zone.unitsPerFloor} units/floor
                                    {' = '}<strong style={{ color: binThemeTokens.gold }}>
                                        {Math.max(0, zone.toFloor - zone.fromFloor + 1) * zone.unitsPerFloor} {zone.unitType} units
                                    </strong>
                                </Typography>
                            )}
                        </Paper>
                    ))}
                </Stack>

                {isComplex && (
                    <>
                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Button
                            variant="outlined"
                            startIcon={<Plus size={16} />}
                            onClick={addZone}
                            sx={{
                                borderRadius: 100, px: 4,
                                color: binThemeTokens.gold,
                                borderColor: alpha(binThemeTokens.gold, 0.35),
                                '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.07) }
                            }}
                        >
                            ADD FLOOR ZONE
                        </Button>
                    </>
                )}

                <Box sx={{ mt: 6, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Button
                        variant="outlined"
                        size="large"
                        onClick={onBack}
                        startIcon={<ArrowLeft />}
                        sx={{ borderRadius: 100, px: 4, color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                        BACK
                    </Button>
                    <Button
                        variant="contained"
                        size="large"
                        onClick={onNext}
                        disabled={!canProceed}
                        endIcon={<ArrowRight />}
                        sx={{
                            borderRadius: 100, px: 6,
                            bgcolor: binThemeTokens.gold, color: '#000',
                            fontWeight: 950,
                            '&:hover': { bgcolor: '#E6C77A' }
                        }}
                    >
                        {isComplex ? 'CONFIRM FLOOR PLAN' : 'CONFIRM UNITS'}
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default UnitCompositionStep;
