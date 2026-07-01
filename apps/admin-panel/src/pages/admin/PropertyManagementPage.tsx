// admin-panel/src/pages/admin/PropertyManagementPage.tsx
import React, { useState, useEffect } from 'react';
import { useLanguage } from '@bin/shared';
import {
    Container,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Box,
    MenuItem,
    Grid,
    IconButton,
    Chip,
    alpha
} from '@mui/material';
import { Plus as AddIcon, Edit as EditIcon, Trash2 as DeleteIcon, MapPin } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { binThemeTokens } from '../../theme/adminTheme';
import { buildGeoAnchor } from '../../utils/geoAnchor';

interface Property {
    id: string;
    name: string;
    propertyType: 'Villa' | 'Tower' | 'Compound' | 'Commercial';
    address: string;
    coordinates?: {
        lat: number;
        lng: number;
    };
    geo?: {
        lat: number;
        lng: number;
        geohash?: string;
        address?: string;
        verified?: boolean;
    };
    ownerId: string;
    emirate: string;
    serviceZone: string;
    status: string;
    unitsCount?: number;
    floorsCount?: number;
}

export default function PropertyManagementPage() {
    const { t, isRTL } = useLanguage();
    const [properties, setProperties] = useState<Property[]>([]);
    const [openAdd, setOpenAdd] = useState(false);
    const [openEdit, setOpenEdit] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        propertyType: 'Villa' as 'Villa' | 'Tower' | 'Compound' | 'Commercial',
        address: '',
        lat: '',
        lng: '',
        ownerId: '',
        emirate: '',
        serviceZone: '',
        unitsCount: '',
        floorsCount: ''
    });

    useEffect(() => {
        const q = query(collection(db, 'properties'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Property[];
            setProperties(fetched);
        });
        return () => unsubscribe();
    }, []);

    const handleAddProperty = async () => {
        try {
            const geo = buildGeoAnchor({
                lat: formData.lat,
                lng: formData.lng,
                address: formData.address,
                emirate: formData.emirate,
                city: formData.serviceZone,
                area: formData.serviceZone
            });
            await addDoc(collection(db, 'properties'), {
                companyId: 'BIN_GROUP',
                name: formData.name,
                propertyName: formData.name,
                propertyType: formData.propertyType,
                address: formData.address,
                addressLine: formData.address,
                geo,
                location: { lat: geo.lat, lng: geo.lng },
                coordinates: { lat: geo.lat, lng: geo.lng },
                ownerId: formData.ownerId,
                emirate: formData.emirate,
                city: formData.serviceZone || formData.emirate,
                area: formData.serviceZone || formData.emirate,
                serviceZone: formData.serviceZone,
                unitsCount: parseInt(formData.unitsCount) || 0,
                floorsCount: parseInt(formData.floorsCount) || 0,
                status: 'active',
                createdAt: serverTimestamp(),
            });
            setOpenAdd(false);
            resetForm();
        } catch (error: any) {
            console.error("Error adding property:", error);
            alert(error?.message || 'We could not verify this location. Admin review is required.');
        }
    };

    const handleEditOpen = (prop: Property) => {
        setSelectedProperty(prop);
        setFormData({
            name: prop.name || '',
            propertyType: prop.propertyType || 'Villa',
            address: prop.address || '',
            lat: (prop.geo?.lat ?? prop.coordinates?.lat)?.toString() || '',
            lng: (prop.geo?.lng ?? prop.coordinates?.lng)?.toString() || '',
            ownerId: prop.ownerId || '',
            emirate: prop.emirate || '',
            serviceZone: prop.serviceZone || '',
            unitsCount: prop.unitsCount?.toString() || '',
            floorsCount: prop.floorsCount?.toString() || ''
        });
        setOpenEdit(true);
    };

    const handleUpdateProperty = async () => {
        if (!selectedProperty) return;
        try {
            const geo = buildGeoAnchor({
                lat: formData.lat,
                lng: formData.lng,
                address: formData.address,
                emirate: formData.emirate,
                city: formData.serviceZone,
                area: formData.serviceZone
            });
            await updateDoc(doc(db, 'properties', selectedProperty.id), {
                companyId: 'BIN_GROUP',
                name: formData.name,
                propertyName: formData.name,
                propertyType: formData.propertyType,
                address: formData.address,
                addressLine: formData.address,
                geo,
                location: { lat: geo.lat, lng: geo.lng },
                coordinates: { lat: geo.lat, lng: geo.lng },
                ownerId: formData.ownerId,
                emirate: formData.emirate,
                city: formData.serviceZone || formData.emirate,
                area: formData.serviceZone || formData.emirate,
                serviceZone: formData.serviceZone,
                unitsCount: parseInt(formData.unitsCount) || 0,
                floorsCount: parseInt(formData.floorsCount) || 0,
                updatedAt: serverTimestamp(),
            });
            setOpenEdit(false);
            resetForm();
        } catch (error: any) {
            console.error("Error updating property:", error);
            alert(error?.message || 'We could not verify this location. Admin review is required.');
        }
    };

    const handleDeleteProperty = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this asset from the registry?")) {
            try {
                await deleteDoc(doc(db, 'properties', id));
            } catch (error) {
                console.error("Error deleting property:", error);
            }
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            propertyType: 'Villa',
            address: '',
            lat: '',
            lng: '',
            ownerId: '',
            emirate: '',
            serviceZone: '',
            unitsCount: '',
            floorsCount: ''
        });
    };

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 6 }}>
                <Box>
                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -1 }}>
                        {t('admin.property_mgmt.page_title')}
                    </Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>
                        {t('admin.property_mgmt.page_subtitle')}
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setOpenAdd(true)}
                    sx={{
                        background: binThemeTokens.goldGradient,
                        color: binThemeTokens.black,
                        fontWeight: 900,
                        px: 4,
                        borderRadius: 100
                    }}
                >
                    {t('admin.property_mgmt.add_asset_btn')}
                </Button>
            </Box>

            <TableContainer component={Paper} sx={{ 
                borderRadius: 4, 
                bgcolor: binThemeTokens.graphite,
                border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                boxShadow: 'none'
            }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, py: 3 }}>{t('admin.property_mgmt.col_asset_name')}</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.property_mgmt.col_type')}</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.property_mgmt.col_address')}</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.property_mgmt.col_zone_emirate')}</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.property_mgmt.col_coordinates')}</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }} align="right">{t('admin.property_mgmt.col_actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {properties.map((prop) => (
                            <TableRow key={prop.id} hover>
                                <TableCell sx={{ fontWeight: 700 }}>{prop.name}</TableCell>
                                <TableCell>
                                    <Chip label={prop.propertyType} size="small" sx={{ fontWeight: 900, fontSize: 10 }} />
                                </TableCell>
                                <TableCell sx={{ color: binThemeTokens.textSecondary }}>{prop.address || '—'}</TableCell>
                                <TableCell>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{prop.serviceZone || '—'}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{prop.emirate || '—'}</Typography>
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: binThemeTokens.gold }}>
                                        <MapPin size={14} />
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                            {prop.geo ? `${prop.geo.lat.toFixed(4)}, ${prop.geo.lng.toFixed(4)}` : prop.coordinates ? `${prop.coordinates.lat.toFixed(4)}, ${prop.coordinates.lng.toFixed(4)}` : 'N/A'}
                                        </Typography>
                                        {prop.geo?.verified && <Chip label={t('admin.property_mgmt.verified_chip')} size="small" sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 900 }} />}
                                    </Box>
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton onClick={() => handleEditOpen(prop)} sx={{ color: binThemeTokens.gold }}>
                                        <EditIcon size={18} />
                                    </IconButton>
                                    <IconButton onClick={() => handleDeleteProperty(prop.id)} sx={{ color: binThemeTokens.danger }}>
                                        <DeleteIcon size={18} />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Add/Edit Dialog */}
            <Dialog 
                open={openAdd || openEdit} 
                onClose={() => { setOpenAdd(false); setOpenEdit(false); resetForm(); }}
                fullWidth 
                maxWidth="md"
                PaperProps={{
                    sx: { borderRadius: 4, p: 2 }
                }}
            >
                <DialogTitle sx={{ fontWeight: 900, fontSize: '1.5rem' }}>
                    {openAdd ? t('admin.property_mgmt.dialog_add_title') : t('admin.property_mgmt.dialog_edit_title')}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={3} sx={{ mt: 1 }}>
                        <Grid item xs={12} md={8}>
                            <TextField
                                label={t('admin.property_mgmt.field_property_name')}
                                fullWidth
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                select
                                label={t('admin.property_mgmt.field_property_type')}
                                fullWidth
                                value={formData.propertyType}
                                onChange={(e) => setFormData({...formData, propertyType: e.target.value as any})}
                            >
                                <MenuItem value="Villa">Villa</MenuItem>
                                <MenuItem value="Tower">Tower</MenuItem>
                                <MenuItem value="Compound">Compound</MenuItem>
                                <MenuItem value="Commercial">Commercial</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label={t('admin.property_mgmt.field_address')}
                                fullWidth
                                multiline
                                rows={2}
                                value={formData.address}
                                onChange={(e) => setFormData({...formData, address: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label={t('admin.property_mgmt.field_latitude')}
                                fullWidth
                                value={formData.lat}
                                onChange={(e) => setFormData({...formData, lat: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label={t('admin.property_mgmt.field_longitude')}
                                fullWidth
                                value={formData.lng}
                                onChange={(e) => setFormData({...formData, lng: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                label={t('admin.property_mgmt.field_emirate')}
                                fullWidth
                                value={formData.emirate}
                                onChange={(e) => setFormData({...formData, emirate: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                label={t('admin.property_mgmt.field_service_zone')}
                                fullWidth
                                value={formData.serviceZone}
                                onChange={(e) => setFormData({...formData, serviceZone: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                label={t('admin.property_mgmt.field_units_count')}
                                fullWidth
                                type="number"
                                value={formData.unitsCount}
                                onChange={(e) => setFormData({...formData, unitsCount: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                label={t('admin.property_mgmt.field_floors_count')}
                                fullWidth
                                type="number"
                                value={formData.floorsCount}
                                onChange={(e) => setFormData({...formData, floorsCount: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label={t('admin.property_mgmt.field_owner_uid')}
                                fullWidth
                                value={formData.ownerId}
                                onChange={(e) => setFormData({...formData, ownerId: e.target.value})}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => { setOpenAdd(false); setOpenEdit(false); resetForm(); }}>{t('admin.property_mgmt.cancel_btn')}</Button>
                    <Button
                        variant="contained"
                        onClick={openAdd ? handleAddProperty : handleUpdateProperty}
                        sx={{
                            borderRadius: 100,
                            px: 4,
                            fontWeight: 900,
                            background: binThemeTokens.goldGradient,
                            color: binThemeTokens.black
                        }}
                    >
                        {openAdd ? t('admin.property_mgmt.finalize_btn') : t('admin.property_mgmt.save_changes_btn')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
