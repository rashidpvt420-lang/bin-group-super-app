// admin-panel/src/pages/technicians/TechniciansManagementPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Chip,
  Grid,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Stack,
  Button as MuiButtonBase,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button as MuiButton,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, addDoc, serverTimestamp } from 'firebase/firestore';

interface Technician {
  technicianId: string;
  name: string;
  email: string;
  phone: string;
  specializations: string[];
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
  technicianType: 'BIN_STAFF' | 'BIN_CONTRACTOR';
  institutionalZone: string;
  jobsCompleted: number;
  averageRating: number;
  responseTimeHours: number;
  completionRate: number;
  earningsThisMonth: number;
}

const ADD_TECH_MODAL_SCHEMA = {
  name: '',
  email: '',
  phone: '',
  technicianType: 'BIN_STAFF',
  institutionalZone: 'Dubai Marina',
  specializations: ['General Maintenance']
};

const AddTechnicianModal = ({ open, onClose }: any) => {
  const [formData, setFormData] = useState(ADD_TECH_MODAL_SCHEMA);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.name || !formData.email) {
      alert("Name and email are required for institutional registration.");
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'technicians'), {
        ...formData,
        status: 'ACTIVE',
        jobsCompleted: 0,
        averageRating: 5.0,
        responseTimeHours: 0,
        completionRate: 100,
        earningsThisMonth: 0,
        createdAt: serverTimestamp()
      });
      onClose();
      setFormData(ADD_TECH_MODAL_SCHEMA);
    } catch (e) {
      console.error(e);
      alert("Registration Failure: Field validation or auth collision.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 4, p: 1 } }}>
      <DialogTitle sx={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Register Institutional Personnel</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <TextField fullWidth label="Full Legal Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          <TextField fullWidth label="Corporate Email Address" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
          <TextField fullWidth label="UAE Phone / DID" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Contract Type</InputLabel>
                <Select value={formData.technicianType} label="Contract Type" onChange={e => setFormData({...formData, technicianType: e.target.value as any})}>
                  <MenuItem value="BIN_STAFF">BIN STAFF (INTERNAL)</MenuItem>
                  <MenuItem value="BIN_CONTRACTOR">CONTRACTOR (EXTERNAL)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Operational Zone</InputLabel>
                <Select value={formData.institutionalZone} label="Operational Zone" onChange={e => setFormData({...formData, institutionalZone: e.target.value})}>
                  <MenuItem value="Dubai Marina">Dubai Marina (Zone A)</MenuItem>
                  <MenuItem value="Downtown">Downtown (Zone B)</MenuItem>
                  <MenuItem value="Palm Jumeirah">Palm Jumeirah (Zone C)</MenuItem>
                  <MenuItem value="DIFC">DIFC (Institutional)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 4 }}>
        <MuiButton onClick={onClose} sx={{ fontWeight: 'bold', color: '#64748b' }}>Cancel</MuiButton>
        <MuiButton variant="contained" disabled={submitting} onClick={handleSubmit} sx={{ bgcolor: '#0f172a', fontWeight: 900, borderRadius: 2, px: 4 }}>
          {submitting ? 'Authenticating...' : 'Provision Account'}
        </MuiButton>
      </DialogActions>
    </Dialog>
  );
};

