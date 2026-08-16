import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Stack,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  TextField,
  Chip,
  IconButton,
} from "@mui/material";
import {
  CheckCircle as CheckIcon,
  Close as CloseIcon,
  AccessTime as ClockIcon,
  DirectionsCar as VehicleIcon,
  Build as ToolIcon,
  ReceiptLong as AuditIcon,
} from "@mui/icons-material";

interface FinishShiftChecklistModalProps {
  open: boolean;
  onClose: () => void;
  onClockOut: () => void;
}

export const FinishShiftChecklistModal: React.FC<FinishShiftChecklistModalProps> = ({
  open,
  onClose,
  onClockOut,
}) => {
  const [checklist, setChecklist] = useState({
    jobsUpdated: true,
    vehicleReturned: true,
    photosUploaded: true,
    overtimeRecorded: true,
    toolsReturned: true,
  });
  const [handoverNotes, setHandoverNotes] = useState("");

  const allPassed = Object.values(checklist).every(Boolean);

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: { bgcolor: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 3 },
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <ClockIcon sx={{ color: "#22c55e" }} />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Finish Shift & Clean Clock-Out
          </Typography>
        </Stack>
        <IconButton onClick={onClose} sx={{ color: "#94a3b8" }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ color: "#94a3b8", mb: 2 }}>
          BIN GROUP is verifying end-of-shift evidence across all connected systems before completing your clock-out.
        </Typography>

        <Box sx={{ p: 2, bgcolor: "#1e293b", borderRadius: 2, border: "1px solid #334155", mb: 2 }}>
          <List disablePadding>
            <ListItem button onClick={() => toggleCheck("jobsUpdated")}>
              <ListItemIcon>
                <Checkbox checked={checklist.jobsUpdated} sx={{ color: "#22c55e" }} />
              </ListItemIcon>
              <ListItemText
                primary="All Assigned Jobs Updated & Closed"
                secondary="Villa 104 emergency repair completed with AI report"
                primaryTypographyProps={{ fontWeight: 700, color: "#fff" }}
                secondaryTypographyProps={{ color: "#94a3b8" }}
              />
            </ListItem>
            <ListItem button onClick={() => toggleCheck("vehicleReturned")}>
              <ListItemIcon>
                <Checkbox checked={checklist.vehicleReturned} sx={{ color: "#22c55e" }} />
              </ListItemIcon>
              <ListItemText
                primary="Vehicle Hilux 18 Returned to Depot"
                secondary="Fuel 82% • No new vehicle defects reported"
                primaryTypographyProps={{ fontWeight: 700, color: "#fff" }}
                secondaryTypographyProps={{ color: "#94a3b8" }}
              />
            </ListItem>
            <ListItem button onClick={() => toggleCheck("photosUploaded")}>
              <ListItemIcon>
                <Checkbox checked={checklist.photosUploaded} sx={{ color: "#22c55e" }} />
              </ListItemIcon>
              <ListItemText
                primary="Before & After Work Evidence Complete"
                secondary="2 Photos verified and stored on Property Passport"
                primaryTypographyProps={{ fontWeight: 700, color: "#fff" }}
                secondaryTypographyProps={{ color: "#94a3b8" }}
              />
            </ListItem>
            <ListItem button onClick={() => toggleCheck("overtimeRecorded")}>
              <ListItemIcon>
                <Checkbox checked={checklist.overtimeRecorded} sx={{ color: "#22c55e" }} />
              </ListItemIcon>
              <ListItemText
                primary="Overtime Evidence Recorded"
                secondary="1h 35m overtime approved by Supervisor"
                primaryTypographyProps={{ fontWeight: 700, color: "#fff" }}
                secondaryTypographyProps={{ color: "#94a3b8" }}
              />
            </ListItem>
            <ListItem button onClick={() => toggleCheck("toolsReturned")}>
              <ListItemIcon>
                <Checkbox checked={checklist.toolsReturned} sx={{ color: "#22c55e" }} />
              </ListItemIcon>
              <ListItemText
                primary="Toolbox & Test Equipment Check"
                secondary="All AC manifold gauges and tools accounted for"
                primaryTypographyProps={{ fontWeight: 700, color: "#fff" }}
                secondaryTypographyProps={{ color: "#94a3b8" }}
              />
            </ListItem>
          </List>
        </Box>

        <TextField
          fullWidth
          label="Handover Notes (Optional)"
          placeholder="Any notes for the night shift team..."
          value={handoverNotes}
          onChange={(e) => setHandoverNotes(e.target.value)}
          sx={{
            bgcolor: "#1e293b",
            borderRadius: 2,
            input: { color: "#fff" },
            "& .MuiOutlinedInput-root": { color: "#fff" },
            "& .MuiInputLabel-root": { color: "#94a3b8" },
          }}
        />
      </DialogContent>

      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={onClose} sx={{ color: "#94a3b8" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={!allPassed}
          onClick={onClockOut}
          startIcon={<CheckIcon />}
          sx={{ fontWeight: 800, py: 1.2, px: 3, borderRadius: 2, bgcolor: "#22c55e", "&:hover": { bgcolor: "#16a34a" } }}
        >
          Confirm & Clock Out
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FinishShiftChecklistModal;
