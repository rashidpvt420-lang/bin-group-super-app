import React, { useState, useEffect } from 'react';
import {
  Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Chip, Grid,
  Typography, alpha, Stack, IconButton, Avatar
} from '@mui/material';
import { 
    Users, Shield, ExternalLink, Mail, Phone, 
    Building2, Layout, Wallet, History
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, orderBy } from 'firebase/firestore';
import { useLanguage, binThemeTokens } from '@bin/shared';
import AdminPageFrame from '../../components/AdminPageFrame';
import { useNavigate } from 'react-router-dom';

interface Owner {
  id: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  totalBuildings?: number;
  totalUnits?: number;
  monthlyRentCollected?: number;
  unpaidInvoiceCount?: number;
  status?: 'ACTIVE' | 'SUSPENDED';
  createdAt?: any;
}

export default function OwnerManagementPage() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');

  useEffect(() => {
    const q = query(
        collection(db, 'users'), 
        where('role', 'in', ['owner', 'OWNER']),
        orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOwners = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Owner[];
      setOwners(fetchedOwners);
      setLoading(false);
    }, (error) => {
      console.error('Failed to fetch owners:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSuspend = async () => {
    if (!selectedOwner) return;

    try {
      await updateDoc(doc(db, 'users', selectedOwner.id), {
        status: 'SUSPENDED',
        suspensionReason,
        suspendedAt: new Date().toISOString()
      });
      setSuspendDialogOpen(false);
      setSuspensionReason('');
    } catch (error) {
      console.error('Failed to suspend owner:', error);
      alert(t('admin.suspend_owner_failed'));
    }
  };

  const handleResume = async (ownerId: string) => {
    try {
      await updateDoc(doc(db, 'users', ownerId), {
        status: 'ACTIVE',
        resumedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to resume owner:', error);
      alert(t('admin.resume_owner_failed'));
    }
  };

  return (
    <AdminPageFrame
      title={t('admin.owner_management') || 'OWNER REGISTRY'}
      subtitle="Strategic management of institutional and private asset owners"
      loading={loading}
      breadcrumbs={[{ label: 'Owners' }]}
      actions={
        <Button 
            variant="contained" 
            startIcon={<Users size={18} />} 
            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
        >
            ADD OWNER
        </Button>
      }
    >
      <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>OWNER IDENTITY</TableCell>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>PORTFOLIO</TableCell>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>REVENUE</TableCell>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>STATUS</TableCell>
              <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {owners.map((owner) => (
              <TableRow key={owner.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }}>
                        {owner.displayName?.charAt(0) || 'O'}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{owner.displayName}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{owner.email}</Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                    <Stack direction="row" spacing={2}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Building2 size={14} color="rgba(255,255,255,0.3)" />
                            <Typography variant="caption" sx={{ display: 'block', color: '#FFF', fontWeight: 900 }}>{owner.totalBuildings || 0}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center' }}>
                            <Layout size={14} color="rgba(255,255,255,0.3)" />
                            <Typography variant="caption" sx={{ display: 'block', color: '#FFF', fontWeight: 900 }}>{owner.totalUnits || 0}</Typography>
                        </Box>
                    </Stack>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 900, color: '#10b981' }}>
                    AED {(owner.monthlyRentCollected || 0).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>MONTHLY FLOW</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={owner.status || 'ACTIVE'}
                    size="small"
                    sx={{ 
                        bgcolor: owner.status === 'SUSPENDED' ? alpha(binThemeTokens.danger, 0.1) : alpha('#10b981', 0.1),
                        color: owner.status === 'SUSPENDED' ? binThemeTokens.danger : '#10b981',
                        fontWeight: 950, fontSize: '0.65rem'
                    }}
                  />
                </TableCell>
                <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <IconButton size="small" onClick={() => navigate(`/admin/owners/${owner.id}`)} sx={{ color: binThemeTokens.gold }}>
                            <ExternalLink size={16} />
                        </IconButton>
                        <Button
                            size="small"
                            variant="outlined"
                            color={owner.status === 'SUSPENDED' ? 'success' : 'error'}
                            onClick={() => {
                                if (owner.status === 'SUSPENDED') {
                                    handleResume(owner.id);
                                } else {
                                    setSelectedOwner(owner);
                                    setSuspendDialogOpen(true);
                                }
                            }}
                            sx={{ fontWeight: 900, fontSize: '0.65rem', borderRadius: 2 }}
                        >
                            {owner.status === 'SUSPENDED' ? 'RESUME' : 'SUSPEND'}
                        </Button>
                    </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Suspension Dialog */}
      <Dialog 
        open={suspendDialogOpen} 
        onClose={() => setSuspendDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: `1px solid ${alpha(binThemeTokens.danger, 0.2)}` } }}
      >
        <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.danger }}>OPERATIONAL SUSPENSION</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 2, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
            Confirming suspension for <Box component="span" sx={{ color: '#FFF', fontWeight: 900 }}>{selectedOwner?.displayName}</Box>. 
            All portal access and financial dispatches for this entity will be frozen.
          </Typography>
          <TextField
            fullWidth
            label="Suspension Rationale"
            multiline
            rows={4}
            value={suspensionReason}
            onChange={(e) => setSuspensionReason(e.target.value)}
            variant="outlined"
            InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }}
            InputProps={{ style: { color: '#FFF' } }}
            sx={{ mt: 2, '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Button onClick={() => setSuspendDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>ABORT</Button>
          <Button onClick={handleSuspend} variant="contained" color="error" sx={{ fontWeight: 950, borderRadius: 2 }}>
            EXECUTE SUSPENSION
          </Button>
        </DialogActions>
      </Dialog>
    </AdminPageFrame>
  );
}
  );
}
