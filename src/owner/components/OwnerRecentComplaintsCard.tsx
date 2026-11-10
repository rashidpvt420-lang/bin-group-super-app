/**
 * Owner dashboard: the latest complaints at the owner's properties — what it is about, the
 * stage (Pending / Assigned / In progress / Solved) and who is assigned — live.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { db, collection, query, where, orderBy, limit, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { OwnerTicketAssignmentLine, OwnerTicketStageChip } from './OwnerTicketStatusSummary';

const RECENT_LIMIT = 5;

export default function OwnerRecentComplaintsCard() {
  const { user } = useRole();
  const { tx, phrase, isRTL, lang } = useLanguage();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.uid) return undefined;
    // Same query shape (ownerId + createdAt desc) as the Owner tickets page.
    const q = query(collection(db, 'maintenanceTickets'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'), limit(RECENT_LIMIT));
    return onSnapshot(q, (snap) => {
      setTickets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError('');
      setLoading(false);
    }, (err: any) => {
      setError(err?.message || 'Unable to load complaints.');
      setLoading(false);
    });
  }, [user?.uid]);

  return (
    <Paper data-testid="owner-recent-complaints" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 5, border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}` }}>
      <Stack direction={'row'} justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 800 }}>{phrase('Latest complaints', 'أحدث الشكاوى')}</Typography>
        <Button onClick={() => navigate('/owner/tickets')} sx={{ color: binThemeTokens.goldText, fontWeight: 800 }}>{phrase('View all', 'عرض الكل')}</Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && !error && <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{phrase('Loading complaints…', 'جارٍ تحميل الشكاوى…')}</Typography>}
      {!loading && !error && tickets.length === 0 && (
        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{phrase('No complaints at your properties.', 'لا توجد شكاوى في عقاراتك.')}</Typography>
      )}
      <Stack spacing={1.5}>
        {tickets.map((ticket) => (
          <Box
            key={ticket.id}
            role="button"
            onClick={() => navigate(`/owner/ticket/${ticket.id}`)}
            sx={{ p: 1.5, borderRadius: 3, cursor: 'pointer', border: '1px solid #E5E7EB', textAlign: isRTL ? 'right' : 'left', '&:hover': { borderColor: binThemeTokens.gold } }}
          >
            <Stack direction={'row'} justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 800, wordBreak: 'break-word' }}>
                  {ticket.category || phrase('Maintenance', 'صيانة')}{ticket.description ? ` — ${ticket.description}` : ''}
                </Typography>
                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>
                  #{ticket.id.substring(0, 8).toUpperCase()}{ticket.propertyName ? ` · ${ticket.propertyName}` : ''}{ticket.unitNumber ? ` · ${phrase('Unit', 'وحدة')} ${ticket.unitNumber}` : ''}
                </Typography>
                <OwnerTicketAssignmentLine ticket={ticket} tx={tx} />
              </Box>
              <OwnerTicketStageChip ticket={ticket} tx={tx} />
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
