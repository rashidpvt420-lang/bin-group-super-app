import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography } from '@mui/material';
import { FileText, FolderOpen, ShieldCheck } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { listUnifiedDocumentVault, openUnifiedDocument, type UnifiedVaultArtifact } from '../services/unifiedDocumentVault';

export default function UnifiedDocumentVault({ title = 'Documents', subtitle }: { title?: string; subtitle?: string }) {
  const [items, setItems] = useState<UnifiedVaultArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listUnifiedDocumentVault()
      .then((artifacts) => {
        if (!cancelled) {
          setItems(artifacts);
          setError('');
        }
      })
      .catch((err) => {
        console.error('[UnifiedDocumentVault] load failed', err);
        if (!cancelled) setError(err?.message || 'Unable to load your authorized documents.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const open = async (artifactId: string) => {
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
    <Box data-testid="unified-document-vault">
      <Typography variant="h4" fontWeight={950} color="#FFF">{title}</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.55)', mt: 1, mb: 4 }}>
        {subtitle || 'Role-authorized documents linked by canonical record IDs. File access is granted only after a fresh server authorization check.'}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {items.length === 0 ? (
        <Paper sx={{ p: 7, textAlign: 'center', bgcolor: 'rgba(15,23,42,.45)', border: '1px dashed rgba(255,255,255,.08)', borderRadius: 5 }}>
          <FolderOpen size={44} color="rgba(255,255,255,.15)" />
          <Typography sx={{ mt: 2, color: 'rgba(255,255,255,.55)', fontWeight: 900 }}>NO AUTHORIZED DOCUMENTS YET</Typography>
        </Paper>
      ) : (
        <Grid container spacing={2.5}>
          {items.map((item) => (
            <Grid item xs={12} sm={6} lg={4} key={item.artifactId}>
              <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.55)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4, height: '100%' }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: 'rgba(198,167,94,.12)', color: binThemeTokens.gold }}><FileText size={20} /></Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography color="#FFF" fontWeight={900} noWrap>{item.title}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.4)' }}>
                      {item.sourceCollection} · {item.sourceId}
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 2.5, mb: 2.5 }} flexWrap="wrap">
                  <Chip size="small" label={item.category.replace(/_/g, ' ').toUpperCase()} />
                  <Chip size="small" icon={<ShieldCheck size={12} />} label={item.status || 'ACTIVE'} sx={{ color: '#10b981' }} />
                </Stack>
                <Button
                  fullWidth
                  variant="outlined"
                  disabled={!item.storagePath || opening === item.artifactId}
                  onClick={() => void open(item.artifactId)}
                  sx={{ color: binThemeTokens.gold, borderColor: 'rgba(198,167,94,.35)', fontWeight: 900 }}
                >
                  {opening === item.artifactId ? <CircularProgress size={18} color="inherit" /> : item.storagePath ? 'OPEN AUTHORIZED FILE' : 'METADATA ONLY'}
                </Button>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
