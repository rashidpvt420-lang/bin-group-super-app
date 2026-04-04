// admin-panel/src/pages/tenants/TenantsManagementPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  LinearProgress,
  Alert,
  Grid,
} from '@mui/material';
import { db, auth } from '../../lib/firebase';
import { collection, onSnapshot, query, where, serverTimestamp, doc, updateDoc, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, UploadFile as UploadIcon } from '@mui/icons-material';
import Papa from 'papaparse';
import axios from 'axios';

interface Tenant {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  status: 'active' | 'pending' | 'inactive';
  unitId: string;
  floorNumber?: string;
  emiratesID?: string;
  role: 'tenant';
}

export default function TenantsManagementPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newTenant, setNewTenant] = useState({
    email: '',
    displayName: '',
    phoneNumber: '',
    unitId: '',
    floorNumber: '',
    emiratesID: '',
  });

  const [editTenant, setEditTenant] = useState({
    displayName: '',
    phoneNumber: '',
    unitId: '',
    floorNumber: '',
    emiratesID: '',
    status: 'active' as 'active' | 'pending' | 'inactive',
  });

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'tenant'));
    
    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      const fetched = snapshot.docs.map((doc: any) => ({
        uid: doc.id,
        ...doc.data()
      })) as Tenant[];
      setTenants(fetched);
      setLoading(false);
    }, (error: any) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddTenant = async () => {
    setSubmitting(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("UNAUTHENTICATED: No active administrative session.");

      const token = await user.getIdToken(true);
      // [SOVEREIGN-DISPATCH] Manual Token Injection for Secure Backend Routing
      const functionUrl = 'https://admincreateuser-sc33mcrduq-uc.a.run.app'; // Production URL for the region
      
      const response = await axios.post(functionUrl, {
        data: {
          ...newTenant,
          role: 'tenant',
        }
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data?.result?.success) {
        setOpenAdd(false);
        setNewTenant({ email: '', displayName: '', phoneNumber: '', unitId: '', floorNumber: '', emiratesID: '' });
      } else {
        throw new Error(response.data?.result?.message || "Identity provisioning rejected.");
      }
    } catch (error: any) {
      console.error("🚨 [ADMIN-AUTH] Provisioning Failure:", error);
      const errorMsg = error.response?.data?.error?.message || error.message || "Failed to provision tenant profile.";
      alert(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        const data = results.data as any[];
        const batch = writeBatch(db);
        const total = data.length;
        
        try {
          // Sovereign Bulk Ingestion Protocol
          for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const tenantUid = doc(collection(db, 'users')).id;
            const propertyId = row.PropertyID || row.propertyId;
            const unitNumber = row.UnitNumber || row.Unit || row.unitNumber;
            const floor = row.Floor || row.floorNumber || '';
            const emiratesID = row.EmiratesID || row.emiratesID || '';

            // 1. Create User Profile
            const userRef = doc(db, 'users', tenantUid);
            batch.set(userRef, {
              uid: tenantUid,
              displayName: row.Name || row.displayName || 'N/A',
              email: row.Email || row.email,
              phoneNumber: row.Phone || row.phoneNumber || '',
              unitId: unitNumber || '',
              floorNumber: floor,
              emiratesID: emiratesID,
              role: 'tenant',
              status: 'active',
              createdAt: serverTimestamp(),
            });

            // 2. Dynamic Unit Linkage
            if (propertyId && unitNumber) {
                const unitId = `${propertyId}_${unitNumber}`.replace(/\s+/g, '_');
                const unitRef = doc(db, 'units', unitId);
                
                // We overwrite/set unit to link tenant
                batch.set(unitRef, {
                    propertyId,
                    unitNumber,
                    floor,
                    tenantId: tenantUid,
                    status: 'OCCUPIED',
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            setUploadProgress(Math.round(((i + 1) / total) * 100));
          }

          await batch.commit();
          alert(`Successfully ingested ${total} tenants and linked units into registry.`);
        } catch (err) {
          console.error("Bulk ingestion failed:", err);
          alert("Ingestion protocol failed. Check CSV schema.");
        } finally {
          setUploading(false);
          setUploadProgress(0);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }
    });
  };

  const handleEditOpen = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setEditTenant({
      displayName: tenant.displayName || '',
      phoneNumber: tenant.phoneNumber || '',
      unitId: tenant.unitId || '',
      floorNumber: tenant.floorNumber || '',
      emiratesID: tenant.emiratesID || '',
      status: tenant.status || 'active',
    });
    setOpenEdit(true);
  };

  const handleUpdateTenant = async () => {
    if (!selectedTenant) return;
    try {
      const tenantRef = doc(db, 'users', selectedTenant.uid);
      await updateDoc(tenantRef, {
        ...editTenant,
        updatedAt: serverTimestamp(),
      });
      setOpenEdit(false);
    } catch (error) {
      console.error("Error updating tenant:", error);
    }
  };

  const handleDeleteTenant = async (uid: string) => {
    if (window.confirm("Are you sure you want to delete this tenant profile?")) {
      try {
        await deleteDoc(doc(db, 'users', uid));
      } catch (error) {
        console.error("Error deleting tenant:", error);
      }
    }
  };

  const filteredTenants = tenants.filter((tenant: any) => 
    tenant.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.unitId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Container sx={{ py: 10, textAlign: 'center' }}>
        <Typography variant="h6" className="animate-pulse">LOADING TENANTS...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          Tenant <Box component="span" sx={{ color: '#1976d2' }}>Registry</Box>
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <input
            type="file"
            accept=".csv"
            hidden
            ref={fileInputRef}
            onChange={handleBulkUpload}
          />
          <Button 
            variant="outlined" 
            startIcon={<UploadIcon />} 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            sx={{ borderRadius: 100, px: 3 }}
          >
            Bulk CSV Upload
          </Button>
          <Button 
            variant="contained" 
            startIcon={<AddIcon />} 
            onClick={() => setOpenAdd(true)}
            sx={{ borderRadius: 100, px: 3 }}
          >
            Add Tenant
          </Button>
        </Box>
      </Box>

      {uploading && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="caption" sx={{ fontWeight: 900, mb: 1, display: 'block' }}>
            INGESTING BULK DATA: {uploadProgress}%
          </Typography>
          <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 8, borderRadius: 5 }} />
        </Box>
      )}

      <Paper sx={{ p: 3, mb: 4, borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
        <TextField
          fullWidth
          label="Search Tenants"
          placeholder="Name, Email or Unit..."
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={(e: any) => setSearchTerm(e.target.value)}
        />
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Unit</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Floor</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTenants.map((tenant: any) => (
              <TableRow key={tenant.uid} hover>
                <TableCell sx={{ fontWeight: 'bold' }}>{tenant.displayName || 'N/A'}</TableCell>
                <TableCell>{tenant.email}</TableCell>
                <TableCell>{tenant.unitId || 'Unassigned'}</TableCell>
                <TableCell>{tenant.floorNumber || '—'}</TableCell>
                <TableCell>
                  <Chip 
                    label={tenant.status?.toUpperCase() || 'ACTIVE'} 
                    color={tenant.status === 'inactive' ? 'error' : 'success'} 
                    size="small" 
                    sx={{ fontWeight: 'bold', fontSize: 10 }} 
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit Tenant">
                    <IconButton onClick={() => handleEditOpen(tenant)} size="small" color="primary">
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete Tenant">
                    <IconButton onClick={() => handleDeleteTenant(tenant.uid)} size="small" color="error">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add Dialog */}
      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Register New Tenant</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField 
              label="Full Name" 
              fullWidth 
              value={newTenant.displayName} 
              onChange={(e: any) => setNewTenant({...newTenant, displayName: e.target.value})} 
            />
            <TextField 
              label="Email Address" 
              fullWidth 
              value={newTenant.email} 
              onChange={(e: any) => setNewTenant({...newTenant, email: e.target.value})} 
            />
            <TextField 
              label="Phone Number" 
              fullWidth 
              value={newTenant.phoneNumber} 
              onChange={(e: any) => setNewTenant({...newTenant, phoneNumber: e.target.value})} 
            />
            <Grid container spacing={2}>
                <Grid item xs={6}>
                    <TextField 
                        label="Unit ID" 
                        fullWidth 
                        value={newTenant.unitId} 
                        onChange={(e: any) => setNewTenant({...newTenant, unitId: e.target.value})} 
                    />
                </Grid>
                <Grid item xs={6}>
                    <TextField 
                        label="Floor Number" 
                        fullWidth 
                        value={newTenant.floorNumber} 
                        onChange={(e: any) => setNewTenant({...newTenant, floorNumber: e.target.value})} 
                    />
                </Grid>
            </Grid>
            <TextField 
              label="Emirates ID" 
              fullWidth 
              value={newTenant.emiratesID} 
              onChange={(e: any) => setNewTenant({...newTenant, emiratesID: e.target.value})} 
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenAdd(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddTenant} sx={{ borderRadius: 100 }}>Create Profile</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Update Tenant Profile</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField 
              label="Full Name" 
              fullWidth 
              value={editTenant.displayName} 
              onChange={(e: any) => setEditTenant({...editTenant, displayName: e.target.value})} 
            />
            <TextField 
              label="Phone Number" 
              fullWidth 
              value={editTenant.phoneNumber} 
              onChange={(e: any) => setEditTenant({...editTenant, phoneNumber: e.target.value})} 
            />
            <Grid container spacing={2}>
                <Grid item xs={6}>
                    <TextField 
                        label="Unit ID" 
                        fullWidth 
                        value={editTenant.unitId} 
                        onChange={(e: any) => setEditTenant({...editTenant, unitId: e.target.value})} 
                    />
                </Grid>
                <Grid item xs={6}>
                    <TextField 
                        label="Floor Number" 
                        fullWidth 
                        value={editTenant.floorNumber} 
                        onChange={(e: any) => setEditTenant({...editTenant, floorNumber: e.target.value})} 
                    />
                </Grid>
            </Grid>
            <TextField 
              label="Emirates ID" 
              fullWidth 
              value={editTenant.emiratesID} 
              onChange={(e: any) => setEditTenant({...editTenant, emiratesID: e.target.value})} 
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenEdit(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateTenant} sx={{ borderRadius: 100 }}>Save Changes</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
