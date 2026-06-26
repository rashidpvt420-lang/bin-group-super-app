import React, { useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography, alpha } from '@mui/material';
import { Download } from 'lucide-react';
import { addDoc, collection, db, doc, serverTimestamp, updateDoc } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import type { OwnerComplaint } from '../utils/ownerComplaintResolver';
import { exportComplaintsToCsv } from './OwnerComplaintReportExport';

interface OwnerComplaintCommandCenterProps { complaints: OwnerComplaint[]; properties: any[]; }
type OwnerAction = 'CLOSED' | 'DISPUTED' | 'REOPENED' | 'ESCALATED';
const clean = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const minReason = 8;
const colorFor = (status: string) => upper(status).includes('CLOSED') || upper(status).includes('COMPLETED') || upper(status).includes('RESOLVED') ? '#10b981' : upper(status).includes('DISPUTED') || upper(status).includes('ESCALATED') ? '#ef4444' : '#f59e0b';
const actionName = (action: OwnerAction) => ({ CLOSED: 'approve and close', DISPUTED: 'dispute', REOPENED: 'request revisit', ESCALATED: 'escalate' }[action]);
const needsReason = (action: OwnerAction) => action !== 'CLOSED';

function buildOwnerPatch(action: OwnerAction, actorId: string, reason: string) {
  const base = { ownerReviewedAt: serverTimestamp(), ownerReviewedBy: actorId, ownerReviewedByRole: 'owner', ownerActionReason: reason, updatedAt: serverTimestamp() };
  if (action === 'CLOSED') return { ...base, status: 'CLOSED', closureStatus: 'OWNER_APPROVED_CLOSED', ownerApprovalStatus: 'APPROVED', ownerApprovedAt: serverTimestamp(), closedAt: serverTimestamp(), closedByUid: actorId, closedByRole: 'owner', finalOwnerReview: { status: 'APPROVED', actorId, actorRole: 'owner', reason: reason || 'Approved by owner.', submittedAt: serverTimestamp() } };
  if (action === 'REOPENED') return { ...base, status: 'REOPENED', closureStatus: 'OWNER_REVISIT_REQUESTED', ownerApprovalStatus: 'REVISIT_REQUESTED', revisitReason: reason, revisitRequestedAt: serverTimestamp(), requiresAdminReview: true, adminReviewStatus: 'PENDING_REVISIT_REVIEW', finalOwnerReview: { status: 'REVISIT_REQUESTED', actorId, actorRole: 'owner', reason, submittedAt: serverTimestamp() } };
  if (action === 'ESCALATED') return { ...base, status: 'ESCALATED', closureStatus: 'OWNER_ESCALATED_FOR_ADMIN_REVIEW', ownerApprovalStatus: 'ESCALATED', escalationReason: reason, escalatedAt: serverTimestamp(), requiresAdminReview: true, adminReviewStatus: 'PENDING_OWNER_ESCALATION_REVIEW', finalOwnerReview: { status: 'ESCALATED', actorId, actorRole: 'owner', reason, submittedAt: serverTimestamp() } };
  return { ...base, status: 'DISPUTED', closureStatus: 'OWNER_DISPUTED_REOPENED_FOR_REVIEW', ownerApprovalStatus: 'DISPUTED', ownerDisputedAt: serverTimestamp(), disputeReason: reason, rejectionReason: reason, requiresAdminReview: true, adminReviewStatus: 'PENDING_OWNER_DISPUTE_REVIEW', finalOwnerReview: { status: 'DISPUTED', actorId, actorRole: 'owner', reason, submittedAt: serverTimestamp() } };
}

