import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { ClipboardCheck, Eye, FileText, Home, ReceiptText, ShieldAlert } from 'lucide-react';
import { collection, db, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from '../../lib/firebase';
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
const money = (value: any) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

const statusColor = (status: any) => {
  const normalized = String(status || '').toUpperCase();
  if (['APPROVED', 'SETTLED', 'CLOSED'].includes(normalized)) return '#10b981';
  if (['DISPUTED', 'OWNER_REVIEW', 'SUBMITTED', 'REINSPECTION_REQUESTED'].includes(normalized)) return '#f59e0b';
  if (['REJECTED', 'ESCALATED', 'DAMAGE_CLAIMED'].includes(normalized)) return '#ef4444';
  return binThemeTokens.goldHover;
};

const evidenceUrls = (inspection: any) => [
  ...(Array.isArray(inspection.evidencePhotos) ? inspection.evidencePhotos : []),
  ...(Array.isArray(inspection.photos) ? inspection.photos : []),
  ...(Array.isArray(inspection.moveInPhotos) ? inspection.moveInPhotos : []),
  ...(Array.isArray(inspection.moveOutPhotos) ? inspection.moveOutPhotos : []),
  ...Object.values(inspection.roomChecks || {}).flatMap((room: any) => Object.values(room || {}).map((check: any) => check?.photoUrl).filter(Boolean)),
  inspection.reportUrl,
  inspection.evidenceUrl,
  inspection.pdfUrl,
].filter(Boolean);

const settlementLedger = (inspection: any) => {
  const depositHeld = Number(inspection.depositHeld || inspection.securityDeposit || inspection.depositAmount || 0);
  const damageEstimate = Number(inspection.damageEstimate || inspection.damageCostEstimate || inspection.estimatedDamageCost || 0);
  const proposedDeduction = Number(inspection.proposedDeduction || inspection.depositDeduction || inspection.deductionAmount || damageEstimate || 0);
  const balanceToTenant = Math.max(0, depositHeld - proposedDeduction);
  const balanceDue = Math.max(0, proposedDeduction - depositHeld);
  return { depositHeld, damageEstimate, proposedDeduction, balanceToTenant, balanceDue };
};

export default function OwnerInspectionsPage() {
  const { user } = useRole();
  const { tx } = useLanguage();
  const [inspections, setInspections] = useState<any[]>([]);
  const [warning, setWarning] = useState('');
  const [busyId, setBusyId] = useState('');

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

  const updateInspection = async (inspection: any, action: 'APPROVED' | 'REINSPECTION_REQUESTED' | 'SETTLEMENT_REQUESTED') => {
    if (!inspection?.id || !user?.uid) return;
    setBusyId(`${inspection.id}:${action}`);
    try {
      const payload: Record<string, any> = {
        status: action,
        ownerAction: action,
        ownerActionAt: serverTimestamp(),
        ownerActionBy: user.uid,
        ownerActionByEmail: normalizeEmail(user.email),
        updatedAt: serverTimestamp(),
      };
      if (action === 'APPROVED') {
        payload.approvedByOwner = true;
        payload.ownerApprovedAt = serverTimestamp();
        payload.settlementStatus = inspection.inspectionType === 'MOVE_OUT' ? 'APPROVED_FOR_SETTLEMENT' : 'NO_SETTLEMENT_REQUIRED';
      }
      if (action === 'REINSPECTION_REQUESTED') {
        payload.damageClaimStatus = 'OWNER_REQUESTED_REINSPECTION';
        payload.reinspectionRequestedAt = serverTimestamp();
      }
      if (action === 'SETTLEMENT_REQUESTED') {
        const ledger = settlementLedger(inspection);
        payload.settlementStatus = 'OWNER_REQUESTED_SETTLEMENT';
        payload.settlementRequestedAt = serverTimestamp();
        payload.settlementLedger = ledger;
      }
      await updateDoc(doc(db, 'propertyInspections', inspection.id), payload);
      setWarning('');
    } catch (err) {
      console.error('[OwnerInspections] action failed:', err);
      setWarning(tx('owner.inspections.actionFailed', 'Could not update this inspection. Check access rules or try again.'));
    } finally {
      setBusyId('');
    }
  };

  const pending = inspections.filter((item) => ['SUBMITTED', 'OWNER_REVIEW', 'DISPUTED', 'REINSPECTION_REQUESTED'].includes(String(item.status || '').toUpperCase())).length;
  const moveIns = inspections.filter((item) => String(item.inspectionType || item.type || '').toUpperCase().replace('-', '_') === 'MOVE_IN').length;
  const moveOuts = inspections.filter((item) => String(item.inspectionType || item.type || '').toUpperCase().replace('-', '_') === 'MOVE_OUT').length;
  const settlementCount = inspections.filter((item) => Number(settlementLedger(item).proposedDeduction || 0) > 0 || item.settlementStatus).length;

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
            { label: tx('owner.inspections.settlements', 'Settlement Ledgers'), value: settlementCount, icon: <ReceiptText size={22} />, color: '#3b82f6' },
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
            const urls = evidenceUrls(inspection);
            const ledger = settlementLedger(inspection);
            const poorItems = Array.isArray(inspection.poorConditionItems) ? inspection.poorConditionItems : [];
            return (
              <Grid item xs={12} md={6} key={inspection.id}>
                <Paper sx={{ p: 3, borderRadius: 5, border: `1px solid ${alpha(color, 0.18)}`, bgcolor: '#fff' }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
                      <Box>
                        <Typography sx={{ fontWeight: 950, color: binThemeTokens.textPrimary }}>{inspection.propertyName || inspection.propertyId || tx('owner.inspections.property', 'Property')}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{String(inspection.inspectionType || inspection.type || 'INSPECTION').replace(/_/g, ' ')} · {inspection.unitNumber || inspection.unitId || tx('owner.inspections.unitPending', 'Unit pending')}</Typography>
                      </Box>
                      <Chip label={String(inspection.status || 'SUBMITTED').replace(/_/g, ' ')} sx={{ bgcolor: alpha(color, 0.1), color, fontWeight: 950 }} />
                    </Stack>
                    <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{inspection.summary || inspection.notes || tx('owner.inspections.noSummary', 'Room-by-room evidence is ready for review when uploaded.')}</Typography>
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{urls.length ? `${urls.length} evidence file(s) attached` : 'No evidence files attached yet'}</Typography>

                    <Paper sx={{ p: 2, bgcolor: alpha('#0f172a', 0.03), border: '1px solid rgba(15,23,42,0.08)', borderRadius: 3 }}>
                      <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 1 }}>DEPOSIT / DAMAGE SETTLEMENT LEDGER</Typography>
                      <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">Deposit Held</Typography><Typography fontWeight={950}>{money(ledger.depositHeld)}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">Damage Estimate</Typography><Typography fontWeight={950}>{money(ledger.damageEstimate)}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">Proposed Deduction</Typography><Typography fontWeight={950} color={ledger.proposedDeduction > 0 ? '#ef4444' : '#10b981'}>{money(ledger.proposedDeduction)}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">Tenant Refund / Balance Due</Typography><Typography fontWeight={950}>{ledger.balanceDue > 0 ? `${money(ledger.balanceDue)} due` : `${money(ledger.balanceToTenant)} refund`}</Typography></Grid>
                      </Grid>
                      {inspection.depositNotes && <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: binThemeTokens.textSecondary }}>Notes: {inspection.depositNotes}</Typography>}
                      {poorItems.length > 0 && <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#ef4444', fontWeight: 800 }}>{poorItems.length} flagged condition item(s)</Typography>}
                    </Paper>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {urls.slice(0, 4).map((url, index) => (
                        <Button key={`${inspection.id}-evidence-${index}`} variant="outlined" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} startIcon={<Eye size={16} />} sx={{ borderColor: binThemeTokens.goldHover, color: binThemeTokens.goldHover, fontWeight: 950 }}>
                          Evidence {index + 1}
                        </Button>
                      ))}
                      <Button variant="outlined" disabled={busyId === `${inspection.id}:APPROVED`} onClick={() => updateInspection(inspection, 'APPROVED')} sx={{ borderColor: '#10b981', color: '#10b981', fontWeight: 950 }}>{busyId === `${inspection.id}:APPROVED` ? <CircularProgress size={16} /> : tx('owner.inspections.approve', 'Approve Condition')}</Button>
                      <Button variant="outlined" disabled={busyId === `${inspection.id}:REINSPECTION_REQUESTED`} onClick={() => updateInspection(inspection, 'REINSPECTION_REQUESTED')} sx={{ borderColor: '#f59e0b', color: '#f59e0b', fontWeight: 950 }}>{busyId === `${inspection.id}:REINSPECTION_REQUESTED` ? <CircularProgress size={16} /> : tx('owner.inspections.claim', 'Claim / Reinspection')}</Button>
                      <Button variant="outlined" disabled={busyId === `${inspection.id}:SETTLEMENT_REQUESTED`} onClick={() => updateInspection(inspection, 'SETTLEMENT_REQUESTED')} sx={{ borderColor: '#3b82f6', color: '#3b82f6', fontWeight: 950 }}>{busyId === `${inspection.id}:SETTLEMENT_REQUESTED` ? <CircularProgress size={16} /> : tx('owner.inspections.settlement', 'Settlement')}</Button>
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
