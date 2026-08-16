import React, { useEffect, useState } from "react";
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Chip,
  Avatar,
  IconButton,
  Stack,
  Tooltip,
} from "@mui/material";
import {
  DirectionsCar as VehicleIcon,
  Mic as VoiceIcon,
  CheckCircle as CheckIcon,
  LocationOn as LocationIcon,
} from "@mui/icons-material";
import {
  db,
  auth,
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
  limit,
} from "../../lib/firebase";
import ContextQuickActionsFab from "./ContextQuickActionsFab";
import StaffVoicePaperworkDialog from "./StaffVoicePaperworkDialog";
import FinishShiftChecklistModal from "./FinishShiftChecklistModal";
import UnifiedRequestStatusTracker, { type RequestStep } from "./UnifiedRequestStatusTracker";
import ActionableNotificationCard from "./ActionableNotificationCard";

interface StaffTodayDashboardProps {
  userName?: string;
  role?: string;
  isRtl?: boolean;
}

export const StaffTodayDashboard: React.FC<StaffTodayDashboardProps> = ({
  userName: fallbackName,
  role: fallbackRole,
  isRtl = false,
}) => {
  const currentUid = auth.currentUser?.uid;

  // Real Authenticated Live States
  const [profile, setProfile] = useState<{ displayName: string; role: string; email: string } | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [activeVehicle, setActiveVehicle] = useState<{ id: string; plate: string; fuelLevel: string; status: string } | null>(null);
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [pendingTrackers, setPendingTrackers] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Dialog States
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [finishShiftOpen, setFinishShiftOpen] = useState(false);

  // 1. Subscribe to Live User Profile
  useEffect(() => {
    if (!currentUid) return;
    const unsub = onSnapshot(doc(db, "users", currentUid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProfile({
          displayName: data.displayName || data.email || fallbackName || "Staff Member",
          role: data.trade || data.role || fallbackRole || "Staff",
          email: data.email || "",
        });
      }
    }, (err) => console.warn("[StaffTodayDashboard] Profile sync warning:", err));
    return () => unsub();
  }, [currentUid, fallbackName, fallbackRole]);

  // 2. Subscribe to Active Shift
  useEffect(() => {
    if (!currentUid) return;
    const todayStr = new Date().toISOString().split("T")[0];
    const unsub = onSnapshot(doc(db, "staff_shifts", `SHIFT_${currentUid}_${todayStr}`), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setActiveShift(data);
        setClockedIn(data.status === "ACTIVE");
      } else {
        setActiveShift(null);
        setClockedIn(false);
      }
    }, (err) => console.warn("[StaffTodayDashboard] Shift sync warning:", err));
    return () => unsub();
  }, [currentUid]);

  // 3. Subscribe to Active Vehicle Custody
  useEffect(() => {
    if (!currentUid) return;
    const q = query(collection(db, "vehicles"), where("assignedStaffUid", "==", currentUid), limit(1));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const docData = snap.docs[0].data();
        setActiveVehicle({
          id: snap.docs[0].id,
          plate: docData.plateNumber || docData.plate || "REG-UAE",
          fuelLevel: docData.fuelLevel ? `${docData.fuelLevel}%` : "80%",
          status: docData.status || "ASSIGNED",
        });
      } else {
        setActiveVehicle(null);
      }
    }, (err) => console.warn("[StaffTodayDashboard] Vehicle sync warning:", err));
    return () => unsub();
  }, [currentUid]);

  // 4. Subscribe to Active Maintenance Job / Work Order
  useEffect(() => {
    if (!currentUid) return;
    const q = query(
      collection(db, "maintenanceTickets"),
      where("assignedTechnicianId", "==", currentUid),
      where("status", "in", ["assigned", "on_the_way", "arrived", "in_progress", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"]),
      limit(1)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const docData = snap.docs[0].data();
        setActiveJob({
          id: snap.docs[0].id,
          title: `${docData.propertyName || docData.unitNumber || "Property"} — ${docData.category || docData.issueType || "Maintenance"}`,
          location: docData.address || docData.propertyName || "Dubai, UAE",
          priority: docData.priority ? String(docData.priority).toUpperCase() : "STANDARD",
          status: docData.status || "IN_PROGRESS",
          slaDeadline: docData.slaDeadline || "Standard Policy",
        });
      } else {
        setActiveJob(null);
      }
    }, (err) => console.warn("[StaffTodayDashboard] Job sync warning:", err));
    return () => unsub();
  }, [currentUid]);

  // 5. Subscribe to Pending Request Trackers
  useEffect(() => {
    if (!currentUid) return;
    const q = query(
      collection(db, "staff_request_trackers"),
      where("staffId", "==", currentUid),
      limit(3)
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPendingTrackers(rows);
    }, (err) => console.warn("[StaffTodayDashboard] Trackers sync warning:", err));
    return () => unsub();
  }, [currentUid]);

  const displayName = profile?.displayName || fallbackName || "Staff Member";
  const displayRole = profile?.role || fallbackRole || "Field Staff";

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0f172a", color: "#f8fafc", pb: 10 }}>
      {/* Header Banner */}
      <Box sx={{ bgGradient: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", borderBottom: "1px solid #334155", py: 3, px: 2 }}>
        <Container maxWidth="md">
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar sx={{ width: 56, height: 56, bgcolor: "#3b82f6", fontWeight: "bold", fontSize: "1.2rem" }}>
                {displayName.charAt(0)}
              </Avatar>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "#ffffff" }}>
                    {displayName}
                  </Typography>
                  <Chip
                    label={clockedIn ? "ON DUTY" : "OFF DUTY"}
                    color={clockedIn ? "success" : "default"}
                    size="small"
                    sx={{ fontWeight: 700, fontSize: "0.7rem" }}
                  />
                </Stack>
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  {displayRole} • Shift: {activeShift?.shiftTime || "08:00 AM – 05:00 PM"}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button
                variant={clockedIn ? "outlined" : "contained"}
                color={clockedIn ? "warning" : "success"}
                onClick={() => setClockedIn(!clockedIn)}
                sx={{ borderRadius: 2, fontWeight: 700 }}
              >
                {clockedIn ? "Clock Out" : "Clock In"}
              </Button>
              <Button
                variant="contained"
                color="secondary"
                onClick={() => setFinishShiftOpen(true)}
                sx={{ borderRadius: 2, fontWeight: 700, bgcolor: "#8b5cf6", "&:hover": { bgcolor: "#7c3aed" } }}
              >
                Finish Shift
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ mt: 3 }}>
        <Grid container spacing={2}>
          {/* Active Job Card */}
          <Grid item xs={12}>
            <Card sx={{ bgcolor: "#1e293b", border: "1px solid #3b82f6", borderRadius: 3, boxShadow: "0 10px 25px rgba(59, 130, 246, 0.15)" }}>
              <CardContent sx={{ p: 3 }}>
                {activeJob ? (
                  <>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                          <Chip label="ACTIVE DISPATCH" color="primary" size="small" sx={{ fontWeight: 800 }} />
                          <Chip label={activeJob.priority} color={activeJob.priority === "EMERGENCY" ? "error" : "info"} size="small" sx={{ fontWeight: 700 }} />
                        </Stack>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: "#ffffff", mb: 0.5 }}>
                          {activeJob.title}
                        </Typography>
                        <Typography variant="body2" sx={{ color: "#94a3b8", display: "flex", alignItems: "center", gap: 0.5 }}>
                          <LocationIcon fontSize="small" sx={{ color: "#38bdf8" }} /> {activeJob.location}
                        </Typography>
                      </Box>
                      <Tooltip title="Voice / Natural Text Job Report">
                        <IconButton
                          onClick={() => setVoiceDialogOpen(true)}
                          sx={{ bgcolor: "#3b82f6", color: "#fff", "&:hover": { bgcolor: "#2563eb" }, width: 48, height: 48 }}
                        >
                          <VoiceIcon />
                        </IconButton>
                      </Tooltip>
                    </Stack>

                    <Box sx={{ mt: 2, p: 2, bgcolor: "#0f172a", borderRadius: 2, border: "1px solid #334155" }}>
                      <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                        SLA Policy: <strong style={{ color: "#ef4444" }}>{activeJob.slaDeadline}</strong>
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1.5} sx={{ mt: 2.5 }}>
                      <Button
                        fullWidth
                        variant="contained"
                        color="success"
                        onClick={() => setVoiceDialogOpen(true)}
                        startIcon={<CheckIcon />}
                        sx={{ py: 1.2, fontWeight: 700, borderRadius: 2, bgcolor: "#22c55e", "&:hover": { bgcolor: "#16a34a" } }}
                      >
                        Complete Job (Voice / Text AI)
                      </Button>
                    </Stack>
                  </>
                ) : (
                  <Box sx={{ py: 2, textAlign: "center" }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "#fff", mb: 1 }}>
                      No Active Job Dispatched
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                      Keep duty status active. New maintenance dispatches will appear here automatically.
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Vehicle Custody Card */}
          <Grid item xs={12} sm={6}>
            <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155", borderRadius: 3 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar sx={{ bgcolor: "#0284c7" }}>
                      <VehicleIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#fff" }}>
                        {activeVehicle ? `${activeVehicle.id} (${activeVehicle.plate})` : "No Vehicle Assigned"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                        {activeVehicle ? `Custody Active • Fuel ${activeVehicle.fuelLevel}` : "Contact Fleet Manager to assign vehicle"}
                      </Typography>
                    </Box>
                  </Stack>
                  <Chip label={activeVehicle ? "ASSIGNED" : "UNASSIGNED"} color={activeVehicle ? "success" : "default"} size="small" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Overtime Status Card */}
          <Grid item xs={12} sm={6}>
            <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155", borderRadius: 3 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#fff" }}>
                      Overtime Status
                    </Typography>
                    <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                      Recorded via Job Completion & Quick Actions
                    </Typography>
                  </Box>
                  <Chip label="VERIFIED" color="info" size="small" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Request Status Trackers */}
          {pendingTrackers.length > 0 && (
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: "#fff", my: 1 }}>
                Pending Requests & Approvals
              </Typography>
              {pendingTrackers.map((t) => (
                <UnifiedRequestStatusTracker
                  key={t.id}
                  title={t.title || t.requestType}
                  steps={t.steps || [
                    { name: "Submitted", status: "COMPLETED" },
                    { name: "Manager Reviewing", status: "IN_PROGRESS" },
                    { name: "Approved", status: "PENDING" },
                  ]}
                />
              ))}
            </Grid>
          )}
        </Grid>
      </Container>

      {/* Floating Quick Action Drawer / FAB */}
      <ContextQuickActionsFab
        activeJobId={activeJob?.id || null}
        assignedVehicleId={activeVehicle?.id || null}
        onTriggerAction={(action) => console.log("Triggered quick action:", action)}
      />

      {/* AI Voice Paperwork Modal */}
      <StaffVoicePaperworkDialog
        open={voiceDialogOpen}
        jobId={activeJob?.id || "DISPATCH"}
        onClose={() => setVoiceDialogOpen(false)}
        onConfirmed={() => setVoiceDialogOpen(false)}
      />

      {/* Finish Shift Guided Checklist Modal */}
      <FinishShiftChecklistModal
        open={finishShiftOpen}
        onClose={() => setFinishShiftOpen(false)}
        onClockOut={() => {
          setClockedIn(false);
          setFinishShiftOpen(false);
        }}
      />
    </Box>
  );
};

export default StaffTodayDashboard;