export default function OwnerComplaintCommandCenter({ complaints, properties }: OwnerComplaintCommandCenterProps) {
  const { user } = useRole();
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const rows = useMemo(() => complaints.filter((item) => {
    const status = upper(item.status);
    if (propertyFilter !== 'ALL' && item.propertyId !== propertyFilter) return false;
    if (statusFilter === 'OPEN' && (status.includes('CLOSED') || status.includes('COMPLETED') || status.includes('RESOLVED'))) return false;
    if (statusFilter === 'CLOSED' && !(status.includes('CLOSED') || status.includes('COMPLETED') || status.includes('RESOLVED'))) return false;
    if (statusFilter === 'SLA_BREACH' && item.slaStatus !== 'BREACHED') return false;
    return true;
  }).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)), [complaints, propertyFilter, statusFilter]);

  const auditBoth = async (payload: Record<string, any>) => Promise.all([addDoc(collection(db, 'audit_logs'), payload), addDoc(collection(db, 'auditLogs'), { ...payload, timestamp: serverTimestamp() })]);
  const runAction = async (item: OwnerComplaint, action: OwnerAction) => {
    let reason = '';
    if (needsReason(action)) {
      reason = clean(window.prompt(`Reason required to ${actionName(action)} ticket ${item.ticketId}`) || '');
      if (reason.length < minReason) { window.alert('A clear reason is required.'); return; }
    }
    const actorId = user?.uid || 'owner';
    const patch = buildOwnerPatch(action, actorId, reason || 'Approved by owner.');
    await updateDoc(doc(db, 'maintenanceTickets', item.ticketId), patch);
    await auditBoth({ actorId, actorRole: 'owner', action: `OWNER_${action}`, targetType: 'MAINTENANCE_TICKET', targetId: item.ticketId, module: 'owner_complaint_command_center', before: { status: item.status }, after: { status: action, ownerApprovalStatus: patch.ownerApprovalStatus, closureStatus: patch.closureStatus }, metadata: { propertyName: item.propertyName || '', reason, reporterName: item.reporterName || '', technicianName: item.assignedTechnicianName || '' }, createdAt: serverTimestamp() });
  };
  const exportRows = () => exportComplaintsToCsv(rows, `owner_complaints_export_${new Date().toISOString().slice(0, 10)}.csv`);
  const exportOne = async (item: OwnerComplaint) => { exportComplaintsToCsv([item], `bin_group_evidence_pack_${item.ticketId}_${new Date().toISOString().slice(0, 10)}.csv`); await auditBoth({ actorId: user?.uid || 'owner', actorRole: 'owner', action: 'OWNER_EVIDENCE_PACK_EXPORTED', targetType: 'MAINTENANCE_TICKET', targetId: item.ticketId, module: 'owner_complaint_command_center', status: 'EXPORTED', createdAt: serverTimestamp() }); };

  return <Card sx={{ bgcolor: 'rgba(22,22,24,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 4 }} id="complaints-command-center"><CardContent sx={{ p: { xs: 2, md: 4 } }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}><Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>OWNER COMPLAINT COMMAND CENTER</Typography><Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>Maintenance, Proof, SLA & Closure Review</Typography></Box><Button variant="outlined" startIcon={<Download size={16} />} onClick={exportRows} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}>Export CSV</Button></Stack><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}><FormControl size="small" sx={{ minWidth: 220 }}><InputLabel sx={{ color: 'rgba(255,255,255,0.6)' }}>Property</InputLabel><Select value={propertyFilter} label="Property" onChange={(event) => setPropertyFilter(event.target.value)} sx={{ color: '#fff' }}><MenuItem value="ALL">All Properties</MenuItem>{properties.map((property) => <MenuItem key={property.id} value={property.id}>{property.propertyName || property.name || property.id}</MenuItem>)}</Select></FormControl><FormControl size="small" sx={{ minWidth: 180 }}><InputLabel sx={{ color: 'rgba(255,255,255,0.6)' }}>Status</InputLabel><Select value={statusFilter} label="Status" onChange={(event) => setStatusFilter(event.target.value)} sx={{ color: '#fff' }}><MenuItem value="ALL">All</MenuItem><MenuItem value="OPEN">Open</MenuItem><MenuItem value="CLOSED">Completed / Closed</MenuItem><MenuItem value="SLA_BREACH">SLA Breach</MenuItem></Select></FormControl></Stack><Stack spacing={2}>{rows.length === 0 ? <Paper sx={{ p: 4, bgcolor: 'rgba(0,0,0,0.2)', color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>No complaints match the selected filters.</Paper> : rows.map((item) => { const status = upper(item.status); const canReview = ['COMPLETED', 'RESOLVED', 'CLOSED_VERIFIED', 'COMPLETED_PENDING_OWNER_APPROVAL'].includes(status); const canEscalate = ['OPEN', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'WAITING_PARTS', 'REOPENED'].includes(status); return <Paper key={item.ticketId} sx={{ p: 2.5, bgcolor: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}><Box><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Chip label={item.status.replace(/_/g, ' ')} size="small" sx={{ bgcolor: alpha(colorFor(item.status), 0.15), color: colorFor(item.status), fontWeight: 900 }} /><Chip label={item.priority} size="small" /><Chip label={item.slaStatus} size="small" /></Stack><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>{item.propertyName} · {item.category}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', overflowWrap: 'anywhere' }}>{item.description || 'No description provided.'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>Reporter: {item.reporterName || 'Unknown'} · Technician: {item.assignedTechnicianName || 'Unassigned'}</Typography></Box><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{canReview && <><Button size="small" color="success" variant="contained" onClick={() => runAction(item, 'CLOSED')}>Approve</Button><Button size="small" color="error" variant="contained" onClick={() => runAction(item, 'DISPUTED')}>Dispute</Button><Button size="small" color="warning" variant="outlined" onClick={() => runAction(item, 'REOPENED')}>Revisit</Button></>}{canEscalate && <Button size="small" color="error" variant="outlined" onClick={() => runAction(item, 'ESCALATED')}>Escalate</Button>}<Button size="small" startIcon={<Download size={14} />} onClick={() => exportOne(item)} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Evidence</Button></Stack></Stack></Paper>; })}</Stack></CardContent></Card>;
}
