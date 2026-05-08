import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, TextField, Typography,
  Button, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, CircularProgress,
  FormControl, InputLabel, Select, MenuItem,
  FormControlLabel, Switch, Stack, Avatar
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { 
    Users, Wrench, Edit3, Trash2, Shield, Search, 
    Zap, Clock, MapPin, Activity, Star, 
    Briefcase, CheckCircle2, UserPlus, Phone, Mail
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { 
    collection, onSnapshot, query, where, serverTimestamp, 
    doc, updateDoc, deleteDoc, orderBy 
} from 'firebase/firestore';
import { useLanguage } from '../../../context/LanguageContext';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import AdminCrudActions from '../../components/AdminCrudActions';
import AddTechnicianDialog from '../../components/technicians/AddTechnicianDialog';

export default function TechniciansManagementPage() {
  const { t } = useLanguage();
  const [techs, setTechs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [openEdit, setOpenEdit] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [selectedTech, setSelectedTech] = useState<any>(null);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'technician'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTechs(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
        console.error("Tech Sync Error:", err);
        setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleEdit = (tech: any) => {
    setSelectedTech(tech);
    setOpenEdit(true);
  };

  const filteredTechs = techs.filter(t => 
      (t.displayName || '').toLowerCase().includes(filter.toLowerCase()) || 
      (t.specialization || '').toLowerCase().includes(filter.toLowerCase()) ||
      (t.email || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <AdminPageFrame
      title="Technician Corps"
      subtitle="Fleet management and specialized field force deployment terminal"
      loading={loading}
      breadcrumbs={[{ label: 'Technicians' }]}
      actions={
        <Button 
            variant="contained" 
            startIcon={<UserPlus size={18} />} 
            onClick={() => setOpenAdd(true)}
            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
        >
            ADD TECHNICIAN
        </Button>
      }
    >
      <Paper sx={{ p: 2, mb: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
            <Search size={20} color="rgba(255,255,255,0.3)" />
            <TextField
                fullWidth
                placeholder="Search by name, trade, or email..."
                variant="standard"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                InputProps={{ disableUnderline: true, style: { color: '#FFF', fontWeight: 700 } }}
            />
        </Stack>
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>TECHNICIAN / UID</TableCell>
              <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>SPECIALTY / STATUS</TableCell>
              <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>OPERATIONAL LOAD</TableCell>
              <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>SLA & RATING</TableCell>
              <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTechs.map((tech) => (
              <TableRow key={tech.uid} hover>
                <TableCell>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }}>
                        {(tech.displayName || 'T').charAt(0)}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{tech.displayName || 'UNSPECIFIED'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', display: 'block' }}>{(tech.uid || '').slice(0, 12).toUpperCase()}</Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                    <Typography variant="body2" color="#FFF" fontWeight="700">{String(tech.specialization || 'GENERAL').toUpperCase()}</Typography>
                    <Chip 
                        label={String(tech.dutyStatus || 'OFFLINE').toUpperCase()} 
                        size="small" 
                        sx={{ 
                            height: 16, fontSize: '0.55rem', fontWeight: 950, mt: 0.5,
                            bgcolor: tech.onDuty ? alpha('#10b981', 0.1) : 'rgba(255,255,255,0.05)',
                            color: tech.onDuty ? '#10b981' : 'rgba(255,255,255,0.3)'
                        }} 
                    />
                </TableCell>
                <TableCell>
                    <Stack spacing={1}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Briefcase size={12} color="rgba(255,255,255,0.3)" />
                            <Typography variant="caption" sx={{ fontWeight: 800, color: '#FFF' }}>{tech.activeJobs || 0} ACTIVE MISSIONS</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CheckCircle2 size={12} color="#10b981" />
                            <Typography variant="caption" sx={{ fontWeight: 800, color: 'rgba(255,255,255,0.5)' }}>{tech.completedJobs || 0} RESOLVED</Typography>
                        </Box>
                    </Stack>
                </TableCell>
                <TableCell>
                    <Stack spacing={1}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {[1,2,3,4,5].map(i => <Star key={i} size={10} fill={i <= (tech.rating || 5) ? binThemeTokens.gold : 'transparent'} color={binThemeTokens.gold} />)}
                            <Typography variant="caption" sx={{ fontWeight: 950, color: binThemeTokens.gold, ml: 1 }}>{(tech.performanceScore || 100).toFixed(0)}%</Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>SLA COMPLIANCE: 98.2%</Typography>
                    </Stack>
                </TableCell>
                <TableCell align="right">
                    <AdminCrudActions 
                        id={tech.uid}
                        actions={[
                            { type: 'view', onClick: (id) => {} },
                            { type: 'edit', onClick: (id) => handleEdit(tech) },
                            { type: 'assign', label: 'ASSIGN JOB', onClick: (id) => {} },
                            { type: 'delete', onClick: (id) => deleteDoc(doc(db, 'users', id)), requiresConfirm: true }
                        ]}
                    />
                </TableCell>
              </TableRow>
            ))}
            {filteredTechs.length === 0 && !loading && (
                <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 10, color: 'rgba(255,255,255,0.1)', fontWeight: 900 }}>NO TECHNICIAN UNITS FOUND</TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit Dialog */}
      <Dialog 
        open={openEdit} 
        onClose={() => setOpenEdit(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
      >
        <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold, py: 3 }}>RECONFIGURE TECHNICIAN UNIT</DialogTitle>
        <DialogContent sx={{ py: 3 }}>
            <Stack spacing={3} sx={{ mt: 1 }}>
                <TextField label="Full Name" fullWidth value={selectedTech?.displayName || ''} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
                <TextField label="Specialization" fullWidth value={selectedTech?.specialization || ''} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
                <FormControl fullWidth>
                    <InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Status</InputLabel>
                    <Select value={selectedTech?.status || 'active'} label="Status" sx={{ color: '#FFF' }}>
                        <MenuItem value="active">Active</MenuItem>
                        <MenuItem value="suspended">Suspended</MenuItem>
                        <MenuItem value="on-duty">On-Duty</MenuItem>
                    </Select>
                </FormControl>
                <FormControlLabel
                    control={<Switch checked={!!selectedTech?.emergencyEligible} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#EF4444' } }} />}
                    label={<Typography variant="body2" sx={{ fontWeight: 900, color: '#FFF' }}>SOS MISSION ELIGIBLE</Typography>}
                />
            </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <Button onClick={() => setOpenEdit(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
            <Button variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>COMMIT REVISIONS</Button>
        </DialogActions>
      </Dialog>

      <AddTechnicianDialog 
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onSuccess={(msg) => setSuccess(msg)}
      />
    </AdminPageFrame>
  );
}
