import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { registerArabicFont } from '../../../utils/arabicPdfFont';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Stack,
  Typography,
  Avatar,
  Checkbox,
  Alert,
} from '@mui/material';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Download,
  MapPin,
  Navigation,
  Radio,
  ShieldAlert,
  UserCheck,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  db,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from '../../../lib/firebase';
import { calculateDistanceKm, calculateEtaMinutes, getStaleLabel, isLocationStale, normalizeLocation } from '../../../utils/liveTracking';

const GOLD = '#DAA520';
const GREEN = '#10b981';
const RED = '#ef4444';
const BLUE = '#3b82f6';

const normalizeStatus = (value?: string | null) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const isUnassigned = (ticket: any) => {
  const status = normalizeStatus(ticket.status);
  const dispatch = normalizeStatus(ticket.dispatchStatus);
  return ['open', 'pending', 'pending_assignment', 'unassigned'].includes(status) || ['pending', 'unassigned'].includes(dispatch) || !ticket.assignedTechnicianId;
};

const isLiveTracking = (ticket: any) => {
  const status = normalizeStatus(ticket.status);
  const tracking = normalizeStatus(ticket.trackingStatus);
  const dispatch = normalizeStatus(ticket.dispatchStatus);
  return ['on_the_way', 'en_route', 'live_tracking'].includes(status) || ['live_tracking', 'en_route'].includes(tracking) || dispatch === 'en_route';
};

const getTicketLocation = (ticket: any) => normalizeLocation(ticket.jobLocation) || normalizeLocation(ticket.propertyLocation) || normalizeLocation(ticket.location) || null;
const getTechLocation = (ticket: any) => normalizeLocation(ticket.technicianLocation) || null;

function buildDirectionsUrl(ticket: any) {
  const job = getTicketLocation(ticket);
  const tech = getTechLocation(ticket);
  if (tech && job) return `https://www.google.com/maps/dir/?api=1&origin=${tech.lat},${tech.lng}&destination=${job.lat},${job.lng}&travelmode=driving`;
  if (job) return `https://www.google.com/maps/search/?api=1&query=${job.lat},${job.lng}`;
  return 'https://www.google.com/maps';
}

function ticketLabel(ticket: any) {
  return ticket.propertyName || ticket.unit || ticket.unitNumber || ticket.propertyId || 'UAE Portfolio Asset';
}

