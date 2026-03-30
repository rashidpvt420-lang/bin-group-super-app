// admin-panel/src/pages/tenants/TenantsManagementPage.tsx
import React, { useState, useEffect } from 'react';
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
  Grid,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { Add as AddIcon } from '@mui/icons-material';

interface Tenant {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  status: 'active' | 'pending' | 'inactive';
  unitId: string;
  role: 'tenant';
}

export default function TenantsManagementPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [openAdd, setOpenAdd] = useState(false);
  const [newTenant, setNewTenant] = useState({
    email: '',
    displayName: '',
    phoneNumber: '',
    unitId: '',
  });

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'tenant'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as Tenant[];
      setTenants(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddTenant = async () => {
    try {
      await addDoc(collection(db, 'users'), {
        ...newTenant,
        role: 'tenant',
        status: 'active',
        createdAt: serverTimestamp(),
      });
      setOpenAdd(false);
      setNewTenant({ email: '', displayName: '', phoneNumber: '', unitId: '' });
    } catch (error) {
      console.error("Error adding tenant:", error);
    }
  };

  const filteredTenants = tenants.filter((tenant) => 
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
        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          onClick={() => setOpenAdd(true)}
          sx={{ borderRadius: 100, px: 3 }}
        >
          Add Tenant
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 4, borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
        <TextField
          fullWidth
          label="Search Tenants"
          placeholder="Name, Email or Unit..."
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Unit</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTenants.map((tenant) => (
              <TableRow key={tenant.uid} hover>
                <TableCell sx={{ fontWeight: 'bold' }}>{tenant.displayName || 'N/A'}</TableCell>
                <TableCell>{tenant.email}</TableCell>
                <TableCell>{tenant.unitId || 'Unassigned'}</TableCell>
                <TableCell>{tenant.phoneNumber || 'N/A'}</TableCell>
                <TableCell>
                  <Chip 
                    label={tenant.status?.toUpperCase() || 'ACTIVE'} 
                    color={tenant.status === 'inactive' ? 'error' : 'success'} 
                    size="small" 
                    sx={{ fontWeight: 'bold', fontSize: 10 }} 
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Register New Tenant</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField 
              label="Full Name" 
              fullWidth 
              value={newTenant.displayName} 
              onChange={(e) => setNewTenant({...newTenant, displayName: e.target.value})} 
            />
            <TextField 
              label="Email Address" 
              fullWidth 
              value={newTenant.email} 
              onChange={(e) => setNewTenant({...newTenant, email: e.target.value})} 
            />
            <TextField 
              label="Phone Number" 
              fullWidth 
              value={newTenant.phoneNumber} 
              onChange={(e) => setNewTenant({...newTenant, phoneNumber: e.target.value})} 
            />
            <TextField 
              label="Unit ID" 
              fullWidth 
              value={newTenant.unitId} 
              onChange={(e) => setNewTenant({...newTenant, unitId: e.target.value})} 
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenAdd(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddTenant} sx={{ borderRadius: 100 }}>Create Profile</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
