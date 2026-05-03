import React, { useState, useEffect } from 'react';
import {
  Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, TextField, Typography,
  Button, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, CircularProgress,
  FormControl, InputLabel, Select, MenuItem,
  FormControlLabel, Switch, Checkbox, ListItemText,
  alpha, Stack, Avatar
} from '@mui/material';
import { 
    Users, Wrench, Edit3, Trash2, Shield, Search, 
    Zap, Clock, MapPin, Activity 
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, query, where, serverTimestamp, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import axios from 'axios';
import { useLanguage, binThemeTokens } from '@bin/shared';
import AdminPageFrame from '../../components/AdminPageFrame';

interface Technician {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  status: 'active' | 'pending' | 'inactive' | 'on-duty';
  specialization: string;
  role: 'technician';
  emiratesCovered?: string[];
  primaryEmirate?: string;
  onDuty?: boolean;
  emergencyEligible?: boolean;
  maxConcurrentJobs?: number;
  createdAt?: any;
}

export default function TechniciansManagementPage() {
  const { t, tx, isRTL } = useLanguage();
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
    status: 'active' as any,
    emiratesCovered: [] as string[],
    primaryEmirate: '',
    maxConcurrentJobs: 3,
    emergencyEligible: false,
    onDuty: false,
  });

  useEffect(() => {
    const q = query(
        collection(db, 'users'), 
        where('role', '==', 'technician'),
        orderBy('createdAt', 'desc')
    );
    
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
      if (!user) throw new Error("UNAUTHENTICATED");

      const token = await user.getIdToken(true);
      const functionUrl = 'https://admincreateuser-sc33mcrduq-uc.a.run.app';
      
      const response = await axios.post(functionUrl, {
        data: { ...newTech, role: 'technician' }
      }, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      if (response.data?.result?.success) {
        setOpenAdd(false);
        setNewTech({ email: '', displayName: '', phoneNumber: '', specialization: '' });
      } else {
        throw new Error(response.data?.result?.message || "Provisioning Failed");
      }
    } catch (error: any) {
      alert(error.message);
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
      await updateDoc(doc(db, 'users', selectedTech.uid), {
        ...editTech,
        updatedAt: serverTimestamp(),
      });
      setOpenEdit(false);
    } catch (error) {
      console.error("Error updating technician:", error);
    }
  };

  const filteredTechs = techs.filter((tech) => 
    tech.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tech.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tech.specialization?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AdminPageFrame
      title={t('admin.technician_corps') || 'TECHNICIAN CORPS'}
      subtitle="Institutional fleet management and specialized field force deployment"
      loading={loading}
      breadcrumbs={[{ label: 'Technicians' }]}
      actions={
        <Button 
          variant="contained" 
          startIcon={<Users size={18} />} 
          onClick={() => setOpenAdd(true)}
          sx={{ borderRadius: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
        >
          ONBOARD TECH
        </Button>
      }
    >
      <Paper sx={{ p: 2, mb: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
            <Search size={20} color="rgba(255,255,255,0.3)" />
            <TextField
                fullWidth
                placeholder="Search by name, email, or specialization..."
                variant="standard"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{ disableUnderline: true, style: { color: '#FFF', fontWeight: 700 } }}
            />
        </Stack>
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>TECHNICIAN</TableCell>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>SPECIALIZATION</TableCell>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>METRICS</TableCell>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>STATUS</TableCell>
              <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTechs.map((tech) => (
              <TableRow key={tech.uid} hover>
                <TableCell>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }}>
                        {tech.displayName?.charAt(0) || 'T'}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{tech.displayName}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{tech.email}</Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                    <Chip label={tech.specialization?.toUpperCase() || 'GENERAL'} size="small" variant="outlined" sx={{ fontWeight: 900, fontSize: '0.65rem' }} />
                </TableCell>
                <TableCell>
                    <Stack direction="row" spacing={2}>
                        <Tooltip title="Emergency Eligible">
                            <Box sx={{ color: tech.emergencyEligible ? binThemeTokens.gold : 'rgba(255,255,255,0.1)' }}>
                                <Zap size={14} />
                            </Box>
                        </Tooltip>
                        <Tooltip title="Max Jobs">
                            <Typography variant="caption" sx={{ fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>
                                {tech.maxConcurrentJobs || 0} MAX
                            </Typography>
                        </Tooltip>
                    </Stack>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={tech.status?.toUpperCase() || 'ACTIVE'} 
                    size="small" 
                    sx={{ 
                        bgcolor: tech.onDuty ? alpha('#10b981', 0.1) : 'rgba(255,255,255,0.05)',
                        color: tech.onDuty ? '#10b981' : 'rgba(255,255,255,0.4)',
                        fontWeight: 950, fontSize: '0.6rem'
                    }} 
                  />
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <IconButton size="small" onClick={() => handleEditOpen(tech)} sx={{ color: binThemeTokens.gold }}><Edit3 size={16} /></IconButton>
                    <IconButton size="small" color="error"><Trash2 size={16} /></IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add Dialog */}
      <Dialog 
        open={openAdd} 
        onClose={() => setOpenAdd(false)} 
        fullWidth maxWidth="sm"
        PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
      >
        <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>ONBOARD SOVEREIGN TECHNICIAN</DialogTitle>
        <DialogContent sx={{ py: 3 }}>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField label="Full Name" fullWidth value={newTech.displayName} onChange={(e) => setNewTech({...newTech, displayName: e.target.value})} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
            <TextField label="Email Address" fullWidth value={newTech.email} onChange={(e) => setNewTech({...newTech, email: e.target.value})} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
            <TextField label="Phone Number" fullWidth value={newTech.phoneNumber} onChange={(e) => setNewTech({...newTech, phoneNumber: e.target.value})} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
            <TextField label="Specialization" fullWidth value={newTech.specialization} onChange={(e) => setNewTech({...newTech, specialization: e.target.value})} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
          <Button 
            variant="contained" 
            onClick={handleAddTech} 
            disabled={submitting}
            sx={{ borderRadius: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, minWidth: 150 }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : 'DEPLOY FLEET'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog 
        open={openEdit} 
        onClose={() => setOpenEdit(false)} 
        fullWidth maxWidth="sm"
        PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
      >
        <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>RECONFIGURE UNIT</DialogTitle>
        <DialogContent sx={{ py: 3 }}>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField label="Display Name" fullWidth value={editTech.displayName} onChange={(e) => setEditTech({...editTech, displayName: e.target.value})} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
            <TextField label="Phone Number" fullWidth value={editTech.phoneNumber} onChange={(e) => setEditTech({...editTech, phoneNumber: e.target.value})} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
            <TextField label="Specialization" fullWidth value={editTech.specialization} onChange={(e) => setEditTech({...editTech, specialization: e.target.value})} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />

            <FormControl fullWidth>
              <InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Primary Emirate</InputLabel>
              <Select value={editTech.primaryEmirate} onChange={(e) => setEditTech({...editTech, primaryEmirate: e.target.value})} sx={{ color: '#FFF' }}>
                {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah', 'Al Ain'].map(e => (
                  <MenuItem key={e} value={e}>{e}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center" sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                <FormControlLabel
                    control={<Switch checked={editTech.onDuty} onChange={(e) => setEditTech({...editTech, onDuty: e.target.checked})} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: binThemeTokens.gold } }} />}
                    label={<Typography variant="body2" sx={{ fontWeight: 900, color: '#FFF' }}>ON DUTY</Typography>}
                />
                <FormControlLabel
                    control={<Switch checked={editTech.emergencyEligible} onChange={(e) => setEditTech({...editTech, emergencyEligible: e.target.checked})} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#EF4444' } }} />}
                    label={<Typography variant="body2" sx={{ fontWeight: 900, color: '#FFF' }}>SOS ELIGIBLE</Typography>}
                />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Button onClick={() => setOpenEdit(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
          <Button variant="contained" onClick={handleUpdateTech} sx={{ borderRadius: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>SAVE RECONFIGURATION</Button>
        </DialogActions>
      </Dialog>
    </AdminPageFrame>
  );
}
  );
}
