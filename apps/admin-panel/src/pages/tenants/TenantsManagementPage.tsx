// admin-panel/src/pages/tenants/TenantsManagementPage.tsx
import React, { useState, useEffect } from 'react';
import { useLanguage } from '@bin/shared';
import {
  Box, Container, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, TextField, Typography, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, Grid, Stack,
  FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert
} from '@mui/material';
import { db, auth, functions } from '../../lib/firebase';
import { collection, onSnapshot, query, where, serverTimestamp, doc, writeBatch, getDocs, limit, orderBy, startAfter } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Add as AddIcon, Edit as EditIcon, Search as SearchIcon, History as HistoryIcon, CloudUpload as BulkIcon, Send as SendIcon, Delete as DeleteIcon } from '@mui/icons-material';
import BulkTenantImportDialog from '../../components/tenants/BulkTenantImportDialog';

interface Unit {
    id: string;
    unitNumber: string;
    floorNumber?: string | number;
    occupancyStatus?: string;
    currentTenantId?: string | null;
    propertyId: string;
}

export default function TenantsManagementPage() {
  const { t, isRTL } = useLanguage();
  const [tenants, setTenants] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [editForm, setEditForm] = useState({
      displayName: '',
      phoneNumber: '',
      status: '',
      propertyId: '',
      unitId: '',
      notes: '',
      emiratesID: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Current admin status
  const [currentAdminUid, setCurrentAdminUid] = useState<string | null>(null);
  
  const [view, setView] = useState<'registry' | 'history'>('registry');
  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [openBulk, setOpenBulk] = useState(false);
  
  // Strict Relationship Data
  const [owners, setOwners] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  // Selected Context for Intake
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [tenantMode, setTenantMode] = useState<'existing' | 'new'>('new');
  const [selectedExistingTenantId, setSelectedExistingTenantId] = useState('');
  const [existingTenantSearch, setExistingTenantSearch] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<any>(null);

  const [newTenant, setNewTenant] = useState({
    email: '',
    displayName: '',
    phoneNumber: '',
    emiratesID: '',
  });

  const PAGE_SIZE = 20;

  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    const fetchInitialData = async () => {
        // Load Lookups
        onSnapshot(query(collection(db, 'users'), where('role', 'in', ['owner', 'OWNER'])), (snap) => {
            setOwners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        onSnapshot(query(collection(db, 'properties')), (snap) => {
            setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        
        // Initial Tenants
        const q = query(collection(db, 'users'), where('role', '==', 'tenant'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        const snap = await getDocs(q);
        setTenants(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
        if (snap.docs.length < PAGE_SIZE) setHasMore(false);
        setLastDoc(snap.docs[snap.docs.length - 1]);
    };
    fetchInitialData();

    // Check admin status
    const checkAdminStatus = async () => {
        const user = auth.currentUser;
        if (user) {
            setCurrentAdminUid(user.uid);
        }
    };
    checkAdminStatus();
    fetchImportHistory();
  }, []);

  const fetchImportHistory = async () => {
      const q = query(collection(db, 'tenant_import_batches'), orderBy('createdAt', 'desc'), limit(10));
      const snap = await getDocs(q);
      setImportHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const loadMoreTenants = async () => {
      if (!lastDoc || !hasMore) return;
      const q = query(collection(db, 'users'), where('role', '==', 'tenant'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const newTenants = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      setTenants(prev => [...prev, ...newTenants]);
      setLastDoc(snap.docs[snap.docs.length - 1]);
      if (snap.docs.length < PAGE_SIZE) setHasMore(false);
  };

  const fetchUnitsForProperty = async (propId: string) => {
      const q = query(collection(db, 'units'), where('propertyId', '==', propId));
      const snap = await getDocs(q);
      setUnits(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
  };

  useEffect(() => {
      if (selectedPropertyId) {
          fetchUnitsForProperty(selectedPropertyId);
      }
  }, [selectedPropertyId]);

  const handleSearchExisting = async () => {
    if (!existingTenantSearch.includes('@')) return;
    setSearchLoading(true);
    try {
        const q = query(collection(db, 'users'), where('email', '==', existingTenantSearch.toLowerCase().trim()));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const found = { uid: snap.docs[0].id, ...snap.docs[0].data() };
            setTenants(prev => {
                if (prev.find(t => t.uid === found.uid)) return prev;
                return [found, ...prev];
            });
            setSelectedExistingTenantId(found.uid);
            alert("Sovereign Match Found: User identified in registry.");
        } else {
            alert("No user found with this email. Please use 'New Tenant' mode.");
        }
    } catch (err) {
        console.error(err);
    } finally {
        setSearchLoading(false);
    }
  };

  const handleAddTenant = async () => {
    const usingExistingTenant = tenantMode === 'existing';
    if (!selectedOwnerId || !selectedPropertyId || !selectedUnitId || (!usingExistingTenant && (!newTenant.email || !newTenant.displayName)) || (usingExistingTenant && !selectedExistingTenantId)) {
        alert("Owner, Property, Unit, and tenant identity are required.");
        return;
    }

    setSubmitting(true);
    try {
      const unitData = units.find(u => u.id === selectedUnitId);
      const propertyData = properties.find(p => p.id === selectedPropertyId);
      const existingTenant = tenants.find(t => t.uid === selectedExistingTenantId);

      if (!unitData || unitData.propertyId !== selectedPropertyId) {
        alert("Linkage broken: Select a unit that belongs to the chosen property.");
        setSubmitting(false);
        return;
      }

      if (unitData.occupancyStatus === 'OCCUPIED') {
        alert("Occupancy Alert: This unit is already occupied.");
        setSubmitting(false);
        return;
      }
      
      const batch = writeBatch(db);
      const tenantRef = usingExistingTenant ? doc(db, 'users', selectedExistingTenantId) : doc(collection(db, 'users'));
      const tenantId = tenantRef.id;
      
      batch.set(tenantRef, {
        uid: tenantId,
        role: 'tenant',
        status: 'active',
        displayName: usingExistingTenant ? existingTenant?.displayName : newTenant.displayName,
        email: (usingExistingTenant ? existingTenant?.email : newTenant.email).toLowerCase(),
        phoneNumber: usingExistingTenant ? existingTenant?.phoneNumber : newTenant.phoneNumber,
        emiratesID: usingExistingTenant ? (existingTenant?.emiratesID || existingTenant?.emiratesId) : newTenant.emiratesID,
        ownerId: selectedOwnerId,
        propertyId: selectedPropertyId,
        unitId: selectedUnitId,
        unitNumber: unitData?.unitNumber || '',
        propertyName: propertyData?.name || propertyData?.propertyName || 'Assigned Property',
        updatedAt: serverTimestamp(),
        createdAt: usingExistingTenant ? (existingTenant?.createdAt || serverTimestamp()) : serverTimestamp(),
      }, { merge: true });

      batch.update(doc(db, 'units', selectedUnitId), {
          tenantId,
          occupancyStatus: 'OCCUPIED',
          currentTenantId: tenantId,
          updatedAt: serverTimestamp()
      });

      const tenancyRef = doc(collection(db, 'tenancies'));
      batch.set(tenancyRef, {
          tenantId,
          ownerId: selectedOwnerId,
          propertyId: selectedPropertyId,
          unitId: selectedUnitId,
          status: 'ACTIVE',
          startDate: serverTimestamp(),
          createdAt: serverTimestamp()
      });

      await batch.commit();
      setOpenAdd(false);
      alert("Relational Link Secured: Tenant assigned to Unit.");
    } catch (err: any) {
        alert("Fault: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (tenant: any) => {
      setSelectedTenant(tenant);
      setEditForm({
          displayName: tenant.displayName || '',
          phoneNumber: tenant.phoneNumber || '',
          status: tenant.status || 'active',
          propertyId: tenant.propertyId || '',
          unitId: tenant.unitId || '',
          notes: tenant.notes || '',
          emiratesID: tenant.emiratesID || tenant.emiratesId || ''
      });
      setSelectedPropertyId(tenant.propertyId || '');
      setSelectedUnitId(tenant.unitId || '');
      setOpenEdit(true);
      setError(null);
  };

  const handleUpdateTenant = async () => {
      if (!selectedTenant || !currentAdminUid) return;
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      
      try {
          const batch = writeBatch(db);
          const tenantRef = doc(db, 'users', selectedTenant.uid);
          
          const updates: any = {
              displayName: editForm.displayName,
              phoneNumber: editForm.phoneNumber,
              status: editForm.status,
              propertyId: selectedPropertyId,
              unitId: selectedUnitId,
              notes: editForm.notes,
              emiratesID: editForm.emiratesID,
              updatedAt: serverTimestamp(),
              updatedBy: currentAdminUid
          };

          // Handle Unit Reassignment logic
          if (selectedUnitId !== selectedTenant.unitId) {
              // 1. Clear old unit if exists
              if (selectedTenant.unitId) {
                  batch.update(doc(db, 'units', selectedTenant.unitId), {
                      tenantId: null,
                      currentTenantId: null,
                      occupancyStatus: 'VACANT',
                      updatedAt: serverTimestamp(),
                      updatedBy: currentAdminUid
                  });
              }
              // 2. Occupy new unit
              if (selectedUnitId) {
                  const newUnit = units.find(u => u.id === selectedUnitId);
                  batch.update(doc(db, 'units', selectedUnitId), {
                      tenantId: selectedTenant.uid,
                      currentTenantId: selectedTenant.uid,
                      tenantName: editForm.displayName,
                      occupancyStatus: 'OCCUPIED',
                      updatedAt: serverTimestamp(),
                      updatedBy: currentAdminUid
                  });
                  updates.unitNumber = newUnit?.unitNumber || '';
                  const prop = properties.find(p => p.id === selectedPropertyId);
                  updates.propertyName = prop?.name || prop?.propertyName || 'Assigned Property';
              } else {
                  updates.unitNumber = '';
                  updates.propertyName = '';
              }
          }

          batch.update(tenantRef, updates);
          await batch.commit();
          
          setOpenEdit(false);
          setSuccess(t('admin.tenants_mgmt.updated_success'));
          // Local update
          setTenants(prev => prev.map(t => t.uid === selectedTenant.uid ? { ...t, ...updates } : t));
      } catch (err: any) {
          console.error("Firebase Update Error:", err);
          setError(`${err.code || 'error'}: ${err.message}`);
      } finally {
          setSubmitting(false);
      }
  };

  const handleSendInvitations = async (batchId?: string) => {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      try {
          const sendFn = httpsCallable(functions, 'sendTenantInvitations');
          const result = await sendFn({ importBatchId: batchId });
          const data = result.data as any;
          setSuccess(t('admin.tenants_mgmt.invitation_triggered').replace('{sent}', String(data.sentCount)).replace('{skipped}', String(data.skippedCount)));
          fetchImportHistory();
      } catch (err: any) {
          setError(err.message || t('admin.tenants_mgmt.trigger_failed'));
      } finally {
          setSubmitting(false);
      }
  };

  const handleResendFailedInvitations = async (batchId: string) => {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      try {
          // We can use the same function, it already skips non-pending/non-failed
          const sendFn = httpsCallable(functions, 'sendTenantInvitations');
          const result = await sendFn({ importBatchId: batchId });
          const data = result.data as any;
          setSuccess(t('admin.tenants_mgmt.resend_triggered').replace('{sent}', String(data.sentCount)));
          fetchImportHistory();
      } catch (err: any) {
          setError(err.message || t('admin.tenants_mgmt.resend_failed'));
      } finally {
          setSubmitting(false);
      }
  };

  const handleResendInvitation = async (invitationId: string) => {
      if (!invitationId) {
          alert("No invitation record found for this tenant.");
          return;
      }
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      try {
          const resendFn = httpsCallable(functions, 'resendTenantInvitation');
          await resendFn({ invitationId });
          setSuccess(t('admin.tenants_mgmt.invitation_resent'));
      } catch (err: any) {
          setError(err.message || t('admin.tenants_mgmt.resend_invite_failed'));
      } finally {
          setSubmitting(false);
      }
  };

  const handleArchiveTenant = async (tenant: any) => {
      if (!currentAdminUid) return;
      if (!window.confirm("Archive this tenant? They will no longer be able to log in to the tenant portal.")) return;
      
      setSubmitting(true);
      try {
          const tenantRef = doc(db, 'users', tenant.uid);
          const updates = {
              status: 'archived',
              archivedAt: serverTimestamp(),
              archivedBy: currentAdminUid,
              updatedAt: serverTimestamp(),
              updatedBy: currentAdminUid
          };
          
          const batch = writeBatch(db);
          batch.update(tenantRef, updates);
          
          // If they have an active unit, we might want to vacate it
          if (tenant.unitId) {
              batch.update(doc(db, 'units', tenant.unitId), {
                  tenantId: null,
                  currentTenantId: null,
                  occupancyStatus: 'VACANT',
                  updatedAt: serverTimestamp(),
                  updatedBy: currentAdminUid
              });
          }

          await batch.commit();
          setSuccess(t('admin.tenants_mgmt.archived_success'));
          setTenants(prev => prev.map(t => t.uid === tenant.uid ? { ...t, ...updates } : t));
      } catch (err: any) {
          console.error("Archive Error:", err);
          alert(`${err.code || 'error'}: ${err.message}`);
      } finally {
          setSubmitting(false);
      }
  };

  const handleDeleteTenant = async () => {
      if (!tenantToDelete || !currentAdminUid) return;

      setSubmitting(true);
      setError(null);
      try {
          const batch = writeBatch(db);
          const tenantId = tenantToDelete.uid;
          const tenantEmail = tenantToDelete.email;
          const prevPropertyId = tenantToDelete.propertyId;
          const prevUnitId = tenantToDelete.unitId;

          // 1. Soft delete the user record
          const tenantRef = doc(db, 'users', tenantId);
          batch.update(tenantRef, {
              role: "tenant_deleted",
              previousRole: "tenant",
              status: "deleted",
              deletedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              propertyId: null,
              unitId: null,
              unitNumber: null,
              ownerId: null,
              updatedBy: currentAdminUid
          });

          // 2. Vacate the unit if linked
          if (prevUnitId) {
              const unitRef = doc(db, 'units', prevUnitId);
              batch.update(unitRef, {
                  tenantId: null,
                  currentTenantId: null,
                  occupancyStatus: "VACANT",
                  updatedAt: serverTimestamp(),
                  updatedBy: currentAdminUid
              });
          }

          // 3. Create Audit Log
          const logRef = doc(collection(db, 'audit_logs'));
          batch.set(logRef, {
              action: "TENANT_SOFT_DELETE",
              actorId: currentAdminUid,
              tenantId,
              tenantEmail,
              previousPropertyId: prevPropertyId || null,
              previousUnitId: prevUnitId || null,
              timestamp: serverTimestamp(),
              source: "ADMIN_TENANT_REGISTRY",
              details: { 
                  displayName: tenantToDelete.displayName,
                  deletedBy: currentAdminUid 
              }
          });

          await batch.commit();
          
          setSuccess(t('admin.tenants_mgmt.removed_success').replace('{email}', tenantEmail));
          setTenants(prev => prev.filter(t => t.uid !== tenantId));
          setOpenDeleteConfirm(false);
          setTenantToDelete(null);
      } catch (err: any) {
          console.error("Soft Delete Error:", err);
          setError(t('admin.tenants_mgmt.remove_failed').replace('{message}', err.message));
      } finally {
          setSubmitting(false);
      }
  };

  const confirmDelete = (tenant: any) => {
      setTenantToDelete(tenant);
      setOpenDeleteConfirm(true);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" fontWeight="950">{t('admin.tenants_mgmt.page_title')}</Typography>
        <Stack direction="row" spacing={2}>
            <Button
                variant="outlined"
                startIcon={<HistoryIcon />}
                onClick={() => setView(view === 'registry' ? 'history' : 'registry')}
                sx={{ borderRadius: 100, fontWeight: 900, borderColor: '#000', color: '#000' }}
            >
                {view === 'registry' ? t('admin.tenants_mgmt.import_history_btn') : t('admin.tenants_mgmt.back_to_registry_btn')}
            </Button>
            <Button
                variant="outlined"
                startIcon={<BulkIcon />}
                onClick={() => setOpenBulk(true)}
                sx={{ borderRadius: 100, fontWeight: 900, borderColor: '#000', color: '#000' }}
            >
                {t('admin.tenants_mgmt.bulk_import_btn')}
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setSelectedOwnerId(''); setSelectedPropertyId(''); setSelectedUnitId(''); setOpenAdd(true); }} sx={{ borderRadius: 100, bgcolor: '#000', fontWeight: 900 }}>
              {t('admin.tenants_mgmt.assign_tenant_btn')}
            </Button>
        </Stack>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {view === 'registry' ? (
          <>
            <TableContainer component={Paper} sx={{ borderRadius: 4, overflow: 'hidden' }}>
              <Table>
                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_tenant')}</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_property_unit')}</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_invitation')}</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_status')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.uid} hover>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight="800">{tenant.displayName}</Typography>
                        <Typography variant="caption" color="text.secondary">{tenant.uid}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="700">{tenant.propertyName || t('admin.tenants_mgmt.unlinked_label')}</Typography>
                        <Typography variant="caption">{t('admin.tenants_mgmt.unit_label')} {tenant.unitNumber || 'N/A'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{tenant.email}</Typography>
                        <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip 
                                label={tenant.emailStatus?.toUpperCase() || tenant.invitationStatus?.toUpperCase() || 'NOT SENT'} 
                                size="small" 
                                color={tenant.emailStatus === 'sent' || tenant.invitationStatus === 'accepted' ? 'success' : (tenant.emailStatus === 'failed' ? 'error' : 'default')}
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.6rem', fontWeight: 900 }} 
                            />
                            {tenant.deliveryError && (
                                <Typography variant="caption" color="error" sx={{ fontSize: '0.6rem', display: 'block' }}>
                                    {tenant.deliveryError.substring(0, 20)}...
                                </Typography>
                            )}
                            {tenant.invitationStatus !== 'accepted' && (
                                <IconButton size="small" onClick={() => handleResendInvitation(tenant.tenantInvitationId)} title="Resend Invite">
                                    <SendIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                            )}
                        </Box>
                      </TableCell>
                      <TableCell><Chip label={tenant.status?.toUpperCase()} size="small" color={tenant.status === 'active' ? 'success' : 'default'} sx={{ fontWeight: 900, fontSize: '0.65rem' }} /></TableCell>
                      <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <IconButton size="small" onClick={() => handleOpenEdit(tenant)}><EditIcon fontSize="small" /></IconButton>
                              <IconButton size="small" color="error" onClick={() => confirmDelete(tenant)}><DeleteIcon fontSize="small" /></IconButton>
                              <Button size="small" variant="text" color="warning" onClick={() => handleArchiveTenant(tenant)} sx={{ fontWeight: 800, fontSize: '0.7rem' }}>{t('admin.tenants_mgmt.archive_btn')}</Button>
                          </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {hasMore && (
              <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
                <Button onClick={loadMoreTenants} sx={{ fontWeight: 900, color: '#000' }}>{t('admin.tenants_mgmt.load_more_btn')}</Button>
              </Box>
            )}
          </>
      ) : (
          <TableContainer component={Paper} sx={{ borderRadius: 4, overflow: 'hidden' }}>
            <Table>
                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_batch_id')}</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_property')}</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_date')}</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_records')}</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_invitations')}</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_status')}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900 }}>{t('admin.tenants_mgmt.col_actions')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {importHistory.map((batch) => (
                        <TableRow key={batch.id} hover>
                            <TableCell><Typography variant="caption" sx={{ fontWeight: 800 }}>{batch.importBatchId || batch.id}</Typography></TableCell>
                            <TableCell><Typography variant="body2" sx={{ fontWeight: 700 }}>{batch.propertyName}</Typography></TableCell>
                            <TableCell>{batch.createdAt?.toDate ? batch.createdAt.toDate().toLocaleDateString() : 'N/A'}</TableCell>
                            <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 800 }}>{batch.validRows} / {batch.totalRows}</Typography>
                                <Typography variant="caption" color="error">{t('admin.tenants_mgmt.errors_label').replace('{count}', String(batch.errorRows))}</Typography>
                            </TableCell>
                            <TableCell>
                                <Stack spacing={0.5}>
                                    <Chip label={t('admin.tenants_mgmt.sent_chip').replace('{count}', String(batch.sentCount || 0))} size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                                    <Chip label={t('admin.tenants_mgmt.failed_chip').replace('{count}', String(batch.failedCount || 0))} size="small" color="error" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                                    <Chip label={t('admin.tenants_mgmt.pending_chip').replace('{count}', String(batch.pendingCount || 0))} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                                </Stack>
                            </TableCell>
                             <TableCell><Chip label={batch.status?.toUpperCase()} size="small" color="primary" sx={{ fontWeight: 900, fontSize: '0.65rem' }} /></TableCell>
                             <TableCell align="right">
                                 <Stack direction="row" spacing={1} justifyContent="flex-end">
                                    <Button
                                        size="small"
                                        startIcon={<SendIcon />}
                                        disabled={submitting || (batch.sentCount > 0 && batch.failedCount === 0)}
                                        onClick={() => handleSendInvitations(batch.importBatchId)}
                                        sx={{ fontWeight: 800, fontSize: '0.7rem' }}
                                    >
                                        {t('admin.tenants_mgmt.send_btn')}
                                    </Button>
                                    {batch.failedCount > 0 && (
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="error"
                                            disabled={submitting}
                                            onClick={() => handleResendFailedInvitations(batch.importBatchId)}
                                            sx={{ fontWeight: 800, fontSize: '0.7rem' }}
                                        >
                                            {t('admin.tenants_mgmt.retry_failed_btn')}
                                        </Button>
                                    )}
                                 </Stack>
                             </TableCell>
                        </TableRow>
                    ))}
                    {importHistory.length === 0 && (
                        <TableRow><TableCell colSpan={7} align="center"><Typography sx={{ py: 4, color: 'text.secondary' }}>{t('admin.tenants_mgmt.no_import_history')}</Typography></TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
          </TableContainer>
      )}

      <BulkTenantImportDialog 
        open={openBulk} 
        onClose={() => setOpenBulk(false)} 
        properties={properties} 
        onImportComplete={fetchImportHistory} 
      />

      {/* ASSIGNMENT DIALOG */}
      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 950 }}>{t('admin.tenants_mgmt.assign_dialog_title')}</DialogTitle>
        <DialogContent dividers>
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>{t('admin.tenants_mgmt.target_owner_label')}</InputLabel>
                        <Select value={selectedOwnerId} onChange={(e) => setSelectedOwnerId(e.target.value)} label={t('admin.tenants_mgmt.target_owner_label')}>
                            {owners.map(o => <MenuItem key={o.id} value={o.id}>{o.displayName || o.name || o.email}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth sx={{ mb: 2 }} disabled={!selectedOwnerId}>
                        <InputLabel>{t('admin.tenants_mgmt.target_property_label')}</InputLabel>
                        <Select value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} label={t('admin.tenants_mgmt.target_property_label')}>
                            {properties.filter(p => p.ownerId === selectedOwnerId).map(p => <MenuItem key={p.id} value={p.id}>{p.name || p.propertyName || p.address}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth sx={{ mb: 2 }} disabled={!selectedPropertyId}>
                        <InputLabel>{t('admin.tenants_mgmt.target_unit_label')}</InputLabel>
                        <Select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} label={t('admin.tenants_mgmt.target_unit_label')}>
                            {units.filter(u => u.propertyId === selectedPropertyId).map(u => (
                                <MenuItem key={u.id} value={u.id} disabled={u.occupancyStatus === 'OCCUPIED'}>
                                    {u.unitNumber} {u.occupancyStatus === 'OCCUPIED' ? t('admin.tenants_mgmt.occupied_label') : t('admin.tenants_mgmt.vacant_label')}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Box sx={{ mb: 2, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                        <Typography variant="overline" fontWeight="900">{t('admin.tenants_mgmt.tenant_identity_mode')}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <Button size="small" variant={tenantMode === 'new' ? 'contained' : 'outlined'} onClick={() => setTenantMode('new')}>{t('admin.tenants_mgmt.new_tenant_btn')}</Button>
                            <Button size="small" variant={tenantMode === 'existing' ? 'contained' : 'outlined'} onClick={() => setTenantMode('existing')}>{t('admin.tenants_mgmt.existing_user_btn')}</Button>
                        </Stack>
                    </Box>

                    {tenantMode === 'new' ? (
                        <Stack spacing={2}>
                            <TextField label={t('admin.tenants_mgmt.field_full_name')} fullWidth value={newTenant.displayName} onChange={(e) => setNewTenant({...newTenant, displayName: e.target.value})} />
                            <TextField label={t('admin.tenants_mgmt.field_email')} fullWidth value={newTenant.email} onChange={(e) => setNewTenant({...newTenant, email: e.target.value})} />
                            <TextField label={t('admin.tenants_mgmt.field_phone')} fullWidth value={newTenant.phoneNumber} onChange={(e) => setNewTenant({...newTenant, phoneNumber: e.target.value})} />
                            <TextField label={t('admin.tenants_mgmt.field_emirates_id')} fullWidth value={newTenant.emiratesID} onChange={(e) => setNewTenant({...newTenant, emiratesID: e.target.value})} />
                        </Stack>
                    ) : (
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <TextField label={t('admin.tenants_mgmt.search_email_label')} fullWidth size="small" value={existingTenantSearch} onChange={(e) => setExistingTenantSearch(e.target.value)} />
                                <IconButton onClick={handleSearchExisting} disabled={searchLoading} color="primary"><SearchIcon /></IconButton>
                            </Box>
                            <FormControl fullWidth>
                                <InputLabel>{t('admin.tenants_mgmt.select_linked_tenant')}</InputLabel>
                                <Select value={selectedExistingTenantId} onChange={(e) => setSelectedExistingTenantId(e.target.value)} label={t('admin.tenants_mgmt.select_linked_tenant')}>
                                    {tenants.map(t => <MenuItem key={t.uid} value={t.uid}>{t.displayName} ({t.email})</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Stack>
                    )}
                </Grid>
            </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenAdd(false)} sx={{ fontWeight: 800 }}>{t('admin.tenants_mgmt.cancel_btn')}</Button>
          <Button variant="contained" color="primary" onClick={handleAddTenant} disabled={submitting || (tenantMode === 'new' && !newTenant.email) || (tenantMode === 'existing' && !selectedExistingTenantId)} sx={{ borderRadius: 100, fontWeight: 900 }}>
            {submitting ? <CircularProgress size={20} color="inherit" /> : t('admin.tenants_mgmt.secure_link_btn')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* EDIT TENANT DIALOG */}
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 950 }}>{t('admin.tenants_mgmt.edit_dialog_title')}</DialogTitle>
        <DialogContent dividers>
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Stack spacing={2}>
                        <TextField
                            label={t('admin.tenants_mgmt.field_display_name')}
                            fullWidth
                            value={editForm.displayName}
                            onChange={(e) => setEditForm({...editForm, displayName: e.target.value})}
                        />
                        <TextField
                            label={t('admin.tenants_mgmt.field_phone_number')}
                            fullWidth
                            value={editForm.phoneNumber}
                            onChange={(e) => setEditForm({...editForm, phoneNumber: e.target.value})}
                        />
                        <TextField
                            label={t('admin.tenants_mgmt.field_emirates_id')}
                            fullWidth
                            value={editForm.emiratesID}
                            onChange={(e) => setEditForm({...editForm, emiratesID: e.target.value})}
                        />
                        <FormControl fullWidth>
                            <InputLabel>{t('admin.tenants_mgmt.field_account_status')}</InputLabel>
                            <Select
                                value={editForm.status}
                                onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                                label={t('admin.tenants_mgmt.field_account_status')}
                            >
                                <MenuItem value="active">{t('admin.tenants_mgmt.status_active')}</MenuItem>
                                <MenuItem value="inactive">{t('admin.tenants_mgmt.status_inactive')}</MenuItem>
                                <MenuItem value="pending">{t('admin.tenants_mgmt.status_pending')}</MenuItem>
                                <MenuItem value="archived">{t('admin.tenants_mgmt.status_archived')}</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField
                            label={t('admin.tenants_mgmt.field_internal_notes')}
                            fullWidth
                            multiline
                            rows={3}
                            value={editForm.notes}
                            onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                        />
                    </Stack>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" fontWeight="900" gutterBottom>{t('admin.tenants_mgmt.assignment_linkage_title')}</Typography>
                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>{t('admin.tenants_mgmt.property_label')}</InputLabel>
                        <Select
                            value={selectedPropertyId}
                            onChange={(e) => setSelectedPropertyId(e.target.value)}
                            label={t('admin.tenants_mgmt.property_label')}
                        >
                            <MenuItem value=""><em>{t('admin.tenants_mgmt.none_option')}</em></MenuItem>
                            {properties.map(p => (
                                <MenuItem key={p.id} value={p.id}>{p.name || p.propertyName}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth disabled={!selectedPropertyId}>
                        <InputLabel>{t('admin.tenants_mgmt.unit_select_label')}</InputLabel>
                        <Select
                            value={selectedUnitId}
                            onChange={(e) => setSelectedUnitId(e.target.value)}
                            label={t('admin.tenants_mgmt.unit_select_label')}
                        >
                            <MenuItem value=""><em>{t('admin.tenants_mgmt.none_option')}</em></MenuItem>
                            {units.filter(u => u.propertyId === selectedPropertyId).map(u => (
                                <MenuItem key={u.id} value={u.id} disabled={u.occupancyStatus === 'OCCUPIED' && u.id !== selectedTenant?.unitId}>
                                    {u.unitNumber} {u.occupancyStatus === 'OCCUPIED' ? (u.id === selectedTenant?.unitId ? t('admin.tenants_mgmt.current_label') : t('admin.tenants_mgmt.occupied_label')) : t('admin.tenants_mgmt.vacant_label')}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Box sx={{ mt: 3, p: 2, bgcolor: '#f1f5f9', borderRadius: 2 }}>
                        <Typography variant="caption" fontWeight="800" color="text.secondary">{t('admin.tenants_mgmt.readonly_security_title')}</Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}><strong>{t('admin.tenants_mgmt.email_label')}</strong> {selectedTenant?.email}</Typography>
                        <Typography variant="body2"><strong>{t('admin.tenants_mgmt.uid_label')}</strong> {selectedTenant?.uid}</Typography>
                    </Box>
                </Grid>
            </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenEdit(false)} sx={{ fontWeight: 800 }}>{t('admin.tenants_mgmt.cancel_btn')}</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleUpdateTenant}
            disabled={submitting}
            sx={{ borderRadius: 100, fontWeight: 900 }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : t('admin.tenants_mgmt.save_changes_btn')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={openDeleteConfirm} onClose={() => !submitting && setOpenDeleteConfirm(false)}>
        <DialogTitle sx={{ fontWeight: 950, color: 'error.main' }}>{t('admin.tenants_mgmt.delete_dialog_title')}</DialogTitle>
        <DialogContent>
            <Typography variant="body1">
                {t('admin.tenants_mgmt.delete_confirm_msg').replace('{name}', tenantToDelete?.displayName || '').replace('{email}', tenantToDelete?.email || '')}
            </Typography>
            <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary', bgcolor: '#fff5f5', p: 2, borderRadius: 1, border: '1px solid #fed7d7' }}>
                {t('admin.tenants_mgmt.delete_detail_msg').replace('{unit}', tenantToDelete?.unitNumber || '')}
            </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
            <Button onClick={() => setOpenDeleteConfirm(false)} disabled={submitting} sx={{ fontWeight: 800 }}>{t('admin.tenants_mgmt.cancel_btn')}</Button>
            <Button
                variant="contained"
                color="error"
                onClick={handleDeleteTenant}
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <DeleteIcon />}
                sx={{ borderRadius: 100, fontWeight: 900 }}
            >
                {submitting ? t('admin.tenants_mgmt.removing_btn') : t('admin.tenants_mgmt.confirm_removal_btn')}
            </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
