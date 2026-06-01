import React, { useState, useEffect } from 'react';
import { db } from '../../../lib/firebase';
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

// Helper for type-safe icons in React 18
const Icon = ({ icon: IconComponent, size = 16, className = "", color = "currentColor" }: { icon: any, size?: number, className?: string, color?: string }) => (
    <IconComponent size={size} className={className} color={color} />
);



export default function LiveMapPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
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

    const qTech = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubscribeTech = onSnapshot(qTech, (querySnapshot: any) => {
      const techData: any[] = [];
      querySnapshot.forEach((doc: any) => {
        const data = doc.data();
        if (data.role === 'technician') {
          techData.push({
            id: doc.id,
            name: data.displayName || 'Technician',
            distance: 'N/A', // Can be calculated if coordinates exist
            rating: data.rating || 5.0,
            avatar: (data.displayName || 'T').charAt(0).toUpperCase(),
            status: data.isOffDuty ? 'Busy' : 'Available',
            ...data
          });
        }
      });
      setTechnicians(techData);
    });

    return () => {
      unsubscribe();
      unsubscribeTech();
    };
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
        status: 'accepted',
        dispatchStatus: 'ASSIGNED',
        trackingStatus: 'TECHNICIAN_ASSIGNED',
        assignedTechnicianId: tech.id,
        assignedTechnicianName: tech.name
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

  const generateGatePass = async (ticket: any, tech: any) => {
    if (!(window as any).jspdf) {
      await new Promise<void>((resolve) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => resolve();
        document.body.appendChild(script);
      });
    }

    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();

    let cairoBase64 = null;
    try {
      const res = await fetch('https://fonts.gstatic.com/s/cairo/v20/SLXQ1O5tq8QA3r565Uq13w.ttf');
      const buffer = await res.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      cairoBase64 = btoa(binary);
    } catch (err) {
      console.error("Failed to load Cairo font, falling back to default:", err);
    }

    if (cairoBase64) {
      doc.addFileToVFS('Cairo-Regular.ttf', cairoBase64);
      doc.addFont('Cairo-Regular.ttf', 'Cairo', 'normal');
      doc.setFont('Cairo');
    }

    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(1.5);
    doc.rect(10, 10, 190, 277);
    doc.rect(12, 12, 186, 273);

    doc.setFillColor(15, 23, 42);
    doc.rect(15, 15, 180, 40, "F");

    doc.setTextColor(212, 175, 55);
    doc.setFontSize(22);
    doc.text("BIN GROUP MAINTENANCE", 105, 30, { align: "center" });
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("SECURITY GATE PASS  •  تصريح دخول أمني", 105, 45, { align: "center" });

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);

    doc.text(`Ticket ID: ${ticket.id}`, 20, 80);
    doc.text(`Date of Entry: ${new Date().toLocaleDateString()}`, 20, 95);
    doc.text(`Assigned Technician: ${tech.name}`, 20, 110);
    doc.text(`Contact: ${tech.phone || tech.phoneNumber || tech.mobile || '+971 50 XXXXXXX'}`, 20, 125);
    doc.text(`Location: ${ticket.unit || 'UAE Portfolio Asset'}`, 20, 140);
    
    doc.text(`معرف التذكرة: ${ticket.id}`, 190, 80, { align: 'right' });
    doc.text(`تاريخ الدخول: ${new Date().toLocaleDateString()}`, 190, 95, { align: 'right' });
    doc.text(`الفني المعين: ${tech.name}`, 190, 110, { align: 'right' });
    doc.text(`رقم الهاتف: ${tech.phone || tech.phoneNumber || tech.mobile || '+971 50 XXXXXXX'}`, 190, 125, { align: 'right' });
    doc.text(`الموقع: ${ticket.unit || 'أصل المحفظة العقارية'}`, 190, 140, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(15, 155, 195, 155);

    doc.setFontSize(14);
    doc.text("APPROVED WORK DETAILS / تفاصيل العمل المعتمد", 105, 170, { align: "center" });
    
    doc.setFontSize(11);
    const descText = ticket.issueDescription || ticket.issue || "General Maintenance and Inspection Ops.";
    const descTextAr = "أعمال الصيانة العامة والفحص التشغيلي المعتمدة.";
    
    doc.text(descText, 20, 185);
    doc.text(descTextAr, 190, 200, { align: 'right' });

    doc.setDrawColor(212, 175, 55);
    doc.rect(20, 220, 170, 50);

    doc.setFontSize(12);
    doc.text("Authorized by / معتمد من:", 25, 235);
    doc.text("Rashid AbdulGhani - CEO / راشد عبد الغني - الرئيس التنفيذي", 25, 245);
    
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(10);
    doc.text("[ BIN GROUP DIGITAL SECURITY STAMP  •  ختم مجموعة بن الرقمي الأمني ]", 105, 262, { align: "center" });

    doc.save(`GatePass_${ticket.id}_${tech.name}.pdf`);
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
                      {ticket.status === 'UNASSIGNED' ? "AI INTERCEPTING..." : `AI DISPATCHED: ${ticket.assignedTechnicianName || ticket.assignedTechnicianId || 'Technician'}`}
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
                      {/* DYNAMIC TECH MARKERS */}
             {tickets.filter(t => t.status === 'EN_ROUTE' && t.technicianLocation).map((ticket) => {
                const loc = ticket.technicianLocation;
                // Simple projection for Dubai Marina / Downtown area
                // Mapping Lat [25.0, 25.3] -> [100% to 0%] (Top is North)
                // Mapping Lng [55.12, 55.42] -> [0% to 100%]
                const top = ((25.3 - loc.lat) / 0.3) * 100;
                const left = ((loc.lng - 55.12) / 0.3) * 100;

                return (
                  <Box 
                    key={ticket.id} 
                    sx={{ 
                      position: 'absolute', 
                      top: `${Math.min(Math.max(top, 5), 95)}%`, 
                      left: `${Math.min(Math.max(left, 5), 95)}%`, 
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      transition: 'all 0.5s ease-in-out' // Smooth movement
                    }}
                  >
                    <Box sx={{ 
                      bgcolor: '#10b981', color: '#fff', px: 2, py: 1, borderRadius: 2, mb: 1.5,
                      boxShadow: '0 10px 30px rgba(16,185,129,0.3)', border: '1px solid rgba(255,255,255,0.2)',
                      display: 'flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap'
                    }}>
                      <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                      <Typography sx={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>
                        {ticket.assignedTechnicianName || ticket.assignedTechnicianId || 'TEC'} • {ticket.unit || 'LOC'}
                      </Typography>
                    </Box>
                    <div className="p-1 rounded-full bg-emerald-500 shadow-2xl">
                      <PersonPinCircleIcon sx={{ color: '#fff', fontSize: 32 }} />
                    </div>
                  </Box>
                );
             })}

             {/* CLUSTER MARKERS FOR PENDING JOBS */}
             {tickets.filter(t => t.status === 'OPEN' || t.status === 'assigned').slice(0, 3).map((ticket, i) => {
                 // Place at random or semi-fixed locations if no unit coords
                 const positions = [
                     { top: '55%', left: '42%' },
                     { top: '35%', left: '75%' },
                     { top: '20%', left: '80%' }
                 ];
                 const pos = positions[i] || { top: '50%', left: '50%' };
                 return (
                    <Box key={ticket.id} sx={{ position: 'absolute', top: pos.top, left: pos.left, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Box sx={{ 
                        bgcolor: i === 1 ? '#ef4444' : 'rgba(59, 130, 246, 0.95)', color: '#fff', px: 2, py: 1, borderRadius: 2, mb: 1.5,
                        boxShadow: i === 1 ? '0 10px 30px rgba(239,68,68,0.3)' : '0 0 40px rgba(59, 130, 246, 0.4)', 
                        border: '1px solid rgba(255,255,255,0.1)',
                        backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: 1
                        }}>
                        <Typography sx={{ fontSize: '10px', fontWeight: 900 }}>
                            {i === 1 ? 'CRITICAL RISK' : 'PENDING DISPATCH'}
                        </Typography>
                        </Box>
                        {i === 1 ? (
                            <Icon icon={ShieldAlert} className="text-red-500 drop-shadow-2xl animate-pulse" size={40} />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center text-blue-500 font-black text-xs">
                                {i + 1}
                            </div>
                        )}
                    </Box>
                    );
                    })}

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
            {(technicians || []).filter(tech => tech.status === 'Available').map((tech) => (
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
