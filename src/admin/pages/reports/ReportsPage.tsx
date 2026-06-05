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
import { registerArabicFont } from '../../../utils/arabicPdfFont';
import { apiClient } from '../../services/api';
import { db, collection, query, getDocs, orderBy, limit } from '@/lib/firebase';

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
      alert('Failed to generate report');
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
        alert('Generate a report before exporting PDF.');
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        registerArabicFont(doc);
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
      alert('PDF export failed. Please retry or contact technical support.');
    }
  };

  const totalRevenue = data.reduce((sum, row) => sum + row.revenue, 0);
  const totalCosts = data.reduce((sum, row) => sum + row.costs, 0);
  const totalTickets = data.reduce((sum, row) => sum + row.tickets, 0);
  const totalCompleted = data.reduce((sum, row) => sum + row.completedJobs, 0);
  const hasExportableRows = data.length > 0 || breaches.length > 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 900 }}>
        Reports & Analytics
      </Typography>

      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>Report Type</InputLabel>
              <Select value={reportType} onChange={(e) => setReportType(e.target.value)} label="Report Type">
                <MenuItem value="financial">Financial</MenuItem>
                <MenuItem value="operational">Operational</MenuItem>
                <MenuItem value="performance">Performance</MenuItem>
                <MenuItem value="owner">Owner Summary</MenuItem>
                <MenuItem value="sla_breaches">SLA Breaches & Credits</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={handleGenerateReport} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Report'}
          </Button>
          {hasExportableRows && (
            <>
              <Button variant="outlined" onClick={handleExportCSV}>Export CSV</Button>
              <Button variant="outlined" onClick={handleExportPDF}>Export PDF</Button>
            </>
          )}
        </Box>
      </Paper>

      {data.length > 0 && (
        <>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>Total Revenue</Typography><Typography variant="h5">AED {totalRevenue.toLocaleString()}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>Total Costs</Typography><Typography variant="h5">AED {totalCosts.toLocaleString()}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>Profit</Typography><Typography variant="h5" color={totalRevenue - totalCosts >= 0 ? 'success' : 'error'}>AED {(totalRevenue - totalCosts).toLocaleString()}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>Total Tickets</Typography><Typography variant="h5">{totalTickets}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} sm={6} md={2.4}><Card><CardContent sx={{ textAlign: 'center' }}><Typography color="textSecondary" gutterBottom>Completed Jobs</Typography><Typography variant="h5" color="secondary">{totalCompleted}</Typography></CardContent></Card></Grid>
          </Grid>

          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Revenue vs Costs</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Bar dataKey="revenue" fill="#4caf50" /><Bar dataKey="costs" fill="#f44336" /></BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Tickets & Completed Jobs</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="tickets" stroke="#2196f3" /><Line type="monotone" dataKey="completedJobs" stroke="#ff9800" /></LineChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>

          <Paper>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}><TableRow><TableCell>Date</TableCell><TableCell align="right">Revenue</TableCell><TableCell align="right">Costs</TableCell><TableCell align="center">Tickets</TableCell><TableCell align="center">Completed</TableCell><TableCell align="right">Profit</TableCell></TableRow></TableHead>
              <TableBody>{data.map((row) => (<TableRow key={row.date}><TableCell>{row.date}</TableCell><TableCell align="right">AED {row.revenue.toLocaleString()}</TableCell><TableCell align="right">AED {row.costs.toLocaleString()}</TableCell><TableCell align="center">{row.tickets}</TableCell><TableCell align="center">{row.completedJobs}</TableCell><TableCell align="right">AED {(row.revenue - row.costs).toLocaleString()}</TableCell></TableRow>))}</TableBody>
            </Table>
          </Paper>
        </>
      )}

      {reportType === 'sla_breaches' && breaches.length > 0 && (
          <Box sx={{ mt: 4 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 900 }}>INSTITUTIONAL SLA BREACH LEDGER</Typography>
              <TableContainer component={Paper}>
                  <Table>
                      <TableHead sx={{ bgcolor: '#f8fafc' }}><TableRow><TableCell sx={{ fontWeight: 900 }}>TICKET ID</TableCell><TableCell sx={{ fontWeight: 900 }}>OWNER ID</TableCell><TableCell sx={{ fontWeight: 900 }}>TIER</TableCell><TableCell sx={{ fontWeight: 900 }}>PENALTY</TableCell><TableCell sx={{ fontWeight: 900 }}>DETECTED AT</TableCell></TableRow></TableHead>
                      <TableBody>{breaches.map((b) => (<TableRow key={b.id}><TableCell>{b.ticketId?.substring(0,8)}</TableCell><TableCell>{b.ownerId?.substring(0,8)}</TableCell><TableCell><Chip label={b.tier?.toUpperCase()} size="small" variant="outlined" /></TableCell><TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>AED {b.penaltyAmount}</TableCell><TableCell>{b.detectedAt?.toDate ? b.detectedAt.toDate().toLocaleString() : 'Recent'}</TableCell></TableRow>))}</TableBody>
                  </Table>
              </TableContainer>
          </Box>
      )}

      {!loading && data.length === 0 && breaches.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="textSecondary">Generate a report to see data here</Typography>
        </Paper>
      )}
    </Container>
  );
}
