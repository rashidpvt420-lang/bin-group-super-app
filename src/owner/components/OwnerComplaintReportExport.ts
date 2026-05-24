import type { OwnerComplaint } from '../utils/ownerComplaintResolver';

function formatCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""'); // Escape double quotes
  return `"${str}"`; // Enclose in double quotes to handle commas
}

export function exportComplaintsToCsv(complaints: OwnerComplaint[], filename = 'maintenance-complaints-report.csv') {
  const headers = [
    'Ticket ID',
    'Property',
    'Category',
    'Priority',
    'Status',
    'Reporter Type',
    'Reporter Name',
    'Technician',
    'Final Cost (AED)',
    'SLA Status',
    'Created At',
    'Resolved At',
    'Resolution Notes'
  ];

  const csvContent = [
    headers.join(','),
    ...complaints.map(c => [
      formatCsvCell(c.ticketId),
      formatCsvCell(c.propertyName),
      formatCsvCell(c.category),
      formatCsvCell(c.priority),
      formatCsvCell(c.status),
      formatCsvCell(c.reporterType),
      formatCsvCell(c.reporterName),
      formatCsvCell(c.assignedTechnicianName),
      formatCsvCell(c.finalCost),
      formatCsvCell(c.slaStatus),
      formatCsvCell(c.createdAt ? c.createdAt.toISOString() : ''),
      formatCsvCell(c.resolvedAt ? c.resolvedAt.toISOString() : ''),
      formatCsvCell(c.resolutionNotes)
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (navigator.msSaveBlob as any) {
    // IE 10+
    (navigator as any).msSaveBlob(blob, filename);
  } else {
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
