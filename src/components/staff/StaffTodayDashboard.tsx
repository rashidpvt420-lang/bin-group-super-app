import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CheckCircle as CheckIcon,
  DirectionsCar as VehicleIcon,
  LocationOn as LocationIcon,
  Mic as VoiceIcon,
} from "@mui/icons-material";
import {
  auth,
  collection,
  db,
  doc,
  functions,
  httpsCallable,
  limit,
  onSnapshot,
  query,
  where,
} from "../../lib/firebase";
import ContextQuickActionsFab from "./ContextQuickActionsFab";
import FinishShiftChecklistModal from "./FinishShiftChecklistModal";
import StaffVoicePaperworkDialog from "./StaffVoicePaperworkDialog";
import UnifiedRequestStatusTracker from "./UnifiedRequestStatusTracker";

// Light-shell palette (>= 4.5:1 on white). This card was written for a dark page: a #0f172a root
// with white text. Inside the white technician shell the text was forced dark on that navy root
// (1.01:1) and slate-400 secondary text (#94a3b8) measured 2.6:1 on the white cards.
const STAFF_TODAY_READABLE = {
  ink: "#111827",
  muted: "#475467",
  surface: "#FFFFFF",
  soft: "#F8F9FB",
  line: "#E5E7EB",
} as const;

interface StaffTodayDashboardProps {
  userName?: string;
  role?: string;
  isRtl?: boolean;
}

interface StaffProfile {
  displayName: string;
  role: string;
  email: string;
}

interface ActiveVehicle {
  id: string;
  plate: string | null;
  fuelLevel: number | null;
  status: string | null;
}

interface ActiveJob {
  id: string;
  title: string;
  location: string | null;
  priority: string | null;
  status: string;
  slaDeadline: unknown;
}

function dubaiDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function readableDateTime(value: unknown): string {
  if (!value) return "Not recorded";
  let date: Date | null = null;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: () => Date }).toDate === "function") {
    date = (value as { toDate: () => Date }).toDate();
  } else if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  if (!date) return String(value);
  return new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export const StaffTodayDashboard: React.FC<StaffTodayDashboardProps> = ({
  userName: fallbackName,
  role: fallbackRole,
  isRtl = false,
}) => {
  const navigate = useNavigate();
  const currentUid = auth.currentUser?.uid;
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [activeVehicle, setActiveVehicle] = useState<ActiveVehicle | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [pendingTrackers, setPendingTrackers] = useState<any[]>([]);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [finishShiftOpen, setFinishShiftOpen] = useState(false);
  const [overtimeDialogOpen, setOvertimeDialogOpen] = useState(false);
  const [overtimeMinutes, setOvertimeMinutes] = useState("");
  const [overtimeReason, setOvertimeReason] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUid) return;
    return onSnapshot(
      doc(db, "users", currentUid),
      (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          return;
        }
        const data = snap.data();
        setProfile({
          displayName: data.displayName || data.name || data.email || fallbackName || "Staff Member",
          role: data.trade || data.role || fallbackRole || "Staff",
          email: data.email || "",
        });
      },
      (err) => setActionError(`Profile sync failed: ${err.message}`),
    );
  }, [currentUid, fallbackName, fallbackRole]);

  useEffect(() => {
    if (!currentUid) return;
    const todayStr = dubaiDateKey();
    if (!todayStr) return;
    return onSnapshot(
      doc(db, "staff_shifts", `SHIFT_${currentUid}_${todayStr}`),
      (snap) => setActiveShift(snap.exists() ? snap.data() : null),
      (err) => setActionError(`Shift sync failed: ${err.message}`),
    );
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid) return;
    const vehicleQuery = query(
      collection(db, "vehicles"),
      where("assignedStaffUid", "==", currentUid),
      limit(1),
    );
    return onSnapshot(
      vehicleQuery,
      (snap) => {
        if (snap.empty) {
          setActiveVehicle(null);
          return;
        }
        const data = snap.docs[0].data();
        const fuel = Number(data.fuelLevel);
        setActiveVehicle({
          id: snap.docs[0].id,
          plate: data.plateNumber || data.plate || null,
          fuelLevel: Number.isFinite(fuel) ? fuel : null,
          status: data.status || null,
        });
      },
      (err) => setActionError(`Vehicle sync failed: ${err.message}`),
    );
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid) return;
    const jobQuery = query(
      collection(db, "maintenanceTickets"),
      where("assignedTechnicianId", "==", currentUid),
      where("status", "in", ["assigned", "on_the_way", "arrived", "in_progress", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"]),
      limit(1),
    );
    return onSnapshot(
      jobQuery,
      (snap) => {
        if (snap.empty) {
          setActiveJob(null);
          return;
        }
        const data = snap.docs[0].data();
        const propertyLabel = data.propertyName || data.unitNumber || null;
        const issueLabel = data.category || data.issueType || null;
        setActiveJob({
          id: snap.docs[0].id,
          title: [propertyLabel, issueLabel].filter(Boolean).join(" — ") || `Work Order ${snap.docs[0].id}`,
          location: data.address || data.propertyName || null,
          priority: data.priority ? String(data.priority).toUpperCase() : null,
          status: String(data.status || "").toUpperCase(),
          slaDeadline: data.slaDeadline || null,
        });
      },
      (err) => setActionError(`Work-order sync failed: ${err.message}`),
    );
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid) return;
    const trackerQuery = query(
      collection(db, "staff_request_trackers"),
      where("staffId", "==", currentUid),
      limit(10),
    );
    return onSnapshot(
      trackerQuery,
      (snap) => setPendingTrackers(snap.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (err) => setActionError(`Request sync failed: ${err.message}`),
    );
  }, [currentUid]);

  const shiftStatus = String(activeShift?.status || "OFF_DUTY").toUpperCase();
  const clockedIn = ["ACTIVE", "ON_BREAK"].includes(shiftStatus);
  const displayName = profile?.displayName || fallbackName || "Staff Member";
  const displayRole = profile?.role || fallbackRole || "Staff";
  const shiftLabel = activeShift?.shiftTime || activeShift?.scheduledLabel || "No shift schedule recorded";

  const overtimeTracker = useMemo(
    () => pendingTrackers.find((tracker) => String(tracker.requestType || "").toUpperCase() === "OVERTIME_CLAIM") || null,
    [pendingTrackers],
  );
  const overtimeStatus = overtimeTracker ? String(overtimeTracker.status || "SUBMITTED").toUpperCase() : "NONE";

  const callQuickAction = async (actionType: string) => {
    setActionError(null);
    setActionMessage(null);
    setActionBusy(actionType);
    try {
      const quickAction = httpsCallable(functions, "submitStaffQuickAction");
      const response: any = await quickAction({
        actionType,
        jobId: activeJob?.id || undefined,
        vehicleId: activeVehicle?.id || undefined,
      });
      setActionMessage(response.data?.message || `${actionType} completed.`);
    } catch (err: any) {
      setActionError(err?.message || `${actionType} failed.`);
    } finally {
      setActionBusy(null);
    }
  };

  const handleQuickAction = async (actionType: string) => {
    if (actionType === "CLOCK_IN_OUT") {
      if (clockedIn) setFinishShiftOpen(true);
      else await callQuickAction("CLOCK_IN");
      return;
    }
    if (actionType === "ARRIVE" || actionType === "START_JOB") {
      if (!activeJob?.id) {
        setActionError("No active work order is available. Arrival and job start stay on the mission screen so GPS and evidence can be checked.");
        return;
      }
      navigate(`/technician/job/${activeJob.id}`);
      return;
    }
    if (actionType === "FINISH_JOB") {
      if (!activeJob) {
        setActionError("No active work order is available to complete.");
        return;
      }
      setVoiceDialogOpen(true);
      return;
    }
    if (actionType === "REQUEST_OVERTIME") {
      setOvertimeDialogOpen(true);
      return;
    }
    if (actionType === "VEHICLE_BREAKDOWN") {
      await callQuickAction("BREAKDOWN_REPORT");
      return;
    }
    if (actionType === "ACCIDENT_REPORT") {
      if (!activeVehicle) {
        setActionError("No assigned vehicle is available for an accident report.");
        return;
      }
      setActionBusy(actionType);
      try {
        const reportAccident = httpsCallable(functions, "executeMultiDeptAutomation");
        const response: any = await reportAccident({
          eventType: "VEHICLE_ACCIDENT_REPORT",
          vehicleId: activeVehicle.id,
        });
        setActionMessage(response.data?.message || "Vehicle accident report submitted.");
      } catch (err: any) {
        setActionError(err?.message || "Vehicle accident report failed.");
      } finally {
        setActionBusy(null);
      }
      return;
    }

    setActionError("This quick action is not connected to an authoritative workflow yet.");
  };

  const submitOvertime = async () => {
    const minutes = Number(overtimeMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 360 || overtimeReason.trim().length < 5) {
      setActionError("Enter overtime minutes from 1 to 360 and a meaningful reason.");
      return;
    }

    setActionBusy("REQUEST_OVERTIME");
    setActionError(null);
    try {
      const requestOvertime = httpsCallable(functions, "requestStaffOvertime");
      const response: any = await requestOvertime({
        estimatedMinutes: minutes,
        reason: overtimeReason.trim(),
        jobId: activeJob?.id || undefined,
      });
      setActionMessage(response.data?.message || "Overtime request submitted.");
      setOvertimeDialogOpen(false);
      setOvertimeMinutes("");
      setOvertimeReason("");
    } catch (err: any) {
      setActionError(err?.message || "Overtime request failed.");
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} data-testid="staff-today-dashboard" sx={{ bgcolor: STAFF_TODAY_READABLE.surface, color: STAFF_TODAY_READABLE.ink, pb: 10 }}>
      <Box sx={{ borderBottom: `1px solid ${STAFF_TODAY_READABLE.line}`, py: 3, px: 2, background: "linear-gradient(135deg, #F8F9FB 0%, #FFFFFF 100%)" }}>
        <Container maxWidth="md">
          <Stack direction={{ xs: "column", sm: "row" }} gap={2} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar sx={{ width: 56, height: 56, bgcolor: "#1D4ED8", fontWeight: 800 }}>
                {displayName.charAt(0).toUpperCase()}
              </Avatar>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{displayName}</Typography>
                  <Chip label={clockedIn ? "ON DUTY" : "OFF DUTY"} color={clockedIn ? "success" : "default"} size="small" />
                </Stack>
                <Typography variant="body2" sx={{ color: STAFF_TODAY_READABLE.muted }}>
                  {displayRole} • Shift: {shiftLabel}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button
                variant={clockedIn ? "outlined" : "contained"}
                color={clockedIn ? "warning" : "success"}
                disabled={actionBusy !== null}
                onClick={() => clockedIn ? setFinishShiftOpen(true) : void callQuickAction("CLOCK_IN")}
              >
                {clockedIn ? "Finish / Clock Out" : "Clock In"}
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ mt: 3 }}>
        {actionError && <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>{actionError}</Alert>}
        {actionMessage && <Alert severity="success" onClose={() => setActionMessage(null)} sx={{ mb: 2 }}>{actionMessage}</Alert>}

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Card sx={{ bgcolor: STAFF_TODAY_READABLE.surface, color: STAFF_TODAY_READABLE.ink, border: "1px solid #93C5FD", borderRadius: 3 }}>
              <CardContent sx={{ p: 3 }}>
                {activeJob ? (
                  <>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                          <Chip label="ACTIVE DISPATCH" color="primary" size="small" />
                          {activeJob.priority && <Chip label={activeJob.priority} color={activeJob.priority === "EMERGENCY" ? "error" : "info"} size="small" />}
                          <Chip label={activeJob.status} variant="outlined" size="small" />
                        </Stack>
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>{activeJob.title}</Typography>
                        <Typography variant="body2" sx={{ color: STAFF_TODAY_READABLE.muted, display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                          <LocationIcon fontSize="small" /> {activeJob.location || "Location not recorded"}
                        </Typography>
                      </Box>
                      <Tooltip title="Prepare voice/text completion report">
                        <span>
                          <IconButton
                            aria-label="Prepare voice or text completion report"
                            disabled={!activeJob || !["ARRIVED", "IN_PROGRESS"].includes(activeJob.status)}
                            onClick={() => setVoiceDialogOpen(true)}
                            sx={{ bgcolor: "#1D4ED8", color: "#FFFFFF" }}
                          >
                            <VoiceIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                    <Box sx={{ mt: 2, p: 2, bgcolor: STAFF_TODAY_READABLE.soft, border: `1px solid ${STAFF_TODAY_READABLE.line}`, borderRadius: 2 }}>
                      <Typography variant="body2" sx={{ color: STAFF_TODAY_READABLE.muted }}>
                        SLA deadline: <strong>{readableDateTime(activeJob.slaDeadline)}</strong>
                      </Typography>
                    </Box>
                    <Button
                      fullWidth
                      variant="contained"
                      color="success"
                      disabled={!["ARRIVED", "IN_PROGRESS"].includes(activeJob.status)}
                      onClick={() => setVoiceDialogOpen(true)}
                      startIcon={<CheckIcon />}
                      sx={{ mt: 2.5 }}
                    >
                      Prepare Completion Report
                    </Button>
                  </>
                ) : (
                  <Box sx={{ py: 2, textAlign: "center" }}>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>No Active Job Dispatched</Typography>
                    <Typography variant="body2" sx={{ color: STAFF_TODAY_READABLE.muted, mt: 1 }}>Assigned work appears here automatically.</Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card sx={{ bgcolor: STAFF_TODAY_READABLE.surface, color: STAFF_TODAY_READABLE.ink, border: `1px solid ${STAFF_TODAY_READABLE.line}`, borderRadius: 3 }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar sx={{ bgcolor: "#0284c7" }}><VehicleIcon /></Avatar>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        {activeVehicle ? `${activeVehicle.id}${activeVehicle.plate ? ` (${activeVehicle.plate})` : ""}` : "No Vehicle Assigned"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: STAFF_TODAY_READABLE.muted }}>
                        {activeVehicle
                          ? `Status ${activeVehicle.status || "not recorded"} • Fuel ${activeVehicle.fuelLevel === null ? "not recorded" : `${activeVehicle.fuelLevel}%`}`
                          : "Fleet assignment will appear here when issued."}
                      </Typography>
                    </Box>
                  </Stack>
                  <Chip label={activeVehicle ? "ASSIGNED" : "NONE"} color={activeVehicle ? "success" : "default"} size="small" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card sx={{ bgcolor: STAFF_TODAY_READABLE.surface, color: STAFF_TODAY_READABLE.ink, border: `1px solid ${STAFF_TODAY_READABLE.line}`, borderRadius: 3 }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Overtime</Typography>
                    <Typography variant="caption" sx={{ color: STAFF_TODAY_READABLE.muted }}>
                      {overtimeTracker ? `${overtimeTracker.estimatedMinutes || "—"} min requested` : "No active overtime request"}
                    </Typography>
                  </Box>
                  <Chip label={overtimeStatus} color={overtimeStatus === "APPROVED" ? "success" : overtimeStatus === "NONE" ? "default" : "info"} size="small" />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {pendingTrackers.length > 0 && (
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ fontWeight: 800, my: 1 }}>Pending Requests & Approvals</Typography>
              {pendingTrackers.map((tracker) => (
                <UnifiedRequestStatusTracker
                  key={tracker.id}
                  title={tracker.title || tracker.requestType || "Request"}
                  steps={Array.isArray(tracker.steps) ? tracker.steps : []}
                />
              ))}
            </Grid>
          )}
        </Grid>
      </Container>

      <ContextQuickActionsFab
        activeJobId={activeJob?.id || null}
        assignedVehicleId={activeVehicle?.id || null}
        clockedIn={clockedIn}
        activeJobStatus={activeJob?.status || null}
        busy={actionBusy !== null}
        onTriggerAction={(action) => void handleQuickAction(action)}
      />

      {activeJob && (
        <StaffVoicePaperworkDialog
          open={voiceDialogOpen}
          jobId={activeJob.id}
          onClose={() => setVoiceDialogOpen(false)}
          onConfirmed={() => {
            setVoiceDialogOpen(false);
            setActionMessage("Work-order completion was confirmed by the server.");
          }}
        />
      )}

      <FinishShiftChecklistModal
        open={finishShiftOpen}
        onClose={() => setFinishShiftOpen(false)}
        onClockOut={() => {
          setFinishShiftOpen(false);
          setActionMessage("Shift closed after server-side verification.");
        }}
      />

      <Dialog open={overtimeDialogOpen} onClose={() => setOvertimeDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Request Overtime</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            type="number"
            label="Estimated minutes"
            value={overtimeMinutes}
            onChange={(event) => setOvertimeMinutes(event.target.value)}
            inputProps={{ min: 1, max: 360 }}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Reason"
            value={overtimeReason}
            onChange={(event) => setOvertimeReason(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOvertimeDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={actionBusy === "REQUEST_OVERTIME"} onClick={() => void submitOvertime()}>
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StaffTodayDashboard;