function generateGatePassPdf(ticket: any, tech: any) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        registerArabicFont(pdf);
  const safeTechName = tech.name || tech.displayName || 'Technician';
  const filename = `BIN_GROUP_GatePass_${ticket.id}_${safeTechName}`.replace(/[^a-zA-Z0-9._-]/g, '_');

  pdf.setProperties({
    title: `BIN GROUP Gate Pass ${ticket.id}`,
    subject: 'Maintenance technician access gate pass',
    author: 'BIN GROUP Super App',
    creator: 'BIN GROUP Admin Live Map',
  });

  pdf.setDrawColor(218, 165, 32);
  pdf.setLineWidth(1.2);
  pdf.rect(10, 10, 190, 277);
  pdf.setFillColor(15, 23, 42);
  pdf.rect(15, 15, 180, 34, 'F');

  pdf.setTextColor(218, 165, 32);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('BIN GROUP MAINTENANCE', 105, 29, { align: 'center' });
  pdf.setFontSize(11);
  pdf.text('SECURITY GATE PASS / تصريح دخول أمني', 105, 41, { align: 'center' });

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  const rows = [
    ['Ticket ID', ticket.id],
    ['Date of Entry', new Date().toLocaleDateString()],
    ['Assigned Technician', safeTechName],
    ['Technician Contact', tech.phone || tech.phoneNumber || tech.mobile || '+971'],
    ['Location', ticketLabel(ticket)],
    ['Issue', ticket.issueDescription || ticket.issue || ticket.category || 'General maintenance'],
    ['Dispatch Status', ticket.dispatchStatus || ticket.status || 'ASSIGNED'],
  ];

  let y = 68;
  rows.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${label}:`, 20, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(String(value || '-').slice(0, 90), 65, y);
    y += 11;
  });

  pdf.setDrawColor(226, 232, 240);
  pdf.line(20, y + 4, 190, y + 4);
  y += 18;
  pdf.setFont('helvetica', 'bold');
  pdf.text('APPROVED WORK DETAILS', 105, y, { align: 'center' });
  y += 12;
  pdf.setFont('helvetica', 'normal');
  const notes = pdf.splitTextToSize(ticket.issueDescription || ticket.description || 'Authorized maintenance attendance and inspection.', 160);
  pdf.text(notes, 25, y);

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(220, 38, 38);
  pdf.text('BIN GROUP DIGITAL SECURITY STAMP', 105, 262, { align: 'center' });
  pdf.save(`${filename}.pdf`);
}

export default function LiveMapPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [generatePass, setGeneratePass] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ticketsQuery = query(collection(db, 'maintenanceTickets'), orderBy('createdAt', 'desc'));
    const unsubTickets = onSnapshot(
      ticketsQuery,
      (snap) => {
        setTickets(snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            timestamp: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleTimeString() : 'Live',
          };
        }));
      },
      (err) => {
        console.error('[Admin LiveMap] ticket listener failed:', err);
        setError('Could not load maintenance tickets. Check Firestore rules/indexes.');
      },
    );

    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubUsers = onSnapshot(
      usersQuery,
      (snap) => {
        setTechnicians(snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u: any) => String(u.role || '').toLowerCase() === 'technician')
          .map((u: any) => ({
            ...u,
            name: u.displayName || u.fullName || u.name || u.email || 'Technician',
            status: u.isOffDuty ? 'Busy' : u.isTracking ? 'Tracking' : 'Available',
            avatar: String(u.displayName || u.fullName || u.email || 'T').charAt(0).toUpperCase(),
          })));
      },
      (err) => {
        console.error('[Admin LiveMap] technician listener failed:', err);
        setError('Could not load technicians. Check Firestore rules/indexes.');
      },
    );

    return () => {
      unsubTickets();
      unsubUsers();
    };
  }, []);

  const metrics = useMemo(() => {
    const live = tickets.filter(isLiveTracking).length;
    const unassigned = tickets.filter(isUnassigned).length;
    const available = technicians.filter((t) => t.status === 'Available').length;
    const stale = tickets.filter((t) => isLiveTracking(t) && isLocationStale(t.technicianLocation?.updatedAt || t.technicianLocationUpdatedAt)).length;
    return { live, unassigned, available, stale, total: tickets.length };
  }, [tickets, technicians]);

  const handleAssignClick = (ticket: any) => {
    setSelectedTicket(ticket);
    setDispatchDialogOpen(true);
  };

  const handleDispatch = async (tech: any) => {
    if (!selectedTicket) return;
    setDispatching(true);
    setError(null);
    try {
      await updateDoc(doc(db, 'maintenanceTickets', selectedTicket.id), {
        status: 'accepted',
        dispatchStatus: 'ASSIGNED',
        trackingStatus: 'TECHNICIAN_ASSIGNED',
        assignedTechnicianId: tech.id,
        assignedTechnicianName: tech.name,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (generatePass) generateGatePassPdf(selectedTicket, tech);
      setDispatchDialogOpen(false);
      setSelectedTicket(null);
    } catch (err) {
      console.error('[Admin LiveMap] dispatch failed:', err);
      setError('Dispatch failed. Check ticket write permissions and try again.');
    } finally {
      setDispatching(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#fff', p: { xs: 2, md: 4 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" sx={{ color: GOLD, fontWeight: 950, letterSpacing: 4 }}>BIN GROUP LIVE OPS</Typography>
          <Typography variant="h4" fontWeight="950">Technician Dispatch & GPS Command</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mt: 1, maxWidth: 900 }}>
            Real-time Firestore feed for tickets, technician assignment, live tracking state, stale GPS detection, gate pass generation, and Google Maps handoff.
          </Typography>
        </Box>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        <Grid container spacing={2}>
          {[
            ['Total Tickets', metrics.total, BLUE],
            ['Unassigned', metrics.unassigned, RED],
            ['Live GPS', metrics.live, GREEN],
            ['Available Techs', metrics.available, GOLD],
            ['Stale GPS', metrics.stale, RED],
          ].map(([label, value, color]) => (
            <Grid item xs={6} md={2.4} key={String(label)}>
              <Paper sx={{ p: 2.5, bgcolor: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 900 }}>{label}</Typography>
                <Typography variant="h5" fontWeight="950" sx={{ color: String(color) }}>{String(value)}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden' }}>
              <Box sx={{ p: 2.5, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Radio size={18} color={GREEN} />
                  <Typography fontWeight="950">Dispatch Feed</Typography>
                </Stack>
              </Box>
              <Stack spacing={1.2} sx={{ p: 2, maxHeight: 680, overflowY: 'auto' }}>
                {tickets.length === 0 && <Typography variant="body2" color="text.secondary">No tickets found.</Typography>}
                {tickets.map((ticket) => {
                  const live = isLiveTracking(ticket);
                  const open = isUnassigned(ticket);
                  const loc = getTechLocation(ticket);
                  const stale = live && isLocationStale(ticket.technicianLocation?.updatedAt || ticket.technicianLocationUpdatedAt);
                  return (
                    <Paper key={ticket.id} sx={{ p: 2, bgcolor: 'rgba(2,6,23,0.82)', border: `1px solid ${live ? 'rgba(16,185,129,0.25)' : open ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 3 }}>
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" spacing={1}>
                          <Chip size="small" icon={live ? <Wifi size={12} /> : open ? <Zap size={12} /> : <CheckCircle2 size={12} />} label={live ? 'LIVE GPS' : open ? 'NEEDS DISPATCH' : String(ticket.status || 'TRACKED').toUpperCase()} sx={{ bgcolor: live ? 'rgba(16,185,129,0.12)' : open ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)', color: live ? '#4ade80' : open ? '#f87171' : '#93c5fd', fontWeight: 950 }} />
                          <Typography variant="caption" color="text.secondary">{ticket.timestamp}</Typography>
                        </Stack>
                        <Typography fontWeight="950">{ticketLabel(ticket)}</Typography>
                        <Typography variant="caption" color="text.secondary">{ticket.issueDescription || ticket.issue || ticket.category || 'Maintenance request'}</Typography>
                        {live && <Typography variant="caption" sx={{ color: stale ? '#f87171' : '#4ade80' }}>{stale ? 'GPS stale' : 'GPS live'} · {loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'Location pending'} · {getStaleLabel(ticket.technicianLocation?.updatedAt || ticket.technicianLocationUpdatedAt)}</Typography>}
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          {open && <Button size="small" variant="contained" onClick={() => handleAssignClick(ticket)} sx={{ bgcolor: GOLD, color: '#000', fontWeight: 950 }}>Assign</Button>}
                          <Button size="small" variant="outlined" onClick={() => window.open(buildDirectionsUrl(ticket), '_blank', 'noopener,noreferrer')} sx={{ borderColor: 'rgba(255,255,255,0.16)', color: '#fff', fontWeight: 900 }}>Map</Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} md={8}>
            <Paper sx={{ minHeight: 680, position: 'relative', overflow: 'hidden', bgcolor: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
              <Box sx={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)', backgroundSize: '42px 42px' }} />
              <Box sx={{ position: 'relative', zIndex: 1, p: 3 }}>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                  <Chip icon={<Activity size={14} />} label="Firestore Live" sx={{ bgcolor: 'rgba(16,185,129,0.12)', color: '#4ade80', fontWeight: 950 }} />
                  <Chip icon={<Brain size={14} />} label="Dispatch Status Synced" sx={{ bgcolor: 'rgba(218,165,32,0.12)', color: GOLD, fontWeight: 950 }} />
                  <Chip icon={<ShieldAlert size={14} />} label="Stale GPS Detection" sx={{ bgcolor: 'rgba(239,68,68,0.12)', color: '#f87171', fontWeight: 950 }} />
                </Stack>
              </Box>

              <Box sx={{ position: 'relative', zIndex: 1, height: 560 }}>
                {tickets.filter((t) => isLiveTracking(t) || isUnassigned(t)).slice(0, 12).map((ticket, idx) => {
                  const live = isLiveTracking(ticket);
                  const techLoc = getTechLocation(ticket);
                  const jobLoc = getTicketLocation(ticket);
                  const distance = calculateDistanceKm(techLoc, jobLoc);
                  const eta = calculateEtaMinutes(distance);
                  const fallbackPositions = [
                    { top: 18, left: 20 }, { top: 35, left: 72 }, { top: 58, left: 42 }, { top: 72, left: 78 },
                    { top: 28, left: 52 }, { top: 46, left: 26 }, { top: 68, left: 18 }, { top: 16, left: 82 },
                    { top: 80, left: 55 }, { top: 52, left: 86 }, { top: 38, left: 38 }, { top: 64, left: 65 },
                  ];
                  const pos = fallbackPositions[idx] || { top: 50, left: 50 };
                  return (
                    <Box key={ticket.id} sx={{ position: 'absolute', top: `${pos.top}%`, left: `${pos.left}%`, transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                      <Paper sx={{ px: 1.5, py: 1, bgcolor: live ? 'rgba(16,185,129,0.92)' : 'rgba(59,130,246,0.9)', color: '#fff', borderRadius: 2, mb: 1, whiteSpace: 'nowrap', boxShadow: live ? '0 0 30px rgba(16,185,129,0.35)' : '0 0 30px rgba(59,130,246,0.35)' }}>
                        <Typography variant="caption" fontWeight="950">{live ? 'LIVE' : 'PENDING'} · {ticketLabel(ticket)}</Typography>
                        {eta && <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>ETA ~{eta} min</Typography>}
                      </Paper>
                      <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: live ? GREEN : BLUE, display: 'grid', placeItems: 'center', mx: 'auto', border: '3px solid rgba(255,255,255,0.5)' }}>
                        {live ? <Navigation size={24} color="#fff" /> : <MapPin size={24} color="#fff" />}
                      </Box>
                    </Box>
                  );
                })}
              </Box>

              <Paper sx={{ position: 'absolute', left: 24, right: 24, bottom: 24, p: 2, bgcolor: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-around">
                  <Stack direction="row" spacing={1.2} alignItems="center"><Wifi size={18} color={GREEN} /><Typography variant="caption" fontWeight="950">LIVE = technician pressed ON THE WAY</Typography></Stack>
                  <Stack direction="row" spacing={1.2} alignItems="center"><WifiOff size={18} color={RED} /><Typography variant="caption" fontWeight="950">STALE = no update for 2+ minutes</Typography></Stack>
                  <Stack direction="row" spacing={1.2} alignItems="center"><Download size={18} color={GOLD} /><Typography variant="caption" fontWeight="950">Gate pass PDF on assignment</Typography></Stack>
                </Stack>
              </Paper>
            </Paper>
          </Grid>
        </Grid>
      </Stack>

      <Dialog open={dispatchDialogOpen} onClose={() => setDispatchDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#0f172a', color: '#fff', borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 950 }}>Assign Technician</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">Ticket: {selectedTicket ? ticketLabel(selectedTicket) : '-'}</Typography>
            <FormControlLabel control={<Checkbox checked={generatePass} onChange={(e) => setGeneratePass(e.target.checked)} sx={{ color: GOLD, '&.Mui-checked': { color: GOLD } }} />} label="Generate gate pass PDF" />
            {dispatching && <LinearProgress sx={{ '& .MuiLinearProgress-bar': { bgcolor: GOLD } }} />}
            <List>
              {technicians.length === 0 && <Typography variant="body2" color="text.secondary">No technicians found.</Typography>}
              {technicians.map((tech) => (
                <ListItem key={tech.id} secondaryAction={<Button disabled={dispatching || tech.status === 'Busy'} onClick={() => handleDispatch(tech)} variant="contained" sx={{ bgcolor: GOLD, color: '#000', fontWeight: 950 }}>Assign</Button>} sx={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, mb: 1 }}>
                  <ListItemAvatar><Avatar sx={{ bgcolor: tech.status === 'Tracking' ? GREEN : GOLD, color: '#000', fontWeight: 950 }}>{tech.avatar}</Avatar></ListItemAvatar>
                  <ListItemText primary={<Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight="950">{tech.name}</Typography>{tech.status === 'Tracking' && <UserCheck size={14} color={GREEN} />}</Stack>} secondary={<Typography variant="caption" color="text.secondary">{tech.status} · {tech.phone || tech.email || 'No contact'}</Typography>} />
                </ListItem>
              ))}
            </List>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
