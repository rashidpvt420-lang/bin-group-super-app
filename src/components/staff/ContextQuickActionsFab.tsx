import React, { useState } from "react";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Drawer,
  Fab,
  Grid,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import {
  AccessTime as ClockIcon,
  CheckCircle as FinishIcon,
  Close as CloseIcon,
  Flag as ArriveIcon,
  FlashOn as QuickActionIcon,
  MoreTime as OvertimeIcon,
  NoCrash as BreakdownIcon,
  PlayArrow as StartIcon,
  ReportProblem as AccidentIcon,
} from "@mui/icons-material";

interface ContextQuickActionsFabProps {
  activeJobId?: string | null;
  assignedVehicleId?: string | null;
  clockedIn?: boolean;
  activeJobStatus?: string | null;
  busy?: boolean;
  onTriggerAction?: (actionType: string) => void;
}

interface QuickActionDefinition {
  type: string;
  title: string;
  icon: React.ReactNode;
  enabled: boolean;
  unavailableReason: string;
}

export const ContextQuickActionsFab: React.FC<ContextQuickActionsFabProps> = ({
  activeJobId = null,
  assignedVehicleId = null,
  clockedIn = false,
  activeJobStatus = null,
  busy = false,
  onTriggerAction,
}) => {
  const [open, setOpen] = useState(false);
  const normalizedJobStatus = String(activeJobStatus || "").toUpperCase();

  const quickActions: QuickActionDefinition[] = [
    {
      type: "CLOCK_IN_OUT",
      title: clockedIn ? "Finish Shift" : "Clock In",
      icon: <ClockIcon />,
      enabled: true,
      unavailableReason: "",
    },
    {
      type: "ARRIVE",
      title: "Arrive",
      icon: <ArriveIcon />,
      enabled: Boolean(activeJobId) && ["ASSIGNED", "EN_ROUTE", "ON_THE_WAY"].includes(normalizedJobStatus),
      unavailableReason: activeJobId ? "Arrival is not valid from the current job status." : "No active job assigned.",
    },
    {
      type: "START_JOB",
      title: "Start Job",
      icon: <StartIcon />,
      enabled: Boolean(activeJobId) && normalizedJobStatus === "ARRIVED",
      unavailableReason: activeJobId ? "Mark Arrived before starting work." : "No active job assigned.",
    },
    {
      type: "FINISH_JOB",
      title: "Finish Job",
      icon: <FinishIcon />,
      enabled: Boolean(activeJobId) && ["ARRIVED", "IN_PROGRESS"].includes(normalizedJobStatus),
      unavailableReason: activeJobId ? "The job is not ready for completion." : "No active job assigned.",
    },
    {
      type: "REQUEST_OVERTIME",
      title: "Request Overtime",
      icon: <OvertimeIcon />,
      enabled: clockedIn,
      unavailableReason: "Clock in before requesting overtime.",
    },
    {
      type: "VEHICLE_BREAKDOWN",
      title: "Vehicle Breakdown",
      icon: <BreakdownIcon />,
      enabled: Boolean(assignedVehicleId),
      unavailableReason: "No vehicle is assigned to you.",
    },
    {
      type: "ACCIDENT_REPORT",
      title: "Accident Report",
      icon: <AccidentIcon />,
      enabled: Boolean(assignedVehicleId),
      unavailableReason: "No vehicle is assigned to you.",
    },
  ];

  const handleSelect = (action: QuickActionDefinition) => {
    if (!action.enabled || busy) return;
    setOpen(false);
    onTriggerAction?.(action.type);
  };

  return (
    <>
      <Fab
        color="primary"
        aria-label="Open staff quick actions"
        disabled={busy}
        onClick={() => setOpen(true)}
        sx={{ position: "fixed", bottom: 24, right: 24, bgcolor: "#3b82f6" }}
      >
        <QuickActionIcon />
      </Fab>

      <Drawer
        anchor="bottom"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: "#0f172a",
            color: "#fff",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            p: 3,
            maxHeight: "85vh",
          },
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Quick Actions</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}>
              <Chip size="small" label={`Job: ${activeJobId || "None assigned"}`} />
              <Chip size="small" label={`Vehicle: ${assignedVehicleId || "None assigned"}`} />
            </Stack>
            <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.75 }}>
              IDs are verified again by the server before authoritative changes are accepted.
            </Typography>
          </Box>
          <IconButton aria-label="Close quick actions" onClick={() => setOpen(false)} sx={{ color: "#94a3b8" }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        <Grid container spacing={2}>
          {quickActions.map((action) => (
            <Grid item xs={6} sm={4} md={3} key={action.type}>
              <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155", borderRadius: 3, height: "100%" }}>
                <CardActionArea
                  disabled={!action.enabled || busy}
                  onClick={() => handleSelect(action)}
                  sx={{ p: 2, textAlign: "center", height: "100%" }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      bgcolor: action.enabled ? "#3b82f6" : "#475569",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mx: "auto",
                      mb: 1.5,
                    }}
                  >
                    {action.icon}
                  </Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#fff" }}>{action.title}</Typography>
                  {!action.enabled && (
                    <Typography variant="caption" sx={{ display: "block", color: "#94a3b8", mt: 0.75 }}>
                      {action.unavailableReason}
                    </Typography>
                  )}
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Drawer>
    </>
  );
};

export default ContextQuickActionsFab;
