/**
 * BIN GROUP — OwnerTicketEvidencePanel
 * Shows the before/after photos, notes and materials the technician actually
 * recorded on a maintenance ticket. Evidence is resolved from every writer
 * field (see ownerTicketEvidence.mjs). Nothing is fabricated: when no evidence
 * exists an explicit empty state is shown, and when a recorded photo cannot be
 * loaded (for example Storage access is denied) that failure is shown instead
 * of a blank tile. Storage-path-only evidence is resolved through the Storage
 * SDK under the existing security rules; rules are never bypassed.
 */
import React, { useEffect, useState } from 'react';
import { Box, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { AlertCircle, Camera, ShieldCheck, Wrench } from 'lucide-react';
import { getDownloadURL, ref, storage } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import type { OwnerTicketEvidence, OwnerTicketEvidenceItem } from '../utils/ownerTicketEvidence.mjs';

type PhotoState = { status: 'loading' | 'ready' | 'denied' | 'failed'; url: string | null };

function EvidencePhoto({ item, label }: { item: OwnerTicketEvidenceItem; label: string }) {
    const { tx } = useLanguage();
    const [state, setState] = useState<PhotoState>(() => (
        item.url ? { status: 'ready', url: item.url } : { status: 'loading', url: null }
    ));

    useEffect(() => {
        let cancelled = false;
        if (item.url) {
            setState({ status: 'ready', url: item.url });
            return undefined;
        }
        if (!item.storagePath) {
            setState({ status: 'failed', url: null });
            return undefined;
        }
        setState({ status: 'loading', url: null });
        getDownloadURL(ref(storage, item.storagePath))
            .then((url) => { if (!cancelled) setState({ status: 'ready', url }); })
            .catch((err: any) => {
                if (cancelled) return;
                const code = String(err?.code || '');
                setState({ status: code.includes('unauthorized') || code.includes('permission') ? 'denied' : 'failed', url: null });
            });
        return () => { cancelled = true; };
    }, [item.url, item.storagePath]);

    const tileSx = {
        width: 132,
        height: 100,
        borderRadius: 2,
        border: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
    } as const;

    if (state.status === 'ready' && state.url) {
        const url = state.url;
        return (
            <Box
                component="img"
                src={url}
                alt={label}
                loading="lazy"
                data-testid="owner-ticket-evidence-photo"
                onError={() => setState({ status: 'failed', url: null })}
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                sx={{ ...tileSx, objectFit: 'cover', cursor: 'pointer', bgcolor: 'rgba(255,255,255,0.04)' }}
            />
        );
    }

    return (
        <Stack
            alignItems="center"
            justifyContent="center"
            spacing={0.5}
            data-testid="owner-ticket-evidence-photo-unavailable"
            sx={{ ...tileSx, bgcolor: 'rgba(255,255,255,0.03)', px: 1, textAlign: 'center' }}
        >
            <AlertCircle size={18} color="rgba(255,255,255,0.45)" />
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 800, lineHeight: 1.2 }}>
                {state.status === 'loading'
                    ? tx('owner.ticket.evidence.loading', 'Loading recorded photo…')
                    : state.status === 'denied'
                        ? tx('owner.ticket.evidence.denied', 'Photo recorded — access denied')
                        : tx('owner.ticket.evidence.failed', 'Photo recorded — could not load')}
            </Typography>
        </Stack>
    );
}

function EvidenceColumn({
    title,
    items,
    emptyText,
    confirmed,
    labelPrefix,
    testId,
}: {
    title: string;
    items: OwnerTicketEvidenceItem[];
    emptyText: string;
    confirmed: boolean;
    labelPrefix: string;
    testId: string;
}) {
    const { tx } = useLanguage();
    return (
        <Box data-testid={testId}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 950, letterSpacing: 1 }}>
                    {title} ({items.length})
                </Typography>
                {confirmed && items.length > 0 && (
                    <Chip
                        size="small"
                        icon={<ShieldCheck size={12} />}
                        label={tx('owner.ticket.evidence.server_confirmed', 'Server-confirmed')}
                        sx={{ height: 20, bgcolor: alpha('#10b981', 0.12), color: '#10b981', fontWeight: 900, fontSize: '0.62rem', '& .MuiChip-icon': { color: 'inherit' } }}
                    />
                )}
            </Stack>
            {items.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1 }}>
                    {items.map((item, index) => (
                        <EvidencePhoto
                            key={item.storagePath || item.url || `${testId}-${index}`}
                            item={item}
                            label={`${labelPrefix} ${index + 1}`}
                        />
                    ))}
                </Stack>
            ) : (
                <Typography variant="body2" data-testid={`${testId}-empty`} sx={{ color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>
                    {emptyText}
                </Typography>
            )}
        </Box>
    );
}

export default function OwnerTicketEvidencePanel({ evidence }: { evidence: OwnerTicketEvidence }) {
    const { tx } = useLanguage();
    return (
        <Paper
            data-testid="owner-ticket-evidence"
            sx={{ p: 4, mb: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}
        >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
                <Camera size={16} color={binThemeTokens.gold} />
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>
                    {tx('owner.ticket.evidence.title', 'WORK EVIDENCE')}
                </Typography>
            </Stack>

            {!evidence.hasAnyEvidence && (
                <Typography variant="body2" data-testid="owner-ticket-evidence-none" sx={{ color: 'rgba(255,255,255,0.55)', mb: 3 }}>
                    {tx('owner.ticket.evidence.none', 'No technician evidence has been recorded for this ticket yet.')}
                </Typography>
            )}

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <EvidenceColumn
                        title={tx('owner.ticket.evidence.before', 'BEFORE / REQUEST EVIDENCE')}
                        items={evidence.before}
                        emptyText={tx('owner.ticket.evidence.before_empty', 'No before photo was recorded.')}
                        confirmed={evidence.beforeEvidenceConfirmed}
                        labelPrefix="Before"
                        testId="owner-ticket-evidence-before"
                    />
                </Grid>
                <Grid item xs={12} md={6}>
                    <EvidenceColumn
                        title={tx('owner.ticket.evidence.after', 'AFTER / COMPLETION PROOF')}
                        items={evidence.after}
                        emptyText={tx('owner.ticket.evidence.after_empty', 'No after-work photo was recorded.')}
                        confirmed={evidence.afterEvidenceConfirmed}
                        labelPrefix="After"
                        testId="owner-ticket-evidence-after"
                    />
                </Grid>
            </Grid>

            <Box
                data-testid="owner-ticket-evidence-notes"
                sx={{ mt: 3, p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}
            >
                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>
                    {tx('owner.ticket.tech_notes', 'TECHNICIAN RESOLUTION NOTES')}
                </Typography>
                <Typography
                    variant="body1"
                    sx={{ mt: 0.5, color: evidence.notes ? '#FFF' : 'rgba(255,255,255,0.45)', fontStyle: evidence.notes ? 'normal' : 'italic', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                >
                    {evidence.notes || tx('owner.ticket.evidence.notes_empty', 'No technician notes were recorded.')}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
                    <Wrench size={14} color="rgba(255,255,255,0.45)" />
                    <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 700 }}>
                        {tx('owner.ticket.materials', 'Materials')}:{' '}
                        {evidence.materials.length > 0
                            ? evidence.materials.join(', ')
                            : tx('owner.ticket.evidence.materials_empty', 'None recorded')}
                    </Typography>
                </Stack>
            </Box>
        </Paper>
    );
}
