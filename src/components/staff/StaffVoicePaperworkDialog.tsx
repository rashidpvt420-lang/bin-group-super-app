import React, { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Check as CheckIcon,
  Close as CloseIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Preview as PreviewIcon,
} from "@mui/icons-material";
import { functions, httpsCallable } from "../../lib/firebase";

interface StaffVoicePaperworkDialogProps {
  open: boolean;
  jobId: string;
  onClose: () => void;
  onConfirmed: () => void;
}

interface WorkReportPreview {
  summary?: string;
  proposedMaterials?: string[];
  workOrderStatus?: string;
  assignmentVerified?: boolean;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export const StaffVoicePaperworkDialog: React.FC<StaffVoicePaperworkDialogProps> = ({
  open,
  jobId,
  onClose,
  onConfirmed,
}) => {
  const [listening, setListening] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognitionLike | null>(null);
  const [text, setText] = useState("");
  const [materialsText, setMaterialsText] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [report, setReport] = useState<WorkReportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const proposedMaterials = useMemo(
    () => materialsText.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20),
    [materialsText],
  );

  const closeAndReset = () => {
    recognition?.stop();
    setListening(false);
    setRecognition(null);
    setText("");
    setMaterialsText("");
    setReport(null);
    setError(null);
    onClose();
  };

  const toggleListen = () => {
    if (listening && recognition) {
      recognition.stop();
      return;
    }

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError("Voice dictation is not supported by this browser. Type the work summary instead.");
      return;
    }

    try {
      const instance: SpeechRecognitionLike = new SpeechRecognitionCtor();
      instance.lang = document.documentElement.lang?.startsWith("ar") ? "ar-AE" : "en-AE";
      instance.interimResults = false;
      instance.continuous = true;
      instance.onresult = (event: any) => {
        const chunks: string[] = [];
        for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
          const transcript = String(event.results[i]?.[0]?.transcript || "").trim();
          if (transcript) chunks.push(transcript);
        }
        if (chunks.length) {
          setText((current) => [current.trim(), chunks.join(" ")].filter(Boolean).join(" "));
        }
      };
      instance.onerror = (event: any) => {
        setError(`Voice dictation failed${event?.error ? `: ${event.error}` : "."}`);
        setListening(false);
      };
      instance.onend = () => {
        setListening(false);
        setRecognition(null);
      };
      setRecognition(instance);
      setListening(true);
      setError(null);
      instance.start();
    } catch (err: any) {
      setListening(false);
      setRecognition(null);
      setError(err?.message || "Unable to start voice dictation.");
    }
  };

  const preparePreview = async () => {
    if (!jobId || text.trim().length < 3) {
      setError("Enter a meaningful work summary before preparing the report.");
      return;
    }

    setPreviewing(true);
    setError(null);
    try {
      const prepareReport = httpsCallable(functions, "completeStaffJobWithAi");
      const response: any = await prepareReport({
        jobId,
        rawSpokenText: text.trim(),
        proposedMaterials,
        confirmCompletion: false,
      });
      setReport(response.data?.report || { summary: text.trim(), proposedMaterials });
    } catch (err: any) {
      setReport(null);
      setError(err?.message || "The server could not prepare this completion report.");
    } finally {
      setPreviewing(false);
    }
  };

  const confirmCompletion = async () => {
    if (!report) return;
    setConfirming(true);
    setError(null);
    try {
      const completeJob = httpsCallable(functions, "completeStaffJobWithAi");
      await completeJob({
        jobId,
        rawSpokenText: text.trim(),
        proposedMaterials,
        confirmCompletion: true,
      });
      setText("");
      setMaterialsText("");
      setReport(null);
      onConfirmed();
    } catch (err: any) {
      setError(err?.message || "The work order could not be completed. Check required evidence and job status.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={closeAndReset}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { bgcolor: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 3 } }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Voice / Text Work Report</Typography>
        <IconButton onClick={closeAndReset} sx={{ color: "#94a3b8" }}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ color: "#94a3b8", mb: 2 }}>
          Describe the work performed for <strong>#{jobId}</strong>. The server verifies assignment and job state before preparing or confirming completion.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 2 }}>
          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Work summary"
            placeholder="Describe the problem found, work performed, testing, and result."
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setReport(null);
            }}
            sx={{ bgcolor: "#1e293b", borderRadius: 2, "& .MuiOutlinedInput-root": { color: "#fff" }, "& .MuiInputLabel-root": { color: "#94a3b8" } }}
          />
          <IconButton
            aria-label={listening ? "Stop voice dictation" : "Start voice dictation"}
            onClick={toggleListen}
            sx={{ bgcolor: listening ? "#ef4444" : "#3b82f6", color: "#fff", mt: 1 }}
          >
            {listening ? <MicOffIcon /> : <MicIcon />}
          </IconButton>
        </Stack>

        <TextField
          fullWidth
          label="Proposed materials (optional, comma separated)"
          value={materialsText}
          onChange={(event) => {
            setMaterialsText(event.target.value);
            setReport(null);
          }}
          helperText="This does not deduct stock. Inventory changes require a separate confirmed, server-validated transaction."
          sx={{ mb: 2, bgcolor: "#1e293b", borderRadius: 2, "& .MuiOutlinedInput-root": { color: "#fff" }, "& .MuiInputLabel-root": { color: "#94a3b8" }, "& .MuiFormHelperText-root": { color: "#94a3b8" } }}
        />

        {!report && (
          <Button
            fullWidth
            variant="contained"
            disabled={text.trim().length < 3 || previewing}
            onClick={() => void preparePreview()}
            startIcon={previewing ? <CircularProgress size={20} color="inherit" /> : <PreviewIcon />}
          >
            {previewing ? "Preparing..." : "Prepare Report Preview"}
          </Button>
        )}

        {report && (
          <Card sx={{ bgcolor: "#1e293b", color: "#fff", border: "1px solid #38bdf8", mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "#38bdf8", mb: 1 }}>Server-Verified Preview</Typography>
              <Typography variant="body2"><strong>Summary:</strong> {report.summary || text}</Typography>
              <Typography variant="body2" sx={{ mt: 1 }}><strong>Current work-order state:</strong> {report.workOrderStatus || "Verified by server"}</Typography>
              <Typography variant="body2" sx={{ mt: 1 }}><strong>Assignment:</strong> {report.assignmentVerified ? "Verified" : "Verification required"}</Typography>
              {Array.isArray(report.proposedMaterials) && report.proposedMaterials.length > 0 && (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5, mt: 1.5 }}>
                  {report.proposedMaterials.map((material) => <Chip key={material} label={`Proposed: ${material}`} size="small" />)}
                </Stack>
              )}
              <Alert severity="info" sx={{ mt: 2 }}>
                Confirming completes the work order only. Proposed materials do not change inventory until the separate stock-confirmation workflow succeeds.
              </Alert>
            </CardContent>
          </Card>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={closeAndReset}>Cancel</Button>
        {report && (
          <>
            <Button onClick={() => setReport(null)} disabled={confirming}>Edit</Button>
            <Button
              variant="contained"
              color="success"
              disabled={confirming}
              onClick={() => void confirmCompletion()}
              startIcon={confirming ? <CircularProgress size={20} color="inherit" /> : <CheckIcon />}
            >
              {confirming ? "Confirming..." : "Confirm Completion"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default StaffVoicePaperworkDialog;
