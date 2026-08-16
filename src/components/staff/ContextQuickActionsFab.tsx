import React, { useState } from "react";
import {
  Fab,
  Drawer,
  Box,
  Typography,
  Grid,
  Card,
  CardActionArea,
  CardContent,
  Stack,
  IconButton,
  Chip,
} from "@mui/material";
import {
  FlashOn as QuickActionIcon,
  Close as CloseIcon,
  AccessTime as ClockIcon,
  PlayArrow as StartIcon,
  CheckCircle as FinishIcon,
  MoreTime as OvertimeIcon,
  EventNote as LeaveIcon,
  Build as MaterialIcon,
  NoCrash as BreakdownIcon,
  ReportProblem as AccidentIcon,
  ReceiptLong as ExpenseIcon,
  Chat as MessageIcon,
  Psychology as AiIcon,
  Sos as SosIcon,
} from "@mui/icons-material";

interface ContextQuickActionsFabProps {
  activeJobId?: string | null;
  assignedVehicleId?: string | null;
  onTriggerAction?: (actionType: string) => void;
}

export const ContextQuickActionsFab: React.FC<ContextQuickActionsFabProps> = ({
  activeJobId = "JOB-184",
  assignedVehicleId = "Hilux 18",
  onTriggerAction,
}) => {
  const [open, setOpen] = useState(false);

  const quickActions = [
    { type: "CLOCK_IN_OUT", title: "Clock In / Out", icon: <ClockIcon />, color: "#3b82f6" },
    { type: "START_JOB", title: "Start Job", icon: <StartIcon />, color: "#22c55e" },
    { type: "FINISH_JOB", title: "Finish Job (AI)", icon: <FinishIcon />, color: "#10b981" },
    { type: "REQUEST_OVERTIME", title: "Request Overtime", icon: <OvertimeIcon />, color: "#8b5cf6" },
    { type: "NEED_MATERIAL", title: "Need Material", icon: <MaterialIcon />, color: "#f59e0b" },
    { type: "VEHICLE_BREAKDOWN", title: "Vehicle Breakdown", icon: <BreakdownIcon />, color: "#ef4444" },
    { type: "ACCIDENT_REPORT", title: "Accident Report", icon: <AccidentIcon />, color: "#dc2626" },
    { type: "REQUEST_LEAVE", title: "Request Leave", icon: <LeaveIcon />, color: "#06b6d4" },
    { type: "EXPENSE_CLAIM", title: "Expense Claim", icon: <ExpenseIcon />, color: "#ec4899" },
    { type: "ASK_BIN_AI", title: "Ask BIN AI", icon: <AiIcon />, color: "#6366f1" },
    { type: "EMERGENCY_SOS", title: "Emergency SOS", icon: <SosIcon />, color: "#b91c1c" },
  ];

  const handleSelect = (actionType: string) => {
    setOpen(false);
    if (onTriggerAction) {
      onTriggerAction(actionType);
    }
  };

  return (
    <>
      <Fab
        color="primary"
        onClick={() => setOpen(true)}
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          bgcolor: "#3b82f6",
          "&:hover": { bgcolor: "#2563eb" },
          boxShadow: "0 8px 20px rgba(59, 130, 246, 0.4)",
        }}
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
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Context-Aware Quick Actions
            </Typography>
            <Typography variant="caption" sx={{ color: "#94a3b8" }}>
              Prefilled: Vehicle {assignedVehicleId} • Job {activeJobId || "None"} • Dubai GPS
            </Typography>
          </Box>
          <IconButton onClick={() => setOpen(false)} sx={{ color: "#94a3b8" }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        <Grid container spacing={2}>
          {quickActions.map((action) => (
            <Grid item xs={6} sm={4} md={3} key={action.type}>
              <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155", borderRadius: 3 }}>
                <CardActionArea onClick={() => handleSelect(action.type)} sx={{ p: 2, textAlign: "center" }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      bgcolor: action.color,
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
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#fff" }}>
                    {action.title}
                  </Typography>
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
