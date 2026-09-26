import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Grid, Paper, Stack, Typography } from '@mui/material';
import { FileText, FolderOpen, ShieldCheck } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { listUnifiedDocumentVault, openUnifiedDocument, type UnifiedVaultArtifact } from '../../services/unifiedDocumentVault';

export default function TenantDocumentsPage() {
  const [documents, setDocuments] = useState<UnifiedVaultArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listUnifiedDocumentVault()
      .then((items) => {
        if (!cancelled) {
          setDocuments(items);
          setError('');
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setDocuments([]);
          setError(err?.message || 'Unable to load document vault.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const openDocument = async (artifactId: string) => {
    setOpening(artifactId);
    setError('');
    try {
      await openUnifiedDocument(artifactId);
    } catch (err: any) {
      setError(err?.message || 'Document access failed.');
    } finally {
      setOpening(null);
    }
  };

  if (loading) {
    return <Box sx={{ py: 10, display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Box sx={{ pb: 6 }}>
      <Typography variant="h4" fontWeight={950} color="#FFF">Tenant Document Vault</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.55)', mt: 1, mb: 4 }}>Lease, handover and approved property documents authorized for this Tenant.</Typography>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {documents.length === 0 ? (
        <Paper sx={{ p: 7, textAlign: 'center', bgcolor: 'rgba(15,23,42,.45)', border: '1px dashed rgba(255,255,255,.08)', borderRadius: 5 }}>
          <FolderOpen size={44} color="rgba(255,255,255,.15)" />
          <Typography sx={{ mt: 2, color: 'rgba(255,255,255,.55)', fontWeight: 900 }}>NO AUTHORIZED DOCUMENTS YET</Typography>
        </Paper>
      ) : (
        <Grid container spacing={2.5}>
          {documents.map((doc) => (
            <Grid item xs={12} md={6} key={doc.artifactId}>
              <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.55)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <FileText size={20} color={binThemeTokens.gold} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography color="#FFF" fontWeight={900} noWrap>{doc.title}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.4)' }}>{doc.sourceCollection} · {doc.sourceId}</Typography>
                  </Box>
                  <ShieldCheck size={16} color="#10b981" />
                </Stack>
                <Button
                  fullWidth
                  variant="outlined"
                  sx={{ mt: 2.5, color: binThemeTokens.gold, borderColor: 'rgba(198,167,94,.35)', fontWeight: 900 }}
                  disabled={!doc.storagePath || opening === doc.artifactId}
                  onClick={() => void openDocument(doc.artifactId)}
                >
                  {opening === doc.artifactId ? <CircularProgress size={18} color="inherit" /> : doc.storagePath ? 'OPEN AUTHORIZED FILE' : 'METADATA ONLY'}
                </Button>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
