import type { OwnerComplaint } from '../utils/ownerComplaintResolver';

function formatCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""'); // Escape double quotes
  return `"${str}"`; // Enclose in double quotes to handle commas
}

function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
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

  downloadCsv(csvContent, filename);
}
