import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, TextField, Typography, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, Grid, Stack,
  FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert, alpha,
  Tooltip, Avatar
} from '@mui/material';
import { db, auth } from '@/lib/firebase';
import { 
    collection, onSnapshot, query, where, serverTimestamp, 
    doc, writeBatch, getDocs, limit, orderBy, startAfter,
    updateDoc, deleteDoc
} from 'firebase/firestore';
import { 
    Plus, Edit3, Search, History, UploadCloud, Send, 
    Trash2, Shield, User, MapPin, Link as LinkIcon,
    AlertTriangle, ExternalLink, Mail, Phone
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import AdminCrudActions from '../../components/AdminCrudActions';
import BulkTenantImportDialog from '../../components/tenants/BulkTenantImportDialog';
import AddTenantDialog from '../../components/tenants/AddTenantDialog';
import { safeText, safeDate, safeNumber } from '../../utils/safeFormatters';

export default function TenantsManagementPage() {
  const { t, lang } = useLanguage();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  
  const [properties, setProperties] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'tenant'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
        setTenants(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
        setLoading(false);
    });

    onSnapshot(collection(db, 'properties'), (snap) => setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(collection(db, 'units'), (snap) => setUnits(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, 'users'), where('role', '==', 'owner')), (snap) => setOwners(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => unsubscribe();
  }, []);

  const handleEdit = (tenant: any) => {
      setSelectedTenant({
          ...tenant,
          displayName: tenant.displayName || '',
          phoneNumber: tenant.phoneNumber || '',
          propertyId: tenant.propertyId || '',
          unitId: tenant.unitId || ''
      });
      setOpenEdit(true);
  };

  const handleUpdate = async () => {
      if (!selectedTenant) return;
      setSubmitting(true);
      try {
          const batch = writeBatch(db);
          
          // 1. Update User Profile
          const userRef = doc(db, 'users', selectedTenant.uid);
          batch.update(userRef, {
              displayName: selectedTenant.displayName,
              phoneNumber: selectedTenant.phoneNumber,
              propertyId: selectedTenant.propertyId,
              unitId: selectedTenant.unitId,
              unitNumber: units.find(u => u.id === selectedTenant.unitId)?.unitNumber || '',
              propertyName: properties.find(p => p.id === selectedTenant.propertyId)?.name || '',
              updatedAt: serverTimestamp()
          });

          // 2. Clear old unit if changed
          const oldTenant = tenants.find(t => t.uid === selectedTenant.uid);
          if (oldTenant?.unitId && oldTenant.unitId !== selectedTenant.unitId) {
              const oldUnitRef = doc(db, 'units', oldTenant.unitId);
              batch.update(oldUnitRef, { tenantId: null, tenantName: null, tenantEmail: null, status: 'vacant' });
          }

          // 3. Link new unit
          if (selectedTenant.unitId) {
              const unitRef = doc(db, 'units', selectedTenant.unitId);
              batch.update(unitRef, { 
                  tenantId: selectedTenant.uid, 
                  tenantName: selectedTenant.displayName,
                  tenantEmail: selectedTenant.email,
                  status: 'occupied' 
              });
          }

          await batch.commit();
          setSuccess("Tenant profile and unit linkage synchronized.");
          setOpenEdit(false);
      } catch (err) {
          console.error(err);
          setError("Synchronization failed.");
      } finally {
          setSubmitting(false);
      }
  };

  const handleDelete = async (id: string) => {
      try {
          await updateDoc(doc(db, 'users', id), { 
              status: 'archived', 
              archivedAt: serverTimestamp() 
          });
          setSuccess("Tenant archived successfully.");
      } catch (err) {
          setError("Archive failed.");
      }
  };

  const handleSendInvite = async (tenant: any) => {
      try {
          // Protocol: Update invite status and mark for email trigger
          await updateDoc(doc(db, 'users', tenant.uid), {
              inviteStatus: 'sent',
              inviteSentAt: serverTimestamp()
          });
          setSuccess(`Invitation sequence initiated for ${tenant.email}`);
      } catch (err) {
          setError("Failed to send invitation.");
      }
  };

  const filteredTenants = tenants.filter(t => 
      t.displayName?.toLowerCase().includes(filter.toLowerCase()) || 
      t.email?.toLowerCase().includes(filter.toLowerCase()) ||
      t.uid?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <AdminPageFrame
      title="Tenant Registry"
      subtitle="Sovereign population management and relational node control"
      loading={loading}
      breadcrumbs={[{ label: 'Tenants' }]}
      actions={
        <Stack direction="row" spacing={2}>
            <Button variant="outlined" startIcon={<UploadCloud size={18} />} onClick={() => setOpenBulk(true)} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900 }}>BULK IMPORT</Button>
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>ADD TENANT</Button>
        </Stack>
      }
    >
      <Paper sx={{ p: 2, mb: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
            <Search size={20} color="rgba(255,255,255,0.3)" />
            <TextField
                fullWidth
                placeholder="Search by UID, Name, Email..."
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
               <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>TENANT / UID</TableCell>
               <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>LOCATION / UNIT</TableCell>
               <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>CONTACT</TableCell>
               <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>METRICS</TableCell>
               <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>STATUS</TableCell>
               <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTenants.map((tenant) => (
              <TableRow key={tenant.uid} hover>
                <TableCell>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }}>
                        {tenant.displayName?.charAt(0) || 'T'}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{tenant.displayName || 'UNNAMED TENANT'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', display: 'block' }}>{tenant.uid || 'MISSING UID'}</Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <MapPin size={12} color={binThemeTokens.gold} />
                    <Typography variant="body2" color="#FFF" fontWeight="700">
                        {tenant.propertyName || properties.find(p => p.id === tenant.propertyId)?.name || 'NO LOCATION'}
                    </Typography>
                  </Box>
                  <Chip 
                    label={tenant.unitNumber ? `UNIT ${tenant.unitNumber}` : 'UNASSIGNED'} 
                    size="small" 
                    variant="outlined" 
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 900, color: tenant.unitNumber ? binThemeTokens.gold : 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.05)' }} 
                  />
                </TableCell>
                <TableCell>
                   <Stack spacing={0.5}>
                     <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'rgba(255,255,255,0.5)' }}>
                        <Mail size={10} /> {tenant.email}
                     </Typography>
                     <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'rgba(255,255,255,0.5)' }}>
                        <Phone size={10} /> {tenant.phoneNumber || 'N/A'}
                     </Typography>
                   </Stack>
                </TableCell>
                 <TableCell>
                     <Stack spacing={0.5}>
                         <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>TICKETS: {safeNumber(tenant.maintenanceTicketCount || 0)}</Typography>
                         <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem' }}>JOINED: {safeDate(tenant.createdAt, lang)}</Typography>
                     </Stack>
                 </TableCell>
                <TableCell>
                  <Stack spacing={1}>
                     <Chip 
                         label={safeText(tenant.status || 'active').toUpperCase()} 
                         size="small" 
                         sx={{ 
                             bgcolor: tenant.status === 'active' ? alpha('#10b981', 0.1) : 'rgba(255,255,255,0.05)',
                             color: tenant.status === 'active' ? '#10b981' : 'rgba(255,255,255,0.4)',
                             fontWeight: 950, fontSize: '0.6rem'
                         }} 
                     />
                     <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.6rem' }}>
                         INVITE: {safeText(tenant.inviteStatus || 'PENDING').toUpperCase()}
                     </Typography>
                  </Stack>
                </TableCell>
                <TableCell align="right">
                    <AdminCrudActions 
                        id={tenant.uid}
                        actions={[
                             { type: 'view', onClick: () => undefined },
                             { type: 'edit', onClick: () => handleEdit(tenant) },
                             { type: 'delete', onClick: (id) => handleDelete(id), requiresConfirm: true, confirmTitle: 'ARCHIVE TENANT', confirmMessage: 'Are you sure you want to archive this tenant? This will vacate their linked unit.' },
                             { type: 'share', label: 'SEND INVITE', onClick: () => handleSendInvite(tenant) }
                        ]}
                    />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit Dialog */}
      <Dialog 
        open={openEdit} 
        onClose={() => setOpenEdit(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
      >
        <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold, py: 3 }}>EDIT TENANT PROFILE</DialogTitle>
        <DialogContent sx={{ py: 3 }}>
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Stack spacing={3}>
                         <TextField label="Full Name" fullWidth value={selectedTenant?.displayName || ''} onChange={(e) => setSelectedTenant({...selectedTenant, displayName: e.target.value})} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
                         <TextField label="Email" fullWidth value={selectedTenant?.email || ''} disabled InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: 'rgba(255,255,255,0.2)' } }} />
                         <TextField label="Phone" fullWidth value={selectedTenant?.phoneNumber || ''} onChange={(e) => setSelectedTenant({...selectedTenant, phoneNumber: e.target.value})} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} />
                     </Stack>
                 </Grid>
                 <Grid item xs={12} md={6}>
                     <Stack spacing={3}>
                         <FormControl fullWidth>
                             <InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Property Link</InputLabel>
                             <Select 
                                 value={selectedTenant?.propertyId || ''} 
                                 label="Property Link" 
                                 sx={{ color: '#FFF' }}
                                 onChange={(e) => setSelectedTenant({...selectedTenant, propertyId: e.target.value, unitId: ''})}
                             >
                                 <MenuItem value=""><em>None</em></MenuItem>
                                 {properties.map(p => <MenuItem key={p.id} value={p.id}>{p.name || p.propertyName}</MenuItem>)}
                             </Select>
                         </FormControl>
                         <FormControl fullWidth>
                             <InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Unit Link</InputLabel>
                             <Select 
                                 value={selectedTenant?.unitId || ''} 
                                 label="Unit Link" 
                                 sx={{ color: '#FFF' }}
                                 onChange={(e) => setSelectedTenant({...selectedTenant, unitId: e.target.value})}
                             >
                                 <MenuItem value=""><em>None</em></MenuItem>
                                 {units.filter(u => u.propertyId === selectedTenant?.propertyId).map(u => <MenuItem key={u.id} value={u.id}>{u.unitNumber}</MenuItem>)}
                             </Select>
                         </FormControl>
                    </Stack>
                </Grid>
            </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
             <Button onClick={() => setOpenEdit(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
             <Button 
                variant="contained" 
                onClick={handleUpdate}
                disabled={submitting}
                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
             >
                 {submitting ? <CircularProgress size={20} color="inherit" /> : 'SAVE REVISIONS'}
             </Button>
         </DialogActions>
       </Dialog>

       <AddTenantDialog 
            open={openAdd} 
            onClose={() => setOpenAdd(false)} 
            properties={properties}
            units={units}
            onSuccess={(msg) => setSuccess(msg)}
       />

       <BulkTenantImportDialog
            open={openBulk}
            onClose={() => setOpenBulk(false)}
            properties={properties}
            onImportComplete={() => setSuccess('Bulk tenant import completed.')}
       />
    </AdminPageFrame>
  );
}
