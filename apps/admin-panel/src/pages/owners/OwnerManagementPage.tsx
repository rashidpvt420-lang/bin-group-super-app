import React, { useCallback, useEffect, useState } from 'react';
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
} from '@mui/material';
import {
  collection,
  db,
  functions,
  getDocs,
  httpsCallable,
  onSnapshot,
  query,
} from '../../lib/firebase';
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
  'pending-review',
  'pending_review',
  'onboarding',
]);

const propertyName = (property: PropertyRecord | null) => (
  property?.name || property?.propertyName || 'Property'
);

const errorMessage = (error: unknown, fallback: string) => (
  error instanceof Error && error.message ? error.message : fallback
);

export default function OwnerManagementPage() {
  const { t, isRTL } = useLanguage();
  const copy = useCallback((english: string, arabic: string) => (isRTL ? arabic : english), [isRTL]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [reviewingPropertyId, setReviewingPropertyId] = useState<string | null>(null);
  const [rejectProperty, setRejectProperty] = useState<PropertyRecord | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const fetchOwners = useCallback(async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'owners'));
      const ownerRows = snapshot.docs.map((ownerDocument) => {
        const data = ownerDocument.data();
        return {
          ownerId: ownerDocument.id,
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
  }, [t]);

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
  }, [fetchOwners]);

  const handleSuspend = async () => {
    if (!selectedOwner) return;
    const reason = suspensionReason.trim();
    if (reason.length < 8) {
      window.alert(copy('Enter a suspension reason of at least 8 characters.', 'أدخل سبب إيقاف لا يقل عن 8 أحرف.'));
      return;
    }

    try {
      const suspendOwner = httpsCallable(functions, 'adminSuspendOwner');
      await suspendOwner({ ownerId: selectedOwner.ownerId, reason });
      window.alert(t('admin.owner_suspended', { name: selectedOwner.name }));
      setSuspendDialogOpen(false);
      setSelectedOwner(null);
      setSuspensionReason('');
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
      window.alert(t('admin.owner_resumed'));
      await fetchOwners();
    } catch (error) {
      console.error('Failed to resume owner:', error);
      window.alert(t('admin.resume_owner_failed'));
    }
  };

  const reviewProperty = async (
    property: PropertyRecord,
    decision: 'APPROVE' | 'REJECT',
    reason = '',
  ) => {
    setReviewingPropertyId(property.id);
    try {
      const reviewOwnerProperty = httpsCallable(functions, 'adminReviewOwnerProperty');
      await reviewOwnerProperty({
        propertyId: property.id,
        decision,
        reason: reason.trim(),
      });
      window.alert(
        decision === 'APPROVE'
          ? copy(
            `Property "${propertyName(property)}" approved successfully.`,
            `تمت الموافقة على العقار "${propertyName(property)}" بنجاح.`,
          )
          : copy(
            `Property "${propertyName(property)}" rejected.`,
            `تم رفض العقار "${propertyName(property)}".`,
          ),
      );
      return true;
    } catch (error) {
      console.error('Failed to review property:', error);
      window.alert(errorMessage(error, copy(
        'The property review could not be completed.',
        'تعذر إكمال مراجعة العقار.',
      )));
      return false;
    } finally {
      setReviewingPropertyId(null);
    }
  };

  const handleRejectProperty = async () => {
    if (!rejectProperty || rejectReason.trim().length < 8) return;
    const completed = await reviewProperty(rejectProperty, 'REJECT', rejectReason);
    if (!completed) return;

    setRejectDialogOpen(false);
    setRejectProperty(null);
    setRejectReason('');
  };

  const closeSuspendDialog = () => {
    setSuspendDialogOpen(false);
    setSelectedOwner(null);
    setSuspensionReason('');
  };

  const closeRejectDialog = () => {
    if (reviewingPropertyId) return;
    setRejectDialogOpen(false);
    setRejectProperty(null);
    setRejectReason('');
  };

  if (loading) {
    return <Typography sx={{ p: 4 }}>{t('onboarding.payment.verifying')}</Typography>;
  }

  const pendingProperties = properties.filter((property) => (
    PENDING_PROPERTY_STATUSES.has(String(property.status || '').toLowerCase())
  ));

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
                <TableCell align={isRTL ? 'left' : 'right'}>
                  {t('common.currency_aed')} {owner.monthlyRentCollected.toLocaleString()}
                </TableCell>
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
                    {owner.suspensionStatus === 'SUSPENDED' && (
                      <Grid item>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => void handleResume(owner.ownerId)}
                        >
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
          {copy('🏠 Pending property approval queue', '🏠 قائمة العقارات بانتظار الموافقة')}
        </Typography>

        {loadingProperties ? (
          <Typography sx={{ p: 2 }}>{copy('Loading pending approvals...', 'جارٍ تحميل طلبات الموافقة...')}</Typography>
        ) : pendingProperties.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#fafafa' }}>
            <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 'bold' }}>
              {copy('No properties currently pending approval.', 'لا توجد عقارات بانتظار الموافقة حالياً.')}
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>{copy('Property name', 'اسم العقار')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{copy('Emirate', 'الإمارة')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{copy('Service zone', 'منطقة الخدمة')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{copy('Address', 'العنوان')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{copy('Status', 'الحالة')}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>{copy('Actions', 'الإجراءات')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingProperties.map((property) => {
                  const reviewing = reviewingPropertyId === property.id;
                  return (
                    <TableRow key={property.id}>
                      <TableCell sx={{ fontWeight: 'bold' }}>{propertyName(property)}</TableCell>
                      <TableCell>{property.emirate || '—'}</TableCell>
                      <TableCell>{property.serviceZone || '—'}</TableCell>
                      <TableCell>{property.address || '—'}</TableCell>
                      <TableCell>
                        <Chip label={property.status || 'pending'} color="warning" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} justifyContent="center">
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            disabled={reviewing}
                            onClick={() => void reviewProperty(property, 'APPROVE')}
                          >
                            {reviewing ? copy('Working…', 'جارٍ التنفيذ…') : copy('Approve', 'موافقة')}
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={reviewing}
                            onClick={() => {
                              setRejectProperty(property);
                              setRejectDialogOpen(true);
                            }}
                          >
                            {copy('Reject', 'رفض')}
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Dialog
        open={suspendDialogOpen}
        onClose={closeSuspendDialog}
        maxWidth="sm"
        fullWidth
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
          {t('admin.suspend_owner')}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 2 }}>
            {t('admin.suspend_confirm', { name: selectedOwner?.name })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('admin.suspend_desc')}
          </Typography>
          <TextField
            fullWidth
            required
            label={t('admin.suspend_reason')}
            multiline
            rows={4}
            value={suspensionReason}
            onChange={(event) => setSuspensionReason(event.target.value)}
            placeholder={t('admin.suspend_reason')}
            error={Boolean(suspensionReason) && suspensionReason.trim().length < 8}
            helperText={suspensionReason && suspensionReason.trim().length < 8
              ? copy('Enter at least 8 characters.', 'أدخل 8 أحرف على الأقل.')
              : ' '}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button onClick={closeSuspendDialog}>{t('common.cancel')}</Button>
          <Button
            onClick={() => void handleSuspend()}
            variant="contained"
            color="error"
            disabled={suspensionReason.trim().length < 8}
            sx={{ borderRadius: 100 }}
          >
            {t('admin.suspend_owner')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={rejectDialogOpen}
        onClose={closeRejectDialog}
        maxWidth="sm"
        fullWidth
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
          {copy('Reject property submission', 'رفض طلب العقار')}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 2 }}>
            {copy(
              `Are you sure you want to reject property "${propertyName(rejectProperty)}"?`,
              `هل تريد رفض العقار "${propertyName(rejectProperty)}"؟`,
            )}
          </Typography>
          <TextField
            fullWidth
            required
            label={copy('Rejection reason', 'سبب الرفض')}
            multiline
            rows={4}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder={copy(
              'Enter at least 8 characters explaining the rejection.',
              'أدخل سبباً واضحاً للرفض لا يقل عن 8 أحرف.',
            )}
            error={Boolean(rejectReason) && rejectReason.trim().length < 8}
            helperText={rejectReason && rejectReason.trim().length < 8
              ? copy('A clear reason of at least 8 characters is required.', 'يجب إدخال سبب واضح لا يقل عن 8 أحرف.')
              : ' '}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: isRTL ? 'flex-start' : 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button disabled={Boolean(reviewingPropertyId)} onClick={closeRejectDialog}>
            {copy('Cancel', 'إلغاء')}
          </Button>
          <Button
            onClick={() => void handleRejectProperty()}
            variant="contained"
            color="error"
            disabled={Boolean(reviewingPropertyId) || rejectReason.trim().length < 8}
            sx={{ borderRadius: 100 }}
          >
            {copy('Reject property', 'رفض العقار')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
