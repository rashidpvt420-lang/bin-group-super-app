import React, { useState, useEffect } from 'react';
import {
  Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Chip, Grid,
  Typography, alpha, Stack, IconButton, Avatar, Box
} from '@mui/material';
import { 
    Users, Shield, ExternalLink, Mail, Phone, 
    Building2, Layout, Wallet, History
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useLanguage } from '../../../context/LanguageContext';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import LaunchStatusBanner from '../../components/LaunchStatusBanner';
import { useNavigate } from 'react-router-dom';
import { filterLaunchRecords, isOperationalRecord } from '../../utils/launchDataHygiene';

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
        where('role', 'in', ['owner', 'OWNER'])
    );

    const getMillis = (value: any) => {
      if (!value) return 0;
      if (typeof value.toMillis === 'function') return value.toMillis();
      if (typeof value.toDate === 'function') return value.toDate().getTime();
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOwners = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Owner[];
      fetchedOwners.sort((a: any, b: any) => getMillis(b.updatedAt || b.createdAt || b.approvedAt) - getMillis(a.updatedAt || a.createdAt || a.approvedAt));
      setOwners(filterLaunchRecords(fetchedOwners).filter((owner) => isOperationalRecord(owner)));
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

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newOwnerData, setNewOwnerData] = useState({ name: '', email: '', phone: '' });
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');

  const handleAddOwner = async () => {
    if (!newOwnerData.name || (!newOwnerData.email && !newOwnerData.phone)) {
        alert('Name and at least Email or Phone are required.');
        return;
    }
    try {
        const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await addDoc(collection(db, 'ownerInvites'), {
            ownerName: newOwnerData.name,
            ownerEmail: newOwnerData.email,
            ownerPhone: newOwnerData.phone,
            token,
            status: 'PENDING',
            createdAt: serverTimestamp()
        });
        
        const inviteLink = `https://bin-groups.com/owner-invite?token=${token}`;
        setGeneratedInviteLink(inviteLink);
    } catch (error) {
        console.error('Failed to create owner invite:', error);
        alert('Failed to generate invite. Check permissions.');
    }
  };

  return (
    <AdminPageFrame
      title={t('admin.owner_management') || 'OWNER REGISTRY'}
      subtitle="Production owner registry. Test/demo/archived records are hidden."
      loading={loading}
      breadcrumbs={[{ label: 'Owners' }]}
      actions={
        <Button 
            variant="contained" 
            startIcon={<Users size={18} />} 
            onClick={() => { setGeneratedInviteLink(''); setNewOwnerData({ name: '', email: '', phone: '' }); setAddDialogOpen(true); }}
            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
        >
            ADD OWNER
        </Button>
      }
    >
      <LaunchStatusBanner title="Owner Registry is launch-filtered" message="Archived E2E/demo owners are hidden. Add Owner generates an invite only; production contract activation must still pass onboarding approval." />

      <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>
        <Table sx={{ minWidth: 920 }}>
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
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{owner.displayName || (owner as any).fullName || (owner as any).name || 'Owner'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{owner.email}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.gold, display: 'block', fontWeight: 800 }}>{(owner as any).activeContractId ? 'CONTRACT READY' : 'OWNER RECORD'}</Typography>
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
          {owners.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>No production owners yet. Approve owner onboarding or generate a new invite.</TableCell>
              </TableRow>
            )}
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

      {/* Add Owner Dialog */}
      <Dialog 
        open={addDialogOpen} 
        onClose={() => setAddDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` } }}
      >
        <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>INVITE ASSET OWNER</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 3, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
            Generate a secure onboarding link for a new institutional or private property owner.
          </Typography>
          <Stack spacing={2}>
            <TextField
                fullWidth
                label="Owner/Company Name"
                value={newOwnerData.name}
                onChange={(e) => setNewOwnerData({...newOwnerData, name: e.target.value})}
                variant="outlined"
                InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }}
                InputProps={{ style: { color: '#FFF' } }}
                sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}
            />
            <TextField
                fullWidth
                label="Email Address"
                value={newOwnerData.email}
                onChange={(e) => setNewOwnerData({...newOwnerData, email: e.target.value})}
                variant="outlined"
                InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }}
                InputProps={{ style: { color: '#FFF' } }}
                sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}
            />
            <TextField
                fullWidth
                label="Phone/WhatsApp"
                value={newOwnerData.phone}
                onChange={(e) => setNewOwnerData({...newOwnerData, phone: e.target.value})}
                variant="outlined"
                InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }}
                InputProps={{ style: { color: '#FFF' } }}
                sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}
            />
          </Stack>
          
          {generatedInviteLink && (
              <Box sx={{ mt: 3, p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
                  <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1, display: 'block' }}>INVITATION LINK GENERATED:</Typography>
                  <Typography variant="body2" sx={{ color: '#FFF', wordBreak: 'break-all', mb: 2 }}>{generatedInviteLink}</Typography>
                  <Stack direction="row" spacing={1}>
                      <Button 
                          variant="outlined" 
                          size="small"
                          href={`mailto:${newOwnerData.email}?subject=BIN GROUP - Owner Invitation&body=Please use this secure link to access your institutional property portal: ${generatedInviteLink}`}
                          target="_blank"
                          sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}
                      >
                          Email
                      </Button>
                      <Button 
                          variant="outlined" 
                          size="small"
                          href={`https://wa.me/${newOwnerData.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Welcome to BIN GROUP. Access your institutional property portal here: ${generatedInviteLink}`)}`}
                          target="_blank"
                          sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}
                      >
                          WhatsApp
                      </Button>
                  </Stack>
              </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Button onClick={() => setAddDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{generatedInviteLink ? 'CLOSE' : 'CANCEL'}</Button>
          {!generatedInviteLink && (
              <Button onClick={handleAddOwner} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}>
                GENERATE SECURE LINK
              </Button>
          )}
        </DialogActions>
      </Dialog>
    </AdminPageFrame>
  );
}
