import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Box,
  Stack,
} from '@mui/material';
import { db, functions, httpsCallable, collection, getDocs, onSnapshot, query } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

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

interface PropertyRecord {
  id: string;
  name?: string;
  propertyName?: string;
  emirate?: string;
  serviceZone?: string;
  address?: string;
  status?: string;
  ownerId?: string;
  ownerUid?: string;
  [key: string]: unknown;
}

const PENDING_PROPERTY_STATUSES = new Set([
  'pending',
  'pending_approval',
  'onboarding',
]);

function propertyName(property: PropertyRecord | null) {
  return property?.name || property?.propertyName || 'Property';
}

export default function OwnerManagementPage() {
  const { t, isRTL } = useLanguage();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');

  const [properties, setProperties] = useState<any[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [rejectProperty, setRejectProperty] = useState<any | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewingPropertyId, setReviewingPropertyId] = useState('');

  useEffect(() => {
    void fetchOwners();

    const qProps = query(collection(db, 'properties'));
    const unsubscribeProps = onSnapshot(qProps, (snapshot) => {
      const list = snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...snapshotDoc.data(),
      }));
      setProperties(list);
      setLoadingProps(false);
    }, (error) => {
      console.error('Failed to fetch properties:', error);
      setLoadingProps(false);
    });

    return () => unsubscribeProps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOwners = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'owners'));
      const ownersList = snap.docs.map((ownerDoc) => {
        const data = ownerDoc.data();
        return {
          ownerId: ownerDoc.id,
          name: data.name || data.displayName || data.fullName || 'Owner',
          email: data.email || '',
          totalBuildings: data.totalBuildings || 0,
          totalUnits: data.totalUnits || 0,
          monthlyRentCollected: data.monthlyRentCollected || 0,
          unpaidInvoiceCount: data.unpaidInvoiceCount || 0,
          suspensionStatus: String(data.status || data.suspensionStatus || '').toLowerCase() === 'suspended'
            ? 'SUSPENDED'
            : 'ACTIVE',
          joinedDate: data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : data.createdAt || '',
        } as Owner;
      });
      setOwners(ownerRows);
    } catch (error) {
      console.error('Failed to fetch owners:', error);
      window.alert(t('admin.load_owners_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOwners();
    const propertiesQuery = query(collection(db, 'properties'));
    const unsubscribe = onSnapshot(
      propertiesQuery,
      (snapshot) => {
        setProperties(snapshot.docs.map((propertyDocument) => ({
          id: propertyDocument.id,
          ...propertyDocument.data(),
        })) as PropertyRecord[]);
        setLoadingProperties(false);
      },
      (error) => {
        console.error('Failed to fetch properties:', error);
        setLoadingProperties(false);
      },
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSuspend = async () => {
    if (!selectedOwner) return;
    try {
      const suspendOwner = httpsCallable(functions, 'adminSuspendOwner');
      await suspendOwner({ ownerId: selectedOwner.ownerId, reason: suspensionReason });
      alert(t('admin.owner_suspended', { name: selectedOwner.name }));
      setSuspendDialogOpen(false);
      await fetchOwners();
    } catch (error) {
      console.error('Failed to suspend owner:', error);
      window.alert(t('admin.suspend_owner_failed'));
    }
  };

  const handleResume = async (ownerId: string) => {
    try {
      const resumeOwner = httpsCallable(functions, 'adminResumeOwner');
      await resumeOwner({ ownerId });
      alert(t('admin.owner_resumed'));
      await fetchOwners();
    } catch (error) {
      console.error('Failed to resume owner:', error);
      window.alert(t('admin.resume_owner_failed'));
    }
  };

  const handleApproveProperty = async (property: any) => {
    setReviewingPropertyId(property.id);
    try {
      const reviewOwnerProperty = httpsCallable(functions, 'adminReviewOwnerProperty');
      await reviewOwnerProperty({ propertyId: property.id, decision: 'APPROVE' });
      alert(`Property "${property.name || property.propertyName || 'Property'}" approved successfully.`);
    } catch (error: any) {
      console.error('Failed to approve property:', error);
      alert(`Error approving property: ${error?.message || 'Unknown error'}`);
    } finally {
      setReviewingPropertyId('');
    }
  };

  const handleRejectProperty = async () => {
    if (!rejectProperty || rejectReason.trim().length < 8) return;
    setReviewingPropertyId(rejectProperty.id);
    try {
      const reviewOwnerProperty = httpsCallable(functions, 'adminReviewOwnerProperty');
      await reviewOwnerProperty({
        propertyId: rejectProperty.id,
        decision: 'REJECT',
        reason: rejectReason.trim(),
      });
      alert(`Property "${rejectProperty.name || rejectProperty.propertyName || 'Property'}" rejected.`);
      setRejectDialogOpen(false);
      setRejectProperty(null);
      setRejectReason('');
    } catch (error: any) {
      console.error('Failed to reject property:', error);
      alert(`Error rejecting property: ${error?.message || 'Unknown error'}`);
    } finally {
      setReviewingPropertyId('');
    }
  };

  if (loading) {
    return <Typography sx={{ p: 4 }}>{t('onboarding.payment.verifying')}</Typography>;
  }

  const pendingProperties = properties.filter((property) => {
    const status = String(property.status || '').toLowerCase();
    return ['pending', 'pending_approval', 'pending-review', 'pending_review', 'onboarding'].includes(status);
  });

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
            {owners.map((owner) => (
              <TableRow key={owner.ownerId} sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{owner.name}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{owner.email}</TableCell>
                <TableCell align="center">{owner.totalBuildings}</TableCell>
                <TableCell align="center">{owner.totalUnits}</TableCell>
                <TableCell align="right">
                  {t('common.currency_aed')} {owner.monthlyRentCollected.toLocaleString()}
                </TableCell>
                <TableCell align="center">
                  <Chip label={owner.unpaidInvoiceCount} color={owner.unpaidInvoiceCount >= 2 ? 'error' : 'default'} variant="outlined" />
                </TableCell>
                <TableCell align="center">
                  <Chip label={owner.suspensionStatus} color={owner.suspensionStatus === 'SUSPENDED' ? 'error' : 'success'} />
                </TableCell>
                <TableCell align="center">
                  <Grid container spacing={1} justifyContent="center">
                    <Grid item>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={owner.suspensionStatus === 'SUSPENDED'}
                        onClick={() => {
                          setSelectedOwner(owner);
                          setSuspendDialogOpen(true);
                        }}
                      >
                        {t('admin.suspend_owner')}
                      </Button>
                    </Grid>
                    <Grid item>
                      {owner.suspensionStatus === 'SUSPENDED' && (
                        <Button size="small" variant="contained" color="success" onClick={() => void handleResume(owner.ownerId)}>
                          {t('admin.resume_owner')}
                        </Button>
                      </Grid>
                    )}
                  </Grid>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mb: 6 }}>
        <Typography variant="h5" sx={{ mb: 3, fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
          🏠 PENDING PROPERTY APPROVAL QUEUE
        </Typography>

        {loadingProperties ? (
          <Typography sx={{ p: 2 }}>Loading pending approvals...</Typography>
        ) : pendingProperties.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#fafafa' }}>
            <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 'bold' }}>
              No properties currently pending approval.
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Property Name</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Emirate</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Service Zone</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Address</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingProperties.map((property) => (
                  <TableRow key={property.id}>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 'bold' }}>{property.name || property.propertyName}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{property.emirate}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{property.serviceZone || '—'}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{property.address || '—'}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Chip label={property.status} color="warning" size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          disabled={reviewingPropertyId === property.id}
                          onClick={() => void handleApproveProperty(property)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          disabled={reviewingPropertyId === property.id}
                          onClick={() => {
                            setRejectProperty(property);
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

      <Dialog open={suspendDialogOpen} onClose={() => setSuspendDialogOpen(false)} maxWidth="sm" fullWidth dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('admin.suspend_owner')}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 2 }}>
            {t('admin.suspend_confirm', { name: selectedOwner?.name })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('admin.suspend_desc')}
          </Typography>
          <TextField
            fullWidth
            label={t('admin.suspend_reason')}
            multiline
            rows={4}
            value={suspensionReason}
            onChange={(event) => setSuspensionReason(event.target.value)}
            placeholder={t('admin.suspend_reason')}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSuspendDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => void handleSuspend()} variant="contained" color="error" sx={{ borderRadius: 100 }}>
            {t('admin.suspend_owner')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={rejectDialogOpen}
        onClose={() => {
          if (reviewingPropertyId) return;
          setRejectDialogOpen(false);
          setRejectProperty(null);
          setRejectReason('');
        }}
        maxWidth="sm"
        fullWidth
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>Reject Property Submission</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to reject property "{propertyName(rejectProperty)}"?
          </Typography>
          <TextField
            fullWidth
            required
            label="Rejection Reason"
            multiline
            rows={4}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Enter at least 8 characters explaining the rejection."
            error={Boolean(rejectReason) && rejectReason.trim().length < 8}
            helperText={rejectReason && rejectReason.trim().length < 8 ? 'A clear reason of at least 8 characters is required.' : ' '}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: isRTL ? 'flex-start' : 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button
            disabled={Boolean(reviewingPropertyId)}
            onClick={() => {
              setRejectDialogOpen(false);
              setRejectProperty(null);
              setRejectReason('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleRejectProperty()}
            variant="contained"
            color="error"
            disabled={Boolean(reviewingPropertyId) || rejectReason.trim().length < 8}
            sx={{ borderRadius: 100 }}
          >
            Reject Property
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
