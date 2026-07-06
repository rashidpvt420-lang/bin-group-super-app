import { showSovereignToast, useLanguage } from '@bin/shared';
// admin-panel/src/pages/reports/ReportsPage.tsx
import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { functions, httpsCallable } from '../../lib/firebase';

type ReportType = 'financial' | 'operational' | 'performance' | 'owner' | 'sla_breaches';

interface ReportData {
  date: string;
  revenue: number;
  costs: number;
  tickets: number;
  completedJobs: number;
}

interface SlaBreachRow {
  id: string;
  ticketId: string;
  ownerId: string;
  tier: string;
  penaltyAmount: number;
  detectedAt?: string | null;
}

interface AdminReportPayload {
  data?: unknown;
  breaches?: unknown;
}

const formatAED = (value: number) => `AED ${Math.round(Number(value || 0)).toLocaleString()}`;
const reportFileDate = () => new Date().toISOString().split('T')[0];
const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeReportRows = (value: unknown): ReportData[] => {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      date: String(record.date || ''),
      revenue: toNumber(record.revenue),
      costs: toNumber(record.costs),
      tickets: toNumber(record.tickets),
      completedJobs: toNumber(record.completedJobs),
    };
  }).filter((row) => row.date);
};

const normalizeBreaches = (value: unknown): SlaBreachRow[] => {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      id: String(record.id || record.ticketId || crypto.randomUUID()),
      ticketId: String(record.ticketId || ''),
      ownerId: String(record.ownerId || ''),
      tier: String(record.tier || 'standard'),
      penaltyAmount: toNumber(record.penaltyAmount),
      detectedAt: record.detectedAt ? String(record.detectedAt) : null,
    };
  });
};

