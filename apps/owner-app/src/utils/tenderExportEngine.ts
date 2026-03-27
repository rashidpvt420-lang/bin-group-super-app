// owner-app/src/utils/tenderExportEngine.ts
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { binThemeTokens } from '../theme/binGroupTheme';

/**
 * Institutional Tender Export Module v1.0
 * Generates sovereign-grade tender packs for Abu Dhabi / Al Ain government and private estate mandates.
 */

export interface TenderInput {
    emirate: string;
    assetType: string;
    sqft: number;
    annualYield: number;
    majlisType?: string;
    heritageSensitivity?: string;
    hasSolar?: boolean;
    hasEV?: boolean;
}

export function generateComplianceMatrix(input: TenderInput) {
    return [
        { standard: 'Civil Defense (DCD)', requirement: 'Mandatory 24/7 Monitoring', status: 'INCLUDED', frequency: 'Real-time' },
        { standard: 'SIRA (Security)', requirement: 'IP CCTV & Entry Logic Verification', status: 'INCLUDED', frequency: 'Annual Audit' },
        { standard: 'Municipality (ADM/DLD)', requirement: 'Sovereign Health Reporting', status: 'INCLUDED', frequency: 'Quarterly' },
        { standard: 'Heritage Authority', requirement: 'Sensitive Facade Conservation', status: input.heritageSensitivity !== 'standard' ? 'S-CLASS ENFORCED' : 'EXEMPT', frequency: 'Specialist' },
        { standard: 'Estidama Rating', requirement: 'Sustainability Reporting', status: input.hasSolar ? 'GOLD ENFORCED' : 'PEARL 1', frequency: 'Bi-Annual' }
    ];
}

export function generateLifecycleProjection(input: TenderInput) {
    const years = ['2026', '2027', '2028', '2029', '2030'];
    const opEx = input.sqft * 0.12; // Base OpEx projection
    return years.map((year, i) => ({
        year,
        opEx: (opEx * (1 + (i * 0.05))).toFixed(0), // 5% inflation/wear
        capEx: (i === 3 ? (opEx * 2.5) : (opEx * 0.3)).toFixed(0), // Major HVAC/Elevator refresh in Y4
        integrityScore: (98 - (i * 1.5)).toFixed(1)
    }));
}

export function generateSLAPenaltyTable() {
    return [
        { severity: 'CATASTROPHIC', response: '15 Minutes', resolution: '4 Hours', penalty: 'AED 5,000 / Hr' },
        { severity: 'PRIORITY', response: '2 Hours', resolution: '12 Hours', penalty: 'AED 1,000 / Hr' },
        { severity: 'STANDARD', response: '12 Hours', resolution: '48 Hours', penalty: 'AED 250 / Day' },
        { severity: 'PLANNED', response: '48 Hours', resolution: '1 Week', penalty: 'N/A' }
    ];
}

export function generateTenderScopePdf(input: TenderInput, valuation: any) {
    const doc = new jsPDF() as any;
    const margin = 20;

    // Header - sovereign branding
    doc.setFillColor(11, 11, 12);
    doc.rect(0, 0, 210, 50, 'F');
    doc.setTextColor(198, 167, 94);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('BIN-GENESIS™ SOVEREIGN TENDER', margin, 32);
    
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`REGION: ${input.emirate.toUpperCase()} | ASSET: ${input.assetType.toUpperCase()} | v1.21-SOVEREIGN`, margin, 42);

    // Section 1: Executive Summary
    doc.setTextColor(11, 11, 12);
    doc.setFontSize(14);
    doc.text('EXECUTIVE PORTFOLIO SUMMARY', margin, 65);
    doc.line(margin, 67, 190, 67);

    const summaryData = [
        ['Portfolio Area', `${input.sqft.toLocaleString()} Sq.Ft`],
        ['Institutional Yield', `${input.annualYield}%`],
        ['Institutional AMC (Floor)', `AED ${valuation.annualContractValue?.toLocaleString()}`],
        ['Mission Priority Status', 'S-CLASS SOVEREIGN READINESS'],
        ['Majlis Configuration', input.majlisType ? input.majlisType.toUpperCase() : 'N/A']
    ];

    doc.autoTable({
        startY: 75,
        head: [['Metric', 'Institutional Value']],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [198, 167, 94], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    // Section 2: Compliance Matrix
    doc.text('COMPLIANCE MATRIX (INSTITUTIONAL)', margin, (doc as any).lastAutoTable.finalY + 15);
    const complianceData = generateComplianceMatrix(input).map(c => [c.standard, c.requirement, c.status, c.frequency]);
    
    doc.autoTable({
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Standard', 'Mandatory Requirement', 'Status', 'Frequency']],
        body: complianceData,
        theme: 'striped',
        headStyles: { fillColor: [22, 22, 24], textColor: [255, 255, 255] }
    });

    // Section 3: SLA & Penalties
    doc.text('SERVICE LEVEL AGREEMENTS (SLA)', margin, (doc as any).lastAutoTable.finalY + 15);
    const slaData = generateSLAPenaltyTable().map(s => [s.severity, s.response, s.resolution, s.penalty]);

    doc.autoTable({
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Severity', 'Response Time', 'Resolution Time', 'Sovereign Penalty']],
        body: slaData,
        theme: 'grid',
        headStyles: { fillColor: [198, 167, 94], textColor: [0, 0, 0] }
    });

    // Section 4: Lifecycle Projection (on new page)
    doc.addPage();
    doc.text('5-YEAR ASSET LIFECYCLE FORECAST', margin, 30);
    const lifecycleData = generateLifecycleProjection(input).map(l => [l.year, `AED ${l.opEx}`, `AED ${l.capEx}`, `${l.integrityScore}%`]);

    doc.autoTable({
        startY: 40,
        head: [['Financial Year', 'Operational Expenses', 'Capital Expenditure', 'Health Score']],
        body: lifecycleData,
        theme: 'striped',
        headStyles: { fillColor: [11, 11, 12], textColor: [198, 167, 94] }
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('CONFIDENTIAL: This document is an institutional sovereign audit produced by BIN-GENESIS™ v1.21.', margin, 285);

    doc.save(`BIN-TENDER-${input.emirate}-${Date.now()}.pdf`);
}
