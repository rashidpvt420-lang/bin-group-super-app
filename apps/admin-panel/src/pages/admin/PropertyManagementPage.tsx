// admin-panel/src/pages/admin/PropertyManagementPage.tsx
import React, { useState, useEffect } from 'react';
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

interface Property {
    id: string;
    name: string;
    propertyType: 'Villa' | 'Tower' | 'Compound' | 'Commercial';
    address: string;
    coordinates?: {
        lat: number;
        lng: number;
    };
    ownerId: string;
    status: string;
}

export default function PropertyManagementPage() {
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [openAdd, setOpenAdd] = useState(false);
    const [openEdit, setOpenEdit] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        propertyType: 'Villa' as 'Villa' | 'Tower' | 'Compound' | 'Commercial',
        address: '',
        lat: '',
        lng: '',
        ownerId: ''
    });

    useEffect(() => {
        const q = query(collection(db, 'properties'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Property[];
            setProperties(fetched);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleAddProperty = async () => {
        try {
            await addDoc(collection(db, 'properties'), {
                name: formData.name,
                propertyType: formData.propertyType,
                address: formData.address,
                location: {
                    lat: parseFloat(formData.lat) || 0,
                    lng: parseFloat(formData.lng) || 0
                },
                ownerId: formData.ownerId,
                status: 'active',
                createdAt: serverTimestamp(),
            });
            setOpenAdd(false);
            resetForm();
        } catch (error) {
            console.error("Error adding property:", error);
        }
    };

    const handleEditOpen = (prop: Property) => {
        setSelectedProperty(prop);
        setFormData({
            name: prop.name || '',
            propertyType: prop.propertyType || 'Villa',
            address: prop.address || '',
            lat: prop.coordinates?.lat?.toString() || '',
            lng: prop.coordinates?.lng?.toString() || '',
            ownerId: prop.ownerId || ''
        });
        setOpenEdit(true);
    };

    const handleUpdateProperty = async () => {
        if (!selectedProperty) return;
        try {
            await updateDoc(doc(db, 'properties', selectedProperty.id), {
                name: formData.name,
                propertyType: formData.propertyType,
                address: formData.address,
                location: {
                    lat: parseFloat(formData.lat) || 0,
                    lng: parseFloat(formData.lng) || 0
                },
                ownerId: formData.ownerId,
                updatedAt: serverTimestamp(),
            });
            setOpenEdit(false);
            resetForm();
        } catch (error) {
            console.error("Error updating property:", error);
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
            ownerId: ''
        });
    };

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 6 }}>
                <Box>
                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -1 }}>
                        ASSET REGISTRY
                    </Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>
                        SOVEREIGN GEOGRAPHIC INVENTORY
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
                    Add Institutional Asset
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
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, py: 3 }}>ASSET NAME</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>TYPE</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ADDRESS</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>COORDINATES</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }} align="right">ACTIONS</TableCell>
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
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: binThemeTokens.gold }}>
                                        <MapPin size={14} />
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                            {prop.coordinates ? `${prop.coordinates.lat.toFixed(4)}, ${prop.coordinates.lng.toFixed(4)}` : 'N/A'}
                                        </Typography>
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
                    {openAdd ? 'REGISTER NEW ASSET' : 'UPDATE ASSET DNA'}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={3} sx={{ mt: 1 }}>
                        <Grid item xs={12} md={8}>
                            <TextField 
                                label="Property Name" 
                                fullWidth 
                                value={formData.name} 
                                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField 
                                select 
                                label="Property Type" 
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
                                label="Full Physical Address" 
                                fullWidth 
                                multiline 
                                rows={2} 
                                value={formData.address}
                                onChange={(e) => setFormData({...formData, address: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField 
                                label="Latitude" 
                                fullWidth 
                                value={formData.lat}
                                onChange={(e) => setFormData({...formData, lat: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField 
                                label="Longitude" 
                                fullWidth 
                                value={formData.lng}
                                onChange={(e) => setFormData({...formData, lng: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                label="Owner UID (Association)" 
                                fullWidth 
                                value={formData.ownerId}
                                onChange={(e) => setFormData({...formData, ownerId: e.target.value})}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => { setOpenAdd(false); setOpenEdit(false); resetForm(); }}>Cancel</Button>
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
                        {openAdd ? 'Finalize Asset' : 'Save DNA Changes'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
