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
        <Typography variant="h6" className="animate-pulse">SYNCHRONIZING TICKETS...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 900 }}>
        Institutional <Box component="span" sx={{ color: '#1976d2' }}>Tickets</Box> Management
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 3, mb: 4, borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Search Feed"
              placeholder="Ticket ID or Unit..."
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label="Status">
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="OPEN">Open</MenuItem>
                <MenuItem value="ASSIGNED">Assigned</MenuItem>
                <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                <MenuItem value="COMPLETED">Completed</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Priority</InputLabel>
              <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} label="Priority">
                <MenuItem value="">All Priorities</MenuItem>
                <MenuItem value="EMERGENCY">Emergency</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="LOW">Low</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Statistics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <StatCard label="Live Feed" value={tickets.length} color="textPrimary" />
        <StatCard label="Open" value={tickets.filter(t => t.status === 'OPEN').length} color="#ef4444" />
        <StatCard label="Active" value={tickets.filter(t => ['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(t.status)).length} color="#f59e0b" />
        <StatCard label="Resolved" value={tickets.filter(t => t.status === 'COMPLETED').length} color="#10b981" />
      </Grid>

      {/* Tickets Table */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Sovereign ID</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Unit</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Category</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Priority</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Res. Time</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTickets.map((ticket) => (
              <TableRow key={ticket.ticketId} hover sx={{ cursor: 'pointer' }}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 900, color: '#1e293b' }}>
                    #{ticket.ticketId.slice(0, 10).toUpperCase()}
                  </Typography>
                </TableCell>
                <TableCell sx={{ color: '#64748b' }}>{ticket.unit}</TableCell>
                <TableCell>{ticket.category}</TableCell>
                <TableCell>
                  <Chip label={ticket.status} color={getStatusColor(ticket.status) as any} size="small" sx={{ fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell>
                  <Chip label={ticket.priority} color={getPriorityColor(ticket.priority) as any} size="small" variant="outlined" sx={{ fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: '#1e293b', fontWeight: 'bold' }}>{getResponseTime(ticket.createdAt, ticket.completedAt)}</TableCell>
                <TableCell align="right" sx={{ color: '#64748b', fontSize: 12 }}>
                  {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleDateString() : 'N/A'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {filteredTickets.length === 0 && (
        <Paper sx={{ p: 10, textAlign: 'center', bgcolor: '#f8fafc' }}>
          <Typography color="textSecondary" sx={{ fontStyle: 'italic' }}>Zero incidents matching your filter criteria.</Typography>
        </Paper>
      )}
    </Container>
  );
}

const StatCard = ({ label, value, color }: any) => (
  <Grid item xs={12} sm={6} md={3}>
    <Paper sx={{ p: 3, textAlign: 'center', borderRadius: 4, border: '1px solid rgba(0,0,0,0.05)' }}>
      <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 'bold' }}>{label}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 900, color }}>{value}</Typography>
    </Paper>
  </Grid>
);
