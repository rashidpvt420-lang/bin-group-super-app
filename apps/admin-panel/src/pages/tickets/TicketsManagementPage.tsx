// admin-panel/src/pages/tickets/TicketsManagementPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  Grid,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Stack,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';
import { db, functions } from '../../lib/firebase';
import { collection, query, orderBy, limit, where, getDocs, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { runAdminOperationalMutation } from '../../lib/adminOperationalMutation';
import { useLanguage } from '@bin/shared';
import { UserCheck, Wrench } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ticketLifecycleStage } from '../../lib/ticketLifecycleStage';

interface Ticket {
  ticketId: string;
  tenantId: string;
  unit: string;
  category: string;
  description: string;
  status: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  assignedTechnician: string | null;
  createdAt: any;
  completedAt: any | null;
  emergencyCharge: number;
  estimatedCost?: number;
  urgency?: string;
  revisionNotes?: string;
  propertyName?: string;
  propertyId?: string;
  unitId?: string;
  ownerId?: string;
  unitNumber?: string;
  floorNumber?: string;
  dispatchStatus?: string;
  assignmentError?: string;
  assignmentReasonCode?: string;
  technicianId?: string;
}

interface Technician {
    id: string;
    displayName: string;
    specialization?: string;
    trade?: string;
    primaryTrade?: string;
    emirate?: string;
    onDuty?: boolean;
    dutyStatus?: string;
}

