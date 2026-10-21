import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Grid, Paper, Skeleton, Typography } from '@mui/material';
import { collection, db, limit, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { pickActiveTicket, pickLease } from '../tenantHomeSelectors';
import { daysUntil, nextOpenInstallment, type RentInstallment } from './TenantRentSchedulePanel';

type Slot<T> = { loading: boolean; error: boolean; data: T };
const start = <T,>(data: T): Slot<T> => ({ loading: true, error: false, data });

function Card({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <Paper variant="outlined" data-testid={testId} sx={{ p: 2.5, borderRadius: 3, height: '100%', bgcolor: '#fff' }}>
      <Typography component="h2" fontWeight={900} sx={{ color: binThemeTokens.textSecondary, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', mb: 1 }}>{title}</Typography>
      {children}
    </Paper>
  );
}
const Loading = () => <Skeleton variant="text" width="70%" height={32} />;
const Failed = ({ what }: { what: string }) => <Alert severity="warning" sx={{ py: 0 }}>{what} could not be loaded.</Alert>;
const Big = ({ children }: { children: React.ReactNode }) => <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 900, fontSize: 20 }}>{children}</Typography>;
const Small = ({ children }: { children: React.ReactNode }) => <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{children}</Typography>;

/** Feature 8: real data on the tenant home screen — home, rent, active job, building notices. Never a silent blank. */
export type TenantHomeSection = 'home' | 'rent' | 'ticket' | 'notices';
export default function TenantHomeSummary({ onNavigate, only }: { onNavigate: (path: string) => void; only?: TenantHomeSection[] }) {
  const show = (section: TenantHomeSection) => !only || only.includes(section);
  const { user } = useRole();
  const uid = user?.uid || '';
  const [unit, setUnit] = useState<Slot<any>>(start(null));
  const [lease, setLease] = useState<Slot<any>>(start(null));
  const [rent, setRent] = useState<Slot<RentInstallment | null>>(start(null));
  const [ticket, setTicket] = useState<Slot<any>>(start(null));
  const [notices, setNotices] = useState<Slot<any[]>>(start([]));

  useEffect(() => {
    if (!uid) return undefined;
    const fail = (set: (s: any) => void, empty: any) => () => set({ loading: false, error: true, data: empty });
    const subs = [
      onSnapshot(query(collection(db, 'units'), where('tenantId', '==', uid), limit(5)), (s) => setUnit({ loading: false, error: false, data: s.docs[0] ? { id: s.docs[0].id, ...(s.docs[0].data() as any) } : null }), fail(setUnit, null)),
      onSnapshot(query(collection(db, 'leases'), where('tenantId', '==', uid), limit(10)), (s) => setLease({ loading: false, error: false, data: pickLease(s.docs.map((d) => d.data())) }), fail(setLease, null)),
      onSnapshot(query(collection(db, 'rent_installments'), where('tenantUid', '==', uid)), (s) => setRent({ loading: false, error: false, data: nextOpenInstallment(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))) }), fail(setRent, null)),
      onSnapshot(query(collection(db, 'maintenanceTickets'), where('tenantId', '==', uid), limit(30)), (s) => setTicket({ loading: false, error: false, data: pickActiveTicket(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))) }), fail(setTicket, null)),
    ];
    return () => subs.forEach((u) => u());
  }, [uid]);

  const propertyId = unit.data?.propertyId || '';
  useEffect(() => {
    if (unit.loading) return undefined;
    if (!propertyId) { setNotices({ loading: false, error: false, data: [] }); return undefined; }
    return onSnapshot(query(collection(db, 'systemLogs'), where('type', '==', 'TENANT_NOTICE'), where('propertyId', '==', propertyId), limit(3)),
      (s) => setNotices({ loading: false, error: false, data: s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) }),
      () => setNotices({ loading: false, error: true, data: [] }));
  }, [unit.loading, propertyId]);

  if (!uid) return null;
  const end = lease.data?.leaseEndDate || lease.data?.endDate || '';
  const daysLeft = end ? daysUntil(end) : null;
  return (
    <Box sx={{ mb: 3 }} data-testid="tenant-home-summary">
      <Grid container spacing={2}>
        {show('home') && (<Grid item xs={12} sm={6}>
          <Card title="My home" testId="tenant-home-card">
            {unit.loading || lease.loading ? <Loading /> : unit.error ? <Failed what="Your unit" /> : !unit.data ? (
              <><Big>No unit linked yet</Big><Small>Accept your owner's invitation or ask BIN to link your unit.</Small></>
            ) : (
              <>
                <Big>Unit {unit.data.unitNumber || unit.data.id}</Big>
                <Small>{unit.data.propertyName || ''}</Small>
                {lease.error ? <Failed what="Your lease" /> : end ? <Small>Lease ends {end}{daysLeft !== null ? ` · ${daysLeft >= 0 ? `${daysLeft} days left` : `ended ${-daysLeft} days ago`}` : ''}</Small> : <Small>Lease end date not recorded yet.</Small>}
              </>
            )}
          </Card>
        </Grid>)}
        {show('rent') && (<Grid item xs={12} sm={6}>
          <Card title="Rent" testId="tenant-rent-card">
            {rent.loading ? <Loading /> : rent.error ? <Failed what="Your rent schedule" /> : !rent.data ? (
              <><Big>Nothing due</Big><Small>Your owner has not set any open instalments.</Small></>
            ) : (
              <>
                <Big>AED {Number(rent.data.amount).toLocaleString('en-AE')}</Big>
                <Small>Due {rent.data.dueDate} · {String(rent.data.status).replaceAll('_', ' ').toLowerCase()}</Small>
                <Button size="small" variant="contained" sx={{ mt: 1 }} onClick={() => onNavigate('/tenant/payments')}>Upload payment proof</Button>
              </>
            )}
          </Card>
        </Grid>)}
        {show('ticket') && (<Grid item xs={12} sm={6}>
          <Card title="Active request" testId="tenant-ticket-card">
            {ticket.loading ? <Loading /> : ticket.error ? <Failed what="Your requests" /> : !ticket.data ? (
              <><Big>No open requests</Big><Small>Use the repair tiles below to report an issue.</Small></>
            ) : (
              <>
                <Big>{ticket.data.title || ticket.data.category || 'Maintenance request'}</Big>
                <Small>Status: {String(ticket.data.status || '').replaceAll('_', ' ').toLowerCase()}{ticket.data.technicianName ? ` · ${ticket.data.technicianName}` : ''}</Small>
                <Button size="small" variant="outlined" sx={{ mt: 1, color: binThemeTokens.textPrimary }} onClick={() => onNavigate(`/tenant/ticket/${ticket.data.id}`)}>Track technician</Button>
              </>
            )}
          </Card>
        </Grid>)}
        {show('notices') && (<Grid item xs={12} sm={6}>
          <Card title="Building notices" testId="tenant-notices-card">
            {notices.loading ? <Loading /> : notices.error ? <Failed what="Building notices" /> : !notices.data.length ? <Small>No notices for your building.</Small> : notices.data.map((n) => (
              <Box key={n.id} sx={{ mb: 1 }}><Typography fontWeight={800} sx={{ color: binThemeTokens.textPrimary }}>{n.title || 'Notice'}</Typography><Small>{n.message || n.body || ''}</Small></Box>
            ))}
          </Card>
        </Grid>)}
      </Grid>
    </Box>
  );
}
