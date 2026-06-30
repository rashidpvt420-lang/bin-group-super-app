// admin-panel/src/pages/reports/ReportsPage.tsx
import React, { useState } from 'react';
import {
  Container,
  Paper,
  TextField,
  Button,
  Grid,
  Typography,
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  TableContainer
} from '@mui/material';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { apiClient } from '../../services/api';
import { db, collection, query, getDocs, orderBy, limit } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

interface ReportData {
  date: string;
  revenue: number;
  costs: number;
  tickets: number;
  completedJobs: number;
}

const formatAED = (value: number) => `AED ${Math.round(Number(value || 0)).toLocaleString()}`;
const reportFileDate = () => new Date().toISOString().split('T')[0];

export default function ReportsPage() {
  const { t, isRTL } = useLanguage();
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportType, setReportType] = useState('financial');
  const [data, setData] = useState<ReportData[]>([]);
  const [breaches, setBreaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleGenerateReport = async () => {
    try {
      setLoading(true);
      if (reportType === 'sla_breaches') {
          const q = query(collection(db, 'sla_breaches'), orderBy('detectedAt', 'desc'), limit(100));
          const snap = await getDocs(q);
          setBreaches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setData([]); 
      } else {
          const response = await apiClient.get('/api/admin/reports', {
            params: {
              startDate,
              endDate,
              type: reportType,
            },
          });
          setData(Array.isArray(response.data?.data) ? response.data.data : []);
          setBreaches([]);
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert(t('admin.reports.generate_failed'));
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
            b.detectedAt?.toDate ? b.detectedAt.toDate().toLocaleString() : '',
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
        alert(t('admin.reports.export_pdf_requires_data'));
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
            b.detectedAt?.toDate ? b.detectedAt.toDate().toLocaleString() : 'Recent',
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
      alert(t('admin.reports.export_pdf_failed'));
    }
  };

  const totalRevenue = data.reduce((sum, row) => sum + row.revenue, 0);
  const totalCosts = data.reduce((sum, row) => sum + row.costs, 0);
  const totalTickets = data.reduce((sum, row) => sum + row.tickets, 0);
  const totalCompleted = data.reduce((sum, row) => sum + row.completedJobs, 0);
  const hasExportableRows = data.length > 0 || breaches.length > 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 900 }}>
        {t('admin.reports.page_title')}
      </Typography>

      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label={t('admin.reports.start_date_label')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label={t('admin.reports.end_date_label')} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>{t('admin.reports.report_type_label')}</InputLabel>
              <Select value={reportType} onChange={(e) => setReportType(e.target.value)} label={t('admin.reports.report_type_label')}>
                <MenuItem value="financial">{t('admin.reports.type_financial')}</MenuItem>
                <MenuItem value="operational">{t('admin.reports.type_operational')}</MenuItem>
                <MenuItem value="performance">{t('admin.reports.type_performance')}</MenuItem>
                <MenuItem value="owner">{t('admin.reports.type_owner')}</MenuItem>
                <MenuItem value="sla_breaches">{t('admin.reports.type_sla_breaches')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={handleGenerateReport} disabled={loading}>
            {loading ? t('admin.reports.generating_button') : t('admin.reports.generate_button')}
          </Button>
          {hasExportableRows && (
            <>
              <Button variant="outlined" onClick={handleExportCSV}>{t('admin.reports.export_csv_button')}</Button>
              <Button variant="outlined" onClick={handleExportPDF}>{t('admin.reports.export_pdf_button')}</Button>
            </>
          )}
        </Box>
      </Paper>

      {data.length > 0 && (
        <>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>{t('admin.reports.card_total_revenue')}</Typography><Typography variant="h5">AED {totalRevenue.toLocaleString()}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>{t('admin.reports.card_total_costs')}</Typography><Typography variant="h5">AED {totalCosts.toLocaleString()}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>{t('admin.reports.card_profit')}</Typography><Typography variant="h5" color={totalRevenue - totalCosts >= 0 ? 'success' : 'error'}>AED {(totalRevenue - totalCosts).toLocaleString()}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>{t('admin.reports.card_total_tickets')}</Typography><Typography variant="h5">{totalTickets}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>{t('admin.reports.card_completed_jobs')}</Typography><Typography variant="h5" color="secondary">{totalCompleted}</Typography></CardContent></Card></Grid>
          </Grid>

          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>{t('admin.reports.chart_revenue_vs_costs')}</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Bar dataKey="revenue" name={t('admin.reports.card_total_revenue')} fill="#4caf50" /><Bar dataKey="costs" name={t('admin.reports.card_total_costs')} fill="#f44336" /></BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>{t('admin.reports.chart_tickets_and_completed')}</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="tickets" name={t('admin.reports.table_tickets')} stroke="#2196f3" /><Line type="monotone" dataKey="completedJobs" name={t('admin.reports.card_completed_jobs')} stroke="#ff9800" /></LineChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>

          <Paper>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}><TableRow><TableCell>{t('admin.reports.table_date')}</TableCell><TableCell align="right">{t('admin.reports.table_revenue')}</TableCell><TableCell align="right">{t('admin.reports.table_costs')}</TableCell><TableCell align="center">{t('admin.reports.table_tickets')}</TableCell><TableCell align="center">{t('admin.reports.table_completed')}</TableCell><TableCell align="right">{t('admin.reports.table_profit')}</TableCell></TableRow></TableHead>
              <TableBody>{data.map((row) => (<TableRow key={row.date}><TableCell>{row.date}</TableCell><TableCell align="right">AED {row.revenue.toLocaleString()}</TableCell><TableCell align="right">AED {row.costs.toLocaleString()}</TableCell><TableCell align="center">{row.tickets}</TableCell><TableCell align="center">{row.completedJobs}</TableCell><TableCell align="right">AED {(row.revenue - row.costs).toLocaleString()}</TableCell></TableRow>))}</TableBody>
            </Table>
          </Paper>
        </>
      )}

      {reportType === 'sla_breaches' && breaches.length > 0 && (
          <Box sx={{ mt: 4 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 900 }}>{t('admin.reports.sla_ledger_title')}</Typography>
              <TableContainer component={Paper}>
                  <Table>
                      <TableHead sx={{ bgcolor: '#f8fafc' }}><TableRow><TableCell sx={{ fontWeight: 900 }}>{t('admin.reports.sla_table_ticket_id')}</TableCell><TableCell sx={{ fontWeight: 900 }}>{t('admin.reports.sla_table_owner_id')}</TableCell><TableCell sx={{ fontWeight: 900 }}>{t('admin.reports.sla_table_tier')}</TableCell><TableCell sx={{ fontWeight: 900 }}>{t('admin.reports.sla_table_penalty')}</TableCell><TableCell sx={{ fontWeight: 900 }}>{t('admin.reports.sla_table_detected_at')}</TableCell></TableRow></TableHead>
                      <TableBody>{breaches.map((b) => (<TableRow key={b.id}><TableCell>{b.ticketId?.substring(0,8)}</TableCell><TableCell>{b.ownerId?.substring(0,8)}</TableCell><TableCell><Chip label={b.tier?.toUpperCase()} size="small" variant="outlined" /></TableCell><TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>AED {b.penaltyAmount}</TableCell><TableCell>{b.detectedAt?.toDate ? b.detectedAt.toDate().toLocaleString() : t('admin.reports.recent_fallback')}</TableCell></TableRow>))}</TableBody>
                  </Table>
              </TableContainer>
          </Box>
      )}

      {!loading && data.length === 0 && breaches.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="textSecondary">{t('admin.reports.empty_state')}</Typography>
        </Paper>
      )}
    </Container>
  );
}
