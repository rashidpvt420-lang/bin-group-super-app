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
} from '@mui/material';
import { db, functions, httpsCallable, collection, query, where, getDocs } from '../../lib/firebase';
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

export default function OwnerManagementPage() {
  const { t, isRTL } = useLanguage();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');

  useEffect(() => {
    fetchOwners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOwners = async () => {
    try {
      setLoading(true);
      const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'owner')));

      const ownerRows = await Promise.all(usersSnap.docs.map(async (userDoc) => {
        const u: any = userDoc.data();
        const ownerId = userDoc.id;
        const ownerEmail = String(u.email || '').toLowerCase();

        const [passportsSnap, ledgerByOwnerId, ledgerByOwnerUid, ledgerByOwnerEmail] = await Promise.all([
          getDocs(query(collection(db, 'property_passports'), where('ownerId', '==', ownerId))),
          getDocs(query(collection(db, 'tenant_ledger'), where('ownerId', '==', ownerId))),
          getDocs(query(collection(db, 'tenant_ledger'), where('ownerUid', '==', ownerId))),
          ownerEmail
            ? getDocs(query(collection(db, 'tenant_ledger'), where('ownerEmail', '==', ownerEmail)))
            : Promise.resolve(null),
        ]);

        let totalBuildings = 0;
        let totalUnits = 0;
        let monthlyRentCollected = 0;
        passportsSnap.forEach((d) => {
          const p: any = d.data();
          totalBuildings += 1;
          totalUnits += Number(p.totalUnits || 0);
          monthlyRentCollected += Number(p.rentCollectedTotal || 0);
        });

        const ledgerDocs = new Map<string, any>();
        [ledgerByOwnerId, ledgerByOwnerUid, ledgerByOwnerEmail].forEach((snap) => {
          snap?.forEach((d) => ledgerDocs.set(d.id, d.data()));
        });
        let unpaidInvoiceCount = 0;
        ledgerDocs.forEach((l) => {
          if (Number(l.outstandingBalance || 0) > 0) unpaidInvoiceCount += 1;
        });

        const statusValue = String(u.status || '').toLowerCase();
        const joinedAt = u.createdAt?.toDate ? u.createdAt.toDate() : (u.approvedAt?.toDate ? u.approvedAt.toDate() : null);

        return {
          ownerId,
          name: u.name || u.displayName || u.fullName || 'Owner',
          email: u.email || '',
          totalBuildings,
          totalUnits,
          monthlyRentCollected,
          unpaidInvoiceCount,
          suspensionStatus: statusValue === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
          joinedDate: joinedAt ? joinedAt.toLocaleDateString() : '—',
        } as Owner;
      }));

      setOwners(ownerRows);
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
      const adminSuspendOwner = httpsCallable(functions, 'adminSuspendOwner');
      await adminSuspendOwner({ ownerId: selectedOwner.ownerId, reason: suspensionReason });

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
      const adminResumeOwner = httpsCallable(functions, 'adminResumeOwner');
      await adminResumeOwner({ ownerId });
      alert(t('admin.owner_resumed'));
      fetchOwners();
    } catch (error) {
      console.error('Failed to resume owner:', error);
      alert(t('admin.resume_owner_failed'));
    }
  };

  if (loading) {
    return <Typography sx={{ p: 4 }}>{t('onboarding.payment.verifying')}</Typography>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
        {t('admin.owner_management')}
      </Typography>

      <TableContainer component={Paper}>
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

      {/* Suspension Dialog */}
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
    </Container>
  );
}
