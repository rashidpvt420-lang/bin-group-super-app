import React, { useEffect, useState } from 'react';
import {
  Box, Button, CircularProgress, Divider, Grid, Paper,
  Stack, Typography, alpha,
} from '@mui/material';
import {
  Download, TrendingDown, TrendingUp, DollarSign,
  FileText, BarChart2, Calendar,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useRole } from '../../context/RoleContext';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

const gold = binThemeTokens.gold;
const CARD = 'rgba(15, 23, 42, 0.42)';
const BORDER = `1px solid ${alpha(gold, 0.18)}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function generatePDF(owner: any, passports: any[], tickets: any[], year: number) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = 210;
  const MARGIN = 18;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // ── Header band ──
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, PAGE_W, 42, 'F');
  doc.setFontSize(22);
  doc.setTextColor(201, 166, 70);
  doc.setFont('helvetica', 'bold');
  doc.text('BIN GROUP', MARGIN, 18);
  doc.setFontSize(9);
  doc.setTextColor(180, 180, 180);
  doc.text('All Kind Building Projects Contracting LLC S.P.C · Licensed in Abu Dhabi, UAE', MARGIN, 25);
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(`OWNER PROFIT & LOSS REPORT — ${year}`, MARGIN, 35);

  // ── Owner info ──
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Owner: ${owner?.displayName || owner?.email || 'Property Owner'}`, MARGIN, 54);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-AE', { day: '2-digit', month: 'long', year: 'numeric' })}`, MARGIN, 60);
  doc.text(`Properties: ${passports.length}`, MARGIN, 66);
  doc.text(`Report Period: 1 Jan ${year} – 31 Dec ${year}`, MARGIN, 72);

  // ── Executive summary ──
  const totalIncome = passports.reduce((s, p) => s + (p.rentCollectedTotal || 0), 0);
  const totalMaintenance = passports.reduce((s, p) => s + (p.maintenanceCostTotal || 0), 0);
  const mgmtFee = totalIncome * 0.08;
  const netIncome = totalIncome - totalMaintenance - mgmtFee;
  const outstanding = passports.reduce((s, p) => s + (p.rentOutstandingTotal || 0), 0);

  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('EXECUTIVE SUMMARY', MARGIN, 84);
  doc.setDrawColor(201, 166, 70);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 86, MARGIN + CONTENT_W, 86);

  autoTable(doc, {
    startY: 90,
    margin: { left: MARGIN, right: MARGIN },
    head: [['METRIC', 'AMOUNT (AED)', 'NOTES']],
    body: [
      ['Gross Rental Income', totalIncome.toLocaleString('en-AE', { minimumFractionDigits: 2 }), 'Collected rent receipts'],
      ['Outstanding Rent', outstanding.toLocaleString('en-AE', { minimumFractionDigits: 2 }), 'Pending collection'],
      ['Maintenance Costs', `(${totalMaintenance.toLocaleString('en-AE', { minimumFractionDigits: 2 })})`, 'All maintenance jobs'],
      ['Management Fee (8%)', `(${mgmtFee.toLocaleString('en-AE', { minimumFractionDigits: 2 })})`, 'BIN GROUP property management'],
      ['NET INCOME', netIncome.toLocaleString('en-AE', { minimumFractionDigits: 2 }), netIncome >= 0 ? 'Profitable' : 'Review required'],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [17, 24, 39], textColor: [201, 166, 70], fontStyle: 'bold' },
    bodyStyles: { textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [248, 249, 251] },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    didDrawRow: (data: any) => {
      if (data.row.index === 4) {
        doc.setFillColor(201, 166, 70, 0.15);
      }
    },
  } as any);

  // ── Per-property table ──
  const afterSummary = (doc as any).lastAutoTable.finalY + 12;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('PER-PROPERTY BREAKDOWN', MARGIN, afterSummary);
  doc.line(MARGIN, afterSummary + 2, MARGIN + CONTENT_W, afterSummary + 2);

  autoTable(doc, {
    startY: afterSummary + 6,
    margin: { left: MARGIN, right: MARGIN },
    head: [['PROPERTY', 'INCOME (AED)', 'MAINTENANCE (AED)', 'MGMT FEE (AED)', 'NET (AED)']],
    body: passports.map(p => {
      const income = p.rentCollectedTotal || 0;
      const maint = p.maintenanceCostTotal || 0;
      const mgmt = income * 0.08;
      const net = income - maint - mgmt;
      return [
        p.address || p.propertyName || p.id,
        income.toLocaleString('en-AE', { minimumFractionDigits: 2 }),
        `(${maint.toLocaleString('en-AE', { minimumFractionDigits: 2 })})`,
        `(${mgmt.toLocaleString('en-AE', { minimumFractionDigits: 2 })})`,
        net.toLocaleString('en-AE', { minimumFractionDigits: 2 }),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 3.5 },
    headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 251] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  } as any);

  // ── Maintenance jobs ──
  if (tickets.length > 0) {
    const afterProps = (doc as any).lastAutoTable.finalY + 12;
    if (afterProps < 240) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 24, 39);
      doc.text('MAINTENANCE ACTIVITY', MARGIN, afterProps);
      doc.line(MARGIN, afterProps + 2, MARGIN + CONTENT_W, afterProps + 2);

      autoTable(doc, {
        startY: afterProps + 6,
        margin: { left: MARGIN, right: MARGIN },
        head: [['DESCRIPTION', 'STATUS', 'TRADE', 'COST (AED)']],
        body: tickets.slice(0, 20).map(t => [
          t.title || 'Maintenance',
          t.status || 'Completed',
          t.trade || 'General',
          t.cost ? t.cost.toLocaleString('en-AE') : '—',
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 249, 251] },
      } as any);
    }
  }

  // ── Footer ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(
      `BIN GROUP Property OS · Confidential · Page ${i} of ${pageCount} · Generated ${new Date().toISOString().split('T')[0]}`,
      PAGE_W / 2, 292, { align: 'center' }
    );
    doc.setDrawColor(220, 220, 220);
    doc.line(MARGIN, 288, PAGE_W - MARGIN, 288);
  }

  doc.save(`BIN-GROUP-PL-Report-${year}.pdf`);
}

