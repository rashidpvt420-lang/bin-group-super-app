import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Stack,
  IconButton,
  CircularProgress,
  Chip,
  Card,
  CardContent,
} from "@mui/material";
import {
  Mic as MicIcon,
  MicOff as MicOffIcon,
  AutoAwesome as AiIcon,
  Check as CheckIcon,
  Close as CloseIcon,
} from "@mui/icons-material";

interface StaffVoicePaperworkDialogProps {
  open: boolean;
  jobId: string;
  onClose: () => void;
  onConfirmed: () => void;
}

export const StaffVoicePaperworkDialog: React.FC<StaffVoicePaperworkDialogProps> = ({
  open,
  jobId,
  onClose,
  onConfirmed,
}) => {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<any | null>(null);

  const toggleListen = () => {
    if (listening) {
      setListening(false);
    } else {
      setListening(true);
      // Simulated speech-to-text input
      setTimeout(() => {
        setText("The compressor was damaged, I replaced it and pressure tested the AC unit at 18°C.");
        setListening(false);
      }, 2500);
    }
  };

  const handleGenerateAiReport = () => {
    if (!text.trim()) return;
    setGenerating(true);
    setTimeout(() => {
      setReport({
        summary: text,
        actionTaken: "Replaced faulty compressor unit and performed pressure testing.",
        materialsUsed: ["AC Compressor 2.5HP", "R410A Refrigerant 1kg"],
        qualityVerification: "PASSED — Cooling output verified at 18°C.",
        slaStatus: "ACHIEVED",
        connectedRecordsUpdated: ["Maintenance Ticket", "Property Passport", "Inventory Ledger", "SLA Reporting"],
      });
      setGenerating(false);
    }, 1500);
  };

  const handleConfirm = () => {
    onConfirmed();
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
          <AiIcon sx={{ color: "#38bdf8" }} />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            BIN AI — Voice Paperwork Elimination
          </Typography>
        </Stack>
        <IconButton onClick={onClose} sx={{ color: "#94a3b8" }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ color: "#94a3b8", mb: 2 }}>
          Speak or type what you did for Job <strong>#{jobId}</strong>. BIN AI will format the formal report and update all connected records.
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <TextField
            fullWidth
            multiline
            rows={3}
            placeholder="e.g. The compressor was damaged, I replaced it and tested the unit..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            sx={{
              bgcolor: "#1e293b",
              borderRadius: 2,
              input: { color: "#fff" },
              "& .MuiOutlinedInput-root": { color: "#fff" },
            }}
          />
          <IconButton
            onClick={toggleListen}
            sx={{
              bgcolor: listening ? "#ef4444" : "#3b82f6",
              color: "#fff",
              p: 2,
              "&:hover": { bgcolor: listening ? "#dc2626" : "#2563eb" },
            }}
          >
            {listening ? <MicOffIcon /> : <MicIcon />}
          </IconButton>
        </Stack>

        {!report && (
          <Button
            fullWidth
            variant="contained"
            disabled={!text.trim() || generating}
            onClick={handleGenerateAiReport}
            startIcon={generating ? <CircularProgress size={20} color="inherit" /> : <AiIcon />}
            sx={{ py: 1.2, fontWeight: 700, borderRadius: 2, bgcolor: "#3b82f6" }}
          >
            {generating ? "BIN AI Generating Report..." : "Generate AI Structured Report"}
          </Button>
        )}

        {report && (
          <Card sx={{ bgcolor: "#1e293b", border: "1px solid #38bdf8", borderRadius: 2, mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "#38bdf8", mb: 1 }}>
                AI Generated Maintenance Report
              </Typography>
              <Typography variant="body2" sx={{ color: "#f8fafc", mb: 1 }}>
                <strong>Action Taken:</strong> {report.actionTaken}
              </Typography>
              <Typography variant="body2" sx={{ color: "#f8fafc", mb: 1 }}>
                <strong>Quality Verification:</strong> {report.qualityVerification}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}>
                {report.materialsUsed.map((m: string) => (
                  <Chip key={m} label={`Used: ${m}`} size="small" color="primary" />
                ))}
              </Stack>

              <Box sx={{ mt: 2, p: 1.5, bgcolor: "#0f172a", borderRadius: 1.5 }}>
                <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                  Connected Systems Auto-Updating:
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                  {report.connectedRecordsUpdated.map((rec: string) => (
                    <Chip key={rec} label={rec} size="small" variant="outlined" sx={{ color: "#38bdf8", borderColor: "#38bdf8" }} />
                  ))}
                </Stack>
              </Box>
            </CardContent>
          </Card>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={onClose} sx={{ color: "#94a3b8" }}>
          Cancel
        </Button>
        {report && (
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirm}
            startIcon={<CheckIcon />}
            sx={{ fontWeight: 700, borderRadius: 2, bgcolor: "#22c55e", "&:hover": { bgcolor: "#16a34a" } }}
          >
            Confirm & Complete Job
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default StaffVoicePaperworkDialog;
