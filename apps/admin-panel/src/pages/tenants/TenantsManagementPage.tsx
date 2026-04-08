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
  Grid,
} from '@mui/material';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, where, serverTimestamp, doc, updateDoc, deleteDoc, writeBatch, addDoc } from 'firebase/firestore';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, UploadFile as UploadIcon } from '@mui/icons-material';
import Papa from 'papaparse';
import { useLanguage } from '@bin/shared';

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
  const { t, isRTL } = useLanguage();
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
    propertyId: '',
    unitNumber: '',
    floorNumber: '',
    emirate: '',
    serviceZone: '',
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
      // [V4 INTAKE] Direct Provisioning to Pending Tenants Registry
      await addDoc(collection(db, 'pending_tenants'), {
          ...newTenant,
          tenantName: newTenant.displayName,
          status: 'pending',
          createdAt: serverTimestamp(),
          source: 'ADMIN_MANUAL_INTAKE'
      });
      setOpenAdd(false);
      setNewTenant({ 
          email: '', displayName: '', phoneNumber: '', 
          propertyId: '', unitNumber: '', floorNumber: '', 
          emirate: '', serviceZone: '' 
      });
    } catch (error: any) {
      console.error("🚨 [ADMIN-INTAKE] Provisioning Failure:", error);
      alert("Failed to provision tenant invitation.");
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
          alert(t('admin.import_success', { count: total }));
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
    if (window.confirm(t('admin.delete_confirm'))) {
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
        <Typography variant="h6" className="animate-pulse">{t('onboarding.payment.verifying')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Typography variant="h4" sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
          {t('admin.tenant_registry').split(' ')[0]} <Box component="span" sx={{ color: '#1976d2' }}>{t('admin.tenant_registry').split(' ')[1] || ''}</Box>
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
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
            {t('admin.bulk_upload')}
          </Button>
          <Button 
            variant="contained" 
            startIcon={<AddIcon />} 
            onClick={() => setOpenAdd(true)}
            sx={{ borderRadius: 100, px: 3 }}
          >
            {t('admin.add_tenant')}
          </Button>
        </Box>
      </Box>

      {uploading && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="caption" sx={{ fontWeight: 900, mb: 1, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>
            {t('admin.ingesting_data')}: {uploadProgress}%
          </Typography>
          <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 8, borderRadius: 5 }} />
        </Box>
      )}

      <Paper sx={{ p: 3, mb: 4, borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
        <TextField
          fullWidth
          label={t('admin.search_tenants')}
          placeholder={t('field.name') + ", " + t('login.email') + "..."}
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
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('field.name')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('login.email')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('onboarding.property_details')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('field.floors')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.log.status')}</TableCell>
              <TableCell align={isRTL ? 'left' : 'right'} sx={{ fontWeight: 'bold' }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTenants.map((tenant: any) => (
              <TableRow key={tenant.uid} hover sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
                <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{tenant.displayName || 'N/A'}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{tenant.email}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{tenant.unitId || t('admin.unit_unassigned')}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{tenant.floorNumber || '—'}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Chip 
                    label={(tenant.status || 'active').toUpperCase()} 
                    color={tenant.status === 'inactive' ? 'error' : 'success'} 
                    size="small" 
                    sx={{ fontWeight: 'bold', fontSize: 10 }} 
                  />
                </TableCell>
                <TableCell align={isRTL ? 'left' : 'right'}>
                  <Tooltip title={t('admin.update_profile')}>
                    <IconButton onClick={() => handleEditOpen(tenant)} size="small" color="primary">
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common.action')}>
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
      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} fullWidth maxWidth="sm" dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('admin.register_new')}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField 
              label={t('field.name')} 
              fullWidth 
              value={newTenant.displayName} 
              onChange={(e: any) => setNewTenant({...newTenant, displayName: e.target.value})} 
            />
            <TextField 
              label={t('login.email')} 
              fullWidth 
              value={newTenant.email} 
              onChange={(e: any) => setNewTenant({...newTenant, email: e.target.value})} 
            />
            <TextField 
              label={t('common.phone')} 
              fullWidth 
              value={newTenant.phoneNumber} 
              onChange={(e: any) => setNewTenant({...newTenant, phoneNumber: e.target.value})} 
            />
            <TextField 
              label={t('field.emirate')} 
              fullWidth 
              value={newTenant.emirate} 
              onChange={(e: any) => setNewTenant({...newTenant, emirate: e.target.value})} 
            />
            <TextField 
              label="Service Zone" 
              fullWidth 
              value={newTenant.serviceZone} 
              onChange={(e: any) => setNewTenant({...newTenant, serviceZone: e.target.value})} 
            />
            <Grid container spacing={2}>
                <Grid item xs={6}>
                    <TextField 
                        label="Property ID" 
                        fullWidth 
                        value={newTenant.propertyId} 
                        onChange={(e: any) => setNewTenant({...newTenant, propertyId: e.target.value})} 
                    />
                </Grid>
                <Grid item xs={6}>
                    <TextField 
                        label="Unit Number" 
                        fullWidth 
                        value={newTenant.unitNumber} 
                        onChange={(e: any) => setNewTenant({...newTenant, unitNumber: e.target.value})} 
                    />
                </Grid>
            </Grid>
            <TextField 
                label={t('field.floors')} 
                fullWidth 
                value={newTenant.floorNumber} 
                onChange={(e: any) => setNewTenant({...newTenant, floorNumber: e.target.value})} 
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: isRTL ? 'flex-start' : 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button onClick={() => setOpenAdd(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleAddTenant} disabled={submitting} sx={{ borderRadius: 100 }}>
            {submitting ? t('admin.creating') : t('admin.create_profile')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} fullWidth maxWidth="sm" dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('admin.update_profile')}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField 
              label={t('field.name')} 
              fullWidth 
              value={editTenant.displayName} 
              onChange={(e: any) => setEditTenant({...editTenant, displayName: e.target.value})} 
            />
            <TextField 
              label={t('common.phone')} 
              fullWidth 
              value={editTenant.phoneNumber} 
              onChange={(e: any) => setEditTenant({...editTenant, phoneNumber: e.target.value})} 
            />
            <Grid container spacing={2}>
                <Grid item xs={6}>
                    <TextField 
                        label={t('onboarding.property_details')} 
                        fullWidth 
                        value={editTenant.unitId} 
                        onChange={(e: any) => setEditTenant({...editTenant, unitId: e.target.value})} 
                    />
                </Grid>
                <Grid item xs={6}>
                    <TextField 
                        label={t('field.floors')} 
                        fullWidth 
                        value={editTenant.floorNumber} 
                        onChange={(e: any) => setEditTenant({...editTenant, floorNumber: e.target.value})} 
                    />
                </Grid>
            </Grid>
            <TextField 
              label={t('field.emirate') + " ID"} 
              fullWidth 
              value={editTenant.emiratesID} 
              onChange={(e: any) => setEditTenant({...editTenant, emiratesID: e.target.value})} 
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: isRTL ? 'flex-start' : 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button onClick={() => setOpenEdit(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleUpdateTenant} sx={{ borderRadius: 100 }}>{t('admin.save_changes')}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
