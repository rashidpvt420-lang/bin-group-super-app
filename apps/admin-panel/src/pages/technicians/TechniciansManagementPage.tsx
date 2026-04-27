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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Checkbox,
  ListItemText,
} from '@mui/material';
import { db, auth } from '../../lib/firebase';
import { collection, onSnapshot, query, where, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Add as AddIcon, Build as BuildIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import axios from 'axios';
import { useLanguage } from '@bin/shared';

interface Technician {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  status: 'active' | 'pending' | 'inactive' | 'on-duty';
  specialization: string;
  role: 'technician';
  
  // Advanced Institutional Fields
  emiratesCovered?: string[];
  citiesCovered?: string[];
  areasCovered?: string[];
  primaryEmirate?: string;
  primaryCity?: string;
  primaryArea?: string;
  onDuty?: boolean;
  available?: boolean;
  currentJobCount?: number;
  maxConcurrentJobs?: number;
  shiftStart?: string;
  shiftEnd?: string;
  rating?: number;
  emergencyEligible?: boolean;
}

export default function TechniciansManagementPage() {
  const { t, isRTL } = useLanguage();
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
    emiratesCovered: [] as string[],
    primaryEmirate: '',
    maxConcurrentJobs: 3,
    emergencyEligible: false,
    onDuty: false,
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
        throw new Error(response.data?.result?.message || t('admin.tech.provision_failed'));
      }
    } catch (error: any) {
      console.error("🚨 [ADMIN-AUTH] Provisioning Failure:", error);
      const errorMsg = error.response?.data?.error?.message || error.message || t('admin.tech.provision_failed');
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
      emiratesCovered: tech.emiratesCovered || [],
      primaryEmirate: tech.primaryEmirate || '',
      maxConcurrentJobs: tech.maxConcurrentJobs || 3,
      emergencyEligible: !!tech.emergencyEligible,
      onDuty: !!tech.onDuty,
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
        emiratesCovered: editTech.emiratesCovered,
        primaryEmirate: editTech.primaryEmirate,
        maxConcurrentJobs: editTech.maxConcurrentJobs,
        emergencyEligible: editTech.emergencyEligible,
        onDuty: editTech.onDuty,
      }).catch(() => {/* tech doc might not exist yet */});

      setOpenEdit(false);
    } catch (error) {
      console.error("Error updating technician:", error);
    }
  };

  const handleDeleteTech = async (uid: string) => {
    if (window.confirm(t('admin.tech.delete_confirm'))) {
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
        <Typography variant="h6" className="animate-pulse">{t('admin.tech.loading')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Typography variant="h4" sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
          {t('nav.technicians')} <Box component="span" sx={{ color: '#10b981' }}>{t('admin.tech.force')}</Box>
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          onClick={() => setOpenAdd(true)}
          sx={{ borderRadius: 100, px: 3, bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' } }}
        >
          {t('admin.tech.add_btn')}
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 4, borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
        <TextField
          fullWidth
          label={t('admin.tech.search_label')}
          placeholder={t('admin.tech.search_placeholder')}
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ textAlign: isRTL ? 'right' : 'left' }}
        />
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f8fafc' }}>
            <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('admin.tech.table.name')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('admin.tech.table.specialization')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('admin.tech.table.email')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('admin.tech.table.phone')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('admin.tech.table.status')}</TableCell>
              <TableCell align={isRTL ? 'left' : 'right'} sx={{ fontWeight: 'bold' }}>{t('admin.tech.table.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTechs.map((tech) => (
              <TableRow key={tech.uid} hover sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <BuildIcon sx={{ fontSize: 16, color: '#10b981' }} />
                        {tech.displayName || 'N/A'}
                    </Box>
                </TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Chip label={tech.specialization || 'General'} size="small" variant="outlined" />
                </TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{tech.email}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{tech.phoneNumber || 'N/A'}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Chip 
                    label={tech.status?.toUpperCase() || 'ACTIVE'} 
                    color={tech.status === 'on-duty' ? 'info' : 'success'} 
                    size="small" 
                    sx={{ fontWeight: 'bold', fontSize: 10 }} 
                  />
                </TableCell>
                <TableCell align={isRTL ? 'left' : 'right'}>
                  <Tooltip title={t('admin.tech.edit_tooltip')}>
                    <IconButton onClick={() => handleEditOpen(tech)} size="small" sx={{ color: '#10b981' }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('admin.tech.delete_tooltip')}>
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
      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} fullWidth maxWidth="sm" dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('admin.tech.onboard_title')}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField 
              label={t('admin.tech.field.fullname')} 
              fullWidth 
              value={newTech.displayName} 
              onChange={(e) => setNewTech({...newTech, displayName: e.target.value})} 
            />
            <TextField 
              label={t('admin.tech.field.email')} 
              fullWidth 
              value={newTech.email} 
              onChange={(e) => setNewTech({...newTech, email: e.target.value})} 
            />
            <TextField 
              label={t('admin.tech.field.phone')} 
              fullWidth 
              value={newTech.phoneNumber} 
              onChange={(e) => setNewTech({...newTech, phoneNumber: e.target.value})} 
            />
            <TextField 
              label={t('admin.tech.field.specialization')} 
              fullWidth 
              value={newTech.specialization} 
              onChange={(e) => setNewTech({...newTech, specialization: e.target.value})} 
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: isRTL ? 'flex-start' : 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button onClick={() => setOpenAdd(false)}>{t('common.cancel')}</Button>
          <Button 
            variant="contained" 
            onClick={handleAddTech} 
            disabled={submitting}
            sx={{ borderRadius: 100, bgcolor: '#10b981', minWidth: 150 }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : t('admin.tech.deploy_btn')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} fullWidth maxWidth="sm" dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('admin.tech.update_title')}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField 
              label={t('admin.tech.field.fullname')} 
              fullWidth 
              value={editTech.displayName} 
              onChange={(e) => setEditTech({...editTech, displayName: e.target.value})} 
            />
            <TextField 
              label={t('admin.tech.field.phone')} 
              fullWidth 
              value={editTech.phoneNumber} 
              onChange={(e) => setEditTech({...editTech, phoneNumber: e.target.value})} 
            />
            <TextField 
              label={t('admin.tech.field.specialization')} 
              fullWidth 
              value={editTech.specialization} 
              onChange={(e) => setEditTech({...editTech, specialization: e.target.value})} 
            />

            <FormControl fullWidth>
              <InputLabel>Primary Emirate</InputLabel>
              <Select
                value={editTech.primaryEmirate}
                label="Primary Emirate"
                onChange={(e) => setEditTech({...editTech, primaryEmirate: e.target.value})}
              >
                {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah', 'Al Ain'].map(e => (
                  <MenuItem key={e} value={e}>{e}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Emirates Covered</InputLabel>
              <Select
                multiple
                value={editTech.emiratesCovered}
                label="Emirates Covered"
                onChange={(e) => setEditTech({...editTech, emiratesCovered: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value})}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={value} size="small" />
                    ))}
                  </Box>
                )}
              >
                {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah', 'Al Ain'].map((name) => (
                  <MenuItem key={name} value={name}>
                    <Checkbox checked={editTech.emiratesCovered.indexOf(name) > -1} />
                    <ListItemText primary={name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField 
                label="Max Concurrent Jobs" 
                type="number"
                fullWidth 
                value={editTech.maxConcurrentJobs} 
                onChange={(e) => setEditTech({...editTech, maxConcurrentJobs: parseInt(e.target.value) || 0})} 
            />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <FormControlLabel
                    control={<Switch checked={editTech.onDuty} onChange={(e) => setEditTech({...editTech, onDuty: e.target.checked})} />}
                    label="On Duty"
                />
                <FormControlLabel
                    control={<Switch checked={editTech.emergencyEligible} onChange={(e) => setEditTech({...editTech, emergencyEligible: e.target.checked})} />}
                    label="Emergency SOS Eligible"
                />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: isRTL ? 'flex-start' : 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button onClick={() => setOpenEdit(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleUpdateTech} sx={{ borderRadius: 100, bgcolor: '#10b981' }}>{t('common.save_changes')}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
