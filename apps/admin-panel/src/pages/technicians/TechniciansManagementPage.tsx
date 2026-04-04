// admin-panel/src/pages/technicians/TechniciansManagementPage.tsx
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
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { db, auth } from '../../lib/firebase';
import { collection, onSnapshot, query, where, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Add as AddIcon, Build as BuildIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import axios from 'axios';

interface Technician {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  status: 'active' | 'pending' | 'inactive' | 'on-duty';
  specialization: string;
  role: 'technician';
}

export default function TechniciansManagementPage() {
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);

  const [newTech, setNewTech] = useState({
    email: '',
    displayName: '',
    phoneNumber: '',
    specialization: '',
  });

  const [editTech, setEditTech] = useState({
    displayName: '',
    phoneNumber: '',
    specialization: '',
    status: 'active' as 'active' | 'pending' | 'inactive' | 'on-duty',
  });

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'technician'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as Technician[];
      setTechs(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddTech = async () => {
    setSubmitting(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("UNAUTHENTICATED: No active administrative session.");

      const token = await user.getIdToken(true);
      // [SOVEREIGN-DISPATCH] Manual Token Injection for Secure Backend Routing
      const functionUrl = 'https://admincreateuser-sc33mcrduq-uc.a.run.app'; // Production URL for the region
      
      const response = await axios.post(functionUrl, {
        data: {
          ...newTech,
          role: 'technician',
        }
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data?.result?.success) {
        setOpenAdd(false);
        setNewTech({ email: '', displayName: '', phoneNumber: '', specialization: '' });
      } else {
        throw new Error(response.data?.result?.message || "Identity provisioning rejected.");
      }
    } catch (error: any) {
      console.error("🚨 [ADMIN-AUTH] Provisioning Failure:", error);
      const errorMsg = error.response?.data?.error?.message || error.message || "Failed to provision technician.";
      alert(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOpen = (tech: Technician) => {
    setSelectedTech(tech);
    setEditTech({
      displayName: tech.displayName || '',
      phoneNumber: tech.phoneNumber || '',
      specialization: tech.specialization || '',
      status: tech.status || 'active',
    });
    setOpenEdit(true);
  };

  const handleUpdateTech = async () => {
    if (!selectedTech) return;
    try {
      const userRef = doc(db, 'users', selectedTech.uid);
      await updateDoc(userRef, {
        ...editTech,
        updatedAt: serverTimestamp(),
      });
      
      // Update in technicians collection
      const techRef = doc(db, 'technicians', selectedTech.uid);
      await updateDoc(techRef, {
        displayName: editTech.displayName,
        phoneNumber: editTech.phoneNumber,
        specialization: editTech.specialization,
        status: editTech.status,
      }).catch(() => {/* tech doc might not exist yet */});

      setOpenEdit(false);
    } catch (error) {
      console.error("Error updating technician:", error);
    }
  };

  const handleDeleteTech = async (uid: string) => {
    if (window.confirm("Are you sure you want to decommission this technician?")) {
      try {
        await deleteDoc(doc(db, 'users', uid));
        await deleteDoc(doc(db, 'technicians', uid)).catch(() => {});
      } catch (error) {
        console.error("Error deleting technician:", error);
      }
    }
  };

  const filteredTechs = techs.filter((tech) => 
    tech.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tech.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tech.specialization?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Container sx={{ py: 10, textAlign: 'center' }}>
        <Typography variant="h6" className="animate-pulse">LOADING TECHNICIANS...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          Technician <Box component="span" sx={{ color: '#10b981' }}>Force</Box>
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          onClick={() => setOpenAdd(true)}
          sx={{ borderRadius: 100, px: 3, bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' } }}
        >
          Add Technician
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 4, borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
        <TextField
          fullWidth
          label="Search Force"
          placeholder="Name, Email or Specialization..."
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
              <TableCell sx={{ fontWeight: 'bold' }}>Specialization</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTechs.map((tech) => (
              <TableRow key={tech.uid} hover>
                <TableCell sx={{ fontWeight: 'bold' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BuildIcon sx={{ fontSize: 16, color: '#10b981' }} />
                        {tech.displayName || 'N/A'}
                    </Box>
                </TableCell>
                <TableCell>
                    <Chip label={tech.specialization || 'General'} size="small" variant="outlined" />
                </TableCell>
                <TableCell>{tech.email}</TableCell>
                <TableCell>{tech.phoneNumber || 'N/A'}</TableCell>
                <TableCell>
                  <Chip 
                    label={tech.status?.toUpperCase() || 'ACTIVE'} 
                    color={tech.status === 'on-duty' ? 'info' : 'success'} 
                    size="small" 
                    sx={{ fontWeight: 'bold', fontSize: 10 }} 
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit Technician">
                    <IconButton onClick={() => handleEditOpen(tech)} size="small" sx={{ color: '#10b981' }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete Technician">
                    <IconButton onClick={() => handleDeleteTech(tech.uid)} size="small" color="error">
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
        <DialogTitle sx={{ fontWeight: 900 }}>Onboard New Technician</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField 
              label="Full Name" 
              fullWidth 
              value={newTech.displayName} 
              onChange={(e) => setNewTech({...newTech, displayName: e.target.value})} 
            />
            <TextField 
              label="Email Address" 
              fullWidth 
              value={newTech.email} 
              onChange={(e) => setNewTech({...newTech, email: e.target.value})} 
            />
            <TextField 
              label="Phone Number" 
              fullWidth 
              value={newTech.phoneNumber} 
              onChange={(e) => setNewTech({...newTech, phoneNumber: e.target.value})} 
            />
            <TextField 
              label="Specialization (e.g. Electrical, Plumbing)" 
              fullWidth 
              value={newTech.specialization} 
              onChange={(e) => setNewTech({...newTech, specialization: e.target.value})} 
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenAdd(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleAddTech} 
            disabled={submitting}
            sx={{ borderRadius: 100, bgcolor: '#10b981', minWidth: 150 }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : 'Deploy Technician'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Update Technician Profile</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField 
              label="Full Name" 
              fullWidth 
              value={editTech.displayName} 
              onChange={(e) => setEditTech({...editTech, displayName: e.target.value})} 
            />
            <TextField 
              label="Phone Number" 
              fullWidth 
              value={editTech.phoneNumber} 
              onChange={(e) => setEditTech({...editTech, phoneNumber: e.target.value})} 
            />
            <TextField 
              label="Specialization" 
              fullWidth 
              value={editTech.specialization} 
              onChange={(e) => setEditTech({...editTech, specialization: e.target.value})} 
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenEdit(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateTech} sx={{ borderRadius: 100, bgcolor: '#10b981' }}>Save Changes</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
