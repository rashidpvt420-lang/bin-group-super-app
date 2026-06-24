// admin-panel/src/pages/owners/OwnerManagementPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Grid,
  Typography,
  Box,
  Stack,
  Divider,
} from '@mui/material';
import { apiClient } from '../../services/api';
import { db, collection, getDocs, doc, updateDoc, onSnapshot, query, addDoc, serverTimestamp } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { useAuth } from '../../context/AuthContext';

interface Owner {
  ownerId: string;
  name: string;
  email: string;
  totalBuildings: number;
  totalUnits: number;
  monthlyRentCollected: number;
  unpaidInvoiceCount: number;
  suspensionStatus: 'ACTIVE' | 'SUSPENDED';
  joinedDate: string;
}

export default function OwnerManagementPage() {
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');

  // Property approval state
  const [properties, setProperties] = useState<any[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [rejectProperty, setRejectProperty] = useState<any | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchOwners();

    const qProps = query(collection(db, 'properties'));
    const unsubscribeProps = onSnapshot(qProps, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProperties(list);
      setLoadingProps(false);
    }, (err) => {
      console.error("Failed to fetch properties:", err);
      setLoadingProps(false);
    });

    return () => {
      unsubscribeProps();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOwners = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'owners'));
      const ownersList = snap.docs.map(doc => {
        const data = doc.data();
        return {
          ownerId: doc.id,
          name: data.name || data.displayName || data.fullName || 'Owner',
          email: data.email || '',
          totalBuildings: data.totalBuildings || 0,
          totalUnits: data.totalUnits || 0,
          monthlyRentCollected: data.monthlyRentCollected || 0,
          unpaidInvoiceCount: data.unpaidInvoiceCount || 0,
          suspensionStatus: data.suspensionStatus || 'ACTIVE',
          joinedDate: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || ''),
        };
      }) as Owner[];
      setOwners(ownersList);
    } catch (error) {
      console.error('Failed to fetch owners:', error);
      alert(t('admin.load_owners_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!selectedOwner) return;

    try {
      const ownerRef = doc(db, 'owners', selectedOwner.ownerId);
      await updateDoc(ownerRef, {
        suspensionStatus: 'SUSPENDED',
        suspensionReason,
        status: 'SUSPENDED'
      });
      // also update user document in users collection if exists
      const userRef = doc(db, 'users', selectedOwner.ownerId);
      await updateDoc(userRef, {
        suspensionStatus: 'SUSPENDED',
        suspensionReason,
        status: 'SUSPENDED'
      }).catch(e => console.warn('User document update failed:', e));

      alert(t('admin.owner_suspended', { name: selectedOwner.name }));
      setSuspendDialogOpen(false);
      fetchOwners();
    } catch (error) {
      console.error('Failed to suspend owner:', error);
      alert(t('admin.suspend_owner_failed'));
    }
  };

  const handleResume = async (ownerId: string) => {
    try {
      const ownerRef = doc(db, 'owners', ownerId);
      await updateDoc(ownerRef, {
        suspensionStatus: 'ACTIVE',
        status: 'ACTIVE'
      });
      const userRef = doc(db, 'users', ownerId);
      await updateDoc(userRef, {
        suspensionStatus: 'ACTIVE',
        status: 'ACTIVE'
      }).catch(e => console.warn('User document update failed:', e));

      alert(t('admin.owner_resumed'));
      fetchOwners();
    } catch (error) {
      console.error('Failed to resume owner:', error);
      alert(t('admin.resume_owner_failed'));
    }
  };

  const handleApproveProperty = async (property: any) => {
    try {
      const propRef = doc(db, 'properties', property.id);
      await updateDoc(propRef, {
        status: 'APPROVED',
        approvedAt: serverTimestamp()
      });

      // Write to audit logs
      await addDoc(collection(db, 'audit_logs'), {
        actorId: user?.uid || 'admin',
        actorRole: 'admin',
        action: 'APPROVE_PROPERTY',
        targetType: 'PROPERTY',
        targetId: property.id,
        before: { status: property.status || 'pending' },
        after: { status: 'APPROVED' },
        metadata: { propertyName: property.name || property.propertyName || '' },
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'SYSTEM',
        createdAt: serverTimestamp()
      });

      // Notify owner
      const recipientId = property.ownerId || property.ownerUid;
      if (recipientId) {
        await addDoc(collection(db, 'notifications'), {
          recipientId,
          recipientRole: 'owner',
          title: 'PROPERTY APPROVED',
          body: `Your property "${property.name || property.propertyName || 'Property'}" has been approved by the admin.`,
          read: false,
          createdAt: serverTimestamp(),
          type: 'PROPERTY_APPROVAL',
          link: '/owner/properties'
        });
      }

      alert(`Property "${property.name || property.propertyName}" approved successfully.`);
    } catch (err: any) {
      console.error("Failed to approve property:", err);
      alert("Error approving property: " + err.message);
    }
  };

  const handleRejectProperty = async () => {
    if (!rejectProperty) return;
    try {
      const propRef = doc(db, 'properties', rejectProperty.id);
      await updateDoc(propRef, {
        status: 'REJECTED',
        rejectionReason: rejectReason,
        rejectedAt: serverTimestamp()
      });

      // Write to audit logs
      await addDoc(collection(db, 'audit_logs'), {
        actorId: user?.uid || 'admin',
        actorRole: 'admin',
        action: 'REJECT_PROPERTY',
        targetType: 'PROPERTY',
        targetId: rejectProperty.id,
        before: { status: rejectProperty.status || 'pending' },
        after: { status: 'REJECTED', reason: rejectReason },
        metadata: { propertyName: rejectProperty.name || rejectProperty.propertyName || '' },
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'SYSTEM',
        createdAt: serverTimestamp()
      });

      // Notify owner
      const recipientId = rejectProperty.ownerId || rejectProperty.ownerUid;
      if (recipientId) {
        await addDoc(collection(db, 'notifications'), {
          recipientId,
          recipientRole: 'owner',
          title: 'PROPERTY REJECTED',
          body: `Your property "${rejectProperty.name || rejectProperty.propertyName || 'Property'}" was rejected. Reason: ${rejectReason}`,
          read: false,
          createdAt: serverTimestamp(),
          type: 'PROPERTY_REJECTION',
          link: '/owner/properties'
        });
      }

      alert(`Property "${rejectProperty.name || rejectProperty.propertyName}" rejected.`);
      setRejectDialogOpen(false);
      setRejectProperty(null);
      setRejectReason('');
    } catch (err: any) {
      console.error("Failed to reject property:", err);
      alert("Error rejecting property: " + err.message);
    }
  };

  if (loading) {
    return <Typography sx={{ p: 4 }}>{t('onboarding.payment.verifying')}</Typography>;
  }

  // Filter pending properties
  const pendingProperties = properties.filter(p => 
    p.status === 'pending' || p.status === 'PENDING_APPROVAL' || p.status === 'ONBOARDING' || p.status === 'pending_approval'
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
        {t('admin.owner_management')}
      </Typography>

      <TableContainer component={Paper} sx={{ mb: 6 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 'bold' }}>{t('field.name')}</TableCell>
              <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 'bold' }}>{t('login.email')}</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>{t('onboarding.property_details')}</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>{t('field.units')}</TableCell>
              <TableCell align={isRTL ? 'left' : 'right'} sx={{ fontWeight: 'bold' }}>{t('admin.monthly_rent')}</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>{t('admin.unpaid_invoices')}</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>{t('fin.log.status')}</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(owners || []).map((owner) => (
              <TableRow key={owner.ownerId} sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{owner.name}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{owner.email}</TableCell>
                <TableCell align="center">{owner.totalBuildings}</TableCell>
                <TableCell align="center">{owner.totalUnits}</TableCell>
                <TableCell align="right">{t('common.currency_aed')} {(owner.monthlyRentCollected || 0).toLocaleString()}</TableCell>
                <TableCell align="center">
                  <Chip
                    label={owner.unpaidInvoiceCount}
                    color={owner.unpaidInvoiceCount >= 2 ? 'error' : 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={owner.suspensionStatus}
                    color={owner.suspensionStatus === 'SUSPENDED' ? 'error' : 'success'}
                  />
                </TableCell>
                <TableCell align="center">
                  <Grid container spacing={1}>
                    <Grid item>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setSelectedOwner(owner);
                          setSuspendDialogOpen(true);
                        }}
                        disabled={owner.suspensionStatus === 'SUSPENDED'}
                      >
                        {t('admin.suspend_owner')}
                      </Button>
                    </Grid>
                    <Grid item>
                      {owner.suspensionStatus === 'SUSPENDED' && (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => handleResume(owner.ownerId)}
                        >
                          {t('admin.resume_owner')}
                        </Button>
                      )}
                    </Grid>
                  </Grid>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Property Approval Section */}
      <Box sx={{ mb: 6 }}>
        <Typography variant="h5" sx={{ mb: 3, fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
          🏠 PENDING PROPERTY APPROVAL QUEUE
        </Typography>

        {loadingProps ? (
          <Typography sx={{ p: 2 }}>Loading pending approvals...</Typography>
        ) : pendingProperties.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#fafafa' }}>
            <Typography variant="body1" color="textSecondary" sx={{ fontWeight: 'bold' }}>
              No properties currently pending approval.
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 'bold' }}>Property Name</TableCell>
                  <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 'bold' }}>Emirate</TableCell>
                  <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 'bold' }}>Service Zone</TableCell>
                  <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 'bold' }}>Address</TableCell>
                  <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingProperties.map((prop) => (
                  <TableRow key={prop.id}>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 'bold' }}>{prop.name || prop.propertyName}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{prop.emirate}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{prop.serviceZone || '—'}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{prop.address || '—'}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Chip label={prop.status} color="warning" size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => handleApproveProperty(prop)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => {
                            setRejectProperty(prop);
                            setRejectDialogOpen(true);
                          }}
                        >
                          Reject
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Owner Suspension Dialog */}
      <Dialog open={suspendDialogOpen} onClose={() => setSuspendDialogOpen(false)} maxWidth="sm" fullWidth dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('admin.suspend_owner')}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
            {t('admin.suspend_confirm', { name: selectedOwner?.name })}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
            {t('admin.suspend_desc')}
          </Typography>
          <TextField
            fullWidth
            label={t('admin.suspend_reason')}
            multiline
            rows={4}
            value={suspensionReason}
            onChange={(e) => setSuspensionReason(e.target.value)}
            placeholder={t('admin.suspend_reason')}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: isRTL ? 'flex-start' : 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button onClick={() => setSuspendDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSuspend} variant="contained" color="error" sx={{ borderRadius: 100 }}>
            {t('admin.suspend_owner')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Property Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onClose={() => { setRejectDialogOpen(false); setRejectProperty(null); setRejectReason(''); }} maxWidth="sm" fullWidth dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>Reject Property Submission</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
            Are you sure you want to reject property "{rejectProperty?.name || rejectProperty?.propertyName}"?
          </Typography>
          <TextField
            fullWidth
            required
            label="Rejection Reason"
            multiline
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Please enter why this property is rejected (e.g., missing proof of ownership, incorrect location)"
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: isRTL ? 'flex-start' : 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button onClick={() => { setRejectDialogOpen(false); setRejectProperty(null); setRejectReason(''); }}>Cancel</Button>
          <Button onClick={handleRejectProperty} variant="contained" color="error" disabled={!rejectReason.trim()} sx={{ borderRadius: 100 }}>
            Reject Property
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
