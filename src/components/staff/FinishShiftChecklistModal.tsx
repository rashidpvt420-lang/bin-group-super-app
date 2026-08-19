import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  AccessTime as ClockIcon,
  Build as ToolIcon,
  CheckCircle as CheckIcon,
  DirectionsCar as VehicleIcon,
  Engineering as JobsIcon,
  MoreTime as OvertimeIcon,
} from "@mui/icons-material";
import { functions, httpsCallable } from "../../lib/firebase";

interface FinishShiftChecklistModalProps {
  open: boolean;
  onClose: () => void;
  onClockOut: () => void;
}

interface ShiftSummary {
  jobsCompleted?: number;
  completedJobsWithPhotoEvidence?: number;
  vehicleReturnStatus?: string;
  approvedOvertimeMinutes?: number;
  toolAssetVerificationStatus?: string;
  warnings?: string[];
}

export const FinishShiftChecklistModal: React.FC<FinishShiftChecklistModalProps> = ({
  open,
  onClose,
  onClockOut,
}) => {
  const [handoverNotes, setHandoverNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);

  const close = () => {
    if (submitting) return;
    setError(null);
    setSummary(null);
    setHandoverNotes("");
    onClose();
  };

  const finishShift = async () => {
    setSubmitting(true);
    setError(null);
    setSummary(null);
    try {
      const finish = httpsCallable(functions, "triggerStaffShiftFinish");
      const response: any = await finish({ handoverNotes: handoverNotes.trim() });
      setSummary(response.data?.summary || {});
    } catch (err: any) {
      setError(err?.message || "The shift could not be closed. Resolve the listed blocker and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const completeAndClose = () => {
    setHandoverNotes("");
    setSummary(null);
    setError(null);
    onClockOut();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <ClockIcon color="success" />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Finish Shift</Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          The server—not this checklist—decides whether the shift can close. It verifies active jobs, vehicle-return requirements, completed-job evidence, approved overtime, and current shift state.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!summary && (
          <Box sx={{ border: "1px solid #e2e8f0", borderRadius: 2, mb: 2 }}>
            <List disablePadding>
              <ListItem>
                <ListItemIcon><JobsIcon /></ListItemIcon>
                <ListItemText primary="Open work orders" secondary="Shift closure is blocked while assigned work remains active." />
              </ListItem>
              <ListItem>
                <ListItemIcon><VehicleIcon /></ListItemIcon>
                <ListItemText primary="Vehicle custody" secondary="Return is enforced only when the vehicle record requires end-of-shift return." />
              </ListItem>
              <ListItem>
                <ListItemIcon><OvertimeIcon /></ListItemIcon>
                <ListItemText primary="Overtime" secondary="Only approved overtime records are counted in the shift summary." />
              </ListItem>
              <ListItem>
                <ListItemIcon><ToolIcon /></ListItemIcon>
                <ListItemText primary="Tools and assets" secondary="The shift workflow will not invent an asset handover. Dedicated custody records remain authoritative." />
              </ListItem>
            </List>
          </Box>
        )}

        {summary && (
          <Alert severity="success" icon={<CheckIcon />} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Server verification passed</Typography>
            <Typography variant="body2">Jobs completed today: {summary.jobsCompleted ?? 0}</Typography>
            <Typography variant="body2">Completed jobs with photo evidence: {summary.completedJobsWithPhotoEvidence ?? 0}</Typography>
            <Typography variant="body2">Vehicle status: {summary.vehicleReturnStatus || "Not recorded"}</Typography>
            <Typography variant="body2">Approved overtime: {summary.approvedOvertimeMinutes ?? 0} minutes</Typography>
            <Typography variant="body2">Tool/asset verification: {summary.toolAssetVerificationStatus || "Not asserted"}</Typography>
            {Array.isArray(summary.warnings) && summary.warnings.map((warning) => (
              <Typography key={warning} variant="caption" sx={{ display: "block", mt: 0.5 }}>{warning}</Typography>
            ))}
          </Alert>
        )}

        {!summary && (
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Handover notes (optional)"
            placeholder="Record anything the next shift genuinely needs to know."
            value={handoverNotes}
            onChange={(event) => setHandoverNotes(event.target.value)}
          />
        )}
      </DialogContent>

      <DialogActions>
        {!summary ? (
          <>
            <Button disabled={submitting} onClick={close}>Cancel</Button>
            <Button
              variant="contained"
              color="success"
              disabled={submitting}
              onClick={() => void finishShift()}
              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <CheckIcon />}
            >
              {submitting ? "Verifying..." : "Verify & Finish Shift"}
            </Button>
          </>
        ) : (
          <Button variant="contained" color="success" onClick={completeAndClose}>Done</Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default FinishShiftChecklistModal;
