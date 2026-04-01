import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { 
  Brain, 
  Activity, 
  Radio, 
  Zap, 
  ShieldAlert, 
  Layers, 
  Cpu,
  Waves
} from 'lucide-react';

import { 
  Box, 
  Grid, 
  Paper, 
  Typography, 
  Button, 
  IconButton, 
  Avatar, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  List, 
  ListItem, 
  ListItemAvatar, 
  ListItemText, 
  FormControlLabel, 
  Checkbox,
  LinearProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PersonPinCircleIcon from '@mui/icons-material/PersonPinCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocationOnIcon from '@mui/icons-material/LocationOn';

// Helper for type-safe icons in React 18
const Icon = ({ icon: IconComponent, size = 16, className = "", color = "currentColor" }: { icon: any, size?: number, className?: string, color?: string }) => (
    <IconComponent size={size} className={className} color={color} />
);

const MOCK_TECHNICIANS = [
  { id: 'TECH-01', name: 'Omar', distance: '2km', rating: 4.9, avatar: 'O', status: 'Available' },
  { id: 'TECH-02', name: 'Ahmed', distance: '5km', rating: 4.7, avatar: 'A', status: 'Available' },
  { id: 'TECH-03', name: 'Sajid', distance: '8km', rating: 4.8, avatar: 'S', status: 'Busy' },
];

export default function LiveMapPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [generatePass, setGeneratePass] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "maintenanceTickets"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot: any) => {
      const ticketData: any[] = [];
      querySnapshot.forEach((doc: any) => {
        const data = doc.data();
        ticketData.push({
          id: doc.id,
          ...data,
          // Format timestamp for UI (simplified)
          timestamp: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleTimeString() : 'Just now'
        });
      });
      setTickets(ticketData);
    });

    return () => unsubscribe();
  }, []);

  const handleAssignClick = (ticket: any) => {
    setSelectedTicket(ticket);
    setDispatchDialogOpen(true);
  };

  const handleDispatch = (tech: any) => {
    // 1. Update the actual ticket in Firestore to DISPATCHED
    if (selectedTicket) {
      const ticketRef = doc(db, "maintenanceTickets", selectedTicket.id);
      updateDoc(ticketRef, {
        status: 'DISPATCHED',
        assignedTechId: tech.id,
        assignedTechnician: tech.name
      });

      // --- 3. Mock Automated SMS/Push Triggers ---
      // Fire a browser notification to alert the Technician
      if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
          if (permission === "granted") {
            new Notification("BIN Group Server", {
              body: `Auto-SMS Triggered: Technician ${tech.name} has been dispatched to ${selectedTicket.unit}.`
            });
          }
        });
      }
    }

    setDispatchDialogOpen(false);

    if (generatePass && selectedTicket) {
      generateGatePass(selectedTicket, tech);
    }
  };

  const generateGatePass = (ticket: any, tech: any) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => {
      const { jsPDF } = (window as any).jspdf;
      const doc = new jsPDF();

      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text("BIN GROUP MAINTENANCE", 105, 20, { align: "center" });

      doc.setFontSize(16);
      doc.setTextColor(16, 185, 129); // emerald-500
      doc.text("Security Gate Pass", 105, 30, { align: "center" });

      // Body Details
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Ticket ID: ${ticket.id}`, 20, 50);
      doc.text(`Date of Entry: ${new Date().toLocaleDateString()}`, 20, 60);

      doc.setFont("helvetica", "bold");
      doc.text(`Assigned Technician: ${tech.name}`, 20, 80);
      doc.setFont("helvetica", "normal");
      doc.text(`Contact: +971 50 XXXXXXX`, 20, 90);

      doc.text(`Location: ${ticket.unit}`, 20, 110);
      doc.text(`Approved Issue: ${ticket.issueDescription || ticket.issue}`, 20, 120);

      // Signature/Stamp
      doc.setFont("helvetica", "italic");
      doc.text("Authorized by:", 20, 150);
      doc.setFont("helvetica", "bold");
      doc.text("Rashid AbdulGhani - CEO", 20, 160);
      doc.setTextColor(220, 38, 38); // red-600
      doc.text("[ BIN GROUP DIGITAL STAMP ]", 20, 175);

      doc.save(`GatePass_${ticket.id}_${tech.name}.pdf`);
    };
    document.body.appendChild(script);
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#020617', overflow: 'hidden' }}>
      
      {/* 🟢 TOP HEADER: REAL-TIME PORTFOLIO STATS */}
      <Box sx={{ 
        height: 80, borderBottom: '1px solid rgba(255,255,255,0.05)', 
        display: 'flex', alignItems: 'center', px: 4, justifyContent: 'space-between',
        background: 'linear-gradient(to right, #020617, #0f172a)' 
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
             <Icon icon={Cpu} className="text-emerald-500 animate-pulse" size={24} />
          </div>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: -1 }}>
              BIN-GROUP <Box component="span" sx={{ color: '#10b981' }}>MISSION CONTROL</Box>
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 'bold' }}>VERSION 3.0 • DUBAI-HQ PORTFOLIO</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 6 }}>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 'bold', display: 'block' }}>DAILY AI SAVINGS</Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, color: '#10b981' }}>AED 42,880.00</Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 'bold', display: 'block' }}>AUTONOMOUS DISPATCHES</Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, color: '#3b82f6' }}>142 <Box component="span" sx={{ fontSize: 10, color: '#64748b' }}>TIC/24H</Box></Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 'bold', display: 'block' }}>FORENSIC SYNC UPTIME</Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, color: '#fff' }}>99.99%</Typography>
          </Box>
        </Box>
      </Box>

      {/* Split Screen Container */}
      <Grid container sx={{ flexGrow: 1, overflow: 'hidden' }}>

        {/* Left Panel: AI Dispatch Feed */}
        <Grid item xs={12} md={4} sx={{
          borderRight: '1px solid rgba(255,255,255,0.05)',
          height: '100%',
          overflowY: 'auto',
          p: 0,
          bgcolor: '#020617'
        }}>
          <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, bgcolor: '#020617', zIndex: 10 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Icon icon={Radio} className="text-emerald-500 animate-ping" size={16} />
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#fff', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                AI Autonomous <Box component="span" sx={{ color: '#10b981' }}>Dispatch Feed</Box>
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: '#64748b' }}>Streaming live telemetry from Dubai Residential Clusters...</Typography>
          </Box>

          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {(tickets || []).map((ticket) => (
              <Box
                key={ticket.id}
                sx={{
                  p: 2,
                  bgcolor: '#0f172a80',
                  border: '1px solid rgba(255,255,255,0.03)',
                  borderRadius: 3,
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'background 0.2s',
                  '&:hover': { bgcolor: '#0f172a' }
                }}
              >
                {/* AI Progress Bar (Simulation) */}
                <LinearProgress 
                  variant="determinate" 
                  value={ticket.status === 'UNASSIGNED' ? 45 : 100} 
                  sx={{ 
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    bgcolor: 'transparent',
                    '& .MuiLinearProgress-bar': { bgcolor: ticket.status === 'UNASSIGNED' ? '#3b82f6' : '#10b981' }
                  }} 
                />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <div className="bg-slate-800 p-1.5 rounded-lg">
                       {ticket.status === 'UNASSIGNED' ? <Icon icon={Zap} className="text-blue-400" size={12} /> : <Icon icon={Brain} className="text-emerald-500" size={12} />}
                    </div>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 'black' }}>
                      {ticket.status === 'UNASSIGNED' ? "AI INTERCEPTING..." : `AI DISPATCHED: ${ticket.assignedTechId}`}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: '#334155', fontWeight: 'bold' }}>{ticket.timestamp}</Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <Box>
                      <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 900, lineHeight: 1.2 }}>{ticket.unit}</Typography>
                      <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', mt: 0.5 }}>{ticket.issueDescription || ticket.issue}</Typography>
                   </Box>
                   {ticket.status === 'UNASSIGNED' && (
                     <Button 
                       size="small" 
                       onClick={() => handleAssignClick(ticket)}
                       sx={{ bgcolor: '#fff', color: '#000', borderRadius: '8px', fontSize: '9px', fontWeight: 900, '&:hover': { bgcolor: '#cbd5e1' } }}>
                        MANUAL OVERRIDE
                     </Button>
                   )}
                </Box>
              </Box>
            ))}
          </Box>
        </Grid>

        {/* Right Panel: Live Map & Risk Profile */}
        <Grid item xs={12} md={8} sx={{ height: '100%', position: 'relative', bgcolor: '#020617' }}>
          {/* Map Controls Floating Header */}
          <Box sx={{ position: 'absolute', top: 24, left: 24, right: 24, zIndex: 100, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
             <Paper sx={{ p: 1, display: 'flex', gap: 1, bgcolor: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3 }}>
                <Button startIcon={<Icon icon={Layers} size={16}/>} sx={{ color: '#fff', textTransform: 'none', fontWeight: 900 }}>Portfolio Risk Heatmap</Button>
                <Button startIcon={<Icon icon={Activity} size={16} />} sx={{ color: '#64748b', textTransform: 'none' }}>Tech Locations</Button>
                <Button startIcon={<Icon icon={Waves} size={16} />} sx={{ color: '#64748b', textTransform: 'none' }}>Unit Telemetry</Button>
             </Paper>

             <Paper sx={{ p: 1, display: 'flex', gap: 1, bgcolor: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3 }}>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 'black', alignSelf: 'center', ml: 1, mr: 1 }}>VERTICAL DEPTH:</Typography>
                <Button size="small" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1.5, fontSize: 10, fontWeight: 900 }}>ALL</Button>
                <Button size="small" sx={{ color: '#94a3b8', fontSize: 10 }}>F1-40</Button>
                <Button size="small" sx={{ color: '#94a3b8', fontSize: 10 }}>F41-80</Button>
                <Button size="small" sx={{ color: '#10b981', fontSize: 10, fontWeight: 900 }}>MEGA (120+)</Button>
             </Paper>

             <Paper sx={{ px: 2, py: 1, ml: 'auto', bgcolor: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                   <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                   <Typography variant="caption" sx={{ color: '#fff', fontWeight: 'bold' }}>SLA HEALTH: 98.4%</Typography>
                </Box>
                <Box sx={{ width: 1, height: 20, bgcolor: 'rgba(255,255,255,0.1)' }} />
                <Typography variant="caption" sx={{ color: '#64748b' }}>LIVE CLUSTER: MARINA BRIDGES</Typography>
             </Paper>
          </Box>

          {/* Map Overlay Canvas */}
          <Box sx={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.02) 1px, transparent 0)`,
            backgroundSize: '40px 40px',
            '&::after': {
              content: '""',
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 50% 50%, transparent 20%, #020617 100%)'
            }
          }} />

          {/* Map Pins & Telemetry Labels */}
          <Box sx={{ position: 'relative', zIndex: 1, height: '100%', pointerEvents: 'none' }}>
            
             {/* TECH 1: OMAR */}
             <Box sx={{ position: 'absolute', top: '25%', left: '20%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box sx={{ 
                  bgcolor: '#10b981', color: '#fff', px: 2, py: 1, borderRadius: 2, mb: 1.5,
                  boxShadow: '0 10px 30px rgba(16,185,129,0.3)', border: '1px solid rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', gap: 1
                }}>
                  <Icon icon={Zap} size={12} />
                  <Typography sx={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>OMAR (SYNCING FORENSIC DATA)</Typography>
                </Box>
                <div className="p-1 rounded-full bg-emerald-500 shadow-2xl animate-bounce">
                  <PersonPinCircleIcon sx={{ color: '#fff', fontSize: 32 }} />
                </div>
             </Box>

             {/* CLUSTER MARKER: MARINA HEIGHTS (8 ACTIVE JOBS) */}
             <Box sx={{ position: 'absolute', top: '55%', left: '42%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box sx={{ 
                  bgcolor: 'rgba(59, 130, 246, 0.95)', color: '#fff', px: 2, py: 1, borderRadius: 2, mb: 1,
                  boxShadow: '0 0 40px rgba(59, 130, 246, 0.4)', border: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: 1
                }}>
                  <Typography sx={{ fontSize: '11px', fontWeight: 900 }}>TOWER CLUSTER: 8 ACTIVE TIC</Typography>
                </Box>
                <Box sx={{ 
                  w: 48, h: 48, borderRadius: '50%', border: '4px solid rgba(59, 130, 246, 0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: 'rgba(37, 99, 235, 0.2)', color: '#60a5fa', fontWeight: 'black', fontSize: '20px',
                  animation: 'pulse 2s infinite'
                }}>
                   8
                </Box>
                <Typography sx={{ color: '#64748b', fontSize: 9, mt: 1, fontWeight: 'bold' }}>MARINA HEIGHTS TOWER</Typography>
             </Box>

             {/* EMERGENCY CLUSTER */}
             <Box sx={{ position: 'absolute', top: '35%', left: '75%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box sx={{ 
                  bgcolor: '#ef4444', color: '#fff', px: 2, py: 1, borderRadius: 2, mb: 1.5,
                  boxShadow: '0 10px 30px rgba(239,68,68,0.3)', border: '1px solid rgba(255,255,255,0.2)',
                }}>
                  <Typography sx={{ fontSize: '10px', fontWeight: 900 }}>CRITICAL RISK: AC FAILURE</Typography>
                </Box>
                <Icon icon={ShieldAlert} className="text-red-500 drop-shadow-2xl" size={48} />
             </Box>

             {/* PREDICTIVE MARKER */}
             <Box sx={{ position: 'absolute', top: '20%', left: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.6 }}>
                <div className="bg-slate-800 p-2 rounded-xl mb-1 border border-slate-700">
                  <Typography sx={{ fontSize: '8px', fontWeight: 'bold', color: '#94a3b8' }}>PREDICTED FAILURE IN 48H</Typography>
                </div>
                <LocationOnIcon sx={{ color: '#f59e0b', fontSize: 24 }} />
             </Box>

          </Box>

          {/* Dynamic Map Indicators */}
          <Paper sx={{
            position: 'absolute', bottom: 32, left: 32, right: 32, p: 2.5,
            bgcolor: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(30px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
            display: 'flex', justifyContent: 'space-around', alignItems: 'center'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
               <div className="bg-emerald-500 w-3 h-3 rounded-full shadow-[0_0_10px_#10b981]" />
               <Box>
                  <Typography variant="caption" sx={{ color: '#fff', fontWeight: 'black', display: 'block', lineHeight: 1 }}>AUTO-DISPATCH ACTIVE</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: 9 }}>AI identifying and routing faults</Typography>
               </Box>
            </Box>
            <div className="w-[1px] h-8 bg-slate-800" />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
               <div className="bg-blue-500 w-3 h-3 rounded-full shadow-[0_0_10px_#3b82f6]" />
               <Box>
                  <Typography variant="caption" sx={{ color: '#fff', fontWeight: 'black', display: 'block', lineHeight: 1 }}>FORENSIC SYNC PENDING</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: 9 }}>Specialists uploading offline data</Typography>
               </Box>
            </Box>
            <div className="w-[1px] h-8 bg-slate-800" />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
               <div className="bg-red-500 w-3 h-3 rounded-full shadow-[0_0_10px_#ef4444]" />
               <Box>
                  <Typography variant="caption" sx={{ color: '#fff', fontWeight: 'black', display: 'block', lineHeight: 1 }}>SLA VIOLATION RISK</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: 9 }}>Response time exceeds 30m target</Typography>
               </Box>
            </Box>
          </Paper>

        </Grid>
      </Grid>

      {/* Dispatch Modal */}
      <Dialog
        open={dispatchDialogOpen}
        onClose={() => setDispatchDialogOpen(false)}
        PaperProps={{
          sx: { bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, minWidth: 400 }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={900}>DISPATCH TECHNICIAN</Typography>
          <IconButton onClick={() => setDispatchDialogOpen(false)} sx={{ color: '#64748b' }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 3, p: 2, bgcolor: '#020617', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Selected Ticket</Typography>
            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>{selectedTicket?.unit} - {selectedTicket?.issue}</Typography>
          </Box>

          <Box sx={{ mb: 3, p: 2, bgcolor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 2 }}>
            <FormControlLabel
              control={<Checkbox checked={generatePass} onChange={(e) => setGeneratePass(e.target.checked)} sx={{ color: '#10b981', '&.Mui-checked': { color: '#10b981' } }} />}
              label={<Typography sx={{ fontWeight: 'bold', color: '#10b981' }}>Generate Security Gate Pass PDF</Typography>}
            />
            <Typography variant="caption" sx={{ display: 'block', pl: 4, color: '#64748b' }}>Automatically generates a stamped PDF for immediate WhatsApp delivery to Tenant/Security.</Typography>
          </Box>

          <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 900, mb: 1, display: 'block' }}>Available Near Property</Typography>
          <List>
            {(MOCK_TECHNICIANS || []).filter(tech => tech.status === 'Available').map((tech) => (
              <ListItem
                key={tech.id}
                sx={{
                  mb: 1, bgcolor: '#020617', borderRadius: 3,
                  '&:hover': { bgcolor: '#1e293b' },
                  cursor: 'pointer'
                }}
                onClick={() => handleDispatch(tech)}
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: '#3b82f6', fontWeight: 'bold' }}>{tech.avatar}</Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={tech.name}
                  secondary={
                    <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AccessTimeIcon sx={{ fontSize: 12, color: '#10b981' }} />
                        <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 'bold' }}>{tech.distance}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>Rating: {tech.rating}</Typography>
                      </Box>
                    </Box>
                  }
                />
                <Button size="small" variant="outlined" sx={{ borderRadius: 2, textTransform: 'none' }}>Dispatch</Button>
              </ListItem>
            ))}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