function MetricCard({ label, value, color = gold, icon: Icon, sub }: any) {
  return (
    <Paper sx={{ p: 3, bgcolor: CARD, border: BORDER, borderRadius: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.35), fontWeight: 900, letterSpacing: 2, display: 'block', mb: 0.5 }}>{label}</Typography>
          <Typography sx={{ color, fontWeight: 950, fontSize: '1.5rem', lineHeight: 1 }}>{value}</Typography>
          {sub && <Typography variant="caption" sx={{ color: alpha('#fff', 0.3), fontWeight: 800, mt: 0.4, display: 'block' }}>{sub}</Typography>}
        </Box>
        <Box sx={{ p: 1, bgcolor: alpha(color, 0.12), borderRadius: 2, color }}><Icon size={20} /></Box>
      </Stack>
    </Paper>
  );
}

export default function OwnerPLReportPage() {
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [passports, setPassports] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [year] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!user?.email) return;
    const email = user.email.toLowerCase();
    const unsubP = onSnapshot(
      query(collection(db, 'propertyPassports'), where('ownerEmail', '==', email)),
      snap => { setPassports(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubT = onSnapshot(
      query(collection(db, 'maintenanceTickets'), where('ownerEmail', '==', email)),
      snap => setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubP(); unsubT(); };
  }, [user?.email]);

  if (loading) return (
    <Box sx={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexDirection: 'column' }}>
      <CircularProgress sx={{ color: gold }} />
    </Box>
  );

  const totalIncome = passports.reduce((s, p) => s + (p.rentCollectedTotal || 0), 0);
  const totalMaint = passports.reduce((s, p) => s + (p.maintenanceCostTotal || 0), 0);
  const mgmtFee = totalIncome * 0.08;
  const netIncome = totalIncome - totalMaint - mgmtFee;
  const outstanding = passports.reduce((s, p) => s + (p.rentOutstandingTotal || 0), 0);

  return (
    <Box sx={{ pb: 8 }}>
      {/* Header */}
      <Box sx={{ mb: 5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <Box sx={{ p: 1, bgcolor: alpha(gold, 0.12), borderRadius: 2, color: gold, display: 'inline-flex' }}>
            <FileText size={20} />
          </Box>
          <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 4 }}>OWNER P&L REPORT</Typography>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} spacing={2}>
          <Box>
            <Typography variant="h4" fontWeight={950} sx={{ color: '#fff' }}>Profit & Loss {year}</Typography>
            <Typography variant="body2" sx={{ color: alpha('#fff', 0.4), fontWeight: 700 }}>
              {passports.length} propert{passports.length === 1 ? 'y' : 'ies'} · UAE Corporate Tax Compliant
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Download size={17} />}
            onClick={() => generatePDF(user, passports, tickets, year)}
            sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, px: 3, py: 1.3, borderRadius: 3, boxShadow: `0 10px 28px ${alpha(gold, 0.32)}`, flexShrink: 0 }}
          >
            Download PDF
          </Button>
        </Stack>
      </Box>

      {/* KPI Row */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} sm={3}>
          <MetricCard label="GROSS INCOME" value={`${(totalIncome / 1000).toFixed(0)}k AED`} icon={TrendingUp} color="#22C55E" sub="Collected rent" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard label="OUTSTANDING" value={`${(outstanding / 1000).toFixed(0)}k AED`} icon={Calendar} color={outstanding > 0 ? '#F59E0B' : '#22C55E'} sub="Pending rent" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard label="MAINTENANCE" value={`${(totalMaint / 1000).toFixed(0)}k AED`} icon={TrendingDown} color="#EF4444" sub="All jobs" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard label="NET INCOME" value={`${(netIncome / 1000).toFixed(0)}k AED`} icon={DollarSign} color={netIncome >= 0 ? '#22C55E' : '#EF4444'} sub="After fees" />
        </Grid>
      </Grid>

      {/* Per-property breakdown */}
      {passports.length > 0 ? (
        <Paper sx={{ p: 3.5, mb: 4, bgcolor: CARD, border: BORDER, borderRadius: 4 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
            <BarChart2 size={18} color={gold} />
            <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 3 }}>PER-PROPERTY BREAKDOWN</Typography>
          </Stack>
          <Stack spacing={2}>
            {passports.map(p => {
              const income = p.rentCollectedTotal || 0;
              const maint = p.maintenanceCostTotal || 0;
              const mgmt = income * 0.08;
              const net = income - maint - mgmt;
              return (
                <Box key={p.id}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
                    <Typography sx={{ color: '#fff', fontWeight: 950, fontSize: '0.9rem' }}>
                      {p.address || p.propertyName || p.id}
                    </Typography>
                    <Stack direction="row" spacing={3}>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: alpha('#fff', 0.3), fontWeight: 900 }}>INCOME</Typography>
                        <Typography sx={{ color: '#22C55E', fontWeight: 950, fontSize: '0.88rem' }}>{income.toLocaleString()} AED</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: alpha('#fff', 0.3), fontWeight: 900 }}>MAINT.</Typography>
                        <Typography sx={{ color: '#EF4444', fontWeight: 950, fontSize: '0.88rem' }}>{maint.toLocaleString()} AED</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: alpha('#fff', 0.3), fontWeight: 900 }}>NET</Typography>
                        <Typography sx={{ color: net >= 0 ? '#22C55E' : '#EF4444', fontWeight: 950, fontSize: '0.88rem' }}>{net.toLocaleString()} AED</Typography>
                      </Box>
                    </Stack>
                  </Stack>
                  <Divider sx={{ borderColor: alpha(gold, 0.1), mt: 1.5 }} />
                </Box>
              );
            })}
          </Stack>
        </Paper>
      ) : (
        <Paper sx={{ p: 5, bgcolor: CARD, border: BORDER, borderRadius: 4, textAlign: 'center' }}>
          <FileText size={36} color={alpha(gold, 0.3)} />
          <Typography sx={{ color: alpha('#fff', 0.35), mt: 2, fontWeight: 800 }}>
            Add properties and financial data to generate your P&L report.
          </Typography>
        </Paper>
      )}

      {/* Tax note */}
      <Paper sx={{ p: 3, bgcolor: alpha('#22C55E', 0.05), border: `1px solid ${alpha('#22C55E', 0.18)}`, borderRadius: 4 }}>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Box sx={{ p: 1, bgcolor: alpha('#22C55E', 0.1), borderRadius: 2, color: '#22C55E', flexShrink: 0 }}>
            <FileText size={18} />
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: alpha('#22C55E', 0.7), fontWeight: 900, letterSpacing: 2 }}>UAE CORPORATE TAX NOTE</Typography>
            <Typography sx={{ color: alpha('#fff', 0.6), fontWeight: 800, fontSize: '0.85rem', mt: 0.3 }}>
              UAE Corporate Tax (effective June 2023) applies to taxable income above AED 375,000. Maintenance costs, management fees, and operating expenses are deductible. Download this report as supporting documentation for your tax submission. Always consult a UAE-licensed tax advisor.
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
