import React from "react";
import { Card, CardContent, Typography, Box, Stack, Chip, Stepper, Step, StepLabel } from "@mui/material";

export interface RequestStep {
  name: string;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING" | "REJECTED";
  time?: string;
}

interface UnifiedRequestStatusTrackerProps {
  title: string;
  steps: RequestStep[];
}

export const UnifiedRequestStatusTracker: React.FC<UnifiedRequestStatusTrackerProps> = ({ title, steps }) => {
  const activeStep = steps.findIndex((s) => s.status === "IN_PROGRESS");
  const currentStepIndex = activeStep !== -1 ? activeStep : steps.filter((s) => s.status === "COMPLETED").length;

  return (
    <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155", borderRadius: 3, mb: 2 }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#fff" }}>
            {title}
          </Typography>
          <Chip
            label={steps[currentStepIndex]?.name || "Active"}
            color="primary"
            size="small"
            sx={{ fontWeight: 700 }}
          />
        </Stack>

        <Stepper activeStep={currentStepIndex} alternativeLabel sx={{ mt: 1 }}>
          {steps.map((step, index) => (
            <Step key={step.name} completed={step.status === "COMPLETED"}>
              <StepLabel
                StepIconProps={{
                  sx: {
                    color: step.status === "COMPLETED" ? "#22c55e" : step.status === "IN_PROGRESS" ? "#3b82f6" : "#475569",
                  },
                }}
              >
                <Typography variant="caption" sx={{ color: "#f8fafc", fontWeight: 600, display: "block" }}>
                  {step.name}
                </Typography>
                {step.time && (
                  <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.65rem" }}>
                    {step.time}
                  </Typography>
                )}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </CardContent>
    </Card>
  );
};

export default UnifiedRequestStatusTracker;
