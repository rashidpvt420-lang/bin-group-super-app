import React, { useState, useEffect } from 'react';
import {
  Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, TextField, Grid,
  Typography, MenuItem, Select, FormControl,
  InputLabel, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, List, ListItem,
  ListItemText, ListItemAvatar, Avatar, Stack,
  Divider, Alert, alpha, Tooltip, IconButton, Box
} from '@mui/material';
import { 
    Ticket as TicketIcon, Wrench, Search, Filter, 
    Clock, AlertCircle, CheckCircle, UserCheck,
    DollarSign, MapPin, Layers, Info
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useLanguage } from '../../../context/LanguageContext';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import LaunchStatusBanner from '../../components/LaunchStatusBanner';
import { resolvePropertyLocation } from '../../../utils/propertyLocationResolver';
import { filterLaunchRecords } from '../../utils/launchDataHygiene';

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
  createdAt: any;
  completedAt: any | null;
  estimatedCost?: number;
  propertyName?: string;
  propertyId?: string;
  unitNumber?: string;
  revisionNotes?: string;
}

interface Technician {
    id: string;
    displayName: string;
    specialization?: string;
    onDuty?: boolean;
}

export default function TicketsManagementPage() {
  const { t, isRTL } = useLanguage();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [assigningTicket, setAssigningTicket] = useState<Ticket | null>(null);
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<string>('');
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  
  useEffect(() => {
    const q = query(collection(db, 'maintenanceTickets'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snap) => {
        setTickets(filterLaunchRecords(snap.docs.map(d => ({ ticketId: d.id, ...d.data() } as Ticket))));
        setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const fetchTechnicians = async () => {
    const q = query(collection(db, 'users'), where('role', '==', 'technician'));
    const unsubscribe = onSnapshot(q, (snap) => {
        setTechnicians(snap.docs.map(d => ({ id: d.id, ...d.data() } as Technician)));
    });
    return unsubscribe;
  };

  const handleOpenAssign = (ticket: Ticket) => {
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
          if (isNaN(cost)) return;
          
          const updateData: any = {
              estimatedCost: cost,
              updatedAt: serverTimestamp()
          };

          if (cost > 1000 && (detailTicket.status === 'OPEN' || detailTicket.status === 'ESTIMATED')) {
              updateData.status = 'AWAITING_OWNER_APPROVAL';
          } else if (detailTicket.status === 'OPEN') {
              updateData.status = 'ESTIMATED';
          }

          await updateDoc(doc(db, 'maintenanceTickets', detailTicket.ticketId), updateData);
          setDetailTicket(null);
      } catch (err) {
          console.error(err);
      }
  };

  const handleAssign = async (tech: Technician) => {
      if (!assigningTicket) return;
      try {
          await updateDoc(doc(db, 'maintenanceTickets', assigningTicket.ticketId), {
              assignedTechnicianId: tech.id,
              assignedTechnicianName: tech.displayName,
              status: 'ASSIGNED',
              updatedAt: serverTimestamp(),
              assignedAt: serverTimestamp()
          });
          setAssigningTicket(null);
      } catch (err) {
          console.error(err);
      }
  };

  const getStatusStyle = (status: any) => {
    const s = String(status || '').toUpperCase();
    if (s === 'OPEN') return { bg: alpha('#EF4444', 0.1), color: '#EF4444' };
    if (['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(s)) return { bg: alpha('#F59E0B', 0.1), color: '#F59E0B' };
    if (s === 'COMPLETED') return { bg: alpha('#10B981', 0.1), color: '#10B981' };
    return { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' };
  };

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch = searchTerm === '' || 
        ticket.ticketId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.propertyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.category?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === '' || ticket.status === filterStatus;
    const matchesPriority = filterPriority === '' || ticket.priority === filterPriority;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  return (
    <AdminPageFrame
      title={t('tech.tickets_mgt') || 'MAINTENANCE COMMAND'}
      subtitle="Production maintenance tickets only. Test/demo rows are hidden."
      loading={loading}
      breadcrumbs={[{ label: 'Tickets' }]}
    >
      <LaunchStatusBanner title="Tickets are launch-filtered" message="Only production maintenance tickets are shown. Assignment remains active; completed tickets cannot be reassigned." />

      <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Stack direction="row" spacing={2} alignItems="center">
                <Search size={18} color="rgba(255,255,255,0.3)" />
                <TextField
                    fullWidth
                    placeholder="Search by ID, Property, or Issue..."
                    variant="standard"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{ disableUnderline: true, style: { color: '#FFF', fontWeight: 700 } }}
                />
            </Stack>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <Select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)} 
                displayEmpty
                sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF', borderRadius: 2 }}
              >
                <MenuItem value="">ALL STATUSES</MenuItem>
                {['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <Select 
                value={filterPriority} 
                onChange={(e) => setFilterPriority(e.target.value)} 
                displayEmpty
                sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF', borderRadius: 2 }}
              >
                <MenuItem value="">ALL PRIORITIES</MenuItem>
                {['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'].map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>
        <Table sx={{ minWidth: 980 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>TICKET</TableCell>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>LOCATION</TableCell>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>DISCIPLINE</TableCell>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>STATUS</TableCell>
              <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ASSIGNED</TableCell>
              <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTickets.map((ticket) => {
              const statusStyle = getStatusStyle(ticket.status);
              return (
                <TableRow key={ticket.ticketId} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.gold }}>#{String(ticket.ticketId || '').slice(0, 8).toUpperCase()}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                        {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{ticket.propertyName || 'N/A'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>UNIT {ticket.unitNumber || ticket.unit || 'N/A'}</Typography>
                      {(() => {
                          const resolved = resolvePropertyLocation(ticket);
                          if (!resolved.hasExactCoordinates) {
                              return (
                                  <Box sx={{ mt: 0.5 }}>
                                      <Tooltip title="Exact GPS pin missing. Technician dispatch cannot be guaranteed.">
                                          <Chip 
                                              label="GPS MISSING" 
                                              size="small" 
                                              sx={{ height: 16, fontSize: 8, bgcolor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 900, border: '1px solid rgba(239, 68, 68, 0.3)' }} 
                                          />
                                      </Tooltip>
                                  </Box>
                              );
                          }
                          return null;
                      })()}
                  </TableCell>
                  <TableCell>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>{String(ticket.category || '').toUpperCase() || 'GENERAL'}</Typography>
                      <Chip label={ticket.priority} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 16, mt: 0.5, borderColor: ticket.priority === 'EMERGENCY' ? '#EF4444' : 'rgba(255,255,255,0.1)' }} />
                  </TableCell>
                  <TableCell>
                    <Chip label={ticket.status} size="small" sx={{ bgcolor: statusStyle.bg, color: statusStyle.color, fontWeight: 950, fontSize: '0.6rem' }} />
                  </TableCell>
                  <TableCell>
                      {ticket.assignedTechnicianName ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                              <Avatar sx={{ width: 24, height: 24, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontSize: '0.7rem' }}>{ticket.assignedTechnicianName.charAt(0)}</Avatar>
                              <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{ticket.assignedTechnicianName}</Typography>
                          </Stack>
                      ) : (
                          <Typography variant="caption" sx={{ color: '#EF4444', fontStyle: 'italic', fontWeight: 900 }}>UNASSIGNED</Typography>
                      )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <IconButton size="small" onClick={() => handleOpenDetail(ticket)} sx={{ color: 'rgba(255,255,255,0.3)' }}><Info size={16} /></IconButton>
                      <Button 
                        size="small" 
                        variant="contained" 
                        onClick={() => handleOpenAssign(ticket)}
                        disabled={ticket.status === 'COMPLETED'}
                        sx={{ fontSize: '0.65rem', fontWeight: 950, borderRadius: 1.5, bgcolor: binThemeTokens.gold, color: '#000' }}
                      >
                          {ticket.assignedTechnicianId ? 'REASSIGN' : 'ASSIGN'}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          {filteredTickets.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>No production maintenance tickets yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Assignment Dialog */}
      <Dialog 
        open={!!assigningTicket} 
        onClose={() => setAssigningTicket(null)} 
        fullWidth maxWidth="xs"
        PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
      >
          <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>FLEET DISPATCH</DialogTitle>
          <DialogContent>
              <Typography variant="body2" sx={{ mb: 3, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                  Select an authorized specialist for Mission #{String(assigningTicket?.ticketId || '').substring(0,8).toUpperCase()}.
              </Typography>
              <List>
                {technicians.map(tech => (
                    <ListItem 
                      button 
                      key={tech.id} 
                      onClick={() => handleAssign(tech)}
                      sx={{ borderRadius: 2, mb: 1, bgcolor: 'rgba(255,255,255,0.02)', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}
                    >
                        <ListItemAvatar>
                            <Avatar sx={{ bgcolor: tech.onDuty ? alpha('#10B981', 0.1) : 'rgba(255,255,255,0.05)', color: tech.onDuty ? '#10B981' : 'rgba(255,255,255,0.2)' }}>
                                <Wrench size={18} />
                            </Avatar>
                        </ListItemAvatar>
                        <ListItemText 
                          primary={tech.displayName} 
                          secondary={tech.specialization || 'General Systems'} 
                          primaryTypographyProps={{ fontWeight: 900, color: '#FFF' }}
                          secondaryTypographyProps={{ color: 'rgba(255,255,255,0.4)' }}
                        />
                    </ListItem>
                ))}
              </List>
          </DialogContent>
          <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <Button onClick={() => setAssigningTicket(null)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>ABORT</Button>
          </DialogActions>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog 
        open={!!detailTicket} 
        onClose={() => setDetailTicket(null)} 
        fullWidth maxWidth="sm"
        PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
      >
          <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>MISSION LOG</DialogTitle>
          <DialogContent>
              {detailTicket && (
                  <Stack spacing={3} sx={{ mt: 1 }}>
                      {(() => {
                          const resolved = resolvePropertyLocation(detailTicket);
                          if (!resolved.hasExactCoordinates) {
                              return (
                                  <Alert severity="error" sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                      Exact GPS pin missing. Technician dispatch cannot be guaranteed.
                                  </Alert>
                              );
                          }
                          return null;
                      })()}
                      <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                          <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950 }}>DESCRIPTION</Typography>
                          <Typography variant="body1" sx={{ color: '#FFF', mt: 0.5 }}>{detailTicket.description}</Typography>
                      </Box>
                      
                      <Grid container spacing={2}>
                          <Grid item xs={6}>
                              <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                                  <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950 }}>ASSET</Typography>
                                  <Typography variant="body2" sx={{ color: '#FFF', mt: 0.5 }}>{detailTicket.propertyName || 'N/A'}</Typography>
                              </Box>
                          </Grid>
                          <Grid item xs={6}>
                              <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                                  <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950 }}>UNIT</Typography>
                                  <Typography variant="body2" sx={{ color: '#FFF', mt: 0.5 }}>{detailTicket.unitNumber || detailTicket.unit || 'N/A'}</Typography>
                              </Box>
                          </Grid>
                      </Grid>
                      
                      <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 2, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>FINANCIAL ESTIMATE (AED)</Typography>
                          <TextField
                              fullWidth
                              type="number"
                              variant="standard"
                              value={estimatedCost}
                              onChange={(e) => setEstimatedCost(e.target.value)}
                              InputProps={{ disableUnderline: true, style: { color: binThemeTokens.gold, fontSize: '1.5rem', fontWeight: 900 } }}
                          />
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', mt: 1, display: 'block' }}>
                              Values exceeding AED 1,000 trigger automated owner approval escalation.
                          </Typography>
                      </Box>

                      {detailTicket.revisionNotes && (
                          <Alert severity="warning" sx={{ bgcolor: alpha('#F59E0B', 0.1), color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>
                              <Typography variant="caption" fontWeight="950">OWNER REVISION REQUEST:</Typography>
                              <Typography variant="body2">{detailTicket.revisionNotes}</Typography>
                          </Alert>
                      )}
                  </Stack>
              )}
          </DialogContent>
          <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <Button onClick={() => setDetailTicket(null)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CLOSE</Button>
              <Button 
                variant="contained" 
                onClick={handleUpdateEstimate}
                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
              >
                  COMMIT ESTIMATE
              </Button>
          </DialogActions>
      </Dialog>
    </AdminPageFrame>
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