const formatDateTime = (value: unknown) => {
  if (!value) return 'Recent';
  if (typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toLocaleString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? 'Recent' : parsed.toLocaleString();
};

export default function ReportsPage() {
  const { isRTL } = useLanguage();
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportType, setReportType] = useState<ReportType>('financial');
  const [data, setData] = useState<ReportData[]>([]);
  const [breaches, setBreaches] = useState<SlaBreachRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [permissionError, setPermissionError] = useState('');

  const label = (en: string, ar: string) => isRTL ? ar : en;

  const handleGenerateReport = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      setPermissionError('');
      setHasGenerated(true);

      const getAdminReports = httpsCallable(functions, 'getAdminReports');
      const result = await getAdminReports({
        reportType,
        startDate,
        endDate,
        filters: {}
      });
      const payload = (result.data || {}) as AdminReportPayload;
      setData(normalizeReportRows(payload.data));
      setBreaches(normalizeBreaches(payload.breaches));
    } catch (error) {
      console.error('Failed to generate report:', error);
      const code = String((error as { code?: string }).code || '');
      const message = String((error as { message?: string }).message || '');
      if (code.includes('permission-denied') || code.includes('unauthenticated')) {
        setPermissionError(label('Admin permission is required to generate reports.', 'يلزم توفر صلاحية المدير لإنشاء التقارير.'));
      } else {
        setErrorMessage(message || label('Failed to generate report. Please retry.', 'تعذر إنشاء التقرير. يرجى المحاولة مرة أخرى.'));
      }
      setData([]);
      setBreaches([]);
      showSovereignToast(label('Failed to generate report', 'تعذر إنشاء التقرير'));
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    const rows = reportType === 'sla_breaches'
      ? [
          ['Ticket ID', 'Owner ID', 'Tier', 'Penalty', 'Detected At'],
          ...breaches.map((b) => [
            b.ticketId || '',
            b.ownerId || '',
            b.tier || '',
            b.penaltyAmount || 0,
            formatDateTime(b.detectedAt),
          ]),
        ]
      : [
          ['Date', 'Revenue', 'Costs', 'Tickets', 'Completed Jobs', 'Profit'],
          ...data.map((row) => [row.date, row.revenue, row.costs, row.tickets, row.completedJobs, row.revenue - row.costs]),
        ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report-${startDate}-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    try {
      const hasSlaRows = reportType === 'sla_breaches' && breaches.length > 0;
      const hasReportRows = reportType !== 'sla_breaches' && data.length > 0;
      if (!hasSlaRows && !hasReportRows) {
        showSovereignToast(label('Generate a report before exporting PDF.', 'أنشئ التقرير قبل تصدير ملف PDF.'));
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const generatedAt = new Date().toLocaleString();

      doc.setFontSize(18);
      doc.setTextColor(198, 167, 94);
      doc.text('BIN GROUP - ADMIN REPORT', pageWidth / 2, 16, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text(`Report Type: ${reportType.replace(/_/g, ' ').toUpperCase()}`, 14, 26);
      doc.text(`Period: ${startDate} to ${endDate}`, 14, 32);
      doc.text(`Generated: ${generatedAt}`, 14, 38);

      if (hasSlaRows) {
        (doc as any).autoTable({
          startY: 48,
          head: [['Ticket ID', 'Owner ID', 'Tier', 'Penalty', 'Detected At']],
          body: breaches.map((b) => [
            b.ticketId || 'N/A',
            b.ownerId || 'N/A',
            String(b.tier || 'N/A').toUpperCase(),
            formatAED(Number(b.penaltyAmount || 0)),
            formatDateTime(b.detectedAt),
          ]),
          theme: 'grid',
          headStyles: { fillColor: [198, 167, 94], textColor: [0, 0, 0], fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2 },
        });
      } else {
        doc.setFontSize(11);
        doc.setTextColor(20);
        doc.text(`Total Revenue: ${formatAED(totalRevenue)}`, 14, 48);
        doc.text(`Total Costs: ${formatAED(totalCosts)}`, 80, 48);
        doc.text(`Profit: ${formatAED(totalRevenue - totalCosts)}`, 140, 48);
        doc.text(`Tickets: ${totalTickets}`, 200, 48);
        doc.text(`Completed: ${totalCompleted}`, 238, 48);

        (doc as any).autoTable({
          startY: 58,
          head: [['Date', 'Revenue', 'Costs', 'Tickets', 'Completed', 'Profit']],
          body: data.map((row) => [
            row.date,
            formatAED(row.revenue),
            formatAED(row.costs),
            row.tickets,
            row.completedJobs,
            formatAED(row.revenue - row.costs),
          ]),
          theme: 'grid',
          headStyles: { fillColor: [198, 167, 94], textColor: [0, 0, 0], fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2 },
        });
      }

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text('Confidential BIN GROUP institutional report. Generated automatically from admin reporting console.', pageWidth / 2, 200, { align: 'center' });
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, 200, { align: 'right' });
      }

      doc.save(`BIN_GROUP_${reportType}_Report_${reportFileDate()}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      showSovereignToast(label('PDF export failed. Please retry or contact technical support.', 'فشل تصدير PDF. يرجى إعادة المحاولة أو التواصل مع الدعم.'));
    }
  };

  const totalRevenue = data.reduce((sum, row) => sum + row.revenue, 0);
  const totalCosts = data.reduce((sum, row) => sum + row.costs, 0);
  const totalTickets = data.reduce((sum, row) => sum + row.tickets, 0);
  const totalCompleted = data.reduce((sum, row) => sum + row.completedJobs, 0);
  const hasExportableRows = data.length > 0 || breaches.length > 0;
  const tableAlign = isRTL ? 'left' : 'right';

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
        {label('Reports & Analytics', 'التقارير والتحليلات')}
      </Typography>

      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={2} sx={{ mb: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label={label('Start Date', 'تاريخ البداية')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label={label('End Date', 'تاريخ النهاية')} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>{label('Report Type', 'نوع التقرير')}</InputLabel>
              <Select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} label={label('Report Type', 'نوع التقرير')}>
                <MenuItem value="financial">{label('Financial', 'مالي')}</MenuItem>
                <MenuItem value="operational">{label('Operational', 'تشغيلي')}</MenuItem>
                <MenuItem value="performance">{label('Performance', 'الأداء')}</MenuItem>
                <MenuItem value="owner">{label('Owner Summary', 'ملخص المالك')}</MenuItem>
                <MenuItem value="sla_breaches">{label('SLA Breaches & Credits', 'مخالفات SLA والائتمانات')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Button variant="contained" onClick={handleGenerateReport} disabled={loading}>
            {loading ? label('Generating...', 'جار الإنشاء...') : label('Generate Report', 'إنشاء التقرير')}
          </Button>
          {hasExportableRows && (
            <>
              <Button variant="outlined" onClick={handleExportCSV}>{label('Export CSV', 'تصدير CSV')}</Button>
              <Button variant="outlined" onClick={handleExportPDF}>{label('Export PDF', 'تصدير PDF')}</Button>
            </>
          )}
        </Box>
      </Paper>

      {permissionError && <Alert severity="error" sx={{ mb: 3, textAlign: isRTL ? 'right' : 'left' }}>{permissionError}</Alert>}
      {errorMessage && <Alert severity="warning" sx={{ mb: 3, textAlign: isRTL ? 'right' : 'left' }}>{errorMessage}</Alert>}

      {data.length > 0 && (
        <>
          <Grid container spacing={2} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>{label('Total Revenue', 'إجمالي الإيرادات')}</Typography><Typography variant="h5">AED {totalRevenue.toLocaleString()}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>{label('Total Costs', 'إجمالي التكاليف')}</Typography><Typography variant="h5">AED {totalCosts.toLocaleString()}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>{label('Profit', 'الربح')}</Typography><Typography variant="h5" color={totalRevenue - totalCosts >= 0 ? 'success' : 'error'}>AED {(totalRevenue - totalCosts).toLocaleString()}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>{label('Total Tickets', 'إجمالي الطلبات')}</Typography><Typography variant="h5">{totalTickets}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>{label('Completed Jobs', 'الأعمال المكتملة')}</Typography><Typography variant="h5" color="secondary">{totalCompleted}</Typography></CardContent></Card></Grid>
          </Grid>

          <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>{label('Revenue vs Costs', 'الإيرادات مقابل التكاليف')}</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Bar dataKey="revenue" fill="#4caf50" /><Bar dataKey="costs" fill="#f44336" /></BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>{label('Tickets & Completed Jobs', 'الطلبات والأعمال المكتملة')}</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="tickets" stroke="#2196f3" /><Line type="monotone" dataKey="completedJobs" stroke="#ff9800" /></LineChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>

          <Paper>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}><TableRow><TableCell>{label('Date', 'التاريخ')}</TableCell><TableCell align={tableAlign}>{label('Revenue', 'الإيرادات')}</TableCell><TableCell align={tableAlign}>{label('Costs', 'التكاليف')}</TableCell><TableCell align="center">{label('Tickets', 'الطلبات')}</TableCell><TableCell align="center">{label('Completed', 'مكتمل')}</TableCell><TableCell align={tableAlign}>{label('Profit', 'الربح')}</TableCell></TableRow></TableHead>
              <TableBody>{data.map((row) => (<TableRow key={row.date}><TableCell>{row.date}</TableCell><TableCell align={tableAlign}>AED {row.revenue.toLocaleString()}</TableCell><TableCell align={tableAlign}>AED {row.costs.toLocaleString()}</TableCell><TableCell align="center">{row.tickets}</TableCell><TableCell align="center">{row.completedJobs}</TableCell><TableCell align={tableAlign}>AED {(row.revenue - row.costs).toLocaleString()}</TableCell></TableRow>))}</TableBody>
            </Table>
          </Paper>
        </>
      )}

      {reportType === 'sla_breaches' && breaches.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{label('INSTITUTIONAL SLA BREACH LEDGER', 'سجل مخالفات اتفاقية مستوى الخدمة')}</Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead sx={{ bgcolor: '#f8fafc' }}><TableRow><TableCell sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{label('TICKET ID', 'رقم الطلب')}</TableCell><TableCell sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{label('OWNER ID', 'رقم المالك')}</TableCell><TableCell sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{label('TIER', 'المستوى')}</TableCell><TableCell sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{label('PENALTY', 'الغرامة')}</TableCell><TableCell sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{label('DETECTED AT', 'تاريخ الرصد')}</TableCell></TableRow></TableHead>
              <TableBody>{breaches.map((b) => (<TableRow key={b.id}><TableCell>{b.ticketId?.substring(0, 8)}</TableCell><TableCell>{b.ownerId?.substring(0, 8)}</TableCell><TableCell><Chip label={b.tier?.toUpperCase()} size="small" variant="outlined" /></TableCell><TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>AED {b.penaltyAmount}</TableCell><TableCell>{formatDateTime(b.detectedAt)}</TableCell></TableRow>))}</TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {!loading && data.length === 0 && breaches.length === 0 && !permissionError && !errorMessage && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="textSecondary">
            {hasGenerated
              ? label('No report data found for the selected date range.', 'لا توجد بيانات تقرير ضمن نطاق التاريخ المحدد.')
              : label('Generate a report to see data here', 'أنشئ تقريراً لعرض البيانات هنا')}
          </Typography>
        </Paper>
      )}
    </Container>
  );
}