// Callable failures carry the server's reason (e.g. readiness, GPS, MFA). Show it instead of a
// generic message so Admin knows what to fix.
function callableErrorMessage(err: any, fallback: string): string {
  const message = String(err?.message || '').replace(/^Firebase:\s*/i, '').trim();
  const code = String(err?.code || '').replace(/^functions\//, '');
  if (!message) return fallback;
  return code && !message.includes(code) ? `${message} (${code})` : message;
}

function technicianOnDuty(tech: Technician): boolean {
  return tech.onDuty === true && String(tech.dutyStatus || 'ON_DUTY').toUpperCase() !== 'OFF_DUTY';
}

export default function TicketsManagementPage() {
  const { t, isRTL } = useLanguage();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [searchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  // Dispatch alerts link to /tickets?ticketId=<id>; open the page filtered to that ticket.
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('ticketId') || '');
  const [assignError, setAssignError] = useState('');
  
  // Restore Mission States
  const [assigningTicket, setAssigningTicket] = useState<Ticket | null>(null);
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<string>('');
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  
  const PAGE_SIZE = 20;

  const mapTicket = (doc: any) => {
    const data = doc.data() || {};
    return {
      ticketId: doc.id,
      tenantId: data.tenantId || data.userId || '',
      unit: data.unitNumber || data.unit || data.unitId || 'N/A',
      category: data.trade || data.issueType || data.category || 'General',
      description: data.description || '',
      status: data.status || 'OPEN',
      priority: data.priority || 'MEDIUM',
      assignedTechnicianId: data.assignedTechnicianId,
      assignedTechnicianName: data.assignedTechnicianName,
      assignedTechnician: data.assignedTechnicianName || data.assignedTechnician || data.technicianAssigned || data.assignedTo || null,
      createdAt: data.createdAt || null,
      completedAt: data.completedAt || null,
      emergencyCharge: data.emergencyCharge || 0,
      propertyName: data.propertyName || 'Private Asset',
      propertyId: data.propertyId || 'UNASSOCIATED',
      unitNumber: data.unitNumber || 'N/A',
      floorNumber: data.floorNumber || 'N/A',
      dispatchStatus: data.dispatchStatus || '',
      assignmentError: data.assignmentError || '',
      assignmentReasonCode: data.assignmentReasonCode || '',
      technicianId: data.technicianId || '',
    } as Ticket;
  };

  // Live: status, assignment and dispatch alerts update without a page reload.
  useEffect(() => {
    setLoading(true);
    setLoadError('');
    const q = query(collection(db, 'maintenanceTickets'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    const unsubscribe = onSnapshot(q, (snap) => {
      setTickets(snap.docs.map(mapTicket));
      setLoadError('');
      setLoading(false);
    }, (err: any) => {
      console.error('[AdminTickets] live load failed:', err);
      setLoadError(err?.message || 'Unable to load maintenance tickets.');
      setLoading(false);
    });
    return unsubscribe;
  }, []);



  const fetchTechnicians = async () => {
      try {
          const q = query(collection(db, 'users'), where('role', '==', 'technician'));
          const snap = await getDocs(q);
          const techs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
          setTechnicians(techs);
      } catch (err: any) {
          console.error("Failed to fetch technicians:", err);
          setAssignError(callableErrorMessage(err, 'Unable to load technicians.'));
      }
  };

  const handleOpenAssign = (ticket: Ticket) => {
      setAssignError('');
      setAssigningTicket(ticket);
      fetchTechnicians();
  };

  const handleOpenDetail = (ticket: Ticket) => {
      setDetailTicket(ticket);
      setEstimatedCost(ticket.estimatedCost?.toString() || '');
  };

  const handleUpdateEstimate = async () => {
      if (!detailTicket) return;
      try {
          const cost = parseFloat(estimatedCost);
          if (isNaN(cost)) {
              alert("Please enter a valid numeric estimate.");
              return;
          }
          await runAdminOperationalMutation('UPDATE_TICKET_ESTIMATE', {
              ticketId: detailTicket.ticketId,
              estimatedCost: cost,
          });
          setDetailTicket(null);
      } catch (err: any) {
          console.error("Update failed:", err);
          alert(`Failed to update estimate: ${callableErrorMessage(err, 'Unknown error.')}`);
      }
  };

  const handleAssign = async (tech: Technician) => {
      if (!assigningTicket) return;

      // 🚨 INSTITUTIONAL SAFEGUARD: Prevent dispatch of unassociated tickets
      if (!assigningTicket.propertyId || !assigningTicket.unit || assigningTicket.propertyId === 'UNASSOCIATED') {
          alert("Sovereign Protocol Violation: Mission cannot be dispatched without a verified Property and Unit node. Please link this ticket in the Orphan War Room first.");
          return;
      }

      try {
          const assignTechnician = httpsCallable(functions, 'adminAssignTechnician');
          await assignTechnician({
              ticketId: assigningTicket.ticketId,
              technicianId: tech.id,
          });
          setAssignError('');
          setAssigningTicket(null);
      } catch (err: any) {
          console.error("Assignment failed:", err);
          setAssignError(callableErrorMessage(err, 'Failed to assign the technician.'));
      }
  };

  const getPriorityColor = (priority: string) => {
    const p = priority.toUpperCase();
    if (p === 'EMERGENCY') return 'error';
    if (p === 'HIGH') return 'warning';
    if (p === 'MEDIUM') return 'info';
    if (p === 'LOW') return 'success';
    return 'default';
  };

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch = searchTerm === '' || 
        ticket.ticketId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === '' || ticket.status === filterStatus;
    const matchesPriority = filterPriority === '' || ticket.priority === filterPriority;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getResponseTime = (createdAt: any, completedAt: any | null) => {
    if (!createdAt) return 'N/A';
    const created = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const completed = completedAt ? (completedAt.toDate ? completedAt.toDate() : new Date(completedAt)) : new Date();
    const hours = Math.floor((completed.getTime() - created.getTime()) / (1000 * 60 * 60));
    return `${hours}h`;
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 10, textAlign: 'center', direction: isRTL ? 'rtl' : 'ltr' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2, fontWeight: 800 }}>Loading maintenance tickets…</Typography>
      </Container>
    );
  }

  if (loadError) {
    return (
      <Container maxWidth="lg" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
        <Alert severity="error">{loadError}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
        {t('tech.tickets_mgt').split(' ')[0]} <Box component="span" sx={{ color: '#1976d2' }}>{t('tech.tickets_mgt').split(' ').slice(1).join(' ')}</Box>
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 3, mb: 4, borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
        <Grid container spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label={t('tech.search_feed')}
              placeholder={t('tech.table.sovereign_id') + " " + t('tech.table.unit') + "..."}
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('tech.status')}</InputLabel>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label={t('tech.status')}>
                <MenuItem value="">{t('tech.all_statuses')}</MenuItem>
                <MenuItem value="OPEN">OPEN</MenuItem>
                <MenuItem value="ASSIGNED">ASSIGNED</MenuItem>
                <MenuItem value="EN_ROUTE">EN ROUTE</MenuItem>
                <MenuItem value="ARRIVED">ARRIVED</MenuItem>
                <MenuItem value="IN_PROGRESS">IN PROGRESS</MenuItem>
                <MenuItem value="COMPLETED">COMPLETED</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('tech.priority')}</InputLabel>
              <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} label={t('tech.priority')}>
                <MenuItem value="">{t('tech.all_priorities')}</MenuItem>
                <MenuItem value="EMERGENCY">EMERGENCY</MenuItem>
                <MenuItem value="HIGH">HIGH</MenuItem>
                <MenuItem value="MEDIUM">MEDIUM</MenuItem>
                <MenuItem value="LOW">LOW</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Statistics */}
      <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <StatCard label={t('tech.live_feed')} value={tickets.length} color="textPrimary" isRTL={isRTL} />
        <StatCard label="OPEN" value={tickets.filter(t => t.status === 'OPEN').length} color="#ef4444" isRTL={isRTL} />
        <StatCard label={t('tech.active')} value={tickets.filter(t => ['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(t.status)).length} color="#f59e0b" isRTL={isRTL} />
        <StatCard label={t('tech.resolved')} value={tickets.filter(t => t.status === 'COMPLETED').length} color="#10b981" isRTL={isRTL} />
      </Grid>

      {tickets.some((ticket) => ticketLifecycleStage(ticket).needsManualDispatch) && (
        <Alert severity="error" sx={{ mb: 3, fontWeight: 700 }}>
          {tickets.filter((ticket) => ticketLifecycleStage(ticket).needsManualDispatch).length} ticket(s) could not be auto-assigned and need manual dispatch.
        </Alert>
      )}

      {/* Tickets Table */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4 }}>
        <Table>
              <TableHead sx={{ backgroundColor: '#f8fafc' }}>
                <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('tech.table.sovereign_id')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('tech.table.asset') || 'Property'}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('tech.table.unit')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('tech.table.floor') || 'Floor'}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('tech.table.discipline')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('tech.status')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('tech.priority')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('tech.table.res_time')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('tech.table.tech') || 'Specialist'}</TableCell>
                  <TableCell align={isRTL ? 'left' : 'right'} sx={{ fontWeight: 'bold' }}>{t('common.action') || 'Action'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTickets.map((ticket: Ticket) => (
                  <TableRow key={ticket.ticketId} hover sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Typography variant="body2" sx={{ fontWeight: 900, color: '#1e293b' }}>
                        #{ticket.ticketId.slice(0, 10).toUpperCase()}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ color: '#1e293b', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>
                        {ticket.propertyName || ticket.propertyId || 'Unknown Asset'}
                    </TableCell>
                    <TableCell sx={{ color: '#64748b', textAlign: isRTL ? 'right' : 'left' }}>{ticket.unitNumber || ticket.unit || 'N/A'}</TableCell>
                    <TableCell sx={{ color: '#64748b', textAlign: isRTL ? 'right' : 'left' }}>{ticket.floorNumber || 'N/A'}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{ticket.category}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Chip label={ticketLifecycleStage(ticket).label} color={ticketLifecycleStage(ticket).tone as any} size="small" sx={{ fontWeight: 'bold', fontSize: 10 }} />
                      <Typography variant="caption" display="block" sx={{ color: '#64748b', mt: 0.5 }}>{ticket.status}</Typography>
                    </TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Chip label={ticket.priority} color={getPriorityColor(ticket.priority) as any} size="small" variant="outlined" sx={{ fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ color: '#1e293b', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{getResponseTime(ticket.createdAt, ticket.completedAt)}</TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        {ticket.assignedTechnicianName ? (
                            <Chip icon={<UserCheck size={14} />} label={ticket.assignedTechnicianName} size="small" color="primary" variant="outlined" />
                        ) : ticket.assignedTechnicianId ? (
                            <Chip icon={<UserCheck size={14} />} label={ticket.assignedTechnicianId.slice(0, 10)} size="small" color="primary" variant="outlined" />
                        ) : (
                            <Box>
                                <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'error.main', display: 'block' }}>
                                    {ticketLifecycleStage(ticket).needsManualDispatch ? 'NEEDS MANUAL DISPATCH' : 'UNASSIGNED'}
                                </Typography>
                                {ticketLifecycleStage(ticket).reason && (
                                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block', maxWidth: 220 }}>{ticketLifecycleStage(ticket).reason}</Typography>
                                )}
                            </Box>
                        )}
                    </TableCell>
                    <TableCell align={isRTL ? 'left' : 'right'}>
                      <Stack direction="row" spacing={1} justifyContent={isRTL ? 'flex-start' : 'flex-end'}>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={() => handleOpenDetail(ticket)}
                          sx={{ fontSize: '0.7rem', fontWeight: 900 }}
                        >
                            DETAILS
                        </Button>
                        <Button 
                          size="small" 
                          variant="contained" 
                          onClick={() => handleOpenAssign(ticket)}
                          disabled={ticket.status === 'COMPLETED'}
                          sx={{ fontSize: '0.7rem', fontWeight: 900 }}
                        >
                            {ticket.assignedTechnicianId ? 'REASSIGN' : 'ASSIGN'}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
        </Table>
      </TableContainer>

      {filteredTickets.length === 0 && (
        <Paper sx={{ p: 10, textAlign: 'center', bgcolor: '#f8fafc' }}>
          <Typography color="textSecondary" sx={{ fontStyle: 'italic' }}>{t('tech.no_incidents')}</Typography>
        </Paper>
      )}

      {/* Assignment Dialog */}
      <Dialog open={!!assigningTicket} onClose={() => setAssigningTicket(null)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ fontWeight: 900 }}>MANUAL SPECIALIST ASSIGNMENT</DialogTitle>
          <DialogContent>
              <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
                  Select a verified specialist from the Technician Corps to handle Mission #{assigningTicket?.ticketId.substring(0,8).toUpperCase()}.
              </Typography>
              {assignError && (
                  <Alert severity="error" sx={{ mb: 2 }} data-testid="assign-error">{assignError}</Alert>
              )}
              <List>
                      {technicians.map(tech => (
                          <ListItem 
                            button 
                            key={tech.id} 
                            onClick={() => handleAssign(tech)}
                            sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 2, mb: 1 }}
                          >
                              <ListItemAvatar>
                                  <Avatar sx={{ bgcolor: technicianOnDuty(tech) ? 'success.main' : 'grey.400' }}>
                                      <Wrench size={20} />
                                  </Avatar>
                              </ListItemAvatar>
                              <ListItemText 
                                primary={tech.displayName} 
                                secondary={[tech.specialization || tech.primaryTrade || tech.trade || 'General Maintenance', tech.emirate].filter(Boolean).join(' · ')} 
                                primaryTypographyProps={{ fontWeight: 900 }}
                              />
                              {!technicianOnDuty(tech) && <Chip label="OFF DUTY" size="small" />}
                          </ListItem>
                      ))}
                      {technicians.length === 0 && <Typography variant="body2" sx={{ textAlign: 'center', py: 2, fontStyle: 'italic' }}>No specialists found in this sector.</Typography>}
                  </List>
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setAssigningTicket(null)}>CANCEL</Button>
          </DialogActions>
      </Dialog>

      {/* Detail/Estimate Dialog */}
      <Dialog open={!!detailTicket} onClose={() => setDetailTicket(null)} fullWidth maxWidth="sm">
          <DialogTitle sx={{ fontWeight: 900 }}>MISSION LOG DETAILS</DialogTitle>
          <DialogContent>
              {detailTicket && (
                  <Stack spacing={3} sx={{ mt: 1 }}>
                      <Box>
                          <Typography variant="caption" color="textSecondary" fontWeight="bold">DESCRIPTION</Typography>
                          <Typography variant="body1">{detailTicket.description}</Typography>
                      </Box>
                      <Grid container spacing={2}>
                          <Grid item xs={6}>
                              <Typography variant="caption" color="textSecondary" fontWeight="bold">STAGE</Typography>
                              <Typography variant="body2">{ticketLifecycleStage(detailTicket).label} ({detailTicket.status})</Typography>
                          </Grid>
                          <Grid item xs={6}>
                              <Typography variant="caption" color="textSecondary" fontWeight="bold">ASSIGNED TECHNICIAN</Typography>
                              <Typography variant="body2">{detailTicket.assignedTechnicianName || detailTicket.assignedTechnicianId || 'Unassigned'}</Typography>
                          </Grid>
                      </Grid>
                      {ticketLifecycleStage(detailTicket).needsManualDispatch && (
                          <Alert severity="error">Auto-assignment failed: {ticketLifecycleStage(detailTicket).reason}</Alert>
                      )}
                      <Grid container spacing={2}>
                          <Grid item xs={6}>
                              <Typography variant="caption" color="textSecondary" fontWeight="bold">PROPERTY</Typography>
                              <Typography variant="body2">{detailTicket.propertyName || 'N/A'}</Typography>
                          </Grid>
                          <Grid item xs={6}>
                              <Typography variant="caption" color="textSecondary" fontWeight="bold">UNIT</Typography>
                              <Typography variant="body2">{detailTicket.unitNumber || detailTicket.unit || 'N/A'}</Typography>
                          </Grid>
                      </Grid>
                      
                      <Divider />
                      
                      <Box>
                          <Typography variant="overline" sx={{ color: '#1976d2', fontWeight: 900 }}>Financial Projections</Typography>
                          <TextField
                              fullWidth
                              label="Estimated Cost (AED)"
                              type="number"
                              variant="outlined"
                              size="small"
                              value={estimatedCost}
                              onChange={(e) => setEstimatedCost(e.target.value)}
                              sx={{ mt: 1 }}
                              helperText="Estimates above AED 1,000 trigger mandatory Owner Approval."
                          />
                      </Box>

                      {detailTicket.revisionNotes && (
                          <Alert severity="warning">
                              <Typography variant="caption" fontWeight="bold">OWNER REVISION REQUEST:</Typography>
                              <Typography variant="body2">{detailTicket.revisionNotes}</Typography>
                          </Alert>
                      )}
                  </Stack>
              )}
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setDetailTicket(null)}>CANCEL</Button>
              <Button 
                variant="contained" 
                onClick={handleUpdateEstimate}
                sx={{ bgcolor: '#1976d2', fontWeight: 900 }}
              >
                  UPDATE ESTIMATE
              </Button>
          </DialogActions>
      </Dialog>
    </Container>
  );
}

const StatCard = ({ label, value, color, isRTL }: any) => (
  <Grid item xs={12} sm={6} md={3}>
    <Paper sx={{ p: 3, textAlign: 'center', borderRadius: 4, border: '1px solid rgba(0,0,0,0.05)' }}>
      <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{label}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 900, color, textAlign: isRTL ? 'right' : 'left' }}>{value}</Typography>
    </Paper>
  </Grid>
);
