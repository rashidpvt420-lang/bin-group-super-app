import React, { useState, useMemo } from 'react';
import { Box, Card, CardContent, Typography, alpha, Stack, Button, Chip, Select, MenuItem, FormControl, InputLabel, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Collapse } from '@mui/material';
import { Wrench, Download, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';
import type { OwnerComplaint } from '../utils/ownerComplaintResolver';
import { exportComplaintsToCsv } from './OwnerComplaintReportExport';
import { db, doc, updateDoc, addDoc, collection, serverTimestamp } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';

interface OwnerComplaintCommandCenterProps {
  complaints: OwnerComplaint[];
  properties: any[];
}

const cardSx = {
  bgcolor: 'rgba(22,22,24,0.72)',
  border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`,
  borderRadius: 4,
  minWidth: 0,
  overflow: 'hidden',
};

const textSafeSx = {
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

function formatCost(cost: number) {
  if (cost === 0) return '-';
  return `AED ${cost.toLocaleString()}`;
}

const getStatusColor = (status: string) => {
  if (status.includes('COMPLETED') || status.includes('RESOLVED')) return '#10b981';
  if (status.includes('OPEN') || status.includes('ESCALATED')) return '#ef4444';
  return '#f59e0b';
};

function ComplaintRow({ complaint }: { complaint: OwnerComplaint }) {
  const [open, setOpen] = useState(false);
  const { user } = useRole();

  const handleEvidenceExport = async () => {
    exportComplaintsToCsv([complaint], `bin_group_evidence_pack_${complaint.ticketId}_${new Date().toISOString().slice(0, 10)}.csv`);
    await addDoc(collection(db, 'audit_logs'), {
      actorId: user?.uid || 'owner',
      actorRole: 'owner',
      action: 'OWNER_EVIDENCE_PACK_EXPORTED',
      targetType: 'MAINTENANCE_TICKET',
      targetId: complaint.ticketId,
      module: 'owner_complaint_command_center',
      status: 'EXPORTED',
      metadata: {
        propertyName: complaint.propertyName || '',
        beforePhotoCount: complaint.photosBefore?.length || 0,
        afterPhotoCount: complaint.proofPhotosAfter?.length || 0,
      },
      createdAt: serverTimestamp(),
    });
  };

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      const ticketRef = doc(db, 'maintenanceTickets', complaint.ticketId);
      await updateDoc(ticketRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'audit_logs'), {
        actorId: user?.uid || 'owner',
        actorRole: 'owner',
        action: `OWNER_${newStatus}`,
        targetType: 'MAINTENANCE_TICKET',
        targetId: complaint.ticketId,
        before: { status: complaint.status },
        after: { status: newStatus },
        metadata: { propertyName: complaint.propertyName || '' },
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'SYSTEM',
        createdAt: serverTimestamp()
      });

      alert(`Ticket ${complaint.ticketId} status updated to ${newStatus}.`);
      window.location.reload();
    } catch (err: any) {
      console.error('Failed to update ticket status:', err);
      alert('Error: ' + err.message);
    }
  };

  const showReviewActions = ['COMPLETED', 'RESOLVED', 'CLOSED_VERIFIED'].includes(complaint.status.toUpperCase());
  const showOpenActions = ['OPEN', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'WAITING_PARTS', 'REOPENED'].includes(complaint.status.toUpperCase());
  
  return (
    <React.Fragment>
      <TableRow sx={{ '& > *': { borderBottom: 'unset', borderColor: 'rgba(255,255,255,0.05)' } }}>
        <TableCell sx={{ color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <IconButton size="small" onClick={() => setOpen(!open)} sx={{ color: binThemeTokens.gold }}>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ color: '#fff', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{complaint.propertyName}</TableCell>
        <TableCell sx={{ color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{complaint.category}</TableCell>
        <TableCell sx={{ color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <Chip label={complaint.priority} size="small" sx={{ bgcolor: complaint.priority === 'CRITICAL' ? alpha('#ef4444', 0.15) : alpha('#f59e0b', 0.15), color: complaint.priority === 'CRITICAL' ? '#ef4444' : '#f59e0b', fontWeight: 900, fontSize: '0.65rem' }} />
        </TableCell>
        <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <Chip label={complaint.status.replace(/_/g, ' ')} size="small" sx={{ bgcolor: alpha(getStatusColor(complaint.status), 0.15), color: getStatusColor(complaint.status), fontWeight: 900, fontSize: '0.65rem' }} />
        </TableCell>
        <TableCell sx={{ color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{formatCost(complaint.finalCost)}</TableCell>
        <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <Chip label={complaint.slaStatus} size="small" sx={{ bgcolor: complaint.slaStatus === 'BREACHED' ? alpha('#ef4444', 0.15) : alpha('#10b981', 0.15), color: complaint.slaStatus === 'BREACHED' ? '#ef4444' : '#10b981', fontWeight: 900, fontSize: '0.65rem' }} />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0, borderBottom: open ? '1px solid rgba(255,255,255,0.05)' : 'none' }} colSpan={7}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 3, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, my: 2 }}>
              <Typography variant="subtitle2" fontWeight={950} sx={{ color: binThemeTokens.gold, mb: 2 }}>TICKET DETAILS: {complaint.ticketId}</Typography>
              
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} sx={{ mb: 2 }}>
                <Box flex={1}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>DESCRIPTION</Typography>
                  <Typography variant="body2" sx={{ color: '#fff', mt: 0.5, ...textSafeSx }}>{complaint.description || 'No description provided.'}</Typography>
                </Box>
                <Box flex={1}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>RESOLUTION NOTES</Typography>
                  <Typography variant="body2" sx={{ color: '#fff', mt: 0.5, ...textSafeSx }}>{complaint.resolutionNotes || 'No resolution notes provided yet.'}</Typography>
                </Box>
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4} sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>REPORTER</Typography>
                  <Typography variant="body2" sx={{ color: '#fff', mt: 0.5 }}>{complaint.reporterName} ({complaint.reporterType})</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>TECHNICIAN</Typography>
                  <Typography variant="body2" sx={{ color: '#fff', mt: 0.5 }}>{complaint.assignedTechnicianName}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CREATED AT</Typography>
                  <Typography variant="body2" sx={{ color: '#fff', mt: 0.5 }}>{complaint.createdAt ? complaint.createdAt.toLocaleString() : 'Unknown'}</Typography>
                </Box>
                {complaint.resolvedAt && (
                  <Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>RESOLVED AT</Typography>
                    <Typography variant="body2" sx={{ color: '#fff', mt: 0.5 }}>{complaint.resolvedAt.toLocaleString()}</Typography>
                  </Box>
                )}
              </Stack>

              {(complaint.photosBefore.length > 0 || complaint.proofPhotosAfter.length > 0) && (
                <Box sx={{ mt: 3, mb: 2 }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, mb: 1, display: 'block' }}>EVIDENCE & PROOF</Typography>
                  <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 1 }}>
                    {complaint.photosBefore.map((url, i) => (
                      <Box key={`before-${i}`} sx={{ position: 'relative' }}>
                        <Chip label="BEFORE" size="small" sx={{ position: 'absolute', top: 4, left: 4, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.6rem', fontWeight: 900 }} />
                        <img src={url} alt={`Before ${i}`} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                      </Box>
                    ))}
                    {complaint.proofPhotosAfter.map((url, i) => (
                      <Box key={`after-${i}`} sx={{ position: 'relative' }}>
                        <Chip label="AFTER" size="small" sx={{ position: 'absolute', top: 4, left: 4, bgcolor: 'rgba(16,185,129,0.8)', color: '#fff', fontSize: '0.6rem', fontWeight: 900 }} />
                        <img src={url} alt={`After ${i}`} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}

              <Stack direction="row" spacing={2} sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }} flexWrap="wrap" useFlexGap>
                {showReviewActions && (
                  <>
                    <Button variant="contained" color="success" size="small" onClick={() => handleUpdateStatus('CLOSED')}>Approve & Close</Button>
                    <Button variant="contained" color="error" size="small" onClick={() => handleUpdateStatus('DISPUTED')}>Dispute Resolution</Button>
                    <Button variant="outlined" color="warning" size="small" onClick={() => handleUpdateStatus('REOPENED')}>Request Revisit</Button>
                  </>
                )}
                {showOpenActions && (
                  <>
                    <Button variant="outlined" color="error" size="small" onClick={() => handleUpdateStatus('ESCALATED')}>Escalate Ticket</Button>
                    <Button variant="outlined" color="warning" size="small" onClick={() => handleUpdateStatus('DISPUTED')}>Dispute Ticket</Button>
                  </>
                )}
                <Button variant="outlined" size="small" startIcon={<Download size={14} />} onClick={handleEvidenceExport} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}>
                  Download Evidence Pack
                </Button>
              </Stack>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );
}

export default function OwnerComplaintCommandCenter({ complaints, properties }: OwnerComplaintCommandCenterProps) {
  const { t } = useLanguage();
  const [filterProperty, setFilterProperty] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const filteredComplaints = useMemo(() => {
    return complaints.filter(c => {
      if (filterProperty !== 'ALL' && c.propertyId !== filterProperty) return false;
      if (filterStatus === 'OPEN' && (c.status.includes('COMPLETED') || c.status.includes('RESOLVED'))) return false;
      if (filterStatus === 'CLOSED' && !(c.status.includes('COMPLETED') || c.status.includes('RESOLVED'))) return false;
      if (filterStatus === 'SLA_BREACH' && c.slaStatus !== 'BREACHED') return false;
      return true;
    }).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }, [complaints, filterProperty, filterStatus]);

  const handleExport = () => {
    exportComplaintsToCsv(filteredComplaints, `owner_complaints_export_${new Date().toISOString().slice(0,10)}.csv`);
  };

  return (
    <Card sx={cardSx} id="complaints-command-center">
      <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 4, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
            <Box sx={{ p: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, color: binThemeTokens.gold, flexShrink: 0 }}>
              <Wrench size={22} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, ...textSafeSx }}>
                {t('owner.complaintCommandCenter') || 'Operations Command Center'}
              </Typography>
              <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', ...textSafeSx }}>
                Maintenance Tickets & Complaints
              </Typography>
            </Box>
          </Stack>
          <Button variant="outlined" startIcon={<Download size={16} />} onClick={handleExport} sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 900 }}>
            Export Report
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 4 }}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Filter by Property</InputLabel>
            <Select value={filterProperty} label="Filter by Property" onChange={(e) => setFilterProperty(e.target.value)} sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
              <MenuItem value="ALL">All Properties</MenuItem>
              {properties.map(p => (
                <MenuItem key={p.id || p.propertyId} value={p.id || p.propertyId}>{p.propertyName || p.name || 'Unnamed Property'}</MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Filter by Status</InputLabel>
            <Select value={filterStatus} label="Filter by Status" onChange={(e) => setFilterStatus(e.target.value)} sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
              <MenuItem value="ALL">All Statuses</MenuItem>
              <MenuItem value="OPEN">Open & Pending</MenuItem>
              <MenuItem value="CLOSED">Completed / Resolved</MenuItem>
              <MenuItem value="SLA_BREACH">SLA Breached Only</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {filteredComplaints.length === 0 ? (
          <Box sx={{ p: 6, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 4 }}>
            <ShieldCheck size={40} color="rgba(16, 185, 129, 0.4)" style={{ margin: '0 auto 16px' }} />
            <Typography variant="h6" fontWeight={950} sx={{ color: 'rgba(255,255,255,0.6)' }}>No Tickets Found</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1 }}>Operations are fully optimal for the selected criteria.</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.01)' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }} width={50} />
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>PROPERTY</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>CATEGORY</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>PRIORITY</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>STATUS</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{t('common.cost_aed').toUpperCase()}</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>SLA</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredComplaints.map(complaint => (
                  <ComplaintRow key={complaint.ticketId} complaint={complaint} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
