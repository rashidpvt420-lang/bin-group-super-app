// admin-panel/src/pages/tenants/TenantsManagementPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Box, Container, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, TextField, Typography, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, Grid, Stack,
  FormControl, InputLabel, Select, MenuItem, CircularProgress
} from '@mui/material';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, where, serverTimestamp, doc, writeBatch, getDocs, limit, orderBy, startAfter } from 'firebase/firestore';
import { Add as AddIcon, Edit as EditIcon, Search as SearchIcon } from '@mui/icons-material';

interface Unit {
    id: string;
    unitNumber: string;
    floorNumber?: string | number;
    occupancyStatus?: string;
    currentTenantId?: string | null;
    propertyId: string;
}

export default function TenantsManagementPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  
  // Strict Relationship Data
  const [owners, setOwners] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  // Selected Context for Intake
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [tenantMode, setTenantMode] = useState<'existing' | 'new'>('new');
  const [selectedExistingTenantId, setSelectedExistingTenantId] = useState('');
  const [existingTenantSearch, setExistingTenantSearch] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  const [newTenant, setNewTenant] = useState({
    email: '',
    displayName: '',
    phoneNumber: '',
    emiratesID: '',
  });

  const PAGE_SIZE = 20;

  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    const fetchInitialData = async () => {
        // Load Lookups
        onSnapshot(query(collection(db, 'users'), where('role', 'in', ['owner', 'OWNER'])), (snap) => {
            setOwners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        onSnapshot(query(collection(db, 'properties')), (snap) => {
            setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        
        // Initial Tenants
        const q = query(collection(db, 'users'), where('role', '==', 'tenant'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        const snap = await getDocs(q);
        setTenants(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
        if (snap.docs.length < PAGE_SIZE) setHasMore(false);
        setLastDoc(snap.docs[snap.docs.length - 1]);
    };
    fetchInitialData();
  }, []);

  const loadMoreTenants = async () => {
      if (!lastDoc || !hasMore) return;
      const q = query(collection(db, 'users'), where('role', '==', 'tenant'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const newTenants = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      setTenants(prev => [...prev, ...newTenants]);
      setLastDoc(snap.docs[snap.docs.length - 1]);
      if (snap.docs.length < PAGE_SIZE) setHasMore(false);
  };

  const fetchUnitsForProperty = async (propId: string) => {
      const q = query(collection(db, 'units'), where('propertyId', '==', propId));
      const snap = await getDocs(q);
      setUnits(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
  };

  useEffect(() => {
      if (selectedPropertyId) {
          fetchUnitsForProperty(selectedPropertyId);
      }
  }, [selectedPropertyId]);

  const handleSearchExisting = async () => {
    if (!existingTenantSearch.includes('@')) return;
    setSearchLoading(true);
    try {
        const q = query(collection(db, 'users'), where('email', '==', existingTenantSearch.toLowerCase().trim()));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const found = { uid: snap.docs[0].id, ...snap.docs[0].data() };
            setTenants(prev => {
                if (prev.find(t => t.uid === found.uid)) return prev;
                return [found, ...prev];
            });
            setSelectedExistingTenantId(found.uid);
            alert("Sovereign Match Found: User identified in registry.");
        } else {
            alert("No user found with this email. Please use 'New Tenant' mode.");
        }
    } catch (err) {
        console.error(err);
    } finally {
        setSearchLoading(false);
    }
  };

  const handleAddTenant = async () => {
    const usingExistingTenant = tenantMode === 'existing';
    if (!selectedOwnerId || !selectedPropertyId || !selectedUnitId || (!usingExistingTenant && (!newTenant.email || !newTenant.displayName)) || (usingExistingTenant && !selectedExistingTenantId)) {
        alert("Owner, Property, Unit, and tenant identity are required.");
        return;
    }

    setSubmitting(true);
    try {
      const unitData = units.find(u => u.id === selectedUnitId);
      const propertyData = properties.find(p => p.id === selectedPropertyId);
      const existingTenant = tenants.find(t => t.uid === selectedExistingTenantId);

      if (!unitData || unitData.propertyId !== selectedPropertyId) {
        alert("Linkage broken: Select a unit that belongs to the chosen property.");
        setSubmitting(false);
        return;
      }

      if (unitData.occupancyStatus === 'OCCUPIED') {
        alert("Occupancy Alert: This unit is already occupied.");
        setSubmitting(false);
        return;
      }
      
      const batch = writeBatch(db);
      const tenantRef = usingExistingTenant ? doc(db, 'users', selectedExistingTenantId) : doc(collection(db, 'users'));
      const tenantId = tenantRef.id;
      
      batch.set(tenantRef, {
        uid: tenantId,
        role: 'tenant',
        status: 'active',
        displayName: usingExistingTenant ? existingTenant?.displayName : newTenant.displayName,
        email: (usingExistingTenant ? existingTenant?.email : newTenant.email).toLowerCase(),
        phoneNumber: usingExistingTenant ? existingTenant?.phoneNumber : newTenant.phoneNumber,
        emiratesID: usingExistingTenant ? (existingTenant?.emiratesID || existingTenant?.emiratesId) : newTenant.emiratesID,
        ownerId: selectedOwnerId,
        propertyId: selectedPropertyId,
        unitId: selectedUnitId,
        unitNumber: unitData?.unitNumber || '',
        propertyName: propertyData?.name || propertyData?.propertyName || 'Assigned Property',
        updatedAt: serverTimestamp(),
        createdAt: usingExistingTenant ? (existingTenant?.createdAt || serverTimestamp()) : serverTimestamp(),
      }, { merge: true });

      batch.update(doc(db, 'units', selectedUnitId), {
          tenantId,
          occupancyStatus: 'OCCUPIED',
          currentTenantId: tenantId,
          updatedAt: serverTimestamp()
      });

      const tenancyRef = doc(collection(db, 'tenancies'));
      batch.set(tenancyRef, {
          tenantId,
          ownerId: selectedOwnerId,
          propertyId: selectedPropertyId,
          unitId: selectedUnitId,
          status: 'ACTIVE',
          startDate: serverTimestamp(),
          createdAt: serverTimestamp()
      });

      await batch.commit();
      setOpenAdd(false);
      alert("Relational Link Secured: Tenant assigned to Unit.");
    } catch (err: any) {
        alert("Fault: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" fontWeight="950">TENANT REGISTRY</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenAdd(true)} sx={{ borderRadius: 100, bgcolor: '#000', fontWeight: 900 }}>
          ASSIGN NEW TENANT
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ borderRadius: 4, overflow: 'hidden' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 900 }}>TENANT</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>PROPERTY & UNIT</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>CONTACT</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>STATUS</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tenants.map((tenant) => (
              <TableRow key={tenant.uid} hover>
                <TableCell>
                  <Typography variant="subtitle2" fontWeight="800">{tenant.displayName}</Typography>
                  <Typography variant="caption" color="text.secondary">{tenant.uid}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="700">{tenant.propertyName || 'Unlinked'}</Typography>
                  <Typography variant="caption">Unit {tenant.unitNumber || 'N/A'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{tenant.email}</Typography>
                  <Typography variant="caption">{tenant.phoneNumber}</Typography>
                </TableCell>
                <TableCell><Chip label={tenant.status?.toUpperCase()} size="small" color={tenant.status === 'active' ? 'success' : 'default'} sx={{ fontWeight: 900, fontSize: '0.65rem' }} /></TableCell>
                <TableCell align="right">
                    <IconButton size="small"><EditIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {hasMore && (
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
          <Button onClick={loadMoreTenants} sx={{ fontWeight: 900, color: '#000' }}>LOAD MORE RECORDS</Button>
        </Box>
      )}

      {/* ASSIGNMENT DIALOG */}
      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 950 }}>RELATIONAL TENANT ASSIGNMENT</DialogTitle>
        <DialogContent dividers>
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Target Owner</InputLabel>
                        <Select value={selectedOwnerId} onChange={(e) => setSelectedOwnerId(e.target.value)} label="Target Owner">
                            {owners.map(o => <MenuItem key={o.id} value={o.id}>{o.displayName || o.name || o.email}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth sx={{ mb: 2 }} disabled={!selectedOwnerId}>
                        <InputLabel>Target Property</InputLabel>
                        <Select value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} label="Target Property">
                            {properties.filter(p => p.ownerId === selectedOwnerId).map(p => <MenuItem key={p.id} value={p.id}>{p.name || p.propertyName || p.address}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth sx={{ mb: 2 }} disabled={!selectedPropertyId}>
                        <InputLabel>Target Unit</InputLabel>
                        <Select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} label="Target Unit">
                            {units.filter(u => u.propertyId === selectedPropertyId).map(u => (
                                <MenuItem key={u.id} value={u.id} disabled={u.occupancyStatus === 'OCCUPIED'}>
                                    {u.unitNumber} {u.occupancyStatus === 'OCCUPIED' ? '(OCCUPIED)' : '(VACANT)'}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Box sx={{ mb: 2, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                        <Typography variant="overline" fontWeight="900">Tenant Identity Mode</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <Button size="small" variant={tenantMode === 'new' ? 'contained' : 'outlined'} onClick={() => setTenantMode('new')}>New Tenant</Button>
                            <Button size="small" variant={tenantMode === 'existing' ? 'contained' : 'outlined'} onClick={() => setTenantMode('existing')}>Existing User</Button>
                        </Stack>
                    </Box>

                    {tenantMode === 'new' ? (
                        <Stack spacing={2}>
                            <TextField label="Full Name" fullWidth value={newTenant.displayName} onChange={(e) => setNewTenant({...newTenant, displayName: e.target.value})} />
                            <TextField label="Email" fullWidth value={newTenant.email} onChange={(e) => setNewTenant({...newTenant, email: e.target.value})} />
                            <TextField label="Phone" fullWidth value={newTenant.phoneNumber} onChange={(e) => setNewTenant({...newTenant, phoneNumber: e.target.value})} />
                            <TextField label="Emirates ID" fullWidth value={newTenant.emiratesID} onChange={(e) => setNewTenant({...newTenant, emiratesID: e.target.value})} />
                        </Stack>
                    ) : (
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <TextField label="Search Email" fullWidth size="small" value={existingTenantSearch} onChange={(e) => setExistingTenantSearch(e.target.value)} />
                                <IconButton onClick={handleSearchExisting} disabled={searchLoading} color="primary"><SearchIcon /></IconButton>
                            </Box>
                            <FormControl fullWidth>
                                <InputLabel>Select Linked Tenant</InputLabel>
                                <Select value={selectedExistingTenantId} onChange={(e) => setSelectedExistingTenantId(e.target.value)} label="Select Linked Tenant">
                                    {tenants.map(t => <MenuItem key={t.uid} value={t.uid}>{t.displayName} ({t.email})</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Stack>
                    )}
                </Grid>
            </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenAdd(false)} sx={{ fontWeight: 800 }}>CANCEL</Button>
          <Button variant="contained" color="primary" onClick={handleAddTenant} disabled={submitting || (tenantMode === 'new' && !newTenant.email) || (tenantMode === 'existing' && !selectedExistingTenantId)} sx={{ borderRadius: 100, fontWeight: 900 }}>
            {submitting ? <CircularProgress size={20} color="inherit" /> : 'SECURE RELATIONAL LINK'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
