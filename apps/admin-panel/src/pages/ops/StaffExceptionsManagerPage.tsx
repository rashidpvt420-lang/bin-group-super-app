import React, { useState } from "react";
import {
  Box,
  Container,
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
  Badge,
} from "@mui/material";
import {
  Warning as ExceptionIcon,
  CheckCircle as ApproveIcon,
  Cancel as ResolveIcon,
  Notifications as AlertIcon,
  DirectionsCar as FleetIcon,
  People as HrIcon,
  ReceiptLong as FinanceIcon,
  AutoAwesome as AiIcon,
} from "@mui/icons-material";

export const StaffExceptionsManagerPage: React.FC = () => {
  const [exceptions, setExceptions] = useState([
    {
      id: "EXC-101",
      staffName: "Ahmed Al-Mansoori",
      role: "Technician",
      type: "UNUSUAL_OVERTIME",
      details: "Claimed 1h 35m for emergency AC repair Villa 104.",
      department: "HR / Operations",
      status: "OPEN",
      time: "10 mins ago",
    },
    {
      id: "EXC-102",
      staffName: "Khalid Omer",
      role: "Driver",
      type: "VEHICLE_BREAKDOWN",
      details: "Vehicle Hilux 18 reported breakdown in Al Barsha.",
      department: "Fleet / Operations",
      status: "OPEN",
      time: "25 mins ago",
    },
    {
      id: "EXC-103",
      staffName: "Fatima Al-Nuaimi",
      role: "Coordinator",
      type: "MISSING_CLOCK_OUT",
      details: "Shift ended 17:00; no clock-out recorded by system.",
      department: "HR",
      status: "OPEN",
      time: "1 hour ago",
    },
    {
      id: "EXC-104",
      staffName: "Saeed Rashidi",
      role: "Senior Tech",
      type: "EXPIRING_EMIRATES_ID",
      details: "Emirates ID expires in 12 days. Reminder dispatched.",
      department: "HR / Compliance",
      status: "OPEN",
      time: "3 hours ago",
    },
  ]);

  const handleResolve = (id: string) => {
    setExceptions((prev) => prev.map((e) => (e.id === id ? { ...e, status: "RESOLVED" } : e)));
  };

  const openCount = exceptions.filter((e) => e.status === "OPEN").length;

  return (
    <Box sx={{ p: 4, bgcolor: "#0f172a", color: "#f8fafc", minHeight: "100vh" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4" sx={{ fontWeight: 900, color: "#fff" }}>
              Staff Exceptions & Multi-Dept Control
            </Typography>
            <Chip
              label={`${openCount} OPEN EXCEPTIONS`}
              color={openCount > 0 ? "error" : "success"}
              sx={{ fontWeight: 800 }}
            />
          </Stack>
          <Typography variant="body2" sx={{ color: "#94a3b8", mt: 0.5 }}>
            Exception-based management: 94% of normal workforce operations process automatically. Only flagged cases require human action.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AiIcon />}
          sx={{ bgcolor: "#3b82f6", fontWeight: 700, borderRadius: 2 }}
          onClick={() => alert("BIN AI cross-department automation sweep completed.")}
        >
          Run AI Multi-Dept Audit
        </Button>
      </Stack>

      {/* Exception Counters */}
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
                    2
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                    1 Missing Clock-out • 1 Overtime Claim
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
                    FLEET & INCIDENTS
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, color: "#fff", my: 0.5 }}>
                    1
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                    1 Breakdown hold active
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
          <Card sx={{ bgcolor: "#1e293b", border: "1px solid #38bdf8", borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" sx={{ color: "#38bdf8", fontWeight: 700 }}>
                    COMPLIANCE & DOCUMENTS
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, color: "#fff", my: 0.5 }}>
                    1
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                    1 Expiring Emirates ID
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: "#38bdf8", width: 48, height: 48 }}>
                  <FinanceIcon />
                </Avatar>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Exception Table */}
      <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155", borderRadius: 3 }}>
        <CardContent sx={{ p: 0 }}>
          <Table>
            <TableHead sx={{ bgcolor: "#0f172a" }}>
              <TableRow>
                <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>ID</TableCell>
                <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>Staff Member</TableCell>
                <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>Exception Type</TableCell>
                <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>Details</TableCell>
                <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>Department</TableCell>
                <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }} align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {exceptions.map((row) => (
                <TableRow key={row.id} sx={{ "&:hover": { bgcolor: "#334155" } }}>
                  <TableCell sx={{ color: "#38bdf8", fontWeight: 700 }}>{row.id}</TableCell>
                  <TableCell sx={{ color: "#fff", fontWeight: 700 }}>
                    {row.staffName}
                    <Typography variant="caption" sx={{ display: "block", color: "#94a3b8" }}>
                      {row.role}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={row.type} color="warning" size="small" sx={{ fontWeight: 700 }} />
                  </TableCell>
                  <TableCell sx={{ color: "#cbd5e1" }}>{row.details}</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>{row.department}</TableCell>
                  <TableCell>
                    <Chip
                      label={row.status}
                      color={row.status === "OPEN" ? "error" : "success"}
                      size="small"
                      sx={{ fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {row.status === "OPEN" ? (
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={() => handleResolve(row.id)}
                        sx={{ fontWeight: 700, borderRadius: 1.5 }}
                      >
                        Approve / Resolve
                      </Button>
                    ) : (
                      <Typography variant="caption" sx={{ color: "#22c55e", fontWeight: 700 }}>
                        Resolved
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
};

export default StaffExceptionsManagerPage;
