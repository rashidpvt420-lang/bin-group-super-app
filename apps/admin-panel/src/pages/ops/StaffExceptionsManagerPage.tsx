import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  AutoAwesome as AuditIcon,
  DirectionsCar as FleetIcon,
  People as HrIcon,
  Refresh as RefreshIcon,
  Warning as ExceptionIcon,
} from "@mui/icons-material";
import { auth, functions, httpsCallable } from "../../lib/firebase";

export interface StaffExceptionRecord {
  id: string;
  staffId?: string | null;
  staffName?: string | null;
  role?: string | null;
  type: string;
  domain?: string;
  details?: string | null;
  department?: string | null;
  status: string;
  severity?: string | null;
  createdAt?: unknown;
}

interface QueueResponse {
  success?: boolean;
  exceptions?: StaffExceptionRecord[];
  count?: number;
}

export const StaffExceptionsManagerPage: React.FC = () => {
  const currentUid = auth.currentUser?.uid;
  const [exceptions, setExceptions] = useState<StaffExceptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [selectedException, setSelectedException] = useState<StaffExceptionRecord | null>(null);
  const [selectedAction, setSelectedAction] = useState("RESOLVE");
  const [humanReason, setHumanReason] = useState("");
  const [notes, setNotes] = useState("");

  const loadExceptions = useCallback(async () => {
    if (!currentUid) {
      setExceptions([]);
      setLoading(false);
      setError("Sign in with an authorized staff account to view exceptions.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const getQueue = httpsCallable(functions, "getStaffExceptionsQueue");
      const response = await getQueue({});
      const data = (response.data || {}) as QueueResponse;
      setExceptions(Array.isArray(data.exceptions) ? data.exceptions : []);
    } catch (err: any) {
      console.error("[StaffExceptionsManagerPage] Authorized queue load failed:", err);
      setExceptions([]);
      setError(err?.message || "Unable to load the authorized exception queue.");
    } finally {
      setLoading(false);
    }
  }, [currentUid]);

  useEffect(() => {
    void loadExceptions();
  }, [loadExceptions]);

  const counts = useMemo(() => {
    const byDomain = (domain: string) => exceptions.filter((item) => item.domain === domain).length;
    return {
      hr: byDomain("HR") + byDomain("HR_CONFIDENTIAL"),
      fleet: byDomain("FLEET"),
      operations: byDomain("OPERATIONS"),
      finance: byDomain("FINANCE"),
    };
  }, [exceptions]);

  const openDecision = (exception: StaffExceptionRecord, action: string) => {
    setSelectedException(exception);
    setSelectedAction(action);
    setHumanReason("");
    setNotes("");
    setDecisionModalOpen(true);
  };

  const submitDecision = async () => {
    if (!selectedException) return;
    if (humanReason.trim().length < 3) {
      setError("Enter a truthful review reason before submitting a decision.");
      return;
    }

    setResolvingId(selectedException.id);
    setDecisionModalOpen(false);
    setError(null);
    try {
      const resolveException = httpsCallable(functions, "resolveStaffException");
      await resolveException({
        exceptionId: selectedException.id,
        resolutionAction: selectedAction,
        resolutionReason: humanReason.trim(),
        notes: notes.trim(),
      });
      await loadExceptions();
    } catch (err: any) {
      console.error("[StaffExceptionsManagerPage] Exception decision failed:", err);
      setError(err?.message || "The exception decision could not be saved.");
    } finally {
      setResolvingId(null);
      setSelectedException(null);
    }
  };

  const runRulesAudit = async () => {
    setAuditRunning(true);
    setAuditResult(null);
    setError(null);
    try {
      const runAudit = httpsCallable(functions, "runStaffAiAudit");
      const response: any = await runAudit({});
      setAuditResult(
        response.data?.message ||
        `Rules-based review completed across ${response.data?.totalAudited ?? 0} authorized records.`,
      );
    } catch (err: any) {
      console.error("[StaffExceptionsManagerPage] Rules review failed:", err);
      setError(err?.message || "The rules-based exception review failed.");
    } finally {
      setAuditRunning(false);
    }
  };

  const actionButtons = (exception: StaffExceptionRecord) => {
    if (exception.type === "MISSING_CLOCK_OUT") {
      return (
        <>
          <Button size="small" variant="contained" color="success" onClick={() => openDecision(exception, "APPROVE_CORRECTION")}>
            Approve Correction
          </Button>
          <Button size="small" variant="outlined" color="error" onClick={() => openDecision(exception, "REJECT")}>
            Reject
          </Button>
        </>
      );
    }

    if (exception.type === "UNUSUAL_OVERTIME") {
      return (
        <>
          <Button size="small" variant="contained" color="success" onClick={() => openDecision(exception, "APPROVE")}>
            Approve
          </Button>
          <Button size="small" variant="outlined" color="warning" onClick={() => openDecision(exception, "REQUEST_EVIDENCE")}>
            Request Evidence
          </Button>
          <Button size="small" variant="outlined" color="error" onClick={() => openDecision(exception, "REJECT")}>
            Reject
          </Button>
        </>
      );
    }

    if (exception.domain === "FLEET") {
      return (
        <>
          <Button size="small" variant="contained" color="secondary" onClick={() => openDecision(exception, "ACKNOWLEDGE")}>
            Acknowledge
          </Button>
          <Button size="small" variant="outlined" onClick={() => openDecision(exception, "CLOSE_INCIDENT")}>
            Close Incident
          </Button>
        </>
      );
    }

    return (
      <Button size="small" variant="contained" onClick={() => openDecision(exception, "RESOLVE")}>
        Resolve
      </Button>
    );
  };

  if (loading) {
    return (
      <Box sx={{ p: 6, textAlign: "center", bgcolor: "#0f172a", minHeight: "100vh", color: "#fff" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2, color: "#94a3b8" }}>Loading your authorized exception queue...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: "#0f172a", color: "#f8fafc", minHeight: "100vh" }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} sx={{ mb: 4 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4" sx={{ fontWeight: 900 }}>Staff Exceptions & Multi-Dept Control</Typography>
            <Chip label={`${exceptions.length} ACTIVE`} color={exceptions.length ? "error" : "success"} />
          </Stack>
          <Typography variant="body2" sx={{ color: "#94a3b8", mt: 0.5 }}>
            Only exceptions authorized for your role are returned by the server.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void loadExceptions()}>
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={auditRunning ? <CircularProgress size={18} color="inherit" /> : <AuditIcon />}
            disabled={auditRunning}
            onClick={() => void runRulesAudit()}
          >
            {auditRunning ? "Running..." : "Run Rules Review"}
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {auditResult && <Alert severity="info" onClose={() => setAuditResult(null)} sx={{ mb: 3 }}>{auditResult}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { title: "HR & ATTENDANCE", count: counts.hr, icon: <HrIcon /> },
          { title: "FLEET & VEHICLES", count: counts.fleet, icon: <FleetIcon /> },
          { title: "OPERATIONS", count: counts.operations, icon: <ExceptionIcon /> },
          { title: "FINANCE", count: counts.finance, icon: <ExceptionIcon /> },
        ].map((item) => (
          <Grid item xs={12} sm={6} lg={3} key={item.title}>
            <Card sx={{ bgcolor: "#1e293b", color: "#fff", border: "1px solid #334155" }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 800 }}>{item.title}</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 900 }}>{item.count}</Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: "#334155" }}>{item.icon}</Avatar>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155" }}>
        <CardContent sx={{ p: 0 }}>
          {exceptions.length === 0 ? (
            <Box sx={{ p: 6, textAlign: "center" }}>
              <Typography variant="h6" sx={{ color: "#fff", fontWeight: 800 }}>No Authorized Active Exceptions</Typography>
              <Typography variant="body2" sx={{ color: "#94a3b8", mt: 1 }}>
                No records requiring your review are currently available.
              </Typography>
            </Box>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: "#94a3b8" }}>Staff</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>Domain / Type</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>Details</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>Status</TableCell>
                  <TableCell align="right" sx={{ color: "#94a3b8" }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {exceptions.map((exception) => (
                  <TableRow key={exception.id}>
                    <TableCell sx={{ color: "#fff" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {exception.staffName || exception.staffId || "Staff Member"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#94a3b8" }}>{exception.role || "Employee"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={exception.domain || "GENERAL"} size="small" sx={{ mr: 1 }} />
                      <Typography component="span" variant="caption" sx={{ color: "#cbd5e1" }}>{exception.type}</Typography>
                    </TableCell>
                    <TableCell sx={{ color: "#cbd5e1", maxWidth: 360 }}>
                      {exception.details || "No details recorded"}
                    </TableCell>
                    <TableCell><Chip label={exception.status} size="small" variant="outlined" /></TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {resolvingId === exception.id ? <CircularProgress size={22} /> : actionButtons(exception)}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={decisionModalOpen} onClose={() => setDecisionModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Record Decision</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {selectedException?.type || "Exception"} · {selectedAction}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            required
            multiline
            minRows={3}
            label="Decision reason"
            value={humanReason}
            onChange={(event) => setHumanReason(event.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Additional notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecisionModalOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={humanReason.trim().length < 3} onClick={() => void submitDecision()}>
            Submit Decision
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StaffExceptionsManagerPage;
