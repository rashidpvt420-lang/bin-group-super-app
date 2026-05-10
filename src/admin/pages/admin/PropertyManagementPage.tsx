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
import { db } from '@/lib/firebase';
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
        ownerName: '',
        ownerEmail: '',
        ownerPhone: '',
        emirate: '',
        serviceZone: '',
        unitsCount: '',
        floorsCount: '',
        lifts: '',
        shops: '',
        sizeSqft: '',
        propertyAge: '',
        titleDeedUrl: ''
    });

    const [generatedInviteLink, setGeneratedInviteLink] = useState('');

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
            
            // 1. Create Owner Invite
            let ownerInviteId = formData.ownerId;
            let inviteToken = '';
            
            if (!ownerInviteId && formData.ownerName) {
                inviteToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                const inviteRef = await addDoc(collection(db, 'ownerInvites'), {
                    ownerName: formData.ownerName,
                    ownerEmail: formData.ownerEmail,
                    ownerPhone: formData.ownerPhone,
                    token: inviteToken,
                    status: 'PENDING',
                    createdAt: serverTimestamp()
                });
                ownerInviteId = inviteRef.id;
            }

            // 2. Create Property
            const propertyRef = await addDoc(collection(db, 'properties'), {
                companyId: 'BIN_GROUP',
                name: formData.name,
                propertyName: formData.name,
                propertyType: formData.propertyType,
                address: formData.address,
                addressLine: formData.address,
                geo,
                location: { lat: geo.lat, lng: geo.lng },
                coordinates: { lat: geo.lat, lng: geo.lng },
                ownerId: ownerInviteId,
                ownerInviteId,
                emirate: formData.emirate,
                city: formData.serviceZone || formData.emirate,
                area: formData.serviceZone || formData.emirate,
                serviceZone: formData.serviceZone,
                unitsCount: parseInt(formData.unitsCount) || 0,
                floorsCount: parseInt(formData.floorsCount) || 0,
                lifts: parseInt(formData.lifts) || 0,
                shops: parseInt(formData.shops) || 0,
                sizeSqft: parseInt(formData.sizeSqft) || 0,
                propertyAge: parseInt(formData.propertyAge) || 0,
                titleDeedUrl: formData.titleDeedUrl,
                status: 'active',
                createdAt: serverTimestamp(),
            });

            // 3. Create Property Passport
            await addDoc(collection(db, 'propertyPassports'), {
                propertyId: propertyRef.id,
                propertyName: formData.name,
                healthScore: 100,
                status: 'active',
                createdAt: serverTimestamp()
            });

            // 4. Create Default Units
            const uCount = parseInt(formData.unitsCount) || 0;
            if (uCount > 0 && uCount < 500) {
                const batchPromises = [];
                for (let i = 1; i <= uCount; i++) {
                    batchPromises.push(addDoc(collection(db, 'units'), {
                        propertyId: propertyRef.id,
                        unitNumber: String(i),
                        status: 'vacant',
                        createdAt: serverTimestamp()
                    }));
                }
                await Promise.all(batchPromises);
            }

            // 5. Create Audit Log
            await addDoc(collection(db, 'auditLogs'), {
                action: 'CREATE_PROPERTY',
                propertyId: propertyRef.id,
                propertyName: formData.name,
                timestamp: serverTimestamp()
            });

            if (inviteToken) {
                setGeneratedInviteLink(`https://bin-groups.com/owner-invite?token=${inviteToken}`);
            } else {
                setOpenAdd(false);
                resetForm();
            }
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
            ownerName: '',
            ownerEmail: '',
            ownerPhone: '',
            emirate: prop.emirate || '',
            serviceZone: prop.serviceZone || '',
            unitsCount: prop.unitsCount?.toString() || '',
            floorsCount: prop.floorsCount?.toString() || '',
            lifts: '',
            shops: '',
            sizeSqft: '',
            propertyAge: '',
            titleDeedUrl: ''
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
            ownerName: '',
            ownerEmail: '',
            ownerPhone: '',
            emirate: '',
            serviceZone: '',
            unitsCount: '',
            floorsCount: '',
            lifts: '',
            shops: '',
            sizeSqft: '',
            propertyAge: '',
            titleDeedUrl: ''
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
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ZONE / EMIRATE</TableCell>
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
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{prop.serviceZone || '—'}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{prop.emirate || '—'}</Typography>
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: binThemeTokens.gold }}>
                                        <MapPin size={14} />
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                            {prop.geo ? `${prop.geo.lat.toFixed(4)}, ${prop.geo.lng.toFixed(4)}` : prop.coordinates ? `${prop.coordinates.lat.toFixed(4)}, ${prop.coordinates.lng.toFixed(4)}` : 'N/A'}
                                        </Typography>
                                        {prop.geo?.verified && <Chip label="VERIFIED" size="small" sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 900 }} />}
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
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label="Emirate" 
                                fullWidth 
                                value={formData.emirate}
                                onChange={(e) => setFormData({...formData, emirate: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label="Service Zone" 
                                fullWidth 
                                value={formData.serviceZone}
                                onChange={(e) => setFormData({...formData, serviceZone: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label="Units Count" 
                                fullWidth 
                                type="number"
                                value={formData.unitsCount}
                                onChange={(e) => setFormData({...formData, unitsCount: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label="Floors Count" 
                                fullWidth 
                                type="number"
                                value={formData.floorsCount}
                                onChange={(e) => setFormData({...formData, floorsCount: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label="Lifts/Elevators" 
                                fullWidth 
                                type="number"
                                value={formData.lifts}
                                onChange={(e) => setFormData({...formData, lifts: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label="Shops/Offices Count" 
                                fullWidth 
                                type="number"
                                value={formData.shops}
                                onChange={(e) => setFormData({...formData, shops: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label="Total Size (SqFt)" 
                                fullWidth 
                                type="number"
                                value={formData.sizeSqft}
                                onChange={(e) => setFormData({...formData, sizeSqft: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label="Property Age (Years)" 
                                fullWidth 
                                type="number"
                                value={formData.propertyAge}
                                onChange={(e) => setFormData({...formData, propertyAge: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                label="Title Deed / Document URL (Optional)" 
                                fullWidth 
                                value={formData.titleDeedUrl}
                                onChange={(e) => setFormData({...formData, titleDeedUrl: e.target.value})}
                            />
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, mt: 2, mb: 1, fontWeight: 900 }}>OWNER ASSIGNMENT / INVITATION</Typography>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                label="Existing Owner UID (Leave blank to invite new)" 
                                fullWidth 
                                value={formData.ownerId}
                                onChange={(e) => setFormData({...formData, ownerId: e.target.value})}
                            />
                        </Grid>
                        {!formData.ownerId && (
                            <>
                                <Grid item xs={12} md={4}>
                                    <TextField 
                                        label="New Owner Name" 
                                        fullWidth 
                                        value={formData.ownerName}
                                        onChange={(e) => setFormData({...formData, ownerName: e.target.value})}
                                    />
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <TextField 
                                        label="Owner Email" 
                                        fullWidth 
                                        value={formData.ownerEmail}
                                        onChange={(e) => setFormData({...formData, ownerEmail: e.target.value})}
                                    />
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <TextField 
                                        label="Owner Phone/WhatsApp" 
                                        fullWidth 
                                        value={formData.ownerPhone}
                                        onChange={(e) => setFormData({...formData, ownerPhone: e.target.value})}
                                    />
                                </Grid>
                            </>
                        )}
                    </Grid>
                    
                    {generatedInviteLink && (
                        <Box sx={{ mt: 3, p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1, display: 'block' }}>PROPERTY SAVED. SEND INVITATION LINK:</Typography>
                            <Typography variant="body2" sx={{ color: '#FFF', wordBreak: 'break-all', mb: 2 }}>{generatedInviteLink}</Typography>
                            <Grid container spacing={1}>
                                <Grid item>
                                    <Button 
                                        variant="outlined" 
                                        size="small"
                                        href={`mailto:${formData.ownerEmail}?subject=BIN GROUP - Property Setup Complete&body=Please use this secure link to access your institutional property portal: ${generatedInviteLink}`}
                                        target="_blank"
                                        sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}
                                    >
                                        Email Link
                                    </Button>
                                </Grid>
                                <Grid item>
                                    <Button 
                                        variant="outlined" 
                                        size="small"
                                        href={`https://wa.me/${formData.ownerPhone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Welcome to BIN GROUP. Access your institutional property portal here: ${generatedInviteLink}`)}`}
                                        target="_blank"
                                        sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}
                                    >
                                        WhatsApp Link
                                    </Button>
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => { setOpenAdd(false); setOpenEdit(false); resetForm(); setGeneratedInviteLink(''); }}>{generatedInviteLink ? 'Close' : 'Cancel'}</Button>
                    {!generatedInviteLink && (
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
                    )}
                </DialogActions>
            </Dialog>
        </Container>
    );
}
