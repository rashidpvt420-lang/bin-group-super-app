import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  Stack,
  Avatar,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import {
  Warning as ExceptionIcon,
  DirectionsCar as FleetIcon,
  People as HrIcon,
  AutoAwesome as AiIcon,
} from "@mui/icons-material";
import {
  db,
  auth,
  functions,
  httpsCallable,
  collection,
  query,
  where,
  onSnapshot,
} from "../../lib/firebase";

export interface StaffExceptionRecord {
  id: string;
  staffId?: string;
  staffName?: string;
  role?: string;
  type: string;
  details?: string;
  department?: string;
  status: string;
  severity?: string;
  createdAt?: any;
}

export const StaffExceptionsManagerPage: React.FC = () => {
  const currentUid = auth.currentUser?.uid;

  const [exceptions, setExceptions] = useState<StaffExceptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [aiAuditRunning, setAiAuditRunning] = useState(false);
  const [aiAuditResult, setAiAuditResult] = useState<string | null>(null);

  // Decision Modal State
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [selectedException, setSelectedException] = useState<StaffExceptionRecord | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>("RESOLVE");
  const [humanReason, setHumanReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Live Subscription to staff_exceptions
  useEffect(() => {
    if (!currentUid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, "staff_exceptions"),
      where("status", "in", ["OPEN", "PENDING_REVIEW"])
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: StaffExceptionRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as StaffExceptionRecord[];
        setExceptions(rows);
        setLoading(false);
      },
      (err) => {
        console.error("[StaffExceptionsManagerPage] Error loading exceptions:", err);
        setError("Failed to load staff exceptions. Please check your permissions or network.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUid]);

  // Open Decision Modal
  const handleOpenDecisionModal = (exc: StaffExceptionRecord, action: string) => {
    setSelectedException(exc);
    setSelectedAction(action);
    setHumanReason("");
    setNotes("");
    setDecisionModalOpen(true);
  };

  // Submit Backend Resolution Callable with Human Reason
  const handleSubmitResolution = async () => {
    if (!selectedException || !humanReason.trim()) {
      alert("Resolution reason is required.");
      return;
    }

    try {
      setResolvingId(selectedException.id);
      setDecisionModalOpen(false);

      const resolveFn = httpsCallable(functions, "resolveStaffException");
      await resolveFn({
        exceptionId: selectedException.id,
        resolutionAction: selectedAction,
        resolutionReason: humanReason.trim(),
        notes: notes.trim(),
      });
    } catch (err: any) {
      console.error("[StaffExceptionsManagerPage] Resolution failed:", err);
      alert(err.message || "Failed to process exception resolution.");
    } finally {
      setResolvingId(null);
      setSelectedException(null);
    }
  };

  // Execute Backend Rules Audit Callable
  const handleRunAiAudit = async () => {
    try {
      setAiAuditRunning(true);
      setAiAuditResult(null);
      const auditFn = httpsCallable(functions, "runStaffAiAudit");
      const res: any = await auditFn({});
      if (res.data?.success) {
        setAiAuditResult(res.data.message || `Rules Audit completed across ${res.data.totalAudited} records.`);
      }
    } catch (err: any) {
      console.error("[StaffExceptionsManagerPage] Rules Audit failed:", err);
      alert(err.message || "Failed to execute exception audit.");
    } finally {
      setAiAuditRunning(false);
    }
  };

  const hrCount = exceptions.filter((e) => (e.department || e.type).includes("HR") || e.type.includes("CLOCK")).length;
  const fleetCount = exceptions.filter((e) => (e.department || e.type).includes("FLEET") || e.type.includes("VEHICLE")).length;
  const opsCount = exceptions.filter((e) => (e.department || e.type).includes("OPS") || e.type.includes("OVERTIME")).length;
  const openCount = exceptions.length;

  if (loading) {
    return (
      <Box sx={{ p: 6, textAlign: "center", bgcolor: "#0f172a", minHeight: "100vh", color: "#fff" }}>
        <CircularProgress color="primary" />
        <Typography variant="body1" sx={{ mt: 2, color: "#94a3b8" }}>
          Loading authorized staff exceptions...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4, bgcolor: "#0f172a", color: "#f8fafc", minHeight: "100vh" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4" sx={{ fontWeight: 900, color: "#fff" }}>
              Staff Exceptions & Multi-Dept Control
            </Typography>
            <Chip
              label={`${openCount} ACTIVE EXCEPTIONS`}
              color={openCount > 0 ? "error" : "success"}
              sx={{ fontWeight: 800 }}
            />
          </Stack>
          <Typography variant="body2" sx={{ color: "#94a3b8", mt: 0.5 }}>
            Normal cases are processed automatically where configured. Exceptions requiring review appear here.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={aiAuditRunning ? <CircularProgress size={18} color="inherit" /> : <AiIcon />}
          disabled={aiAuditRunning}
          sx={{ bgcolor: "#3b82f6", fontWeight: 700, borderRadius: 2 }}
          onClick={handleRunAiAudit}
        >
          {aiAuditRunning ? "Running Audit..." : "Run Rules Exception Audit"}
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {aiAuditResult && (
        <Alert severity="info" onClose={() => setAiAuditResult(null)} sx={{ mb: 3 }}>
          {aiAuditResult}
        </Alert>
      )}

      {/* Dynamic Exception Counters */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Card sx={{ bgcolor: "#1e293b", border: "1px solid #ef4444", borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" sx={{ color: "#ef4444", fontWeight: 700 }}>
                    HR & ATTENDANCE
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, color: "#fff", my: 0.5 }}>
                    {hrCount}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                    Attendance & Document Exceptions
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: "#ef4444", width: 48, height: 48 }}>
                  <HrIcon />
                </Avatar>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card sx={{ bgcolor: "#1e293b", border: "1px solid #f59e0b", borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" sx={{ color: "#f59e0b", fontWeight: 700 }}>
                    FLEET & VEHICLES
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, color: "#fff", my: 0.5 }}>
                    {fleetCount}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                    Vehicle & Breakdown Incidents
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: "#f59e0b", width: 48, height: 48 }}>
                  <FleetIcon />
                </Avatar>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card sx={{ bgcolor: "#1e293b", border: "1px solid #3b82f6", borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" sx={{ color: "#3b82f6", fontWeight: 700 }}>
                    OPERATIONS & OVERTIME
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, color: "#fff", my: 0.5 }}>
                    {opsCount}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                    Overtime & SLA Exceptions
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: "#3b82f6", width: 48, height: 48 }}>
                  <ExceptionIcon />
                </Avatar>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Exception Table / Empty State */}
      <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155", borderRadius: 3 }}>
        <CardContent sx={{ p: 0 }}>
          {exceptions.length === 0 ? (
            <Box sx={{ p: 6, textAlign: "center" }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: "#fff", mb: 1 }}>
                No Active Staff Exceptions
              </Typography>
              <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                All workforce operations are proceeding within policy parameters.
              </Typography>
            </Box>
          ) : (
            <Table>
              <TableHead sx={{ bgcolor: "#0f172a" }}>
                <TableRow>
                  <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>Staff Member</TableCell>
                  <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>Exception Type</TableCell>
                  <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>Details</TableCell>
                  <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>Status</TableCell>
                  <TableCell align="right" sx={{ color: "#94a3b8", fontWeight: 700 }}>Contextual Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {exceptions.map((exc) => (
                  <TableRow key={exc.id} sx={{ "&:hover": { bgcolor: "#334155" } }}>
                    <TableCell sx={{ color: "#fff", fontWeight: 700 }}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar sx={{ bgcolor: "#3b82f6", width: 36, height: 36 }}>
                          {(exc.staffName || "Staff").charAt(0)}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {exc.staffName || exc.staffId || "Staff Member"}
                          </Typography>
                          <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                            {exc.role || "Employee"}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={exc.type}
                        size="small"
                        color={exc.type.includes("BREAKDOWN") ? "error" : "warning"}
                        sx={{ fontWeight: 800, fontSize: "0.7rem" }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: "#cbd5e1", maxWidth: 300 }}>
                      {exc.details || "No details provided"}
                    </TableCell>
                    <TableCell>
                      <Chip label={exc.status} size="small" variant="outlined" sx={{ color: "#f59e0b", borderColor: "#f59e0b" }} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {exc.type === "MISSING_CLOCK_OUT" && (
                          <>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              disabled={resolvingId === exc.id}
                              onClick={() => handleOpenDecisionModal(exc, "APPROVE_CORRECTION")}
                            >
                              Approve Correction
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              disabled={resolvingId === exc.id}
                              onClick={() => handleOpenDecisionModal(exc, "REJECT")}
                            >
                              Reject
                            </Button>
                          </>
                        )}

                        {exc.type === "UNUSUAL_OVERTIME" && (
                          <>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              disabled={resolvingId === exc.id}
                              onClick={() => handleOpenDecisionModal(exc, "APPROVE")}
                            >
                              Approve
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              disabled={resolvingId === exc.id}
                              onClick={() => handleOpenDecisionModal(exc, "REJECT")}
                            >
                              Reject
                            </Button>
                          </>
                        )}

                        {exc.type === "VEHICLE_BREAKDOWN" && (
                          <Button
                            size="small"
                            variant="contained"
                            color="secondary"
                            disabled={resolvingId === exc.id}
                            onClick={() => handleOpenDecisionModal(exc, "CLOSE_INCIDENT")}
                          >
                            Close Incident
                          </Button>
                        )}

                        {exc.type !== "MISSING_CLOCK_OUT" && exc.type !== "UNUSUAL_OVERTIME" && exc.type !== "VEHICLE_BREAKDOWN" && (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            disabled={resolvingId === exc.id}
                            onClick={() => handleOpenDecisionModal(exc, "RESOLVE")}
                          >
                            Resolve Exception
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Decision Reason Modal */}
      <Dialog open={decisionModalOpen} onClose={() => setDecisionModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: "#1e293b", color: "#fff", fontWeight: 700 }}>
          Confirm Exception Resolution ({selectedAction})
        </DialogTitle>
        <DialogContent sx={{ bgcolor: "#1e293b", pt: 2 }}>
          <Typography variant="body2" sx={{ color: "#94a3b8", mb: 2 }}>
            Exception ID: <strong>{selectedException?.id}</strong> ({selectedException?.type})
          </Typography>
          <TextField
            fullWidth
            required
            label="Human-Supplied Resolution Reason"
            value={humanReason}
            onChange={(e) => setHumanReason(e.target.value)}
            placeholder="Enter explicit reason for audit log..."
            variant="outlined"
            multiline
            rows={3}
            sx={{ mb: 2, "& .MuiInputBase-root": { color: "#fff" }, "& .MuiInputLabel-root": { color: "#94a3b8" } }}
          />
          <TextField
            fullWidth
            label="Optional Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional internal manager notes..."
            variant="outlined"
            size="small"
            sx={{ "& .MuiInputBase-root": { color: "#fff" }, "& .MuiInputLabel-root": { color: "#94a3b8" } }}
          />
        </DialogContent>
        <DialogActions sx={{ bgcolor: "#1e293b", px: 3, pb: 3 }}>
          <Button onClick={() => setDecisionModalOpen(false)} sx={{ color: "#94a3b8" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            disabled={!humanReason.trim()}
            onClick={handleSubmitResolution}
          >
            Submit Resolution
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StaffExceptionsManagerPage;
