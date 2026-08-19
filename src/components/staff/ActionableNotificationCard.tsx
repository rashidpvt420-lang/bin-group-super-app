import React from "react";
import { Card, CardContent, Typography, Stack, Button, Box, Avatar } from "@mui/material";
import { NotificationsActive as AlertIcon } from "@mui/icons-material";

interface ActionableNotificationCardProps {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

export const ActionableNotificationCard: React.FC<ActionableNotificationCardProps> = ({
  title,
  message,
  actionLabel,
  onAction,
}) => {
  return (
    <Card sx={{ bgcolor: "#1e293b", border: "1px solid #f59e0b", borderRadius: 3, mb: 2 }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Avatar sx={{ bgcolor: "#f59e0b", color: "#fff" }}>
            <AlertIcon />
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#fff" }}>
              {title}
            </Typography>
            <Typography variant="body2" sx={{ color: "#cbd5e1", mt: 0.5, mb: 2 }}>
              {message}
            </Typography>

            <Button
              variant="contained"
              size="small"
              onClick={onAction}
              sx={{ bgcolor: "#f59e0b", color: "#0f172a", fontWeight: 800, "&:hover": { bgcolor: "#d97706" } }}
            >
              {actionLabel}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default ActionableNotificationCard;
