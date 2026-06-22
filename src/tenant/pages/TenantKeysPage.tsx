import React, { useEffect, useState } from 'react';
import { Box, Container, Typography, Paper, Grid, Stack, Chip, CircularProgress, alpha, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { Key, Shield, History, Info, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { db, collection, query, where, getDocs, limit, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export default function TenantKeysPage() {
  const { tx, lang, isRTL } = useLanguage();
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [unitId, setUnitId] = useState<string>('');
  const [propertyId, setPropertyId] = useState<string>('');
  const [keys, setKeys] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);

  const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

  // 1. Resolve unit and property
  useEffect(() => {
    async function resolveResidence() {
      if (!user?.uid) return;
      try {
        let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid), limit(1)));
        if (unitSnap.empty && user.email) {
          unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', normalizeEmail(user.email)), limit(1)));
        }
        if (!unitSnap.empty) {
          const unitDoc = unitSnap.docs[0];
          setUnitId(unitDoc.id);
          setPropertyId(unitDoc.data().propertyId || '');
        }
      } catch (err) {
        console.error('Failed to resolve tenant unit:', err);
      }
    }
    resolveResidence();
  }, [user]);

  // 2. Query keys & movements
  useEffect(() => {
    if (!unitId) {
      if (!loading) setLoading(false);
      return;
    }

    // Read keys
    const qKeys = query(collection(db, 'keyRegister'), where('unitId', '==', unitId));
    const unsubKeys = onSnapshot(qKeys, (snap) => {
      setKeys(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.warn('Keys listener error:', err);
      setLoading(false);
    });

    // Read movements
    const qMove = query(collection(db, 'keyMovements'), where('unitId', '==', unitId));
    const unsubMove = onSnapshot(qMove, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMovements(list);
    }, (err) => {
      console.warn('Movements listener error:', err);
    });

    return () => {
      unsubKeys();
      unsubMove();
    };
  }, [unitId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return '#10b981';
      case 'issued': return binThemeTokens.gold;
      case 'lost': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
          <SafeIcon icon={Key} size={36} style={{ color: binThemeTokens.gold }} />
          {label('tenant.keys.title', 'Key Register', 'سجل المفاتيح')}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>
          {label('tenant.keys.desc', 'View custody logs, active keys, and key movements registered for your unit.', 'عرض سجلات العهدة والمفاتيح النشطة وحركة المفاتيح المسجلة لوحدتك.')}
        </Typography>
      </Box>

      {!unitId ? (
        <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <SafeIcon icon={AlertTriangle} size={48} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
          <Typography sx={{ color: '#FFF', fontWeight: 950, mt: 2 }}>
            {label('tenant.keys.no_unit', 'No Assigned Unit Found', 'لم يتم العثور على وحدة معينة')}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={4}>
          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
              <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SafeIcon icon={Shield} size={18} />
                {label('tenant.keys.active', 'ACTIVE KEYS', 'المفاتيح النشطة')}
              </Typography>

              {keys.length === 0 ? (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', py: 2 }}>
                  {label('tenant.keys.none', 'No active keys registered.', 'لا توجد مفاتيح نشطة مسجلة.')}
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {keys.map((k) => (
                    <Box key={k.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="body2" fontWeight="900" color="#FFF">{k.keyType?.toUpperCase() || 'UNIT KEY'}</Typography>
                          <Typography variant="caption" color="textSecondary">{k.keyCodeMasked || '••••••••'}</Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={(k.status || 'unknown').toUpperCase()}
                          sx={{ bgcolor: alpha(getStatusColor(k.status), 0.12), color: getStatusColor(k.status), fontWeight: 950, fontSize: '0.65rem' }}
                        />
                      </Stack>
                      {k.currentCustodianName && (
                        <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>
                            {label('tenant.keys.custodian', 'Current Custodian:', 'الحارس الحالي:')}
                          </Typography>
                          <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>
                            {k.currentCustodianName} ({k.currentCustodianType})
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} lg={8}>
            <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
              <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SafeIcon icon={History} size={18} />
                {label('tenant.keys.history', 'KEY MOVEMENT LOGS', 'سجلات حركة المفاتيح')}
              </Typography>

              {movements.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 2 }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                    {label('tenant.keys.no_history', 'No key movements recorded yet.', 'لم يتم تسجيل حركة للمفاتيح بعد.')}
                  </Typography>
                </Paper>
              ) : (
                <TableContainer>
                  <Table sx={{ minWidth: 500, '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                    <TableHead>
                      <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 900 } }}>
                        <TableCell>{label('tenant.keys.tbl_action', 'Action', 'الإجراء')}</TableCell>
                        <TableCell>{label('tenant.keys.tbl_custodian', 'Custodian', 'الحارس')}</TableCell>
                        <TableCell>{label('tenant.keys.tbl_handler', 'Handled By', 'تمت المعالجة بواسطة')}</TableCell>
                        <TableCell>{label('tenant.keys.tbl_date', 'Date', 'التاريخ')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {movements.map((m) => (
                        <TableRow key={m.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.01)' } }}>
                          <TableCell>
                            <Chip
                              size="small"
                              label={(m.action || 'issued').toUpperCase()}
                              sx={{
                                bgcolor: m.action === 'returned' ? alpha('#10b981', 0.12) : alpha(binThemeTokens.gold, 0.12),
                                color: m.action === 'returned' ? '#10b981' : binThemeTokens.gold,
                                fontWeight: 950,
                                fontSize: '0.65rem'
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 800 }}>{m.toCustodian || m.fromCustodian || '—'}</TableCell>
                          <TableCell>{m.handledBy || 'Security'}</TableCell>
< claude/quirky-carson-x5ygtk
                          <TableCell sx={{ fontSize: '0.75rem' }}>
                            {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : '—'}
=
                          <TableCell>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                              {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : '—'}
                            </Typography>
> main
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Container>
  );
}
