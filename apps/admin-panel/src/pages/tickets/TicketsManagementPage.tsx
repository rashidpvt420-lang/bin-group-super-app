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
} from '@mui/material';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { useLanguage } from '@bin/shared';

interface Ticket {
  ticketId: string;
  tenantId: string;
  unit: string;
  category: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED' | 'ASSIGNED' | 'EN_ROUTE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  assignedTechnician: string | null;
  createdAt: any;
  completedAt: any | null;
  emergencyCharge: number;
}

export default function TicketsManagementPage() {
  const { t, lang, isRTL } = useLanguage();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'maintenanceTickets'), orderBy('createdAt', 'desc'), limit(100));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
          const fetched = (snapshot.docs || []).map(doc => {
            const data = doc.data() || {};
            return {
              ticketId: doc.id,
              tenantId: data.tenantId || data.userId || '',
              unit: data.unit || data.unitId || 'N/A',
              category: data.trade || data.issueType || data.category || 'General',
              description: data.description || '',
              status: data.status || 'OPEN',
              priority: data.priority || 'MEDIUM',
              assignedTechnician: data.assignedTechnician || data.technicianAssigned || data.assignedTo || null,
              createdAt: data.createdAt || null,
              completedAt: data.completedAt || null,
              emergencyCharge: data.emergencyCharge || 0
            } as Ticket;
          });
          setTickets(fetched);
          setLoading(false);
      } catch (err) {
          console.error("[TICKETS] Mapping failure:", err);
          setLoading(false);
      }
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusColor = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'OPEN') return 'error';
    if (s === 'ASSIGNED' || s === 'EN_ROUTE' || s === 'IN_PROGRESS') return 'warning';
    if (s === 'COMPLETED') return 'success';
    if (s === 'DELAYED') return 'error';
    return 'default';
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
        ticket.category.toLowerCase().includes(searchTerm.toLowerCase());
    
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
      <Container sx={{ py: 10, textAlign: 'center' }}>
        <Typography variant="h6" className="animate-pulse">{t('tech.syncing')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
        {t('landing.about_overline')} <Box component="span" sx={{ color: '#1976d2' }}>{t('tech.tickets_mgt')}</Box>
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
                  <TableCell align={isRTL ? 'left' : 'right'} sx={{ fontWeight: 'bold' }}>{t('tech.table.created')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTickets.map((ticket: any) => (
                  <TableRow key={ticket.ticketId} hover sx={{ cursor: 'pointer', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
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
                      <Chip label={ticket.status} color={getStatusColor(ticket.status) as any} size="small" sx={{ fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Chip label={ticket.priority} color={getPriorityColor(ticket.priority) as any} size="small" variant="outlined" sx={{ fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ color: '#1e293b', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{getResponseTime(ticket.createdAt, ticket.completedAt)}</TableCell>
                    <TableCell align={isRTL ? 'left' : 'right'} sx={{ color: '#64748b', fontSize: 12 }}>
                      {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE') : 'N/A'}
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