export default function TechniciansManagementPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'technicians'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        technicianId: doc.id,
        ...doc.data()
      } as Technician));
      setTechnicians(fetched);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const getStatusColor = (status: string) => {
    if (status === 'ACTIVE') return 'success';
    if (status === 'ON_LEAVE') return 'warning';
    return 'default';
  };

  if (loading) {
    return (
      <Container sx={{ py: 10, textAlign: 'center' }}>
        <Typography variant="h6" className="animate-pulse">SYNCHRONIZING PERSONNEL DATA...</Typography>
      </Container>
    );
  }

  const activeTechs = technicians.filter(t => t.status === 'ACTIVE').length;
  const avgRating = technicians.length > 0 
    ? (technicians.reduce((sum, t) => sum + (t.averageRating || 0), 0) / technicians.length).toFixed(1)
    : '0.0';
  const avgCompletion = technicians.length > 0
    ? (technicians.reduce((sum, t) => sum + (t.completionRate || 0), 0) / technicians.length).toFixed(0)
    : '0';

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 5 }}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          Personnel <Box component="span" sx={{ color: '#6366f1' }}>Inventory</Box>
        </Typography>
        <MuiButtonBase
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setAddModalOpen(true)}
          sx={{ bgcolor: '#1e293b', px: 3, py: 1.5, borderRadius: 3, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Register Personnel
        </MuiButtonBase>
      </Box>

      <AddTechnicianModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />

      <Grid container spacing={3} sx={{ mb: 6 }}>
        <StatTile label="Total Fleet" value={technicians.length} />
        <StatTile label="On-Chain Active" value={activeTechs} color="#10b981" />
        <StatTile label="Mean Rating" value={`${avgRating} ⭐`} />
        <StatTile label="Mean SLA" value={`${avgCompletion}%`} color="#6366f1" />
      </Grid>

      <Grid container spacing={4}>
        {technicians.length === 0 ? (
          <Grid item xs={12}>
            <Paper sx={{ p: 10, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 4 }}>
              <Typography color="textSecondary" sx={{ fontStyle: 'italic' }}>No registered personnel found in the sovereign shard.</Typography>
            </Paper>
          </Grid>
        ) : (
          technicians.map((tech) => (
            <Grid item xs={12} md={6} key={tech.technicianId}>
              <Card sx={{ borderRadius: 4, border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 900 }}>{tech.name}</Typography>
                      <Typography variant="body2" sx={{ color: '#64748b' }}>{tech.email}</Typography>
                    </Box>
                    <Chip label={tech.status} color={getStatusColor(tech.status)} size="small" sx={{ fontWeight: 'bold' }} />
                  </Box>

                  <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
                    <Chip label={tech.technicianType?.split('_').join(' ')} size="small" variant="outlined" sx={{ fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label={tech.institutionalZone} size="small" sx={{ fontWeight: 'bold', fontSize: 10, bgcolor: 'rgba(99,102,241,0.1)', color: '#4f46e5' }} />
                  </Stack>

                  <Box sx={{ mb: 3 }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', display: 'block', mb: 1 }}>SLA Performance</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <PerformanceMeter label={`Rating ${tech.averageRating}`} value={(tech.averageRating || 0) * 20} color="#f59e0b" />
                      </Grid>
                      <Grid item xs={6}>
                        <PerformanceMeter label={`Completion ${tech.completionRate}%`} value={tech.completionRate || 0} color="#10b981" />
                      </Grid>
                    </Grid>
                  </Box>

                  <Grid container spacing={1} sx={{ bgcolor: '#f8fafc', p: 2, borderRadius: 2 }}>
                    <Metric label="Total Jobs" value={tech.jobsCompleted || 0} />
                    <Metric label="Resp. Speed" value={`${tech.responseTimeHours || 0}h`} />
                    <Metric label="Monthly Earnings" value={`AED ${tech.earningsThisMonth || 0}`} />
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>
    </Container>
  );
}

const StatTile = ({ label, value, color }: any) => (
  <Grid item xs={12} sm={6} md={3}>
    <Paper sx={{ p: 3, textAlign: 'center', borderRadius: 4, border: '1px solid rgba(0,0,0,0.05)' }}>
      <Typography variant="overline" sx={{ color: '#94a3b8', fontWeight: 'black' }}>{label}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 900, color: color || '#1e293b' }}>{value}</Typography>
    </Paper>
  </Grid>
);

const PerformanceMeter = ({ label, value, color }: any) => (
  <Box>
    <Typography variant="caption" sx={{ color: '#64748b', mb: 0.5, display: 'block' }}>{label}</Typography>
    <LinearProgress variant="determinate" value={value} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(0,0,0,0.05)', '& .MuiLinearProgress-bar': { bgcolor: color } }} />
  </Box>
);

const Metric = ({ label, value }: any) => (
  <Grid item xs={4}>
    <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', textTransform: 'uppercase', fontSize: 9, fontWeight: 'bold' }}>{label}</Typography>
    <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>{value}</Typography>
  </Grid>
);
