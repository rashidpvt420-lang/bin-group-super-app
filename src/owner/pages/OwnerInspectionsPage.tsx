import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { ClipboardCheck, Eye, FileText, Home, ShieldAlert } from 'lucide-react';
import { collection, db, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  if (value?._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

const statusColor = (status: any) => {
  const normalized = String(status || '').toUpperCase();
  if (['APPROVED', 'SETTLED', 'CLOSED'].includes(normalized)) return '#10b981';
  if (['DISPUTED', 'OWNER_REVIEW', 'SUBMITTED'].includes(normalized)) return '#f59e0b';
  if (['REJECTED', 'ESCALATED'].includes(normalized)) return '#ef4444';
  return binThemeTokens.goldHover;
};

export default function OwnerInspectionsPage() {
  const { user } = useRole();
  const { tx } = useLanguage();
  const [inspections, setInspections] = useState<any[]>([]);
  const [warning, setWarning] = useState('');

  useEffect(() => {
    if (!user?.uid && !user?.email) return;
    const buckets: Record<string, any[]> = {};
    const publish = () => {
      const map = new Map<string, any>();
      Object.values(buckets).flat().forEach((item) => item?.id && map.set(item.id, item));
      setInspections(Array.from(map.values()).sort((a, b) => getMillis(b.submittedAt || b.createdAt) - getMillis(a.submittedAt || a.createdAt)));
    };
    const sources = [
      { field: 'ownerId', value: user?.uid },
      { field: 'ownerUid', value: user?.uid },
      { field: 'ownerEmail', value: normalizeEmail(user?.email) },
    ].filter((source) => source.value);
    const unsubs = sources.map((source) => {
      const key = `${source.field}:${source.value}`;
      return onSnapshot(query(collection(db, 'propertyInspections'), where(source.field, '==', source.value)), (snap) => {
        buckets[key] = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        publish();
      }, (err) => {
        console.warn(`[OwnerInspections] listener failed for ${key}:`, err);
        setWarning(tx('owner.inspections.warning', 'Some inspection evidence could not load. Check property inspection access rules if this remains empty.'));
      });
    });
    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.uid, user?.email, tx]);

  const pending = inspections.filter((item) => ['SUBMITTED', 'OWNER_REVIEW', 'DISPUTED'].includes(String(item.status || '').toUpperCase())).length;
  const moveIns = inspections.filter((item) => String(item.inspectionType || '').toUpperCase() === 'MOVE_IN').length;
  const moveOuts = inspections.filter((item) => String(item.inspectionType || '').toUpperCase() === 'MOVE_OUT').length;

  return (
    <Box>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>{tx('owner.inspections.overline', 'OWNER HANDOVER EVIDENCE')}</Typography>
          <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{tx('owner.inspections.title', 'Move-In / Move-Out Reviews')}</Typography>
          <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1, fontWeight: 700 }}>{tx('owner.inspections.subtitle', 'Review condition reports, settlement status, and handover evidence linked to your properties.')}</Typography>
        </Box>
        {warning && <Alert severity="warning">{warning}</Alert>}
        <Grid container spacing={2}>
          {[
            { label: tx('owner.inspections.pending', 'Pending Reviews'), value: pending, icon: <ShieldAlert size={22} />, color: pending ? '#f59e0b' : '#10b981' },
            { label: tx('owner.inspections.moveIns', 'Move-In Reports'), value: moveIns, icon: <Home size={22} />, color: binThemeTokens.goldHover },
            { label: tx('owner.inspections.moveOuts', 'Move-Out Reports'), value: moveOuts, icon: <ClipboardCheck size={22} />, color: binThemeTokens.goldHover },
            { label: tx('owner.inspections.total', 'Total Evidence Files'), value: inspections.length, icon: <FileText size={22} />, color: '#3b82f6' },
          ].map((card) => (
            <Grid item xs={12} sm={6} md={3} key={card.label}>
              <Paper sx={{ p: 3, borderRadius: 5, border: `1px solid ${alpha(card.color, 0.2)}`, bgcolor: alpha(card.color, 0.06) }}>
                <Box sx={{ color: card.color, mb: 1 }}>{card.icon}</Box>
                <Typography variant="h4" sx={{ fontWeight: 950, color: binThemeTokens.textPrimary }}>{card.value}</Typography>
                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{card.label.toUpperCase()}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={2}>
          {inspections.map((inspection) => {
            const color = statusColor(inspection.status);
            return (
              <Grid item xs={12} md={6} key={inspection.id}>
                <Paper sx={{ p: 3, borderRadius: 5, border: `1px solid ${alpha(color, 0.18)}`, bgcolor: '#fff' }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
                      <Box>
                        <Typography sx={{ fontWeight: 950, color: binThemeTokens.textPrimary }}>{inspection.propertyName || inspection.propertyId || tx('owner.inspections.property', 'Property')}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{String(inspection.inspectionType || 'INSPECTION').replace(/_/g, ' ')} · {inspection.unitNumber || inspection.unitId || tx('owner.inspections.unitPending', 'Unit pending')}</Typography>
                      </Box>
                      <Chip label={String(inspection.status || 'SUBMITTED').replace(/_/g, ' ')} sx={{ bgcolor: alpha(color, 0.1), color, fontWeight: 950 }} />
                    </Stack>
                    <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{inspection.summary || inspection.notes || tx('owner.inspections.noSummary', 'Room-by-room evidence is ready for review when uploaded.')}</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Button variant="outlined" startIcon={<Eye size={16} />} sx={{ borderColor: binThemeTokens.goldHover, color: binThemeTokens.goldHover, fontWeight: 950 }}>{tx('owner.inspections.review', 'Review Evidence')}</Button>
                      <Button variant="outlined" sx={{ borderColor: '#f59e0b', color: '#f59e0b', fontWeight: 950 }}>{tx('owner.inspections.claim', 'Claim / Reinspection')}</Button>
                      <Button variant="outlined" sx={{ borderColor: '#10b981', color: '#10b981', fontWeight: 950 }}>{tx('owner.inspections.settlement', 'Settlement')}</Button>
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
          {inspections.length === 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 6, borderRadius: 6, textAlign: 'center', bgcolor: '#fff', border: `1px dashed ${alpha(binThemeTokens.goldHover, 0.22)}` }}>
                <ClipboardCheck size={44} color={binThemeTokens.goldHover} style={{ margin: '0 auto 12px' }} />
                <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{tx('owner.inspections.emptyTitle', 'No handover reviews yet')}</Typography>
                <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1 }}>{tx('owner.inspections.emptyBody', 'Move-in and move-out inspection reports will appear here after submission.')}</Typography>
              </Paper>
            </Grid>
          )}
        </Grid>
      </Stack>
    </Box>
  );
}
